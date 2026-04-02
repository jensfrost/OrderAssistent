const express = require('express');
const axios = require('axios');

const router = express.Router();

const VISMA_API_BASE = String(process.env.VISMA_API_BASE || '').replace(/\/+$/, '');
const VISMA_TOKEN = process.env.VISMA_TOKEN;
const VISMA_ALIAS = String(process.env.VISMA_ALIAS || '').trim();

const vismaHeaders = () => (VISMA_TOKEN ? { 'X-API-Token': VISMA_TOKEN } : {});

const safeNum = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const normUnit = (u) => String(u ?? '').trim().toLowerCase();

const roundByUnit = (q, unit) => {
  if (unit === 'st') return Math.ceil(q);
  return Number(q.toFixed(3));
};

const utcFromISO = (iso) => new Date(`${iso}T00:00:00Z`);
const diffDays = (fromIso, toIso) =>
  Math.max(1, Math.round((utcFromISO(toIso).getTime() - utcFromISO(fromIso).getTime()) / 86400000));

const todayIso = () => new Date().toISOString().slice(0, 10);

function normalizeMode(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'available') return 'available';
  return 'onhand';
}

function extractArticleNumber(raw) {
  return String(
    raw?.adk_article_number ??
      raw?.article ??
      raw?.article_number ??
      ''
  )
    .trim()
    .toUpperCase();
}

function extractArticleName(raw) {
  return String(
    raw?.adk_article_name ??
      raw?.name ??
      raw?.article_name ??
      ''
  ).trim();
}

function extractUnit(raw) {
  const candidates = [
    raw?.adk_stock_unit,
    raw?.adk_article_unit,
    raw?.adk_unit,
    raw?.unit,
    raw?.uom,
  ];

  for (const c of candidates) {
    const u = normUnit(c);
    if (u) return u;
  }

  return '';
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

router.get('/', async (req, res) => {
  try {
    if (!VISMA_API_BASE) {
      return res.status(500).json({ error: 'VISMA_API_BASE not set' });
    }

    let from = String(req.query.from || '');
    let to = String(req.query.to || '');
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to are required' });
    }

    if (utcFromISO(from) > utcFromISO(to)) {
      const tmp = from;
      from = to;
      to = tmp;
    }

    const onlyAtRisk = String(req.query.onlyAtRisk || '1') === '1';
    const includeNoUsage = String(req.query.includeNoUsage || '1') === '1';
    const excludePrefix = String(req.query.excludePrefix || 'R-').trim().toUpperCase();
    const leadTimeDays = Math.max(0, Number(req.query.leadTimeDays || 14));
    const safetyDays = Math.max(0, Number(req.query.safetyDays || 7));
    const targetCoverDays = Math.max(0, Number(req.query.targetCoverDays || 60));
    const balanceMode = normalizeMode(req.query.balanceMode);

    const maxRows = Math.max(1, Math.min(Number(req.query.max_rows || 500), 5000));
    const balanceChunkSize = Math.max(1, Math.min(Number(req.query.balance_chunk_size || 100), 500));

    const days = diffDays(from, to);

    console.log('[orderAssist] request', {
      from,
      to,
      onlyAtRisk,
      includeNoUsage,
      excludePrefix,
      leadTimeDays,
      safetyDays,
      targetCoverDays,
      balanceMode,
      maxRows,
      balanceChunkSize,
      alias: VISMA_ALIAS || null,
    });

    // 1) Artiklar från Visma
    const artRes = await axios.get(`${VISMA_API_BASE}/articles`, {
      params: {
        ...(VISMA_ALIAS ? { alias: VISMA_ALIAS } : {}),
        max_rows: maxRows,
      },
      headers: vismaHeaders(),
      timeout: 300000,
    });

    const allArticlesRaw = Array.isArray(artRes.data) ? artRes.data : [];

    const articles = allArticlesRaw
      .map((rec) => {
        const raw = rec?.data || rec || {};
        const code = extractArticleNumber(raw);
        const name = extractArticleName(raw);
        const unit = extractUnit(raw);

        return { code, name, unit };
      })
      .filter((a) => a.code)
      .filter((a) => !excludePrefix || !a.code.startsWith(excludePrefix));

    const articleCodes = articles.map((a) => a.code);

    console.log('[orderAssist] article counts', {
      rawFromVisma: allArticlesRaw.length,
      afterFilter: articleCodes.length,
    });

    if (!articleCodes.length) {
      return res.json({
        rows: [],
        meta: {
          count: 0,
          total: 0,
          from,
          to,
          generatedAt: todayIso(),
        },
      });
    }

    // 2) Usage från Visma
    const usageRes = await axios.get(`${VISMA_API_BASE}/visma/order_assist_stock_history/usage`, {
      params: {
        from,
        to,
        ...(VISMA_ALIAS ? { alias: VISMA_ALIAS } : {}),
      },
      headers: vismaHeaders(),
      timeout: 600000,
    });

    const usageRows = usageRes?.data?.rows || [];

    console.log('[orderAssist] usage counts', {
      rows: usageRows.length,
      sample: usageRows.slice(0, 3),
    });

    // 3) Saldo från Visma, chunkat
    const articleChunks = chunkArray(articleCodes, balanceChunkSize);
    const balanceRows = [];

    console.log('[orderAssist] balance chunks', {
      chunks: articleChunks.length,
      chunkSize: balanceChunkSize,
    });

    for (let i = 0; i < articleChunks.length; i++) {
      const chunk = articleChunks[i];

      const balanceRes = await axios.post(
        `${VISMA_API_BASE}/stock/balance`,
        {
          articles: chunk,
          ...(VISMA_ALIAS ? { company_alias: VISMA_ALIAS } : {}),
          mode: balanceMode,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...vismaHeaders(),
          },
          timeout: 600000,
        }
      );

      const rows = balanceRes?.data?.rows || [];
      balanceRows.push(...rows);

      console.log('[orderAssist] balance chunk done', {
        index: i + 1,
        of: articleChunks.length,
        requested: chunk.length,
        returned: rows.length,
      });
    }

    // 4) Mappar
    const usageByCode = new Map();
    for (const r of usageRows) {
      const code = String(r?.article ?? '').trim().toUpperCase();
      const totalOutQty = safeNum(r?.totalOutQty);
      const unit = normUnit(r?.unit);

      if (!code || totalOutQty == null) continue;

      usageByCode.set(code, {
        totalOutQty,
        dailyUsage: totalOutQty / days,
        unit,
      });
    }

    console.log('[orderAssist] usage has 00-0717 =', usageByCode.has('00-0717'));
    console.log('[orderAssist] usage sample keys =', Array.from(usageByCode.keys()).slice(0, 20));

    const balanceByCode = new Map();
    for (const r of balanceRows) {
      const code = String(r?.article ?? '').trim().toUpperCase();
      const qty = safeNum(r?.qty ?? r?.balance ?? r?.stockQty ?? r?.onhand ?? r?.quantity);
      const unit = normUnit(r?.unit);

      if (!code || qty == null) continue;

      balanceByCode.set(code, {
        qty,
        unit,
      });
    }

    // 5) Räkna rader
    const rows = articles.map((a) => {
      const bal = balanceByCode.get(a.code);
      const use = usageByCode.get(a.code);

      const stockQty = bal?.qty ?? 0;
      const stockQtyVisma = bal?.qty ?? 0;

      const dailyUsage = use?.dailyUsage ?? 0;
      const dailyUsageVisma = use?.dailyUsage ?? null;

      const unit = a.unit || bal?.unit || use?.unit || 'st';

      const ropQty = dailyUsage * (leadTimeDays + safetyDays);
      const daysCover = dailyUsage > 0 ? stockQty / dailyUsage : null;

      const orderNow = dailyUsage > 0 ? stockQty <= ropQty : stockQty < 0;
      const etaRopDays = dailyUsage > 0 ? Math.max(0, (stockQty - ropQty) / dailyUsage) : null;
      const outOfStockDays = dailyUsage > 0 ? stockQty / dailyUsage : null;

      const desiredQtyForTarget = Math.max(0, targetCoverDays * dailyUsage - stockQty);
      const suggestedQty = roundByUnit(
        orderNow
          ? desiredQtyForTarget + Math.max(0, ropQty - stockQty)
          : desiredQtyForTarget,
        unit
      );

      let status = 'noUsage';
      if (dailyUsage > 0) {
        if (orderNow) status = 'now';
        else if (etaRopDays != null && etaRopDays < 14) status = 'soon';
        else status = 'ok';
      } else if (stockQty < 0) {
        status = 'now';
      }

      return {
        code: a.code,
        name: a.name,
        unit,

        stockQty,
        stockQtyVisma,
        stockSource: 'visma',

        dailyUsage,
        dailyUsageVisma,
        usageSource: 'visma',

        daysCover,
        ropQty,
        status,
        suggestedQty,

        predictedRopDate:
          etaRopDays != null
            ? new Date(Date.now() + etaRopDays * 86400000).toISOString().slice(0, 10)
            : null,

        predictedOutDate:
          outOfStockDays != null
            ? new Date(Date.now() + outOfStockDays * 86400000).toISOString().slice(0, 10)
            : null,
      };
    });

    let filtered = rows;

    if (!includeNoUsage) {
      filtered = filtered.filter((r) => r.status !== 'noUsage');
    }

    if (onlyAtRisk) {
      filtered = filtered.filter((r) => r.status === 'now' || r.status === 'soon');
    }

    console.log('[orderAssist] result counts', {
      total: rows.length,
      filtered: filtered.length,
    });

    return res.json({
      rows: filtered,
      meta: {
        count: filtered.length,
        total: rows.length,
        from,
        to,
        generatedAt: todayIso(),
        leadTimeDays,
        safetyDays,
        targetCoverDays,
        balanceMode,
        excludePrefix,
        maxRows,
        balanceChunkSize,
      },
    });
  } catch (err) {
    console.error('[orderAssist] failed:', err?.response?.data || err?.message || err);
    return res.status(500).json({
      error: 'orderAssist failed',
      detail: err?.response?.data || err?.message || String(err),
    });
  }
});

module.exports = router;
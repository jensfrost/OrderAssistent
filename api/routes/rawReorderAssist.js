const express = require('express');
const axios = require('axios');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

const router = express.Router();

const VISMA_API_BASE = String(process.env.VISMA_API_BASE || '').replace(/\/+$/, '');
const VISMA_TOKEN = process.env.VISMA_TOKEN;
const VISMA_ALIAS = String(process.env.VISMA_ALIAS || '').trim();

const vismaHeaders = () => (VISMA_TOKEN ? { 'X-API-Token': VISMA_TOKEN } : {});

const normUnit = (u) => {
  const s = String(u ?? '').trim().toLowerCase();
  if (s === 'pcs') return 'st';
  return s;
};

const safeNum = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const utcFromISO = (iso) => new Date(`${iso}T00:00:00Z`);
const diffDays = (fromIso, toIso) =>
  Math.max(1, Math.round((utcFromISO(toIso).getTime() - utcFromISO(fromIso).getTime()) / 86400000));

const roundByUnit = (q, unit) => (unit === 'st' ? Math.ceil(q) : Number(q.toFixed(3)));

function extractVismaUnit(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const keys = Object.keys(raw);
  for (const k of keys) {
    const lk = k.toLowerCase();
    if (lk.includes('unit') || lk.includes('enhet') || lk.endsWith('_uom')) {
      const v = normUnit(raw[k]);
      if (v) return v;
    }
  }
  return '';
}

router.get('/', async (req, res) => {
  try {
    let from = String(req.query.from || '');
    let to = String(req.query.to || '');
    const onlyAtRisk = String(req.query.onlyAtRisk || '1') === '1';

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to are required' });
    }

    if (utcFromISO(from) > utcFromISO(to)) {
      const tmp = from;
      from = to;
      to = tmp;
    }

    const days = diffDays(from, to);

    // 1) Artiklar direkt från Visma
    const artRes = await axios.get(`${VISMA_API_BASE}/articles`, {
      params: { prefix: 'R-' },
      headers: vismaHeaders(),
      timeout: 300000,
    });

    const vismaArticles = Array.isArray(artRes.data) ? artRes.data : [];
    const raws = vismaArticles
      .map((rec) => {
        const raw = rec?.data || {};
        return {
          code: String(raw.adk_article_number || '').trim().toUpperCase(),
          name: String(raw.adk_article_name || '').trim(),
          unit: extractVismaUnit(raw),
        };
      })
      .filter((a) => a.code);

    const rawCodes = raws.map((r) => r.code);
    if (!rawCodes.length) {
      return res.json({ rows: [], meta: { count: 0, from, to } });
    }

    // 2) Raw deliveries
    const deliveries = await sequelize.query(
      `
      SELECT
        RWID AS id,
        RWARTN AS material,
        RWDATUM AS [date],
        RWKVANTITET AS quantity,
        RWENHET AS unit
      FROM dbo.RAWREG
      WHERE RWARTN IN (:codes)
      `,
      {
        replacements: { codes: rawCodes },
        type: QueryTypes.SELECT,
      }
    );

    // 3) Batch lines
    const batchLines = await sequelize.query(
      `
      SELECT
        bl.RAW_DEL_ID AS rawDeliveryId,
        bl.ING_ARTIKEL AS raw,
        bl.ALLOC_QTY AS quantity,
        bl.ALLOC_UNIT AS unit,
        b.BRRGDT AS batchDate
      FROM dbo.BATCH_LINES bl
      INNER JOIN dbo.BATREG b ON b.BRBATCH = bl.BATCH_ID
      WHERE bl.ING_ARTIKEL IN (:codes)
      `,
      {
        replacements: { codes: rawCodes },
        type: QueryTypes.SELECT,
      }
    );

    // 4) Visma usage
    const usageRes = await axios.get(`${VISMA_API_BASE}/visma/stock_history/usage`, {
      params: {
        from,
        to,
        ...(VISMA_ALIAS ? { alias: VISMA_ALIAS } : {}),
      },
      headers: vismaHeaders(),
      timeout: 600000,
    });

    console.log('[rawReorderAssist] usage sample:', {
      hasRows: Array.isArray(usageRes?.data?.rows),
      length: Array.isArray(usageRes?.data?.rows) ? usageRes.data.rows.length : 0,
      sample: Array.isArray(usageRes?.data?.rows) ? usageRes.data.rows.slice(0, 5) : usageRes?.data,
    });
    const usageRows = usageRes?.data?.rows || [];

    // 5) Visma balances
    const balanceRes = await axios.post(
      `${VISMA_API_BASE}/stock/balance`,
      { articles: rawCodes, mode: 'onhand' },
      {
        headers: {
          'Content-Type': 'application/json',
          ...vismaHeaders(),
        },
        timeout: 600000,
      }
    );
    const balanceRows = balanceRes?.data?.rows || [];

    // Batch-saldo
    const usedPerDeliveryId = new Map();
    for (const l of batchLines) {
      const id = Number(l.rawDeliveryId || 0);
      if (!id) continue;
      usedPerDeliveryId.set(id, (usedPerDeliveryId.get(id) || 0) + Number(l.quantity || 0));
    }

    const unitForRaw = new Map();
    for (const r of raws) {
      if (r.unit) unitForRaw.set(r.code, normUnit(r.unit));
    }
    for (const d of deliveries) {
      const code = String(d.material || '').trim().toUpperCase();
      if (!unitForRaw.has(code)) {
        const u = normUnit(d.unit);
        if (u) unitForRaw.set(code, u);
      }
    }

    const stockByRawBatch = new Map();
    for (const d of deliveries) {
      const code = String(d.material || '').trim().toUpperCase();
      const baseUnit = unitForRaw.get(code) || '';
      const du = normUnit(d.unit);
      if (!code || !baseUnit || du !== baseUnit) continue;

      const remaining = Number(d.quantity || 0) - (usedPerDeliveryId.get(Number(d.id)) || 0);
      stockByRawBatch.set(code, (stockByRawBatch.get(code) || 0) + remaining);
    }

    // Batch usage per day
    const fromTime = utcFromISO(from).getTime();
    const toTime = utcFromISO(to).getTime();

    const sumBatchUsage = new Map();
    for (const l of batchLines) {
      const code = String(l.raw || '').trim().toUpperCase();
      const whenStr = String(l.batchDate || '').split('T')[0];
      if (!code || !whenStr) continue;

      const when = utcFromISO(whenStr).getTime();
      if (when < fromTime || when > toTime) continue;

      const baseUnit = unitForRaw.get(code) || '';
      const lu = normUnit(l.unit);
      if (!baseUnit || lu !== baseUnit) continue;

      sumBatchUsage.set(code, (sumBatchUsage.get(code) || 0) + Number(l.quantity || 0));
    }

    const usagePerDayByRawBatch = new Map();
    for (const [code, qty] of sumBatchUsage.entries()) {
      usagePerDayByRawBatch.set(code, qty / days);
    }

    // Visma usage per day
    const usagePerDayByRawVisma = new Map();
    for (const r of usageRows) {
      const code = String(r.article || '').trim().toUpperCase();
      const totalOut = safeNum(r.totalOutQty);
      if (!code || totalOut == null) continue;
      usagePerDayByRawVisma.set(code, totalOut / days);
    }

    // Visma balances
    const vismaBalancesByCode = new Map();
    for (const r of balanceRows) {
      const code = String(r.article || '').trim().toUpperCase();
      const qty = safeNum(r.qty ?? r.balance ?? r.stockQty ?? r.onhand ?? r.quantity);
      if (!code || qty == null) continue;
      vismaBalancesByCode.set(code, qty);
    }

    const defaultLeadTime = Number(req.query.defaultLeadTime || 14);
    const defaultSafetyDays = Number(req.query.defaultSafetyDays || 7);
    const defaultTargetCover = Number(req.query.defaultTargetCover || 60);

    const rows = raws.map((r) => {
      const code = r.code;
      const unit = unitForRaw.get(code) || r.unit || 'kg';

      const stockQtyBatch = Number(stockByRawBatch.get(code) || 0);
      const dailyUsageBatch = Number(usagePerDayByRawBatch.get(code) || 0);

      const stockQtyVisma = vismaBalancesByCode.has(code) ? vismaBalancesByCode.get(code) : null;
      const dailyUsageVisma = usagePerDayByRawVisma.has(code) ? usagePerDayByRawVisma.get(code) : null;

      const stockSource = stockQtyVisma != null ? 'visma' : 'batch';
      const usageSource = dailyUsageVisma != null ? 'visma' : 'batch';

      const stockQty = stockQtyVisma != null ? stockQtyVisma : stockQtyBatch;
      const dailyUsage = dailyUsageVisma != null ? dailyUsageVisma : dailyUsageBatch;

      const ropQty = dailyUsage * (defaultLeadTime + defaultSafetyDays);
      const daysCover = dailyUsage > 0 ? stockQty / dailyUsage : null;
      const orderNow = dailyUsage > 0 ? stockQty <= ropQty : false;
      const etaRopDays = dailyUsage > 0 ? Math.max(0, (stockQty - ropQty) / dailyUsage) : null;
      const outOfStockDays = dailyUsage > 0 ? stockQty / dailyUsage : null;

      const desiredQtyForTarget = Math.max(0, defaultTargetCover * dailyUsage - stockQty);
      const suggestedQty = roundByUnit(
        orderNow ? desiredQtyForTarget + Math.max(0, ropQty - stockQty) : desiredQtyForTarget,
        unit
      );

      let status = 'noUsage';
      if (dailyUsage > 0) {
        if (orderNow) status = 'now';
        else if (etaRopDays != null && etaRopDays < 14) status = 'soon';
        else status = 'ok';
      }

      return {
        code,
        name: r.name,
        unit,
        stockQty,
        stockQtyVisma,
        stockQtyBatch,
        stockSource,
        dailyUsage,
        dailyUsageVisma,
        dailyUsageBatch,
        usageSource,
        daysCover,
        ropQty,
        status,
        suggestedQty,
        predictedRopDate: etaRopDays != null ? new Date(Date.now() + etaRopDays * 86400000).toISOString().slice(0, 10) : null,
        predictedOutDate: outOfStockDays != null ? new Date(Date.now() + outOfStockDays * 86400000).toISOString().slice(0, 10) : null,
      };
    });

    const filtered = onlyAtRisk
      ? rows.filter((r) => (r.dailyUsage > 0) && (r.status === 'now' || r.status === 'soon'))
      : rows;

    return res.json({
      rows: filtered,
      meta: {
        count: filtered.length,
        total: rows.length,
        from,
        to,
        generatedAt: todayIso(),
      },
    });
  } catch (err) {
    console.error('[rawReorderAssist] failed:', err?.response?.data || err?.message || err);
    return res.status(500).json({
      error: 'rawReorderAssist failed',
      detail: err?.response?.data || err?.message || String(err),
    });
  }
});

module.exports = router;
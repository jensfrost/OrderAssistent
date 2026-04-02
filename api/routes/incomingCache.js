// api/routes/incomingCache.js
const express = require('express');
const axios = require('axios');
const { Op, fn, col } = require('sequelize');

const router = express.Router();

// Hämta modellerna från Sequelize-index
const { IncomingNoteHead, IncomingNoteRow } = require('../models');

// Sequelize-instans (för transactions)
const sequelize = IncomingNoteHead.sequelize;

// Bas-URL till Visma FastAPI (utan avslutande /)
const VISMA_API_BASE = String(process.env.VISMA_API_BASE || '')
  .trim()
  .replace(/\/+$/, '');
console.log('[incomingCache] VISMA_API_BASE =', VISMA_API_BASE);

// Timeout mot Visma (ms)
const VISMA_API_TIMEOUT_MS = Number(process.env.VISMA_API_TIMEOUT_MS || 600000);
console.log('[incomingCache] VISMA_API_TIMEOUT_MS =', VISMA_API_TIMEOUT_MS);

// Paged-hämtning (seed / fetch-more)
const VISMA_FETCH_PAGE_SIZE = Number(process.env.VISMA_FETCH_PAGE_SIZE || 300);
const VISMA_FETCH_MAX_PAGES = Number(process.env.VISMA_FETCH_MAX_PAGES || 50);
console.log('[incomingCache] VISMA_FETCH_PAGE_SIZE =', VISMA_FETCH_PAGE_SIZE);
console.log('[incomingCache] VISMA_FETCH_MAX_PAGES =', VISMA_FETCH_MAX_PAGES);

// Fallback-sökning via paged (om vi måste hitta head)
const VISMA_BY_REGNR_FALLBACK_MAX_PAGES = Number(process.env.VISMA_BY_REGNR_FALLBACK_MAX_PAGES || 12);
const VISMA_BY_REGNR_FALLBACK_PAGE_SIZE = Number(process.env.VISMA_BY_REGNR_FALLBACK_PAGE_SIZE || 200);
console.log('[incomingCache] VISMA_BY_REGNR_FALLBACK_MAX_PAGES =', VISMA_BY_REGNR_FALLBACK_MAX_PAGES);
console.log('[incomingCache] VISMA_BY_REGNR_FALLBACK_PAGE_SIZE =', VISMA_BY_REGNR_FALLBACK_PAGE_SIZE);

// -------------------------------------------------------
// TIMING HELPERS
// -------------------------------------------------------
function tstart() {
  return process.hrtime.bigint();
}
function tendMs(t0) {
  return Number(process.hrtime.bigint() - t0) / 1e6;
}
function logStep(label, ms, extra) {
  if (extra) console.log(`[timing] ${label} ${ms.toFixed(1)}ms`, extra);
  else console.log(`[timing] ${label} ${ms.toFixed(1)}ms`);
}

// -------------------------------------------------------
// HELPERS – MAPPAR VISMA → CACHE MODELLER
// -------------------------------------------------------

// Tar bort rows innan rawJson sparas
function stripRows(raw) {
  if (!raw) return {};
  const clone = JSON.parse(JSON.stringify(raw));
  if ('rows' in clone) delete clone.rows;
  return clone;
}

function mapHeadFromVisma(vismaHeadRaw, lookupRegnr) {
  if (!vismaHeadRaw) return null;

  const vismaHead = stripRows(vismaHeadRaw);

  const regnr =
    vismaHead.regnr != null
      ? String(vismaHead.regnr)
      : lookupRegnr != null
        ? String(lookupRegnr)
        : null;

  // docNumber måste vara det som /incoming_delivery_notes/{doc}/rows förväntar sig.
  const docNumber =
    vismaHead.document_number ??
    vismaHead.doc_number ??
    vismaHead.dn_number ??
    vismaHead.dnNumber ??
    vismaHead.DocNumber ??
    vismaHead.docNumber ??
    vismaHead.docnr ??
    vismaHead.regnr ??
    null;

  const nrows =
    vismaHead.nrows ??
    (Array.isArray(vismaHeadRaw.rows) ? vismaHeadRaw.rows.length : null);

  return {
    regnr: regnr != null ? String(regnr) : null,

    // Visma dokumentnummer (DocNumber i tabellen)
    docNumber: docNumber != null ? String(docNumber) : null,

    docDate: vismaHead.date ?? null,
    supplierNo: vismaHead.supplier_number ?? vismaHead.levnr ?? null,
    supplierName: vismaHead.supplier_name ?? vismaHead.namn ?? null,

    rowCount: nrows,
    nrows: nrows,

    status: vismaHead.status ?? null,
    currencyCode: vismaHead.currency_code ?? null,
    arrivalDate: vismaHead.arrival_date ?? null,

    note1: vismaHead.note1 ?? null,
    note2: vismaHead.note2 ?? null,
    note3: vismaHead.note3 ?? null,

    projectCode: vismaHead.project_code ?? null,
    profitCentre: vismaHead.profit_centre ?? null,

    invoiceSent: vismaHead.invoice_sent ?? null,

    dnNumber: vismaHead.dn_number ?? null,
    invDate: vismaHead.inv_date ?? null,

    sourceTimestamp: vismaHead.timestamp ?? null,
    localRemark: vismaHead.local_remark ?? null,

    levnr: vismaHead.levnr ?? vismaHead.supplier_number ?? null,
    namn: vismaHead.namn ?? vismaHead.supplier_name ?? null,

    rawJson: JSON.stringify(vismaHead),
    lastSyncedAt: new Date(),
  };
}

// Mappa Visma-rad → IncomingNoteRows
function mapRowFromVisma(vismaRow, regnr, vismaHead) {
  if (!vismaRow) return null;

  const rowIndex = vismaRow.rownumber ?? vismaRow.rowIndex ?? 1;

  return {
    regnr: regnr != null ? String(regnr) : null,
    rowIndex: Number(rowIndex) || 1,

    articleNumber: vismaRow.article_number ?? vismaRow.article_no ?? vismaRow.artikelnr ?? null,
    description: vismaRow.benamning ?? vismaRow.description ?? vismaRow.text ?? null,

    quantity: vismaRow.quantity1 ?? vismaRow.quantity ?? null,
    quantity2: vismaRow.quantity2 ?? null,
    quantity3: vismaRow.quantity3 ?? null,

    unit: vismaRow.unit ?? vismaRow.enh ?? null,

    bestBefore: vismaRow.best_before ?? vismaRow.bestBefore ?? vismaRow.bestbefore ?? null,

    purchasePrice:
      vismaRow.price_each_current_currency ??
      vismaRow.price_each ??
      vismaRow.purchase_price ??
      vismaRow.purchasePrice ??
      null,

    currencyCode: vismaRow.currency_code ?? vismaHead?.currency_code ?? null,

    supplierArticleNumber:
      vismaRow.supplier_article_number ?? vismaRow.supplier_article_no ?? vismaRow.lev_artikelnr ?? null,

    amountCurrentCurrency: vismaRow.amount_current_currency ?? vismaRow.amount ?? null,
    amountDomesticCurrency: vismaRow.amount_domestic_currency ?? null,

    profitCentre: vismaRow.profit_centre ?? null,
    rowText: vismaRow.text ?? null,

    rawJson: JSON.stringify(vismaRow),
    lastSyncedAt: new Date(),
  };
}

// -------------------------------------------------------
// VISMA REQUEST HELPERS (robust prefix-fallback)
// -------------------------------------------------------

function _assertVismaBase() {
  if (!VISMA_API_BASE) {
    const e = new Error('VISMA_API_BASE saknas');
    e.code = 'VISMA_API_BASE_MISSING';
    throw e;
  }
}

function _joinUrl(base, path) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

async function vismaGet(path, opts = {}) {
  _assertVismaBase();

  const url1 = _joinUrl(VISMA_API_BASE, path);
  try {
    return await axios.get(url1, { timeout: VISMA_API_TIMEOUT_MS, ...opts });
  } catch (err) {
    const status = err?.response?.status;

    // Om 404: prova /visma-prefix också
    if (status === 404 && !String(path).startsWith('/visma/')) {
      const url2 = _joinUrl(VISMA_API_BASE, `/visma/${String(path).replace(/^\/+/, '')}`);
      console.warn('[incomingCache] vismaGet 404, retry with /visma prefix', { url1, url2 });
      return await axios.get(url2, { timeout: VISMA_API_TIMEOUT_MS, ...opts });
    }

    throw err;
  }
}

// -------------------------------------------------------
// VISMA: rows + head lookup
// -------------------------------------------------------

function _pickRegnrFromHead(h) {
  const v =
    h?.regnr ??
    h?.document_number ??
    h?.doc_number ??
    h?.dn_number ??
    h?.DocNumber ??
    h?.docNumber ??
    h?.docnr ??
    null;
  return v != null ? String(v) : null;
}

async function fetchVismaRowsForDoc(doc) {
  _assertVismaBase();

  const docStr = String(doc ?? '').trim();
  if (!docStr) return [];

  const path = `/incoming_delivery_notes/${encodeURIComponent(docStr)}/rows`;
  console.log('[incomingCache] GET rows', { path, doc: docStr });

  const t0 = tstart();
  try {
    const res = await vismaGet(path);
    logStep('visma.rows', tendMs(t0), { doc: docStr });

    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data?.rows)) return res.data.rows;

    console.warn('[incomingCache] rows unexpected shape', {
      doc: docStr,
      type: typeof res.data,
      keys: res.data && typeof res.data === 'object' ? Object.keys(res.data) : null,
    });
    return [];
  } catch (err) {
    logStep('visma.rows FAILED', tendMs(t0), { doc: docStr, msg: err?.message, status: err?.response?.status });
    throw err;
  }
}

/**
 * NY: snabbaste vägen för enskilt regnr:
 * 1) prova rows direkt med doc=regnr (många installationer har doc==regnr)
 * 2) om tomt/404: leta head via paged (begränsat), plocka docNumber och hämta rows med det
 */
async function fetchHeadAndRowsFast(regnr) {
  const regStr = String(regnr);

  // 1) prova direkt rows
  try {
    const rowsDirect = await fetchVismaRowsForDoc(regStr);
    if (Array.isArray(rowsDirect) && rowsDirect.length > 0) {
      return { head: { regnr: regStr, nrows: rowsDirect.length, docNumber: regStr }, rows: rowsDirect, mode: 'rows-direct' };
    }
  } catch (e) {
    // ignore - vi går vidare till head lookup
  }

  // 2) hitta head via paged (fallback)
  const head = await _fetchVismaByRegnrViaPaged(regStr);

  // resolve doc for rows
  const docForRows =
    head?.document_number ??
    head?.doc_number ??
    head?.dn_number ??
    head?.docNumber ??
    head?.docnr ??
    head?.regnr ??
    regStr;

  let rows = [];
  try {
    rows = await fetchVismaRowsForDoc(docForRows);
  } catch (e) {
    rows = [];
  }

  return { head, rows, mode: 'paged+rows' };
}

// -------------------------------------------------------
// Paged-fallback lookup (oförändrad i sak)
// -------------------------------------------------------

async function _fetchVismaByRegnrViaPaged(regnr) {
  _assertVismaBase();

  const regStr = String(regnr);
  const pageSize = VISMA_BY_REGNR_FALLBACK_PAGE_SIZE;
  const maxPages = VISMA_BY_REGNR_FALLBACK_MAX_PAGES;

  let min = null;
  let max = null;

  for (let page = 0; page < maxPages; page++) {
    const path = `/incoming_delivery_notes/paged`;
    const t0 = tstart();

    const res = await vismaGet(path, {
      params: {
        page,
        page_size: pageSize,
        order: 'desc',
        include_rows: false,
      },
    });

    logStep('visma.paged(page)', tendMs(t0), { page, page_size: pageSize });

    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    if (!items.length) break;

    const regs = items
      .map((x) => x?.regnr)
      .filter((x) => x != null)
      .map((x) => Number(x))
      .filter(Number.isFinite);

    if (regs.length) {
      min = min == null ? Math.min(...regs) : Math.min(min, ...regs);
      max = max == null ? Math.max(...regs) : Math.max(max, ...regs);
    }

    const hit = items.find((h) => String(_pickRegnrFromHead(h) ?? h?.regnr ?? '') === regStr);
    if (hit) return hit;
  }

  const e = new Error(`regnr ${regStr} not found via paged (scanned pages=${maxPages}, range=${min}-${max})`);
  e.code = 'REGNR_NOT_FOUND';
  throw e;
}

// -------------------------------------------------------
// SYNC HEAD + ROWS (enstaka regnr)
// -------------------------------------------------------

async function syncRegnrFromVisma(regnr) {
  const regStr = String(regnr);

  const tAll = tstart();

  // 1) snabbaste fetch-vägen
  const tFetch = tstart();
  const { head: vismaHeadRaw, rows: vismaRows, mode } = await fetchHeadAndRowsFast(regStr);
  logStep('fetchHeadAndRowsFast', tendMs(tFetch), { regnr: regStr, mode, rows: Array.isArray(vismaRows) ? vismaRows.length : null });

  if (!vismaHeadRaw && (!vismaRows || vismaRows.length === 0)) return null;

  const effectiveRegnr = _pickRegnrFromHead(vismaHeadRaw) || regStr;
  const headData = mapHeadFromVisma(vismaHeadRaw || { regnr: effectiveRegnr, nrows: vismaRows.length }, effectiveRegnr);

  const rowsData = Array.isArray(vismaRows)
    ? vismaRows.map((r) => mapRowFromVisma(r, headData.regnr, vismaHeadRaw)).filter(Boolean)
    : [];

  const tTx = tstart();
  await sequelize.transaction(async (t) => {
    await IncomingNoteRow.destroy({ where: { regnr: headData.regnr }, transaction: t });
    await IncomingNoteHead.destroy({ where: { regnr: headData.regnr }, transaction: t });

    await IncomingNoteHead.create(headData, { transaction: t });

    if (rowsData.length > 0) {
      await IncomingNoteRow.bulkCreate(rowsData, { transaction: t });
    }
  });
  logStep('db.transaction', tendMs(tTx), { regnr: headData.regnr, rows: rowsData.length });

  logStep('syncRegnrFromVisma TOTAL', tendMs(tAll), { regnr: headData.regnr, rows: rowsData.length, mode });

  return { head: headData, rows: rowsData, mode };
}

// -------------------------------------------------------
// ROUTER START
// -------------------------------------------------------

router.get('/ping', (req, res) => {
  res.json({ ok: true, from: 'incomingCache', ts: new Date().toISOString() });
});

// -------------------------------------------------------
// POST /cache/refresh?regnr=XXXX
// -------------------------------------------------------

router.post('/cache/refresh', async (req, res) => {
  const regnr = req.query.regnr ?? req.body?.regnr ?? null;

  if (!regnr) {
    return res.json({ ok: false, error: 'regnr saknas. Ex: ?regnr=17653' });
  }

  try {
    const synced = await syncRegnrFromVisma(regnr);

    if (!synced) {
      return res.json({ ok: false, error: `Ingen följesedel med regnr=${regnr} från Visma` });
    }

    return res.json({
      ok: true,
      regnr: String(regnr),
      nrows: synced.rows.length,
      mode: synced.mode,
      message: `Synkade ${synced.rows.length} rader för regnr=${regnr}`,
    });
  } catch (err) {
    console.error('[incoming/cache/refresh] error:', err);
    return res.status(502).json({
      ok: false,
      error: err.message || String(err),
      code: err.code || err.name || 'VISMA_ERROR',
      status: err?.response?.status,
    });
  }
});

// -------------------------------------------------------
// POST /cache/fetch-more (din seed/scroll)
// -------------------------------------------------------

router.post('/cache/fetch-more', async (req, res) => {
  console.log('[incoming/cache/fetch-more] HIT', new Date().toISOString());

  if (!VISMA_API_BASE) {
    console.error('[incoming/cache/fetch-more] VISMA_API_BASE saknas');
    return res.status(500).json({ ok: false, error: 'VISMA_API_BASE är inte satt i miljön.' });
  }

  const PAGE_SIZE = VISMA_FETCH_PAGE_SIZE;
  const MAX_PAGES = VISMA_FETCH_MAX_PAGES;
  const TIMEOUT = VISMA_API_TIMEOUT_MS;

  let page = 0;
  let added = 0;
  let updated = 0;
  let totalFetched = 0;

  let zeroAddStreak = 0;
  const ZERO_ADD_STREAK_LIMIT = Number(process.env.VISMA_ZERO_ADD_STREAK_LIMIT || 3);

  console.log('[incoming/cache/fetch-more] START', { PAGE_SIZE, MAX_PAGES, TIMEOUT, ZERO_ADD_STREAK_LIMIT });

  try {
    while (page < MAX_PAGES) {
      const path = `/incoming_delivery_notes/paged`;
      console.log(`[incoming/cache/fetch-more] HÄMTAR page=${page} från ${path}`);

      let vismaRes;
      try {
        const t0 = tstart();
        vismaRes = await vismaGet(path, {
          params: { page, page_size: PAGE_SIZE, order: 'desc', include_rows: false },
          timeout: TIMEOUT,
        });
        logStep('visma.fetch-more page', tendMs(t0), { page, page_size: PAGE_SIZE });
      } catch (err) {
        console.error('[incoming/cache/fetch-more] Visma REQUEST ERROR', err.code, err.message);

        if (err.code === 'ECONNABORTED') {
          const totalInDbTimeout = await IncomingNoteHead.count();
          return res.status(200).json({
            ok: false,
            timeout: true,
            added,
            updated,
            totalInDb: totalInDbTimeout,
            fetchedFromVisma: totalFetched,
            error: err.message || String(err),
            message: `Avbröt efter timeout. Totalt i DB: ${totalInDbTimeout}, nya: ${added}, uppdaterade: ${updated}.`,
          });
        }

        throw err;
      }

      const vismaItems = Array.isArray(vismaRes.data?.items) ? vismaRes.data.items : [];
      console.log(`[incoming/cache/fetch-more] page=${page} fick ${vismaItems.length} items`);
      if (!vismaItems.length) break;

      totalFetched += vismaItems.length;

      const heads = vismaItems
        .map((h) => {
          const lookupRegnr = h.regnr != null ? String(h.regnr) : null;
          return mapHeadFromVisma(h, lookupRegnr);
        })
        .filter(Boolean);

      const regnrs = heads.map((h) => String(h.regnr)).filter(Boolean);
      if (regnrs.length === 0) {
        console.log(`[incoming/cache/fetch-more] page=${page} hade 0 map:ade regnr → fortsätter`);
        page++;
        continue;
      }

      const existingRows = await IncomingNoteHead.findAll({
        attributes: ['regnr'],
        where: { regnr: { [Op.in]: regnrs } },
      });
      const existingSet = new Set(existingRows.map((r) => String(r.regnr)));

      const pageAdded = regnrs.filter((r) => !existingSet.has(r)).length;
      const pageUpdated = regnrs.length - pageAdded;

      await sequelize.transaction(async (t) => {
        for (const head of heads) {
          await IncomingNoteHead.upsert(head, { transaction: t });
        }
      });

      added += pageAdded;
      updated += pageUpdated;

      if (pageAdded === 0) {
        zeroAddStreak++;
        console.log(`[incoming/cache/fetch-more] page=${page} gav 0 nya (streak=${zeroAddStreak}/${ZERO_ADD_STREAK_LIMIT})`);
        if (zeroAddStreak >= ZERO_ADD_STREAK_LIMIT) {
          console.log(`[incoming/cache/fetch-more] ${ZERO_ADD_STREAK_LIMIT} sidor i rad utan nya → bryter`);
          break;
        }
      } else {
        zeroAddStreak = 0;
      }

      if (vismaItems.length < PAGE_SIZE) {
        console.log(`[incoming/cache/fetch-more] page=${page} < PAGE_SIZE → slut`);
        break;
      }

      page++;
    }

    const totalInDb = await IncomingNoteHead.count();
    console.log('[incoming/cache/fetch-more] KLAR', { totalInDb, added, updated, fetchedFromVisma: totalFetched });

    return res.json({
      ok: true,
      added,
      updated,
      totalInDb,
      fetchedFromVisma: totalFetched,
      message: `Synkat från Visma. Totalt i DB: ${totalInDb}, nya: ${added}, uppdaterade: ${updated}.`,
    });
  } catch (err) {
    console.error('[incoming/cache/fetch-more] error:', err);

    if (err.response) {
      console.error('[incoming/cache/fetch-more] Visma RESPONSE ERROR status=', err.response.status, 'data=', err.response.data);
    } else if (err.request) {
      console.error('[incoming/cache/fetch-more] Visma REQUEST ERROR (ingen response)', err.message);
    }

    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// -------------------------------------------------------
// GET /api/incoming/cache
// -------------------------------------------------------

router.get('/cache', async (req, res) => {
  try {
    const page = Number(req.query.page ?? 0) || 0;
    const pageSize = Number(req.query.page_size ?? 100) || 100;
    const orderDir = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const offset = page * pageSize;

    let { rows, count } = await IncomingNoteHead.findAndCountAll({
      limit: pageSize,
      offset,
      order: [
        ['docDate', orderDir],
        ['regnr', orderDir],
      ],
    });

    // AUTO-SEED om tomt
    if (count === 0) {
      console.log('[incoming/cache GET] cache empty – initial seed från Visma page 0');

      const resVisma = await vismaGet('/incoming_delivery_notes/paged', {
        params: { page: 0, page_size: 300, order: 'desc', include_rows: false },
      });

      const vismaItems = Array.isArray(resVisma.data?.items) ? resVisma.data.items : [];

      const headsToInsert = vismaItems
        .map((h) => {
          const lookupRegnr = h.regnr != null ? String(h.regnr) : null;
          return mapHeadFromVisma(h, lookupRegnr);
        })
        .filter(Boolean);

      if (headsToInsert.length > 0) {
        await IncomingNoteHead.bulkCreate(headsToInsert);
      }

      const reloaded = await IncomingNoteHead.findAndCountAll({
        limit: pageSize,
        offset,
        order: [
          ['docDate', orderDir],
          ['regnr', orderDir],
        ],
      });

      rows = reloaded.rows;
      count = reloaded.count;
    }

    // räkna cached rows per regnr
    const regnrs = rows.map((h) => String(h.regnr));
    let rowsCountByRegnr = {};

    if (regnrs.length > 0) {
      const rowCounts = await IncomingNoteRow.findAll({
        attributes: ['regnr', [fn('COUNT', col('id')), 'cachedRowCount']],
        where: { regnr: { [Op.in]: regnrs } },
        group: ['regnr'],
      });

      rowsCountByRegnr = rowCounts.reduce((acc, r) => {
        const plain = r.get({ plain: true });
        acc[String(plain.regnr)] = Number(plain.cachedRowCount) || 0;
        return acc;
      }, {});
    }

    const items = rows.map((h) => {
      const plain = h.get({ plain: true });
      const cachedRowCount = rowsCountByRegnr[String(plain.regnr)] || 0;
      return { ...plain, cachedRowCount, hasCachedRows: cachedRowCount > 0 };
    });

    return res.json({ page, page_size: pageSize, total: count, order: orderDir.toLowerCase(), items });
  } catch (err) {
    console.error('[incoming/cache GET] error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// -------------------------------------------------------
// GET /api/incoming/cache/status
// -------------------------------------------------------

router.get('/cache/status', async (req, res) => {
  try {
    const totalHeads = await IncomingNoteHead.count();
    const totalRows = await IncomingNoteRow.count();

    const latestHead = await IncomingNoteHead.findOne({ order: [['lastSyncedAt', 'DESC']] });

    return res.json({
      ok: true,
      totalHeads,
      totalRows,
      latestSyncedAt: latestHead?.lastSyncedAt ?? null,
      latestRegnr: latestHead?.regnr ?? null,
    });
  } catch (err) {
    console.error('[incoming/cache/status] error:', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// -------------------------------------------------------
// GET /api/incoming/cache/:regnr
// -------------------------------------------------------

router.get('/cache/:regnr', async (req, res) => {
  const regnr = String(req.params.regnr);
  if (!/^\d+$/.test(regnr)) return res.status(404).json({ error: 'NOT_FOUND' });

  try {
    let head = await IncomingNoteHead.findOne({
      where: { regnr },
      include: [{ model: IncomingNoteRow, as: 'rows' }],
      order: [
        ['regnr', 'ASC'],
        [{ model: IncomingNoteRow, as: 'rows' }, 'rowIndex', 'ASC'],
      ],
    });

    let rows = head?.rows || [];
    const expected = head?.rowCount ?? head?.nrows ?? null;
    const actual = rows.length;

    // Mindre aggressivt: om expected saknas men vi har rows så syncar vi inte.
    const needSync = !head || actual === 0 || (expected != null && expected !== actual);

    if (needSync) {
      console.log(`[incoming/cache/:regnr] Need sync for ${regnr}. expected=${expected}, actual=${actual}`);

      try {
        const synced = await syncRegnrFromVisma(regnr);
        if (synced) {
          head = await IncomingNoteHead.findOne({
            where: { regnr },
            include: [{ model: IncomingNoteRow, as: 'rows' }],
            order: [
              ['regnr', 'ASC'],
              [{ model: IncomingNoteRow, as: 'rows' }, 'rowIndex', 'ASC'],
            ],
          });
          rows = head?.rows || [];
        }
      } catch (err) {
        console.error(`[incoming/cache/:regnr] syncRegnrFromVisma ERROR for ${regnr}`, err);
        return res.status(502).json({
          head: head || null,
          rows: rows || [],
          error: 'VISMA_SYNC_FAILED',
          detail: err.message || String(err),
        });
      }
    }

    return res.json({ head: head || null, rows: rows || [] });
  } catch (err) {
    console.error('[incoming/cache/:regnr] error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// -------------------------------------------------------
// GET /api/incoming/cache/:regnr/rows
// -------------------------------------------------------

router.get('/cache/:regnr/rows', async (req, res) => {
  const regnr = String(req.params.regnr);
  if (!/^\d+$/.test(regnr)) return res.status(404).json({ error: 'NOT_FOUND' });

  const tAll = tstart();

  try {
    const tDb = tstart();
    let head = await IncomingNoteHead.findOne({
      where: { regnr },
      include: [
        {
          model: IncomingNoteRow,
          as: 'rows',
          separate: true,
          order: [['rowIndex', 'ASC']],
        },
      ],
    });
    logStep('db.load head+rows', tendMs(tDb), { regnr });

    let rows = head?.rows || [];
    const expected = head?.rowCount ?? head?.nrows ?? null;
    const actual = rows.length;

    // Mindre aggressivt: om expected saknas men rows finns → ok.
    const needSync = !head || actual === 0 || (expected != null && expected !== actual);

    console.log(
      `[incoming/cache/:regnr/rows] BEFORE sync regnr=${regnr}, existing=${actual}, expected=${expected}, needSync=${needSync}`
    );

    if (needSync) {
      try {
        const tSync = tstart();
        const synced = await syncRegnrFromVisma(regnr);
        logStep('syncRegnrFromVisma (in route)', tendMs(tSync), { regnr, syncedRows: synced?.rows?.length, mode: synced?.mode });

        if (synced) {
          const tDb2 = tstart();
          head = await IncomingNoteHead.findOne({
            where: { regnr },
            include: [
              {
                model: IncomingNoteRow,
                as: 'rows',
                separate: true,
                order: [['rowIndex', 'ASC']],
              },
            ],
          });
          rows = head?.rows || [];
          logStep('db.reload head+rows', tendMs(tDb2), { regnr, rows: rows.length });
        }
      } catch (err) {
        console.error(`[incoming/cache/:regnr/rows] syncRegnrFromVisma ERROR for ${regnr}`, err);
        return res.status(502).json({
          regnr,
          rows: rows || [],
          error: 'VISMA_SYNC_FAILED',
          detail: err.message || String(err),
        });
      }
    }

    console.log(`[incoming/cache/:regnr/rows] FINAL regnr=${regnr}, rowsCount=${rows.length}`);
    logStep('TOTAL /cache/:regnr/rows', tendMs(tAll), { regnr, rows: rows.length });

    return res.json({ regnr, rows: rows || [] });
  } catch (err) {
    console.error('[incoming/cache/:regnr/rows] error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// -------------------------------------------------------
// POST /api/incoming/cache/prewarm-missing-rows
// -------------------------------------------------------

router.post('/cache/prewarm-missing-rows', async (req, res) => {
  try {
    const limit = Number(req.body?.limit ?? 100);
    const daysBack = Number(req.body?.daysBack ?? 7);

    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const heads = await IncomingNoteHead.findAll({
      where: { docDate: { [Op.gte]: since } },
      order: [
        ['docDate', 'DESC'],
        ['regnr', 'DESC'],
      ],
      limit: limit * 3,
    });

    if (!heads.length) {
      return res.json({ ok: true, synced: 0, considered: 0, message: 'Inga heads att prewarma.' });
    }

    const regnrs = heads.map((h) => String(h.regnr));

    const rowCounts = await IncomingNoteRow.findAll({
      attributes: ['regnr', [fn('COUNT', col('id')), 'rowCount']],
      where: { regnr: { [Op.in]: regnrs } },
      group: ['regnr'],
    });

    const byRegnr = rowCounts.reduce((acc, r) => {
      const plain = r.get({ plain: true });
      acc[String(plain.regnr)] = Number(plain.rowCount) || 0;
      return acc;
    }, {});

    let synced = 0;
    const details = [];

    for (const h of heads) {
      if (synced >= limit) break;

      const reg = String(h.regnr);
      const expected = h.rowCount ?? h.nrows ?? null;
      const actual = byRegnr[reg] ?? 0;

      const need = actual === 0 || (expected != null && expected !== actual);
      if (!need) continue;

      try {
        console.log('[prewarm-missing-rows] sync', reg, 'expected=', expected, 'actual=', actual);
        const result = await syncRegnrFromVisma(reg);
        synced++;
        details.push({ regnr: reg, syncedRows: result?.rows?.length ?? 0, mode: result?.mode });
      } catch (err) {
        console.error('[prewarm-missing-rows] error syncing', reg, err);
        details.push({ regnr: reg, error: err.message || String(err) });
      }
    }

    return res.json({ ok: true, considered: heads.length, synced, details });
  } catch (err) {
    console.error('[prewarm-missing-rows] fatal error', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// -------------------------------------------------------
// EXPORT ROUTER
// -------------------------------------------------------
module.exports = router;

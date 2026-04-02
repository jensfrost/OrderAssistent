// routes/artReg.js
const express = require('express');
const router  = express.Router();
const { ArtReg, LevReg, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const axios   = require('axios');

const VISMA_TOKEN = process.env.VISMA_TOKEN;
const vismaHeaders = () => (VISMA_TOKEN ? { 'X-API-Token': VISMA_TOKEN } : {});

/* ───────────────── Helpers ───────────────── */
const normUnit = (u) => String(u ?? '').trim().toLowerCase();

function validateBody(body) {
  if (body.ARSTATNR == null || isNaN(Number(body.ARSTATNR))) {
    throw new Error(`ARSTATNR is required and must be a number.`);
  }
  body.ARSTATNR = Number(body.ARSTATNR);

  if (!body.ARTYPNR || typeof body.ARTYPNR !== 'string') {
    throw new Error(`ARTYPNR is required and must be a string.`);
  }

  if (body.ARENHET != null && typeof body.ARENHET !== 'string') {
    throw new Error(`ARENHET must be a string when provided.`);
  }
  if (body.ARENHET != null) {
    body.ARENHET = normUnit(body.ARENHET);
  }
}

// Ganska tolerant normalisering (sv/en)
const UNIT_MAP = new Map([
  ['kg', 'kg'], ['kilogram', 'kg'], ['kilo', 'kg'],
  ['g', 'g'], ['gram', 'g'],
  ['st', 'st'], ['styck', 'st'], ['stycke', 'st'], ['pcs', 'st'], ['pc', 'st'], ['piece', 'st'],
  ['l', 'l'], ['liter', 'l'], ['litre', 'l'],
  ['ml', 'ml']
]);

function normalizeVismaUnitValue(v) {
  if (v == null) return '';
  if (typeof v === 'number') return ''; // ogiltigt/oanvändbart som enhet
  if (typeof v === 'string') {
    const s = normUnit(v);
    if (!s) return '';
    // plocka ut första ordet/bokstavsblock om det är "Kilogram (kg)" etc.
    const token = s.split(/[^\p{Letter}]+/u).filter(Boolean)[0] || s;
    return UNIT_MAP.get(token) || token; // försök mappa, annars returnera token
  }
  if (typeof v === 'object') {
    // vanliga nästlade varianter
    const guess =
      v.code || v.unit || v.uom || v.value || v.name || v.label;
    return normalizeVismaUnitValue(guess);
  }
  return '';
}

/** Försök hitta enhet i "raw" oavsett fält-namn/struktur. */
function extractVismaUnit(raw) {
  if (!raw || typeof raw !== 'object') return '';

  // 1) Prioriterade kända fält (vanliga i olika Visma/ADK-dumpar)
  const priority = [
    'adk_stock_unit',
    'adk_article_unit',
    'adk_unit',
    'adk_article_purchase_unit',
    'adk_article_sales_unit',
    'adk_default_unit',
    'unit',           // ibland objekt
    'uom',            // “unit of measure”
  ];

  for (const k of priority) {
    if (k in raw) {
      const u = normalizeVismaUnitValue(raw[k]);
      if (u) return u;
    }
  }

  // 2) Fallback: sök igenom ALLA keys som innehåller “unit” eller “enhet”
  const keys = Object.keys(raw);
  for (const k of keys) {
    const lk = k.toLowerCase();
    if (lk.includes('unit') || lk.includes('enhet') || lk.endsWith('_uom')) {
      const u = normalizeVismaUnitValue(raw[k]);
      if (u) return u;
    }
  }

  // 3) Ingenting hittat
  return '';
}

// Försök härleda enhet om den saknas (senaste leverans → recept → fallback)
async function inferUnitForArticle(ARARTN, ARTYPNR, t = null) {
  // 1) redan satt i ARTREG?
  const existing = await ArtReg.findByPk(ARARTN, {
    attributes: ['ARENHET'],
    transaction: t || undefined,
  });
  const u0 = normUnit(existing?.ARENHET);
  if (u0) return u0;

  // 2) senaste leverans (RAW_DELIVERIES)
  try {
    const del = await sequelize.query(
      `
      SELECT TOP 1 LOWER(LTRIM(RTRIM(RWENHET))) AS u
      FROM dbo.RAW_DELIVERIES
      WHERE RWARTN = :a AND RWENHET IS NOT NULL AND LTRIM(RTRIM(RWENHET)) <> ''
      ORDER BY RWRGDT DESC
      `,
      { replacements: { a: ARARTN }, type: QueryTypes.SELECT, transaction: t || undefined }
    );
    const u1 = normUnit(del?.[0]?.u);
    if (u1) return u1;
  } catch (_) {}

  // 3) enhet från recept (RECREG) där artikeln är ingrediens
  try {
    const rec = await sequelize.query(
      `
      SELECT TOP 1 LOWER(LTRIM(RTRIM(RRENHET))) AS u
      FROM dbo.RECREG
      WHERE RRARTS = :a AND RRENHET IS NOT NULL AND LTRIM(RTRIM(RRENHET)) <> ''
      ORDER BY RRRGDT DESC
      `,
      { replacements: { a: ARARTN }, type: QueryTypes.SELECT, transaction: t || undefined }
    );
    const u2 = normUnit(rec?.[0]?.u);
    if (u2) return u2;
  } catch (_) {}

  // 4) fallback
  return ARTYPNR === 'R' ? 'kg' : 'st';
}

/* ───────────────── Import från Visma ─────────────────
 * GET/POST /import?prefix=R-
 * Visma-enhet (om den finns) SKRIVER ALLTID ÖVER ARENHET.
 * (Placeras FÖRE /:ARARTN för att undvika krockar.)
 */

// ───────────── Import från Visma (FIXAD) ─────────────
const importHandler = async (req, res, next) => {
  try {
    const base = (process.env.VISMA_API_BASE || '').replace(/\/+$/, '');
    if (!base) throw new Error('VISMA_API_BASE not set');

    const prefix = req.query.prefix ? String(req.query.prefix) : undefined;

    const limitQ = Number(req.query.limit);
    const maxRows =
      Number.isFinite(limitQ) && limitQ > 0 ? Math.min(limitQ, 5000) : undefined;

    const params = {};
    if (prefix) params.prefix = prefix;
    if (maxRows) params.max_rows = maxRows;
    // ✅ Alltid bara Webbshopsartiklar
    params.only_webshop = 1;

    console.log('[ART IMPORT] hit', {
      method: req.method,
      url: req.originalUrl,
      params,
      base
    });

    // ⬇️ Hämta artiklar från FastAPI med only_webshop=1 och ev. X-API-Token
    const artRes = await axios.get(`${base}/articles`, {
      params,
      headers: vismaHeaders(),
      timeout: 300_000, // 5 min server-timeout
    });

    const remote = Array.isArray(artRes.data) ? artRes.data : [];
    console.log('[ART IMPORT] fetched', remote.length, 'records');

    let createdCount = 0, updatedCount = 0;

    await sequelize.transaction(async (t) => {
      for (let i = 0; i < remote.length; i++) {
        const rec = remote[i];
        const raw = rec?.data || {};
        const supplierCode = raw.adk_article_supplier_number || null;

        // Supplier upsert (best effort)
        if (supplierCode) {
          try {
            let supplierName = supplierCode;
            try {
              const supRes = await axios.get(`${base}/suppliers/${supplierCode}`, {
                headers: vismaHeaders(),
                timeout: 20_000
              });
              supplierName = supRes?.data?.data?.adk_supplier_name || supplierName;
            } catch (_) {}
            await LevReg.findOrCreate({
              where:  { LRLEVN: supplierCode },
              defaults: { LRLEVN: supplierCode, LRNAMN: supplierName },
              transaction: t,
            });
          } catch (e) {
            console.warn('[ART IMPORT] supplier upsert failed', supplierCode, e?.message);
          }
        }

        const ARARTN  = raw.adk_article_number;
        if (!ARARTN) continue;

        const ARTYPNR = String(ARARTN).startsWith('R-') ? 'R' : 'F';
        const unitFromRemote = extractVismaUnit(raw);

        if (i < 15) {
          const unitKeys = Object.keys(raw).filter(k =>
            k.toLowerCase().includes('unit') ||
            k.toLowerCase().includes('enhet') ||
            k.toLowerCase().endsWith('_uom')
          );
          console.log('VISMA unit for', ARARTN, '=>', unitFromRemote || '(empty)', '| keys:', unitKeys);
        }

        const defaults = {
          ARARTN,
          ARARTS:   raw.adk_article_group || '',
          ARNAMN:   raw.adk_article_name || '',
          ARLEVE:   supplierCode,
          ARSTATNR: Number(raw.adk_article_status_nr || 0),
          ARTYPNR,
          ARENHET:  unitFromRemote || await inferUnitForArticle(ARARTN, ARTYPNR, t),
        };

        const [article, created] = await ArtReg.findOrCreate({
          where:    { ARARTN },
          defaults,
          transaction: t,
        });

        if (created) {
          createdCount++;
        } else {
          const nextFields = {
            ARARTS:   defaults.ARARTS,
            ARNAMN:   defaults.ARNAMN,
            ARLEVE:   defaults.ARLEVE,
            ARSTATNR: defaults.ARSTATNR,
            ARTYPNR:  defaults.ARTYPNR,
          };
          if (unitFromRemote) nextFields.ARENHET = unitFromRemote;
          await article.update(nextFields, { transaction: t });
          updatedCount++;
        }
      }
    });

    res.json({ imported: remote.length, created: createdCount, updated: updatedCount, only_webshop: true, prefix });
  } catch (err) {
    console.error('[ART IMPORT] failed:', err?.response?.data || err?.message || err);
    if (err?.response) {
      // bubbla upp Visma-API:ets fel
      return res.status(500).json({ error: 'Visma API error', upstream: err.response.data });
    }
    next(err);
  }
};

router.post('/import', importHandler);
router.get('/import', importHandler);


// Liten probe så du kan se i webbläsaren vilka enhetsfält som kommer
router.get('/import/_probe', async (req, res, next) => {
  try {
    const prefix    = req.query.prefix != null ? String(req.query.prefix) : undefined;
    const vismaBase = process.env.VISMA_API_BASE;
    if (!vismaBase) throw new Error('VISMA_API_BASE not set');

    const params = prefix ? { prefix, only_webshop: 1 } : { only_webshop: 1 };

    const artRes = await axios.get(`${vismaBase}/articles`, {
      params,
      headers: vismaHeaders(),
      timeout: 300_000
    });
    const remote = artRes.data || [];

    const sample = remote.slice(0, 20).map(rec => {
      const raw = rec?.data || {};
      const ARARTN = raw.adk_article_number;
      const unit = extractVismaUnit(raw);
      const unitKeys = Object.keys(raw).filter(k => k.toLowerCase().includes('unit') || k.toLowerCase().includes('enhet') || k.toLowerCase().endsWith('_uom'));
      return { ARARTN, unit, unitKeys, rawUnitsPreview: Object.fromEntries(unitKeys.map(k => [k, raw[k]])) };
    });

    res.json({ count: remote.length, sample });
  } catch (err) {
    next(err);
  }
});

/* ───────────────── CRUD ───────────────── */

// GET all articles
router.get('/', async (_req, res) => {
  try {
    const rows = await ArtReg.findAll();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET one article
router.get('/:ARARTN', async (req, res, next) => {
  try {
    // Om någon ändå skulle träffa denna med 'import' i path, släpp vidare
    if (req.params?.ARARTN?.toLowerCase() === 'import') return next('route');

    const art = await ArtReg.findByPk(req.params.ARARTN);
    if (!art) return res.status(404).json({ message: 'Not Found' });
    res.json(art);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create article
router.post('/', async (req, res) => {
  try {
    validateBody(req.body);

    const newArt = await ArtReg.create({
      ARARTN:  req.body.ARARTN,
      ARARTS:  req.body.ARARTS,
      ARNAMN:  req.body.ARNAMN,
      ARLEVE:  req.body.ARLEVE,
      ARSTATNR:req.body.ARSTATNR,
      ARTYPNR: req.body.ARTYPNR,
      BRARTN:  req.body.BRARTN,
      ARENHET: normUnit(req.body.ARENHET) || await inferUnitForArticle(req.body.ARARTN, req.body.ARTYPNR)
    });

    res.status(201).json(newArt);
  } catch (err) {
    console.error(err);
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({ error: err.errors.map(e => e.message).join('; ') });
    }
    res.status(400).json({ error: err.message });
  }
});

// PUT update article
router.put('/:ARARTN', async (req, res) => {
  try {
    validateBody(req.body);

    const updates = {
      ARARTS:  req.body.ARARTS,
      ARNAMN:  req.body.ARNAMN,
      ARLEVE:  req.body.ARLEVE,
      ARSTATNR: req.body.ARSTATNR,
      ARTYPNR:  req.body.ARTYPNR,
      BRARTN:  req.body.BRARTN,
    };
    if (req.body.ARENHET != null && String(req.body.ARENHET).trim() !== '') {
      updates.ARENHET = normUnit(req.body.ARENHET);
    }

    const [updated] = await ArtReg.update(updates, { where: { ARARTN: req.params.ARARTN } });
    if (!updated) return res.status(404).json({ message: 'Not Found' });

    const art = await ArtReg.findByPk(req.params.ARARTN);
    res.json(art);
  } catch (err) {
    console.error(err);
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({ error: err.errors.map(e => e.message).join('; ') });
    }
    res.status(400).json({ error: err.message });
  }
});

// DELETE article
// DELETE article (med referenskontroll + 409)
router.delete('/:ARARTN', async (req, res) => {
  const id = String(req.params.ARARTN);

  try {
    // Kolla referenser innan vi försöker ta bort
    const q = (sql) => sequelize.query(sql, {
      replacements: { a: id },
      type: QueryTypes.SELECT
    });

    // Kan finnas både som "produkt" i recept och som "ingrediens"
    const rowRecProd = (await q(`SELECT COUNT(*) AS c FROM dbo.RECREG WHERE ARARTN = :a`))[0] || { c: 0 };
    const rowRecIng  = (await q(`SELECT COUNT(*) AS c FROM dbo.RECREG WHERE RRARTS = :a`))[0] || { c: 0 };

    // Vanliga övriga referenser
    const rowRawDel  = (await q(`SELECT COUNT(*) AS c FROM dbo.RAWREG WHERE RWARTN = :a`))[0] || { c: 0 };

    // Batch-huvuden (produkt). Om du inte har tabellen, kommentera raden.
    let rowBatches = { c: 0 };
    try {
      rowBatches = (await q(`SELECT COUNT(*) AS c FROM dbo.BATREG WHERE BRARTS = :a`))[0] || { c: 0 };
    } catch (_) { /* tabell kan saknas i vissa installationer */ }

    const refs = {
      recipesAsProduct: Number(rowRecProd.c || 0),
      recipesAsIngredient: Number(rowRecIng.c || 0),
      rawDeliveries: Number(rowRawDel.c || 0),
      batchesAsProduct: Number(rowBatches.c || 0),
    };
    const totalRefs = Object.values(refs).reduce((s, n) => s + n, 0);

    if (totalRefs > 0) {
      // Avbryt radering med tydligt svar till klienten
      return res.status(409).json({
        error: 'in_use',
        message: 'Artikeln används i andra poster och kan inte tas bort.',
        refs
      });
    }

    const deleted = await ArtReg.destroy({ where: { ARARTN: id } });
    if (!deleted) return res.status(404).json({ message: 'Not Found' });
    return res.status(204).send();

  } catch (err) {
    // Fånga FK-fel från MSSQL (error number 547) eller textmatch
    const msg  = err?.original?.message || err?.message || 'Delete failed';
    const code = err?.original?.number;
    if (code === 547 || /DELETE statement conflicted with the REFERENCE constraint/i.test(msg)) {
      return res.status(409).json({
        error: 'in_use',
        message: 'Artikeln är refererad i andra tabeller och kan inte tas bort.',
        detail: msg
      });
    }
    console.error('[ART DELETE] failed:', msg);
    return res.status(500).json({ error: msg });
  }
});


module.exports = router;

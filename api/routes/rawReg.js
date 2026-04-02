// routes/rawReg.js
const express = require('express');
const router = express.Router();
const { RawReg, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// Bas-SELECT (läser pris från RWINPRIS)
const BASE_SELECT = `
  SELECT
    RWID                                   AS id,
    RWARTN                                 AS material,
    RWDATUM                                AS [date],
    RWKVANTITET                            AS quantity,
    RWENHET                                AS unit,
    RWLEVER                                AS supplier,
    RWNAMN                                  AS notes,
    RWBBDT                                 AS bestBeforeDate,
    RWLMDT                                  AS rwlmdt,
    RWVISMALOPNR                           AS vismaDocumentNumber,
    CAST(RWINPRIS AS DECIMAL(18,2))        AS purchasePrice,
    RWCURR                                  AS currencyCode,
    ISNULL(RWBATCHNR, '')                  AS batchNr
  FROM dbo.RAWREG
`;

/* --- Hjälpare: se till att datum har HH:mm:ss --- */
function toLocalHms() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
function ensureDateTime(val) {
  if (!val) return null;
  const s = String(val).trim();
  // Redan datetime?
  if (s.includes('T') || s.includes(' ')) return s;
  // Endast YYYY-MM-DD -> addera lokal tid
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} ${toLocalHms()}`;
  return s;
}
const normCurrency = (c) =>
  (c ?? '').toString().trim().toUpperCase().slice(0, 3) || 'SEK';

const normBatch = (v) => {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s) return '';
  if (s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return '';
  return s;
};

// GET all
router.get('/', async (_req, res) => {
  try {
    const rows = await sequelize.query(
      `${BASE_SELECT}
       ORDER BY RWDATUM DESC, RWID DESC`,
      { type: QueryTypes.SELECT }
    );

    // Se till att batchNr alltid finns (även om någon bypassat ISNULL)
    const out = rows.map(r => ({
      ...r,
      batchNr: normBatch(r.batchNr),
    }));

    res.json(out);
  } catch (err) {
    console.error('❌ Error in GET /rawReg:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

// Debug
router.get('/_debug', async (_req, res) => {
  try {
    const rows = await sequelize.query(
      `
      SELECT TOP 50
        RWID, RWARTN, RWDATUM, RWKVANTITET, RWENHET,
        RWLEVER, RWNAMN, RWBBDT, RWLMDT,
        RWVISMALOPNR, RWINPRIS, RWCURR,
        RWBATCHNR
      FROM dbo.RAWREG
      ORDER BY RWDATUM DESC, RWID DESC
      `,
      { type: QueryTypes.SELECT }
    );
    res.json({ count: rows.length, sample: rows });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const {
      material,
      date,
      supplier,
      notes,
      quantity,
      unit,
      bestBeforeDate,
      vismaDocumentNumber,
      purchasePrice,
      currencyCode,

      // ✅ NYTT: batch (acceptera flera möjliga nycklar)
      batchNr,
      RWBATCHNR,
      rwbatchnr,
      rwBatchNr,
    } = req.body;

    if (!material || !date || quantity == null || unit == null) {
      return res.status(400).json({ error: 'material, date, quantity och unit krävs.' });
    }

    const u = String(unit).trim().toLowerCase();

    // Validera enhet (om du vill)
    const unitOk = await sequelize.query(
      `SELECT 1 FROM dbo.ENHREG WHERE ENHCODE = :code AND IS_ACTIVE = 1`,
      { replacements: { code: u }, type: QueryTypes.SELECT }
    );
    if (unitOk.length === 0) {
      return res.status(400).json({ error: `Okänd enhet: ${u}` });
    }

    // Normalisera batch så vi inte skriver NULL av misstag
    const batch = normBatch(batchNr ?? RWBATCHNR ?? rwbatchnr ?? rwBatchNr ?? '');

    // Kolumner: inkludera ALLTID RWCURR, så vi överstyr DB-default
    const cols = ['RWARTN', 'RWDATUM', 'RWLEVER', 'RWNAMN', 'RWKVANTITET', 'RWENHET', 'RWCURR'];
    const vals = [':material', ':date', ':supplier', ':notes', ':quantity', ':unit', ':currencyCode'];

    const repl = {
      material,
      date: ensureDateTime(date),
      supplier: supplier ?? null,
      notes: notes ?? '', // frontend sätter nu råvarans namn här
      quantity: Number(quantity),
      unit: u,
      currencyCode: normCurrency(currencyCode), // 'EUR' eller fallback 'SEK'
      vismaDocumentNumber: vismaDocumentNumber || null,
      purchasePrice: (purchasePrice == null || purchasePrice === '') ? null : Number(purchasePrice),
      batchNr: batch,
    };

    if (bestBeforeDate != null && bestBeforeDate !== '') {
      cols.push('RWBBDT');
      vals.push(':bestBeforeDate');
      repl.bestBeforeDate = bestBeforeDate; // skickas endast om satt
    }

    cols.push('RWVISMALOPNR', 'RWINPRIS');
    vals.push(':vismaDocumentNumber', ':purchasePrice');

    // ✅ NYTT: batch-kolumn (bara om du har lagt till den i DB)
    cols.push('RWBATCHNR');
    vals.push(':batchNr');

    // Debug-logg för att bekräfta vad vi faktiskt skriver
    console.log('POST /rawReg -> currencyCode =', repl.currencyCode, 'batchNr =', repl.batchNr);

    const sql = `
      DECLARE @out TABLE (
        id                   INT,
        material             NVARCHAR(50),
        [date]               DATETIME2,
        supplier             NVARCHAR(50),
        notes                NVARCHAR(200),
        quantity             DECIMAL(18,3),
        unit                 NVARCHAR(8),
        bestBeforeDate       DATETIME2,
        rwlmdt               DATETIME2,
        vismaDocumentNumber  NVARCHAR(50),
        purchasePrice        DECIMAL(18,2),
        currencyCode         NVARCHAR(3),
        batchNr              NVARCHAR(50)
      );

      INSERT INTO dbo.RAWREG (${cols.join(', ')})
      OUTPUT
        inserted.RWID                 AS id,
        inserted.RWARTN               AS material,
        inserted.RWDATUM              AS [date],
        inserted.RWLEVER              AS supplier,
        inserted.RWNAMN               AS notes,
        inserted.RWKVANTITET          AS quantity,
        inserted.RWENHET              AS unit,
        inserted.RWBBDT               AS bestBeforeDate,
        inserted.RWLMDT               AS rwlmdt,
        inserted.RWVISMALOPNR         AS vismaDocumentNumber,
        CAST(inserted.RWINPRIS AS DECIMAL(18,2)) AS purchasePrice,
        inserted.RWCURR               AS currencyCode,
        ISNULL(inserted.RWBATCHNR, '') AS batchNr
      INTO @out
      VALUES (${vals.join(', ')});

      SELECT * FROM @out;
    `;

    const rows = await sequelize.query(sql, {
      replacements: repl,
      type: QueryTypes.SELECT,
    });

    const r = rows[0];
    return res.status(201).json({
      id: r.id,
      material: r.material,
      date: r.date,
      supplier: r.supplier,
      notes: r.notes,
      quantity: Number(r.quantity),
      unit: r.unit,
      bestBeforeDate: r.bestBeforeDate,
      rwlmdt: r.rwlmdt,
      vismaDocumentNumber: r.vismaDocumentNumber,
      purchasePrice: r.purchasePrice == null ? null : Number(r.purchasePrice),
      currencyCode: r.currencyCode || 'SEK',
      batchNr: normBatch(r.batchNr), // ✅ NYTT
    });
  } catch (err) {
    console.error('❌ Error in POST /rawReg:', err);
    res.status(400).json({ error: err.message || String(err) });
  }
});

// PUT update by ID
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const patch = {};
    if (req.body.material != null) patch.material = req.body.material;
    if (req.body.date != null)     patch.date = ensureDateTime(req.body.date);
    if (req.body.supplier != null) patch.supplier = req.body.supplier;
    if (req.body.notes != null)    patch.notes = req.body.notes;
    if (req.body.quantity != null) patch.quantity = Number(req.body.quantity);
    if (req.body.unit != null)     patch.unit = String(req.body.unit).trim().toLowerCase();
    if (req.body.bestBeforeDate !== undefined)       patch.bestBeforeDate = req.body.bestBeforeDate || null;
    if (req.body.vismaDocumentNumber !== undefined)  patch.vismaDocumentNumber = req.body.vismaDocumentNumber || null;
    if (req.body.purchasePrice !== undefined) {
      patch.purchasePrice = req.body.purchasePrice === '' ? null : Number(req.body.purchasePrice);
    }
    if (req.body.currencyCode !== undefined) {
      // Om du har NOT NULL på RWCURR, fallbacka till 'SEK' när den töms
      patch.currencyCode = req.body.currencyCode
        ? String(req.body.currencyCode).trim().toUpperCase().slice(0, 3)
        : 'SEK';
    }

    // ✅ NYTT: batchNr (acceptera olika nycklar)
    if (req.body.batchNr !== undefined || req.body.RWBATCHNR !== undefined || req.body.rwbatchnr !== undefined || req.body.rwBatchNr !== undefined) {
      const b = normBatch(req.body.batchNr ?? req.body.RWBATCHNR ?? req.body.rwbatchnr ?? req.body.rwBatchNr ?? '');
      patch.batchNr = b; // modellen RawReg måste ha batchNr-mappning (se notis nedan)
    }

    const [updated] = await RawReg.update(patch, { where: { id } });
    if (!updated) return res.status(404).json({ message: 'Not Found' });

    // Läs tillbaka med modellen (inkl. pris, visma nr, valuta)
    const row = await RawReg.findByPk(id, {
      attributes: [
        'id',
        'material',
        'date',
        'quantity',
        'unit',
        'supplier',
        'notes',
        'bestBeforeDate',
        'rwlmdt',
        'vismaDocumentNumber',
        'purchasePrice',
        'currencyCode',
        'batchNr', // ✅ NYTT
      ],
      raw: true,
    });

    // Normalisera svaret lite (nummer/valuta)
    row.purchasePrice = row.purchasePrice == null ? null : Number(row.purchasePrice);
    row.currencyCode = row.currencyCode || 'SEK';
    row.batchNr = normBatch(row.batchNr); // ✅ NYTT

    res.json(row);
  } catch (err) {
    console.error('❌ Error in PUT /rawReg/:id:', err);
    res.status(400).json({ error: err.message || 'Unknown error' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await RawReg.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ message: 'Not Found' });
    res.status(204).send();
  } catch (err) {
    console.error('❌ Error in DELETE /rawReg/:id:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

module.exports = router;

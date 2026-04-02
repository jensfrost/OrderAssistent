// routes/batReg.js
const express = require('express');
const router = express.Router();
const { BatReg, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

/* Helpers */
const s = (v) => String(v ?? '').trim();
const n = (v) => Number(v ?? 0);
const unitNorm = (v) => s(v).toLowerCase();

/* ────────── Debug ────────── */
router.get('/_debug', async (_req, res) => {
  try {
    const [cntRows] = await sequelize.query('SELECT COUNT(*) AS n FROM dbo.BATREG');
    const [sample]  = await sequelize.query(`
      SELECT TOP 5 BRBATCH, BRARTS, BRBBDT, BRKVANT, BRRGDT, BRLMDT
      FROM dbo.BATREG
      ORDER BY BRRGDT DESC
    `);
    res.json({ count: cntRows?.[0]?.n ?? 0, sample });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ───────── GET all (header + lines) ───────── */
router.get('/', async (_req, res) => {
  try {
    const headers = await BatReg.findAll({ order: [['BRRGDT', 'DESC']] });
    const batchIds = headers.map(h => h.BRBATCH);
    if (batchIds.length === 0) return res.json([]);

    const rows = await sequelize.query(
      `
      SELECT
        BATCH_ID     AS batchId,
        ID           AS lineId,
        ING_ARTIKEL  AS raw,
        ALLOC_QTY    AS quantity,
        ALLOC_UNIT   AS unit,
        RAW_DEL_ID   AS rawDeliveryId
      FROM dbo.BATCH_LINES
      WHERE BATCH_ID IN (:batchIds)
      ORDER BY BATCH_ID, ID;
      `,
      { replacements: { batchIds }, type: QueryTypes.SELECT }
    );

    const byBatch = rows.reduce((acc, r) => {
      (acc[r.batchId] = acc[r.batchId] || []).push({
        lineId:        n(r.lineId),
        raw:           s(r.raw),
        quantity:      n(r.quantity),
        unit:          s(r.unit),
        rawDeliveryId: n(r.rawDeliveryId),
      });
      return acc;
    }, {});

    const result = headers.map(h => ({
      header: h.toJSON(),
      lines:  byBatch[h.BRBATCH] || [],
    }));

    res.json(result);
  } catch (err) {
    console.error('❌ Error in GET /batReg:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

/* ───────── GET one (header + lines) ───────── */
router.get('/:id', async (req, res) => {
  const batchId = s(req.params.id);
  try {
    const header = await BatReg.findOne({ where: { BRBATCH: batchId } });
    if (!header) return res.status(404).json({ message: 'Not Found' });

    const rows = await sequelize.query(
      `
      SELECT
        ID            AS lineId,
        ING_ARTIKEL   AS raw,
        ALLOC_QTY     AS quantity,
        ALLOC_UNIT    AS unit,
        RAW_DEL_ID    AS rawDeliveryId
      FROM dbo.BATCH_LINES
      WHERE BATCH_ID = :batchId
      ORDER BY ID;
      `,
      { replacements: { batchId }, type: QueryTypes.SELECT }
    );

    const lines = rows.map(l => ({
      lineId:        n(l.lineId),
      raw:           s(l.raw),
      quantity:      n(l.quantity),
      unit:          s(l.unit),
      rawDeliveryId: n(l.rawDeliveryId),
    }));

    res.json({ header: header.toJSON(), lines });
  } catch (err) {
    console.error('❌ Error in GET /batReg/:id:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

/* ── POST create header (+ ev. lines) i transaktion ──
   lines är VALFRITT. Om medskickat, måste varje rad ha raw, rawDeliveryId>0, quantity>0, unit. */
router.post('/', async (req, res) => {
  const { BRARTS, BRBBDT, BRKVANT, lines } = req.body;

  if (!BRARTS || !BRBBDT || !BRKVANT) {
    return res.status(400).json({ error: 'BRARTS, BRBBDT och BRKVANT krävs.' });
  }

  let cleaned = [];
  if (Array.isArray(lines) && lines.length > 0) {
    cleaned = lines.map(l => ({
      raw:           s(l.raw),
      rawDeliveryId: n(l.rawDeliveryId),
      quantity:      n(l.quantity),
      unit:          unitNorm(l.unit || ''),
    })).filter(l => l.raw && l.rawDeliveryId > 0 && l.quantity > 0 && l.unit);
    if (cleaned.length === 0) {
      return res.status(400).json({ error: 'Inga giltiga ingrediensrader (raw, rawDeliveryId>0, quantity>0, unit).' });
    }
  }

  try {
    const { batchNumber } = await sequelize.transaction(async (t) => {
      /* 1) Skapa header */
      await sequelize.query(
        `
        INSERT INTO dbo.BATREG (BRARTN, BRARTS, BRBBDT, BRTRVI, BRVIKT, BRKVANT)
        VALUES (:BRARTS, :BRARTS, :BRBBDT, 0, 0, :BRKVANT);
        `,
        {
          replacements: { BRARTS, BRBBDT, BRKVANT },
          type: QueryTypes.INSERT,
          transaction: t,
        }
      );

      /* 2) Hämta BRBATCH för den skapade posten */
      const created = await sequelize.query(
        `
        SELECT TOP 1 BRBATCH AS batchNumber
        FROM dbo.BATREG
        WHERE BRARTS = :BRARTS AND BRBBDT = :BRBBDT AND BRKVANT = :BRKVANT
        ORDER BY BRRGDT DESC;
        `,
        {
          replacements: { BRARTS, BRBBDT, BRKVANT },
          type: QueryTypes.SELECT,
          transaction: t,
        }
      );
      const firstRow = created && created[0];
      if (!firstRow?.batchNumber) throw new Error('Kunde inte hämta nytt BRBATCH');
      const batchNumber = s(firstRow.batchNumber);

      /* 3) (valfritt) skapa rader */
      if (cleaned.length > 0) {
        const detailRows = cleaned.map(l => ({
          BATCH_ID:    batchNumber,
          ING_ARTIKEL: l.raw,
          ALLOC_QTY:   l.quantity,
          ALLOC_UNIT:  l.unit,
          RAW_DEL_ID:  l.rawDeliveryId,
        }));

        await sequelize.getQueryInterface().bulkInsert('BATCH_LINES', detailRows, { transaction: t });
      }

      return { batchNumber };
    });

    res.status(201).json({ batchNumber });
  } catch (err) {
    console.error('❌ Error creating batch:', err);
    res.status(400).json({ error: err.message || 'Unknown error' });
  }
});

/* ───────── PUT update header ───────── */
router.put('/:id', async (req, res) => {
  const batchId = s(req.params.id);
  try {
    delete req.body.BRBATCH;
    delete req.body.BRRGDT;
    req.body.BRLMDT = new Date();

    const [updated] = await BatReg.update(req.body, { where: { BRBATCH: batchId } });
    if (!updated) return res.status(404).json({ message: 'Not Found' });

    const updatedHeader = await BatReg.findOne({ where: { BRBATCH: batchId } });
    res.json(updatedHeader);
  } catch (err) {
    console.error('❌ Error updating batch:', err);
    res.status(400).json({ error: err.message || 'Unknown error' });
  }
});

/* ───────── DELETE batch (rensa rader → rensa header) ───────── */
router.delete('/:id', async (req, res) => {
  const id = s(req.params.id ?? '');
  console.log('[DELETE /batReg/:id] incoming id =', JSON.stringify(id));

  const t = await sequelize.transaction();
  try {
    const exists = await sequelize.query(
      `SELECT 1 AS x FROM dbo.BATREG WHERE LTRIM(RTRIM(BRBATCH)) = :id;`,
      { replacements: { id }, type: QueryTypes.SELECT, transaction: t }
    );
    if (!exists || exists.length === 0) {
      await t.rollback();
      return res.status(404).json({ message: 'Not Found', batchId: id });
    }

    await sequelize.query(
      `DELETE FROM dbo.BATCH_LINES WHERE LTRIM(RTRIM(BATCH_ID)) = :id;`,
      { replacements: { id }, type: QueryTypes.BULKDELETE, transaction: t }
    );
    await sequelize.query(
      `DELETE FROM dbo.BATREG WHERE LTRIM(RTRIM(BRBATCH)) = :id;`,
      { replacements: { id }, type: QueryTypes.BULKDELETE, transaction: t }
    );

    await t.commit();

    const after = await sequelize.query(
      `
      SELECT
        (SELECT COUNT(*) FROM dbo.BATREG      WHERE LTRIM(RTRIM(BRBATCH)) = :id) AS headerCount,
        (SELECT COUNT(*) FROM dbo.BATCH_LINES WHERE LTRIM(RTRIM(BATCH_ID)) = :id) AS lineCount;
      `,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    const stillHeader = Number(after?.[0]?.headerCount || 0);
    const stillLines  = Number(after?.[0]?.lineCount  || 0);

    return res.status(200).json({
      ok: true,
      batchId: id,
      remaining: { header: stillHeader, lines: stillLines }
    });
  } catch (err) {
    await t.rollback();
    console.error('❌ Error deleting batch:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Unknown error' });
  }
});

module.exports = router;

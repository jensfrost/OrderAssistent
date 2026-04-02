// routes/batchLines.js
const express = require('express');
const router = express.Router();
// Säkerställ att modellen har fälten: ID, BATCH_ID, ING_ARTIKEL, ALLOC_QTY, ALLOC_UNIT, RAW_DEL_ID
const { BatchLine } = require('../models');

/* Helpers */
const s = (v) => String(v ?? '').trim();
const n = (v) => Number(v ?? 0);
const unitNorm = (v) => s(v).toLowerCase();

/* GET lines by batchId */
router.get('/:batchId', async (req, res, next) => {
  try {
    const batchId = s(req.params.batchId);
    const lines = await BatchLine.findAll({ where: { BATCH_ID: batchId } });
    res.json(lines);
  } catch (err) {
    next(err);
  }
});

/* POST new line (quantity + unit) */
router.post('/', async (req, res, next) => {
  try {
    const payload = {
      BATCH_ID:    s(req.body.batchId),
      ING_ARTIKEL: s(req.body.raw),
      ALLOC_QTY:   n(req.body.quantity),
      ALLOC_UNIT:  unitNorm(req.body.unit),
      RAW_DEL_ID:  n(req.body.rawDeliveryId),
    };

    if (!payload.BATCH_ID)   return res.status(400).json({ error: 'batchId krävs.' });
    if (!payload.ING_ARTIKEL) return res.status(400).json({ error: 'raw (artikelnummer) krävs.' });
    if (!payload.RAW_DEL_ID || payload.RAW_DEL_ID <= 0)
      return res.status(400).json({ error: 'rawDeliveryId måste vara > 0.' });
    if (!payload.ALLOC_QTY || payload.ALLOC_QTY <= 0)
      return res.status(400).json({ error: 'quantity måste vara > 0.' });
    if (!payload.ALLOC_UNIT)
      return res.status(400).json({ error: 'unit krävs.' });

    const newLine = await BatchLine.create(payload);
    res.status(201).json(newLine);
  } catch (err) {
    next(err);
  }
});

/* PUT update line (partial; quantity + unit) */
router.put('/:id', async (req, res, next) => {
  try {
    const id = n(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ogiltigt rad-ID.' });

    const updates = {};
    if (req.body.raw !== undefined)           updates.ING_ARTIKEL = s(req.body.raw);
    if (req.body.quantity !== undefined)      updates.ALLOC_QTY = n(req.body.quantity);
    if (req.body.unit !== undefined)          updates.ALLOC_UNIT = unitNorm(req.body.unit);
    if (req.body.rawDeliveryId !== undefined) updates.RAW_DEL_ID = n(req.body.rawDeliveryId);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Inga fält att uppdatera.' });
    }

    const [count] = await BatchLine.update(updates, { where: { ID: id } });
    if (!count) return res.status(404).json({ message: 'Not Found' });

    const updated = await BatchLine.findOne({ where: { ID: id } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* DELETE line */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = n(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ogiltigt rad-ID.' });

    const deleted = await BatchLine.destroy({ where: { ID: id } });
    if (!deleted) return res.status(404).json({ message: 'Not Found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;

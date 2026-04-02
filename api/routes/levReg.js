// routes/levReg.js
const express = require('express');
const router  = express.Router();
const { LevReg } = require('../models');

// GET all suppliers
router.get('/', async (req, res) => {
  const rows = await LevReg.findAll();
  res.json(rows);
});

// GET one by PK (LRLEVN)
router.get('/:LRLEVN', async (req, res) => {
  const lev = await LevReg.findByPk(req.params.LRLEVN);
  if (!lev) return res.status(404).json({ message: 'Not Found' });
  res.json(lev);
});

// POST create
router.post('/', async (req, res) => {
  try {
    const { LRLEVN, LRNAMN, LRKONT, LRSTAT } = req.body;
    if (!LRLEVN || !LRNAMN) throw new Error('LRLEVN & LRNAMN required');
    if (LRSTAT == null || isNaN(Number(LRSTAT))) throw new Error('LRSTAT must be a number');

    const now = new Date();

    const newSup = await LevReg.create({
      LRLEVN,
      LRNAMN,
      LRKONT,
      LRSTAT: Number(LRSTAT),
      LRRGDT: now
    });

    res.status(201).json(newSup); // ✅ fixed
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT update
router.put('/:LRLEVN', async (req, res) => {
  try {
    const { LRNAMN, LRKONT, LRSTAT } = req.body;

    // Optional: simple validation
    if (LRNAMN == null || LRKONT == null || LRSTAT == null) {
      return res.status(400).json({ error: 'LRNAMN, LRKONT and LRSTAT are required.' });
    }

    const now = new Date();

    // Perform the update
    const [updated] = await LevReg.update(
      { LRNAMN, LRKONT, LRSTAT, LRLMDT: now },
      { where: { LRLEVN: req.params.LRLEVN } }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Not Found' });
    }

    // Fetch and return the fresh record
    const lev = await LevReg.findByPk(req.params.LRLEVN);
    res.json(lev);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/:LRLEVN', async (req, res) => {
  const deleted = await LevReg.destroy({ where: { LRLEVN: req.params.LRLEVN } });
  if (!deleted) return res.status(404).json({ message: 'Not Found' });
  res.status(204).send();
});

module.exports = router;

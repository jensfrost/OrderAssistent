// routes/enhReg.js
const express = require('express');
const router = express.Router();
const { EnhReg } = require('../models');

router.get('/', async (req, res) => {
  try {
    const rows = await EnhReg.getActive(); // returnerar ENHCODE, ENHNAMN, IS_ACTIVE
    res.json(rows);
  } catch (err) {
    console.error('❌ Error in GET /enheter:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

module.exports = router;

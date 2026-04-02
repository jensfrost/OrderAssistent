// routes/orderAssistStockHistory.js
console.log('[load] orderAssistStockHistory.js loaded');
const express = require('express');
const axios = require('axios');

const router = express.Router();

const VISMA_API_BASE = String(process.env.VISMA_API_BASE || '').replace(/\/+$/, '');

router.get('/usage', async (req, res) => {
  try {
    const { from, to, article, date_field } = req.query;

    if (!VISMA_API_BASE) {
      return res.status(500).json({ error: 'VISMA_API_BASE is not set' });
    }

    if (!from || !to) {
      return res.status(400).json({ error: "Missing required query params: 'from' and 'to'" });
    }

    const r = await axios.get(`${VISMA_API_BASE}/visma/order_assist_stock_history/usage`, {
      params: { from, to, article, date_field },
      timeout: 600000,
    });

    res.json(r.data);
  } catch (e) {
    const status = e?.response?.status || 500;
    const data = e?.response?.data || null;

    res.status(status).json({
      error: e?.message || 'proxy failed',
      detail: data,
    });
  }
});

module.exports = router;
// api/routes/vismaStockHistory.js
const express = require('express');
const axios = require('axios');

const router = express.Router();

const VISMA_API_BASE = String(process.env.VISMA_API_BASE || '').replace(/\/+$/, '');
// Ex: http://10.10.0.13:8001 (dev)
if (!VISMA_API_BASE) {
  console.warn('[vismaStockHistory] VISMA_API_BASE is not set');
}

// Du monterar den under app.use('/api/visma', vismaStockHistory)
// => denna route ska INTE börja med /visma här, bara /stock_history/usage
router.get('/stock_history/usage', async (req, res) => {
  try {
    const { from, to, article, include_in } = req.query;

    if (!VISMA_API_BASE) {
      return res.status(500).json({ error: 'VISMA_API_BASE is not set' });
    }
    if (!from || !to) {
      return res.status(400).json({ error: "Missing required query params: 'from' and 'to'" });
    }

    // Vi kan anropa alias-endpointen i FastAPI:
    // /visma/stock_history/usage?from=...&to=...
    const r = await axios.get(`${VISMA_API_BASE}/visma/stock_history/usage`, {
      params: { from, to, article, include_in },
      timeout: 600000,
    });

    res.json(r.data);
  } catch (e) {
    const status = e?.response?.status || 500;
    const data = e?.response?.data;
    res.status(status).json({
      error: e?.message || 'proxy failed',
      detail: data || null,
    });
  }
});

module.exports = router;

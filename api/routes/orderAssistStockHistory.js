console.log('[load] EXACT orderAssistStockHistory.js', __filename);
const express = require('express');
const axios = require('axios');

const router = express.Router();

const VISMA_API_BASE = String(process.env.VISMA_API_BASE || '').replace(/\/+$/, '');

router.get('/usage', async (req, res) => {
  console.log('[HIT] Node /api/order_assist_stock_history/usage', req.query);
  try {
    const { from, to, article, date_field } = req.query;
    const supplierNumbers = Array.isArray(req.query.supplier_numbers)
      ? req.query.supplier_numbers
      : req.query.supplier_numbers
        ? [req.query.supplier_numbers]
        : [];

    if (!VISMA_API_BASE) {
      return res.status(500).json({ error: 'VISMA_API_BASE is not set' });
    }

    if (!from || !to) {
      return res.status(400).json({ error: "Missing required query params: 'from' and 'to'" });
    }

    const params = new URLSearchParams();
    params.set('from', String(from));
    params.set('to', String(to));
    if (article) params.set('article', String(article));
    if (date_field) params.set('date_field', String(date_field));
    for (const supplierNumber of supplierNumbers) {
      const value = String(supplierNumber ?? '').trim();
      if (value) {
        params.append('supplier_numbers', value);
      }
    }

    const r = await axios.get(
      `${VISMA_API_BASE}/visma/order_assist_stock_history/usage?${params.toString()}`,
      { timeout: 600000 }
    );

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

router.get('/recent_purchases', async (req, res) => {
  console.log('[HIT] recent_purchases route', req.query);
  try {
    const { from, to, article, limit_per_article, date_field } = req.query;

    const url = `${VISMA_API_BASE}/visma/order_assist_stock_history/recent_purchases`;
    console.log('[recent_purchases proxy] VISMA_API_BASE =', VISMA_API_BASE);
    console.log('[recent_purchases proxy] URL =', url);
    console.log('[recent_purchases proxy] params =', {
      from, to, article, limit_per_article, date_field,
    });

    const r = await axios.get(url, {
      params: { from, to, article, limit_per_article, date_field },
      timeout: 600000,
    });

    res.json(r.data);
  } catch (e) {
    console.log('[recent_purchases proxy ERROR]', e?.response?.status, e?.response?.data);
    const status = e?.response?.status || 500;
    const data = e?.response?.data || null;
    res.status(status).json({ error: e?.message || 'proxy failed', detail: data });
  }
});

module.exports = router;

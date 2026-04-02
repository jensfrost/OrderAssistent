const express = require('express');
const axios = require('axios');

const router = express.Router();

const VISMA_TOKEN = process.env.VISMA_TOKEN;
const vismaHeaders = () => (VISMA_TOKEN ? { 'X-API-Token': VISMA_TOKEN } : {});

router.get('/', async (req, res, next) => {
  try {
    const base = (process.env.VISMA_API_BASE || '').replace(/\/+$/, '');
    if (!base) {
      return res.status(500).json({ error: 'VISMA_API_BASE not set' });
    }

    const params = {};

    if (req.query.prefix) {
      params.prefix = String(req.query.prefix);
    }

    if (req.query.max_rows) {
      params.max_rows = Number(req.query.max_rows);
    }

    if (req.query.only_webshop != null) {
      const v = String(req.query.only_webshop).trim().toLowerCase();
      params.only_webshop = v === '1' || v === 'true' ? 1 : 0;
    }

    console.log('[vismaArticles] request ->', {
      base,
      url: `${base}/articles`,
      params,
      hasToken: !!process.env.VISMA_TOKEN,
      tokenPreview: process.env.VISMA_TOKEN
        ? process.env.VISMA_TOKEN.slice(0, 6) + '...'
        : null,
    });

    const response = await axios.get(`${base}/articles`, {
      params,
      headers: vismaHeaders(),
      timeout: 600000,
    });

    console.log('[vismaArticles] response <-', {
      status: response.status,
      isArray: Array.isArray(response.data),
      length: Array.isArray(response.data) ? response.data.length : null,
      sample: Array.isArray(response.data) ? response.data.slice(0, 2) : response.data,
    });

    return res.json(response.data);
  } catch (err) {
    console.error('[VISMA ARTICLES] failed:', err?.response?.data || err?.message || err);

    if (err?.response) {
      return res.status(err.response.status || 500).json({
        error: 'Visma API error',
        upstream: err.response.data,
      });
    }

    next(err);
  }
});

module.exports = router;
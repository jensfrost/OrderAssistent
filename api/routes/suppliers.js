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

    console.log('[suppliers] request ->', {
      base,
      url: `${base}/suppliers`,
      params,
      hasToken: !!process.env.VISMA_TOKEN,
    });

    const response = await axios.get(`${base}/suppliers`, {
      params,
      headers: vismaHeaders(),
      timeout: 600000,
    });

    console.log('[suppliers] response <-', {
      status: response.status,
      isArray: Array.isArray(response.data),
      length: Array.isArray(response.data) ? response.data.length : null,
      sample: Array.isArray(response.data) ? response.data.slice(0, 2) : response.data,
    });

    return res.json(response.data);
  } catch (err) {
    console.error('[SUPPLIERS] failed:', err?.response?.data || err?.message || err);

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
const express = require('express');
const axios = require('axios');

const router = express.Router();

const VISMA_TOKEN = process.env.VISMA_TOKEN;
const vismaHeaders = () => (VISMA_TOKEN ? { 'X-API-Token': VISMA_TOKEN } : {});

router.get('/_probe', async (req, res, next) => {
  try {
    const base = (process.env.VISMA_API_BASE || '').replace(/\/+$/, '');
    if (!base) {
      return res.status(500).json({ error: 'VISMA_API_BASE not set' });
    }

    const response = await axios.get(`${base}/leadtime/_probe`, {
      params: req.query,
      headers: vismaHeaders(),
      timeout: 300000,
    });

    return res.json(response.data);
  } catch (err) {
    console.error('[LEADTIME PROBE] failed:', err?.response?.data || err?.message || err);

    if (err?.response) {
      return res.status(err.response.status || 500).json({
        error: 'Visma API error',
        upstream: err.response.data,
      });
    }

    next(err);
  }
});

router.get('/article/:article', async (req, res, next) => {
  try {
    const base = (process.env.VISMA_API_BASE || '').replace(/\/+$/, '');
    if (!base) {
      return res.status(500).json({ error: 'VISMA_API_BASE not set' });
    }

    const response = await axios.get(
      `${base}/leadtime/article/${encodeURIComponent(req.params.article)}`,
      {
        params: req.query,
        headers: vismaHeaders(),
        timeout: 300000,
      }
    );

    return res.json(response.data);
  } catch (err) {
    console.error('[LEADTIME ARTICLE] failed:', err?.response?.data || err?.message || err);

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
const express = require('express');
const axios = require('axios');

const router = express.Router();

const VISMA_TOKEN = process.env.VISMA_TOKEN;

function vismaHeaders() {
  return VISMA_TOKEN ? { 'X-API-Token': VISMA_TOKEN } : {};
}

router.get('/_probe', async (req, res, next) => {
  try {
    const base = (process.env.VISMA_API_BASE || '').replace(/\/+$/, '');
    if (!base) {
      return res.status(500).json({ error: 'VISMA_API_BASE not set' });
    }

    console.log('[LEADTIME PROBE] request', {
      url: `${base}/leadtime/_probe`,
      params: req.query,
    });

    const response = await axios.get(`${base}/leadtime/_probe`, {
      params: req.query,
      headers: vismaHeaders(),
      timeout: 300000,
    });

    console.log('[LEADTIME PROBE] response ok', {
      status: response.status,
    });

    return res.json(response.data);
  } catch (err) {
    console.error('[LEADTIME PROBE] failed', {
      message: err?.message,
      code: err?.code,
      status: err?.response?.status,
      data: err?.response?.data,
    });

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

    const article = req.params.article;

    console.log('[LEADTIME ARTICLE] request', {
      article,
      url: `${base}/leadtime/article/${encodeURIComponent(article)}`,
      params: req.query,
    });

    const response = await axios.get(
      `${base}/leadtime/article/${encodeURIComponent(article)}`,
      {
        params: req.query,
        headers: vismaHeaders(),
        timeout: 300000,
      }
    );

    console.log('[LEADTIME ARTICLE] response ok', {
      article,
      status: response.status,
      samples: response.data?.samples,
      suggested_lead_time_days: response.data?.suggested_lead_time_days,
    });

    return res.json(response.data);
  } catch (err) {
    console.error('[LEADTIME ARTICLE] failed', {
      article: req.params.article,
      message: err?.message,
      code: err?.code,
      status: err?.response?.status,
      data: err?.response?.data,
    });

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
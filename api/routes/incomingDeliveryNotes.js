console.log('[LOAD] incomingDeliveryNotes.js loaded', __filename);
const express = require('express');
const axios = require('axios');

const router = express.Router();
const VISMA_API_BASE = String(process.env.VISMA_API_BASE || '').replace(/\/+$/, '');

console.log('[load] EXACT incomingDeliveryNotes.js', __filename);

router.get('/recent_by_article', async (req, res) => {
  console.log('[HIT] incoming recent_by_article route', req.query);

  try {
    const { article, limit_per_article, from_date, to_date, max_heads } = req.query;

    if (!VISMA_API_BASE) {
      return res.status(500).json({ error: 'VISMA_API_BASE is not set' });
    }

    const url = `${VISMA_API_BASE}/visma/incoming_delivery_notes/recent_by_article`;

    const params = {
      article,
      limit_per_article,
      from_date,
      to_date,
      max_heads,
    };

    console.log('[incoming recent_by_article proxy] VISMA_API_BASE =', VISMA_API_BASE);
    console.log('[incoming recent_by_article proxy] URL =', url);
    console.log('[incoming recent_by_article proxy] params =', params);

    const r = await axios.get(url, {
      params,
      timeout: 600000,
    });

    console.log('[incoming recent_by_article proxy] OK status =', r.status);
    console.log('[incoming recent_by_article proxy] rows keys =', Object.keys(r.data?.rows || {}));

    res.json(r.data);
  } catch (e) {
    console.error('[incoming recent_by_article proxy] FAILED');
    console.error('[incoming recent_by_article proxy] message =', e?.message);
    console.error('[incoming recent_by_article proxy] status =', e?.response?.status);
    console.error('[incoming recent_by_article proxy] data =', e?.response?.data);

    res.status(e?.response?.status || 500).json({
      error: e?.message || 'proxy failed',
      detail: e?.response?.data || null,
    });
  }
});

router.get('/match_by_article_and_bestnr', async (req, res) => {
  console.log('[HIT] incoming match_by_article_and_bestnr route', req.query);

  try {
    const { article, bestnr, max_heads, max_hits } = req.query;

    if (!VISMA_API_BASE) {
      return res.status(500).json({ error: 'VISMA_API_BASE is not set' });
    }

    const url = `${VISMA_API_BASE}/visma/incoming_delivery_notes/match_by_article_and_bestnr`;
    const params = { article, bestnr, max_heads, max_hits };

    console.log('[incoming match_by_article_and_bestnr proxy] VISMA_API_BASE =', VISMA_API_BASE);
    console.log('[incoming match_by_article_and_bestnr proxy] URL =', url);
    console.log('[incoming match_by_article_and_bestnr proxy] params =', params);

    const r = await axios.get(url, {
      params,
      timeout: 120000,
    });

    console.log('[incoming match_by_article_and_bestnr proxy] OK status =', r.status);
    console.log('[incoming match_by_article_and_bestnr proxy] rows keys =', Object.keys(r.data?.rows || {}));

    res.json(r.data);
  } catch (e) {
    console.error('[incoming match_by_article_and_bestnr proxy] FAILED');
    console.error('[incoming match_by_article_and_bestnr proxy] message =', e?.message);
    console.error('[incoming match_by_article_and_bestnr proxy] status =', e?.response?.status);
    console.error('[incoming match_by_article_and_bestnr proxy] data =', e?.response?.data);

    res.status(e?.response?.status || 500).json({
      error: e?.message || 'proxy failed',
      detail: e?.response?.data || null,
    });
  }
});

module.exports = router;

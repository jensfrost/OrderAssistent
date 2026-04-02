// routes/vismaStockBalance.js
console.log('[vismaStockBalance] ROUTE FILE LOADED');
const express = require('express');
const axios = require('axios');

const router = express.Router();

// Ex: http://10.10.0.13:8001/visma  (utan trailing slash)
const VISMA_API_BASE = String(process.env.VISMA_API_BASE || '').replace(/\/+$/, '');

// (valfritt) token mot FastAPI om du kräver den där
const VISMA_TOKEN = process.env.VISMA_TOKEN;

// Hjälp: plocka ut alias från query (din client kan sätta ?alias=...)
function pickAlias(req) {
  const a = req?.query?.alias;
  return a != null && String(a).trim() !== '' ? String(a).trim() : null;
}

// Hjälp: normalisera lista (array eller "A,B,C")
function normalizeArticles(v) {
  const arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',') : []);
  return arr
    .map(s => String(s ?? '').trim())
    .filter(Boolean);
}

// mode: onhand | available (default: onhand)
function normalizeMode(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'available') return 'available';
  if (s === 'onhand') return 'onhand';
  if (!s) return 'onhand';
  return null; // ogiltigt
}

router.post('/stock/balance', async (req, res) => {
  console.log('[vismaStockBalance] HIT', req.method, req.originalUrl);
    try {
    if (!VISMA_API_BASE) {
      return res.status(500).json({ error: 'VISMA_API_BASE is not configured on Node proxy' });
    }

    const body = req.body || {};

    // 1) articles
    const articles = normalizeArticles(body.articles ?? body.article ?? body.codes);
    if (!articles.length) {
      return res.status(422).json({
        detail: 'Missing "articles" (array of article numbers)',
      });
    }

    // 2) alias/company_alias (stöd: company_alias, alias, query alias)
    const aliasFromQuery = pickAlias(req);

    const company_alias =
      (body.company_alias != null && String(body.company_alias).trim() !== ''
        ? String(body.company_alias).trim()
        : null) ||
      (body.alias != null && String(body.alias).trim() !== ''
        ? String(body.alias).trim()
        : null) ||
      aliasFromQuery ||
      null;

    // 3) mode (default onhand)
    const mode = normalizeMode(body.mode);
    if (mode == null) {
      return res.status(422).json({
        detail: 'Invalid "mode". Expected "onhand" or "available".',
        got: body.mode,
      });
    }

    // Payload till FastAPI
    const payload = {
      articles,
      ...(company_alias ? { company_alias } : {}),
      mode, // alltid med, så vi vet exakt vad som används
    };

    // Headers till FastAPI
    const headers = {
      'Content-Type': 'application/json',
    };

    // Token: incoming header > env
    const incomingToken = req.get('X-API-Token');
    const tokenToUse = incomingToken || VISMA_TOKEN;
    if (tokenToUse) headers['X-API-Token'] = String(tokenToUse);

    // Serverlogg (utan token)
    console.log('[vismaStockBalance] -> FastAPI', {
      url: `${VISMA_API_BASE}/stock/balance`,
      payload,
      hasToken: !!tokenToUse,
    });

    const r = await axios.post(`${VISMA_API_BASE}/stock/balance`, payload, {
      timeout: 600000,
      headers,
      // om FastAPI ibland svarar stort:
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true, // vi hanterar status själva
    });

    // Skicka igenom svar och status exakt
    console.log('[vismaStockBalance] <- FastAPI', {
      status: r.status,
      sample: Array.isArray(r.data?.rows) ? r.data.rows.slice(0, 2) : undefined,
    });

    return res.status(r.status).json(r.data);
  } catch (e) {
    const status = e?.response?.status || 500;
    const data = e?.response?.data || { error: e?.message || 'Request failed' };

    console.error('[vismaStockBalance] error', {
      status,
      message: e?.message,
      data,
    });

    return res.status(status).json(data);
  }
});

module.exports = router;

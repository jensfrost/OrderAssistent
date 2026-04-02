// routes/vismaProxy.js
const express = require('express');
const axios = require('axios');

const router = express.Router();

/* ---------- CORS (använd samma env som i index.js) ---------- */
const parseAllowedOrigins = (s) =>
  String(s || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

const ORIGINS = parseAllowedOrigins(process.env.CORS_ALLOW_ORIGINS);
const ALLOW_ANY = ORIGINS.includes('*');

router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOW_ANY || ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', ALLOW_ANY ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    const reqHeaders = req.headers['access-control-request-headers'];
    res.setHeader('Access-Control-Allow-Headers',
      reqHeaders || 'Content-Type, Authorization, X-Requested-With, x-api-instance'
    );
    // Om du skickar cookies/credentials: sätt Allow-Credentials när ALLOW_ANY är false
    // res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ---------- Bas till FastAPI (utan /artpaket) ---------- */
const FASTAPI_BASE = (process.env.VISMA_API_BASE || '')
  .replace(/\/+$/, '');

/* ---------- Hjälpare ---------- */
const fwd = async (res, method, url, { params, data } = {}) => {
  try {
    const r = await axios({ method, url, params, data, timeout: 300000 });
    res.status(r.status).send(r.data);
  } catch (e) {
    const status = e.response?.status || 500;
    const body = e.response?.data || { error: String(e.message || e) };
    console.error(`[visma proxy] ${method.toUpperCase()} ${url} ->`, status, body);
    res.status(status).json(body);
  }
};

/* ---------- Health ---------- */
router.get('/_health', async (req, res) => {
  const params = { alias: req.query.alias || process.env.VISMA_ALIAS };
  const url = `${FASTAPI_BASE}/_health`;
  return fwd(res, 'get', url, { params });
});

/* ---------- Bundles: går via /artpaket/bundles ---------- */
router.get('/bundles', async (req, res) => {
  const params = { ...req.query, alias: req.query.alias || process.env.VISMA_ALIAS };
  const url = `${FASTAPI_BASE}/artpaket/bundles`;
  return fwd(res, 'get', url, { params });
});

/* ---------- incoming/list: mappar till incoming_delivery_notes/all ---------- */
router.get('/incoming/list', async (req, res) => {
  const alias = req.query.alias || process.env.VISMA_ALIAS;

  // Din nuvarande API använder offset/limit.
  // FastAPI använder page/page_size.
  const limitRaw = req.query.limit ?? 100;   // 0 = "ingen gräns" i din gamla kod -> vi sätter default 100
  const offsetRaw = req.query.offset ?? 0;

  const pageSize = Math.max(1, Math.min(5000, parseInt(limitRaw, 10) || 100)); // FastAPI max 500
  const offset = Math.max(0, parseInt(offsetRaw, 10) || 0);
  const page = Math.floor(offset / pageSize);

  const includeRows = String(req.query.include_rows ?? '0') === '1';

  const params = {
    // Om din FastAPI faktiskt använder alias i dessa endpoints: skicka med.
    // Om inte: den ignoreras, vilket är okej.
    alias,

    page,
    page_size: pageSize,
    order: req.query.order || 'desc',        // valfritt, FastAPI stödjer asc/desc
    include_rows: includeRows,               // FastAPI bool

    // row_limit finns inte på /paged (vad jag ser i openapi),
    // så vi skickar INTE den här. Om du behöver row_limit, får man hämta rows per doc istället.
  };

  const url = `${FASTAPI_BASE}/incoming_delivery_notes/paged`;
  return fwd(res, 'get', url, { params });
});

/* (valfri) incoming/by_regnr/:regnr -> mappar till FastAPI:s motsvarande rutt */
router.get('/incoming/by_regnr/:regnr', async (req, res) => {
  const params = { alias: req.query.alias || process.env.VISMA_ALIAS };
  const url = `${FASTAPI_BASE}/incoming_delivery_notes/by_regnr/${encodeURIComponent(req.params.regnr)}`;
  return fwd(res, 'get', url, { params });
});

// incoming/rows/:regnr -> /incoming_delivery_notes/rows/:regnr
router.get('/incoming/rows/:regnr', async (req, res) => {
  const params = { alias: req.query.alias || process.env.VISMA_ALIAS };
  const url = `${FASTAPI_BASE}/incoming_delivery_notes/rows/${encodeURIComponent(req.params.regnr)}`;
  return fwd(res, 'get', url, { params });
});

/* ---------- Fallback (ingen regex/wildcard i path → undviker path-to-regexp-fel) ---------- */
router.use((req, res) => {
  const subpath = req.path.replace(/^\/+/, ''); // t.ex. 'foo/bar'
  const url = `${FASTAPI_BASE}/${subpath}`;
  console.log(`[visma fallback] ${req.method} ${url}`, req.query);
  return fwd(res, req.method, url, { params: req.query, data: req.body });
});

module.exports = router;

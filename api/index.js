// api/index.js
const path = require('path');
const { config: loadEnv } = require('dotenv');

console.log('[DEBUG] Starting hundapoteket_api from', __filename);

/* ───────── Env loader: välj rätt .env.* ───────── */
const RAW = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
const ENV =
  RAW === 'preview' || RAW === 'pre' || RAW === 'staging' ? 'preview' :
  RAW === 'prod'    || RAW === 'production'               ? 'prod'    :
                                                           'dev';

const envFile =
  ENV === 'prod'    ? '.env.production' :
  ENV === 'preview' ? '.env.preview'    :
                      '.env.development';

loadEnv({ path: path.resolve(__dirname, envFile) });
console.log(`[ENV] loaded ${envFile} (APP_ENV=${ENV || '(unset)'})`);

const DB_HOST = process.env.DB_HOST || process.env.SQLSERVER_HOST || process.env.MSSQL_HOST || '(not set)';
const DB_NAME = process.env.DB_NAME || process.env.SQLSERVER_DB   || process.env.MSSQL_DB   || process.env.POSTGRES_DB || '(not set)';
console.log('[ENV] DB_HOST=%s DB_NAME=%s', DB_HOST, DB_NAME);
console.log('[ENV] VISMA_API_BASE=%s', process.env.VISMA_API_BASE || '(not set)');
console.log(
  '[ENV] SMTP_HOST=%s SMTP_PORT=%s SMTP_SECURE=%s',
  process.env.SMTP_HOST   || '(not set)',
  process.env.SMTP_PORT   || '(not set)',
  process.env.SMTP_SECURE || '(not set)',
);

const express    = require('express');
const bodyParser = require('body-parser');

const { sequelize } = require('./models');

// Routers
const artRegRouter     = require('./routes/artReg');
const batRegRouter     = require('./routes/batReg');
// const artBatRegRouter  = require('./routes/artBatReg');
const levRegRouter     = require('./routes/levReg');
const recRegRouter     = require('./routes/recReg');
// const artLevRegRoutes  = require('./routes/artLevReg');
// const artRecRegRoutes  = require('./routes/artRecReg');
const anvRegRouter     = require('./routes/anvReg');
const rawRegRoutes     = require('./routes/rawReg');
const enhRegRoutes     = require('./routes/enhReg');
const batchLinesRouter = require('./routes/batchLine');
const authRouter       = require('./routes/authReg');
const adminRouter = require('./routes/admin');

const vismaArticlesRouter = require('./routes/vismaArticles');
const rawReorderAssistRouter = require('./routes/rawReorderAssist');
const orderAssistRouter = require('./routes/orderAssist');
const leadtimeRouter = require('./routes/leadtime');

const vismaBundlesSql  = require('./routes/vismaBundlesSql');
const vismaProxy = require('./routes/vismaProxy');

// 🆕 incoming-cache router
const incomingCacheRouter = require('./routes/incomingCache');

// 🖨️ Importera FABRIKEN (inte själva routern)
const buildPrintRouter = require('./routes/print-zpl');

const { getAlias, getPool } = require('./lib/vismaSql');

const vismaStockHistory = require('./routes/vismaStockHistory');
const vismaStockBalance = require('./routes/vismaStockBalance');

const orderAssistStockHistoryRouter = require('./routes/orderAssistStockHistory');

const suppliersRouter = require('./routes/suppliers');

const app = express();
console.log('[BOOT] starting API index.js, pid=', process.pid);

/* Använd PORT från env per instans (sätt 3000 för preview, 3001 för dev i PM2) */
const PORT = process.env.PORT || (ENV === 'preview' ? 3000 : 3001);

app.disable('x-powered-by');

/* ===== CORS ===== */
const parseAllowedOrigins = (s) =>
  String(s || '').split(',').map(x => x.trim()).filter(Boolean);

const ORIGINS   = parseAllowedOrigins(process.env.CORS_ALLOW_ORIGINS);
const ALLOW_ANY = ORIGINS.includes('*');

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOW_ANY || ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', ALLOW_ANY ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    const reqHeaders = req.headers['access-control-request-headers'];
    res.setHeader(
      'Access-Control-Allow-Headers',
      reqHeaders || 'Content-Type, Authorization, X-Requested-With, x-api-instance'
    );
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ==== BODY PARSERS ==== */
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }));

/* 🔍 Enkel request-logger – så vi SER vad som faktiskt kommer in */
app.use((req, _res, next) => {
  console.log('[REQ]', req.method, req.path);
  next();
});

/* ==== DB TEST (Sequelize) ==== */
(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to app DB (Sequelize).');
  } catch (err) {
    console.error('❌ App DB connection failed:', err);
  }
})();

/* ==== ROUTER MOUNTS ==== */
// Viktigt: vår SQL-override först
app.use('/api/visma', vismaBundlesSql);
// 🆕 stock_history override före generella proxyn
app.use('/api/visma', vismaStockHistory);
app.use('/api/visma', vismaStockBalance);
// Därefter proxyn som fångar övrigt
app.use('/api/visma', vismaProxy);


app.use('/api/artReg',     artRegRouter);
app.use('/api/batReg',     batRegRouter);
// app.use('/api/artBatReg', artBatRegRouter);
app.use('/api/levReg',     levRegRouter);
app.use('/api/recReg',     recRegRouter);
// app.use('/api/artLevReg', artLevRegRoutes);
// app.use('/api/artRecReg', artRecRegRoutes);
app.use('/api/anvReg',     anvRegRouter);
app.use('/api/rawReg',     rawRegRoutes);
app.use('/api/enhReg',     enhRegRoutes);
app.use('/api/batchLines', batchLinesRouter);
app.use('/api/authReg',    authRouter);
app.use('/api/admin', adminRouter);

app.use('/api/vismaArticles', vismaArticlesRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/leadtime', leadtimeRouter);
app.use('/api/rawReorderAssist', rawReorderAssistRouter);
app.use('/api/orderAssist', orderAssistRouter);
app.use('/api/order_assist_stock_history', orderAssistStockHistoryRouter);

// 🆕 incoming-cache på /api/incoming/...
app.use('/api/incoming', incomingCacheRouter);

// 🖨️ Bygg & montera skrivarrouten
const printRouter = buildPrintRouter();
if (typeof printRouter !== 'function') {
  console.error('[print] printRouter is not a function. Got:', printRouter);
  process.exit(1);
}
app.use('/api/print', printRouter);
console.log('[print] router mounted at /api/print (health, zpl)');

// 🔍 Debug: enkel ping-route direkt i index.js
app.get('/api/ping-direct', (req, res) => {
  res.json({ ok: true, from: 'index.js', env: ENV, ts: new Date().toISOString() });
});
console.log('[debug] route mounted at /api/ping-direct');

// Visma-DB (via getPool/alias)
app.get('/api/_whoami', async (req, res) => {
  try {
    const alias = getAlias(req);
    const pool  = await getPool(alias);
    const r     = await pool.request().query(
      `SELECT SUSER_SNAME() AS login_name, DB_NAME() AS db_name, @@SERVERNAME AS server_name`
    );
    const row = r.recordset?.[0] || {};
    res.json({
      env: ENV,
      port: PORT,
      alias,
      sql_user: pool.config.user,
      db_name: row.db_name,
      login_name: row.login_name,
      server_name: row.server_name,
      kind: 'visma',
      test: 'test of text',
    });
  } catch (e) {
    res.status(500).json({ detail: String(e.message || e) });
  }
});

// App-DB (Sequelize)
app.get('/api/_whoami_app', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`SELECT DB_NAME() AS db_name, @@SERVERNAME AS server_name`);
    const row = Array.isArray(rows) ? rows[0] : rows;
    res.json({
      env: ENV,
      port: PORT,
      db_name: row?.db_name,
      server_name: row?.server_name,
      kind: 'app',
    });
  } catch (e) {
    res.status(500).json({ detail: String(e.message || e) });
  }
});

/* ==== 404 & ERROR ==== */
app.use((req, res) => {
  res.status(404).json({
    message: 'API 404 från hundapoteket_api index.js',
    path: req.path
  });
});

app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.stack || err);
  res.status(500).json({ error: err.message || String(err) });
});

/* ==== START ==== */
console.log('[mount-check] mounting /api/order_assist_stock_history');
app.listen(PORT, () => {
  console.log(`🚀 Server running: http://10.10.0.13:${PORT} (ENV=${ENV})`);
});

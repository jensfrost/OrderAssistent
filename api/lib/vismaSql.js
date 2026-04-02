const sql = require('mssql');

function readJson(name, fallback = {}) {
  try { return JSON.parse(process.env[name] || '{}'); } catch { return fallback; }
}
const CREDS   = readJson('VISMA_SQL_CREDENTIALS');
const HOST    = process.env.VISMA_SQL_HOST || 'localhost';
const INST    = process.env.VISMA_SQL_INSTANCE || undefined;
const ENCRYPT = String(process.env.VISMA_SQL_ENCRYPT || 'false').toLowerCase() === 'true';
const TRUST   = String(process.env.VISMA_SQL_TRUST_CERT || 'true').toLowerCase() === 'true';

const pools = new Map();

function getAlias(req) {
  return String(req.query.alias || process.env.VISMA_ALIAS || 'FTG66').toUpperCase();
}
function configFor(alias) {
  const c = CREDS[alias];
  if (!c) throw new Error(`No SQL credentials configured for alias ${alias}`);
  return {
    user: c.user,
    password: c.pass,
    server: HOST,
    database: c.db,
    options: { encrypt: ENCRYPT, trustServerCertificate: TRUST, instanceName: INST },
  };
}
async function getPool(alias) {
  const cached = pools.get(alias);
  if (cached?.connected) return cached;
  const pool = new sql.ConnectionPool(configFor(alias));
  pool.on('error', e => console.error(`MSSQL pool error [${alias}]`, e));
  await pool.connect();
  pools.set(alias, pool);
  return pool;
}

module.exports = { getAlias, getPool };

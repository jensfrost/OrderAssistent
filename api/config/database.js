// api/config/database.js
const { Sequelize } = require('sequelize');

function bool(v, def) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y'].includes(s);
}

// Hämta env (stöd både DB_* och SQL_*)
const host        = process.env.DB_HOST        || process.env.SQL_SERVER || 'localhost';
const database    = process.env.DB_NAME        || process.env.SQL_DB;
const username    = process.env.DB_USER        || process.env.SQL_USER   || '';
const password    = process.env.DB_PASS        || process.env.SQL_PASSWORD || '';
const instance    = process.env.DB_INSTANCE    || process.env.SQL_INSTANCE || '';
const portEnv     = process.env.DB_PORT        || process.env.SQL_PORT;
const port        = portEnv ? Number(portEnv) : undefined;

// Kryptering (rekommenderat på)
const encrypt     = bool(process.env.SQL_ENCRYPT, true);
const trustCert   = bool(process.env.SQL_TRUST_CERT, true);

// Bygg options
const dialectOptions = {
  options: {
    encrypt,
    trustServerCertificate: trustCert,
    // IMPORTANT: sätt *antingen* instanceName *eller* port (inte båda)
    ...(instance ? { instanceName: instance } : {})
  }
};

const sequelize = new Sequelize(database, username, password, {
  host,
  dialect: 'mssql',
  // använd port endast om INGEN instans är angiven
  ...(instance ? {} : (port ? { port } : {})),
  dialectOptions,
  logging: false,
  pool: { max: 10, min: 0, idle: 10000, acquire: 30000 },
});

module.exports = sequelize;

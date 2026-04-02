// routes/whoami.js
const express = require('express');
const router = express.Router();

function mask(v) {
  if (!v) return null;
  const s = String(v);
  if (s.length <= 12) return s;
  return s.slice(0, 4) + '...' + s.slice(-8);
}

router.get('/_whoami', (req, res) => {
  res.json({
    APP_ENV: process.env.APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    DB_HOST: process.env.DB_HOST || process.env.SQLSERVER_HOST,
    DB_NAME: process.env.DB_NAME || process.env.SQLSERVER_DB || process.env.POSTGRES_DB,
    DB_URL_LAST: mask(process.env.DB_URL || process.env.DATABASE_URL || process.env.SQLSERVER_URL),
    TIME: new Date().toISOString(),
  });
});

module.exports = router;

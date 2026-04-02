// api/routes/print-zpl.js
const express = require('express');
const net = require('net');

function textPlain(req, _res, next) {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', c => (data += c));
  req.on('end', () => { req.body = data; next(); });
}

function sendTo9100(ip, port, data) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    sock.setTimeout(5000);
    sock
      .connect(port, ip, () => sock.write(data, 'utf8', () => sock.end()))
      .on('close', resolve)
      .on('error', reject)
      .on('timeout', () => {
        sock.destroy(new Error('Timeout to printer'));
        reject(new Error('Timeout to printer'));
      });
  });
}

// ⬇️ Exportera en FABRIK som returnerar en Express-router
module.exports = function buildPrintRouter() {
  const router = express.Router();

  // logga alla requests som träffar denna router
  router.use((req, _res, next) => {
    console.log('[print-zpl] hit', req.method, req.path);
    next();
  });

  // GET /api/print/health
  router.get('/health', (_req, res) => {
    res.type('text/plain').send('OK');
  });

  // POST /api/print/zpl?ip=1.2.3.4&port=9100
  router.post('/zpl', textPlain, async (req, res) => {
    try {
      const ZPL = String(req.body || '');
      if (!ZPL.trim()) return res.status(400).send('Missing ZPL');

      const host = (req.query.host || req.query.ip || process.env.PRINTER_ZPL_HOST || process.env.PRINTER_ZP);
      const port = Number(req.query.port || process.env.PRINTER_ZPL_PORT || 9100);
      if (!host) return res.status(400).send('No printer IP configured');

      console.log('[print-zpl] sending', ZPL.length, 'bytes to', host, port);
      await sendTo9100(String(host), port, ZPL);
      res.send('OK');
    } catch (e) {
      res.status(500).send(e?.message || String(e));
    }
  });

  return router;
};

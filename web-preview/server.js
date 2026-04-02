// C:\Hundapoteket\web-preview\server.js
const express = require('express');
const path = require('path');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 8082;
const DIST = process.env.DIST || path.join(__dirname, 'dist');

app.disable('x-powered-by');
app.use(compression());

// Servera statiska filer först (utan att auto-skicka index)
app.use(express.static(DIST, {
  index: false,
  maxAge: '1h',
  setHeaders: (res, p) => {
    if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));

// SPA fallback – fånga ALLT utan stjärnroute (ingen path-to-regexp parsing)
app.use((req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[web-preview] listening on http://0.0.0.0:${PORT} serving ${DIST}`);
});

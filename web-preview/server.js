// C:\Hundapoteket\web-preview\server.js
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 8082;
const DIST = process.env.DIST || path.join(__dirname, 'dist');
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:3002';

app.disable('x-powered-by');
app.use(compression());

app.get('/__preview_probe', (req, res) => {
  res.json({
    ok: true,
    route: '__preview_probe',
    port: PORT,
    dist: DIST,
    apiTarget: API_TARGET,
    ts: new Date().toISOString(),
  });
});

app.get('/api/__preview_probe', (req, res) => {
  res.json({
    ok: true,
    route: 'api/__preview_probe',
    port: PORT,
    dist: DIST,
    apiTarget: API_TARGET,
    ts: new Date().toISOString(),
  });
});

app.use('/api', (req, res) => {
  const targetUrl = new URL(req.originalUrl, API_TARGET);
  const client = targetUrl.protocol === 'https:' ? https : http;

  console.log('[web-preview] proxy', req.method, req.originalUrl, '->', targetUrl.toString());

  const proxyReq = client.request(
    targetUrl,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: targetUrl.host,
      },
    },
    (proxyRes) => {
      res.status(proxyRes.statusCode || 502);

      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (value !== undefined) {
          res.setHeader(key, value);
        }
      }

      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    console.error('[web-preview] api proxy error', {
      url: targetUrl.toString(),
      message: error.message,
    });

    if (!res.headersSent) {
      res.status(502).json({
        error: 'preview_api_proxy_failed',
        target: targetUrl.toString(),
        message: error.message,
      });
    }
  });

  req.pipe(proxyReq);
});

app.use('/api', (req, res) => {
  res.status(502).json({
    error: 'preview_api_route_not_proxied',
    path: req.originalUrl,
  });
});

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

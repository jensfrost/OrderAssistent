const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

function resolveAppRoot() {
  // api/index.js ligger i /OrderAssistent/api
  // då blir appen i /OrderAssistent/app/raw-reorder-app
  return path.resolve(__dirname, '..', '..', 'app', 'raw-reorder-app');
}

function findApk(env) {
  const appRoot = resolveAppRoot();

  const candidates = {
    dev: [
      path.join(appRoot, 'android', 'app', 'build', 'outputs', 'apk', 'dev', 'release', 'app-dev-release.apk'),
      path.join(appRoot, 'android', 'app', 'build', 'outputs', 'apk', 'devRelease', 'app-dev-release.apk'),
    ],
    preview: [
      path.join(appRoot, 'android', 'app', 'build', 'outputs', 'apk', 'preview', 'release', 'app-preview-release.apk'),
      path.join(appRoot, 'android', 'app', 'build', 'outputs', 'apk', 'previewRelease', 'app-preview-release.apk'),
    ],
    prod: [
      path.join(appRoot, 'android', 'app', 'build', 'outputs', 'apk', 'prod', 'release', 'app-prod-release.apk'),
      path.join(appRoot, 'android', 'app', 'build', 'outputs', 'apk', 'prodRelease', 'app-prod-release.apk'),
      path.join(appRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
    ],
  };

  const envCandidates = candidates[env] || candidates.dev;
  const filePath = envCandidates.find(p => fs.existsSync(p));

  if (!filePath) {
    return null;
  }

  const stat = fs.statSync(filePath);

  return {
    env,
    filePath,
    size: stat.size,
    mtime: stat.mtime,
    fileName:
      env === 'preview'
        ? 'orderassistent-preview.apk'
        : env === 'prod'
          ? 'orderassistent.apk'
          : 'orderassistent-dev.apk',
  };
}

router.get('/android/apk', (req, res) => {
  const env = String(req.query.env || 'dev').toLowerCase();
  const apk = findApk(env);

  if (!apk) {
    return res.status(404).json({
      error: 'APK not found',
      env,
    });
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${apk.fileName}"`);
  res.setHeader('Content-Length', String(apk.size));

  return res.sendFile(apk.filePath);
});

router.get('/android/manifest', (req, res) => {
  const env = String(req.query.env || 'dev').toLowerCase();
  const apk = findApk(env);

  if (!apk) {
    return res.status(404).json({
      error: 'APK not found for manifest',
      env,
    });
  }

  const versionCode = Math.floor(apk.mtime.getTime() / 1000);
  const versionName = apk.mtime.toISOString().slice(0, 19).replace('T', ' ');

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.json({
    versionName,
    versionCode,
    apkUrl: `${baseUrl}/api/install/android/apk?env=${encodeURIComponent(env)}`,
    env,
    notes: `${env} build for OrderAssistent`,
    date: apk.mtime.toISOString(),
    file: `${baseUrl}/api/install/android/apk?env=${encodeURIComponent(env)}`,
  });
});

router.get('/android/check', (req, res) => {
  const env = String(req.query.env || 'dev').toLowerCase();
  const apk = findApk(env);

  res.json({
    ok: !!apk,
    env,
    apk,
  });
});

module.exports = router;
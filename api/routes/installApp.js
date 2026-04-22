const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

function resolveAppRoot() {
  // api/index.js ligger i /OrderAssistent/api
  // då blir appen i /OrderAssistent/app/raw-reorder-app
  return path.resolve(__dirname, '..', '..', 'app', 'raw-reorder-app');
}

function resolveOrderAssistRoot() {
  return path.resolve(__dirname, '..', '..');
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readVersionInfo() {
  const appRoot = resolveAppRoot();
  const versionPath = path.join(appRoot, 'version.android.json');
  const version = readJson(versionPath) || {};

  return {
    versionName: String(version.versionName || '1.0.0'),
    versionCode: Number(version.versionCode || 1),
  };
}

function versionedFileName(env, versionName, versionCode) {
  return `orderassistent-${env}-${versionName}-vc${versionCode}.apk`;
}

function findPublishedApk(env) {
  const appRoot = resolveAppRoot();
  const orderAssistRoot = resolveOrderAssistRoot();
  const downloadDirs = [
    path.join(orderAssistRoot, 'web-preview', 'dist', 'downloads', env),
    path.join(appRoot, 'public', 'downloads', env),
  ];

  for (const dir of downloadDirs) {
    if (!fs.existsSync(dir)) continue;

    const manifest = readJson(path.join(dir, 'android.json'));
    const manifestFileName = manifest?.file ? path.basename(String(manifest.file)) : '';
    const latestFileName = `orderassistent-${env}-latest.apk`;
    const versionedApks = fs
      .readdirSync(dir)
      .filter((name) =>
        /^orderassistent-.+\.apk$/i.test(name) &&
        !/-latest\.apk$/i.test(name)
      )
      .map((name) => path.join(dir, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    const candidates = [
      manifestFileName ? path.join(dir, manifestFileName) : '',
      path.join(dir, latestFileName),
      ...versionedApks,
    ].filter(Boolean);

    const filePath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!filePath) continue;

    const stat = fs.statSync(filePath);
    const fallbackVersion = readVersionInfo();
    const versionName = String(manifest?.versionName || fallbackVersion.versionName);
    const versionCode = Number(manifest?.versionCode || fallbackVersion.versionCode);

    return {
      env,
      filePath,
      size: stat.size,
      mtime: stat.mtime,
      versionName,
      versionCode,
      sha256: manifest?.sha256 || null,
      notes: manifest?.notes || `${env} build for OrderAssistent`,
      date: manifest?.date || stat.mtime.toISOString(),
      fileName: versionedFileName(env, versionName, versionCode),
    };
  }

  return null;
}

function findGradleApk(env) {
  const appRoot = resolveAppRoot();
  const version = readVersionInfo();

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
    versionName: version.versionName,
    versionCode: version.versionCode,
    sha256: null,
    notes: `${env} build for OrderAssistent`,
    date: stat.mtime.toISOString(),
    fileName: versionedFileName(env, version.versionName, version.versionCode),
  };
}

function findApk(env) {
  return findPublishedApk(env) || findGradleApk(env);
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

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.json({
    versionName: apk.versionName,
    versionCode: apk.versionCode,
    apkUrl: `${baseUrl}/api/install/android/apk?env=${encodeURIComponent(env)}`,
    env,
    notes: apk.notes,
    date: apk.date,
    fileName: apk.fileName,
    sha256: apk.sha256,
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

// scripts/bump-android-version.js
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const versionFile = path.join(repoRoot, 'version.android.json');
const gradleFile = path.join(repoRoot, 'android', 'app', 'build.gradle');

function bumpPatch(versionName) {
  const [major, minor, patch] = String(versionName || '1.0.0')
    .split('.')
    .map((n) => parseInt(n || '0', 10));

  return `${major}.${minor}.${(patch || 0) + 1}`;
}

if (!fs.existsSync(versionFile)) {
  throw new Error(`Missing version file: ${versionFile}`);
}

const current = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
let { versionName, versionCode } = current;

versionName = bumpPatch(versionName);
versionCode = (Number(versionCode) || 0) + 1;

fs.writeFileSync(
  versionFile,
  JSON.stringify({ versionName, versionCode }, null, 2) + '\n',
  'utf8'
);

console.log(`New Android version: ${versionName} (versionCode ${versionCode})`);

if (!fs.existsSync(gradleFile)) {
  throw new Error(`Missing Gradle file: ${gradleFile}`);
}

let gradle = fs.readFileSync(gradleFile, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/g, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/g, `versionName "${versionName}"`);
fs.writeFileSync(gradleFile, gradle, 'utf8');

console.log('Updated android/app/build.gradle with new versionName/versionCode');

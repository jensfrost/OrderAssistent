import type { ExpoConfig } from 'expo/config';
import { config as loadEnv } from 'dotenv';
import path from 'path';
import fs from 'fs';

const explicitEnv =
  process.env.EXPO_PUBLIC_ENV ||
  process.env.EAS_BUILD_PROFILE ||
  process.env.APP_ENV ||
  '';

const initialEnv = (explicitEnv || 'dev').toLowerCase();

const envFileMap = {
  prod: '.env.production',
  preview: '.env.preview',
  dev: '.env.development',
} as const;

loadEnv({
  path: path.resolve(
    __dirname,
    envFileMap[initialEnv as keyof typeof envFileMap] ?? '.env.development'
  ),
  override: true,
});

const mapEnv = (raw: string) => {
  if (!raw) return 'dev';
  const v = raw.toLowerCase();
  if (['prod', 'production'].includes(v)) return 'prod';
  if (['preview', 'pre', 'staging', 'beta', 'qa'].includes(v)) return 'preview';
  return 'dev';
};

const envName = mapEnv(
  (process.env.EXPO_PUBLIC_ENV ||
    process.env.EAS_BUILD_PROFILE ||
    process.env.APP_ENV ||
    initialEnv).toLowerCase()
) as 'prod' | 'preview' | 'dev';

const isProd = envName === 'prod';
const isPreview = envName === 'preview';
const isDev = envName === 'dev';

const DEV_ICON = './assets/images/icon-dev.png';
const PREVIEW_ICON = './assets/images/icon-preview.png';
const PROD_ICON = './assets/images/icon-prod.png';

const ICON_PATH = isPreview ? PREVIEW_ICON : isProd ? PROD_ICON : DEV_ICON;
const absIcon = path.resolve(__dirname, ICON_PATH);

console.log(`[app.config] ENV=${envName} ICON=${ICON_PATH} → ${absIcon}`);

if (!fs.existsSync(absIcon)) {
  throw new Error(`[app.config] Icon file not found: ${absIcon}`);
}

const currentManifestUrl =
  isPreview
    ? process.env.EXPO_PUBLIC_ANDROID_MANIFEST_URL_PREVIEW || ''
    : isProd
      ? process.env.EXPO_PUBLIC_ANDROID_MANIFEST_URL_PROD || ''
      : process.env.EXPO_PUBLIC_ANDROID_MANIFEST_URL_DEV || '';

const currentApkUrl =
  isPreview
    ? process.env.EXPO_PUBLIC_ANDROID_APK_URL_PREVIEW || ''
    : isProd
      ? process.env.EXPO_PUBLIC_ANDROID_APK_URL_PROD || ''
      : process.env.EXPO_PUBLIC_ANDROID_APK_URL_DEV || '';

const currentPlayUrl =
  isPreview
    ? process.env.EXPO_PUBLIC_ANDROID_PLAY_URL_PREVIEW || ''
    : isProd
      ? process.env.EXPO_PUBLIC_ANDROID_PLAY_URL_PROD || ''
      : process.env.EXPO_PUBLIC_ANDROID_PLAY_URL_DEV || '';

const versionFilePath = path.resolve(__dirname, 'version.android.json');

const versionInfo = fs.existsSync(versionFilePath)
  ? JSON.parse(fs.readFileSync(versionFilePath, 'utf8'))
  : { versionName: '1.0.0', versionCode: 1 };

const appVersion = String(versionInfo.versionName || '1.0.0');
const androidVersionCode = Number(versionInfo.versionCode || 1);

const config: ExpoConfig = {
  name: isProd
    ? 'OrderAssistent'
    : isPreview
      ? 'OrderAssistent (PREVIEW)'
      : 'OrderAssistent (DEV)',
  slug: 'raw-reorder-app',
  version: appVersion,
  orientation: 'portrait',
  platforms: ['ios', 'android', 'web'],

  icon: ICON_PATH,

  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },

  ios: {
    supportsTablet: true,
    bundleIdentifier: isProd
      ? 'com.jens.rawreorderapp'
      : isPreview
        ? 'com.jens.rawreorderapp.preview'
        : 'com.jens.rawreorderapp.dev',
    icon: ICON_PATH,
  },

  android: {
    package: isProd
      ? 'com.jens.rawreorderapp'
      : isPreview
        ? 'com.jens.rawreorderapp.preview'
        : 'com.jens.rawreorderapp.dev',
    versionCode: androidVersionCode,

    icon: ICON_PATH,

    adaptiveIcon: {
      foregroundImage: ICON_PATH,
      backgroundColor: isDev
        ? '#ff0000'
        : isPreview
          ? '#ffff00'
          : '#00a000',
    },

    usesCleartextTraffic: true,
    predictiveBackGestureEnabled: false,
  },

  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },

  plugins: [
    'expo-secure-store',
  ],

  extra: {
    ENV: envName,
    EXPO_PUBLIC_ENV: envName,

    API_BASE: process.env.EXPO_PUBLIC_API_BASE || '',
    API_PREFIX: process.env.EXPO_PUBLIC_API_PREFIX || 'api',

    EXPO_PUBLIC_API_BASE: process.env.EXPO_PUBLIC_API_BASE || '',
    EXPO_PUBLIC_API_PREFIX: process.env.EXPO_PUBLIC_API_PREFIX || 'api',

    EXPO_PROJECT_URL: process.env.EXPO_PROJECT_URL || '',

    CURRENT_ANDROID_MANIFEST_URL: currentManifestUrl,
    CURRENT_ANDROID_APK_URL: currentApkUrl,
    CURRENT_ANDROID_PLAY_URL: currentPlayUrl,
  },
};

export default (): ExpoConfig => config;

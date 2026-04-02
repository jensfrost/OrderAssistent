import type { ExpoConfig } from 'expo/config';
import { config as loadEnv } from 'dotenv';
import path from 'path';

const rawEnv =
  (process.env.EXPO_PUBLIC_ENV ||
    process.env.EAS_BUILD_PROFILE ||
    process.env.APP_ENV ||
    'dev').toLowerCase();

const envName =
  rawEnv === 'preview' || rawEnv === 'pre' || rawEnv === 'staging'
    ? 'preview'
    : rawEnv === 'prod' || rawEnv === 'production'
      ? 'prod'
      : 'dev';

const envFile =
  envName === 'preview'
    ? '.env.preview'
    : envName === 'prod'
      ? '.env.production'
      : '.env.development';

loadEnv({
  path: path.resolve(__dirname, envFile),
  override: true,
});

console.log('[app.config] envName =', envName);
console.log('[app.config] envFile =', envFile);
console.log('[app.config] EXPO_PUBLIC_API_BASE =', process.env.EXPO_PUBLIC_API_BASE);
console.log('[app.config] EXPO_PUBLIC_API_PREFIX =', process.env.EXPO_PUBLIC_API_PREFIX);

const pick = (key: string, fallback?: string) => {
  const value = process.env[key];
  return value == null || value === '' ? fallback : value;
};

const stripTrailingSlash = (value?: string) => (value || '').replace(/\/+$/, '');
const stripSlashesAround = (value?: string) => (value || '').replace(/^\/+|\/+$/g, '');

const API_BASE = stripTrailingSlash(pick('EXPO_PUBLIC_API_BASE', ''));
const API_PREFIX = stripSlashesAround(pick('EXPO_PUBLIC_API_PREFIX', 'api'));

if (!API_BASE) {
  throw new Error(`Missing EXPO_PUBLIC_API_BASE in ${envFile}`);
}

const config: ExpoConfig = {
  name:
    envName === 'preview'
      ? 'raw-reorder-app (PREVIEW)'
      : envName === 'prod'
        ? 'raw-reorder-app'
        : 'raw-reorder-app (DEV)',
  slug: 'raw-reorder-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',

  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },

  ios: {
    supportsTablet: true,
    bundleIdentifier:
      envName === 'preview'
        ? 'com.jens.rawreorderapp.preview'
        : envName === 'prod'
          ? 'com.jens.rawreorderapp'
          : 'com.jens.rawreorderapp.dev',
  },

  android: {
    package:
      envName === 'preview'
        ? 'com.jens.rawreorderapp.preview'
        : envName === 'prod'
          ? 'com.jens.rawreorderapp'
          : 'com.jens.rawreorderapp.dev',
    adaptiveIcon: {
      backgroundColor:
        envName === 'preview'
          ? '#FFF59D'
          : envName === 'prod'
            ? '#E6F4FE'
            : '#FFCDD2',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    usesCleartextTraffic: true,
  },

  web: {
    favicon: './assets/favicon.png',
  },

  extra: {
    ENV: envName,
    EXPO_PUBLIC_ENV: envName,
    API_BASE,
    API_PREFIX,
  },
};

export default config;
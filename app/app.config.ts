import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const appEnv =
  process.env.EXPO_PUBLIC_ENV ||
  process.env.APP_ENV ||
  process.env.NODE_ENV ||
  'dev';

const envMap: Record<string, string> = {
  dev: '.env.development',
  development: '.env.development',
  preview: '.env.preview',
  prod: '.env.production',
  production: '.env.production',
};

const envFile = envMap[appEnv] || '.env.development';
const envPath = path.resolve(__dirname, envFile);

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

export default ({ config }: { config: any }) => ({
  ...config,
  extra: {
    EXPO_PUBLIC_ENV: appEnv,
    EXPO_PUBLIC_API_BASE: process.env.EXPO_PUBLIC_API_BASE,
    EXPO_PUBLIC_API_PREFIX: process.env.EXPO_PUBLIC_API_PREFIX,
    VISMA_API_BASE: process.env.VISMA_API_BASE,
    VISMA_ALIAS: process.env.VISMA_ALIAS,
    API_BASE: process.env.EXPO_PUBLIC_API_BASE,
    WOO_BASE_URL: process.env.WOO_BASE_URL || 'https://www.aveo.se',
    WOO_THUMBS_SIZE: process.env.WOO_THUMBS_SIZE || 'woocommerce_thumbnail',
    WOO_INCLUDE_PLACEHOLDER: process.env.WOO_INCLUDE_PLACEHOLDER || '1',
    LABEL_MODE: 'zpl',
    PRINT_BACKEND: 'http://10.10.0.13:3000/api',
  },
});
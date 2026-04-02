import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const API_BASE = String(extra.API_BASE || '').replace(/\/+$/, '');
const API_PREFIX = String(extra.API_PREFIX || 'api').replace(/^\/+|\/+$/g, '');

if (!API_BASE) {
  throw new Error('Missing API_BASE in Expo config');
}

export const APP_ENV = extra.EXPO_PUBLIC_ENV || extra.ENV || 'dev';
export const API_ROOT = `${API_BASE}/${API_PREFIX}`;

export function buildApiUrl(path: string): string {
  const cleanPath = String(path).replace(/^\/+/, '');
  return `${API_ROOT}/${cleanPath}`;
}
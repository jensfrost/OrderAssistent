import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = (
  (Constants as any)?.expoConfig?.extra ??
  (Constants as any)?.manifest2?.extra ??
  (Constants as any)?.manifest?.extra ??
  {}
) as Record<string, string>;

const API_BASE = String(
  extra.API_BASE ||
  extra.EXPO_PUBLIC_API_BASE ||
  ''
).replace(/\/+$/, '');

const API_PREFIX = String(
  extra.API_PREFIX ||
  extra.EXPO_PUBLIC_API_PREFIX ||
  'api'
).replace(/^\/+|\/+$/g, '');

export const APP_ENV =
  extra.EXPO_PUBLIC_ENV ||
  extra.ENV ||
  'dev';

const USE_RELATIVE_WEB_API = Platform.OS === 'web' && APP_ENV === 'preview';

console.log('[CONFIG] extra =', extra);
console.log('[CONFIG] API_BASE =', API_BASE);
console.log('[CONFIG] API_PREFIX =', API_PREFIX);
console.log('[CONFIG] APP_ENV =', APP_ENV);
console.log('[CONFIG] USE_RELATIVE_WEB_API =', USE_RELATIVE_WEB_API);

if (!USE_RELATIVE_WEB_API && !API_BASE) {
  throw new Error('Missing API_BASE in Expo config');
}

export const API_ROOT = USE_RELATIVE_WEB_API
  ? (API_PREFIX ? `/${API_PREFIX}` : '')
  : (API_PREFIX ? `${API_BASE}/${API_PREFIX}` : API_BASE);

console.log('[CONFIG] API_ROOT =', API_ROOT);

export function buildApiUrl(path: string): string {
  const cleanPath = String(path).replace(/^\/+/, '');
  const url = `${API_ROOT}/${cleanPath}`;
  console.log('[CONFIG] buildApiUrl ->', url);
  return url;
}

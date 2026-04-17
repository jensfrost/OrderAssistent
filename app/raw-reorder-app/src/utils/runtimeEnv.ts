// app/HundapoteketApp/utils/runtimeEnv.ts
import { Platform } from 'react-native';
import Constants from 'expo-constants';

type EnvName = 'dev' | 'preview' | 'prod';

const ENV_KEYS: Record<EnvName, string[]> = {
  dev: ['EXPO_PUBLIC_API_BASE_DEV', 'API_BASE_DEV'],
  preview: ['EXPO_PUBLIC_API_BASE_PREVIEW', 'API_BASE_PREVIEW'],
  prod: [
    'EXPO_PUBLIC_API_BASE_PROD',
    'API_BASE_PROD',
    // “generella” får bara användas när vi verkligen är prod
    'EXPO_PUBLIC_API_BASE',
    'API_BASE',
  ],
};

function readExtra(): Record<string, any> {
  return (
    (Constants as any)?.expoConfig?.extra ??
    (Constants as any)?.manifest?.extra ??
    {}
  );
}

export function detectRuntimeEnv(): EnvName {
  const extra = readExtra();

  // 1) Android package – här har du suffixen i Gradle
  const androidPkg: string | undefined = (Constants as any)?.android?.package;
  if (androidPkg?.endsWith('.dev')) return 'dev';
  if (androidPkg?.endsWith('.preview')) return 'preview';

  // 2) iOS bundle
  const iosBundle: string | undefined =
    (Constants as any)?.expoConfig?.ios?.bundleIdentifier ??
    (Constants as any)?.manifest?.ios?.bundleIdentifier;
  if (iosBundle?.endsWith('.dev')) return 'dev';
  if (iosBundle?.endsWith('.preview')) return 'preview';

  // 3) Web / process.env
  const fromProc = (process.env.EXPO_PUBLIC_ENV || process.env.NODE_ENV || '').toLowerCase();
  if (fromProc === 'dev' || fromProc === 'development') return 'dev';
  if (fromProc === 'preview') return 'preview';
  if (fromProc === 'prod' || fromProc === 'production') return 'prod';

  // 4) extra
  const fromExtra = (extra.ENV || extra.env || '').toLowerCase();
  if (fromExtra === 'dev') return 'dev';
  if (fromExtra === 'preview') return 'preview';
  if (fromExtra === 'prod') return 'prod';

  // sista utvägen
  return 'prod';
}

function pickFirstDefined(src: Record<string, any>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = src[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

export function getApiBaseForEnv(env: EnvName): string {
  const extra = readExtra();
  const proc: Record<string, any> = (process.env as any) || {};
  const candidates = ENV_KEYS[env];

  const fromProc = pickFirstDefined(proc, candidates);
  if (fromProc) return fromProc;

  const fromExtra = pickFirstDefined(extra, candidates);
  if (fromExtra) return fromExtra;

  // här får vi INTE gissa prod
  throw new Error(
    `[runtimeEnv] No API base configured for env="${env}". Define one of: ${candidates.join(
      ', '
    )} in app.config/app.json (extra) or in process.env.`
  );
}

export function getRuntimeConfig() {
  const env = detectRuntimeEnv();
  const apiBase = getApiBaseForEnv(env);
  return { env, apiBase };
}

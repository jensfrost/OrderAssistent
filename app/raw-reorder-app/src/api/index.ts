// app/HundapoteketApp/api/index.ts

console.log(
  '%c[api/index] BUILD ID vTRACE-4',
  'background:#673ab7;color:#fff;padding:2px 6px;border-radius:4px'
);

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';

/**
 * Extra från Expo (finns i web/export och i native om du satt det i app.json/app.config.js)
 * Vi förutsätter att du kan lägga:
 *  extra: {
 *    ENV: "dev" | "preview" | "prod",
 *    API_BASE_DEV: "...",
 *    API_BASE_PREVIEW: "...",
 *    API_BASE_PROD: "...",
 *    VISMA_API_BASE_DEV: "...",
 *    ...
 *  }
 */
const extra: any =
  (Constants as any)?.expoConfig?.extra ??
  (Constants as any)?.manifest?.extra ??
  {};

/* ───────────────────── Helpers ───────────────────── */

const stripTrailingSlash = (s?: string | null) =>
  (s ?? '').toString().replace(/\/+$/, '');

const stripBothSlashes = (s?: string | null) =>
  (s ?? '').toString().replace(/^\/+|\/+$/g, '');

const isAbsoluteUrl = (s: string) => /^https?:\/\//i.test(s);

/**
 * Om vi har en full URL → ta origin (https://host:port)
 * Om inte, men vi kör i webbläsare → ta window.location.origin
 * Annars: tom sträng (native får ha absolut base i env)
 */
function baseOriginFrom(u?: string | null): string {
  const v = (u ?? '').toString();
  if (v) {
    try {
      const url = new URL(v);
      return `${url.protocol}//${url.host}`;
    } catch {
      // kunde inte parsa – försök ändå klippa bort /api/...
      return stripTrailingSlash(v.replace(/\/api\/?.*$/i, ''));
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

/* ───────────────────── ENV-resolution ───────────────────── */

/**
 * Samma env som resten av appen ska använda.
 * Ordning:
 *  1) extra.ENV
 *  2) EXPO_PUBLIC_ENV
 *  3) "dev"
 */
function resolveEnv(): 'dev' | 'preview' | 'prod' {
  const fromExtra = (extra?.ENV ?? '').toString().trim().toLowerCase();
  const fromEnv = (process.env.EXPO_PUBLIC_ENV ?? '')
    .toString()
    .trim()
    .toLowerCase();
  const env = (fromExtra || fromEnv || 'dev') as 'dev' | 'preview' | 'prod';
  return env;
}
const RUNTIME_ENV = resolveEnv();

const isProdLike = () => RUNTIME_ENV === 'prod';

/**
 * Hämta miljöspecifikt värde från process.env eller från extra.
 * Exempel:
 *   readEnvUrl('EXPO_PUBLIC_API_BASE')  → letar efter EXPO_PUBLIC_API_BASE_DEV om env=dev
 *   readEnvUrl('API_BASE')              → letar efter API_BASE_DEV i extra om env=dev
 */
function readEnvUrl(baseKey: string): string | undefined {
  const envUpper = RUNTIME_ENV.toUpperCase();

  // 1) extra.<KEY>_<ENV>
  const fromExtraSpecific = extra[`${baseKey}_${envUpper}`];

  // 2) process.env.<KEY>_<ENV>
  const fromProcEnvSpecific =
    process.env[`${baseKey}_${envUpper}` as keyof typeof process.env];

  // 3) extra.<KEY>
  const fromExtraGeneric = extra[baseKey];

  // 4) process.env.<KEY>
  const fromProcGeneric =
    process.env[baseKey as keyof typeof process.env];

  return (
    (fromExtraSpecific as string) ||
    (fromProcEnvSpecific as string) ||
    (fromExtraGeneric as string) ||
    (fromProcGeneric as string) ||
    undefined
  );
}

/* ───────────────────── Baser (nu miljö-styrda) ───────────────────── */

/**
 * API-bas: vi försöker få ett DEV/PREVIEW/PROD-specifikt värde först.
 * Om du alltså bygger preview-webben med
 *  EXPO_PUBLIC_API_BASE_PREVIEW=https://preview-api...
 * så kommer APK/webben verkligen prata med den och inte råka ta PRODUCTION.
 */
let _apiBase = stripTrailingSlash(
  readEnvUrl('EXPO_PUBLIC_API_BASE') ||
    readEnvUrl('API_BASE') ||
    '' // kan bli tom i lokal native -> då faller vi på origin i baseOriginFrom()
);

/**
 * Prefix för alla "vanliga" endpoints, t.ex. /api/rawReg
 * Går också att sätta per miljö om du vill: API_PREFIX_DEV, EXPO_PUBLIC_API_PREFIX_DEV, osv.
 */
let _apiPrefix =
  stripBothSlashes(
    readEnvUrl('EXPO_PUBLIC_API_PREFIX') ||
      readEnvUrl('API_PREFIX') ||
      ''
  ) || 'api';

/**
 * VISMA-bas: behåller som metadata/fallback, men vi låter den OCKSÅ bli miljöspecifik
 */
let _vismaBase = stripTrailingSlash(
  readEnvUrl('EXPO_PUBLIC_VISMA_API_BASE') ||
    readEnvUrl('VISMA_API_BASE') ||
    _apiBase
);

/**
 * vi kör alltid via proxy (Node → FastAPI)
 */
const useVismaProxy = () => true;

/* ───────────────────── Visma alias-stuff ───────────────────── */

let _aliasOverride: string | null = null;
let _aliasLockOverride: boolean | null = null;
let _forceSqlOverride: boolean | null = null;

export function forceVismaAlias(alias: string, lock: boolean = true) {
  _aliasOverride = (alias || '').trim() || null;
  _aliasLockOverride = !!lock;
  console.warn('[forceVismaAlias] applied', {
    alias: _aliasOverride,
    lock: _aliasLockOverride,
  });
}
export function forceVismaForceSql(force: boolean) {
  _forceSqlOverride = !!force;
  console.warn('[forceVismaForceSql] applied', { force: _forceSqlOverride });
}

function resolveVismaAlias(): string {
  if (_aliasOverride) return _aliasOverride;
  const fromExtra = (extra?.VISMA_ALIAS ?? '').toString().trim();
  const fromEnv = (process.env.EXPO_PUBLIC_VISMA_ALIAS ?? '')
    .toString()
    .trim();
  return fromExtra || fromEnv || 'FTG1';
}
function resolveVismaAliasLock(): boolean {
  if (_aliasLockOverride != null) return _aliasLockOverride;
  const fromExtra = (extra?.VISMA_ALIAS_LOCK ?? '')
    .toString()
    .trim()
    .toLowerCase();
  const fromEnv = (process.env.EXPO_PUBLIC_VISMA_ALIAS_LOCK ?? '')
    .toString()
    .trim()
    .toLowerCase();
  const v = fromExtra || fromEnv;
  const locked = v === '1' || v === 'true' || v === 'yes';
  return locked || isProdLike();
}
function resolveVismaForceSql(): boolean {
  if (_forceSqlOverride != null) return _forceSqlOverride;
  const fromExtra = (extra?.VISMA_FORCE_SQL ?? '')
    .toString()
    .trim()
    .toLowerCase();
  const fromEnv = (process.env.EXPO_PUBLIC_VISMA_FORCE_SQL ?? '')
    .toString()
    .trim()
    .toLowerCase();
  const v = fromExtra || fromEnv;
  return v === '1' || v === 'true';
}
const isVismaPath = (u: string) =>
  /(^|\/)visma\//i.test(u.replace(/^\//, ''));

/* ───────────────────── URL-normalisering ───────────────────── */

function normalizeApiUrl(url: string): string {
  if (!url) return `/${_apiPrefix}/`;
  if (isAbsoluteUrl(url)) return url;

  const p = stripBothSlashes(_apiPrefix);
  const withSlash = url.startsWith('/') ? url : '/' + url;

  if (withSlash.startsWith(`/${p}/`)) return withSlash;

  return `/${p}${withSlash}`;
}

function normalizeVismaViaProxy(url: string): string {
  if (!url) return `/${_apiPrefix}/visma/`;
  if (isAbsoluteUrl(url)) return url;

  const p = stripBothSlashes(_apiPrefix);
  const withSlash = url.startsWith('/') ? url : '/' + url;

  if (withSlash.startsWith(`/${p}/visma/`)) return withSlash;
  if (withSlash.startsWith('/visma/')) return `/${p}${withSlash}`;

  return `/${p}/visma${withSlash}`;
}

/* ───────────────────── Axios-instanser ───────────────────── */

const DEFAULT_TIMEOUT_MS = 120000;

export const api = axios.create({
  baseURL: baseOriginFrom(_apiBase),
  timeout: DEFAULT_TIMEOUT_MS,
});

export const vismaApi = axios.create({
  // viktig punkt: samma origin, vi proxar all visma-trafik
  baseURL: baseOriginFrom(_apiBase),
  timeout: DEFAULT_TIMEOUT_MS,
});

/* ───────────────────── Wiretap/logg ───────────────────── */

function attachWiretap(inst: AxiosInstance, name: string) {
  inst.interceptors.request.use((config: AxiosRequestConfig) => {
    const base = config.baseURL || '';
    const u = config.url || '';
    console.log(`[${name}] →`, `${base}${u}`, {
      method: (config.method || 'get').toUpperCase(),
      timeout: config.timeout,
      params: config.params,
    });
    return config;
  });
  inst.interceptors.response.use(
    (res) => res,
    (err) => {
      console.log(`[${name}] ✖`, err?.message, {
        code: err?.code,
        status: err?.response?.status,
        baseURL: err?.config?.baseURL,
        url: err?.config?.url,
      });
      return Promise.reject(err);
    }
  );
}
attachWiretap(api, 'api');
attachWiretap(vismaApi, 'visma');

/* ───────────────────── Request-normalizers ───────────────────── */

function attachRequestNormalizer(
  inst: AxiosInstance,
  rewrite: (u: string) => string
) {
  inst.interceptors.request.use((config: AxiosRequestConfig) => {
    const u = config.url ?? '';
    if (u && isAbsoluteUrl(u)) return config;
    config.url = rewrite(u || '');
    return config;
  });
}

attachRequestNormalizer(api, normalizeApiUrl);
attachRequestNormalizer(vismaApi, (u) => normalizeVismaViaProxy(u));

/* ───────────────────── 401-hook ───────────────────── */

let _onUnauthorizedHandler: ((error: any) => void) | null = null;
export function onUnauthorized(cb: (error: any) => void) {
  _onUnauthorizedHandler = cb;
}
function attach401(inst: AxiosInstance) {
  inst.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err?.response?.status === 401 && _onUnauthorizedHandler) {
        try {
          _onUnauthorizedHandler(err);
        } catch {
          /* noop */
        }
      }
      return Promise.reject(err);
    }
  );
}
attach401(api);
attach401(vismaApi);

/* ───────────────────── Param-vakt för visma (alias/force_sql) ───────────────────── */

function extractAliasFromUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  try {
    const q = u.split('?')[1];
    if (!q) return undefined;
    const sp = new URLSearchParams(q);
    const v = sp.get('alias');
    return v != null && `${v}`.trim() !== '' ? (v as string) : undefined;
  } catch {
    return undefined;
  }
}
function extractAliasFromData(data: any): string | undefined {
  try {
    if (data == null) return undefined;
    if (typeof data === 'string') {
      try {
        const o = JSON.parse(data);
        return o?.alias;
      } catch {
        return undefined;
      }
    }
    if (typeof data === 'object') return (data as any).alias;
    return undefined;
  } catch {
    return undefined;
  }
}

function attachVismaAliasGuard(inst: AxiosInstance, name: string) {
  inst.interceptors.request.use((cfg) => {
    const rawUrl = cfg.url || '';
    const path = rawUrl.startsWith('/') ? rawUrl.slice(1) : rawUrl;
    if (!isVismaPath(path)) return cfg;

    const envAlias = resolveVismaAlias();
    const aliasLock = resolveVismaAliasLock();
    const envForceSql = resolveVismaForceSql();

    cfg.params ||= {};

    const beforeAlias = (cfg.params as any).alias;
    const hadExplicitAlias =
      beforeAlias != null && `${beforeAlias}`.trim() !== '';

    const stack = new Error('[alias-origin]').stack;
    console.log(`[${name}] ALIAS-GUARD (pre) →`, {
      rawUrl,
      params: { ...cfg.params },
      beforeAlias,
      hadExplicitAlias,
      envAlias,
      aliasLock,
      envForceSql,
      proxy: useVismaProxy(),
    });
    if (hadExplicitAlias && `${beforeAlias}` !== envAlias) {
      console.warn(
        `[${name}] OBS: alias satt av anropsstället: "${beforeAlias}" ≠ env "${envAlias}".` +
          (aliasLock
            ? ' (ÖVERSKRIVER p.g.a. aliasLock)'
            : ' (Lämnas orörd – kolla stacktrace)'),
      );
      console.log(`[${name}] alias-origin stack:\n${stack}`);
    }

    if (aliasLock) {
      (cfg.params as any).alias = envAlias;
    } else if (!hadExplicitAlias) {
      (cfg.params as any).alias = envAlias;
    }

    if (typeof (cfg.params as any).force_sql === 'undefined') {
      (cfg.params as any).force_sql = envForceSql ? 1 : 0;
    }

    console.log(`[${name}] ALIAS-GUARD (post) →`, {
      rawUrl,
      finalParams: { ...cfg.params },
    });

    return cfg;
  });
}
attachVismaAliasGuard(api, 'api');
attachVismaAliasGuard(vismaApi, 'visma');

/* ───────────────────── Vakt för defaults.params ───────────────────── */

function watchDefaultsParams(inst: AxiosInstance, name: string) {
  let _params: any = inst.defaults.params;
  Object.defineProperty(inst.defaults, 'params', {
    configurable: true,
    get() {
      return _params;
    },
    set(v) {
      _params = v;
      console.warn(`[${name}] ⚠ defaults.params SET`, v);
      console.warn(
        `[${name}] ⚠ defaults.params stack:\n${new Error(
          'defaults.params set'
        ).stack}`
      );
    },
  });
}
watchDefaultsParams(api, 'api');
watchDefaultsParams(vismaApi, 'visma');

/* ───────────────────── Alias-tracer (för att hitta felkällor) ───────────────────── */

function installAliasTracer(inst: AxiosInstance, name: string) {
  const origRequest = inst.request.bind(inst);
  inst.request = (config: AxiosRequestConfig) => {
    const cfg = { ...(config || {}) };
    (cfg as any).__aliasSpy = {
      callsite: new Error(`[${name}] ALIAS-SPY callsite`).stack,
      urlAlias_at_call: extractAliasFromUrl(cfg.url || ''),
      paramsAlias_at_call: cfg?.params ? (cfg.params as any).alias : undefined,
      dataAlias_at_call: extractAliasFromData(cfg?.data),
      defaultsAlias_at_call: (inst.defaults?.params as any)?.alias,
    };
    return origRequest(cfg);
  };

  inst.interceptors.request.use((cfg: AxiosRequestConfig) => {
    const spy = (cfg as any).__aliasSpy || {};
    const nowUrlAlias = extractAliasFromUrl(cfg.url || '');
    const nowParamsAlias = cfg?.params ? (cfg.params as any).alias : undefined;
    const nowDataAlias = extractAliasFromData(cfg?.data);
    const envAlias = resolveVismaAlias();

    const activeAlias =
      nowParamsAlias ??
      nowUrlAlias ??
      nowDataAlias ??
      spy.paramsAlias_at_call ??
      spy.urlAlias_at_call ??
      spy.dataAlias_at_call ??
      (inst.defaults?.params as any)?.alias;

    const where: string[] = [];
    if (nowParamsAlias != null) where.push('params');
    if (nowUrlAlias != null) where.push('url');
    if (nowDataAlias != null) where.push('data');
    if (spy.paramsAlias_at_call != null) where.push('params(call)');
    if (spy.urlAlias_at_call != null) where.push('url(call)');
    if (spy.dataAlias_at_call != null) where.push('data(call)');
    if ((inst.defaults?.params as any)?.alias != null)
      where.push('defaults.params');

    const rawUrl = cfg.url || '';
    const path = rawUrl.startsWith('/') ? rawUrl.slice(1) : rawUrl;
    const isVisma = /(^|\/)visma\//i.test(path);
    if (!isVisma) return cfg;

    const payload = {
      rawUrl,
      where,
      nowUrlAlias,
      nowParamsAlias,
      nowDataAlias,
      envAlias,
      activeAlias,
      defaultsAlias_now: (inst.defaults?.params as any)?.alias,
      proxy: useVismaProxy(),
    };

    if (activeAlias && `${activeAlias}` !== `${envAlias}`) {
      console.warn(`[${name}] 🔎 ALIAS-TRACE MISMATCH`, payload);
      if (spy.callsite) console.warn(`[${name}] 🔎 ALIAS-TRACE callsite\n${spy.callsite}`);
    } else {
      console.log(`[${name}] 🔎 ALIAS-TRACE`, payload);
    }
    return cfg;
  });
}
installAliasTracer(api, 'api');
installAliasTracer(vismaApi, 'visma');

/* ───────────────────── Extra debug-interceptors ───────────────────── */

api.interceptors.request.use((cfg) => {
  console.log('[REQ PARAMS][api.pre]', {
    url: cfg.url,
    params: cfg.params,
  });
  return cfg;
});

vismaApi.interceptors.request.use((cfg) => {
  console.log('[REQ PARAMS][visma.pre]', {
    url: cfg.url,
    params: cfg.params,
  });
  return cfg;
});

// recReg-loggarna får vara kvar
api.interceptors.request.use((cfg) => {
  const url = (cfg.url || '').toString();
  if (
    /\/recReg\b/i.test(url) &&
    String(cfg.method || 'get').toLowerCase() === 'post'
  ) {
    let data: any = cfg.data;
    try {
      data = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {}
    console.log('[recReg][REQUEST]', { url: (cfg.baseURL || '') + url, data });
  }
  return cfg;
});
api.interceptors.response.use(undefined, (err) => {
  const url = (err?.config?.url || '').toString();
  if (/\/recReg\b/i.test(url)) {
    console.log('[recReg][ERROR]', {
      status: err?.response?.status,
      data: err?.response?.data,
    });
  }
  return Promise.reject(err);
});

/* ───────────────────── Publika helpers ───────────────────── */

export function setAuthToken(token: string | null) {
  const apply = (inst: AxiosInstance, name: string) => {
    if (token && token.trim()) {
      inst.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      console.log(`[${name}] auth -> set (Bearer …)`);
    } else {
      delete inst.defaults.headers.common['Authorization'];
      console.log(`[${name}] auth -> cleared`);
    }
  };
  apply(api, 'api');
  apply(vismaApi, 'visma');
}

export function setApiBase(url: string) {
  _apiBase = stripTrailingSlash(url);
  const newOrigin = baseOriginFrom(_apiBase);

  api.defaults.baseURL = newOrigin;
  vismaApi.defaults.baseURL = newOrigin;

  console.log('[api] baseURL ->', api.defaults.baseURL);
  console.log(
    '[vismaApi] baseURL ->',
    vismaApi.defaults.baseURL,
    'proxy =',
    useVismaProxy()
  );
}

/**
 * Detta uppdaterar bara fallbacken till FastAPI, inte vismaApi:s origin
 */
export function setVismaApiBase(url: string) {
  _vismaBase = stripTrailingSlash(url) || _apiBase;
  console.log(
    '[vismaApi] vismaBase (fallback only) ->',
    _vismaBase,
    'proxy =',
    useVismaProxy()
  );
}

export function setApiPrefix(prefix: string) {
  _apiPrefix = stripBothSlashes(prefix || '');
  console.log('[api] prefix ->', _apiPrefix);
}

export function getApiBase() {
  return _apiBase;
}
export function getApiPrefix() {
  return _apiPrefix;
}
export function getVismaApiBase() {
  return _vismaBase;
}
export function getRuntimeEnv() {
  return RUNTIME_ENV;
}

/* ───────────────────── Boot-logg ───────────────────── */

(function bootLog() {
  const boot = {
    ENV: RUNTIME_ENV,
    API_BASE: _apiBase,
    API_PREFIX: _apiPrefix,
    VISMA_API_BASE: _vismaBase,
    VISMA_ALIAS_extra: (extra?.VISMA_ALIAS ?? '').toString(),
    VISMA_ALIAS_env: (process.env.EXPO_PUBLIC_VISMA_ALIAS ?? '').toString(),
    VISMA_ALIAS_resolved: resolveVismaAlias(),
    VISMA_ALIAS_LOCK_extra: (extra?.VISMA_ALIAS_LOCK ?? '').toString(),
    VISMA_ALIAS_LOCK_env: (process.env.EXPO_PUBLIC_VISMA_ALIAS_LOCK ?? '').toString(),
    VISMA_ALIAS_LOCK_effective: resolveVismaAliasLock(),
    VISMA_FORCE_SQL_extra: (extra?.VISMA_FORCE_SQL ?? '').toString(),
    VISMA_FORCE_SQL_env: (process.env.EXPO_PUBLIC_VISMA_FORCE_SQL ?? '').toString(),
    VISMA_FORCE_SQL_effective: resolveVismaForceSql(),
    useVismaProxy: useVismaProxy(),
    runtimeOverrides: {
      _aliasOverride,
      _aliasLockOverride,
      _forceSqlOverride,
    },
    location: (globalThis as any)?.location?.href ?? '(native)',
  };
  console.log('[env]', boot);
  console.log('[api] baseURL:', api.defaults.baseURL);
  console.log(
    '[vismaApi] baseURL:',
    vismaApi.defaults.baseURL,
    'proxy =',
    useVismaProxy()
  );
})();

/* ───────────────────── Debug-dump ───────────────────── */

export function printClientEnv() {
  console.log('[printClientEnv]', {
    ENV: RUNTIME_ENV,
    alias: resolveVismaAlias(),
    aliasLock: resolveVismaAliasLock(),
    forceSql: resolveVismaForceSql(),
    apiBase: _apiBase,
    vismaBase: _vismaBase,
    useVismaProxy: useVismaProxy(),
  });
}

export default api;

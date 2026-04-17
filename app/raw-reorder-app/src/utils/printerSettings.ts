// utils/printerSettings.ts
import type {} from 'react-native'; // typ-only for RN projects
import type { PrintLabelOptions as LabelPrintOptions } from './labelPrint';

// ──────────────────────────────────────────────────────────────────────────────
// Typer
// ──────────────────────────────────────────────────────────────────────────────
export type VariantMode = {
  includeQr?: boolean;     // legacy / per-skrivare (kan finnas kvar i sparat data)
  includeLines?: boolean;  // legacy
  copies?: number;         // legacy
};

export type PrinterProfile = {
  id: string;
  name: string;

  mode?: 'html' | 'zpl';
  backendUrl?: string;        // t.ex. http://localhost:3001
  host?: string;              // skrivare IP/namn (vid USB: Windows-printernamn)
  port?: number | string;     // skrivare port (9100)
  fieldSep?: string;          // QR-fältseparator, default ';'
  defaultVariant?: 'full' | 'mini';

  zplLayoutFull?: any;
  zplLayoutMini?: any;

  // Backend-centrering/manuell förskjutning
  backendAutoFit?: boolean;
  backendShiftDots?: number;

  // Legacy-per-variant (om gammal kod sparat dessa)
  variant?: {
    full?: VariantMode;
    mini?: VariantMode;
  };

  // Legacy-kompat (om gammal kod sparat dessa)
  fullIncludeQr?: boolean;
  miniIncludeQr?: boolean;

  [key: string]: any;
};

export type PrinterRoute = {
  printerId?: string | null; // vilken skrivare som används för etiketten
  includeQr?: boolean;       // QR på/av för etiketten
};

/**
 * Appens skrivarin-Settings (v4) – flera skrivare + routes per etikett.
 */
export type PrinterSettings = {
  printers?: PrinterProfile[];

  // Väljs på PrinterSettingsScreen: vilken skrivare används för mini/full.
  routes?: {
    mini?: PrinterRoute;
    full?: PrinterRoute;
  };

  // Okända framtida fält bevaras
  [key: string]: any;
};

// ──────────────────────────────────────────────────────────────────────────────
// Lagring (RN AsyncStorage / web localStorage / minne)
// ──────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'printer_settings_v4';
let memoryStore: string | null = null;

async function getAsyncStorage() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-async-storage/async-storage');
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}

const isWeb = typeof window !== 'undefined' && typeof window.document !== 'undefined';

async function storageGetItem(key: string): Promise<string | null> {
  const AS = await getAsyncStorage();
  if (AS?.getItem) return AS.getItem(key);
  if (isWeb && 'localStorage' in window) {
    try {
      return window.localStorage.getItem(key);
    } catch {}
  }
  return memoryStore;
}

async function storageSetItem(key: string, value: string) {
  const AS = await getAsyncStorage();
  if (AS?.setItem) return AS.setItem(key, value);
  if (isWeb && 'localStorage' in window) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {}
  }
  memoryStore = value;
}

// ──────────────────────────────────────────────────────────────────────────────
// Defaults + helpers
// ──────────────────────────────────────────────────────────────────────────────
function uid(prefix = 'p') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const DEFAULT_PRINTER: PrinterProfile = {
  id: 'default',
  name: 'Standard',

  mode: 'zpl',
  backendUrl: '',
  host: '',
  port: 9100,
  fieldSep: ';',
  defaultVariant: 'mini',

  backendAutoFit: true,
  backendShiftDots: -120,

  // legacyfält – ok att behålla
  variant: {
    full: { includeQr: true, includeLines: true, copies: 1 },
    mini: { includeQr: true, includeLines: false, copies: 1 },
  },

  fullIncludeQr: true,
  miniIncludeQr: true,
};

export const DEFAULTS: PrinterSettings = {
  printers: [DEFAULT_PRINTER],
  routes: {
    mini: { printerId: DEFAULT_PRINTER.id, includeQr: true },
    full: { printerId: DEFAULT_PRINTER.id, includeQr: true },
  },
};

function isObject(x: any) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

function deepMerge<T>(base: T, extra: any): T {
  if (!isObject(base)) return (extra ?? base) as any;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  if (!isObject(extra)) return out;
  for (const k of Object.keys(extra)) {
    const bv = (out as any)[k];
    const ev = (extra as any)[k];
    if (isObject(bv) && isObject(ev)) out[k] = deepMerge(bv, ev);
    else out[k] = ev;
  }
  return out;
}

function normalizeProfile(p: PrinterProfile): PrinterProfile {
  const out: PrinterProfile = { ...DEFAULT_PRINTER, ...p };

  // typer
  if (out.port != null && typeof out.port === 'string') {
    const n = Number(out.port);
    out.port = Number.isFinite(n) ? n : 9100;
  }
  if (out.backendShiftDots != null && typeof out.backendShiftDots === 'string') {
    const n = Number(out.backendShiftDots);
    out.backendShiftDots = Number.isFinite(n) ? n : -120;
  }
  if (typeof out.backendAutoFit !== 'boolean') out.backendAutoFit = true;

  // Spegla legacy QR-fält om de råkar finnas
  out.fullIncludeQr = out.variant?.full?.includeQr ?? out.fullIncludeQr ?? true;
  out.miniIncludeQr = out.variant?.mini?.includeQr ?? out.miniIncludeQr ?? true;

  return out;
}

function normalizeRoutes(s: PrinterSettings): PrinterSettings {
  const printers = (s.printers && s.printers.length ? s.printers : [DEFAULT_PRINTER]).map(normalizeProfile);
  const firstId = printers[0]?.id ?? 'default';

  const routes = s.routes ?? {};
  const mini: PrinterRoute = {
    printerId: routes.mini?.printerId ?? firstId,
    includeQr: typeof routes.mini?.includeQr === 'boolean' ? routes.mini!.includeQr : true,
  };
  const full: PrinterRoute = {
    printerId: routes.full?.printerId ?? firstId,
    includeQr: typeof routes.full?.includeQr === 'boolean' ? routes.full!.includeQr : true,
  };

  // säkerställ att printerId finns
  const ok = (id: any) => !!id && printers.some((p) => p.id === id);
  if (!ok(mini.printerId)) mini.printerId = firstId;
  if (!ok(full.printerId)) full.printerId = firstId;

  return { ...s, printers, routes: { mini, full } };
}

/**
 * Migrering:
 * - v4: har routes -> normalisera
 * - v3: har printers + ev activePrinterId -> skapa routes från active (fallback)
 * - legacy: platta fält -> skapa default-printer + routes
 */
function migrate(raw: any): PrinterSettings {
  // Starta med DEFAULTS men bevara okända fält från raw
  let s: PrinterSettings = deepMerge(DEFAULTS, raw || {});

  // 1) Om raw redan har printers[] (v3/v4)
  if (Array.isArray(raw?.printers) && raw.printers.length) {
    const printers = raw.printers.map((p: any) => normalizeProfile(p));
    const firstId = printers[0].id;

    // Om routes finns (v4)
    if (raw?.routes) {
      return normalizeRoutes({ ...s, printers, routes: raw.routes });
    }

    // v3: activePrinterId finns ofta -> sätt routes till active om möjligt
    const activeId =
      raw.activePrinterId && printers.some((p: any) => p.id === raw.activePrinterId)
        ? raw.activePrinterId
        : firstId;

    return normalizeRoutes({
      ...s,
      printers,
      routes: {
        mini: { printerId: activeId, includeQr: true },
        full: { printerId: activeId, includeQr: true },
      },
    });
  }

  // 2) Legacy (platta fält)
  const legacy: any = raw || {};
  const p: PrinterProfile = normalizeProfile({
    id: 'default',
    name: 'Standard',

    mode: legacy.mode ?? (String(legacy.driver || '').toLowerCase() === 'zpl' ? 'zpl' : 'html'),
    backendUrl: legacy.backendUrl ?? legacy.endpoint ?? '',
    host: legacy.host ?? legacy.target?.host ?? '',
    port: legacy.port ?? legacy.target?.port ?? 9100,
    fieldSep: legacy.fieldSep ?? ';',
    defaultVariant: legacy.defaultVariant ?? 'mini',

    zplLayoutFull: legacy.zplLayoutFull,
    zplLayoutMini: legacy.zplLayoutMini,

    backendAutoFit: legacy.backendAutoFit ?? true,
    backendShiftDots: legacy.backendShiftDots ?? -120,

    variant: {
      full: {
        includeQr: legacy.variant?.full?.includeQr ?? legacy.fullIncludeQr ?? true,
        includeLines: legacy.variant?.full?.includeLines ?? legacy.fullIncludeLines ?? true,
        copies: legacy.variant?.full?.copies ?? 1,
      },
      mini: {
        includeQr: legacy.variant?.mini?.includeQr ?? legacy.miniIncludeQr ?? true,
        includeLines: legacy.variant?.mini?.includeLines ?? legacy.miniIncludeLines ?? false,
        copies: legacy.variant?.mini?.copies ?? 1,
      },
    },

    fullIncludeQr: legacy.fullIncludeQr ?? legacy.variant?.full?.includeQr ?? true,
    miniIncludeQr: legacy.miniIncludeQr ?? legacy.variant?.mini?.includeQr ?? true,
  });

  return normalizeRoutes({
    ...s,
    printers: [p],
    routes: {
      mini: { printerId: p.id, includeQr: true },
      full: { printerId: p.id, includeQr: true },
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Publika API
// ──────────────────────────────────────────────────────────────────────────────
export async function loadPrinterSettings(): Promise<PrinterSettings> {
  try {
    // Försök v4 först
    const strV4 = await storageGetItem(STORAGE_KEY);
    if (strV4) return migrate(JSON.parse(strV4));

    // Bakåtkompat: om någon redan har v3-nyckel liggande (valfritt)
    const strV3 = await storageGetItem('printer_settings_v3');
    if (strV3) return migrate(JSON.parse(strV3));

    return { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function savePrinterSettings(next: PrinterSettings): Promise<PrinterSettings> {
  const current = await loadPrinterSettings();
  const merged = deepMerge(current, next);

  // normalisera printers + routes
  const normalized = normalizeRoutes(merged);

  await storageSetItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getPrinters(s: PrinterSettings): PrinterProfile[] {
  const list = s.printers && s.printers.length ? s.printers : [DEFAULT_PRINTER];
  return list.map(normalizeProfile);
}

export function upsertPrinter(s: PrinterSettings, profile: PrinterProfile): PrinterSettings {
  const printers = getPrinters(s);
  const idx = printers.findIndex((p) => p.id === profile.id);
  const nextPrinters = [...printers];
  if (idx >= 0) nextPrinters[idx] = normalizeProfile(profile);
  else nextPrinters.push(normalizeProfile(profile));

  return normalizeRoutes({
    ...s,
    printers: nextPrinters,
  });
}

export function removePrinter(s: PrinterSettings, id: string): PrinterSettings {
  const printers = getPrinters(s).filter((p) => p.id !== id);
  const safePrinters = printers.length
    ? printers
    : [normalizeProfile({ ...DEFAULT_PRINTER, id: uid('p'), name: 'Standard' })];

  // om routes pekar på borttagen skrivare -> flytta till första kvarvarande
  const firstId = safePrinters[0].id;

  const routes = s.routes ?? {};
  const miniId = routes.mini?.printerId === id ? firstId : routes.mini?.printerId ?? firstId;
  const fullId = routes.full?.printerId === id ? firstId : routes.full?.printerId ?? firstId;

  return normalizeRoutes({
    ...s,
    printers: safePrinters,
    routes: {
      mini: { printerId: miniId, includeQr: routes.mini?.includeQr ?? true },
      full: { printerId: fullId, includeQr: routes.full?.includeQr ?? true },
    },
  });
}

// liten helper om du vill skapa ny skrivare i UI
export function makeNewPrinter(name?: string): PrinterProfile {
  return normalizeProfile({
    id: uid('p'),
    name: name || 'Ny skrivare',
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Mappning till labelPrint.printLabel options
// ──────────────────────────────────────────────────────────────────────────────
export type PrintVariant = 'full' | 'mini';
export type PrintLabelOptions = LabelPrintOptions;

function getRoute(s: PrinterSettings, variant: PrintVariant) {
  const normalized = normalizeRoutes(s);
  const r = normalized.routes?.[variant];
  return {
    printerId: r?.printerId ?? normalized.printers?.[0]?.id ?? 'default',
    includeQr: typeof r?.includeQr === 'boolean' ? r!.includeQr : true,
  };
}

/**
 * Gör om sparade inställningar till de options som labelPrint.printLabel förväntar sig.
 * Väljer skrivare baserat på routes[variant].printerId (inte aktiv skrivare).
 */
export function toPrintLabelOptions(s: PrinterSettings, variant: PrintVariant): LabelPrintOptions {
  const normalized = normalizeRoutes(s);
  const printers = getPrinters(normalized);

  const rMini = getRoute(normalized, 'mini');
  const rFull = getRoute(normalized, 'full');

  const route = variant === 'mini' ? rMini : rFull;
  const P = printers.find((p) => p.id === route.printerId) ?? printers[0];

  const host = (P.host || '').trim() || undefined;
  const port = (P.port ?? 9100) as number | string;

  // QR styrs av ROUTES (per etikett), men vi skickar båda flaggor så labelPrint kan avgöra
  const fullIncludeQr = rFull.includeQr;
  const miniIncludeQr = rMini.includeQr;

  return {
    mode: (P.mode as any) ?? 'zpl',
    backendUrl: (P.backendUrl || '').trim(),
    fieldSep: P.fieldSep || ';',
    variant,

    backendAutoFit: P.backendAutoFit ?? true,
    backendShiftDots: typeof P.backendShiftDots === 'number' ? P.backendShiftDots : -120,

    target: { host, port },
    printerHost: host,
    printerPort: typeof port === 'string' ? Number(port) || 9100 : port,

    zplFullLayout: P.zplLayoutFull,
    zplMiniLayout: P.zplLayoutMini,

    // ✅ QR on/off per etikett
    fullIncludeQr,
    miniIncludeQr,
  } as unknown as LabelPrintOptions;
}

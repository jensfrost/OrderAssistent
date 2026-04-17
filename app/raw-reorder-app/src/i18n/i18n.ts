import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import enTranslations from './locales/en.json';
import svTranslations from './locales/sv.json';

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: enTranslations,
  sv: svTranslations,
};

const STORAGE_KEY = 'app:locale';

function extractLangCode(locale: string): string {
  return (locale || '').split('-')[0].toLowerCase();
}

// Standard: svenska
let detected = 'sv';

// Försök läsa från navigator (web), annars från Expo
if (typeof navigator !== 'undefined') {
  const navLangs = Array.isArray((navigator as any).languages)
    ? (navigator as any).languages
    : [((navigator as any).language || '')];
  const codes = navLangs.map(extractLangCode);

  if (codes.includes('sv')) detected = 'sv';
  else if (codes.includes('en')) detected = 'en';
  else {
    const expoLocale =
      extractLangCode((Localization as any).getLocales?.()?.[0]?.languageTag || '') ||
      extractLangCode((Localization as any).locale || '');
    detected = TRANSLATIONS[expoLocale] ? expoLocale : 'sv';
  }
} else {
  const expoLocale =
    extractLangCode((Localization as any).getLocales?.()?.[0]?.languageTag || '') ||
    extractLangCode((Localization as any).locale || '');
  detected = TRANSLATIONS[expoLocale] ? expoLocale : 'sv';
}

let currentLocale = detected;
console.log('Using locale:', currentLocale);

// ---- Pub/Sub för språkbyte ----
type Listener = () => void;
const listeners = new Set<Listener>();

export function onLanguageChanged(fn: Listener) {
  listeners.add(fn);
}

export function offLanguageChanged(fn: Listener) {
  listeners.delete(fn);
}

function notifyLanguageChanged() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

// --- Synkron översättare ---
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = TRANSLATIONS[currentLocale] || {};
  let str = dict[key];

  if (str == null) str = enTranslations[key] ?? key;

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      str = str.split(`{{${k}}}`).join(String(v));
    });
  }

  return str;
}

// Getter för nuvarande locale
export function getLocale(): string {
  return currentLocale;
}

// Sätt språk + spara
export function setLocale(locale: string) {
  const code = extractLangCode(locale);

  if (TRANSLATIONS[code]) currentLocale = code;
  else {
    console.warn(`Unsupported locale "${locale}", falling back to Swedish.`);
    currentLocale = 'sv';
  }

  AsyncStorage.setItem(STORAGE_KEY, currentLocale).catch(() => {});
  console.log('Locale manually set to:', currentLocale);
  notifyLanguageChanged();
}

// Init vid appstart
export async function initI18n() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) {
      const code = extractLangCode(saved);
      if (TRANSLATIONS[code]) {
        currentLocale = code;
      }
    }
  } catch {
    // ignorera
  } finally {
    notifyLanguageChanged();
  }
}

export default { t, setLocale };
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import sv from './locales/sv.json';

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en,
    },
    sv: {
      translation: sv,
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export function onLanguageChanged(handler: () => void) {
  i18n.on('languageChanged', handler);
}

export function offLanguageChanged(handler: () => void) {
  i18n.off('languageChanged', handler);
}

export default i18n;
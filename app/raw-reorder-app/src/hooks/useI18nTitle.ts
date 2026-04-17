// hooks/useI18nTitle.ts
import { useEffect } from 'react';
import i18n, { t, onLanguageChanged, offLanguageChanged } from '../i18n/i18n';

export function useI18nTitle(navigation: any, key: string, params?: Record<string, string>) {
  // sätt titel vid mount
  useEffect(() => {
    navigation.setOptions({ title: t(key, params) });
  }, [navigation, key, params]);

  // uppdatera titel när språket byts
  useEffect(() => {
    const handler = () => navigation.setOptions({ title: t(key, params) });
    onLanguageChanged(handler);
    return () => offLanguageChanged(handler);
  }, [navigation, key, params]);
}

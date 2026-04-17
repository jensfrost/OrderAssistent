// app/hooks/useI18n.ts
import { useEffect, useState } from 'react';
import i18n, { onLanguageChanged, offLanguageChanged } from '../i18n/i18n';

/** Ger dig t() och setLocale(), och ser till att komponenten omrenderas vid språkbyte. */
export function useI18n() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const handler = () => setTick(x => x + 1);
    onLanguageChanged(handler);
    return () => offLanguageChanged(handler);
  }, []);

  // expose samma API som du redan använder
  return { t: i18n.t, setLocale: i18n.setLocale };
}

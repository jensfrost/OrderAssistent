// utils/formatDate.ts
import i18n from '../i18n/i18n';

export function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const raw = dateStr.trim();

  // Strip any trailing "Z" or "+hh:mm"/"-hh:mm"
  const cleaned = raw.replace(/Z$|[+\-]\d\d(:\d\d)?$/, '');

  // Match your DB format: YYYY-MM-DD[ T]hh:mm:ss[.ffffff]
  const parts = cleaned.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/
  );
  if (!parts) {
    // if it doesn’t match, just fall back to showing the raw string
    return raw;
  }

  const [, Y, Mo, D, h, m, s, ms = '0'] = parts;
  const year   = parseInt(Y, 10);
  const month  = parseInt(Mo, 10) - 1;
  const day    = parseInt(D, 10);
  const hour   = parseInt(h, 10);
  const minute = parseInt(m, 10);
  const second = parseInt(s, 10);
  // take only the first three digits of fractional seconds:
  const milli  = parseInt(ms.slice(0, 3).padEnd(3, '0'), 10);

  // This constructor ALWAYS gives you a LOCAL datetime.
  const dt = new Date(year, month, day, hour, minute, second, milli);

  // If that somehow fails, show the raw:
  if (isNaN(dt.getTime())) {
    return raw;
  }

  // Finally, format in the user’s locale (Swedish) with 24h clock
  const locale =
    i18n.language ||
    Intl.DateTimeFormat().resolvedOptions().locale ||
    'en-US';

  return dt.toLocaleString(locale, {
    year:   'numeric',
    month:  'long',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export const formatDateLong = (value?: string | number | Date, locale: string = 'sv-SE') => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: '2-digit' });
};
// app/api/print.ts
import { api } from './index';

/** Skicka ZPL till /api/print/zpl. IP/port kan skickas som query-parametrar. */
export async function printZpl(
  zpl: string,
  opts?: { ip?: string; port?: number; signal?: AbortSignal }
): Promise<void> {
  const qs = new URLSearchParams();
  if (opts?.ip) qs.set('ip', opts.ip);
  if (opts?.port != null) qs.set('port', String(opts.port));
  const url = '/print/zpl' + (qs.toString() ? `?${qs}` : '');

  await api.post(url, zpl, {
    headers: { 'Content-Type': 'text/plain' },
    // se till att axios inte försöker JSON-transformera – sträng går igenom ändå,
    transformRequest: (x) => x,
    signal: opts?.signal,
  });
}

/** Enkel health-koll på /api/print/health */
export async function printHealth(): Promise<string> {
  const r = await api.get('/print/health', { responseType: 'text' as any });
  return typeof r.data === 'string' ? r.data : String(r.data);
}

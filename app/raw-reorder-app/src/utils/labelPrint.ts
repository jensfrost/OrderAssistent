// utils/labelPrint.ts
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import QRCode from 'qrcode';

import {
  LabelData,
  TextLabels,
  QrLabels,
  LabelVariant,
  ZplFullLayout,
  ZplMiniLayout,
  DEFAULT_FULL,
  DEFAULT_MINI,
  resolveFull,
  resolveMini,
  withDefaultText,
  asciiize,
  buildQrPayload,
  buildQrHumanText
} from './labelLayout';

export function buildLabelData(args: {
  header: any;
  productName?: string;
  rawMaterials?: Array<{ ARARTN: string; ARNAMN: string }>;
  appLines?: Array<{ raw: string; quantity: number; unit?: string | null }>;
}): LabelData {
  const h = args.header || {};
  const header = {
    BRBATCH: String(h.BRBATCH ?? h.batchNumber ?? ''),
    BRARTS: String(h.BRARTS ?? ''),
    BRBBDT: String(h.BRBBDT ?? '').substring(0, 10),
    BRKVANT: Number(h.BRKVANT ?? h.quantity ?? 0),
  };

  const nameMap = new Map<string, string>();
  (args.rawMaterials || []).forEach(rm => nameMap.set(String(rm.ARARTN), rm.ARNAMN));

  const lines = (args.appLines || []).map(l => ({
    raw: l.raw,
    name: nameMap.get(String(l.raw)) || undefined,
    quantity: Number(l.quantity || 0),
    unit: l.unit ?? null,
  }));

  return {
    header,
    productName: args.productName,
    lines,
    createdLocalISO: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' '),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   HTML (fallback)
   ──────────────────────────────────────────────────────────────────────────── */
const htmlEscape = (s: string) =>
  String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]!));

function labelHTML(label: LabelData, qrSvg?: string, text?: TextLabels) {
  const T = withDefaultText(text);
  const h = label.header;
  const prodLine = `${h.BRARTS}${label.productName ? ' — ' + label.productName : ''}`;

  const rows = label.lines
    .map(l =>
      `<tr>
        <td style="padding:2px 0;vertical-align:top;"><strong>${htmlEscape(l.raw)}</strong></td>
        <td style="padding:2px 6px;vertical-align:top;">${htmlEscape(l.name || '')}</td>
        <td style="padding:2px 0; text-align:right; white-space:nowrap;">
          ${Number(l.quantity || 0).toFixed(l.unit === 'st' ? 0 : 3)} ${htmlEscape(l.unit || '')}
        </td>
      </tr>`
    )
    .join('');

  const qrBlock = qrSvg ? `<div class="qr">${qrSvg}</div>` : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Label ${htmlEscape(h.BRBATCH)}</title>
<style>
  @media print {
    @page { size: 58mm auto; margin: 4mm; }
    body { margin:0; }
  }
  body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', Arial, sans-serif; }
  .label { width: 58mm; border: 1px dashed #ddd; padding: 6px; }
  .head { margin-bottom: 6px; display:flex; gap:8px; align-items:flex-start; }
  .title { font-size: 14px; font-weight: 700; line-height: 1.15; }
  .meta { font-size: 11px; color:#333; }
  .hr { border-top:1px solid #ddd; margin:6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .qr { width: 26mm; height: 26mm; flex: 0 0 auto; display:flex; align-items:center; justify-content:center; }
  .info { flex:1 1 auto; min-width: 0; }
  .qr svg { width: 100%; height: 100%; }
</style>
</head>
<body>
  <div class="label">
    <div class="head">
      ${qrBlock}
      <div class="info">
        <div class="title">${htmlEscape(T.batch)}: ${htmlEscape(h.BRBATCH)}</div>
        <div class="meta">${htmlEscape(prodLine)}</div>
        <div class="meta">${htmlEscape(T.bestBefore)}: ${htmlEscape(h.BRBBDT)} · ${htmlEscape(T.quantity)}: ${Number(h.BRKVANT || 0)}</div>
        <div class="meta">${htmlEscape(T.created)}: ${htmlEscape(label.createdLocalISO || '')}</div>
      </div>
    </div>
    <div class="hr"></div>
    <table><tbody>${rows}</tbody></table>
  </div>
  <script>setTimeout(function(){ try{window.print();}catch(e){} }, 200);</script>
</body>
</html>`;
}

async function printHTML(
  label: LabelData,
  prebuiltPayload?: string,
  text?: TextLabels,
  includeQr?: boolean
) {
  let qrSvg: string | undefined = undefined;

  if (includeQr !== false) {
    try {
      const payload = prebuiltPayload ?? buildQrPayload(label, { includeLines: true, maxLen: 900 });
      qrSvg = await QRCode.toString(payload, { type: 'svg', margin: 0, width: 480 });
    } catch (e) {
      console.warn('[labelPrint] QR generation failed (HTML mode), printing without QR:', e);
    }
  }

  const html = labelHTML(label, qrSvg, text);

  if (Platform.OS === 'web') {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    const Print = await import('expo-print');
    await Print.printAsync({ html });
  } catch (e) {
    console.warn('[labelPrint] expo-print saknas eller misslyckades:', e);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   ZPL – FULL
   ──────────────────────────────────────────────────────────────────────────── */
function buildZPL_Full(
  label: LabelData,
  prebuiltPayload?: string,
  text?: TextLabels,
  layout?: ZplFullLayout,
  includeQr?: boolean
) {
  const L = resolveFull(layout || DEFAULT_FULL);
  const T = withDefaultText(text);
  const h = label.header;

  const PW = L.labelWidthDots;
  const LEFT = L.leftMargin;

  const wantQr = includeQr !== false;

  const QR_X = wantQr ? (PW - LEFT - L.qrBox) : 0;
  const QR_Y = Math.max(10, L.qrTop | 0);

  // Om ingen QR: använd hela bredden för text
  const availW = wantQr
    ? Math.max(50, QR_X - LEFT - L.gap)
    : Math.max(50, PW - LEFT - LEFT);

  const title = `${asciiize(T.batch)} ${asciiize(h.BRBATCH)}`;
  const prodLine = `${asciiize(h.BRARTS)}${label.productName ? ' — ' + asciiize(label.productName) : ''}`;
  const meta1 = `${asciiize(T.bestBefore)}: ${asciiize(h.BRBBDT)}  ${asciiize(T.quantity)}: ${h.BRKVANT}`;
  const created = label.createdLocalISO ? `${asciiize(T.created)}: ${asciiize(label.createdLocalISO)}` : '';

  // QR payload: först "human", fall back till compact (prebuiltPayload)
  let qrPayload = buildQrHumanText(label, text); // keep UTF-8 (åäö)
  const HARD_MAX = (typeof layout?.qrMag === 'number' && layout.qrMag >= 5) ? 950 : 1200;

  if (wantQr && qrPayload.length > HARD_MAX) {
    console.warn('[labelPrint] Human QR text too long for current QR size, using compact payload instead.');
    qrPayload = prebuiltPayload ?? qrPayload; // fallback: compact om vi har den
  }

  const lines = (label.lines || []).map(l => {
    const qty = Number(l.quantity || 0).toFixed(l.unit === 'st' ? 0 : 3);
    const name = l.name ? ` ${asciiize(l.name)}` : '';
    return `• ${asciiize(l.raw)}${name} — ${qty}${l.unit ? ' ' + asciiize(l.unit) : ''}`;
  });

  const y0 = 20 + (L.textTopAdjust || 0);

  const parts: string[] = [
    '^XA',
    `^PW${PW}`,
    '^CI28',
    '^LH0,0',

    // QR uppe till höger (om på)
    wantQr && qrPayload
      ? `^FO${QR_X},${QR_Y}^BQN,2,${Math.max(2, Math.min(12, Number(L.qrMag) || 6))}^FDLA,${qrPayload}^FS`
      : '',

    '^CF0,28',
    `^FO${LEFT},${y0}^FB${availW},999,8,L,0^FD${title}^FS`,
    '^CF0,22',
    `^FO${LEFT},${y0 + 40}^FB${availW},999,6,L,0^FD${prodLine}^FS`,
    `^FO${LEFT},${y0 + 70}^FB${availW},999,6,L,0^FD${meta1}^FS`,
    created ? `^FO${LEFT},${y0 + 100}^FB${availW},999,6,L,0^FD${created}^FS` : '',

    '^CF0,22',
    lines.length
      ? `^FO${LEFT},${y0 + 130}^FB${availW},${Math.max(1, L.fbMaxLines)},${Math.max(12, L.fbLineSpacing)},L,0^FD${asciiize(lines.join('\\&'))}^FS`
      : '',
    '^XZ',
  ];

  return parts.filter(Boolean).join('\n');
}

/* ────────────────────────────────────────────────────────────────
   ZPL – MINI
   ──────────────────────────────────────────────────────────────── */
function buildZPL_Mini(
  label: LabelData,
  text?: TextLabels,
  layout?: ZplMiniLayout,
  includeQr?: boolean
) {
  const L = resolveMini(layout || DEFAULT_MINI);
  const T = withDefaultText(text);
  const h = label.header;

  const PW   = L.labelWidthDots;
  const LEFT = L.leftMargin;

  const line1 = `${asciiize(T.batch)}: ${asciiize(h.BRBATCH)}`;
  const line2 = `${asciiize(T.product || 'Artikel')}: ${asciiize(h.BRARTS)}`;
  const line3 = `${asciiize(T.bestBefore)}: ${asciiize(h.BRBBDT)}`;

  const titleTop = L.miniTitleTop;
  const line2Top = L.miniLine2Top;
  const line3Top = L.miniLine3Top;

  const wantQr = includeQr !== false;

  const qrBox = L.miniQrBox ?? 200;
  const gap   = 12;
  const qrTop = L.miniQrTop ?? 10;
  const qrMag = L.miniQrMag ?? 5;

  const textWidth = wantQr ? Math.max(50, PW - LEFT - qrBox - gap) : Math.max(50, PW - LEFT - LEFT);
  const qrX = wantQr ? (LEFT + textWidth + gap) : 0;

  const qrPayload = [
    `${T.batch}: ${h.BRBATCH}`,
    `${T.product || 'Artikel'}: ${h.BRARTS}`,
    `${T.bestBefore}: ${h.BRBBDT}`,
  ].join('\n');

  return [
    '^XA',
    `^PW${PW}`,
    '^CI28',
    '^LH0,0',

    '^CF0,30',
    `^FO${LEFT},${titleTop}^FD${line1}^FS`,
    '^CF0,26',
    `^FO${LEFT},${line2Top}^FD${line2}^FS`,
    `^FO${LEFT},${line3Top}^FD${line3}^FS`,

    // QR (om på)
    wantQr
      ? `^FO${qrX},${qrTop}^BQN,2,${qrMag}^FDLA,${asciiize(qrPayload)}^FS`
      : '',

    '^XZ',
  ].filter(Boolean).join('\n');
}

/* ────────────────────────────────────────────────────────────────────────────
   Backend POST (ZPL)
   ──────────────────────────────────────────────────────────────────────────── */
async function sendZPLViaBackend(
  zplText: string,
  opts: {
    backendUrl?: string;
    target?: { host?: string; port?: string | number };
    printerHost?: string;
    printerPort?: string | number;
    extraHeaders?: Record<string, string>;
    backendAutoFit?: boolean;
    backendShiftDots?: number;
  }
) {
  const backend = (opts.backendUrl || '').replace(/\/+$/, '');
  const ip = (opts.target?.host ?? opts.printerHost ?? '').toString().trim();
  const rawPort = opts.target?.port ?? opts.printerPort ?? 9100;
  const port = (typeof rawPort === 'number' ? String(rawPort) : (rawPort || '')).toString().trim() || '9100';

  const qs = new URLSearchParams();
  if (ip) qs.set('ip', ip);
  if (port) qs.set('port', port);

  if (typeof opts.backendAutoFit === 'boolean') {
    qs.set('auto', opts.backendAutoFit ? '1' : '0');
  }
  if (typeof opts.backendShiftDots === 'number' && Number.isFinite(opts.backendShiftDots) && opts.backendShiftDots !== 0) {
    qs.set('shift', String(Math.round(opts.backendShiftDots)));
  }

  const url = `${backend}/api/print/zpl?${qs.toString()}`;

  console.log('[sendZPLViaBackend] URL:', url);
  console.log('[sendZPLViaBackend] ZPL:\n' + zplText);

  const headers: Record<string, string> = {
    'content-type': 'text/plain',
    ...(opts.extraHeaders || {}),
  };

  const res = await fetch(url, { method: 'POST', headers, body: zplText });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Backend print fail: ${res.status} ${res.statusText} — ${msg || 'unknown error'}`);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Publikt API
   ──────────────────────────────────────────────────────────────────────────── */
export type PrintLabelOptions = {
  mode?: 'html' | 'zpl';
  backendUrl?: string;
  target?: { host?: string; port?: string | number };
  qrLabels?: QrLabels;
  textLabels?: TextLabels;
  fieldSep?: string;
  includeLines?: boolean;
  maxLen?: number;

  printerHost?: string;
  printerPort?: number;
  extraHeaders?: Record<string, string>;

  backendAutoFit?: boolean;
  backendShiftDots?: number;

  variant?: LabelVariant;

  zplFullLayout?: ZplFullLayout;
  zplMiniLayout?: ZplMiniLayout;

  // ✅ QR on/off per variant
  fullIncludeQr?: boolean;
  miniIncludeQr?: boolean;
};

function shouldIncludeQr(variant: LabelVariant, opts?: PrintLabelOptions) {
  if (variant === 'mini') return opts?.miniIncludeQr !== false;
  return opts?.fullIncludeQr !== false;
}

export async function printLabel(label: LabelData, opts?: PrintLabelOptions) {
  const cfg = (Constants?.expoConfig as any)?.extra || {};
  const mode: 'html' | 'zpl' = (opts?.mode || cfg.LABEL_MODE || 'html');
  const variant: LabelVariant = (opts?.variant || 'full');

  const includeQr = shouldIncludeQr(variant, opts);

  // ✅ Bygg payload bara om QR ska med (sparar tid + undviker "onödig" QR-logik)
  const prebuiltPayload = includeQr
    ? buildQrPayload(label, {
        includeLines: opts?.includeLines ?? true,
        maxLen: opts?.maxLen ?? 900,
        labels: opts?.qrLabels,
        fieldSep: opts?.fieldSep ?? ';',
      })
    : undefined;

  const text = opts?.textLabels;

  if (mode === 'zpl') {
    const backendUrl =
      (opts?.backendUrl || cfg.PRINT_BACKEND || cfg.API_BASE || '').toString().replace(/\/+$/, '') || '';

    const printerHost = opts?.printerHost || cfg.PRINTER_ZPL_IP || cfg.PRINTER_HOST;
    const printerPortNum =
      typeof opts?.printerPort === 'number'
        ? opts!.printerPort
        : Number(cfg.PRINTER_ZPL_PORT || cfg.PRINTER_PORT || 9100);

    const zpl =
      variant === 'mini'
        ? buildZPL_Mini(
            label,
            text,
            opts?.zplMiniLayout || DEFAULT_MINI,
            includeQr
          )
        : buildZPL_Full(
            label,
            prebuiltPayload,
            text,
            opts?.zplFullLayout || DEFAULT_FULL,
            includeQr
          );

    if (!backendUrl) {
      console.warn('[labelPrint] PRINT_BACKEND saknas – faller tillbaka till HTML-utskrift');
      return printHTML(label, prebuiltPayload, text, includeQr);
    }

    await sendZPLViaBackend(zpl, {
      backendUrl,
      target: opts?.target,
      printerHost: printerHost || undefined,
      printerPort: Number.isFinite(printerPortNum) ? Number(printerPortNum) : undefined,
      extraHeaders: opts?.extraHeaders,
      backendAutoFit: opts?.backendAutoFit,
      backendShiftDots: opts?.backendShiftDots,
    });
    return;
  }

  return printHTML(label, prebuiltPayload, text, includeQr);
}

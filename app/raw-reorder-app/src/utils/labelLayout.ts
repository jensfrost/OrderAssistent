// utils/labelLayout.ts
import QRCode from 'qrcode';

/* ── Typer (delas mellan preview & print) ─────────────────────────────── */
export type BatchHeader = { BRBATCH: string; BRARTS: string; BRBBDT: string; BRKVANT: number; };
export type LabelLine   = { raw: string; name?: string; quantity: number; unit?: string | null; };
export type LabelData   = { header: BatchHeader; productName?: string; lines: LabelLine[]; createdLocalISO?: string; };

export type QrLabels = { batch: string; article: string; bestBefore: string; quantity: string; lines?: string; created?: string; };
export type TextLabels = { batch?: string; bestBefore?: string; quantity?: string; created?: string; product?: string; };
export type LabelVariant = 'full' | 'mini';

/** Full-etikett layout (203 dpi) – gemensam för preview + ZPL */
export type ZplFullLayout = {
  labelWidthDots: number;
  leftMargin: number;
  qrTop: number;          // topposition för QR (från överkant)
  qrMag: number;          // ^BQN magnification
  qrBox: number;          // reserverad bredd för QR (inkl quiet zone)
  gap: number;            // mellanrum TEXT→QR (kolumnspalt)
  fbMaxLines: number;     // max rader i ingrediensblocket (ZPL)
  fbLineSpacing: number;  // radavstånd i ingrediensblocket
  textTopAdjust?: number; // finjustering av header/ingred. Y
};

/** Mini-etikett layout (Parti/Artikel/Bäst före) */
export type ZplMiniLayout = {
  labelWidthDots: number;
  leftMargin: number;
  miniTitleTop: number;
  miniLine2Top: number;
  miniLine3Top: number;
  miniQrMag?: number;
  miniQrBox?: number;
  miniQrTop?: number;
};

/* ── Defaults (ENDA stället) ──────────────────────────────────────────── */
export const DEFAULT_FULL: ZplFullLayout = {
  labelWidthDots: 880,
  leftMargin: 20,
  qrTop: 20,          // ← default 20
  qrMag: 6,
  qrBox: 260,
  gap: 12,
  fbMaxLines: 10,
  fbLineSpacing: 30,
  textTopAdjust: 20,  // ← default 20
};

export const DEFAULT_MINI: ZplMiniLayout = {
  labelWidthDots: 880,
  leftMargin: 20,
  miniTitleTop: 60,
  miniLine2Top: 100,
  miniLine3Top: 140,
  miniQrMag: 5,
  miniQrBox: 200,
  miniQrTop: 10,
};

/* ── Helpers ───────────────────────────────────────────────────────────── */
export const asciiize = (s: string) =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');

export function withDefaultText(labels?: TextLabels) {
  return {
    batch: labels?.batch ?? 'Parti',
    bestBefore: labels?.bestBefore ?? 'Bäst före',
    quantity: labels?.quantity ?? 'Antal',
    created: labels?.created ?? 'Skapad',
    product: labels?.product,
  } as Required<TextLabels>;
}

export function resolveFull(l?: ZplFullLayout): ZplFullLayout {
  const D = DEFAULT_FULL;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
  if (!l) return D;
  return {
    labelWidthDots: clamp(l.labelWidthDots ?? D.labelWidthDots, 200, 4000),
    leftMargin:     clamp(l.leftMargin     ?? D.leftMargin,     0,   400),
    qrTop:          clamp(l.qrTop          ?? D.qrTop,          0,   3000),
    qrMag:          clamp(l.qrMag          ?? D.qrMag,          1,   12),
    qrBox:          clamp(l.qrBox          ?? D.qrBox,          80,  2000),
    gap:            clamp(l.gap            ?? D.gap,            0,   400),
    fbMaxLines:     clamp(l.fbMaxLines     ?? D.fbMaxLines,     1,   50),
    fbLineSpacing:  clamp(l.fbLineSpacing  ?? D.fbLineSpacing,  12,  120),
    textTopAdjust:  clamp(l.textTopAdjust  ?? (D.textTopAdjust ?? 0), -100, 100),
  };
}

export function resolveMini(l?: ZplMiniLayout): ZplMiniLayout {
  const D = DEFAULT_MINI;
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));

  if (!l) return D;

  return {
    labelWidthDots: clamp(l.labelWidthDots ?? D.labelWidthDots, 200, 4000),
    leftMargin:     clamp(l.leftMargin     ?? D.leftMargin,     0,   400),
    miniTitleTop:   clamp(l.miniTitleTop   ?? D.miniTitleTop,   0,   3000),
    miniLine2Top:   clamp(l.miniLine2Top   ?? D.miniLine2Top,   0,   3000),
    miniLine3Top:   clamp(l.miniLine3Top   ?? D.miniLine3Top,   0,   3000),

    miniQrMag:      clamp(l.miniQrMag      ?? D.miniQrMag!,     1,   12),
    miniQrBox:      clamp(l.miniQrBox      ?? D.miniQrBox!,     80,  2000),
    miniQrTop:      clamp(l.miniQrTop      ?? D.miniQrTop!,     0,   3000),
  };
}

export function wrapForCount(text: string, maxPx: number, fontPx: number): string[] {
  const avgCharPx = fontPx * 0.6;
  const maxChars = Math.max(4, Math.floor(maxPx / avgCharPx));
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w;
    if (cand.length <= maxChars) cur = cand;
    else {
      if (cur) lines.push(cur);
      if (w.length > maxChars) {
        for (let i = 0; i < w.length; i += maxChars) lines.push(w.slice(i, i + maxChars));
        cur = '';
      } else cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function buildQrHumanText(label: LabelData, labels?: TextLabels) {
  const T = withDefaultText(labels);
  const h = label.header;

  const headerLines = [
    `${T.batch} ${h.BRBATCH}`,
    `${h.BRARTS}${label.productName ? ' — ' + label.productName : ''}`,
    `${T.bestBefore}: ${h.BRBBDT}  ${T.quantity}: ${h.BRKVANT}`,
    label.createdLocalISO ? `${T.created}: ${label.createdLocalISO}` : '',
  ].filter(Boolean);

  const items = (label.lines || []).map(l => {
    const qty = Number(l.quantity || 0).toFixed(l.unit === 'st' ? 0 : 3);
    const name = l.name ? ` ${l.name}` : '';
    return `• ${l.raw}${name} — ${qty}${l.unit ? ' ' + l.unit : ''}`;
  });

  return headerLines.join('\n') + (items.length ? `\n\n${items.join('\n')}` : '');
}

/* ── QR payload ───────────────────────────────────────────────────────── */
export function buildQrPayload(
  label: LabelData,
  opts?: { includeLines?: boolean; maxLen?: number; labels?: QrLabels; fieldSep?: string; }
) {
  const { header, lines } = label;
  const includeLines = opts?.includeLines ?? true;
  const maxLen = Math.max(200, opts?.maxLen ?? 900);
  const SEP = opts?.fieldSep ?? ';';

  const L = opts?.labels || ({} as QrLabels);
  const kBatch      = asciiize(L.batch      ?? 'B');
  const kArticle    = asciiize(L.article    ?? 'A');
  const kBestBefore = asciiize(L.bestBefore ?? 'BB');
  const kQuantity   = asciiize(L.quantity   ?? 'Q');
  const kLines      = asciiize(L.lines      ?? 'L');
  const kCreated    = asciiize(L.created    ?? 'CR');

  const parts: string[] = [
    `${kBatch}=${asciiize(header.BRBATCH || '')}`,
    `${kArticle}=${asciiize(header.BRARTS || '')}`,
    `${kBestBefore}=${asciiize(header.BRBDT || header.BRBBDT || '')}`.replace('undefined', ''), // safe fallback
    `${kQuantity}=${Number(header.BRKVANT || 0)}`,
  ];

  if (label.createdLocalISO) parts.push(`${kCreated}=${asciiize(label.createdLocalISO)}`);

  if (includeLines && Array.isArray(lines) && lines.length) {
    const encoded = lines.map(l => {
      const qty = Number(l.quantity || 0);
      const unit = (l.unit || '').trim();
      return `${asciiize(String(l.raw || ''))}:${qty}${unit ? '@' + asciiize(unit) : ''}`;
    });
    parts.push(`${kLines}=${encoded.join(',')}`);
  }

  let payload = parts.join(SEP);
  if (payload.length > maxLen) {
    const withoutLines = parts.filter(p => !p.startsWith(`${kLines}=`)).join(SEP);
    if (withoutLines.length <= maxLen) return withoutLines;
    const withoutCreated = parts.filter(p => !p.startsWith(`${kLines}=`) && !p.startsWith(`${kCreated}=`)).join(SEP);
    return withoutCreated.slice(0, maxLen);
  }
  return payload;
}

/* ── Preview-renderers (SVG) – samma geometri som ZPL ────────────────── */
const escapeXml = (s: string) =>
  String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]!));

export async function renderFullPreviewSVG(args: {
  label: LabelData;
  fieldSep: string;
  qrLabels?: QrLabels;
  textLabels?: TextLabels;
  layout?: ZplFullLayout;
  displayWidthPx?: number;
  includeQr?: boolean; // ✅ NYTT
}) {
  const L = resolveFull(args.layout);
  const T = withDefaultText(args.textLabels);

  const PW   = L.labelWidthDots;
  const LEFT = L.leftMargin;

  const wantQr = args.includeQr !== false;

  const QR_X = wantQr ? (PW - LEFT - L.qrBox) : 0;
  const QR_Y = Math.max(10, L.qrTop | 0);

  // Om ingen QR: använd hela bredden för text
  const availW = wantQr
    ? Math.max(50, QR_X - LEFT - L.gap)
    : Math.max(50, PW - LEFT - LEFT);

  const titleFs = 28, bodyFs = 22;
  const lhTitle = Math.round(titleFs * 1.3);
  const lhBody  = Math.round(bodyFs  * 1.3);

  const h = args.label.header;
  const titleRaw   = `${T.batch} ${h.BRBATCH}`;
  const prodRaw    = `${h.BRARTS}${args.label.productName ? ' — ' + args.label.productName : ''}`;
  const metaRaw    = `${T.bestBefore}: ${h.BRBBDT}  ${T.quantity}: ${h.BRKVANT}`;
  const createdRaw = args.label.createdLocalISO ? `${T.created}: ${args.label.createdLocalISO}` : '';

  const mkBlock = (x:number, y:number, fs:number, text:string, lh:number) => {
    const lines = wrapForCount(text, availW, fs);
    if (!lines.length) return { svg:'', h:0 };
    const tsp = lines.map((ln,i)=>`<tspan x="${x}" dy="${i?lh:0}">${escapeXml(ln)}</tspan>`).join('');
    return { svg:`<text x="${x}" y="${y}" font-size="${fs}" font-family="Arial, Helvetica, sans-serif">${tsp}</text>`, h: lines.length*lh };
  };

  let y = 20 + (L.textTopAdjust || 0);
  const b1 = mkBlock(LEFT, y, titleFs, titleRaw, lhTitle); y += b1.h;
  const b2 = mkBlock(LEFT, y, bodyFs,  prodRaw,  lhBody ); y += b2.h;
  const b3 = mkBlock(LEFT, y, bodyFs,  metaRaw,  lhBody ); y += b3.h;
  const b4 = createdRaw ? mkBlock(LEFT, y, bodyFs, createdRaw, lhBody) : { svg:'', h:0 }; y += b4.h;

  // Ingredienser under header
  const startY = y + 10;
  const lines = args.label.lines.map(l => {
    const qty = Number(l.quantity || 0).toFixed(l.unit === 'st' ? 0 : 3);
    const name = l.name ? ` ${l.name}` : '';
    return `• ${l.raw}${name} — ${qty}${l.unit ? ' ' + l.unit : ''}`;
  });
  const wrapH = L.fbLineSpacing || 30;
  const wrapped: string[] = [];
  lines.forEach(it => wrapped.push(...wrapForCount(it, availW, bodyFs)));

  const items = wrapped.length
    ? `<text x="${LEFT}" y="${startY}" font-size="${bodyFs}" font-family="Arial, Helvetica, sans-serif">${
        `<tspan x="${LEFT}" dy="0">${escapeXml(wrapped[0])}</tspan>` +
        wrapped.slice(1).map(ln=>`<tspan x="${LEFT}" dy="${wrapH}">${escapeXml(ln)}</tspan>`).join('')
      }</text>` : '';
  const itemsBottom = wrapped.length ? startY + (wrapped.length-1)*wrapH + bodyFs : startY;

  // QR uppe till höger (bara om wantQr)
  let qrPlaced = '';
  if (wantQr) {
    try {
      const payload = buildQrHumanText(args.label, args.textLabels);
      const qrRawSvg = await QRCode.toString(payload, { type: 'svg', margin: 0 });
      const open = qrRawSvg.match(/<svg[^>]*>/)?.[0];
      if (open) {
        let adjusted = open;
        adjusted = /width="/.test(adjusted)  ? adjusted.replace(/width="[^"]*"/,  `width="${L.qrBox}"`)  : adjusted.replace('<svg', `<svg width="${L.qrBox}"`);
        adjusted = /height="/.test(adjusted) ? adjusted.replace(/height="[^"]*"/, `height="${L.qrBox}"`) : adjusted.replace('<svg', `<svg height="${L.qrBox}"`);
        const qrSized = qrRawSvg.replace(open, adjusted);
        qrPlaced = `<g transform="translate(${QR_X},${QR_Y})">${qrSized}</g>`;
      } else {
        qrPlaced = `<g transform="translate(${QR_X},${QR_Y})">${qrRawSvg}</g>`;
      }
    } catch {}
  }

  const H = Math.max(
    b1.h + b2.h + b3.h + b4.h + 30,
    itemsBottom,
    wantQr ? (QR_Y + L.qrBox) : 0
  ) + 20;

  const outW = Math.max(220, Math.min(PW, args.displayWidthPx ?? 520));
  const outH = Math.round(H * (outW / PW));

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${H}" width="${outW}" height="${outH}" preserveAspectRatio="xMinYMin meet" style="background:#fff; display:block;">
  <rect x="0" y="0" width="${PW}" height="${H}" fill="white" stroke="#eee"/>
  ${b1.svg}${b2.svg}${b3.svg}${b4.svg}
  ${qrPlaced}
  ${items}
</svg>`.trim();
}

export async function renderMiniPreviewSVG(args: {
  label: LabelData;
  textLabels?: TextLabels;
  layout?: ZplMiniLayout;
  displayWidthPx?: number;
  includeQr?: boolean; // ✅ NYTT
}) {
  const L = resolveMini(args.layout);
  const T = withDefaultText(args.textLabels);
  const h = args.label.header;

  const PW   = L.labelWidthDots;
  const LEFT = L.leftMargin;

  const wantQr = args.includeQr !== false;

  const qrBox = L.miniQrBox ?? 260;
  const gap   = 12;
  const qrTop = L.miniQrTop ?? 10;

  // Om QR av: använd hela bredden för text och ingen QR kolumn
  const textWidth = wantQr
    ? Math.max(50, PW - LEFT - qrBox - gap)
    : Math.max(50, PW - LEFT - LEFT);

  const qrX = wantQr ? (LEFT + textWidth + gap) : 0;

  const line1 = `${T.batch}: ${h.BRBATCH}`;
  const line2 = `${T.product}: ${h.BRARTS}`;
  const line3 = `${T.bestBefore}: ${h.BRBBDT}`;

  const titleTop = L.miniTitleTop;
  const line2Top = L.miniLine2Top;
  const line3Top = L.miniLine3Top;

  const H = Math.max(
    line3Top + 40,
    wantQr ? (qrTop + qrBox + 20) : 0
  );

  const outW = Math.max(220, Math.min(PW, args.displayWidthPx ?? 520));
  const outH = Math.round(H * (outW / PW));

  let qrPlaced = '';
  if (wantQr) {
    const qrPayload = [
      `${T.batch}: ${h.BRBATCH}`,
      `${T.product}: ${h.BRARTS}`,
      `${T.bestBefore}: ${h.BRBBDT}`,
    ].join('\n');

    try {
      const qrRawSvg = await QRCode.toString(qrPayload, { type: 'svg', margin: 0 });
      const open = qrRawSvg.match(/<svg[^>]*>/)?.[0];

      if (open) {
        let adjusted = open;
        adjusted = /width="/.test(adjusted)
          ? adjusted.replace(/width="[^"]*"/, `width="${qrBox}"`)
          : adjusted.replace('<svg', `<svg width="${qrBox}"`);
        adjusted = /height="/.test(adjusted)
          ? adjusted.replace(/height="[^"]*"/, `height="${qrBox}"`)
          : adjusted.replace('<svg', `<svg height="${qrBox}"`);

        const qrSized = qrRawSvg.replace(open, adjusted);
        qrPlaced = `<g transform="translate(${qrX},${qrTop})">${qrSized}</g>`;
      } else {
        qrPlaced = `<g transform="translate(${qrX},${qrTop})">${qrRawSvg}</g>`;
      }
    } catch (e) {
      console.warn('[labelLayout] QR mini preview failed:', e);
    }
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${PW} ${H}"
     width="${outW}"
     height="${outH}"
     preserveAspectRatio="xMinYMin meet"
     style="background:#fff; display:block;">
  <rect x="0" y="0" width="${PW}" height="${H}" fill="white" stroke="#eee"/>

  <g fill="#000" font-family="Arial, Helvetica, sans-serif">
    <text x="${LEFT}" y="${titleTop}" font-size="30" font-weight="700">
      ${escapeXml(line1)}
    </text>
    <text x="${LEFT}" y="${line2Top}" font-size="26">
      ${escapeXml(line2)}
    </text>
    <text x="${LEFT}" y="${line3Top}" font-size="26">
      ${escapeXml(line3)}
    </text>
  </g>

  ${qrPlaced}
</svg>
`.trim();
}

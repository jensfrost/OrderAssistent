// utils/wooThumbs.ts
import Constants from 'expo-constants';

export type ThumbMap = Record<string, Record<string, string>>;
export type ThumbSizes = Record<string, string>;

export function getExtra() {
  return (Constants?.expoConfig?.extra) ?? ((Constants as any)?.manifest?.extra) ?? {};
}

export function pickSizes(extra = getExtra()): string[] {
  const def = String(extra.WOO_THUMBS_SIZE || 'woocommerce_thumbnail');
  const sizesStr = String(extra.WOO_THUMBS_SIZES || '').trim();
  const arr = sizesStr
    ? sizesStr.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [def, 'large'];
  return Array.from(new Set(arr));
}

function buildUrl(base: string, skus: string[], sizes: string[], includePlaceholder: boolean) {
  const qs = encodeURIComponent(skus.join(','));
  return (
    `${base}/wp-json/wc/v3/custom/thumbs?` +
    `skus=${qs}&sizes=${encodeURIComponent(sizes.join(','))}` +
    `&include_placeholder=${includePlaceholder ? '1' : '0'}`
  );
}

/** Hämta Woo-tumnaglar för givna SKU:er, chunkat så URL:en inte blir för lång. */
export async function fetchWooThumbsBySkus(
  skus: string[],
  opts?: {
    chunkSize?: number;
    includePlaceholder?: boolean;
    base?: string;
    sizes?: string[];
  }
): Promise<ThumbMap> {
  const extra = getExtra();
  const base = (opts?.base ?? String(extra.WOO_BASE_URL || '')).trim().replace(/\/+$/, '');
  if (!base || !skus?.length) return {};

  const sizes = opts?.sizes ?? pickSizes(extra);
  const includePlaceholder =
    typeof opts?.includePlaceholder === 'boolean'
      ? opts.includePlaceholder
      : String(extra.WOO_INCLUDE_PLACEHOLDER ?? '1') === '1';

  const uniq = Array.from(new Set(skus.filter(Boolean).map(String)));
  const chunkSize = Math.max(1, opts?.chunkSize ?? 80);

  const out: ThumbMap = {};
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const url = buildUrl(base, chunk, sizes, includePlaceholder);
    try {
      const r = await fetch(url, { credentials: 'omit' });
      const text = await r.text();
      if (!r.ok) {
        console.warn('[wooThumbs] HTTP', r.status, text.slice(0, 200));
        continue;
      }
      let raw: any;
      try { raw = JSON.parse(text); } catch { continue; }

      for (const [sku, val] of Object.entries(raw || {})) {
        if (val && typeof val === 'object') {
          out[sku] = val as ThumbSizes;
        } else if (typeof val === 'string') {
          out[sku] = { [sizes[0] || 'woocommerce_thumbnail']: val as string };
        }
      }
    } catch (e) {
      console.warn('[wooThumbs] fetch error', e);
    }
  }
  return out;
}

/** Välj “small” och “large/full” URL från en size→url-mapp. */
export function selectSmallLarge(map?: ThumbSizes): { small?: string; large?: string } {
  const m = map || {};
  const keys = Object.keys(m);
  if (!keys.length) return {};
  const small = m['woocommerce_thumbnail'] ?? m['thumbnail'] ?? m[keys[0]];
  const large = m['large'] ?? m['full'] ?? m[keys[keys.length - 1]] ?? small;
  return { small, large };
}

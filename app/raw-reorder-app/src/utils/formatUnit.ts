// utils/format.ts
export const formatQtyUnit = (qtyRaw: number | string, unitRaw?: string) => {
  const qty = Number(qtyRaw);
  const unit = String(unitRaw ?? '').trim();
  const u = unit.toLowerCase();
  if (!isFinite(qty)) return unit ? `– ${unit}` : '–';

  const nf0      = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
  const nf3      = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 3 });
  const nf3fixed = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  if (['st', 'styck', 'stycken', 'pc', 'pcs'].includes(u)) return `${nf0.format(Math.round(qty))} ${unit}`;
  if (u === 'kg') return `${nf3fixed.format(qty)} ${unit}`;
  return unit ? `${nf3.format(qty)} ${unit}` : nf3.format(qty);
};


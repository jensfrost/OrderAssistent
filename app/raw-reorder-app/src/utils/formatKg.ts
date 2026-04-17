export function formatKg(value: number | string): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    // if parsing fails, fall back to zero
    if (isNaN(num)) return '0.000';
    return num.toFixed(3);
  }

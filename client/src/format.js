// Currency & number formatting. Defaults to Indian (en-IN, ₹) but honours
// each project's configured currency/locale.

const CURRENCY_SYMBOL = { INR: '₹', USD: '$', PKR: '₨', EUR: '€', GBP: '£', AED: 'د.إ' };

export function symbolFor(currency = 'INR') {
  return CURRENCY_SYMBOL[currency] || '';
}

export function money(amount, { currency = 'INR', locale = 'en-IN', decimals = 0 } = {}) {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency, maximumFractionDigits: decimals, minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${symbolFor(currency)}${num(n, locale)}`;
  }
}

// Compact for tight KPI tiles: ₹38.99 L / ₹1.05 Cr for INR, else K/M.
export function moneyCompact(amount, { currency = 'INR', locale = 'en-IN' } = {}) {
  const n = Number(amount) || 0;
  const sym = symbolFor(currency);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (currency === 'INR') {
    if (abs >= 1e7) return `${sign}${sym}${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}${sym}${(abs / 1e5).toFixed(2)} L`;
    return money(n, { currency, locale });
  }
  if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`;
  return money(n, { currency, locale });
}

export function num(n, locale = 'en-IN') {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(n) || 0);
}

export function pct(fraction, digits = 1) {
  return `${((Number(fraction) || 0) * 100).toFixed(digits)}%`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') || iso.includes(' ') ? iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z') : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtBytes(b) {
  if (!b) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(i ? 1 : 0)} ${sizes[i]}`;
}

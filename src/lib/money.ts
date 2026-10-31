// Display helpers for money. Amounts are integer cents everywhere; these only format them.

const whole = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });
const withCents = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MINUS = "−";

interface FormatOptions {
  /** Prefix "KES ". */
  currency?: boolean;
  /** Always show the sign: "+2,500" or "−2,500". */
  signed?: boolean;
}

/** 4500000 → "45,000"; 3350 → "33.50". Cents are shown only when there are some. */
export function formatAmount(cents: number, { currency = false, signed = false }: FormatOptions = {}) {
  const abs = Math.abs(cents);
  const number = abs % 100 === 0 ? whole.format(abs / 100) : withCents.format(abs / 100);
  const sign = cents < 0 ? MINUS : signed && cents > 0 ? "+" : "";
  return `${sign}${currency ? "KES " : ""}${number}`;
}

/** formatAmount with the "KES " prefix. */
export function formatKes(cents: number, options: Omit<FormatOptions, "currency"> = {}) {
  return formatAmount(cents, { ...options, currency: true });
}

/** Short form for charts and tight spaces: 17190000 → "171.9k", 125000000 → "1.25M". */
export function formatCompact(cents: number) {
  const value = Math.abs(cents) / 100;
  const sign = cents < 0 ? MINUS : "";
  if (value >= 1_000_000) return `${sign}${trim(value / 1_000_000, 2)}M`;
  if (value >= 1_000) return `${sign}${trim(value / 1_000, 1)}k`;
  return `${sign}${whole.format(value)}`;
}

function trim(value: number, digits: number) {
  return Number(value.toFixed(digits)).toString();
}

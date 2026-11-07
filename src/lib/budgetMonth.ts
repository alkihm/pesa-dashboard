// [4.9] part B: the budget month (D-016). A month keeps the key of the calendar month it starts in ("2026-11-01");
// with start day D it runs from D Nov 00:00 to D Dec 00:00, Nairobi time, the same rule as public.budget_month() in
// the database, which groups month_totals and category_month_totals. D = 1 is the calendar month.
// The day comes from settings.month_start_day; SyncProvider loads it at sign-in and Settings changes it.

const NAIROBI_MS = 3 * 60 * 60 * 1000;

let startDay = 1;

export const getMonthStartDay = () => startDay;

/** Returns whether it changed. Out-of-range values are clamped to 1–28, as in the database. */
export function setMonthStartDay(day: number | null | undefined): boolean {
  const next = Math.min(28, Math.max(1, Math.round(day ?? 1)));
  const changed = next !== startDay;
  startDay = next;
  return changed;
}

const key = (y: number, m0: number) => {
  const at = new Date(Date.UTC(y, m0, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

/** The budget month `now` falls in: "2026-11-01". */
export function budgetMonthOf(now = new Date(), day = startDay): string {
  const local = new Date(now.getTime() + NAIROBI_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  return local.getUTCDate() >= day ? key(y, m) : key(y, m - 1);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The month's first moment and the next month's first moment, as Nairobi times, for filtering transactions. */
export function budgetMonthRange(month: string, day = startDay) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const from = key(y, m - 1).slice(0, 8) + pad(day);
  const to = key(y, m).slice(0, 8) + pad(day);
  return { from: `${from}T00:00:00+03:00`, to: `${to}T00:00:00+03:00` };
}

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "25 Nov – 24 Dec" when the month does not start on the 1st; null otherwise. */
export function budgetMonthSpan(month: string, day = startDay): string | null {
  if (day === 1) return null;
  const { from, to } = budgetMonthRange(month, day);
  const first = new Date(from.slice(0, 10) + "T00:00:00Z");
  const last = new Date(new Date(to.slice(0, 10) + "T00:00:00Z").getTime() - 86_400_000);
  return `${dayMonth.format(first)} – ${dayMonth.format(last)}`;
}

/** "1st" … "28th", for the Settings picker. */
export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

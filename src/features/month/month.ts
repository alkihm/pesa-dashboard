// The Month screen's sums ([2.4]): changes against the month before, the 6-month bars, categories this month against
// last, and the "This month" lines. The database adds up the rows (month_totals, category_month_totals); everything
// here works on those totals and is tested on its own.

import { formatAmount } from "@/lib/money";

/** A month as the totals views key it: its first day, "2026-10-01". */
export type Month = string;

const NAIROBI_MS = 3 * 60 * 60 * 1000;

export function currentMonth(now = new Date()): Month {
  const local = new Date(now.getTime() + NAIROBI_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** "2026-10" from the URL → "2026-10-01"; anything else → null. */
export function parseMonth(param: string | null | undefined): Month | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(param ?? "");
  return match ? `${match[1]}-${match[2]}-01` : null;
}

/** "2026-10-01" → "2026-10", for the URL. */
export const monthParam = (month: Month) => month.slice(0, 7);

export function addMonths(month: Month, n: number): Month {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const at = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const longName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
const shortName = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const withYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const asDate = (month: Month) => new Date(`${month}T00:00:00Z`);

/** "October 2026", "October", "Oct" (three letters, as on the boards; en-GB alone gives "Sept"). */
export const monthTitle = (month: Month) => withYear.format(asDate(month));
export const monthName = (month: Month) => longName.format(asDate(month));
export const monthShort = (month: Month) => shortName.format(asDate(month)).slice(0, 3);

/** The month's start and the next month's start as Nairobi times, for filtering transactions. */
export function monthRange(month: Month) {
  return { from: `${month}T00:00:00+03:00`, to: `${addMonths(month, 1)}T00:00:00+03:00` };
}

export interface MonthTotals {
  income: number;
  spending: number;
  fees: number;
  repaid: number;
  saved: number;
}

export interface MonthTotalsRow {
  month: string | null;
  income_cents: number | null;
  spending_cents: number | null;
  fees_cents: number | null;
  repaid_cents: number | null;
  saved_cents: number | null;
}

export const EMPTY: MonthTotals = { income: 0, spending: 0, fees: 0, repaid: 0, saved: 0 };

/** One month's totals out of the view's rows; a month with no rows is all zeros. */
export function totalsFor(rows: MonthTotalsRow[], month: Month): MonthTotals {
  const row = rows.find((r) => r.month === month);
  if (!row) return EMPTY;
  return {
    income: row.income_cents ?? 0,
    spending: row.spending_cents ?? 0,
    fees: row.fees_cents ?? 0,
    repaid: row.repaid_cents ?? 0,
    saved: row.saved_cents ?? 0,
  };
}

export const leftOver = (t: MonthTotals) => t.income - t.spending;

/** Whether more is better (income) or worse (spending) — sets the change's colour. */
type Better = "up" | "down";

export interface Kpi {
  key: string;
  label: string;
  emoji: string;
  cents: number;
  /** "▲ 1.7%", "▼ 9,000", "same"; null when there is nothing to compare with. */
  change: string | null;
  /** The change is good news, bad news, or neither. */
  tone: "good" | "bad" | "neutral";
}

function kpi(
  key: string,
  label: string,
  emoji: string,
  cents: number,
  previous: number,
  better: Better,
  as: "percent" | "amount",
): Kpi {
  const diff = cents - previous;
  if (diff === 0)
    return { key, label, emoji, cents, change: previous || cents ? "same" : null, tone: "neutral" };
  if (as === "percent" && previous === 0) return { key, label, emoji, cents, change: null, tone: "neutral" };

  const arrow = diff > 0 ? "▲" : "▼";
  const size =
    as === "percent" ? `${percent(Math.abs(diff) / Math.abs(previous))}` : formatAmount(Math.abs(diff));
  const good = diff > 0 === (better === "up");
  return { key, label, emoji, cents, change: `${arrow} ${size}`, tone: good ? "good" : "bad" };
}

function percent(ratio: number) {
  const value = ratio * 100;
  return `${value >= 10 ? Math.round(value) : Number(value.toFixed(1))}%`;
}

/** The cards across the top. Left over changes by amount (it can cross zero); the rest by percent. */
export function kpis(current: MonthTotals, previous: MonthTotals): Kpi[] {
  return [
    kpi("income", "Income", "💰", current.income, previous.income, "up", "percent"),
    kpi("spent", "Spent", "🛒", current.spending, previous.spending, "down", "percent"),
    kpi(
      "left",
      "Left over",
      leftOver(current) >= 0 ? "🟢" : "🔴",
      leftOver(current),
      leftOver(previous),
      "up",
      "amount",
    ),
    kpi("repaid", "Loans repaid", "💸", current.repaid, previous.repaid, "up", "amount"),
    kpi("fees", "Fees", "🧾", current.fees, previous.fees, "down", "percent"),
  ];
}

export interface TrendMonth {
  month: Month;
  label: string;
  income: number;
  spending: number;
  net: number;
}

/** The selected month and the five before it, oldest first. */
export function trend(rows: MonthTotalsRow[], month: Month, count = 6): TrendMonth[] {
  return Array.from({ length: count }, (_, i) => {
    const m = addMonths(month, i - count + 1);
    const t = totalsFor(rows, m);
    return { month: m, label: monthShort(m), income: t.income, spending: t.spending, net: leftOver(t) };
  });
}

export interface CategoryMonthRow {
  month: string | null;
  category_id: string | null;
  total_cents: number | null;
  category: { name: string; emoji: string | null; colour: string } | null;
}

export interface CategoryChange {
  key: string;
  label: string;
  emoji: string;
  current: number;
  previous: number;
  /** current − previous: more spent is positive. */
  diff: number;
}

/** Spending by category in both months, largest this month first. Rows without a category are "To review". */
export function compareCategories(rows: CategoryMonthRow[], month: Month, previous: Month): CategoryChange[] {
  const byKey = new Map<string, CategoryChange>();
  for (const row of rows) {
    if (row.month !== month && row.month !== previous) continue;
    const key = row.category_id ?? "review";
    const entry = byKey.get(key) ?? {
      key,
      label: row.category?.name ?? "To review",
      emoji: row.category ? (row.category.emoji ?? "🏷️") : "❓",
      current: 0,
      previous: 0,
      diff: 0,
    };
    if (row.month === month) entry.current += row.total_cents ?? 0;
    else entry.previous += row.total_cents ?? 0;
    entry.diff = entry.current - entry.previous;
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .filter((c) => c.current > 0 || c.previous > 0)
    .sort((a, b) => b.current - a.current || b.previous - a.previous || a.label.localeCompare(b.label));
}

/** The short lines under "This month". Budget and review lines come with those screens ([3.x]). */
export function highlights(
  current: MonthTotals,
  previous: MonthTotals,
  categories: CategoryChange[],
): string[] {
  const lines: string[] = [];
  const left = leftOver(current);

  if (current.income === 0 && current.spending === 0) return ["Nothing recorded this month yet."];

  const leftText = left >= 0 ? `${formatAmount(left)} left over` : `${formatAmount(-left)} more out than in`;
  if (previous.spending > 0 && current.spending !== previous.spending) {
    const ratio = Math.abs(current.spending - previous.spending) / previous.spending;
    const word = current.spending < previous.spending ? "down" : "up";
    lines.push(`${left >= 0 ? "🟢" : "🔴"} Spending ${word} ${percent(ratio)}, ${leftText}.`);
  } else {
    lines.push(`${left >= 0 ? "🟢" : "🔴"} ${leftText[0]!.toUpperCase()}${leftText.slice(1)}.`);
  }

  const rise = categories
    .filter((c) => c.key !== "review" && c.previous > 0 && c.diff > 0)
    .sort((a, b) => b.diff - a.diff)[0];
  if (rise) {
    lines.push(
      `${rise.emoji} ${rise.label} up ${percent(rise.diff / rise.previous)}, +${formatAmount(rise.diff)}.`,
    );
  }

  if (current.repaid > 0) lines.push(`💸 ${formatAmount(current.repaid)} went to loans this month.`);
  if (current.saved > 0) lines.push(`🐷 ${formatAmount(current.saved)} went into savings.`);
  return lines;
}

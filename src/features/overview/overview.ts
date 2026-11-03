// What Overview and Home ([2.2]) show beyond the account totals ([3.7], src/lib/balances.ts): the period the
// Month / Year / All switch picks, spending by category for that period, and the figures for the trend card.

import type { DonutSlice } from "@/components/charts/Donut";
import {
  addMonths,
  currentMonth,
  monthName,
  type CategoryMonthRow,
  type Month,
} from "@/features/month/month";

export type Period = "month" | "year" | "all";

/** The first month a period covers, or null for all time. Year is the calendar year so far. */
export function periodStart(period: Period, now = new Date()): Month | null {
  const month = currentMonth(now);
  if (period === "month") return month;
  if (period === "year") return `${month.slice(0, 4)}-01-01`;
  return null;
}

export function periodLabel(period: Period, now = new Date()): string {
  const month = currentMonth(now);
  if (period === "month") return monthName(month);
  if (period === "year") return month.slice(0, 4);
  return "All time";
}

/** Spending per category over the rows' months, for the donut. Rows without a category are "To review". */
export function spendingSlices(rows: CategoryMonthRow[]): DonutSlice[] {
  const byKey = new Map<string, DonutSlice>();
  for (const row of rows) {
    const key = row.category_id ?? "review";
    const slice = byKey.get(key) ?? {
      key,
      label: row.category?.name ?? "To review",
      emoji: row.category ? (row.category.emoji ?? "🏷️") : "❓",
      colour: row.category?.colour ?? "cat-12",
      value: 0,
    };
    slice.value += row.total_cents ?? 0;
    byKey.set(key, slice);
  }
  return [...byKey.values()].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
}

/** The twelve months the trend shows, ending with this one. */
export function trendFrom(now = new Date()): { from: Month; to: Month } {
  const to = currentMonth(now);
  return { from: addMonths(to, -11), to };
}

// [3.5] Loan repayment allocation (R5): a share of the month's income goes to loans. The instalments of bills that
// pay off a loan (the car loan) are paid first, then the short-term loans, smallest balance first, so the most
// loans are cleared soonest. A plan only: nothing is paid or moved.

import type { MonthTotalsRow } from "@/features/month/month";
import { nairobiToday } from "@/lib/due";

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

/** This month's income in Nairobi time; early in a month with none yet, last month's, so the plan has a base. */
export function incomeBase(totals: readonly MonthTotalsRow[], now = new Date()) {
  const month = `${nairobiToday(now).slice(0, 7)}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const previous = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const income = (key: string) => totals.find((t) => t.month === key)?.income_cents ?? 0;
  const use = income(month) > 0 ? month : previous;
  return { cents: income(use), label: monthName.format(new Date(`${use}T00:00:00Z`)) };
}

export interface Instalment {
  id: string;
  name: string;
  emoji: string;
  /** The bill's amount for the month. */
  amountCents: number;
}

export interface ShortLoan {
  id: string;
  name: string;
  emoji: string;
  /** What is owed now, as a positive number. */
  owedCents: number;
}

/** paid: an instalment fully covered; cleared: a short loan paid off; part: some of it; none: nothing left for it. */
export type LineState = "paid" | "cleared" | "part" | "none";

export interface AllocationLine {
  id: string;
  name: string;
  emoji: string;
  kind: "instalment" | "short";
  cents: number;
  state: LineState;
}

export interface Allocation {
  budgetCents: number;
  lines: AllocationLine[];
  /** Left over once every instalment and short loan is covered. */
  unusedCents: number;
  /** Short-term debt still owed after this month's share. */
  shortLeftCents: number;
  /**
   * Months until the short-term loans are cleared if the same share goes to them each month after the
   * instalments: 0 when there is none, null when nothing is left for them after the instalments.
   */
  monthsToClear: number | null;
}

/** The budget for loans: pct (0–100) of income, in whole cents. */
export function loanBudget(incomeCents: number, pct: number): number {
  const p = Math.min(100, Math.max(0, Math.round(pct)));
  return Math.max(0, Math.round((incomeCents * p) / 100));
}

export function allocate(
  incomeCents: number,
  pct: number,
  instalments: readonly Instalment[],
  shortLoans: readonly ShortLoan[],
): Allocation {
  const budgetCents = loanBudget(incomeCents, pct);
  let left = budgetCents;
  const lines: AllocationLine[] = [];

  for (const i of instalments) {
    const cents = Math.min(left, i.amountCents);
    left -= cents;
    const state: LineState = cents >= i.amountCents ? "paid" : cents > 0 ? "part" : "none";
    lines.push({ id: i.id, name: i.name, emoji: i.emoji, kind: "instalment", cents, state });
  }

  const owing = shortLoans.filter((l) => l.owedCents > 0);
  const smallestFirst = [...owing].sort((a, b) => a.owedCents - b.owedCents || a.name.localeCompare(b.name));
  for (const l of smallestFirst) {
    const cents = Math.min(left, l.owedCents);
    left -= cents;
    const state: LineState = cents >= l.owedCents ? "cleared" : cents > 0 ? "part" : "none";
    lines.push({ id: l.id, name: l.name, emoji: l.emoji, kind: "short", cents, state });
  }

  const shortTotal = owing.reduce((t, l) => t + l.owedCents, 0);
  const paidToShort = lines.filter((l) => l.kind === "short").reduce((t, l) => t + l.cents, 0);
  const instalmentTotal = instalments.reduce((t, i) => t + i.amountCents, 0);
  const perMonth = budgetCents - instalmentTotal;

  return {
    budgetCents,
    lines,
    unusedCents: left,
    shortLeftCents: shortTotal - paidToShort,
    monthsToClear: shortTotal === 0 ? 0 : perMonth > 0 ? Math.ceil(shortTotal / perMonth) : null,
  };
}

/** "~3 months", "this month", or why not. */
export function clearText(a: Pick<Allocation, "monthsToClear">): string {
  if (a.monthsToClear === 0) return "No short-term loans to clear";
  if (a.monthsToClear === null) return "Nothing left for short-term loans after the instalments";
  if (a.monthsToClear === 1) return "Short-term loans clear this month";
  return `Short-term loans clear in ~${a.monthsToClear} months`;
}

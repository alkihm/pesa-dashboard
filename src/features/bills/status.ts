// [3.1] Bill status: what each month's bill row shows and the order to pay in. The colour rule is the shared one in
// src/lib/due.ts (ARCHITECTURE "Bill status"): overdue or due today → red, ≤3 days → orange, ≤7 → amber, later →
// blue; paid → green, skipped → grey. Nothing here is stored — it is worked out from `status` and today.

import type { Tone } from "@/components/StatusPill";
import { daysBetween, dueTone, formatDay, nairobiToday } from "@/lib/due";

export type BillMonthStatus = "due" | "paid" | "skipped";

/** The fields of a `bill_months` row the status needs. `viaSms` is true when the paying transaction came from an SMS. */
export interface BillMonthLike {
  due_on: string;
  amount_cents: number;
  status: BillMonthStatus;
  viaSms?: boolean;
}

export interface BillStatus {
  tone: Tone;
  text: string;
  /** Whole days from today to the due date; negative when overdue. Null once paid or skipped. */
  days: number | null;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function billStatus(row: BillMonthLike, now = new Date()): BillStatus {
  if (row.status === "paid")
    return { tone: "green", text: row.viaSms ? "✓ Paid · via SMS" : "✓ Paid", days: null };
  if (row.status === "skipped") return { tone: "grey", text: "Skipped", days: null };

  const days = daysBetween(nairobiToday(now), row.due_on);
  const tone = dueTone(days);
  if (days < 0) return { tone, text: `Overdue · ${plural(-days, "day")}`, days };
  if (days === 0) return { tone, text: "Due today", days };
  if (days <= 7) return { tone, text: `Due in ${plural(days, "day")}`, days };
  return { tone, text: `Due ${formatDay(row.due_on)}`, days };
}

const GROUP: Record<BillMonthStatus, number> = { due: 0, paid: 1, skipped: 2 };

/**
 * What to pay first: unpaid bills by due date (overdue first), then paid, then skipped. Ties go to the larger
 * amount, then the name, so the order is stable.
 */
export function sortBills<T extends BillMonthLike & { name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      GROUP[a.status] - GROUP[b.status] ||
      a.due_on.localeCompare(b.due_on) ||
      b.amount_cents - a.amount_cents ||
      a.name.localeCompare(b.name),
  );
}

export interface BillTotals {
  paidCents: number;
  toPayCents: number;
  skippedCents: number;
  /** Share of the month's bills (paid + to pay) already paid, 0–1. Skipped bills are left out. */
  paidShare: number;
  /** Available money minus what is still to pay; negative when the bills do not fit. */
  leftAfterPayingCents: number;
}

export function billTotals(rows: readonly BillMonthLike[], availableCents: number): BillTotals {
  let paidCents = 0;
  let toPayCents = 0;
  let skippedCents = 0;
  for (const r of rows) {
    if (r.status === "paid") paidCents += r.amount_cents;
    else if (r.status === "skipped") skippedCents += r.amount_cents;
    else toPayCents += r.amount_cents;
  }
  const billed = paidCents + toPayCents;
  return {
    paidCents,
    toPayCents,
    skippedCents,
    paidShare: billed === 0 ? 0 : paidCents / billed,
    leftAfterPayingCents: availableCents - toPayCents,
  };
}

export type BillFilter = "all" | "to-pay" | "paid";

export function filterBills<T extends BillMonthLike>(rows: readonly T[], filter: BillFilter): T[] {
  if (filter === "to-pay") return rows.filter((r) => r.status === "due");
  if (filter === "paid") return rows.filter((r) => r.status === "paid");
  return [...rows];
}

/** First day of the Nairobi month that `now` falls in, "2026-11-01". */
export function nairobiMonth(now = new Date()): string {
  return `${nairobiToday(now).slice(0, 7)}-01`;
}

// Due dates and their colours, shared by loans and cards ([2.3]) and bills ([3.1]). The colour comes from days to the
// due date (ARCHITECTURE "Bill status", D5): overdue or due today → red, ≤3 days → orange, ≤7 → amber, later → blue.
// Paid (green) and skipped (grey) are states the caller knows; they do not depend on the date.

import type { Tone } from "@/components/StatusPill";

const NAIROBI_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today in Nairobi as a calendar day, "2026-11-03". */
export function nairobiToday(now = new Date()): string {
  return new Date(now.getTime() + NAIROBI_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both "YYYY-MM-DD"; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * The next day a monthly payment on `dueDay` (1–31) falls due, today included. A day past the end of a month
 * falls on its last day (31 → 30 Nov, 28 or 29 Feb).
 */
export function nextDueOn(dueDay: number, now = new Date()): { on: string; days: number } {
  const today = nairobiToday(now);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const inMonth = (year: number, month: number) => {
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(dueDay, last))).toISOString().slice(0, 10);
  };
  const thisMonth = inMonth(y, m - 1);
  const on = daysBetween(today, thisMonth) >= 0 ? thisMonth : inMonth(y, m);
  return { on, days: daysBetween(today, on) };
}

export function dueTone(days: number): Tone {
  if (days <= 0) return "red";
  if (days <= 3) return "orange";
  if (days <= 7) return "amber";
  return "blue";
}

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "2026-11-08" → "8 Nov" (three-letter months, as on the boards). */
export function formatDay(on: string): string {
  const [day, month] = dayMonth.format(new Date(`${on}T00:00:00Z`)).split(" ") as [string, string];
  return `${day} ${month.slice(0, 3)}`;
}

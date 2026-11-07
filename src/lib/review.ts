// [4.3] Review status (R14): how long since the last completed review, against the owner's interval
// (settings.review_interval_days, default 3). Green inside the interval, amber once it has passed, red from twice the
// interval plus one day (7 days at the default) or while any account disagrees with its SMS or count. Days are
// Nairobi calendar days. Plain functions, tested on their own: the Review screen, the header dot and the [4.4]
// reminders share this wording.

import { daysBetween, formatDay, nairobiToday } from "./due";

export const DEFAULT_REVIEW_INTERVAL = 3;

export type ReviewTone = "green" | "amber" | "red";

export interface ReviewStatus {
  tone: ReviewTone;
  title: string;
  text: string;
  /** A few words for the header dot's label: "Review up to date", "Review due". */
  short: string;
  /** "Last done 29 Oct", "Last done today" or "No review yet". */
  last: string;
  /** The day the next review is due, "2026-11-10"; null before the first review. */
  nextOn: string | null;
  /** Calendar days since the last review; null before the first. */
  daysSince: number | null;
  interval: number;
}

export interface ReviewInput {
  /** completed_at of the latest completed review. */
  lastReviewedAt: string | null;
  intervalDays?: number | null;
  /** Accounts whose ledger disagrees with their latest reading ([4.1]). */
  mismatches: number;
  now?: Date;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function addDays(on: string, n: number): string {
  return new Date(Date.parse(`${on}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export const reviewInterval = (days?: number | null) =>
  days && days > 0 ? Math.round(days) : DEFAULT_REVIEW_INTERVAL;

/** The first day the status turns red without a review: twice the interval plus one day. */
export const redAfter = (interval: number) => 2 * interval + 1;

/** The legend under the status: "0–3 days", "3–7 days", "7+ days or a mismatch". */
export function reviewBands(intervalDays?: number | null): Record<ReviewTone, string> {
  const i = reviewInterval(intervalDays);
  return {
    green: `0–${i} days`,
    amber: `${i}–${redAfter(i)} days`,
    red: `${redAfter(i)}+ days or a mismatch`,
  };
}

export function reviewStatus({
  lastReviewedAt,
  intervalDays,
  mismatches,
  now = new Date(),
}: ReviewInput): ReviewStatus {
  const interval = reviewInterval(intervalDays);
  const lastOn = lastReviewedAt ? nairobiToday(new Date(lastReviewedAt)) : null;
  const daysSince = lastOn ? daysBetween(lastOn, nairobiToday(now)) : null;
  const nextOn = lastOn ? addDays(lastOn, interval) : null;
  const base = {
    last: lastOn ? `Last done ${daysSince === 0 ? "today" : formatDay(lastOn)}` : "No review yet",
    nextOn,
    daysSince,
    interval,
  };
  const ago = daysSince === null ? "" : daysSince === 0 ? "today" : `${plural(daysSince, "day")} ago`;

  if (mismatches > 0)
    return {
      ...base,
      tone: "red",
      title: "Needs reconciling",
      text:
        mismatches === 1
          ? "One account is off against its SMS or count."
          : `${mismatches} accounts are off against their SMS or count.`,
      short: "Needs reconciling",
    };
  if (daysSince === null)
    return {
      ...base,
      tone: "amber",
      title: "Review due",
      text: "No review yet. Check the accounts, then mark it reviewed.",
      short: "Review due",
    };
  if (daysSince >= redAfter(interval))
    return {
      ...base,
      tone: "red",
      title: "Review overdue",
      text: `Last review was ${ago}; the reminder is every ${plural(interval, "day")}.`,
      short: "Review overdue",
    };
  if (daysSince >= interval)
    return {
      ...base,
      tone: "amber",
      title: "Review due",
      text: `Last review was ${ago}; the reminder is every ${plural(interval, "day")}.`,
      short: "Review due",
    };
  return {
    ...base,
    tone: "green",
    title: "All good",
    text: `${daysSince === 0 ? "Reviewed today. " : ""}Next review ${formatDay(nextOn!)}.`,
    short: "Review up to date",
  };
}

export type ReviewResult = "all_match" | "fixed" | "left_open";

/** A completed review as History needs it. */
export interface ReviewRecord {
  id: string;
  completedAt: string;
  result: ReviewResult;
  /** Accounts left disagreeing when it was marked reviewed. */
  leftOpen: number;
}

export interface HistoryRow {
  id: string;
  /** "Today", "29 Oct". */
  day: string;
  note: string;
  tone: ReviewTone;
}

/**
 * History, newest first. A review that came more than the interval after the one before it was late, by the days
 * over; one that left accounts disagreeing is red, a late one amber.
 */
export function reviewHistory(
  records: readonly ReviewRecord[],
  intervalDays?: number | null,
  now = new Date(),
): HistoryRow[] {
  const interval = reviewInterval(intervalDays);
  const today = nairobiToday(now);
  return records.map((r, i) => {
    const on = nairobiToday(new Date(r.completedAt));
    const before = records[i + 1];
    const late = before ? daysBetween(nairobiToday(new Date(before.completedAt)), on) - interval : 0;
    const outcome =
      r.result === "left_open"
        ? `${r.leftOpen || "some"} left open`
        : r.result === "fixed"
          ? "gaps fixed"
          : "all match";
    return {
      id: r.id,
      day: on === today ? "Today" : formatDay(on),
      note: `${late > 0 ? `Late by ${plural(late, "day")}` : "Reviewed"} · ${outcome}`,
      tone: r.result === "left_open" ? "red" : late > 0 ? "amber" : "green",
    };
  });
}

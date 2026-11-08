// [4.4] Which notifications are due. Pure: the notify Edge Function gathers the facts, this decides what to send,
// and notification_log (unique per user, kind and ref) makes sure each one goes out once. Shared with the function
// through supabase/functions/_shared (scripts/sync-functions.mjs), so imports stay relative with .ts.

import { BIG_SPEND_CENTS, type AlertKey, type Alerts } from "./alerts.ts";

const NAIROBI_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** "2026-11-08", the Nairobi date of `at`. */
export const nairobiDate = (at: Date) => new Date(at.getTime() + NAIROBI_MS).toISOString().slice(0, 10);
const nairobiHour = (at: Date) => new Date(at.getTime() + NAIROBI_MS).getUTCHours();
const nairobiWeekday = (at: Date) => new Date(at.getTime() + NAIROBI_MS).getUTCDay(); // 0 = Sunday
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** Nothing is sent from 22:00 to 07:00 Nairobi time; what is due then goes out at 07:00. */
export function quietHours(now: Date) {
  const h = nairobiHour(now);
  return h >= 22 || h < 7;
}

export interface NotifyFacts {
  now: Date;
  alerts: Alerts;
  currency: string;
  reviewIntervalDays: number;
  /** Nairobi date of the last completed review, or null for none yet. */
  lastReviewOn: string | null;
  /** Accounts whose latest SMS balance differs from the ledger at that time. */
  mismatches: { accountId: string; name: string; differenceCents: number; snapshotAt: string }[];
  /** Bill months still owed. */
  bills: { id: string; name: string; dueOn: string; amountCents: number }[];
  /** Spending rows from the last day. */
  spends: { id: string; payee: string | null; amountCents: number; occurredAt: string }[];
  /** Spending over the last seven days, for the Sunday summary. */
  weekSpendingCents: number;
}

export interface Notice {
  kind: AlertKey;
  /** With kind, what makes it unique: the same notice is never sent twice. */
  ref: string;
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
}

const number = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });
const money = (cents: number, currency: string) => `${currency} ${number.format(Math.abs(cents) / 100)}`;
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const day = (date: string) => dayMonth.format(new Date(`${date}T00:00:00Z`));

/** Every notice that is due now and switched on; the caller drops those already in notification_log. */
export function dueNotices(f: NotifyFacts): Notice[] {
  const today = nairobiDate(f.now);
  const out: Notice[] = [];
  const on = (k: AlertKey) => f.alerts[k];

  if (on("review_due")) {
    const since = f.lastReviewOn ? daysBetween(f.lastReviewOn, today) : null;
    if (since === null || since > f.reviewIntervalDays)
      out.push({
        kind: "review_due",
        ref: `review:${today}`,
        title: "Time to review",
        body:
          since === null
            ? "You have not reviewed your accounts yet. It takes a minute."
            : `Last review was ${since} days ago; the reminder is every ${f.reviewIntervalDays} days.`,
        url: "/review",
      });
  }

  if (on("mismatch"))
    for (const m of f.mismatches.filter((m) => m.differenceCents !== 0))
      out.push({
        kind: "mismatch",
        ref: `mismatch:${m.accountId}:${m.snapshotAt}`,
        title: `${m.name} does not match its SMS`,
        body: `The ledger is off by ${money(m.differenceCents, f.currency)}. Open Review to fix it.`,
        url: "/review",
      });

  const tomorrow = addDays(today, 1);
  for (const b of f.bills) {
    if (on("bill_tomorrow") && b.dueOn === tomorrow)
      out.push({
        kind: "bill_tomorrow",
        ref: `tomorrow:${b.id}`,
        title: `${b.name} is due tomorrow`,
        body: `${money(b.amountCents, f.currency)} due ${day(b.dueOn)}.`,
        url: "/bills",
      });
    if (on("bill_overdue") && b.dueOn < today)
      out.push({
        kind: "bill_overdue",
        ref: `overdue:${b.id}`,
        title: `${b.name} is overdue`,
        body: `${money(b.amountCents, f.currency)} was due ${day(b.dueOn)}.`,
        url: "/bills",
      });
  }

  if (on("big_spend"))
    for (const s of f.spends)
      if (-s.amountCents >= BIG_SPEND_CENTS && f.now.getTime() - Date.parse(s.occurredAt) <= DAY_MS)
        out.push({
          kind: "big_spend",
          ref: `spend:${s.id}`,
          title: `Spent ${money(s.amountCents, f.currency)}`,
          body: `${s.payee?.trim() || "A payment"} · over ${money(BIG_SPEND_CENTS, f.currency)} in one go.`,
          url: `/activity/${s.id}`,
        });

  if (on("weekly_summary") && nairobiWeekday(f.now) === 0 && nairobiHour(f.now) >= 18)
    out.push({
      kind: "weekly_summary",
      ref: `week:${today}`,
      title: "Your week",
      body: `You spent ${money(f.weekSpendingCents, f.currency)} in the last seven days.`,
      url: "/month",
    });

  return out;
}

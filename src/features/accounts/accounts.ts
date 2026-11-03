// What the Accounts screens show for each account ([2.3]): which group it sits in, whether it agrees with its latest
// SMS or count (R15), a savings lock and goal, and a loan's or card's progress and next due date (D5 colours).

import type { Tone } from "@/components/StatusPill";
import type { Account } from "@/lib/data/accounts";
import { reconcileState } from "@/lib/balances";
import { dueTone, formatDay, nairobiToday, nextDueOn } from "@/lib/due";
import { formatAmount } from "@/lib/money";

export type Term = "short" | "long";

export const isEveryday = (a: Account) => a.kind === "wallet" || a.kind === "bank" || a.kind === "cash";
export const isSavings = (a: Account) => a.kind === "savings";
export const isDebt = (a: Account) => a.kind === "loan" || a.kind === "card";

export const balance = (a: Account) => a.balance_cents ?? 0;
/** What a loan or card owes, as a positive number; an overpaid one owes nothing. */
export const owed = (a: Account) => Math.max(0, -balance(a));

export function debtOf(accounts: Account[], term: Term) {
  return accounts.filter((a) => isDebt(a) && a.debt_term === term);
}

export interface Status {
  tone: Tone;
  text: string;
}

/** Whether the ledger agrees with the latest SMS (or the owner's count, for manual readings). */
export function matchStatus(a: Account): Status {
  const by = a.snapshot_source === "manual" ? "count" : "SMS";
  switch (reconcileState(a)) {
    case "match":
      return { tone: "green", text: `✓ Matches ${by}` };
    case "mismatch":
      return {
        tone: "red",
        text: `⚠ ${by === "SMS" ? by : "Count"} says ${formatAmount(a.snapshot_cents ?? 0)}`,
      };
    default:
      return { tone: "grey", text: a.sms_account_hint ? "No SMS yet" : "Manual" };
  }
}

const longDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Locked until a future day (fixed deposit, Sacco lock) or free to withdraw. */
export function lockOf(a: Account, now = new Date()): { locked: boolean; text: string } {
  if (a.locked_until && a.locked_until > nairobiToday(now)) {
    const [d, m, y] = longDay.format(new Date(`${a.locked_until}T00:00:00Z`)).split(" ") as [
      string,
      string,
      string,
    ];
    return { locked: true, text: `🔒 Until ${d} ${m.slice(0, 3)} ${y}` };
  }
  return { locked: false, text: "🔓 Withdraw any time" };
}

export interface Goal {
  label: string;
  savedCents: number;
  goalCents: number;
  /** 0–1. */
  fill: number;
  percent: number;
}

/** Progress towards the savings goals: one account's name, or "Savings goals" when there are several. */
export function goalOf(savings: Account[]): Goal | undefined {
  const withGoal = savings.filter((a) => (a.goal_cents ?? 0) > 0);
  if (!withGoal.length) return undefined;
  const savedCents = withGoal.reduce((t, a) => t + Math.max(0, balance(a)), 0);
  const goalCents = withGoal.reduce((t, a) => t + (a.goal_cents ?? 0), 0);
  const fill = Math.min(1, savedCents / goalCents);
  return {
    label: withGoal.length === 1 ? (withGoal[0]!.name ?? "Goal") : "Savings goals",
    savedCents,
    goalCents,
    fill,
    percent: Math.floor(fill * 100),
  };
}

export interface DebtRow {
  account: Account;
  owedCents: number;
  /** 0–1: share repaid of the principal, or for a card, share of the limit used. */
  fill: number | undefined;
  progress: string;
  due: (Status & { on: string; days: number }) | undefined;
}

export function debtRow(a: Account, now = new Date()): DebtRow {
  const owedCents = owed(a);
  let fill: number | undefined;
  let progress: string;
  if (a.kind === "card" && a.limit_cents) {
    fill = Math.min(1, owedCents / a.limit_cents);
    progress = `${Math.round(fill * 100)}% of limit ${formatAmount(a.limit_cents)} used`;
  } else if (a.original_cents) {
    fill = Math.min(1, Math.max(0, 1 - owedCents / a.original_cents));
    progress = `${Math.floor(fill * 100)}% repaid of ${formatAmount(a.original_cents)}`;
  } else {
    progress = owedCents === 0 ? "Nothing owed" : "Amount borrowed not set";
  }

  let due: DebtRow["due"];
  if (a.due_day && owedCents > 0) {
    const next = nextDueOn(a.due_day, now);
    due = {
      ...next,
      tone: dueTone(next.days),
      text: next.days === 0 ? "Due today" : `Due ${formatDay(next.on)}`,
    };
  }
  return { account: a, owedCents, fill, progress, due };
}

/** Loans and cards in order of the next due date; those with none go last. */
export function debtRows(accounts: Account[], now = new Date()): DebtRow[] {
  return accounts.map((a) => debtRow(a, now)).sort((x, y) => (x.due?.days ?? 99) - (y.due?.days ?? 99));
}

// [My plan] My plan: pure rules shared by the app (Home card, /plan) and the notify function (reminders). Copied to
// supabase/functions/_shared by scripts/sync-functions.mjs, so imports stay relative with .ts.
//
// A milestone is tracked one of three ways (plan_items.track):
//   manual      ticked by hand (done_at)
//   account     an account reaching target_cents: a loan or card owing at most the target, any other account
//               holding at least it
//   short_debt  total short-term debt owing at most target_cents
// Once done_at is set (by hand, or by notify when a tracked one is reached) it stays reached.

const NAIROBI_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export type Track = "manual" | "account" | "short_debt";

export interface PlanMilestone {
  id: string;
  title: string;
  emoji: string | null;
  targetOn: string | null;
  track: Track;
  accountId: string | null;
  targetCents: number | null;
  fromCents: number | null;
  doneAt: string | null;
  headline: boolean;
  sortOrder: number;
}

/** The parts of an account the plan needs. Debt accounts have negative balances. */
export interface PlanAccount {
  id: string;
  kind: string;
  balanceCents: number;
  /** A loan's principal, the start of its bar when the milestone has no from_cents. */
  originalCents: number | null;
}

export interface MilestoneProgress {
  reached: boolean;
  /** 0–1 for the bar. */
  fill: number;
  /** What is owed now (debt) or held now (savings), in cents; null for a manual milestone. */
  currentCents: number | null;
  isDebt: boolean;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const isDebtKind = (kind: string) => kind === "loan" || kind === "card";

/** A debt falling from `start` towards `target`: how far along it is. */
function debtProgress(
  owed: number,
  target: number,
  start: number | null,
  doneAt: string | null,
): MilestoneProgress {
  const reached = doneAt !== null || owed <= target;
  const fill = reached ? 1 : start !== null && start > target ? clamp((start - owed) / (start - target)) : 0;
  return { reached, fill, currentCents: owed, isDebt: true };
}

export function milestoneProgress(
  m: PlanMilestone,
  accounts: readonly PlanAccount[],
  shortDebtCents: number,
): MilestoneProgress {
  const done = m.doneAt !== null;
  if (m.track === "short_debt" && m.targetCents !== null)
    return debtProgress(shortDebtCents, m.targetCents, m.fromCents, m.doneAt);

  const account = m.track === "account" ? accounts.find((a) => a.id === m.accountId) : undefined;
  if (account && m.targetCents !== null) {
    if (isDebtKind(account.kind)) {
      const owed = Math.max(0, -account.balanceCents);
      return debtProgress(owed, m.targetCents, m.fromCents ?? account.originalCents, m.doneAt);
    }
    const held = account.balanceCents;
    const reached = done || held >= m.targetCents;
    const from = m.fromCents ?? 0;
    const fill = reached ? 1 : m.targetCents > from ? clamp((held - from) / (m.targetCents - from)) : 0;
    return { reached, fill, currentCents: held, isDebt: false };
  }

  // Manual, or an account milestone whose account is gone.
  return { reached: done, fill: done ? 1 : 0, currentCents: null, isDebt: false };
}

const byDate = (a: PlanMilestone, b: PlanMilestone) =>
  (a.targetOn ?? "9999-12-31").localeCompare(b.targetOn ?? "9999-12-31") || a.sortOrder - b.sortOrder;

/** Milestones in date order (undated last). */
export const sortMilestones = (ms: readonly PlanMilestone[]) => [...ms].sort(byDate);

/** The first milestone not reached yet, by date. */
export function nextMilestone<T extends PlanMilestone>(
  ms: readonly T[],
  reached: (m: T) => boolean,
): T | undefined {
  return [...ms].sort(byDate).find((m) => !reached(m));
}

/** "2026-11-23", the Nairobi date of `at`. */
export const planDate = (at: Date) => new Date(at.getTime() + NAIROBI_MS).toISOString().slice(0, 10);

/** Whole days from one date to another ("2026-11-23" → "2026-11-30" is 7). */
export const daysFrom = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * Days without new borrowing: since the last draw on a short-term loan (card spending and long-term loans do not
 * count), or since the plan started when there has been none.
 */
export function borrowStreakDays(lastDrawAt: string | null, startedOn: string, now: Date) {
  const today = planDate(now);
  const since = lastDrawAt ? planDate(new Date(lastDrawAt)) : startedOn;
  return Math.max(0, daysFrom(since, today));
}

const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const at = new Date(Date.UTC(y, m - 2, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

/**
 * The saving streak: months in a row, ending last month (or this month once it is met), with at least `target`
 * moved into savings. `saved` is keyed by budget month ("2026-11-01"); months before `firstMonth` do not count.
 */
export function savingStreak(
  saved: Readonly<Record<string, number>>,
  target: number,
  thisMonth: string,
  firstMonth: string,
) {
  const thisMonthCents = saved[thisMonth] ?? 0;
  let months = thisMonthCents >= target ? 1 : 0;
  for (let m = prevMonth(thisMonth); m >= firstMonth; m = prevMonth(m)) {
    if ((saved[m] ?? 0) < target) break;
    months++;
  }
  return { months, thisMonthCents };
}

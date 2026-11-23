// [My plan] What the Home card and /plan show, worked out from the accounts, the plan and the clock. Pure.

import { summarise } from "@/lib/balances";
import { budgetMonthOf } from "@/lib/budgetMonth";
import type { Account } from "@/lib/data/accounts";
import {
  borrowStreakDays,
  daysFrom,
  milestoneProgress,
  nextMilestone,
  planDate,
  savingStreak,
  sortMilestones,
  type MilestoneProgress,
  type PlanAccount,
} from "@/lib/notify/plan";
import type { Milestone, PlanData } from "./data";

export type MilestoneView = Milestone &
  MilestoneProgress & {
    /** Days from today to the target date; negative once it has passed; null when undated. */
    days: number | null;
  };

export interface PlanView {
  milestones: MilestoneView[];
  next?: MilestoneView;
  /** The big countdown on /plan: the headline milestone, else the next one. */
  headline?: MilestoneView;
  /** Up to three tracked milestones for the Home bars, the unreached first. */
  bars: MilestoneView[];
  borrowDays: number;
  saving: { months: number; thisMonthCents: number; targetCents: number } | null;
}

export const planAccounts = (accounts: readonly Account[]): PlanAccount[] =>
  accounts.map((a) => ({
    id: a.account_id,
    kind: a.kind ?? "",
    balanceCents: a.balance_cents ?? 0,
    originalCents: a.original_cents,
  }));

export function planView(accounts: Account[], data: PlanData, now = new Date()): PlanView {
  const today = planDate(now);
  const shortDebt = summarise(accounts).shortDebtCents;
  const pa = planAccounts(accounts);
  const milestones: MilestoneView[] = sortMilestones(data.milestones).map((m) => ({
    ...(m as Milestone),
    ...milestoneProgress(m, pa, shortDebt),
    days: m.targetOn ? daysFrom(today, m.targetOn) : null,
  }));
  const next = nextMilestone(milestones, (m) => m.reached);
  const headline = milestones.find((m) => m.headline && !m.reached) ?? next;
  const tracked = milestones.filter((m) => m.track !== "manual" && m.currentCents !== null);
  const bars = [...tracked.filter((m) => !m.reached), ...tracked.filter((m) => m.reached)].slice(0, 3);

  const plan = data.plan;
  const borrowDays = borrowStreakDays(data.lastDrawAt, plan?.startedOn ?? today, now);
  const saving =
    plan?.savingTargetCents != null
      ? {
          ...savingStreak(
            data.savedByMonth,
            plan.savingTargetCents,
            budgetMonthOf(now),
            budgetMonthOf(new Date(`${plan.startedOn}T12:00:00+03:00`)),
          ),
          targetCents: plan.savingTargetCents,
        }
      : null;

  return { milestones, next, headline, bars, borrowDays, saving };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "7 days", "Today", "3 days ago". */
export function countdownText(days: number | null) {
  if (days === null) return "No date";
  if (days === 0) return "Today";
  return days > 0 ? plural(days, "day") : `${plural(-days, "day")} ago`;
}

export const streakText = {
  borrow: (days: number) => `${plural(days, "day")} without borrowing`,
  saving: (months: number) =>
    months === 0 ? "Saving streak starts this month" : `${plural(months, "month")} saving in a row`,
};

/** "2,500" or "0" → cents; anything else → undefined. Zero is allowed (a debt target). */
export function typedCents(text: string) {
  const clean = text.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return undefined;
  return Math.round(Number(clean) * 100);
}

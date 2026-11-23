import { describe, expect, it } from "vitest";

import { alertsFrom } from "./alerts";
import {
  borrowStreakDays,
  daysFrom,
  milestoneProgress,
  nextMilestone,
  savingStreak,
  type PlanAccount,
  type PlanMilestone,
} from "./plan";
import { dueNotices, type NotifyFacts, type PlanFacts } from "./rules";

const KES = 100;

const milestone = (over: Partial<PlanMilestone> & { id: string }): PlanMilestone => ({
  title: over.id,
  emoji: null,
  targetOn: null,
  track: "manual",
  accountId: null,
  targetCents: null,
  fromCents: null,
  doneAt: null,
  headline: false,
  sortOrder: 0,
  ...over,
});

const accounts: PlanAccount[] = [
  { id: "fund", kind: "savings", balanceCents: 30_000 * KES, originalCents: null },
  { id: "car", kind: "loan", balanceCents: -600_000 * KES, originalCents: 1_000_000 * KES },
  { id: "card", kind: "card", balanceCents: 0, originalCents: null },
];

describe("milestone progress", () => {
  it("a manual milestone is reached when ticked", () => {
    expect(milestoneProgress(milestone({ id: "m" }), accounts, 0)).toMatchObject({ reached: false, fill: 0 });
    expect(
      milestoneProgress(milestone({ id: "m", doneAt: "2026-11-23T10:00:00Z" }), accounts, 0),
    ).toMatchObject({
      reached: true,
      fill: 1,
    });
  });

  it("a savings milestone fills towards its target", () => {
    const p = milestoneProgress(
      milestone({ id: "f", track: "account", accountId: "fund", targetCents: 120_000 * KES }),
      accounts,
      0,
    );
    expect(p).toEqual({ reached: false, fill: 0.25, currentCents: 30_000 * KES, isDebt: false });
  });

  it("a loan milestone runs from its principal to the target", () => {
    const p = milestoneProgress(
      milestone({ id: "c", track: "account", accountId: "car", targetCents: 0 }),
      accounts,
      0,
    );
    expect(p).toEqual({ reached: false, fill: 0.4, currentCents: 600_000 * KES, isDebt: true });
  });

  it("a card owing nothing has reached a zero target", () => {
    expect(
      milestoneProgress(
        milestone({ id: "k", track: "account", accountId: "card", targetCents: 0 }),
        accounts,
        0,
      ).reached,
    ).toBe(true);
  });

  it("short-term debt uses the total and the starting figure", () => {
    const m = milestone({ id: "s", track: "short_debt", targetCents: 0, fromCents: 400_000 * KES });
    expect(milestoneProgress(m, accounts, 100_000 * KES)).toMatchObject({ reached: false, fill: 0.75 });
    expect(milestoneProgress(m, accounts, 0)).toMatchObject({ reached: true, fill: 1 });
  });

  it("an account milestone whose account is gone falls back to manual", () => {
    expect(
      milestoneProgress(
        milestone({ id: "x", track: "account", accountId: null, targetCents: 5 }),
        accounts,
        0,
      ),
    ).toMatchObject({ reached: false, currentCents: null });
  });

  it("once ticked it stays reached even if the figure slips back", () => {
    const m = milestone({ id: "s", track: "short_debt", targetCents: 0, doneAt: "2026-11-30T09:00:00Z" });
    expect(milestoneProgress(m, accounts, 5_000 * KES).reached).toBe(true);
  });
});

describe("next milestone", () => {
  it("is the earliest by date that is not reached; undated ones come last", () => {
    const ms = [
      milestone({ id: "later", targetOn: "2027-03-25" }),
      milestone({ id: "undated" }),
      milestone({ id: "done", targetOn: "2026-11-23", doneAt: "2026-11-23T00:00:00Z" }),
      milestone({ id: "soon", targetOn: "2026-11-30" }),
    ];
    expect(nextMilestone(ms, (m) => m.doneAt !== null)?.id).toBe("soon");
  });
});

describe("streaks", () => {
  const now = new Date("2026-11-30T09:00:00Z"); // 12:00 Nairobi

  it("counts days without borrowing since the last draw, else since the plan started", () => {
    expect(borrowStreakDays("2026-11-15T20:00:00Z", "2026-11-23", now)).toBe(15);
    expect(borrowStreakDays(null, "2026-11-23", now)).toBe(7);
    expect(borrowStreakDays("2026-11-29T22:00:00Z", "2026-11-23", now)).toBe(0); // 01:00 on the 30th in Nairobi
  });

  it("counts months in a row with the saving target met", () => {
    const saved = { "2026-11-01": 15_000 * KES, "2026-12-01": 16_000 * KES, "2027-01-01": 4_000 * KES };
    expect(savingStreak(saved, 15_000 * KES, "2027-01-01", "2026-11-01")).toEqual({
      months: 2,
      thisMonthCents: 4_000 * KES,
    });
    expect(
      savingStreak({ ...saved, "2027-01-01": 15_000 * KES }, 15_000 * KES, "2027-01-01", "2026-11-01").months,
    ).toBe(3);
    expect(
      savingStreak({ "2026-10-01": 99_000 * KES }, 15_000 * KES, "2026-11-01", "2026-11-01").months,
    ).toBe(0);
  });

  it("measures whole days", () => {
    expect(daysFrom("2026-11-23", "2027-03-25")).toBe(122);
  });
});

// Reminders. 23 Dec 2026, 09:00 Nairobi.
const NOW = new Date("2026-12-23T06:00:00Z");
const plan = (over: Partial<PlanFacts> = {}): PlanFacts => ({
  why: "Debt-free first, then build.",
  savingTargetCents: 15_000 * KES,
  payday: 23,
  milestones: [],
  ...over,
});
const facts = (p: PlanFacts | null, now = NOW, alerts = {}): NotifyFacts => ({
  now,
  alerts: alertsFrom(alerts),
  currency: "KES",
  reviewIntervalDays: 3,
  lastReviewOn: "2026-12-23",
  mismatches: [],
  bills: [],
  spends: [],
  weekSpendingCents: 0,
  lastSmsAt: "2026-12-23T05:30:00Z",
  smsDay: { parsed: 5, toReview: 0 },
  plan: p,
});
const planOnly = (f: NotifyFacts) => dueNotices(f).filter((n) => n.kind.startsWith("plan_"));

describe("My plan reminders", () => {
  it("nudges on payday from 08:00 with the saving target and the countdown", () => {
    const p = plan({
      milestones: [
        { ...milestone({ id: "loan", title: "Staff loan cleared", targetOn: "2027-03-25" }), reached: false },
      ],
    });
    expect(planOnly(facts(p))).toEqual([
      {
        kind: "plan_payday",
        ref: "payday:2026-12",
        title: "💸 Payday: pay yourself first",
        body: "Move KES 15,000 to savings before anything else. 92 days to staff loan cleared.",
        url: "/plan",
      },
    ]);
    expect(planOnly(facts(p, new Date("2026-12-23T04:30:00Z")))).toEqual([]); // 07:30
    expect(planOnly(facts(p, new Date("2026-12-22T06:00:00Z")))).toEqual([]); // the day before
  });

  it("moves payday to the month's last day when the month is shorter", () => {
    const p = plan({ payday: 31 });
    expect(planOnly(facts(p, new Date("2027-02-28T06:00:00Z"))).map((n) => n.ref)).toEqual([
      "payday:2027-02",
    ]);
  });

  it("warns a week before a milestone and announces it when reached", () => {
    const p = plan({
      payday: null,
      milestones: [
        { ...milestone({ id: "a", title: "Fund full", targetOn: "2026-12-30" }), reached: false },
        { ...milestone({ id: "b", title: "Debt cleared", targetOn: "2026-12-20" }), reached: true },
        { ...milestone({ id: "c", title: "Old win", doneAt: "2026-11-01T00:00:00Z" }), reached: true },
      ],
    });
    expect(planOnly(facts(p)).map((n) => [n.ref, n.body])).toEqual([
      ["soon:a", "Fund full · 30 Dec. Your why: Debt-free first, then build."],
      ["reached:b", "Debt cleared. Next: Fund full."],
    ]);
  });

  it("respects the switches and sends nothing without a plan", () => {
    expect(planOnly(facts(plan(), NOW, { plan_payday: false }))).toEqual([]);
    expect(planOnly(facts(null))).toEqual([]);
  });
});

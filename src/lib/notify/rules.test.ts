import { describe, expect, it } from "vitest";

import { alertsFrom } from "./alerts";
import { dueNotices, nairobiDate, quietHours, type NotifyFacts } from "./rules";

// Wednesday 12 Nov 2026, 09:00 Nairobi.
const NOW = new Date("2026-11-12T06:00:00Z");

const facts = (over: Partial<NotifyFacts> = {}): NotifyFacts => ({
  now: NOW,
  alerts: alertsFrom({}),
  currency: "KES",
  reviewIntervalDays: 3,
  lastReviewOn: "2026-11-11",
  mismatches: [],
  bills: [],
  spends: [],
  weekSpendingCents: 0,
  ...over,
});

const kinds = (f: NotifyFacts) => dueNotices(f).map((n) => n.kind);

describe("when to stay quiet", () => {
  it("sends nothing from 22:00 to 07:00 Nairobi", () => {
    expect(quietHours(new Date("2026-11-12T18:59:00Z"))).toBe(false); // 21:59
    expect(quietHours(new Date("2026-11-12T19:00:00Z"))).toBe(true); // 22:00
    expect(quietHours(new Date("2026-11-12T03:59:00Z"))).toBe(true); // 06:59
    expect(quietHours(new Date("2026-11-12T04:00:00Z"))).toBe(false); // 07:00
  });

  it("uses the Nairobi date", () => {
    expect(nairobiDate(new Date("2026-11-12T21:30:00Z"))).toBe("2026-11-13");
  });
});

describe("what is due", () => {
  it("nothing on a quiet day", () => {
    expect(dueNotices(facts())).toEqual([]);
  });

  it("a review once the interval has passed, once a day", () => {
    expect(kinds(facts({ lastReviewOn: "2026-11-09" }))).toEqual([]); // 3 days: still inside
    const [n] = dueNotices(facts({ lastReviewOn: "2026-11-08" }));
    expect(n).toMatchObject({ kind: "review_due", ref: "review:2026-11-12", url: "/review" });
    expect(n!.body).toBe("Last review was 4 days ago; the reminder is every 3 days.");
    expect(dueNotices(facts({ lastReviewOn: null }))[0]!.body).toMatch(/not reviewed/);
  });

  it("a mismatch once per account and SMS reading", () => {
    const [n] = dueNotices(
      facts({
        mismatches: [
          { accountId: "a1", name: "Bank", differenceCents: -250_000, snapshotAt: "2026-11-11T10:00:00Z" },
        ],
      }),
    );
    expect(n).toMatchObject({
      kind: "mismatch",
      ref: "mismatch:a1:2026-11-11T10:00:00Z",
      title: "Bank does not match its SMS",
    });
    expect(n!.body).toBe("The ledger is off by KES 2,500. Open Review to fix it.");
  });

  it("a bill the day before it is due, and once when overdue", () => {
    const bills = [
      { id: "m1", name: "Rent", dueOn: "2026-11-13", amountCents: 1_250_000 },
      { id: "m2", name: "Water", dueOn: "2026-11-10", amountCents: 80_000 },
      { id: "m3", name: "Power", dueOn: "2026-11-12", amountCents: 300_000 },
    ];
    const due = dueNotices(facts({ bills }));
    expect(due.map((n) => [n.kind, n.ref])).toEqual([
      ["bill_tomorrow", "tomorrow:m1"],
      ["bill_overdue", "overdue:m2"],
    ]);
    expect(due[0]!.body).toBe("KES 12,500 due 13 Nov.");
  });

  it("a single spend of 10,000 or more from the last day", () => {
    const spends = [
      { id: "t1", payee: "Garage", amountCents: -1_200_000, occurredAt: "2026-11-12T05:00:00Z" },
      { id: "t2", payee: "Shop", amountCents: -999_900, occurredAt: "2026-11-12T05:00:00Z" },
      { id: "t3", payee: "Old", amountCents: -5_000_000, occurredAt: "2026-11-10T05:00:00Z" },
    ];
    const due = dueNotices(facts({ spends, currency: "UGX" }));
    expect(due).toEqual([
      expect.objectContaining({
        kind: "big_spend",
        ref: "spend:t1",
        title: "Spent UGX 12,000",
        url: "/activity/t1",
      }),
    ]);
  });

  it("the weekly summary on Sunday evening only", () => {
    const sunday = new Date("2026-11-15T15:00:00Z"); // 18:00 Nairobi
    expect(
      kinds(
        facts({
          now: sunday,
          alerts: alertsFrom({ weekly_summary: true }),
          weekSpendingCents: 4_200_000,
          lastReviewOn: "2026-11-14",
        }),
      ),
    ).toEqual(["weekly_summary"]);
    expect(
      kinds(
        facts({
          now: new Date("2026-11-15T14:59:00Z"),
          alerts: alertsFrom({ weekly_summary: true }),
          lastReviewOn: "2026-11-14",
        }),
      ),
    ).toEqual([]);
    expect(kinds(facts({ now: sunday, lastReviewOn: "2026-11-14" }))).toEqual([]); // off by default
  });

  it("nothing for an alert switched off", () => {
    const off = alertsFrom({ review_due: false, bill_overdue: false });
    expect(
      kinds(
        facts({
          alerts: off,
          lastReviewOn: "2026-11-01",
          bills: [{ id: "m2", name: "Water", dueOn: "2026-11-10", amountCents: 1 }],
        }),
      ),
    ).toEqual([]);
  });
});

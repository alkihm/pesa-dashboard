import type { Account } from "@/lib/data/accounts";
import { checklist, reviewChecks, reviewResult, toRecords } from "./data";
import { reconcileRow } from "./reconcile";

// Invented accounts: only the fields the checks read.
const account = (id: string, balance: number, reading: number | null, hint: string | null = "sms") =>
  ({
    account_id: id,
    name: id,
    balance_cents: balance,
    snapshot_at: reading === null ? null : "2026-11-06T07:00:00Z",
    snapshot_cents: reading,
    snapshot_source: reading === null ? null : "sms",
    difference_cents: reading === null ? null : reading - balance,
    sms_account_hint: hint,
  }) as unknown as Account;

describe("reviewChecks", () => {
  const rows = [account("ok", 500, 500), account("off", 900, 700), account("cash", 300, null, null)].map(
    reconcileRow,
  );

  it("checks every account with a reading and skips the ones without", () => {
    expect(reviewChecks(rows, new Set())).toEqual([
      { account_id: "ok", ledger_cents: 500, stated_cents: 500, resolution: "matched" },
      { account_id: "off", ledger_cents: 900, stated_cents: 700, resolution: "left_open" },
    ]);
  });

  it("records an account adjusted during the visit", () => {
    expect(reviewChecks(rows.slice(0, 1), new Set(["ok"]))[0]!.resolution).toBe("adjustment");
  });
});

describe("reviewResult", () => {
  it("is left open while anything is, fixed after an adjustment, else all match", () => {
    expect(reviewResult([{ resolution: "matched" }, { resolution: "left_open" }])).toBe("left_open");
    expect(reviewResult([{ resolution: "matched" }, { resolution: "adjustment" }])).toBe("fixed");
    expect(reviewResult([{ resolution: "matched" }])).toBe("all_match");
    expect(reviewResult([])).toBe("all_match");
  });
});

describe("checklist", () => {
  it("is all ticked when nothing is waiting", () => {
    expect(checklist(0, { toReview: 0, billsOverdue: 0, billsThisWeek: 0 })).toEqual([
      { key: "balances", done: true, text: "All balances match" },
      { key: "categories", done: true, text: "Everything categorised" },
      { key: "bills", done: true, text: "No bills overdue" },
    ]);
  });

  it("names what is waiting and where to fix it", () => {
    expect(checklist(2, { toReview: 1, billsOverdue: 3, billsThisWeek: 1 })).toEqual([
      { key: "balances", done: false, text: "2 balances are off" },
      { key: "categories", done: false, text: "1 transaction to categorise", fix: "/activity" },
      { key: "bills", done: false, text: "3 bills overdue", fix: "/bills" },
    ]);
    expect(checklist(0, { toReview: 0, billsOverdue: 0, billsThisWeek: 2 })[2]!.text).toBe(
      "No bills overdue · 2 bills due this week",
    );
  });
});

describe("toRecords", () => {
  it("counts the accounts left open and drops unfinished reviews", () => {
    expect(
      toRecords([
        {
          id: "a",
          completed_at: "2026-11-06T17:00:00Z",
          result: "left_open",
          review_checks: [{ resolution: "left_open" }, { resolution: "matched" }],
        },
        { id: "b", completed_at: null, result: null, review_checks: [] },
      ]),
    ).toEqual([{ id: "a", completedAt: "2026-11-06T17:00:00Z", result: "left_open", leftOpen: 1 }]);
  });
});

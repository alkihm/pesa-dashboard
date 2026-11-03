import type { Account } from "@/lib/data/accounts";
import { debtRow, debtRows, goalOf, lockOf, matchStatus } from "./accounts";

const KES = 100;
const NOW = new Date("2026-11-03T09:00:00Z");

function account(over: Partial<Account> & { account_id: string }): Account {
  return {
    user_id: "u",
    name: over.account_id,
    emoji: null,
    kind: "wallet",
    debt_term: null,
    counts_in_net: true,
    balance_cents: 0,
    archived_at: null,
    sort_order: 0,
    last_activity: null,
    snapshot_at: null,
    snapshot_cents: null,
    snapshot_source: null,
    difference_cents: null,
    goal_cents: null,
    locked_until: null,
    due_day: null,
    original_cents: null,
    limit_cents: null,
    sms_account_hint: null,
    ...over,
  };
}

describe("SMS match", () => {
  it("agrees, disagrees or has nothing to compare", () => {
    const read = {
      snapshot_at: "2026-11-02T10:00:00Z",
      snapshot_source: "sms",
      snapshot_cents: 61_700 * KES,
    };
    expect(matchStatus(account({ account_id: "a", ...read, difference_cents: 0 }))).toEqual({
      tone: "green",
      text: "✓ Matches SMS",
    });
    expect(matchStatus(account({ account_id: "b", ...read, difference_cents: 2_500 * KES }))).toEqual({
      tone: "red",
      text: "⚠ SMS says 61,700",
    });
    expect(
      matchStatus(account({ account_id: "c", ...read, snapshot_source: "manual", difference_cents: 0 })).text,
    ).toBe("✓ Matches count");
    expect(matchStatus(account({ account_id: "d", sms_account_hint: "mpesa" })).text).toBe("No SMS yet");
    expect(matchStatus(account({ account_id: "e", kind: "cash" })).text).toBe("Manual");
  });
});

describe("savings", () => {
  it("is locked only until a future day", () => {
    expect(lockOf(account({ account_id: "a", locked_until: "2027-01-15" }), NOW)).toEqual({
      locked: true,
      text: "🔒 Until 15 Jan 2027",
    });
    expect(lockOf(account({ account_id: "b", locked_until: "2026-11-03" }), NOW).locked).toBe(false);
    expect(lockOf(account({ account_id: "c" }), NOW).text).toBe("🔓 Withdraw any time");
  });

  it("sums progress towards the goals", () => {
    const fund = account({
      account_id: "f",
      name: "Rainy day",
      balance_cents: 250_000 * KES,
      goal_cents: 300_000 * KES,
    });
    expect(goalOf([fund, account({ account_id: "g", balance_cents: 9 * KES })])).toEqual({
      label: "Rainy day",
      savedCents: 250_000 * KES,
      goalCents: 300_000 * KES,
      fill: 250 / 300,
      percent: 83,
    });
    const other = account({ account_id: "h", balance_cents: 50_000 * KES, goal_cents: 20_000 * KES });
    expect(goalOf([fund, other])).toMatchObject({ label: "Savings goals", percent: 93 });
    expect(goalOf([account({ account_id: "i" })])).toBeUndefined();
  });
});

describe("debt", () => {
  const loan = (over: Partial<Account> & { account_id: string }) =>
    account({ kind: "loan", debt_term: "short", ...over });

  it("shows how much of a loan is repaid and when it is next due", () => {
    const row = debtRow(
      loan({ account_id: "l", balance_cents: -4_320 * KES, original_cents: 6_000 * KES, due_day: 4 }),
      NOW,
    );
    expect(row).toMatchObject({ owedCents: 4_320 * KES, fill: 0.28, progress: "28% repaid of 6,000" });
    expect(row.due).toEqual({ on: "2026-11-04", days: 1, tone: "orange", text: "Due 4 Nov" });
  });

  it("shows a card's share of its limit", () => {
    const card = account({
      account_id: "c",
      kind: "card",
      debt_term: "long",
      balance_cents: -46_500 * KES,
      limit_cents: 100_000 * KES,
    });
    expect(debtRow(card, NOW)).toMatchObject({
      fill: 0.465,
      progress: "47% of limit 100,000 used",
      due: undefined,
    });
  });

  it("colours the due tag as bills do and puts the soonest first", () => {
    const rows = debtRows(
      [
        loan({ account_id: "later", balance_cents: -1, due_day: 20 }),
        loan({ account_id: "none", balance_cents: -1 }),
        loan({ account_id: "today", balance_cents: -1, due_day: 3 }),
        loan({ account_id: "week", balance_cents: -1, due_day: 9 }),
        loan({ account_id: "paid", balance_cents: 0, due_day: 5 }),
      ],
      NOW,
    );
    expect(rows.map((r) => [r.account.account_id, r.due?.tone, r.due?.text])).toEqual([
      ["today", "red", "Due today"],
      ["week", "amber", "Due 9 Nov"],
      ["later", "blue", "Due 20 Nov"],
      ["none", undefined, undefined],
      ["paid", undefined, undefined],
    ]);
    expect(rows[4]!.progress).toBe("Nothing owed");
  });
});

import type { Account } from "@/lib/data/accounts";
import { adjustmentRow, missingTransactionLink, reasonProblem } from "./fix";

const KES = 100;

const account = (difference: number): Account => ({
  user_id: "u",
  account_id: "acc-1",
  name: "Wallet B",
  emoji: null,
  kind: "wallet",
  debt_term: null,
  counts_in_net: true,
  balance_cents: 1_000 * KES,
  archived_at: null,
  sort_order: 0,
  last_activity: null,
  // 21:30 UTC is 00:30 the next day in Nairobi.
  snapshot_at: "2026-10-30T21:30:00Z",
  snapshot_cents: (1_000 + difference) * KES,
  snapshot_source: "sms",
  difference_cents: difference * KES,
  goal_cents: null,
  locked_until: null,
  due_day: null,
  original_cents: null,
  limit_cents: null,
  sms_account_hint: "mpesa",
});

describe("missingTransactionLink", () => {
  it("asks for money out when the ledger is higher, dated on the SMS's Nairobi day", () => {
    const url = new URL(missingTransactionLink(account(-300)), "http://app");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      direction: "out",
      amount: String(300 * KES),
      date: "2026-10-31",
      at: "2026-10-30T21:30:00Z",
      back: "/review",
    });
  });

  it("asks for money in when the ledger is lower", () => {
    expect(new URL(missingTransactionLink(account(450)), "http://app").searchParams.get("direction")).toBe(
      "in",
    );
  });
});

describe("adjustment", () => {
  it("is the difference, at the reading's time, with the reason kept", () => {
    expect(adjustmentRow(account(-300), "  Fee not in SMS  ")).toEqual({
      account_id: "acc-1",
      amount_cents: -300 * KES,
      kind: "adjustment",
      reason: "Fee not in SMS",
      source: "manual",
      payee: "Balance adjustment",
      occurred_at: "2026-10-30T21:30:00Z",
    });
  });

  it("needs a reason", () => {
    expect(reasonProblem(" ")).toMatch(/Say why/);
    expect(reasonProblem("Counted cash")).toBeUndefined();
  });
});

import type { Account } from "@/lib/data/accounts";
import { banner, reconcileRow, reconcileRows } from "./reconcile";

const KES = 100;

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

// 20:30 UTC on 30 Oct is 23:30 on 30 Oct in Nairobi; 21:30 UTC is already 31 Oct there.
const sms = (cents: number, difference: number, at = "2026-10-30T21:30:00Z") => ({
  snapshot_at: at,
  snapshot_source: "sms",
  snapshot_cents: cents * KES,
  difference_cents: difference * KES,
});

describe("reconcileRow", () => {
  it("matches, with the reading's Nairobi day", () => {
    expect(
      reconcileRow(account({ account_id: "Wallet A", balance_cents: 18_450 * KES, ...sms(18_450, 0) })),
    ).toMatchObject({
      state: "match",
      pill: { tone: "green", text: "✓ Match" },
      detail: "18,450 · SMS 31 Oct",
    });
  });

  it("shows a mismatch in red and says which way the ledger is off", () => {
    const higher = reconcileRow(
      account({ account_id: "Bank current", balance_cents: 64_200 * KES, ...sms(61_700, -2_500) }),
    );
    expect(higher).toMatchObject({
      state: "mismatch",
      pill: { tone: "red", text: "⚠ −2,500" },
      detail: "Ledger 64,200 · SMS 61,700",
      explanation: "Bank current: ledger is 2,500 higher than the SMS. A payment may not have sent an SMS.",
    });

    const lower = reconcileRow(
      account({ account_id: "Wallet B", balance_cents: 1_000 * KES, ...sms(1_300, 300) }),
    );
    expect(lower.pill.text).toBe("⚠ +300");
    expect(lower.explanation).toBe(
      "Wallet B: ledger is 300 lower than the SMS. Money may have come in without an SMS.",
    );
  });

  it("handles cash and other manual accounts", () => {
    const counted = { snapshot_at: "2026-10-28T08:00:00Z", snapshot_source: "manual" };
    expect(
      reconcileRow(
        account({
          account_id: "Cash",
          kind: "cash",
          balance_cents: 3_500 * KES,
          ...counted,
          snapshot_cents: 3_500 * KES,
          difference_cents: 0,
        }),
      ),
    ).toMatchObject({ state: "match", detail: "3,500 · counted 28 Oct" });

    const off = reconcileRow(
      account({
        account_id: "Cash",
        kind: "cash",
        balance_cents: 1_800 * KES,
        ...counted,
        snapshot_cents: 1_700 * KES,
        difference_cents: -100 * KES,
      }),
    );
    expect(off.detail).toBe("Ledger 1,800 · Count 1,700");
    expect(off.explanation).toBe(
      "Cash: ledger is 100 higher than the count. Something may have been spent without being recorded.",
    );

    expect(
      reconcileRow(account({ account_id: "Cash", kind: "cash", balance_cents: 500 * KES })),
    ).toMatchObject({
      state: "manual",
      pill: { tone: "grey", text: "Manual" },
      detail: "500 · not counted yet",
    });
    expect(
      reconcileRow(account({ account_id: "Wallet C", sms_account_hint: "airtel-money" })).pill.text,
    ).toBe("No SMS yet");
  });
});

describe("banner", () => {
  const ok = account({ account_id: "Wallet A", ...sms(10, 0) });
  const bank = account({ account_id: "Bank current", ...sms(61_700, -2_500) });
  const cash = account({ account_id: "Cash", kind: "cash" });

  it("is red and names the account that is off", () => {
    expect(banner(reconcileRows([ok, bank, cash]))).toEqual({
      tone: "red",
      title: "Needs reconciling",
      text: "Bank current is off by 2,500 against its SMS balance.",
    });
    const wallet = account({ account_id: "Wallet B", ...sms(5, 1) });
    expect(banner(reconcileRows([bank, wallet])).text).toBe("2 accounts are off: Bank current, Wallet B.");
  });

  it("is green when every reading agrees, and counts accounts without one", () => {
    expect(banner(reconcileRows([ok]))).toMatchObject({ tone: "green", title: "All balances match" });
    expect(banner(reconcileRows([ok, cash])).text).toBe(
      "Every reading agrees with the ledger. 1 account has no reading yet.",
    );
  });
});

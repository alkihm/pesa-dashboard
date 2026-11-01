import { reconcileState, summarise, type AccountBalance } from "./balances";

// The seed's October 2026 (supabase/seed.sql), as the view returns it.
const row = (r: Partial<AccountBalance> & Pick<AccountBalance, "account_id" | "kind">): AccountBalance => ({
  user_id: "u",
  name: r.account_id,
  debt_term: null,
  counts_in_net: true,
  balance_cents: 0,
  last_activity: null,
  snapshot_at: null,
  snapshot_cents: null,
  difference_cents: null,
  emoji: null,
  sort_order: 0,
  archived_at: null,
  snapshot_source: null,
  ...r,
});

const october: AccountBalance[] = [
  row({
    account_id: "mpesa",
    kind: "wallet",
    balance_cents: 93600,
    snapshot_at: "2026-10-12T10:30:00Z",
    snapshot_cents: 93600,
    difference_cents: 0,
  }),
  row({
    account_id: "kcb",
    kind: "bank",
    balance_cents: 11150000,
    snapshot_at: "2026-10-20T06:05:00Z",
    snapshot_cents: 11150000,
    difference_cents: 0,
  }),
  row({
    account_id: "cash",
    kind: "cash",
    balance_cents: 180000,
    snapshot_at: "2026-10-25T16:00:00Z",
    snapshot_cents: 170000,
    difference_cents: -10000,
  }),
  row({ account_id: "sacco", kind: "savings", balance_cents: 5100000 }),
  row({ account_id: "mshwari", kind: "savings", balance_cents: 0 }),
  row({
    account_id: "fuliza",
    kind: "loan",
    debt_term: "short",
    balance_cents: 0,
    snapshot_at: "2026-10-05T06:00:00Z",
    snapshot_cents: -61400,
    difference_cents: 0,
  }),
  row({ account_id: "car", kind: "loan", debt_term: "long", counts_in_net: false, balance_cents: -57500000 }),
];

describe("reconcileState", () => {
  it("matches when the latest reading equals the ledger at that time", () => {
    expect(reconcileState(october[0]!)).toBe("match");
    // Fuliza's reading is from before its repayment; the ledger then also said −614.
    expect(reconcileState(october[5]!)).toBe("match");
  });

  it("is a mismatch for any difference, even KES 1", () => {
    expect(reconcileState(october[2]!)).toBe("mismatch");
    expect(reconcileState({ ...october[0]!, difference_cents: 100 })).toBe("mismatch");
  });

  it("has nothing to compare without a reading", () => {
    expect(reconcileState(october[3]!)).toBe("no_reading");
  });
});

describe("summarise", () => {
  it("adds up the seed's October", () => {
    expect(summarise(october)).toEqual({
      availableCents: 93600 + 11150000 + 180000,
      savingsCents: 5100000,
      shortDebtCents: 0,
      longDebtCents: 57500000,
      // D-010: wallets + bank + cash + savings − short-term debt; the car loan stays out.
      netPositionCents: 93600 + 11150000 + 180000 + 5100000,
      mismatched: ["cash"],
    });
  });

  it("subtracts short-term debt from net position", () => {
    const owing = october.map((a) => (a.account_id === "fuliza" ? { ...a, balance_cents: -70700 } : a));
    const s = summarise(owing);
    expect(s.shortDebtCents).toBe(70700);
    expect(s.netPositionCents).toBe(93600 + 11150000 + 180000 + 5100000 - 70700);
  });

  it("treats an overpaid loan as owing nothing, but keeps its balance in net", () => {
    const overpaid = october.map((a) => (a.account_id === "fuliza" ? { ...a, balance_cents: 5000 } : a));
    expect(summarise(overpaid).shortDebtCents).toBe(0);
    expect(summarise(overpaid).netPositionCents).toBe(summarise(october).netPositionCents + 5000);
  });

  it("follows each account's counts_in_net switch", () => {
    const noSacco = october.map((a) => (a.account_id === "sacco" ? { ...a, counts_in_net: false } : a));
    expect(summarise(noSacco).netPositionCents).toBe(summarise(october).netPositionCents - 5100000);
    expect(summarise(noSacco).savingsCents).toBe(5100000);
  });

  it("leaves archived accounts out of every total", () => {
    const archived = october.map((a) =>
      a.account_id === "cash" ? { ...a, archived_at: "2026-10-30T00:00:00Z" } : a,
    );
    const s = summarise(archived);
    expect(s.availableCents).toBe(93600 + 11150000);
    expect(s.mismatched).toEqual([]);
  });

  it("is all zero for no accounts", () => {
    expect(summarise([])).toEqual({
      availableCents: 0,
      savingsCents: 0,
      shortDebtCents: 0,
      longDebtCents: 0,
      netPositionCents: 0,
      mismatched: [],
    });
  });
});

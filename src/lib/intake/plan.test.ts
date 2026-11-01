import { parseSms } from "../sms";
import { fixtures, RECEIVED_AT } from "../sms/fixtures";
import { accountKey, findAccount, matchRule, planIngest, type Lookups } from "./plan";

// Invented ids, matching the shape of the seed data.
const MPESA = "acc-mpesa";
const KCB = "acc-kcb";
const CASH = "acc-cash";
const FULIZA = "acc-fuliza";
const FOOD = "cat-food";
const SALARY = "cat-salary";
const FEES = "cat-fees";

const lookups: Lookups = {
  accounts: [
    { id: MPESA, kind: "wallet", sms_account_hint: "mpesa", archived_at: null },
    { id: KCB, kind: "bank", sms_account_hint: "KCB", archived_at: null },
    { id: CASH, kind: "cash", sms_account_hint: null, archived_at: null },
    { id: FULIZA, kind: "loan", sms_account_hint: "fuliza", archived_at: null },
    { id: "acc-old", kind: "wallet", sms_account_hint: "mshwari", archived_at: "2026-01-01T00:00:00Z" },
  ],
  rules: [
    { pattern: "mart", priority: 20, category_id: FOOD, transfer_account_id: null },
    { pattern: "SAMPLE MART", priority: 10, category_id: SALARY, transfer_account_id: null }, // wrong kind: ignored
    { pattern: "SAMPLE BANK", priority: 10, category_id: null, transfer_account_id: KCB },
  ],
  categories: [
    { id: FOOD, name: "Groceries", kind: "spending", system: false },
    { id: SALARY, name: "Salary", kind: "income", system: false },
    { id: FEES, name: "Transaction fees", kind: "spending", system: true },
  ],
};

const fixture = (name: string) => {
  const f = fixtures.find((x) => x.name.startsWith(name));
  if (!f) throw new Error(`no fixture ${name}`);
  return parseSms({ sender: f.sender, body: f.body, receivedAt: RECEIVED_AT }, f.opts);
};

describe("account matching", () => {
  it("uses the hint, else the product, ignoring case", () => {
    expect(accountKey({ product: "mpesa" })).toBe("mpesa");
    expect(accountKey({ product: "bank", hint: "KCB card 0042" })).toBe("kcb card 0042");
    expect(findAccount({ product: "bank", hint: "KCB" }, lookups.accounts)?.id).toBe(KCB);
  });

  it("finds cash by kind and skips archived accounts", () => {
    expect(findAccount({ product: "cash" }, lookups.accounts)?.id).toBe(CASH);
    expect(findAccount({ product: "mshwari" }, lookups.accounts)).toBeUndefined();
  });
});

describe("matchRule", () => {
  it("takes the lowest priority number that matches, ignoring case", () => {
    expect(matchRule("SAMPLE MART FEDHA", lookups.rules)?.priority).toBe(10);
    expect(matchRule("demo mart", lookups.rules)?.category_id).toBe(FOOD);
    expect(matchRule("nothing here", lookups.rules)).toBeUndefined();
  });
});

describe("planIngest", () => {
  it("categorises by payee rule and checks the category kind", () => {
    // "SAMPLE MART" (priority 10) names an income category, so it does not apply to spending.
    const plan = planIngest(fixture("M-PESA: till payment"), lookups);
    expect(plan.status).toBe("parsed");
    expect(plan.rows).toMatchObject([
      { account_id: MPESA, amount_cents: -70100, category_id: null, needs_review: true },
    ]);
    expect(plan.snapshots).toEqual([
      { account_id: MPESA, balance_cents: 29900, as_of: "2026-01-02T10:23:00.000Z" },
    ]);
  });

  it("puts fees in the system fee category, linked to their payment, never through payee rules", () => {
    const plan = planIngest(fixture("M-PESA: send to a person"), lookups);
    expect(plan.rows).toMatchObject([
      { key: "main", category_id: null, needs_review: true, parent_key: null },
      { key: "fee", category_id: FEES, needs_review: false, parent_key: "main", amount_cents: -700 },
    ]);
  });

  it("keeps parser transfers as one group across two accounts", () => {
    const plan = planIngest(fixture("Fuliza: draw"), lookups);
    expect(plan.rows).toMatchObject([
      { account_id: FULIZA, kind: "transfer", transfer_group: "fuliza-draw", amount_cents: -70000 },
      { account_id: MPESA, kind: "transfer", transfer_group: "fuliza-draw", amount_cents: 70000 },
      { account_id: FULIZA, kind: "spending", category_id: FEES, parent_key: null },
    ]);
    expect(plan.snapshots).toMatchObject([{ account_id: FULIZA, balance_cents: -70700 }]);
  });

  it("turns income into a transfer when a rule names one of the owner's accounts", () => {
    const plan = planIngest(fixture("M-PESA: money from a bank account"), lookups);
    expect(plan.rows).toMatchObject([
      {
        account_id: MPESA,
        kind: "transfer",
        amount_cents: 1000000,
        peer_account_id: KCB,
        transfer_group: "peer:main",
        category_id: null,
      },
    ]);
  });

  it("matches withdrawals to the cash account", () => {
    const plan = planIngest(fixture("M-PESA: agent withdrawal"), lookups);
    expect(plan.rows.map((r) => r.account_id)).toEqual([MPESA, CASH, MPESA]);
  });

  it("sends a message to review when an account is not set up", () => {
    const plan = planIngest(fixture("M-Shwari: saving"), lookups);
    expect(plan).toEqual({
      status: "to_review",
      error: 'no account has sms_account_hint "mshwari"',
      rows: [],
      snapshots: [],
    });
  });

  it("passes ignored and to_review results through", () => {
    expect(planIngest(fixture("M-PESA: offer"), lookups)).toMatchObject({ status: "ignored", rows: [] });
    expect(planIngest(fixture("M-PESA: unknown wording"), lookups)).toMatchObject({
      status: "to_review",
      error: "unrecognised M-PESA wording",
    });
  });

  it("flags fees for review when there is no fee category", () => {
    const plan = planIngest(fixture("M-PESA: send to a person"), { ...lookups, categories: [] });
    expect(plan.rows[1]).toMatchObject({ category_id: null, needs_review: true });
  });
});

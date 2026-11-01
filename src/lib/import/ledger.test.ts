import { parseCsv, parseCsvObjects } from "./csv";
import { amountToCents, planLedgerImport, type LedgerRow } from "./ledger";

// Invented rows in the old ledger's 12-column layout. Names, numbers and codes are made up.
const r = (o: Partial<LedgerRow>): LedgerRow => ({
  Date: "2026-01-02",
  Month: "2026-01",
  Account: "M-PESA",
  Type: "Till payment",
  Description: "DEMO SHOP",
  Class: "Expense",
  Category: "Groceries",
  Currency: "KES",
  "Amount (orig)": "100",
  "Amount (KES)": "100",
  Ref: "",
  Note: "",
  ...o,
});

const plan = (rows: LedgerRow[]) => {
  let n = 0;
  return planLedgerImport([{ label: "Ledger 2026", rows }], { newId: () => `id-${++n}` });
};

describe("parseCsv", () => {
  it("reads quoted fields, doubled quotes, newlines in quotes and a BOM", () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\n"two\nlines",3\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["two\nlines", "3"],
    ]);
  });

  it("keys rows by the header and skips blank lines", () => {
    expect(parseCsvObjects("Date, Amount\n2026-01-01,5\n\n")).toEqual([{ Date: "2026-01-01", Amount: "5" }]);
  });
});

describe("amountToCents", () => {
  it.each([
    ["701", 70100],
    ["1,234.5", 123450],
    ["-701.00", -70100],
    ["0.089", 9],
    ["1548.484", 154848],
    ["1548.485", 154849],
  ])("%s → %i", (text, cents) => expect(amountToCents(text)).toBe(cents));

  it("rejects junk", () => {
    expect(amountToCents("")).toBeUndefined();
    expect(amountToCents("abc")).toBeUndefined();
  });
});

describe("planLedgerImport", () => {
  it("maps spending and income with signs, categories and noon-in-Nairobi time", () => {
    const p = plan([
      r({ Description: "DEMO SHOP 0700000001" }),
      r({
        Class: "Income",
        Type: "M-PESA received",
        Category: "Income - other / received",
        "Amount (KES)": "500",
      }),
    ]);
    expect(p.transactions).toMatchObject([
      {
        account: "mpesa",
        kind: "spending",
        amount_cents: -10000,
        category: "Groceries",
        payee: "DEMO SHOP",
        occurred_at: "2026-01-02T09:00:00.000Z",
      },
      { kind: "income", amount_cents: 50000, category: "Income - other / received", category_kind: "income" },
    ]);
  });

  it("sends uncategorised and (check) rows to review, and keeps foreign amounts", () => {
    const p = plan([
      r({ Category: "Other payments (uncategorised)" }),
      r({ Category: "Bank paybills / transfers (check)" }),
      r({
        Account: "KCB",
        Type: "KCB card payment",
        Currency: "USD",
        "Amount (orig)": "12",
        "Amount (KES)": "1548",
      }),
    ]);
    expect(p.transactions).toMatchObject([
      { category: null, needs_review: true },
      { category: "Bank paybills / transfers (check)", needs_review: true },
      {
        account: "kcb",
        original_currency: "USD",
        original_minor: 1200,
        amount_cents: -154800,
        needs_review: true,
      },
    ]);
  });

  it("treats a negative expense as money back", () => {
    expect(
      plan([r({ Type: "Reversal", Category: "Reversals (credit)", "Amount (KES)": "-701" })]).transactions[0],
    ).toMatchObject({
      kind: "spending",
      amount_cents: 70100,
    });
  });

  it("pairs a transfer recorded on both accounts", () => {
    const p = plan([
      r({
        Account: "KCB",
        Type: "KCB to M-PESA send",
        Class: "Transfer",
        Category: "Own transfer (KCB to M-PESA)",
        "Amount (KES)": "3000",
      }),
      r({
        Date: "2026-01-03",
        Type: "M-PESA received",
        Class: "Transfer",
        Category: "Own transfer (KCB to M-PESA)",
        "Amount (KES)": "3000",
      }),
    ]);
    expect(p.transactions).toHaveLength(2);
    expect(p.transactions[0]).toMatchObject({ account: "kcb", amount_cents: -300000, kind: "transfer" });
    expect(p.transactions[1]).toMatchObject({ account: "mpesa", amount_cents: 300000, kind: "transfer" });
    expect(p.transactions[0]!.transfer_id).toBe(p.transactions[1]!.transfer_id);
  });

  it("creates the other leg when the ledger has only one side, and never pairs across a 3-day gap", () => {
    const p = plan([
      r({
        Type: "M-PESA received",
        Class: "Transfer",
        Category: "Own transfer (KCB to M-PESA)",
        "Amount (KES)": "3000",
      }),
      r({
        Date: "2026-01-09",
        Account: "KCB",
        Type: "KCB to M-PESA send",
        Class: "Transfer",
        Category: "Own transfer (KCB to M-PESA)",
        "Amount (KES)": "3000",
      }),
    ]);
    expect(p.transactions).toHaveLength(4);
    const peers = p.transactions.filter((t) => t.dedupe_key.endsWith(":peer"));
    expect(peers.map((t) => [t.account, t.amount_cents])).toEqual([
      ["kcb", -300000],
      ["mpesa", 300000],
    ]);
  });

  it("turns borrowing, repayments and saving into transfers with the right accounts", () => {
    const p = plan([
      r({
        Type: "M-PESA received",
        Class: "Borrowing",
        Category: "Loan - Demo Lender",
        "Amount (KES)": "1000",
      }),
      r({
        Type: "Loan repayment",
        Class: "Debt repayment",
        Category: "Loan repayment - Demo Lender",
        "Amount (KES)": "1050",
      }),
      r({
        Account: "KCB",
        Type: "Payroll deduction",
        Class: "Debt repayment",
        Category: "Loan repayment - Car loan",
        "Amount (KES)": "20000",
      }),
      r({ Type: "Paybill/send", Class: "Saving", Category: "Sacco", "Amount (KES)": "2000" }),
      r({
        Account: "KCB",
        Type: "Payroll deduction",
        Class: "Saving",
        Category: "Pension",
        "Amount (KES)": "5000",
      }),
      r({
        Type: "M-Shwari transfer",
        Class: "Transfer",
        Category: "Own transfer (M-Shwari)",
        Note: "excluded; own money moved from M-Shwari",
        "Amount (KES)": "400",
      }),
    ]);
    const legs = (i: number) =>
      p.transactions
        .filter((t) => t.transfer_id === p.transactions[i]!.transfer_id)
        .map((t) => `${t.account} ${t.amount_cents}`);
    expect(legs(0)).toEqual(["mpesa 100000", "demo-lender-loan -100000"]);
    expect(legs(1)).toEqual(["mpesa -105000", "demo-lender-loan 105000"]);
    expect(legs(2)).toEqual(["kcb -2000000", "car-loan 2000000"]);
    expect(legs(3)).toEqual(["mpesa -200000", "sacco 200000"]);
    expect(legs(4)).toEqual(["kcb -500000", "pension 500000"]);
    expect(legs(5)).toEqual(["mpesa 40000", "mshwari -40000"]);
  });

  it("links a fee row to its payment by reference", () => {
    const p = plan([
      r({ Type: "Paybill/send", Ref: "TSA0000001", "Amount (KES)": "500" }),
      r({ Type: "Fee", Category: "Transaction fees", Ref: "TSA0000001", "Amount (KES)": "7" }),
    ]);
    expect(p.transactions[1]).toMatchObject({ channel: "fee", parent_id: p.transactions[0]!.id });
  });

  it("gives identical rows different, stable dedupe keys", () => {
    const rows = [r({}), r({}), r({ Description: "OTHER SHOP" })];
    const a = plan(rows).transactions.map((t) => t.dedupe_key);
    const b = plan(rows).transactions.map((t) => t.dedupe_key);
    expect(new Set(a).size).toBe(3);
    expect(a).toEqual(b);
    expect(a[0]).toMatch(/^ledger:[0-9a-f]{16}:1$/);
    expect(a[1]).toMatch(/:2$/);
  });

  it("counts rows read and reports rows it cannot map", () => {
    const p = plan([
      r({ Account: "" }),
      r({ "Amount (KES)": "" }),
      r({ Class: "Transfer", Category: "Something new" }),
    ]);
    expect(p.rowsRead).toEqual({ "Ledger 2026": 3 });
    expect(p.skipped.map((s) => s.reason)).toEqual([
      "no account",
      "no amount",
      "no rule for Transfer / Something new",
    ]);
    expect(p.skipped[0]!.source_row).toBe("Ledger 2026 row 2");
  });

  it("keeps every transfer balanced", () => {
    const p = plan([
      r({
        Type: "M-PESA received",
        Class: "Transfer",
        Category: "Own transfer (savings)",
        "Amount (KES)": "10",
      }),
      r({
        Type: "Cash given to agent",
        Class: "Transfer",
        Category: "Cash deposit to M-PESA",
        "Amount (KES)": "20",
      }),
    ]);
    const sums = new Map<string, number>();
    for (const t of p.transactions)
      if (t.transfer_id) sums.set(t.transfer_id, (sums.get(t.transfer_id) ?? 0) + t.amount_cents);
    expect([...sums.values()]).toEqual([0, 0]);
    expect(p.transactions[0]).toMatchObject({ needs_review: true }); // savings pot not named in the ledger
  });

  it("derives accounts from the ledger text instead of hard-coding names", () => {
    const p = plan([
      r({
        Account: "Demo Sacco Society",
        Type: "Sacco loan repayment",
        Class: "Debt repayment",
        Category: "Loan repayment - Sacco",
      }),
      r({ Account: "Demo Prepaid Card", Type: "Card", Category: "Online shopping" }),
      r({ Account: "Demo airtime", Type: "Okoa repayment", Category: "Safaricom data/airtime" }),
      r({
        Account: "KCB",
        Type: "Payroll deduction",
        Class: "Debt repayment",
        Category: "Loan repayment - Car loan",
      }),
    ]);
    expect(p.accounts).toMatchObject({
      sacco: { kind: "savings" },
      "sacco-loan": { name: "Sacco loan", kind: "loan", debt_term: "short" },
      "demo-prepaid-card": { name: "Demo Prepaid Card", kind: "bank" },
      "demo-airtime": { kind: "wallet", counts_in_net: false },
      "car-loan": { name: "Car loan", debt_term: "long" },
    });
  });
});

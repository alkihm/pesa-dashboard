import { parseDay, parseSheet, parseTime, TEMPLATE_COLUMNS } from "./rows";

// Invented accounts and categories.
const accounts = [
  { id: "mp", name: "M-PESA", sms_account_hint: "mpesa" },
  { id: "bk", name: "Bank current", sms_account_hint: "kcb" },
];
const categories = [
  { id: "food", name: "Eating out", kind: "spending" },
  { id: "pay", name: "Salary", kind: "income" },
];
const now = new Date("2026-11-08T07:00:00Z");
const header = [...TEMPLATE_COLUMNS];
const parse = (...rows: string[][]) => parseSheet([header, ...rows], { accounts, categories, now });
/** A template row: Date, Time, Account, Kind, Amount, Category, Payee, Note, Ref, To account. */
const row = (o: Partial<Record<(typeof TEMPLATE_COLUMNS)[number], string>>) => header.map((h) => o[h] ?? "");

describe("parseDay / parseTime", () => {
  it("reads ISO, day-first and Excel dates", () => {
    expect(parseDay("2026-11-05")).toBe("2026-11-05");
    expect(parseDay("5/11/2026")).toBe("2026-11-05");
    expect(parseDay("05.11.26")).toBe("2026-11-05");
    expect(parseDay("46331")).toBe("2026-11-05");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("yesterday")).toBeNull();
  });

  it("reads times, Excel fractions, and treats empty as midday", () => {
    expect(parseTime("")).toBe("12:00");
    expect(parseTime("14:05")).toBe("14:05");
    expect(parseTime("2:05 pm")).toBe("14:05");
    expect(parseTime("12:30 am")).toBe("00:30");
    expect(parseTime("0.5")).toBe("12:00");
    expect(parseTime("25:00")).toBeNull();
  });
});

describe("parseSheet", () => {
  it("turns a spending row into a transaction at Nairobi time", () => {
    const { rows, errors, read } = parse(
      row({
        Date: "2026-11-05",
        Time: "14:05",
        Account: "M-PESA",
        Kind: "spending",
        "Amount (KES)": "1,450.50",
        Category: "Eating out",
        Payee: "DEMO CAFE",
        Ref: "tka0000001",
      }),
    );
    expect(errors).toEqual([]);
    expect(read).toBe(1);
    expect(rows[0]).toEqual({
      line: 2,
      day: "2026-11-05",
      occurredAt: "2026-11-05T11:05:00.000Z",
      accountId: "mp",
      accountName: "M-PESA",
      kind: "spending",
      cents: 145_050,
      categoryId: "food",
      categoryName: "Eating out",
      toAccountId: null,
      toAccountName: null,
      payee: "DEMO CAFE",
      note: null,
      ref: "TKA0000001",
    });
  });

  it("takes the kind from the sign when Kind is empty, and matches names loosely", () => {
    const { rows } = parse(
      row({ Date: "5/11/2026", Account: "m-pesa", "Amount (KES)": "-200" }),
      row({ Date: "5/11/2026", Account: "kcb", "Amount (KES)": "50000", Category: "salary" }),
    );
    expect(rows.map((r) => [r.kind, r.cents, r.accountId, r.categoryId])).toEqual([
      ["spending", 20_000, "mp", null],
      ["income", 5_000_000, "bk", "pay"],
    ]);
  });

  it("reads a transfer to another account", () => {
    const { rows } = parse(
      row({
        Date: "2026-11-05",
        Account: "Bank current",
        Kind: "transfer",
        "Amount (KES)": "3000",
        "To account": "M-PESA",
      }),
    );
    expect(rows[0]).toMatchObject({ kind: "transfer", cents: 300_000, accountId: "bk", toAccountId: "mp" });
  });

  it("shows every problem of a row, with its row number", () => {
    const { rows, errors } = parse(
      row({ Date: "2026-11-05", Account: "M-PESA", "Amount (KES)": "100" }),
      row({ Date: "31/2/2026", Account: "Wallet X", "Amount (KES)": "abc", Kind: "gift" }),
      row({ Date: "2026-12-01", Account: "M-PESA", "Amount (KES)": "0" }),
      row({
        Date: "2026-11-05",
        Account: "M-PESA",
        Kind: "transfer",
        "Amount (KES)": "5",
        "To account": "M-PESA",
        Category: "Eating out",
      }),
      row({
        Date: "2026-11-05",
        Account: "M-PESA",
        Kind: "income",
        "Amount (KES)": "5",
        Category: "Eating out",
      }),
    );
    expect(rows.map((r) => r.line)).toEqual([2]);
    expect(errors.map((e) => [e.line, e.errors])).toEqual([
      [
        3,
        [
          "Date “31/2/2026” is not a date (use 2026-11-05 or 5/11/2026)",
          "No account called “Wallet X”",
          "Amount “abc” is not a number",
          "Kind “gift” must be spending, income or transfer",
        ],
      ],
      [4, ["Date is in the future", "Amount is zero"]],
      [5, ["A transfer needs two different accounts", "A transfer has no category"]],
      [6, ["“Eating out” is not an income category"]],
    ]);
    expect(errors[0]!.text).toBe("31/2/2026 · Wallet X · gift · abc");
  });

  it("skips blank rows but keeps the spreadsheet's row numbers", () => {
    const { rows, read } = parse(
      ["", "", ""],
      row({ Date: "2026-11-05", Account: "M-PESA", "Amount (KES)": "1" }),
    );
    expect(read).toBe(1);
    expect(rows[0]!.line).toBe(3);
  });

  it("accepts the readable file from Export everything", () => {
    const sheet = parseSheet(
      [
        [
          "Date",
          "Account",
          "Kind",
          "Category",
          "Payee",
          "Amount (KES)",
          "Note",
          "Ref",
          "Source",
          "To review",
        ],
        [
          "2026-11-01",
          "M-PESA",
          "spending",
          "Eating out",
          "DEMO SHOP",
          "-1500.50",
          "",
          "TSX0000001",
          "sms",
          "",
        ],
      ],
      { accounts, categories, now },
    );
    expect(sheet.rows[0]).toMatchObject({
      kind: "spending",
      cents: 150_050,
      ref: "TSX0000001",
      categoryId: "food",
    });
  });

  it("refuses a file without the needed columns", () => {
    expect(() =>
      parseSheet(
        [
          ["Name", "Value"],
          ["a", "1"],
        ],
        { accounts, categories, now },
      ),
    ).toThrow("Missing: Date, Account, Amount (KES)");
    expect(() => parseSheet([], { accounts, categories, now })).toThrow("empty");
  });
});

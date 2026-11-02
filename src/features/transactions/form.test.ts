import { fixtures, RECEIVED_AT } from "../../lib/sms/fixtures";
import { amountCents, buildRows, emptyForm, fillFromSms, occurredAt, problem, type Form } from "./form";

const body = (name: string) => fixtures.find((f) => f.name.startsWith(name))!.body;

const lookups = {
  accounts: [
    { id: "mpesa", kind: "wallet", sms_account_hint: "mpesa", archived_at: null },
    { id: "cash", kind: "cash", sms_account_hint: null, archived_at: null },
  ],
  categories: [
    { id: "groceries", name: "Groceries", kind: "spending", system: false },
    { id: "fees", name: "Transaction fees", kind: "spending", system: true },
  ],
  rules: [{ pattern: "SAMPLE MART", priority: 10, category_id: "groceries", transfer_account_id: null }],
};

// 2026-11-02 10:00 in Nairobi.
const now = new Date("2026-11-02T07:00:00Z");
let n = 0;
const ids = () => `id-${++n}`;
beforeEach(() => {
  n = 0;
});

describe("amountCents and problem", () => {
  it("reads typed amounts", () => {
    expect(amountCents("2,500")).toBe(250000);
    expect(amountCents("33.5")).toBe(3350);
    expect(amountCents("0")).toBeUndefined();
    expect(amountCents("abc")).toBeUndefined();
  });

  it("names the first thing missing", () => {
    const form = emptyForm(now);
    expect(problem(form)).toBe("Enter an amount above zero.");
    expect(problem({ ...form, amount: "10" })).toBe("Choose the account it left.");
    const transfer: Form = { ...form, direction: "transfer", amount: "10", accountId: "mpesa" };
    expect(problem(transfer)).toBe("Choose the account it went to.");
    expect(problem({ ...transfer, toAccountId: "mpesa" })).toBe("A transfer needs two different accounts.");
    expect(problem({ ...transfer, toAccountId: "cash" })).toBeUndefined();
  });
});

describe("fillFromSms", () => {
  it("fills a till payment, with the category from a payee rule", () => {
    const fill = fillFromSms(body("M-PESA: till payment"), lookups, { sender: "MPESA", now: RECEIVED_AT });
    expect(fill.ok).toBe(true);
    expect(fill.form).toMatchObject({
      direction: "out",
      amount: "701",
      accountId: "mpesa",
      categoryId: "groceries",
      payee: "SAMPLE MART FEDHA",
      date: "2026-01-02",
    });
  });

  it("reads a pasted message without its sender", () => {
    const fill = fillFromSms(body("M-PESA: send to a person"), lookups);
    expect(fill.form).toMatchObject({ direction: "out", amount: "500", payee: "SAM PLEPERSON" });
    expect(fill.form?.sms?.fees).toHaveLength(1);
  });

  it("turns an agent withdrawal into a transfer to cash, keeping both legs' keys and the fee", () => {
    const fill = fillFromSms(body("M-PESA: agent withdrawal"), lookups);
    expect(fill.form).toMatchObject({
      direction: "transfer",
      amount: "2000",
      accountId: "mpesa",
      toAccountId: "cash",
    });
    expect(fill.form?.sms?.dedupeKey).toMatch(/^mpesa:TSE5F6G7H8:/);
    expect(fill.form?.sms?.inKey).toMatch(/^mpesa:TSE5F6G7H8:/);
    expect(fill.form?.sms?.inKey).not.toBe(fill.form?.sms?.dedupeKey);
  });

  it("explains a message that is not a payment, and keeps what it could read when no account matches", () => {
    expect(fillFromSms("Your verification code is 123456", lookups)).toMatchObject({ ok: false });
    const noAccounts = fillFromSms(body("M-PESA: till payment"), { ...lookups, accounts: [] });
    expect(noAccounts.ok).toBe(false);
    expect(noAccounts.form).toMatchObject({ amount: "701", payee: "SAMPLE MART FEDHA", accountId: null });
  });
});

describe("occurredAt", () => {
  const form = { ...emptyForm(now), amount: "10", accountId: "mpesa" };

  it("uses now for today and midday Nairobi for another day", () => {
    expect(occurredAt(form, now)).toBe(now.toISOString());
    expect(occurredAt({ ...form, date: "2026-10-30" }, now)).toBe("2026-10-30T09:00:00.000Z");
  });

  it("keeps the SMS time while its day is kept", () => {
    const fill = fillFromSms(body("M-PESA: till payment"), lookups);
    expect(occurredAt(fill.form!, now)).toBe(fill.form!.sms!.occurredAt);
    expect(occurredAt({ ...fill.form!, date: "2026-01-03" }, now)).toBe("2026-01-03T09:00:00.000Z");
  });
});

describe("buildRows", () => {
  it("saves money out as negative manual spending, waiting for review without a category", () => {
    const rows = buildRows(
      { ...emptyForm(now), amount: "1,500", accountId: "mpesa", payee: " KPLC ", note: "" },
      now,
      ids,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        id: "id-1",
        source: "manual",
        kind: "spending",
        account_id: "mpesa",
        amount_cents: -150000,
        payee: "KPLC",
        note: null,
        category_id: null,
        needs_review: true,
        dedupe_key: null,
      }),
    ]);
  });

  it("saves money in as positive income", () => {
    const [row] = buildRows(
      { ...emptyForm(now, "in"), amount: "100", accountId: "mpesa", categoryId: "salary" },
      now,
      ids,
    );
    expect(row).toMatchObject({
      kind: "income",
      amount_cents: 10000,
      category_id: "salary",
      needs_review: false,
    });
  });

  it("saves a pasted withdrawal as two transfer legs and its fee, linked to the outgoing leg", () => {
    const fill = fillFromSms(body("M-PESA: agent withdrawal"), lookups);
    const rows = buildRows(fill.form!, now, ids);
    expect(rows.map((r) => [r.kind, r.account_id, r.amount_cents])).toEqual([
      ["transfer", "mpesa", -200000],
      ["transfer", "cash", 200000],
      ["spending", "mpesa", -2900],
    ]);
    expect(rows[0]!.transfer_id).toBe(rows[1]!.transfer_id);
    expect(rows[2]).toMatchObject({ parent_id: rows[0]!.id, category_id: "fees", channel: "fee" });
    expect(rows.every((r) => r.source === "manual" && r.dedupe_key)).toBe(true);
    expect(new Set(rows.map((r) => r.dedupe_key)).size).toBe(3);
  });
});

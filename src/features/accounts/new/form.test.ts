import { accountKey } from "../../../lib/intake/plan";
import {
  buildAccount,
  buildOpening,
  countsInNet,
  emptyForm,
  labels,
  problem,
  smsSources,
  withKind,
  type Form,
  type Kind,
} from "./form";

const existing = [
  { name: "M-PESA", sms_account_hint: "mpesa", archived_at: null, sort_order: 1 },
  { name: "Old bank", sms_account_hint: "kcb", archived_at: "2026-01-01T00:00:00Z", sort_order: 7 },
];

const form = (over: Partial<Form>): Form => ({ ...emptyForm(over.kind), ...over });

describe("SMS sources", () => {
  it("give exactly the hints the intake looks for", () => {
    // What the parser produces for each source (src/lib/sms), through the intake's own key function.
    const parserKeys = [
      accountKey({ product: "mpesa" }),
      accountKey({ product: "airtel-money" }),
      accountKey({ product: "bank", hint: "KCB" }),
      accountKey({ product: "bank", hint: "KCB card 0042" }),
      accountKey({ product: "mshwari" }),
      accountKey({ product: "kcb-mpesa" }),
      accountKey({ product: "fuliza" }),
      accountKey({ product: "kcb-mpesa-loan" }),
    ];
    const kinds: Kind[] = ["wallet", "bank", "card", "savings", "loan"];
    const hints = kinds.flatMap((kind) =>
      smsSources(kind).map(
        (s) => buildAccount(form({ kind, name: "x", source: s.value, last4: "0042" }), []).sms_account_hint,
      ),
    );
    expect(hints.sort()).toEqual(parserKeys.sort());
    expect(smsSources("cash")).toEqual([]);
  });
});

describe("labels and defaults", () => {
  it("name the balance and limit as the board does", () => {
    expect(labels("bank")).toMatchObject({ balance: "Current balance" });
    expect(labels("loan")).toEqual({ balance: "Amount owed now", limit: "Amount borrowed" });
    expect(labels("card")).toEqual({ balance: "Amount owed now", limit: "Card limit" });
  });

  it("count in net position by D-010 until changed", () => {
    expect(countsInNet(form({ kind: "savings" }))).toBe(true);
    expect(countsInNet(form({ kind: "card" }))).toBe(true); // cards start short-term
    expect(countsInNet(form({ kind: "loan" }))).toBe(false); // loans start long-term
    expect(countsInNet(form({ kind: "loan", debtTerm: "short" }))).toBe(true);
    expect(countsInNet(form({ kind: "wallet", countsInNet: false }))).toBe(false);
  });

  it("keep the name, balance and a chosen icon when the type changes", () => {
    const next = withKind(
      form({ kind: "loan", name: "Fuliza", emoji: "📲", balance: "300", limit: "5,000" }),
      "card",
    );
    expect(next).toMatchObject({
      kind: "card",
      name: "Fuliza",
      emoji: "📲",
      balance: "300",
      limit: "",
      debtTerm: "short",
    });
    expect(withKind(form({ kind: "wallet" }), "bank").emoji).toBe("🏦");
  });
});

describe("problem", () => {
  it("needs a unique name among live accounts", () => {
    expect(problem(form({ name: " " }), existing)).toBe("Give the account a name.");
    expect(problem(form({ name: "m-pesa" }), existing)).toBe("There is already an account called m-pesa.");
    expect(problem(form({ kind: "bank", name: "Old bank" }), existing)).toBeUndefined();
  });

  it("checks amounts, the due day and the card digits", () => {
    expect(problem(form({ name: "A", balance: "lots" }), [])).toBe("Current balance must be an amount.");
    expect(problem(form({ name: "A", balance: "0" }), [])).toBeUndefined();
    expect(problem(form({ kind: "loan", name: "Car", limit: "0" }), [])).toBe(
      "Amount borrowed must be above zero.",
    );
    expect(problem(form({ kind: "loan", name: "Car", dueDay: "32" }), [])).toMatch(/1 to 31/);
    expect(problem(form({ kind: "card", name: "Visa", source: "kcb-card", last4: "42" }), [])).toMatch(
      /four digits/,
    );
  });

  it("refuses an SMS source another live account already receives", () => {
    expect(problem(form({ name: "Second M-PESA", source: "mpesa" }), existing)).toBe(
      "M-PESA already receives these SMS. Each SMS source can feed one account.",
    );
    // An archived account no longer receives anything, so its source is free again.
    expect(problem(form({ kind: "bank", name: "New KCB", source: "kcb" }), existing)).toBeUndefined();
  });
});

describe("buildAccount and buildOpening", () => {
  it("builds a short-term loan with what was borrowed, the due day and SMS matching, after the last account", () => {
    const loan = form({
      kind: "loan",
      name: " Fuliza ",
      emoji: "📲",
      balance: "4,320",
      debtTerm: "short",
      limit: "6,000",
      dueDay: "5",
      source: "fuliza",
    });
    expect(buildAccount(loan, existing)).toEqual({
      name: "Fuliza",
      emoji: "📲",
      kind: "loan",
      debt_term: "short",
      counts_in_net: true,
      limit_cents: null,
      original_cents: 600000,
      due_day: 5,
      sms_account_hint: "fuliza",
      sms_sender: "MPESA",
      sort_order: 8,
    });
    const now = new Date("2026-11-02T08:00:00Z");
    expect(buildOpening(loan, "acc-1", now)).toEqual({
      account_id: "acc-1",
      kind: "opening",
      amount_cents: -432000,
      occurred_at: now.toISOString(),
      source: "manual",
    });
  });

  it("puts a card limit in limit_cents, and leaves debt fields off other kinds", () => {
    expect(buildAccount(form({ kind: "card", name: "Visa", limit: "50,000" }), [])).toMatchObject({
      limit_cents: 5000000,
      original_cents: null,
    });
    expect(
      buildAccount(form({ kind: "savings", name: "Sacco", limit: "100", dueDay: "3" }), []),
    ).toMatchObject({
      debt_term: null,
      limit_cents: null,
      original_cents: null,
      due_day: null,
      sms_account_hint: null,
      sort_order: 1,
    });
  });

  it("makes no opening row without a balance, and a positive one for money held", () => {
    expect(buildOpening(form({ name: "A" }), "x")).toBeUndefined();
    expect(buildOpening(form({ name: "A", balance: "0" }), "x")).toBeUndefined();
    expect(buildOpening(form({ kind: "savings", name: "A", balance: "250,000" }), "x")?.amount_cents).toBe(
      25000000,
    );
  });
});

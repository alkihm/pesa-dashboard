import { accountKey } from "../../../lib/intake/plan";
import {
  buildRow,
  countsInNet,
  emptyForm,
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
        (s) => buildRow(form({ kind, name: "x", source: s.value, last4: "0042" }), []).sms_account_hint,
      ),
    );
    expect(hints.sort()).toEqual(parserKeys.sort());
    expect(smsSources("cash")).toEqual([]);
  });
});

describe("counts in net", () => {
  it("follows D-010 by default and the switch when flipped", () => {
    expect(countsInNet(form({ kind: "savings" }))).toBe(true);
    expect(countsInNet(form({ kind: "card" }))).toBe(true); // cards start short term
    expect(countsInNet(form({ kind: "loan" }))).toBe(false); // loans start long term
    expect(countsInNet(form({ kind: "loan", debtTerm: "short" }))).toBe(true);
    expect(countsInNet(form({ kind: "wallet", countsInNet: false }))).toBe(false);
  });
});

describe("withKind", () => {
  it("keeps the name and a chosen emoji, and resets kind fields", () => {
    const next = withKind(
      form({ kind: "loan", name: "Fuliza", emoji: "⚡", limit: "5,000", source: "fuliza" }),
      "card",
    );
    expect(next).toMatchObject({
      kind: "card",
      name: "Fuliza",
      emoji: "⚡",
      limit: "",
      source: "",
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
    expect(problem(form({ kind: "loan", name: "Car", borrowed: "abc" }), [])).toMatch(/borrowed/);
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

describe("buildRow", () => {
  it("builds a short-term loan with its limit, due day and SMS matching, after the last account", () => {
    const row = buildRow(
      form({
        kind: "loan",
        name: " Fuliza ",
        emoji: "⚡",
        debtTerm: "short",
        limit: "5,000",
        dueDay: "5",
        source: "fuliza",
      }),
      existing,
    );
    expect(row).toEqual({
      name: "Fuliza",
      emoji: "⚡",
      kind: "loan",
      debt_term: "short",
      counts_in_net: true,
      limit_cents: 500000,
      original_cents: null,
      due_day: 5,
      sms_account_hint: "fuliza",
      sms_sender: "MPESA",
      sort_order: 8,
    });
  });

  it("leaves debt fields off accounts that are not debt", () => {
    const row = buildRow(form({ kind: "savings", name: "Sacco", limit: "100", dueDay: "3" }), []);
    expect(row).toMatchObject({
      debt_term: null,
      limit_cents: null,
      due_day: null,
      sms_account_hint: null,
      sort_order: 1,
    });
  });
});

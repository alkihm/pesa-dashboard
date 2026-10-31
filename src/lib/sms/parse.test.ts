import { fixtures, RECEIVED_AT } from "./fixtures.ts";
import { isOneTimeCode, parseSms, toCents } from "./index.ts";

describe("parseSms fixtures", () => {
  it("has at least 40 invented messages", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(40);
  });

  it.each(fixtures)("$name", ({ sender, body, opts, expected }) => {
    expect(parseSms({ sender, body, receivedAt: RECEIVED_AT }, opts)).toMatchObject(expected);
  });
});

describe("parseSms invariants", () => {
  const results = fixtures.map((f) =>
    parseSms({ sender: f.sender, body: f.body, receivedAt: RECEIVED_AT }, f.opts),
  );

  it("never produces a zero or fractional amount", () => {
    for (const r of results) {
      if (r.status !== "parsed") continue;
      for (const e of r.entries) {
        expect(Number.isInteger(e.amountCents)).toBe(true);
        expect(e.amountCents).not.toBe(0);
      }
    }
  });

  it("balances every transfer to zero", () => {
    for (const r of results) {
      if (r.status !== "parsed") continue;
      const groups = new Map<string, number>();
      for (const e of r.entries.filter((x) => x.kind === "transfer")) {
        groups.set(e.transferGroup!, (groups.get(e.transferGroup!) ?? 0) + e.amountCents);
      }
      for (const sum of groups.values()) expect(sum).toBe(0);
    }
  });

  it("gives every entry in a message its own dedupe key", () => {
    for (const r of results) {
      if (r.status !== "parsed") continue;
      const keys = r.entries.map((e) => e.dedupeKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("parseSms never throws", () => {
  const odd = [
    "",
    "   ",
    "Confirmed.",
    "ABCDEFGHIJ Confirmed. Ksh",
    "ABCDEFGHIJ Confirmed. Ksh,,,.00 paid to . on 99/99/99 at 99:99 PM",
    "KES transaction made on KCB card at on 00/00/0000 00:00",
    "🙂".repeat(500),
    "Ksh1,000.00 ".repeat(2000),
  ];
  it.each(["MPESA", "KCB", "AirtelMoney", ""])("for sender %j", (sender) => {
    for (const body of odd) {
      expect(() => parseSms({ sender, body, receivedAt: RECEIVED_AT })).not.toThrow();
    }
  });
});

describe("toCents", () => {
  it.each([
    ["300.00", 30000],
    ["1,000.00", 100000],
    ["12,500", 1250000],
    ["20000.0", 2000000],
    ["0.5", 50],
    ["7", 700],
  ])("%s → %i", (text, cents) => {
    expect(toCents(text)).toBe(cents);
  });

  it.each(["", "1,00", "abc", "1.234", ",100"])("rejects %j", (text) => {
    expect(toCents(text)).toBeUndefined();
  });
});

describe("isOneTimeCode", () => {
  it("spots codes and leaves payments alone", () => {
    expect(isOneTimeCode("Your verification code is 123456")).toBe(true);
    expect(isOneTimeCode("TSA1B2C3D4 Confirmed. Ksh100.00 paid to DEMO SHOP.")).toBe(false);
  });
});

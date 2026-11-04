import { describe, expect, it } from "vitest";

import { allocate, clearText, loanBudget, type Instalment, type ShortLoan } from "./allocation";

const KES = 100;
// The figures on the Overview and Home boards (invented sample figures).
const car: Instalment = { id: "car", name: "Car loan", emoji: "🚗", amountCents: 38_500 * KES };
const shortLoans: ShortLoan[] = [
  { id: "ms", name: "Loan B", emoji: "📱", owedCents: 7_500 * KES },
  { id: "kcb", name: "Loan C", emoji: "🏦", owedCents: 12_000 * KES },
  { id: "fz", name: "Loan A", emoji: "⚡", owedCents: 4_320 * KES },
];

describe("loanBudget", () => {
  it("is the share of income, kept between 0 and 100%", () => {
    expect(loanBudget(198_400 * KES, 25)).toBe(49_600 * KES);
    expect(loanBudget(198_400 * KES, 150)).toBe(198_400 * KES);
    expect(loanBudget(198_400 * KES, -5)).toBe(0);
    expect(loanBudget(0, 25)).toBe(0);
  });
});

describe("allocate", () => {
  it("matches the boards: car first, then the smallest short loan, the rest in part", () => {
    const a = allocate(198_400 * KES, 25, [car], shortLoans);
    expect(a.budgetCents).toBe(49_600 * KES);
    expect(a.lines.map((l) => [l.name, l.cents / KES, l.state])).toEqual([
      ["Car loan", 38_500, "paid"],
      ["Loan A", 4_320, "cleared"],
      ["Loan B", 6_780, "part"],
      ["Loan C", 0, "none"],
    ]);
    expect(a.unusedCents).toBe(0);
    expect(a.shortLeftCents).toBe((23_820 - 11_100) * KES);
    // 11,100 a month after the car: 23,820 / 11,100 = 2.1 → about 3 months.
    expect(a.monthsToClear).toBe(3);
    expect(clearText(a)).toBe("Short-term loans clear in ~3 months");
  });

  it("covers only part of the instalment when the share is too small, and nothing reaches the short loans", () => {
    const a = allocate(100_000 * KES, 20, [car], shortLoans);
    expect(a.lines[0]).toMatchObject({ cents: 20_000 * KES, state: "part" });
    expect(a.lines.slice(1).every((l) => l.cents === 0 && l.state === "none")).toBe(true);
    expect(a.monthsToClear).toBeNull();
    expect(clearText(a)).toBe("Nothing left for short-term loans after the instalments");
  });

  it("clears everything this month and reports what is left over", () => {
    const a = allocate(198_400 * KES, 50, [car], shortLoans);
    expect(a.lines.map((l) => l.state)).toEqual(["paid", "cleared", "cleared", "cleared"]);
    expect(a.unusedCents).toBe((99_200 - 38_500 - 23_820) * KES);
    expect(a.shortLeftCents).toBe(0);
    expect(a.monthsToClear).toBe(1);
    expect(clearText(a)).toBe("Short-term loans clear this month");
  });

  it("works with no instalment and no short loans", () => {
    expect(allocate(50_000 * KES, 10, [], shortLoans).lines[0]).toMatchObject({
      name: "Loan A",
      state: "cleared",
    });
    const none = allocate(50_000 * KES, 10, [car], []);
    expect(none.monthsToClear).toBe(0);
    expect(clearText(none)).toBe("No short-term loans to clear");
  });

  it("leaves out loans that owe nothing, and breaks equal balances by name", () => {
    const a = allocate(
      10_000 * KES,
      100,
      [],
      [
        { id: "z", name: "Zed", emoji: "💳", owedCents: 1_000 * KES },
        { id: "paid", name: "Paid off", emoji: "💳", owedCents: 0 },
        { id: "a", name: "Abe", emoji: "💳", owedCents: 1_000 * KES },
      ],
    );
    expect(a.lines.map((l) => l.name)).toEqual(["Abe", "Zed"]);
  });

  it("pays several instalments in the order given before any short loan", () => {
    const a = allocate(
      60_000 * KES,
      100,
      [car, { ...car, id: "c2", name: "Second", amountCents: 20_000 * KES }],
      shortLoans,
    );
    expect(a.lines.slice(0, 3).map((l) => [l.name, l.state])).toEqual([
      ["Car loan", "paid"],
      ["Second", "paid"],
      ["Loan A", "part"],
    ]);
  });
});

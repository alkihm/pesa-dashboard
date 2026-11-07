import { afterEach, describe, expect, it } from "vitest";

import {
  budgetMonthOf,
  budgetMonthRange,
  budgetMonthSpan,
  getMonthStartDay,
  ordinal,
  setMonthStartDay,
} from "./budgetMonth";
import { formatKes, getCurrency, setCurrency } from "./money";

afterEach(() => {
  setMonthStartDay(1);
  setCurrency("KES");
});

describe("the budget month", () => {
  it("is the calendar month by default, in Nairobi time", () => {
    expect(budgetMonthOf(new Date("2026-11-08T09:00:00Z"))).toBe("2026-11-01");
    // 31 Oct 22:00 UTC is already 1 Nov 01:00 in Nairobi.
    expect(budgetMonthOf(new Date("2026-10-31T22:00:00Z"))).toBe("2026-11-01");
    expect(budgetMonthRange("2026-11-01")).toEqual({
      from: "2026-11-01T00:00:00+03:00",
      to: "2026-12-01T00:00:00+03:00",
    });
    expect(budgetMonthSpan("2026-11-01")).toBeNull();
  });

  it("starts on the chosen day and keeps the key of the month it starts in (same rule as the database)", () => {
    setMonthStartDay(25);
    expect(budgetMonthOf(new Date("2026-11-24T20:59:00Z"))).toBe("2026-10-01"); // 24 Nov 23:59 Nairobi
    expect(budgetMonthOf(new Date("2026-11-24T21:00:00Z"))).toBe("2026-11-01"); // 25 Nov 00:00 Nairobi
    expect(budgetMonthOf(new Date("2026-01-10T09:00:00Z"))).toBe("2025-12-01"); // across the year
    expect(budgetMonthRange("2026-11-01")).toEqual({
      from: "2026-11-25T00:00:00+03:00",
      to: "2026-12-25T00:00:00+03:00",
    });
    expect(budgetMonthRange("2026-12-01").to).toBe("2027-01-25T00:00:00+03:00");
    expect(budgetMonthSpan("2026-11-01")).toBe("25 Nov – 24 Dec");
  });

  it("keeps the day within 1–28 and says when it changed", () => {
    expect(setMonthStartDay(31)).toBe(true);
    expect(getMonthStartDay()).toBe(28);
    expect(setMonthStartDay(28)).toBe(false);
    expect(setMonthStartDay(null)).toBe(true);
    expect(getMonthStartDay()).toBe(1);
  });

  it("names the days for the picker", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "28th",
    ]);
  });
});

describe("the ledger currency", () => {
  it("prefixes amounts with the chosen code and never converts them", () => {
    expect(formatKes(450_000)).toBe("KES 4,500");
    expect(setCurrency("UGX")).toBe(true);
    expect(formatKes(450_000)).toBe("UGX 4,500");
    expect(formatKes(-3350, { signed: true })).toBe("−UGX 33.50");
  });

  it("falls back to KES for an unknown code", () => {
    setCurrency("USD");
    expect(setCurrency("XYZ")).toBe(true);
    expect(getCurrency()).toBe("KES");
  });
});

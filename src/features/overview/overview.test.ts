import type { CategoryMonthRow } from "@/features/month/month";
import { periodLabel, periodStart, spendingSlices, trendFrom } from "./overview";

const NOW = new Date("2026-11-03T09:00:00Z");

describe("period", () => {
  it("starts this month, this calendar year, or never", () => {
    expect(periodStart("month", NOW)).toBe("2026-11-01");
    expect(periodStart("year", NOW)).toBe("2026-01-01");
    expect(periodStart("all", NOW)).toBeNull();
    expect([periodLabel("month", NOW), periodLabel("year", NOW), periodLabel("all", NOW)]).toEqual([
      "November",
      "2026",
      "All time",
    ]);
  });

  it("uses Nairobi's month at the turn of a month", () => {
    expect(periodStart("month", new Date("2026-10-31T21:30:00Z"))).toBe("2026-11-01");
  });

  it("shows twelve months up to this one", () => {
    expect(trendFrom(NOW)).toEqual({ from: "2025-12-01", to: "2026-11-01" });
  });
});

describe("spendingSlices", () => {
  const row = (month: string, id: string | null, cents: number): CategoryMonthRow => ({
    month,
    category_id: id,
    total_cents: cents,
    category: id
      ? {
          name: id === "rent" ? "Rent" : "Food",
          emoji: id === "rent" ? "🏠" : "🛒",
          colour: id === "rent" ? "cat-1" : "cat-2",
        }
      : null,
  });

  it("adds up each category over the period's months, largest first", () => {
    const slices = spendingSlices([
      row("2026-10-01", "food", 300),
      row("2026-10-01", "rent", 4500),
      row("2026-11-01", "food", 2000),
      row("2026-11-01", null, 700),
      row("2026-11-01", "rent", 0),
    ]);
    expect(slices).toEqual([
      { key: "rent", label: "Rent", emoji: "🏠", colour: "cat-1", value: 4500 },
      { key: "food", label: "Food", emoji: "🛒", colour: "cat-2", value: 2300 },
      { key: "review", label: "To review", emoji: "❓", colour: "cat-12", value: 700 },
    ]);
  });

  it("leaves out categories with nothing spent", () => {
    expect(spendingSlices([row("2026-11-01", "rent", 0)])).toEqual([]);
  });
});

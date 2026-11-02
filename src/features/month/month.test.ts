import {
  addMonths,
  compareCategories,
  currentMonth,
  EMPTY,
  highlights,
  kpis,
  monthRange,
  monthTitle,
  parseMonth,
  totalsFor,
  trend,
  type CategoryMonthRow,
  type MonthTotals,
  type MonthTotalsRow,
} from "./month";

const KES = 100; // cents per shilling

function row(
  month: string,
  income: number,
  spending: number,
  extra: Partial<MonthTotalsRow> = {},
): MonthTotalsRow {
  return {
    month,
    income_cents: income * KES,
    spending_cents: spending * KES,
    fees_cents: 0,
    repaid_cents: 0,
    saved_cents: 0,
    ...extra,
  };
}

const totals = (t: Partial<MonthTotals>): MonthTotals => ({ ...EMPTY, ...t });

describe("months", () => {
  it("takes the Nairobi month, which starts three hours before UTC's", () => {
    expect(currentMonth(new Date("2026-10-31T20:59:00Z"))).toBe("2026-10-01");
    expect(currentMonth(new Date("2026-10-31T21:00:00Z"))).toBe("2026-11-01");
  });

  it("reads only well-formed months from the URL", () => {
    expect(parseMonth("2026-10")).toBe("2026-10-01");
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("2026-1")).toBeNull();
    expect(parseMonth(null)).toBeNull();
  });

  it("steps across years", () => {
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2026-11-01", 2)).toBe("2027-01-01");
    expect(monthTitle("2026-10-01")).toBe("October 2026");
  });

  it("gives Nairobi bounds for the transactions", () => {
    expect(monthRange("2026-12-01")).toEqual({
      from: "2026-12-01T00:00:00+03:00",
      to: "2027-01-01T00:00:00+03:00",
    });
  });
});

describe("kpis", () => {
  it("compares with last month, coloured by whether the change is good news", () => {
    const current = totals({
      income: 198_400 * KES,
      spending: 171_900 * KES,
      fees: 2_200 * KES,
      repaid: 46_200 * KES,
    });
    const previous = totals({
      income: 195_000 * KES,
      spending: 177_500 * KES,
      fees: 1_800 * KES,
      repaid: 41_500 * KES,
    });
    const byKey = Object.fromEntries(kpis(current, previous).map((k) => [k.key, k]));

    expect(byKey.income).toMatchObject({ cents: 198_400 * KES, change: "▲ 1.7%", tone: "good" });
    expect(byKey.spent).toMatchObject({ change: "▼ 3.2%", tone: "good" });
    expect(byKey.left).toMatchObject({ cents: 26_500 * KES, change: "▲ 9,000", tone: "good", emoji: "🟢" });
    expect(byKey.repaid).toMatchObject({ change: "▲ 4,700", tone: "good" });
    expect(byKey.fees).toMatchObject({ change: "▲ 22%", tone: "bad" });
  });

  it("says nothing about a percent change from zero, and 'same' when unchanged", () => {
    const byKey = Object.fromEntries(
      kpis(totals({ income: 100 * KES, fees: 50 * KES }), totals({ fees: 50 * KES })).map((k) => [k.key, k]),
    );
    expect(byKey.income?.change).toBeNull();
    expect(byKey.fees).toMatchObject({ change: "same", tone: "neutral" });
    expect(byKey.repaid?.change).toBeNull();
  });

  it("shows a deficit in red", () => {
    const left = kpis(totals({ income: 100 * KES, spending: 300 * KES }), totals({ income: 100 * KES }))[2]!;
    expect(left).toMatchObject({ cents: -200 * KES, emoji: "🔴", change: "▼ 300", tone: "bad" });
  });
});

describe("trend", () => {
  it("has the month and the five before it, with zeros for empty months", () => {
    const rows = [row("2026-10-01", 198_400, 171_900), row("2026-08-01", 184_000, 190_700)];
    const months = trend(rows, "2026-10-01");
    expect(months.map((m) => m.label)).toEqual(["May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
    expect(months[3]).toMatchObject({ income: 184_000 * KES, net: -6_700 * KES });
    expect(months[4]).toMatchObject({ income: 0, spending: 0, net: 0 });
    expect(totalsFor(rows, "2026-10-01").spending).toBe(171_900 * KES);
  });
});

describe("compareCategories", () => {
  const cat = (name: string, emoji = "🏷️") => ({ name, emoji, colour: "cat-1" });
  const rows: CategoryMonthRow[] = [
    { month: "2026-10-01", category_id: "rent", total_cents: 45_000 * KES, category: cat("Rent", "🏠") },
    { month: "2026-09-01", category_id: "rent", total_cents: 45_000 * KES, category: cat("Rent", "🏠") },
    { month: "2026-10-01", category_id: "food", total_cents: 28_400 * KES, category: cat("Food", "🛒") },
    { month: "2026-09-01", category_id: "food", total_cents: 26_800 * KES, category: cat("Food", "🛒") },
    { month: "2026-09-01", category_id: "shop", total_cents: 15_400 * KES, category: cat("Shopping") },
    { month: "2026-10-01", category_id: null, total_cents: 2_500 * KES, category: null },
    { month: "2026-08-01", category_id: "food", total_cents: 99_999 * KES, category: cat("Food") },
  ];

  it("lines up both months, largest this month first, and ignores other months", () => {
    const list = compareCategories(rows, "2026-10-01", "2026-09-01");
    expect(list.map((c) => [c.label, c.diff / KES])).toEqual([
      ["Rent", 0],
      ["Food", 1_600],
      ["To review", 2_500],
      ["Shopping", -15_400],
    ]);
    expect(list[2]).toMatchObject({ emoji: "❓", key: "review" });
  });

  it("writes the 'This month' lines", () => {
    const list = compareCategories(rows, "2026-10-01", "2026-09-01");
    const current = totals({ income: 198_400 * KES, spending: 171_900 * KES, repaid: 46_200 * KES });
    const previous = totals({ income: 195_000 * KES, spending: 177_500 * KES });
    expect(highlights(current, previous, list)).toEqual([
      "🟢 Spending down 3.2%, 26,500 left over.",
      "🛒 Food up 6%, +1,600.",
      "💸 46,200 went to loans this month.",
    ]);
  });
});

describe("highlights", () => {
  it("handles an empty month and a first month with nothing to compare", () => {
    expect(highlights(EMPTY, EMPTY, [])).toEqual(["Nothing recorded this month yet."]);
    expect(
      highlights(totals({ income: 500 * KES, spending: 800 * KES, saved: 100 * KES }), EMPTY, []),
    ).toEqual(["🔴 300 more out than in.", "🐷 100 went into savings."]);
  });
});

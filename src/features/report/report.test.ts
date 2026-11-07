import type { CategoryMonthRow } from "@/features/month/month";
import { buildReport, monthEnd, reportCategories, reportPosition, type BalanceAtRow } from "./report";

const KES = 100;
const OCT = "2026-10-01";
const SEP = "2026-09-01";

// Invented figures throughout.
const totals = [
  {
    month: SEP,
    income_cents: 195_000 * KES,
    spending_cents: 177_500 * KES,
    fees_cents: 0,
    repaid_cents: 0,
    saved_cents: 0,
  },
  {
    month: OCT,
    income_cents: 198_400 * KES,
    spending_cents: 171_900 * KES,
    fees_cents: 1_200 * KES,
    repaid_cents: 46_200 * KES,
    saved_cents: 0,
  },
];

const cat = (
  month: string,
  id: string | null,
  name: string,
  kes: number,
  colour = "cat-1",
): CategoryMonthRow => ({
  month,
  category_id: id,
  total_cents: kes * KES,
  category: id ? { name, emoji: "🏷️", colour } : null,
});

const balance = (
  name: string,
  kind: string,
  kes: number,
  extra: Partial<BalanceAtRow> = {},
): BalanceAtRow => ({
  account_id: name,
  name,
  kind,
  debt_term: null,
  counts_in_net: kind !== "loan" || extra.debt_term === "short",
  archived_at: null,
  balance_cents: kes * KES,
  ...extra,
});

const balances = [
  balance("Wallet", "wallet", 87_400),
  balance("Sacco", "savings", 250_000),
  balance("Overdraft", "loan", -23_820, { debt_term: "short", counts_in_net: true }),
  balance("Car loan", "loan", -1_226_500, { debt_term: "long", counts_in_net: false }),
];

describe("monthEnd", () => {
  it("is the first moment of the next month in Nairobi", () => {
    expect(monthEnd(OCT)).toBe("2026-11-01T00:00:00+03:00");
    expect(monthEnd("2026-12-01")).toBe("2027-01-01T00:00:00+03:00");
  });
});

describe("reportPosition", () => {
  it("sums the month-end balances like the Overview does", () => {
    expect(reportPosition(balances, OCT).map((p) => [p.key, p.cents / KES])).toEqual([
      ["available", 87_400],
      ["savings", 250_000],
      ["short", -23_820],
      ["long", -1_226_500],
      ["net", 313_580],
      ["all", -912_920],
    ]);
  });

  it("keeps an account archived after the month end and drops one archived before", () => {
    const rows = [
      balance("Old wallet", "wallet", 1_000, { archived_at: "2026-10-15T09:00:00Z" }),
      balance("Later wallet", "wallet", 2_000, { archived_at: "2026-11-03T09:00:00Z" }),
    ];
    expect(reportPosition(rows, OCT)[0]!.cents).toBe(2_000 * KES);
  });
});

describe("reportCategories", () => {
  it("lists this month's categories largest first with the change against last month", () => {
    const rows = [
      cat(OCT, "rent", "Rent", 45_000, "cat-2"),
      cat(SEP, "rent", "Rent", 45_000, "cat-2"),
      cat(OCT, "food", "Food", 28_400),
      cat(SEP, "food", "Food", 26_800),
      cat(OCT, "shop", "Shopping", 12_600),
      cat(SEP, "shop", "Shopping", 15_400),
      cat(SEP, "gone", "Only in September", 5_000),
    ];
    expect(reportCategories(rows, OCT, SEP)).toEqual([
      {
        key: "rent",
        label: "Rent",
        emoji: "🏷️",
        cents: 45_000 * KES,
        share: 100,
        colour: "var(--cat-2)",
        change: "—",
        tone: "same",
      },
      {
        key: "food",
        label: "Food",
        emoji: "🏷️",
        cents: 28_400 * KES,
        share: 63.1,
        colour: "var(--cat-1)",
        change: "+1,600",
        tone: "more",
      },
      {
        key: "shop",
        label: "Shopping",
        emoji: "🏷️",
        cents: 12_600 * KES,
        share: 28,
        colour: "var(--cat-1)",
        change: "−2,800",
        tone: "less",
      },
    ]);
  });

  it("groups everything after the eighth category into Other", () => {
    const rows = Array.from({ length: 11 }, (_, i) => cat(OCT, `c${i}`, `Category ${i}`, 1_000 * (20 - i)));
    const lines = reportCategories(rows, OCT, SEP);
    expect(lines).toHaveLength(9);
    expect(lines[8]).toMatchObject({ key: "other", label: "Other (3)", cents: (12 + 11 + 10) * 1_000 * KES });
  });

  it("shows a ninth category on its own rather than an Other of one", () => {
    const rows = Array.from({ length: 9 }, (_, i) => cat(OCT, `c${i}`, `Category ${i}`, 1_000 * (20 - i)));
    expect(reportCategories(rows, OCT, SEP).map((l) => l.key)).not.toContain("other");
  });

  it("names spending without a category To review", () => {
    expect(reportCategories([cat(OCT, null, "", 900)], OCT, SEP)[0]).toMatchObject({
      label: "To review",
      emoji: "❓",
      colour: "var(--cat-12)",
    });
  });
});

describe("buildReport", () => {
  const report = buildReport({
    month: OCT,
    totals,
    categories: [cat(OCT, "food", "Food", 28_400), cat(SEP, "food", "Food", 26_800)],
    bills: [
      { amount_cents: 45_000 * KES, status: "paid" },
      { amount_cents: 9_900 * KES, status: "paid" },
      { amount_cents: 51_100 * KES, status: "due" },
      { amount_cents: 2_000 * KES, status: "skipped" },
    ],
    balances,
    now: new Date("2026-11-08T07:00:00Z"),
  });

  it("has the four totals with their change against last month", () => {
    expect(report.kpis.map((k) => [k.label, k.cents / KES, k.note])).toEqual([
      ["Income", 198_400, "▲ 1.7% vs Sep"],
      ["Spent", 171_900, "▼ 3.2% vs Sep"],
      ["Left over", 26_500, "▲ 9,000 vs Sep"],
      ["Net position", 313_580, "Available + savings − short-term debt"],
    ]);
  });

  it("has six months of trend ending with the report month", () => {
    expect(report.trend.map((m) => m.label)).toEqual(["May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
  });

  it("sums the month's bills by status", () => {
    expect(report.bills).toEqual({ paid: 54_900 * KES, due: 51_100 * KES, skipped: 2_000 * KES });
  });

  it("reuses the Month highlights", () => {
    expect(report.highlights[0]).toBe("🟢 Spending down 3.2%, 26,500 left over.");
    expect(report.highlights).toContain("💸 46,200 went to loans this month.");
  });

  it("knows whether the month is over", () => {
    expect(report.inProgress).toBe(false);
    expect(
      buildReport({
        month: "2026-11-01",
        totals,
        categories: [],
        bills: [],
        balances,
        now: new Date("2026-11-08"),
      }).inProgress,
    ).toBe(true);
  });
});

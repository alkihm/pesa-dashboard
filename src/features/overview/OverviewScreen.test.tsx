import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { Db } from "@/lib/supabase";
import { OverviewScreen } from "./OverviewScreen";

const KES = 100;
const NOW = new Date("2026-11-03T09:00:00Z");

const base = {
  user_id: "u",
  archived_at: null,
  last_activity: null,
  snapshot_at: null,
  snapshot_cents: null,
  snapshot_source: null,
  difference_cents: null,
  goal_cents: null,
  locked_until: null,
  debt_term: null,
};

// Invented accounts and amounts.
const balances = [
  {
    ...base,
    account_id: "wal",
    name: "Wallet A",
    emoji: "📱",
    kind: "wallet",
    counts_in_net: true,
    balance_cents: 18_450 * KES,
    sort_order: 1,
    snapshot_at: "2026-11-02T10:00:00Z",
    snapshot_source: "sms",
    snapshot_cents: 18_450 * KES,
    difference_cents: 0,
  },
  {
    ...base,
    account_id: "bnk",
    name: "Bank current",
    emoji: "🏦",
    kind: "bank",
    counts_in_net: true,
    balance_cents: 64_200 * KES,
    sort_order: 2,
    snapshot_at: "2026-11-02T10:00:00Z",
    snapshot_source: "sms",
    snapshot_cents: 61_700 * KES,
    difference_cents: 2_500 * KES,
  },
  {
    ...base,
    account_id: "mmf",
    name: "Rainy day fund",
    emoji: "📈",
    kind: "savings",
    counts_in_net: true,
    balance_cents: 120_000 * KES,
    goal_cents: 150_000 * KES,
    sort_order: 3,
  },
  {
    ...base,
    account_id: "ovd",
    name: "Overdraft",
    emoji: "⚡",
    kind: "loan",
    debt_term: "short",
    counts_in_net: true,
    balance_cents: -4_320 * KES,
    sort_order: 4,
  },
  {
    ...base,
    account_id: "car",
    name: "Car loan",
    emoji: "🚗",
    kind: "loan",
    debt_term: "long",
    counts_in_net: false,
    balance_cents: -1_180_000 * KES,
    sort_order: 5,
  },
];
const terms = [
  { id: "ovd", due_day: 4, original_cents: 6_000 * KES, limit_cents: null, sms_account_hint: "fuliza" },
  { id: "car", due_day: 5, original_cents: 1_600_000 * KES, limit_cents: null, sms_account_hint: null },
];
const monthTotals = [
  {
    month: "2026-10-01",
    income_cents: 190_000 * KES,
    spending_cents: 170_000 * KES,
    fees_cents: 0,
    repaid_cents: 0,
    saved_cents: 0,
  },
  {
    month: "2026-11-01",
    income_cents: 50_000 * KES,
    spending_cents: 20_000 * KES,
    fees_cents: 0,
    repaid_cents: 0,
    saved_cents: 0,
  },
];
const cat = (id: string, name: string, emoji: string, colour: string) => ({
  category_id: id,
  category: { name, emoji, colour },
});
const categoryTotals = [
  { month: "2026-11-01", total_cents: 12_000 * KES, ...cat("rent", "Rent", "🏠", "cat-1") },
  { month: "2026-11-01", total_cents: 8_000 * KES, ...cat("food", "Food", "🛒", "cat-2") },
  { month: "2026-10-01", total_cents: 45_000 * KES, ...cat("rent", "Rent", "🏠", "cat-1") },
];

function fakeDb() {
  const calls: { table: string; filters: string[] }[] = [];
  const db = {
    rpc: () => Promise.resolve({ data: [], error: null }),
    from(table: string) {
      const call = { table, filters: [] as string[] };
      calls.push(call);
      const answer = () => {
        if (table === "account_balances") return balances;
        if (table === "accounts") return terms;
        if (table === "month_totals") return monthTotals;
        // The Bills card and the loan slider (bills epic) find no bills and no saved share here.
        if (table === "bills" || table === "bill_months") return [];
        if (table === "settings") return null;
        // Only the rows from the period's start, as the query asks.
        const from = call.filters.find((f) => f.startsWith("gte:month|"))?.split("|")[1];
        return categoryTotals.filter((r) => !from || r.month >= from);
      };
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
          Promise.resolve({ data: answer(), error: null }).then(ok, bad),
      };
      for (const name of ["select", "eq", "is", "order", "in", "gte", "lte", "not", "or", "maybeSingle"]) {
        builder[name] = (...args: unknown[]) => {
          call.filters.push(`${name}:${args.map(String).join("|")}`);
          return builder;
        };
      }
      return builder;
    },
  };
  return { db: db as unknown as Db, calls };
}

function renderOverview() {
  const fake = fakeDb();
  const router = createMemoryRouter([
    { path: "/", element: <OverviewScreen db={() => fake.db} now={NOW} /> },
  ]);
  render(<RouterProvider router={router} />);
  return fake;
}

describe("Overview", () => {
  it("leads with net position from the shared totals", async () => {
    renderOverview();
    const totals = within(await screen.findByRole("region", { name: "Totals" }));
    // D-010: 18,450 + 64,200 + 120,000 − 4,320; the car loan stays out.
    expect(totals.getByText("⚖️ Net position").parentElement).toHaveTextContent("198,330");
    expect(totals.getByRole("link", { name: /^Debt/ })).toHaveTextContent("Short 4,320 · Long 1.18M");
  });

  it("flags accounts that disagree with their SMS", async () => {
    renderOverview();
    expect(await screen.findByRole("link", { name: "1 to reconcile" })).toHaveAttribute("href", "/review");
    const accounts = within(screen.getByRole("region", { name: "Accounts" }));
    expect(accounts.getByRole("link", { name: /Bank current/ })).toHaveTextContent("⚠ SMS says 61,700");
    expect(accounts.getByRole("link", { name: /Wallet A/ })).toHaveTextContent("✓ Matches SMS");
  });

  it("shows savings with the goal and the soonest debts with due tags", async () => {
    renderOverview();
    const savings = within(await screen.findByRole("region", { name: "🐷 Savings · 120,000" }));
    expect(savings.getByText("Goal 150k · 80%")).toBeInTheDocument();

    const debt = within(screen.getByRole("region", { name: "💳 Debt · 1,184,320" }));
    expect(debt.getByText("Overdraft").parentElement).toHaveTextContent("Due 4 Nov");
    fireEvent.click(debt.getByRole("button", { name: /^Long/ }));
    expect(debt.getByText("Car loan").parentElement).toHaveTextContent("Due 5 Nov");
    expect(debt.getByRole("link", { name: "View all 1 ›" })).toHaveAttribute(
      "href",
      "/accounts/debt?term=long",
    );
  });

  it("shows this month against twelve months of income and expense", async () => {
    renderOverview();
    const trend = within(await screen.findByRole("region", { name: "📅 November · income vs expense" }));
    expect(trend.getByText("Income", { selector: "dt" }).nextSibling).toHaveTextContent("50k");
    expect(trend.getByText("Left", { selector: "dt" }).nextSibling).toHaveTextContent("+30k");
    expect(trend.getByRole("table", { name: "Income and expense, Dec to Nov" })).toBeInTheDocument();
  });

  it("switches where the money went between month, year and all time", async () => {
    const { calls } = renderOverview();
    const spending = within(await screen.findByRole("region", { name: "Where the money went" }));
    expect(await spending.findByRole("table", { name: "November spending by category" })).toHaveTextContent(
      /Rent.*12,000.*Food.*8,000/,
    );

    fireEvent.click(screen.getByRole("button", { name: "Year" }));
    await waitFor(() =>
      expect(spending.getByRole("table", { name: "2026 spending by category" })).toHaveTextContent(
        /Rent.*57,000/,
      ),
    );
    expect(calls.filter((c) => c.table === "category_month_totals").map((c) => c.filters)).toContainEqual(
      expect.arrayContaining(["gte:month|2026-01-01"]),
    );
  });
});

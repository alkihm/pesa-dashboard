import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { Db } from "@/lib/supabase";
import { MonthScreen } from "./MonthScreen";

const KES = 100;
const NOW = new Date("2026-11-02T09:00:00Z");

const totals = [
  {
    month: "2026-10-01",
    income_cents: 198_400 * KES,
    spending_cents: 171_900 * KES,
    fees_cents: 2_200 * KES,
    repaid_cents: 46_200 * KES,
    saved_cents: 0,
  },
  {
    month: "2026-09-01",
    income_cents: 195_000 * KES,
    spending_cents: 177_500 * KES,
    fees_cents: 1_800 * KES,
    repaid_cents: 41_500 * KES,
    saved_cents: 0,
  },
  {
    month: "2026-08-01",
    income_cents: 184_000 * KES,
    spending_cents: 190_700 * KES,
    fees_cents: 0,
    repaid_cents: 0,
    saved_cents: 0,
  },
];
const food = { name: "Food", emoji: "🛒", colour: "cat-2" };
const categories = [
  { month: "2026-10-01", category_id: "food", total_cents: 28_400 * KES, category: food },
  { month: "2026-09-01", category_id: "food", total_cents: 26_800 * KES, category: food },
];
const tx = {
  id: "t1",
  occurred_at: "2026-10-31T09:00:00Z",
  amount_cents: -3_840 * KES,
  kind: "spending",
  payee: "DEMO MART",
  note: null,
  channel: null,
  needs_review: false,
  transfer_id: null,
  parent_id: null,
  original_currency: null,
  original_minor: null,
  source: "sms",
  version: 1,
  account: { id: "a1", name: "M-PESA", emoji: "📱" },
  category: { id: "c1", ...food },
  sms: null,
};

/** Answers each table and records the filters each query used. */
function fakeDb({ rows = [tx], failTotals = false } = {}) {
  const calls: { table: string; filters: string[] }[] = [];
  const db = {
    from(table: string) {
      const call = { table, filters: [] as string[] };
      calls.push(call);
      const answer = () => {
        if (table === "month_totals")
          return failTotals ? { data: null, error: { message: "boom" } } : { data: totals, error: null };
        if (table === "category_month_totals") return { data: categories, error: null };
        return { data: rows, error: null };
      };
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
          Promise.resolve(answer()).then(ok, bad),
      };
      for (const name of [
        "select",
        "gte",
        "lte",
        "lt",
        "in",
        "eq",
        "is",
        "order",
        "limit",
        "or",
        "not",
        "neq",
      ]) {
        builder[name] = (...args: unknown[]) => {
          if (name !== "select") call.filters.push(`${name}:${args.map(String).join("|")}`);
          return builder;
        };
      }
      return builder;
    },
  };
  return { db: db as unknown as Db, calls };
}

function renderAt(path: string, fake = fakeDb()) {
  const router = createMemoryRouter(
    [
      { path: "/month", element: <MonthScreen db={() => fake.db} now={NOW} /> },
      { path: "/activity/:id", element: <h1>Detail</h1> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return { router, ...fake };
}

describe("Month screen", () => {
  it("opens on the current Nairobi month", async () => {
    renderAt("/month");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("November 2026");
    expect(screen.getByText("vs October")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Next month" })).not.toBeInTheDocument();
  });

  it("shows the month's totals against the month before", async () => {
    renderAt("/month?m=2026-10");
    expect((await screen.findAllByText("198,400"))[0]).toHaveClass(/kpiValue/);
    expect(screen.getByText("26,500")).toBeInTheDocument();
    expect(screen.getAllByText("▲ 1.7%")[0]).toBeInTheDocument();
    expect(screen.getAllByText("▲ 22%")[0]).toHaveClass(/bad/);
  });

  it("asks for six months of totals and two months of categories", async () => {
    const { calls } = renderAt("/month?m=2026-10");
    await screen.findAllByText("198,400");
    expect(calls.find((c) => c.table === "month_totals")?.filters).toEqual([
      "gte:month|2026-05-01",
      "lte:month|2026-10-01",
    ]);
    expect(calls.find((c) => c.table === "category_month_totals")?.filters).toEqual([
      "in:month|2026-10-01,2026-09-01",
      "eq:kind|spending",
    ]);
    expect(calls.find((c) => c.table === "transactions")?.filters).toContain(
      "gte:occurred_at|2026-10-01T00:00:00+03:00",
    );
  });

  it("compares categories and writes the month's highlights", async () => {
    renderAt("/month?m=2026-10");
    const list = await screen.findByRole("list", { name: "Spending by category, Oct and Sep" });
    expect(within(list).getByText("+1,600")).toBeInTheDocument();
    expect(screen.getByText("🟢 Spending down 3.2%, 26,500 left over.")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Income and spending, May to Oct" })).toBeInTheDocument();
  });

  it("moves between months with the arrows and the picker", async () => {
    const { router } = renderAt("/month?m=2026-10");
    expect(screen.getAllByRole("link", { name: "Previous month" })[0]).toHaveAttribute(
      "href",
      "/month?m=2026-09",
    );
    expect(screen.getAllByRole("link", { name: "Next month" })[0]).toHaveAttribute(
      "href",
      "/month?m=2026-11",
    );

    fireEvent.change(screen.getByLabelText("Choose month"), { target: { value: "2025-03" } });
    expect(router.state.location.search).toBe("?m=2025-03");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("March 2025");
  });

  it("lists the month's transactions and opens one", async () => {
    const { router } = renderAt("/month?m=2026-10");
    const table = await screen.findByRole("table", { name: "October transactions" });
    expect(within(table).getByText("DEMO MART")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "See all October transactions" }));
    fireEvent.click(within(screen.getByRole("list", { name: "October transactions" })).getByRole("button"));
    expect(router.state.location.pathname).toBe("/activity/t1");
  });

  it("says when a month has no transactions, and when loading fails", async () => {
    renderAt("/month?m=2026-10", fakeDb({ rows: [], failTotals: true }));
    expect(await screen.findByText("No transactions in October.")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the month: boom");
  });

  it("switches Overview and Compare on phones", async () => {
    renderAt("/month?m=2026-10");
    await screen.findAllByText("198,400");
    const compare = screen.getByRole("button", { name: "⚖️ Compare" });
    fireEvent.click(compare);
    expect(compare).toHaveAttribute("aria-pressed", "true");
  });
});

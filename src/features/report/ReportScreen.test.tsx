import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { Db } from "@/lib/supabase";
import { ReportScreen } from "./ReportScreen";

const KES = 100;
const now = new Date("2026-11-08T07:00:00Z");

// Invented figures.
const tables: Record<string, unknown> = {
  month_totals: [
    {
      month: "2026-09-01",
      income_cents: 195_000 * KES,
      spending_cents: 177_500 * KES,
      fees_cents: 0,
      repaid_cents: 0,
      saved_cents: 0,
    },
    {
      month: "2026-10-01",
      income_cents: 198_400 * KES,
      spending_cents: 171_900 * KES,
      fees_cents: 0,
      repaid_cents: 0,
      saved_cents: 0,
    },
  ],
  category_month_totals: [
    {
      month: "2026-10-01",
      category_id: "rent",
      total_cents: 45_000 * KES,
      category: { name: "Rent", emoji: "🏠", colour: "cat-2" },
    },
    {
      month: "2026-09-01",
      category_id: "rent",
      total_cents: 45_000 * KES,
      category: { name: "Rent", emoji: "🏠", colour: "cat-2" },
    },
  ],
  bill_months: [
    { amount_cents: 45_000 * KES, status: "paid" },
    { amount_cents: 5_100 * KES, status: "due" },
  ],
};
const balances = [
  {
    account_id: "w",
    name: "Wallet",
    kind: "wallet",
    debt_term: null,
    counts_in_net: true,
    archived_at: null,
    balance_cents: 87_400 * KES,
  },
];

function fakeDb() {
  const calls: { table: string; filters: unknown[][] }[] = [];
  const rpc: unknown[][] = [];
  const db = {
    rpc: (...args: unknown[]) => {
      rpc.push(args);
      return Promise.resolve({ data: balances, error: null });
    },
    from(table: string) {
      const call = { table, filters: [] as unknown[][] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
          Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok, bad),
      };
      for (const name of ["select", "eq", "is", "in", "gte", "lte"])
        builder[name] = (...args: unknown[]) => {
          call.filters.push([name, ...args]);
          return builder;
        };
      return builder;
    },
  };
  return { db: db as unknown as Db, calls, rpc };
}

function renderReport(url: string, fake = fakeDb()) {
  const router = createMemoryRouter(
    [{ path: "/report", element: <ReportScreen db={() => fake.db} now={now} /> }],
    {
      initialEntries: [url],
    },
  );
  render(<RouterProvider router={router} />);
  return fake;
}

describe("Month report", () => {
  it("shows the month from the link, with its totals, position and bills", async () => {
    const fake = renderReport("/report?m=2026-10");
    const sheet = within(await screen.findByRole("article", { name: "Report for October 2026" }));
    const totals = within(sheet.getByRole("region", { name: "Totals" }));
    expect(totals.getByText("198,400")).toBeInTheDocument();
    expect(totals.getByText("▲ 1.7% vs Sep")).toBeInTheDocument();
    expect(sheet.getByRole("heading", { name: "Position at month end" })).toBeInTheDocument();
    expect(sheet.getByText("Generated 8 Nov 2026")).toBeInTheDocument();
    expect(within(sheet.getByRole("region", { name: "Bills" })).getByText("5,100")).toBeInTheDocument();
    expect(sheet.getByRole("row", { name: /Rent/ })).toHaveTextContent("🏠 Rent45,000—");

    // Balances at the end of October: the first moment of November in Nairobi.
    expect(fake.rpc).toEqual([["account_balances_at", { p_at: "2026-11-01T00:00:00+03:00" }]]);
    const bills = fake.calls.find((c) => c.table === "bill_months")!;
    expect(bills.filters).toContainEqual(["eq", "month", "2026-10-01"]);
  });

  it("names the PDF after the month", async () => {
    renderReport("/report?m=2026-10");
    await screen.findByRole("article");
    expect(document.title).toBe("Pesa report October 2026");
  });

  it("prints when Download PDF is pressed", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    renderReport("/report?m=2026-10");
    fireEvent.click(await screen.findByRole("button", { name: "⬇ Download PDF" }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it("defaults to this month, shown as in progress, with no link to a future month", async () => {
    renderReport("/report");
    const sheet = within(await screen.findByRole("article", { name: "Report for November 2026" }));
    expect(sheet.getByRole("heading", { name: "Position today" })).toBeInTheDocument();
    const months = within(screen.getByRole("navigation", { name: "Choose month" }));
    expect(months.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/report?m=2026-10"]);
  });
});

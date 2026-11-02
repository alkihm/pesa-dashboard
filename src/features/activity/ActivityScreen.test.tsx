import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { Db } from "@/lib/supabase";
import { ActivityScreen } from "./ActivityScreen";
import { toCategoryTotals } from "./summary";

const account = { id: "a1", name: "M-PESA", emoji: "📱" };
const food = { id: "c1", name: "Food", emoji: "🛒", colour: "cat-2" };

function tx(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    occurred_at: "2026-10-29T09:00:00Z",
    amount_cents: -384000,
    kind: "spending",
    payee: `PAYEE ${id}`,
    note: null,
    channel: null,
    needs_review: false,
    transfer_id: null,
    parent_id: null,
    original_currency: null,
    original_minor: null,
    account,
    category: food,
    ...over,
  };
}

// A stand-in for the client: answers each table, and records the filters of each transactions query.
function fakeDb(lists: Record<string, unknown[]>) {
  const calls: string[] = [];
  const db = {
    from: (table: string) => {
      const parts: string[] = [];
      let head = false;
      const chain = {
        select: (_: string, opts?: { head?: boolean }) => ((head = !!opts?.head), chain),
        is: () => chain,
        eq: (c: string, v: unknown) => (parts.push(`${c}=${String(v)}`), chain),
        not: () => (parts.push("notes"), chain),
        neq: () => chain,
        or: () => (parts.push("search"), chain),
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: unknown) => void) => {
          if (table === "category_month_totals") {
            return resolve({ data: lists.month ?? [], error: null });
          }
          if (head) return resolve({ count: 3823, error: null });
          const key = parts.join("&") || "all";
          calls.push(key);
          resolve({ data: lists[key] ?? [], error: null });
        },
      };
      return chain;
    },
  };
  return { db: () => db as unknown as Db, calls };
}

function renderActivity(db: () => Db) {
  const router = createMemoryRouter([{ path: "/activity", element: <ActivityScreen db={db} /> }], {
    initialEntries: ["/activity"],
  });
  render(<RouterProvider router={router} />);
}

describe("Activity screen", () => {
  it("lists transactions as cards and as a table, with the review count on the filter", async () => {
    const { db } = fakeDb({
      all: [
        tx("1", { payee: "NAIVAS WESTGATE" }),
        tx("2", { payee: "Salary", amount_cents: 16500000, kind: "income", category: null }),
        tx("3", { payee: "BENARD ONGERI", needs_review: true, category: null, note: "Rent share" }),
      ],
    });
    renderActivity(db);

    const list = await screen.findByRole("list", { name: "Transactions" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("NAIVAS WESTGATE")).toBeInTheDocument();
    expect(within(list).getByText("+165,000")).toBeInTheDocument();
    expect(within(list).getByText(/To review ·/)).toBeInTheDocument();
    expect(within(list).getByText("📝 Rent share")).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Transactions" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);

    expect(await screen.findAllByRole("button", { name: "❓ Review 3,823" })).not.toHaveLength(0);
  });

  it("asks the database again when a filter is chosen", async () => {
    const { db, calls } = fakeDb({ all: [tx("1")], "needs_review=true": [tx("9", { needs_review: true })] });
    renderActivity(db);
    await screen.findAllByText("PAYEE 1");

    fireEvent.click((await screen.findAllByRole("button", { name: /Review/ }))[0]!);
    await waitFor(() => expect(screen.getAllByText("PAYEE 9").length).toBeGreaterThan(0));
    expect(calls).toEqual(["all", "needs_review=true"]);
  });

  it("opens the search box from the header and says when nothing matches", async () => {
    const { db } = fakeDb({ all: [tx("1")] });
    renderActivity(db);
    await screen.findAllByText("PAYEE 1");

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search payee, note or amount" }), {
      target: { value: "nothing" },
    });
    expect(await screen.findByText("Nothing matches that search.")).toBeInTheDocument();
  });
});

describe("toCategoryTotals", () => {
  it("sorts largest first, drops empty lines and shows rows without a category as To review", () => {
    const totals = toCategoryTotals([
      { category_id: "c1", total_cents: 2840000, category: { name: "Food", emoji: "🛒", colour: "cat-2" } },
      { category_id: null, total_cents: 335000, category: null },
      { category_id: "c2", total_cents: 4500000, category: { name: "Rent", emoji: "🏠", colour: "cat-1" } },
      { category_id: "c3", total_cents: 0, category: { name: "Fees", emoji: "🧾", colour: "cat-8" } },
    ]);
    expect(totals.map((t) => t.label)).toEqual(["Rent", "Food", "To review"]);
    expect(totals[2]).toEqual({ key: "review", label: "To review", emoji: "❓", cents: 335000 });
  });
});

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
    source: "sms",
    version: 1,
    account,
    category: food,
    sms: null,
    ...over,
  };
}

const categories = [
  { id: "c1", name: "Food", emoji: "🛒", colour: "cat-2", kind: "spending", system: false, sort_order: 1 },
  { id: "c2", name: "Rent", emoji: "🏠", colour: "cat-1", kind: "spending", system: false, sort_order: 2 },
  { id: "c9", name: "Salary", emoji: "💼", colour: "cat-9", kind: "income", system: false, sort_order: 9 },
];

const sms = {
  sender: "MPESA",
  body: "SJJ9K3L2MI Confirmed. Ksh2,500.00 sent to BENARD ONGERI",
  received_at: "2026-10-30T09:20:00Z",
};

// A stand-in for the client: answers each table, records the filters of each transactions list query in `calls`
// and every write in `writes`. `saved` is what an update answers with (none: the row changed elsewhere).
function fakeDb(
  lists: Record<string, unknown[]>,
  { saved, applied = 0 }: { saved?: unknown; applied?: number } = {},
) {
  const calls: string[] = [];
  const writes: { op: string; table: string; values?: unknown }[] = [];
  const db = {
    rpc: (fn: string, args: unknown) => {
      writes.push({ op: "rpc", table: fn, values: args });
      return Promise.resolve({ data: applied, error: null });
    },
    from: (table: string) => {
      const parts: string[] = [];
      let head = false;
      let write: "update" | "insert" | undefined;
      const answer = () => {
        if (table === "categories") return { data: categories, error: null };
        if (table === "category_month_totals") return { data: lists.month ?? [], error: null };
        if (table === "payee_rules") return { data: write ? { id: "rule-1" } : null, error: null };
        if (write) return { data: saved ?? null, error: null };
        if (head) return { count: 3823, error: null };
        const key = parts.join("&") || "all";
        calls.push(key);
        return { data: lists[key] ?? [], error: null };
      };
      const chain = {
        select: (_: string, opts?: { head?: boolean }) => ((head = !!opts?.head), chain),
        update: (values: unknown) => (
          (write = "update"),
          writes.push({ op: "update", table, values }),
          chain
        ),
        insert: (values: unknown) => (
          (write = "insert"),
          writes.push({ op: "insert", table, values }),
          chain
        ),
        is: () => chain,
        eq: (c: string, v: unknown) => (write || parts.push(`${c}=${String(v)}`), chain),
        not: () => (parts.push("notes"), chain),
        neq: () => chain,
        or: () => (parts.push("search"), chain),
        order: () => chain,
        limit: () => chain,
        single: () => Promise.resolve(answer()),
        maybeSingle: () => Promise.resolve(answer()),
        then: (resolve: (v: unknown) => void) => resolve(answer()),
      };
      return chain;
    },
  };
  return { db: () => db as unknown as Db, calls, writes };
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

describe("Activity · editing a transaction", () => {
  const review = tx("3", { payee: "BENARD ONGERI", needs_review: true, category: null, sms });

  it("opens a phone card with its SMS, saves the category with a payee rule and reloads", async () => {
    const { db, calls, writes } = fakeDb(
      {
        all: [review],
      },
      {
        saved: { ...review, needs_review: false, category: food, version: 2 },
        applied: 3,
      },
    );
    renderActivity(db);
    const list = await screen.findByRole("list", { name: "Transactions" });

    fireEvent.click(within(list).getByRole("button", { name: /BENARD ONGERI/ }));
    expect(within(list).getByRole("button", { name: /BENARD ONGERI/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(list).getByText(sms.body)).toBeInTheDocument();
    expect(within(list).getByText("📩 SMS from MPESA")).toBeInTheDocument();
    // Only categories of the row's kind; a review row starts with "always" ticked.
    expect(within(list).queryByRole("button", { name: /Salary/ })).not.toBeInTheDocument();
    expect(within(list).getByRole("checkbox", { name: "Always for BENARD ONGERI" })).toBeChecked();

    fireEvent.click(within(list).getByRole("button", { name: /Food/ }));
    fireEvent.change(within(list).getByRole("textbox", { name: "Note" }), {
      target: { value: "  Rent share " },
    });
    fireEvent.click(within(list).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "the rule also categorised 3 past transactions",
    );
    expect(writes).toEqual([
      {
        op: "update",
        table: "transactions",
        values: { category_id: "c1", note: "Rent share", needs_review: false },
      },
      { op: "insert", table: "payee_rules", values: { pattern: "BENARD ONGERI", category_id: "c1" } },
      { op: "rpc", table: "apply_payee_rule", values: { p_rule_id: "rule-1" } },
    ]);
    await waitFor(() => expect(calls).toEqual(["all", "all"]));
  });

  it("changes the category from the desktop drop-down without a rule", async () => {
    const { db, calls, writes } = fakeDb(
      {
        all: [review],
      },
      {
        saved: { ...review, needs_review: false, category: food },
      },
    );
    renderActivity(db);
    const table = await screen.findByRole("table", { name: "Transactions" });

    fireEvent.click(within(table).getByRole("button", { name: "Category: To review" }));
    const listbox = screen.getByRole("listbox", { name: "Categories" });
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["🛒 Food", "🏠 Rent"]);
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    fireEvent.keyDown(listbox, { key: "Enter" });

    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(writes).toEqual([
      { op: "update", table: "transactions", values: { category_id: "c1", note: null, needs_review: false } },
    ]);
    // The saved row replaces the old one in place; the list is not fetched again.
    expect(await within(table).findByRole("button", { name: "Category: Food" })).toBeInTheDocument();
    expect(calls).toEqual(["all"]);
  });

  it("says so when the row was changed elsewhere, and keeps the edit open", async () => {
    const { db } = fakeDb({ all: [review] });
    renderActivity(db);
    const list = await screen.findByRole("list", { name: "Transactions" });

    fireEvent.click(within(list).getByRole("button", { name: /BENARD ONGERI/ }));
    fireEvent.click(within(list).getByRole("button", { name: "Save" }));
    expect(await within(list).findByRole("alert")).toHaveTextContent("changed somewhere else");
    expect(within(list).getByRole("button", { name: "Save" })).toBeEnabled();
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

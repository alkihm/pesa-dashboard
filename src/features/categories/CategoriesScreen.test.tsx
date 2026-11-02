import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { Db } from "@/lib/supabase";
import { CategoriesScreen, CategoryScreen } from "./CategoriesScreen";

const KES = 100;
const NOW = new Date("2026-10-20T09:00:00Z");

const base = { system: false, archived_at: null, version: 3 };
const categories = [
  {
    ...base,
    id: "rent",
    name: "Rent",
    emoji: "🏠",
    colour: "cat-1",
    kind: "spending",
    monthly_budget_cents: 45_000 * KES,
    sort_order: 1,
  },
  {
    ...base,
    id: "eat",
    name: "Eating out",
    emoji: "🍽️",
    colour: "cat-7",
    kind: "spending",
    monthly_budget_cents: 6_000 * KES,
    sort_order: 2,
  },
  {
    ...base,
    id: "food",
    name: "Food",
    emoji: "🛒",
    colour: "cat-2",
    kind: "spending",
    monthly_budget_cents: 30_000 * KES,
    sort_order: 3,
  },
  {
    ...base,
    id: "care",
    name: "Personal care",
    emoji: "💅",
    colour: "cat-9",
    kind: "spending",
    monthly_budget_cents: null,
    sort_order: 4,
  },
  {
    ...base,
    id: "old",
    name: "Old hobby",
    emoji: "🎮",
    colour: "cat-6",
    kind: "spending",
    monthly_budget_cents: null,
    sort_order: 5,
    archived_at: "2026-09-01T00:00:00Z",
  },
  {
    ...base,
    id: "pay",
    name: "Salary",
    emoji: "💰",
    colour: "cat-10",
    kind: "income",
    monthly_budget_cents: null,
    sort_order: 6,
    system: true,
  },
];
const totals = [
  { category_id: "rent", total_cents: 45_000 * KES },
  { category_id: "eat", total_cents: 8_900 * KES },
  { category_id: "food", total_cents: 28_400 * KES },
  { category_id: "pay", total_cents: 165_000 * KES },
];
const rules = [
  { id: "r1", pattern: "CAFE", category_id: "eat" },
  { id: "r2", pattern: "NAIVAS", category_id: "food" },
];

type Write = { table: string; op: string; values?: unknown; filters: string[] };

/** Answers reads from the lists above and records every write. `stale` makes updates match no row. */
function fakeDb({ stale = false } = {}) {
  const writes: Write[] = [];
  const db = {
    rpc: (fn: string, args: unknown) => {
      writes.push({ table: fn, op: "rpc", values: args, filters: [] });
      return Promise.resolve({ data: 4, error: null });
    },
    from(table: string) {
      let write: Write | undefined;
      const answer = () => {
        if (write?.op === "update") return { data: stale ? null : { id: "eat" }, error: null };
        if (write?.op === "insert" && table === "categories") return { data: { id: "new-cat" }, error: null };
        if (write?.op === "insert") return { data: [{ id: "new-rule" }], error: null };
        if (write) return { data: null, error: null };
        if (table === "categories") return { data: categories, error: null };
        if (table === "category_month_totals") return { data: totals, error: null };
        return { data: rules, error: null };
      };
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
          Promise.resolve(answer()).then(ok, bad),
      };
      for (const op of ["insert", "update", "delete"]) {
        builder[op] = (values?: unknown) => {
          write = { table, op, values, filters: [] };
          writes.push(write);
          return builder;
        };
      }
      for (const name of ["select", "eq", "in", "is", "not", "order", "single", "maybeSingle"]) {
        builder[name] = (...args: unknown[]) => {
          if (write && name !== "select") write.filters.push(`${name}:${args.map(String).join("|")}`);
          return builder;
        };
      }
      return builder;
    },
  };
  return { db: db as unknown as Db, writes };
}

function renderAt(path: string, fake = fakeDb()) {
  const router = createMemoryRouter(
    [
      { path: "/categories", element: <CategoriesScreen db={() => fake.db} now={NOW} /> },
      { path: "/categories/new", element: <CategoryScreen db={() => fake.db} /> },
      { path: "/categories/:id", element: <CategoryScreen db={() => fake.db} /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return { router, ...fake };
}

const card = (name: string) => screen.getByRole("link", { name: new RegExp(`^${name}`) });

describe("Categories list", () => {
  it("shows this month's spending against each budget", async () => {
    renderAt("/categories");
    expect(await screen.findByText("October · 82,300 spent across 4 categories")).toBeInTheDocument();

    expect(within(card("Eating out")).getByText("Over by 2,900")).toHaveClass(/over/);
    expect(within(card("Food")).getByText("1,600 left")).toHaveClass(/near/);
    expect(within(card("Rent")).getByText("0 left")).toHaveClass(/near/);
    expect(within(card("Personal care")).getByText("No budget")).toBeInTheDocument();
    expect(within(card("Eating out")).getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
    expect(card("Food")).toHaveTextContent("Budget 30,000 · 1 payee rule");
    expect(card("Eating out")).toHaveAttribute("href", "/categories/eat");
  });

  it("switches to income", async () => {
    const { router } = renderAt("/categories");
    fireEvent.click(await screen.findByRole("button", { name: "💰 Income · 1" }));
    expect(router.state.location.search).toBe("?kind=income");
    expect(await screen.findByText("October · 165,000 in")).toBeInTheDocument();
    expect(within(card("Salary")).getByText("This month")).toBeInTheDocument();
  });

  it("lists archived categories and restores one", async () => {
    const { writes } = renderAt("/categories");
    fireEvent.click(await screen.findByText("Archived · 1"));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(writes).toContainEqual({
        table: "categories",
        op: "update",
        values: { archived_at: null },
        filters: ["eq:id|old", "eq:version|3", "maybeSingle:"],
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Restored Old hobby.");
  });

  it("makes a category from the desktop form, with a rule run over past rows", async () => {
    const { writes } = renderAt("/categories");
    const form = within(await screen.findByRole("region", { name: "＋ New category" }));
    fireEvent.change(form.getByLabelText("Name"), { target: { value: "Gym" } });
    fireEvent.click(form.getByRole("button", { name: "gym" }));
    fireEvent.click(form.getByRole("button", { name: "Violet" }));
    fireEvent.change(form.getByLabelText("Monthly budget · optional"), { target: { value: "2,500" } });
    fireEvent.change(form.getByLabelText("⚙️ Auto-assign when payee contains"), {
      target: { value: "fitness" },
    });
    fireEvent.click(form.getByRole("button", { name: "Add" }));
    expect(form.getByRole("list", { name: "Payee rules" })).toHaveTextContent("FITNESS");

    fireEvent.click(form.getByRole("button", { name: "Save category" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved Gym. 4 past transactions now have this category.",
    );
    expect(writes[0]).toMatchObject({
      table: "categories",
      op: "insert",
      values: {
        name: "Gym",
        kind: "spending",
        emoji: "🏋️",
        colour: "cat-6",
        monthly_budget_cents: 2_500 * KES,
        sort_order: 7,
      },
    });
    expect(writes[1]).toMatchObject({
      table: "payee_rules",
      op: "insert",
      values: [{ pattern: "FITNESS", category_id: "new-cat" }],
    });
    expect(writes[2]).toMatchObject({
      table: "apply_payee_rule",
      op: "rpc",
      values: { p_rule_id: "new-rule" },
    });
  });

  it("refuses a name that is taken and a rule another category has", async () => {
    const { writes } = renderAt("/categories");
    const form = within(await screen.findByRole("region", { name: "＋ New category" }));
    fireEvent.change(form.getByLabelText("⚙️ Auto-assign when payee contains"), {
      target: { value: "naivas" },
    });
    fireEvent.click(form.getByRole("button", { name: "Add" }));
    expect(form.getByRole("alert")).toHaveTextContent("NAIVAS already goes to Food.");

    fireEvent.change(form.getByLabelText("Name"), { target: { value: "food" } });
    fireEvent.click(form.getByRole("button", { name: "Save category" }));
    expect(form.getByRole("alert")).toHaveTextContent("There is already a spending category called Food.");
    expect(writes).toEqual([]);
  });
});

describe("Category page", () => {
  it("edits a category: budget, rules removed and added, then back to the list", async () => {
    const { writes, router } = renderAt("/categories/eat");
    expect(await screen.findByLabelText("Name")).toHaveValue("Eating out");
    expect(screen.queryByRole("group", { name: "Type" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Monthly budget · optional"), { target: { value: "9000" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove rule CAFE" }));
    fireEvent.click(screen.getByRole("button", { name: "Save category" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/categories"));
    expect(writes[0]).toMatchObject({
      table: "categories",
      op: "update",
      values: { name: "Eating out", emoji: "🍽️", colour: "cat-7", monthly_budget_cents: 9_000 * KES },
      filters: ["eq:id|eat", "eq:version|3", "maybeSingle:"],
    });
    expect(writes[1]).toMatchObject({ table: "payee_rules", op: "delete", filters: ["in:id|r1"] });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved Eating out.");
  });

  it("archives a category, but offers no archive for a built-in one", async () => {
    const { writes, router } = renderAt("/categories/care");
    fireEvent.click(await screen.findByRole("button", { name: "Archive category" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/categories"));
    expect(writes[0]).toMatchObject({
      table: "categories",
      op: "update",
      filters: ["eq:id|care", "eq:version|3", "maybeSingle:"],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Archived Personal care.");
  });

  it("has no archive button for a built-in category", async () => {
    renderAt("/categories/pay");
    expect(await screen.findByText(/Income category · built in/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive category" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Monthly budget · optional")).not.toBeInTheDocument();
  });

  it("says when the category changed elsewhere", async () => {
    renderAt("/categories/eat", fakeDb({ stale: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Save category" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
  });

  it("starts a new income category from the income tab", async () => {
    renderAt("/categories/new?kind=income");
    expect(await screen.findByRole("button", { name: "💰 Income" })).toHaveAttribute("aria-pressed", "true");
  });
});

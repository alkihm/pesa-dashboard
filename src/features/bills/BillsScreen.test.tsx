import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import type { Db } from "@/lib/supabase";
import { BillsScreen } from "./BillsScreen";
import { NewBudgetItemScreen } from "./BudgetItems";
import { NewBillScreen } from "./NewBillScreen";

const KES = 100;
// 3 Nov 2026, 12:00 in Nairobi.
const NOW = new Date("2026-11-03T09:00:00Z");

// Invented bills and amounts.
const bill = (name: string, emoji: string) => ({ name, emoji, account_id: null, archived_at: null });
const month = (
  id: string,
  b: ReturnType<typeof bill>,
  due_on: string,
  amount: number,
  status = "due",
  source: string | null = null,
) => ({
  id,
  bill_id: `b-${id}`,
  month: `${due_on.slice(0, 7)}-01`,
  due_on,
  amount_cents: amount * KES,
  status,
  paid_at: status === "paid" ? "2026-11-01T08:00:00Z" : null,
  transaction_id: source ? `t-${id}` : null,
  version: 1,
  bill: b,
  paid_by: source ? { source } : null,
});

const billMonths = [
  month("1", bill("Home rent", "🏠"), "2026-11-01", 45_000, "paid", "sms"),
  month("2", bill("Streaming", "🎬"), "2026-11-01", 1_100),
  month("3", bill("Car loan", "🚗"), "2026-11-05", 38_500),
  month("4", bill("TV package", "📺"), "2026-11-15", 1_500),
  month("5", bill("Water", "💧"), "2026-11-02", 1_200, "paid", "manual"),
  month("6", bill("Gym", "🏋️"), "2026-11-20", 2_000, "skipped"),
  month("7", bill("Phone plan", "📱"), "2026-10-28", 500),
];

// Invented budget items: one waiting, one approved (set aside), one spent.
const budgetItems = [
  {
    id: "bi1",
    name: "School fees",
    amount_cents: 35_000 * KES,
    status: "pending",
    month: "2026-11-01",
    account_id: "b",
    version: 1,
    account: { name: "Bank", emoji: "🏦" },
  },
  {
    id: "bi2",
    name: "New tyres",
    amount_cents: 5_000 * KES,
    status: "approved",
    month: "2026-11-01",
    account_id: "w",
    version: 1,
    account: { name: "Wallet A", emoji: "📱" },
  },
  {
    id: "bi3",
    name: "Car service",
    amount_cents: 8_000 * KES,
    status: "done",
    month: "2026-11-01",
    account_id: "w",
    version: 1,
    account: { name: "Wallet A", emoji: "📱" },
  },
];

const balances = [
  { account_id: "w", kind: "wallet", balance_cents: 50_000 * KES, archived_at: null },
  { account_id: "b", kind: "bank", balance_cents: 30_000 * KES, archived_at: null },
  { account_id: "s", kind: "savings", balance_cents: 99_000 * KES, archived_at: null },
];

interface Call {
  table: string;
  op: string;
  args: unknown[];
}

type Answer = { data: unknown; error: { message: string } | null };

function fakeDb(rows: unknown[] = billMonths) {
  const calls: Call[] = [];
  // What an update of bill_months answers; tests change it to see a refusal.
  const update: { answer: Answer | (() => Promise<Answer>) } = {
    answer: { data: [{ version: 2 }], error: null },
  };
  const data: Record<string, unknown> = {
    bill_months: rows,
    budget_items: budgetItems,
    account_balances: balances,
    accounts: [{ id: "acc-1", name: "Wallet A", emoji: "📱", kind: "wallet" }],
    categories: [
      { id: "cat-1", name: "Utilities", emoji: "💡", kind: "spending", system: false },
      { id: "cat-2", name: "Salary", emoji: "💼", kind: "income", system: false },
    ],
    bills: null,
  };
  const db = {
    rpc(name: string, args: unknown) {
      calls.push({ table: name, op: "rpc", args: [args] });
      return Promise.resolve({ data: [], error: null });
    },
    from(table: string) {
      let updating = false;
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => {
          const answer = !updating
            ? Promise.resolve({ data: data[table] ?? [], error: null })
            : typeof update.answer === "function"
              ? update.answer()
              : Promise.resolve(update.answer);
          return answer.then(ok, bad);
        },
      };
      builder.update = (...args: unknown[]) => {
        updating = true;
        calls.push({ table, op: "update", args });
        return builder;
      };
      for (const op of [
        "select",
        "eq",
        "neq",
        "is",
        "or",
        "order",
        "in",
        "insert",
        "single",
        "maybeSingle",
      ]) {
        builder[op] = (...args: unknown[]) => {
          calls.push({ table, op, args });
          return builder;
        };
      }
      return builder;
    },
  };
  return { db: db as unknown as Db, calls, update };
}

function renderAt(path: string, rows?: unknown[]) {
  const fake = fakeDb(rows);
  const router = createMemoryRouter(
    [
      { path: "/bills", element: <BillsScreen db={() => fake.db} now={NOW} /> },
      { path: "/bills/new", element: <NewBillScreen db={() => fake.db} now={NOW} /> },
      { path: "/bills/budget/new", element: <NewBudgetItemScreen db={() => fake.db} now={NOW} /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return { router, ...fake };
}

const names = (list: HTMLElement) =>
  within(list)
    .getAllByRole("rowheader")
    .map((h) => h.querySelector("span:last-child")?.textContent);

describe("Bills", () => {
  it("makes this month's rows, then reads this month plus earlier unpaid months", async () => {
    const { calls } = renderAt("/bills");
    await screen.findByText("Car loan");
    expect(calls.find((c) => c.op === "rpc")).toEqual({
      table: "ensure_bill_months",
      op: "rpc",
      args: [{ p_month: "2026-11-01" }],
    });
    expect(calls.find((c) => c.table === "bill_months" && c.op === "or")?.args[0]).toBe(
      "month.eq.2026-11-01,and(status.eq.due,month.lt.2026-11-01)",
    );
  });

  it("lists what to pay first, then paid, then skipped, each with its status", async () => {
    renderAt("/bills");
    const table = await screen.findByRole("table");
    expect(names(table)).toEqual([
      "Phone plan",
      "Streaming",
      "Car loan",
      "TV package",
      "Home rent",
      "Water",
      "Gym",
    ]);
    const row = (name: string) => screen.getByText(name).closest("tr")!;
    expect(within(row("Phone plan")).getByText("Overdue · 6 days")).toBeInTheDocument();
    expect(within(row("Streaming")).getByText("Overdue · 2 days")).toBeInTheDocument();
    expect(within(row("Car loan")).getByText("Due in 2 days")).toBeInTheDocument();
    expect(within(row("TV package")).getByText("Due 15 Nov")).toBeInTheDocument();
    expect(within(row("Home rent")).getByText("✓ Paid · via SMS")).toBeInTheDocument();
    expect(within(row("Water")).getByText("✓ Paid")).toBeInTheDocument();
    expect(within(row("Home rent")).getByRole("link", { name: /open the payment/ })).toHaveAttribute(
      "href",
      "/activity/t-1",
    );
    expect(within(row("Water")).queryByRole("link")).toBeNull();
    expect(within(row("Gym")).getByText("Skipped")).toBeInTheDocument();
  });

  it("shows paid, to pay and what is left of the wallets, bank and cash after paying", async () => {
    renderAt("/bills");
    const hero = await screen.findByRole("region", { name: "Bill totals" });
    expect(within(hero).getByText("46,200")).toBeInTheDocument(); // paid: 45,000 + 1,200
    expect(within(hero).getByText("41,600")).toBeInTheDocument(); // to pay: 1,100 + 38,500 + 1,500 + 500
    // 80,000 available − 41,600 to pay − 5,000 approved for a budget item
    expect(await within(hero).findByText("33,400")).toBeInTheDocument();
    expect(within(hero).getByText("after 5,000 approved for budget items")).toBeInTheDocument();
    expect(within(hero).getByRole("meter")).toHaveAttribute("aria-valuenow", "53");
    const kpis = screen.getByRole("region", { name: "Bill totals by status" });
    expect(within(kpis).getByText("2,000")).toBeInTheDocument(); // skipped
  });

  it("filters to what is left to pay, and to what is paid", async () => {
    const { router } = renderAt("/bills");
    await screen.findByText("Car loan");
    fireEvent.click(screen.getByRole("button", { name: "To pay" }));
    expect(names(screen.getByRole("table"))).toEqual(["Phone plan", "Streaming", "Car loan", "TV package"]);
    expect(router.state.location.search).toBe("?show=to-pay");
    fireEvent.click(screen.getByRole("button", { name: "Paid" }));
    expect(names(screen.getByRole("table"))).toEqual(["Home rent", "Water"]);
  });

  it("invites the first bill when there are none", async () => {
    renderAt("/bills", []);
    expect(await screen.findByText(/No bills yet/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Add bill/ })[0]).toHaveAttribute("href", "/bills/new");
  });
});

describe("Pay, skip and undo", () => {
  const row = (name: string) => screen.getByText(name).closest("tr")!;
  const hero = () => screen.getByRole("region", { name: "Bill totals" });

  it("offers Skip and Pay on owed months, Undo on months paid by hand or skipped, nothing on SMS-paid ones", async () => {
    renderAt("/bills");
    await screen.findByText("Car loan");
    expect(within(row("Car loan")).getByRole("button", { name: /^Pay Car loan,/ })).toBeInTheDocument();
    expect(within(row("Car loan")).getByRole("button", { name: /^Skip Car loan,/ })).toBeInTheDocument();
    expect(within(row("Water")).getByRole("button", { name: /^Undo Water,/ })).toBeInTheDocument();
    expect(within(row("Gym")).getByRole("button", { name: /^Undo Gym,/ })).toBeInTheDocument();
    expect(within(row("Home rent")).queryByRole("button")).toBeNull();
  });

  it("pays a month by hand: the row and the totals change at once, the update carries the version", async () => {
    const { calls, update } = renderAt("/bills");
    await screen.findByText("Car loan");
    let answer!: (a: Answer) => void;
    update.answer = () => new Promise<Answer>((r) => (answer = r));
    fireEvent.click(screen.getByRole("button", { name: /^Pay Car loan,/ }));

    // Before the database answers.
    expect(within(row("Car loan")).getByText("✓ Paid")).toBeInTheDocument();
    expect(within(hero()).getByText("84,700")).toBeInTheDocument(); // paid: 46,200 + 38,500
    expect(within(hero()).getByText("3,100")).toBeInTheDocument(); // to pay: 41,600 − 38,500
    expect(within(row("Car loan")).getByRole("button", { name: /^Undo Car loan,/ })).toBeDisabled();

    await waitFor(() => expect(answer).toBeTypeOf("function"));
    answer({ data: [{ version: 2 }], error: null });
    await waitFor(() =>
      expect(within(row("Car loan")).getByRole("button", { name: /^Undo Car loan,/ })).toBeEnabled(),
    );
    const sent = calls.filter((c) => c.table === "bill_months" && (c.op === "update" || c.op === "eq"));
    expect(sent.map((c) => [c.op, ...c.args])).toEqual([
      ["update", { status: "paid", paid_at: NOW.toISOString(), skip_reason: null }],
      ["eq", "id", "3"],
      ["eq", "version", 1],
    ]);
  });

  it("skips a month out of what is left to pay, and undoes a skip", async () => {
    renderAt("/bills");
    await screen.findByText("Car loan");
    fireEvent.click(screen.getByRole("button", { name: /^Skip TV package,/ }));
    expect(within(row("TV package")).getByText("Skipped")).toBeInTheDocument();
    expect(within(hero()).getByText("40,100")).toBeInTheDocument(); // to pay: 41,600 − 1,500
    await waitFor(() => expect(screen.getByRole("button", { name: /^Undo TV package,/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^Undo TV package,/ }));
    expect(within(row("TV package")).getByText("Due 15 Nov")).toBeInTheDocument();
    expect(within(hero()).getByText("41,600")).toBeInTheDocument();
  });

  it("puts the row back and says so when the month was changed elsewhere", async () => {
    const { update } = renderAt("/bills");
    await screen.findByText("Car loan");
    update.answer = { data: [], error: null };
    fireEvent.click(screen.getByRole("button", { name: /^Pay Streaming,/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Streaming was changed elsewhere");
    expect(within(row("Streaming")).getByText("Overdue · 2 days")).toBeInTheDocument();
  });

  it("puts the row back when the database refuses", async () => {
    const { update } = renderAt("/bills");
    await screen.findByText("Car loan");
    update.answer = { data: null, error: { message: "network down" } };
    fireEvent.click(screen.getByRole("button", { name: /^Undo Water,/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save: network down");
    expect(within(row("Water")).getByText("✓ Paid")).toBeInTheDocument();
  });
});

describe("Budget items", () => {
  const line = (name: string) => screen.getByText(name).closest("li")!;
  const hero = () => screen.getByRole("region", { name: "Bill totals" });

  it("shows pending items with Approve, approved ones as set aside, spent ones as done", async () => {
    renderAt("/bills");
    await screen.findByText("School fees");
    expect(
      within(line("School fees")).getByRole("button", { name: "Approve School fees" }),
    ).toBeInTheDocument();
    expect(within(line("New tyres")).getByText("✓ Approved")).toBeInTheDocument();
    expect(within(line("New tyres")).queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(within(line("Car service")).getByText("✓ Spent")).toBeInTheDocument();
    expect(within(line("Car service")).queryByRole("button")).toBeNull();
    expect(within(line("School fees")).getByText("35,000 · 🏦 Bank")).toBeInTheDocument();
  });

  it("approving sets the money aside at once and sends the version", async () => {
    const { calls } = renderAt("/bills");
    await screen.findByText("School fees");
    await within(hero()).findByText("33,400");
    fireEvent.click(screen.getByRole("button", { name: "Approve School fees" }));
    expect(within(line("School fees")).getByText("✓ Approved")).toBeInTheDocument();
    expect(within(hero()).getByText("−1,600")).toBeInTheDocument(); // 33,400 − 35,000: the plan does not fit
    const sent = calls.filter((c) => c.table === "budget_items" && (c.op === "update" || c.op === "eq"));
    expect(sent.map((c) => [c.op, ...c.args])).toEqual([
      ["update", { status: "approved", approved_at: NOW.toISOString() }],
      ["eq", "id", "bi1"],
      ["eq", "version", 1],
    ]);
  });

  it("cancelling an approved item gives its money back", async () => {
    renderAt("/bills");
    await within(await screen.findByRole("region", { name: "Bill totals" })).findByText("33,400");
    fireEvent.click(screen.getByRole("button", { name: "Cancel New tyres" }));
    expect(screen.queryByText("New tyres")).toBeNull();
    expect(within(hero()).getByText("38,400")).toBeInTheDocument();
  });

  it("puts an item back when the database refuses", async () => {
    const { update } = renderAt("/bills");
    await screen.findByText("School fees");
    update.answer = { data: [], error: null };
    fireEvent.click(screen.getByRole("button", { name: "Approve School fees" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("School fees was changed elsewhere");
  });

  it("saves a new item as pending for this month from a funding account", async () => {
    const { calls } = renderAt("/bills/budget/new");
    const form = screen.getByRole("form", { name: "New budget item" });
    fireEvent.click(within(form).getByRole("button", { name: "Save for approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Say what the money is for.");
    fireEvent.change(within(form).getByLabelText("What for"), { target: { value: "Car service" } });
    fireEvent.change(within(form).getByLabelText("Amount"), { target: { value: "8,000" } });
    await within(form).findByRole("option", { name: "📱 Wallet A" });
    fireEvent.change(within(form).getByLabelText("From"), { target: { value: "acc-1" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save for approval" }));
    await screen.findByText("Car loan");
    expect(calls.find((c) => c.table === "budget_items" && c.op === "insert")?.args[0]).toEqual({
      name: "Car service",
      amount_cents: 8_000 * KES,
      account_id: "acc-1",
      month: "2026-11-01",
    });
    expect(calls.find((c) => c.table === "accounts" && c.op === "in")?.args).toEqual([
      "kind",
      ["wallet", "bank", "cash", "savings"],
    ]);
  });
});

describe("Add bill", () => {
  const fill = (label: string | RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("refuses a bill without an amount or a real due day", async () => {
    renderAt("/bills/new");
    fill("Name", "Internet");
    fireEvent.click(screen.getByRole("button", { name: "Save bill" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The amount must be above zero.");
    fill("Amount each month", "4,100");
    fill("Due day", "32");
    fireEvent.click(screen.getByRole("button", { name: "Save bill" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The due day is a day of the month");
  });

  it("saves the bill and goes back to the list", async () => {
    const { calls, router } = renderAt("/bills/new");
    fill("Name", " Internet ");
    fireEvent.click(screen.getByRole("button", { name: "Internet" }));
    fill("Amount each month", "4,100");
    fill("Due day", "20");
    await screen.findByRole("option", { name: "💡 Utilities" });
    expect(screen.queryByRole("option", { name: "💼 Salary" })).toBeNull();
    fill(/Category/, "cat-1");
    fill(/Paid from/, "acc-1");
    fill(/SMS payee/, " DEMO FIBRE ");
    fireEvent.click(screen.getByRole("button", { name: "Save bill" }));
    await screen.findByText("Car loan");
    expect(calls.find((c) => c.table === "bills" && c.op === "insert")?.args[0]).toEqual({
      name: "Internet",
      emoji: "🌐",
      amount_cents: 4_100 * KES,
      due_day: 20,
      account_id: "acc-1",
      category_id: "cat-1",
      payee_match: "DEMO FIBRE",
      starts_on: "2026-11-01",
    });
    expect(router.state.location.pathname).toBe("/bills");
  });

  it("refuses an SMS payee too short to tell payments apart", async () => {
    renderAt("/bills/new");
    fill("Name", "Internet");
    fill("Amount each month", "4100");
    fill("Due day", "20");
    fill(/SMS payee/, "KP");
    fireEvent.click(screen.getByRole("button", { name: "Save bill" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 3 letters");
  });

  it("offers to start next month when the due day has passed", async () => {
    const { calls } = renderAt("/bills/new");
    fill("Name", "Rent");
    fill("Amount each month", "45000");
    fill("Due day", "5");
    expect(screen.queryByLabelText(/start from next month/)).toBeNull();
    fill("Due day", "1");
    const box = screen.getByLabelText(/start from next month/);
    expect(box).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save bill" }));
    await screen.findByText("Car loan");
    expect(calls.find((c) => c.op === "insert")?.args[0]).toMatchObject({ starts_on: "2026-12-01" });
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { Db } from "@/lib/supabase";
import { AccountsScreen, DebtScreen, SavingsScreen } from "./AccountsScreen";

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
const sms = (cents: number, difference: number) => ({
  snapshot_at: "2026-11-02T10:00:00Z",
  snapshot_source: "sms",
  snapshot_cents: cents * KES,
  difference_cents: difference * KES,
});

// Invented accounts and amounts.
const balances = [
  {
    ...base,
    ...sms(18_450, 0),
    account_id: "wal",
    name: "Wallet A",
    emoji: "📱",
    kind: "wallet",
    counts_in_net: true,
    balance_cents: 18_450 * KES,
    sort_order: 1,
  },
  {
    ...base,
    ...sms(61_700, 2_500),
    account_id: "bnk",
    name: "Bank current",
    emoji: "🏦",
    kind: "bank",
    counts_in_net: true,
    balance_cents: 64_200 * KES,
    sort_order: 2,
  },
  {
    ...base,
    account_id: "csh",
    name: "Cash",
    emoji: "💵",
    kind: "cash",
    counts_in_net: true,
    balance_cents: 3_500 * KES,
    sort_order: 3,
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
    sort_order: 4,
  },
  {
    ...base,
    account_id: "lck",
    name: "Locked deposit",
    emoji: "🔒",
    kind: "savings",
    counts_in_net: true,
    balance_cents: 30_000 * KES,
    locked_until: "2027-01-15",
    sort_order: 5,
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
    sort_order: 6,
  },
  {
    ...base,
    account_id: "app",
    name: "App loan",
    emoji: "📲",
    kind: "loan",
    debt_term: "short",
    counts_in_net: true,
    balance_cents: -2_000 * KES,
    sort_order: 7,
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
    sort_order: 8,
  },
];
const terms = [
  { id: "wal", due_day: null, original_cents: null, limit_cents: null, sms_account_hint: "mpesa" },
  { id: "bnk", due_day: null, original_cents: null, limit_cents: null, sms_account_hint: "kcb" },
  { id: "csh", due_day: null, original_cents: null, limit_cents: null, sms_account_hint: null },
  {
    id: "ovd",
    due_day: 4,
    original_cents: 6_000 * KES,
    limit_cents: 10_000 * KES,
    sms_account_hint: "fuliza",
  },
  { id: "app", due_day: 20, original_cents: 4_000 * KES, limit_cents: null, sms_account_hint: null },
  { id: "car", due_day: 5, original_cents: 1_600_000 * KES, limit_cents: null, sms_account_hint: null },
];

function fakeDb() {
  const reads: string[] = [];
  const db = {
    from(table: string) {
      reads.push(table);
      const data = table === "account_balances" ? balances : terms;
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
          Promise.resolve({ data, error: null }).then(ok, bad),
      };
      for (const name of ["select", "eq", "is", "order", "in", "insert", "single", "maybeSingle"]) {
        builder[name] = () => builder;
      }
      return builder;
    },
  };
  return { db: db as unknown as Db, reads };
}

function renderAt(path: string) {
  const fake = fakeDb();
  const router = createMemoryRouter(
    [
      { path: "/accounts", element: <AccountsScreen db={() => fake.db} now={NOW} /> },
      { path: "/accounts/savings", element: <SavingsScreen db={() => fake.db} now={NOW} /> },
      { path: "/accounts/debt", element: <DebtScreen db={() => fake.db} now={NOW} /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return { router, ...fake };
}

describe("Accounts", () => {
  it("shows the totals and net position", async () => {
    renderAt("/accounts");
    // Net = everyday 86,150 + savings 150,000 − short-term debt 6,320 (D-010).
    expect(await screen.findByText("8 accounts · net position KES 229,830")).toBeInTheDocument();
    const totals = within(screen.getByRole("region", { name: "Totals" }));
    expect(totals.getByText("Available").parentElement?.parentElement).toHaveTextContent("86,150");
    expect(totals.getByRole("link", { name: /Short-term debt/ })).toHaveTextContent("6,320");
    expect(totals.getByRole("link", { name: /Long-term debt/ })).toHaveAttribute(
      "href",
      "/accounts/debt?term=long",
    );
  });

  it("lists everyday accounts with their SMS match", async () => {
    renderAt("/accounts");
    const everyday = within(await screen.findByRole("region", { name: "💰 Everyday accounts" }));
    expect(everyday.getByText("Wallet A").parentElement).toHaveTextContent("✓ Matches SMS");
    expect(everyday.getByText("Bank current").parentElement).toHaveTextContent("⚠ SMS says 61,700");
    expect(everyday.getByText("Cash").parentElement).toHaveTextContent("Manual");
  });

  it("shows savings with the goal, and debt by term with due tags", async () => {
    const { router } = renderAt("/accounts");
    const savings = within(await screen.findByRole("region", { name: "🐷 Savings · 150,000" }));
    expect(savings.getByRole("meter", { name: "Rainy day fund: 120,000 of 150,000" })).toHaveAttribute(
      "aria-valuenow",
      "80",
    );
    expect(savings.getByText("🔒 Until 15 Jan 2027")).toBeInTheDocument();

    const debt = within(screen.getByRole("region", { name: "💳 Debt · 1,186,320" }));
    const short = debt.getAllByRole("listitem");
    expect(short.map((li) => within(li).getByText(/^Due /).textContent)).toEqual(["Due 4 Nov", "Due 20 Nov"]);
    expect(short[0]).toHaveTextContent("28% repaid of 6,000");

    fireEvent.click(debt.getByRole("button", { name: /Long-term/ }));
    expect(router.state.location.search).toBe("?term=long");
    expect(await debt.findByText("Car loan")).toBeInTheDocument();
    expect(debt.getByText("Due 5 Nov")).toBeInTheDocument();
  });

  it("keeps the New account form beside the lists", async () => {
    renderAt("/accounts");
    expect(await screen.findByRole("region", { name: "＋ New account" })).toBeInTheDocument();
  });
});

describe("Savings · view all", () => {
  it("filters flexible and locked savings", async () => {
    renderAt("/accounts/savings");
    expect(await screen.findByText("2 accounts · KES 150,000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "🔒 Locked" }));
    expect(screen.queryByText("Rainy day fund", { selector: "span" })).toBeNull();
    expect(screen.getByText("Locked deposit")).toBeInTheDocument();
  });
});

describe("Debt · view all", () => {
  it("shows the group's total and its next payment", async () => {
    renderAt("/accounts/debt");
    expect(await screen.findByText("3 loans · KES 1,186,320")).toBeInTheDocument();
    const summary = within(screen.getByRole("region", { name: "Summary" }));
    expect(summary.getByText("KES 6,320")).toBeInTheDocument();
    expect(summary.getByText("📅 Next due: Overdraft · 4 Nov")).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { Db } from "@/lib/supabase";
import { ReviewScreen } from "./ReviewScreen";

const KES = 100;

const base = {
  user_id: "u",
  archived_at: null,
  last_activity: null,
  goal_cents: null,
  locked_until: null,
  debt_term: null,
  counts_in_net: true,
  snapshot_at: null,
  snapshot_cents: null,
  snapshot_source: null,
  difference_cents: null,
};
const read = (cents: number, difference: number) => ({
  snapshot_at: "2026-10-31T07:00:00Z",
  snapshot_source: "sms",
  snapshot_cents: cents * KES,
  difference_cents: difference * KES,
});

// Invented accounts and amounts.
const balances = [
  {
    ...base,
    ...read(18_450, 0),
    account_id: "wal",
    name: "Wallet A",
    emoji: "📱",
    kind: "wallet",
    balance_cents: 18_450 * KES,
    sort_order: 1,
  },
  {
    ...base,
    ...read(61_700, -2_500),
    account_id: "bnk",
    name: "Bank current",
    emoji: "🏦",
    kind: "bank",
    balance_cents: 64_200 * KES,
    sort_order: 2,
  },
  {
    ...base,
    account_id: "csh",
    name: "Cash",
    emoji: "💵",
    kind: "cash",
    balance_cents: 3_500 * KES,
    sort_order: 3,
  },
];
const terms = [
  { id: "wal", due_day: null, original_cents: null, limit_cents: null, sms_account_hint: "mpesa" },
  { id: "bnk", due_day: null, original_cents: null, limit_cents: null, sms_account_hint: "kcb" },
  { id: "csh", due_day: null, original_cents: null, limit_cents: null, sms_account_hint: null },
];

function fakeDb(rows = balances) {
  let reads = 0;
  const db = {
    from(table: string) {
      if (table === "account_balances") reads++;
      const data = table === "account_balances" ? rows : terms;
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
          Promise.resolve({ data, error: null }).then(ok, bad),
      };
      for (const name of ["select", "eq", "is", "order"]) builder[name] = () => builder;
      return builder;
    },
  };
  return { db: db as unknown as Db, reads: () => reads };
}

function renderReview(fake = fakeDb()) {
  const router = createMemoryRouter([{ path: "/", element: <ReviewScreen db={() => fake.db} /> }]);
  render(<RouterProvider router={router} />);
  return fake;
}

describe("Review & reconcile", () => {
  it("flags the account that disagrees with its SMS", async () => {
    renderReview();
    const status = within(await screen.findByRole("region", { name: "Status" }));
    expect(status.getByText("Needs reconciling")).toBeInTheDocument();
    expect(status.getByText("Bank current is off by 2,500 against its SMS balance.")).toBeInTheDocument();
  });

  it("lists every account's ledger against its latest reading", async () => {
    renderReview();
    const ledger = within(await screen.findByRole("region", { name: "Ledger vs latest SMS balance" }));
    const items = ledger.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "📱Wallet A18,450 · SMS 31 Oct✓ Match",
      expect.stringContaining("Bank current"),
      "💵Cash3,500 · not counted yetManual",
    ]);
    expect(items[1]).toHaveTextContent("Ledger 64,200 · SMS 61,700⚠ −2,500");
    expect(items[1]).toHaveTextContent("ledger is 2,500 higher than the SMS");
  });

  it("is green when everything matches", async () => {
    renderReview(fakeDb(balances.filter((a) => a.account_id === "wal")));
    expect(await screen.findByText("All balances match")).toBeInTheDocument();
  });

  it("reloads the balances on refresh", async () => {
    const fake = renderReview();
    await screen.findByText("Needs reconciling");
    fireEvent.click(screen.getByRole("button", { name: "🔄 Refresh" }));
    await screen.findByText("Needs reconciling");
    expect(fake.reads()).toBe(2);
  });
});

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

/** Answers reads and records inserts. Once an adjustment is saved, the bank reads as matching, as the view would. */
function fakeDb(rows = balances) {
  let reads = 0;
  const inserts: unknown[] = [];
  const adjusted = () =>
    rows.map((a) =>
      a.account_id === "bnk" ? { ...a, balance_cents: 61_700 * KES, difference_cents: 0 } : a,
    );
  const db = {
    from(table: string) {
      if (table === "account_balances") reads++;
      const data = table === "account_balances" ? (inserts.length ? adjusted() : rows) : terms;
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
          Promise.resolve({ data, error: null }).then(ok, bad),
        insert: (values: unknown) => {
          inserts.push(values);
          return builder;
        },
      };
      for (const name of ["select", "eq", "is", "order"]) builder[name] = () => builder;
      return builder;
    },
  };
  return { db: db as unknown as Db, reads: () => reads, inserts };
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

  it("links a mismatch to Add transaction, filled in and dated at the SMS", async () => {
    renderReview();
    const link = await screen.findByRole("link", { name: "＋ Add missing transaction" });
    const url = new URL(link.getAttribute("href")!, "http://app");
    expect(url.pathname).toBe("/transactions/new");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      direction: "out",
      account: "bnk",
      amount: String(2_500 * KES),
      date: "2026-10-31",
      at: "2026-10-31T07:00:00Z",
      back: "/review",
    });
  });

  it("adjusts the balance with a reason, and the account turns green", async () => {
    const fake = renderReview();
    fireEvent.click(await screen.findByRole("button", { name: "✏️ Adjust balance" }));
    const form = within(screen.getByRole("form", { name: "Adjust Bank current" }));
    expect(form.getByText(/Adds an adjustment of/)).toHaveTextContent("−2,500");

    fireEvent.click(form.getByRole("button", { name: "Save adjustment −2,500" }));
    expect(await form.findByText(/Say why the balance is off/)).toBeInTheDocument();
    expect(fake.inserts).toEqual([]);

    fireEvent.change(form.getByLabelText("Reason"), { target: { value: "Bank charge not sent by SMS" } });
    fireEvent.click(form.getByRole("button", { name: "Save adjustment −2,500" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Adjusted Bank current by −2,500: “Bank charge not sent by SMS”.",
    );
    expect(fake.inserts).toEqual([
      {
        account_id: "bnk",
        amount_cents: -2_500 * KES,
        kind: "adjustment",
        reason: "Bank charge not sent by SMS",
        source: "manual",
        payee: "Balance adjustment",
        occurred_at: "2026-10-31T07:00:00Z",
      },
    ]);
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

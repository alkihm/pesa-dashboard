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

const DAY = 86_400_000;
/** A completed review `n` days ago. */
const pastReview = (id: string, n: number, result = "all_match", checks: { resolution: string }[] = []) => ({
  id,
  completed_at: new Date(Date.now() - n * DAY).toISOString(),
  result,
  review_checks: checks,
});

interface Options {
  rows?: typeof balances;
  history?: ReturnType<typeof pastReview>[];
  toReview?: number;
}

/**
 * Answers reads and records writes. Once an adjustment is saved, the bank reads as matching, as the view would.
 * `inserts` are the transactions saved; `writes` every insert and update with its table.
 */
function fakeDb({ rows = balances, history = [], toReview = 0 }: Options = {}) {
  let reads = 0;
  const inserts: unknown[] = [];
  const writes: { table: string; op: "insert" | "update"; values: unknown }[] = [];
  const adjusted = () =>
    rows.map((a) =>
      a.account_id === "bnk" ? { ...a, balance_cents: 61_700 * KES, difference_cents: 0 } : a,
    );
  const answer = (table: string, op: string | undefined) => {
    switch (table) {
      case "account_balances":
        return { data: inserts.length ? adjusted() : rows };
      case "accounts":
        return { data: terms };
      case "settings":
        return { data: { review_interval_days: 3 } };
      case "reviews":
        return { data: op === "insert" ? { id: "rev-new" } : op === "update" ? null : history };
      case "transactions":
        return op === "insert" ? { data: null } : { data: null, count: toReview };
      default:
        return { data: [] };
    }
  };
  const db = {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from(table: string) {
      if (table === "account_balances") reads++;
      let op: "insert" | "update" | undefined;
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
          Promise.resolve({ error: null, ...answer(table, op) }).then(ok, bad),
        insert: (values: unknown) => {
          op = "insert";
          writes.push({ table, op, values });
          if (table === "transactions") inserts.push(values);
          return builder;
        },
        update: (values: unknown) => {
          op = "update";
          writes.push({ table, op, values });
          return builder;
        },
      };
      for (const name of ["select", "eq", "is", "not", "or", "order", "limit", "single", "maybeSingle"])
        builder[name] = () => builder;
      return builder;
    },
  };
  return { db: db as unknown as Db, reads: () => reads, inserts, writes };
}

function renderReview(fake = fakeDb()) {
  const router = createMemoryRouter([{ path: "/", element: <ReviewScreen db={() => fake.db} /> }]);
  render(<RouterProvider router={router} />);
  return fake;
}

describe("Review & reconcile", () => {
  it("flags the account that disagrees with its SMS", async () => {
    renderReview();
    const status = within(await screen.findByRole("region", { name: "Review status" }));
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
    renderReview(
      fakeDb({ rows: balances.filter((a) => a.account_id === "wal"), history: [pastReview("r1", 1)] }),
    );
    const status = within(await screen.findByRole("region", { name: "Review status" }));
    expect(status.getByText("All good")).toBeInTheDocument();
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

describe("Review status [4.3]", () => {
  const matching = balances.filter((a) => a.account_id !== "bnk");

  it("is amber once the interval has passed, with the last review in the header and history", async () => {
    renderReview(fakeDb({ rows: matching, history: [pastReview("r1", 4), pastReview("r2", 9, "fixed")] }));
    const status = within(await screen.findByRole("region", { name: "Review status" }));
    expect(status.getByText("Review due")).toBeInTheDocument();
    expect(status.getByText("Last review was 4 days ago; the reminder is every 3 days.")).toBeInTheDocument();
    expect(status.getByRole("list", { name: "Status colours" })).toHaveTextContent(
      "0–3 days3–7 days7+ days or a mismatch",
    );
    expect(await screen.findByText(/^Last done \d+ \w{3} · reminder every 3 days$/)).toBeInTheDocument();

    const history = within(screen.getByRole("region", { name: "History" }));
    expect(history.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Late by 2 days · all match"),
      expect.stringContaining("Reviewed · gaps fixed"),
    ]);
  });

  it("is red when the last review is a week old", async () => {
    renderReview(fakeDb({ rows: matching, history: [pastReview("r1", 8)] }));
    expect(await screen.findByText("Review overdue")).toBeInTheDocument();
  });

  it("asks for the first review when there is none", async () => {
    renderReview(fakeDb({ rows: matching }));
    expect(await screen.findByText("Review due")).toBeInTheDocument();
    expect(await screen.findByText("No reviews yet. Mark the first one above.")).toBeInTheDocument();
  });

  it("lists the checklist, with a fix link for transactions to categorise", async () => {
    renderReview(fakeDb({ toReview: 2 }));
    const list = within(await screen.findByRole("region", { name: "Checklist" }));
    expect(await list.findByText("1 balance is off")).toBeInTheDocument();
    expect(list.getByText("2 transactions to categorise")).toBeInTheDocument();
    expect(list.getByText("No bills overdue")).toBeInTheDocument();
    expect(list.getByRole("link", { name: "Fix: 2 transactions to categorise" })).toHaveAttribute(
      "href",
      "/activity",
    );
  });

  it("marks a review with the mismatch left open", async () => {
    const fake = renderReview();
    fireEvent.click(await screen.findByRole("button", { name: "Mark reviewed · 1 left open" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Review saved with 1 account left open. Fix it to turn the status green.",
    );
    expect(fake.writes.map((w) => [w.table, w.op])).toEqual([
      ["reviews", "insert"],
      ["review_checks", "insert"],
      ["reviews", "update"],
    ]);
    // Cash has no reading, so it gets no check.
    expect(fake.writes[1]!.values).toEqual([
      {
        review_id: "rev-new",
        account_id: "wal",
        ledger_cents: 18_450 * KES,
        stated_cents: 18_450 * KES,
        resolution: "matched",
      },
      {
        review_id: "rev-new",
        account_id: "bnk",
        ledger_cents: 64_200 * KES,
        stated_cents: 61_700 * KES,
        resolution: "left_open",
      },
    ]);
    expect(fake.writes[2]!.values).toMatchObject({ result: "left_open", completed_at: expect.any(String) });
  });

  it("records an adjustment made during the visit as fixed", async () => {
    const fake = renderReview();
    fireEvent.click(await screen.findByRole("button", { name: "✏️ Adjust balance" }));
    const form = within(screen.getByRole("form", { name: "Adjust Bank current" }));
    fireEvent.change(form.getByLabelText("Reason"), { target: { value: "Bank charge not sent by SMS" } });
    fireEvent.click(form.getByRole("button", { name: "Save adjustment −2,500" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark reviewed" }));

    expect(await screen.findByText(/^Review saved with your fixes\. Next review/)).toBeInTheDocument();
    const checks = fake.writes.find((w) => w.table === "review_checks")!.values as { resolution: string }[];
    expect(checks.map((c) => c.resolution)).toEqual(["matched", "adjustment"]);
    expect(fake.writes.at(-1)!.values).toMatchObject({ result: "fixed" });
  });
});

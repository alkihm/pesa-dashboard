import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { fixtures } from "@/lib/sms/fixtures";
import type { Db } from "@/lib/supabase";
import { AddTransactionScreen } from "./AddTransactionScreen";

const till = fixtures.find((f) => f.name.startsWith("M-PESA: till payment"))!.body;

const tables: Record<string, unknown[]> = {
  accounts: [
    {
      id: "mpesa",
      name: "M-PESA",
      emoji: "📱",
      kind: "wallet",
      sms_account_hint: "mpesa",
      archived_at: null,
    },
    { id: "cash", name: "Cash", emoji: "💵", kind: "cash", sms_account_hint: null, archived_at: null },
  ],
  categories: [
    {
      id: "groceries",
      name: "Groceries",
      emoji: "🛒",
      colour: "cat-1",
      kind: "spending",
      system: false,
      sort_order: 1,
    },
    {
      id: "salary",
      name: "Salary",
      emoji: "💼",
      colour: "cat-9",
      kind: "income",
      system: false,
      sort_order: 2,
    },
  ],
  payee_rules: [
    { pattern: "SAMPLE MART", priority: 10, category_id: "groceries", transfer_account_id: null },
  ],
};

const pending = {
  id: "sms-7",
  sender: "MPESA",
  body: till,
  received_at: "2026-01-02T10:23:00Z",
  transactions: [],
};

// A stand-in for the client: answers reads from `tables`, records inserts, and fails them with `insertError`.
function fakeDb({
  insertError,
  pendingSms = [],
}: { insertError?: { code: string; message: string }; pendingSms?: unknown[] } = {}) {
  const inserts: unknown[][] = [];
  const reads: string[] = [];
  const db = {
    from: (table: string) => {
      let fillsNulls = true;
      const answer = () => {
        // Like the database: rows with different fields fill the gaps with null unless told to use defaults.
        if (table === "transactions" && fillsNulls) {
          return { data: null, error: { code: "23502", message: 'null value in column "needs_review"' } };
        }
        if (table === "transactions") return { data: null, error: insertError ?? null };
        reads.push(table);
        return { data: table === "sms_messages" ? pendingSms : (tables[table] ?? []), error: null };
      };
      const chain = {
        select: () => chain,
        insert: (rows: unknown[], opts?: { defaultToNull?: boolean }) => (
          inserts.push(rows),
          (fillsNulls = opts?.defaultToNull !== false),
          chain
        ),
        is: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: unknown) => void) => resolve(answer()),
      };
      return chain;
    },
  };
  return { db: () => db as unknown as Db, inserts, reads };
}

function renderAdd(db: () => Db) {
  const router = createMemoryRouter(
    [{ path: "/transactions/new", element: <AddTransactionScreen db={db} /> }],
    {
      initialEntries: ["/transactions/new"],
    },
  );
  render(<RouterProvider router={router} />);
}

const form = () => screen.getByRole("form", { name: "New transaction" });

describe("Add transaction", () => {
  it("fills the form from a pasted SMS and saves a manual row", async () => {
    const { db, inserts } = fakeDb();
    renderAdd(db);
    await screen.findByRole("button", { name: /M-PESA/ });

    fireEvent.change(screen.getByRole("textbox", { name: "SMS text" }), { target: { value: till } });
    fireEvent.click(screen.getByRole("button", { name: "Read SMS and fill the form" }));

    expect(screen.getByRole("textbox", { name: "Amount (KES)" })).toHaveValue("701");
    expect(within(form()).getByRole("button", { name: /M-PESA/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(form()).getByRole("button", { name: /Groceries/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Paid to" })).toHaveValue("SAMPLE MART FEDHA");

    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));
    expect(await screen.findByText(/Saved KES 701 · SAMPLE MART FEDHA/)).toBeInTheDocument();
    expect(inserts).toEqual([
      [
        expect.objectContaining({
          source: "manual",
          kind: "spending",
          account_id: "mpesa",
          amount_cents: -70100,
          category_id: "groceries",
          needs_review: false,
          dedupe_key: expect.stringMatching(/^mpesa:TSB2C3D4E5:/),
        }),
      ],
    ]);
    // Ready for the next one, on the same account.
    expect(screen.getByRole("textbox", { name: "Amount (KES)" })).toHaveValue("");
  });

  it("says what is missing instead of saving", async () => {
    const { db, inserts } = fakeDb();
    renderAdd(db);
    await screen.findByRole("button", { name: /M-PESA/ });

    fireEvent.change(screen.getByRole("textbox", { name: "Amount (KES)" }), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the account it left.");
    expect(inserts).toEqual([]);
  });

  it("shows income categories for money in, and two account groups for a transfer", async () => {
    const { db } = fakeDb();
    renderAdd(db);
    await screen.findByRole("button", { name: /Groceries/ });

    fireEvent.click(screen.getByRole("button", { name: "↓ Money in" }));
    expect(screen.queryByRole("button", { name: /Groceries/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salary/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "To account" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "⇄ Transfer" }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "From account" })).getByRole("button", { name: /M-PESA/ }),
    );
    const to = screen.getByRole("group", { name: "To account" });
    expect(within(to).queryByRole("button", { name: /M-PESA/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Category" })).not.toBeInTheDocument();
  });

  it("refuses an SMS that is already in the ledger", async () => {
    const { db } = fakeDb({ insertError: { code: "23505", message: "duplicate key" } });
    renderAdd(db);
    await screen.findByRole("button", { name: /M-PESA/ });

    fireEvent.change(screen.getByRole("textbox", { name: "SMS text" }), { target: { value: till } });
    fireEvent.click(screen.getByRole("button", { name: "Read SMS and fill the form" }));
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This SMS is already in the ledger.");
  });

  it("uses an SMS that is not yet in the ledger and links the saved row to it", async () => {
    const { db, inserts, reads } = fakeDb({ pendingSms: [pending] });
    renderAdd(db);

    fireEvent.click(await screen.findByRole("button", { name: "Use the SMS from MPESA" }));
    expect(screen.getByRole("textbox", { name: "Amount (KES)" })).toHaveValue("701");
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));

    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0]![0]).toMatchObject({ sms_id: "sms-7", source: "manual" });
    // The list is fetched again so the used message drops off it.
    await waitFor(() => expect(reads.filter((t) => t === "sms_messages")).toHaveLength(2));
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { Db } from "@/lib/supabase";
import { NewAccountScreen } from "./NewAccountScreen";

const existing = [{ name: "M-PESA", sms_account_hint: "mpesa", archived_at: null, sort_order: 3 }];

// A stand-in for the client: answers the accounts read, records inserts per table, fails the opening on request.
function fakeDb({ openingError }: { openingError?: string } = {}) {
  const inserts: { table: string; row: unknown }[] = [];
  const db = {
    from: (table: string) => {
      let writing = false;
      const answer = () => {
        if (!writing) return { data: existing, error: null };
        if (table === "transactions" && openingError) return { data: null, error: { message: openingError } };
        return { data: { id: "new-account" }, error: null };
      };
      const chain = {
        select: () => chain,
        insert: (row: unknown) => (inserts.push({ table, row }), (writing = true), chain),
        single: () => Promise.resolve(answer()),
        then: (resolve: (v: unknown) => void) => resolve(answer()),
      };
      return chain;
    },
  };
  return { db: () => db as unknown as Db, inserts };
}

function renderNew(db: () => Db) {
  const router = createMemoryRouter(
    [
      { path: "/accounts/new", element: <NewAccountScreen db={db} /> },
      { path: "/accounts", element: <h1>Accounts list</h1> },
    ],
    { initialEntries: ["/accounts/new"] },
  );
  render(<RouterProvider router={router} />);
}

// The type tiles are in the header on phones and on the card on desktop; both work the same.
const pickType = (label: string) =>
  fireEvent.click(
    within(screen.getAllByRole("radiogroup", { name: "Account type" })[0]!).getByRole("radio", {
      name: new RegExp(label),
    }),
  );

describe("New account", () => {
  it("saves a loan with its SMS source and the amount owed as an opening balance, then goes to Accounts", async () => {
    const { db, inserts } = fakeDb();
    renderNew(db);

    pickType("Loan");
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Fuliza" } });
    fireEvent.click(screen.getByRole("button", { name: "phone" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Amount owed now" }), {
      target: { value: "4,320" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Amount borrowed" }), {
      target: { value: "6,000" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "⚡ Short-term" }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Sender" })).getByRole("button", { name: "Fuliza" }),
    );
    expect(screen.getByRole("checkbox", { name: "Count in net position" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    expect(await screen.findByRole("heading", { name: "Accounts list" })).toBeInTheDocument();
    expect(inserts).toEqual([
      {
        table: "accounts",
        row: expect.objectContaining({
          name: "Fuliza",
          emoji: "📲",
          kind: "loan",
          debt_term: "short",
          original_cents: 600000,
          counts_in_net: true,
          sms_account_hint: "fuliza",
          sort_order: 4,
        }),
      },
      {
        table: "transactions",
        row: expect.objectContaining({ account_id: "new-account", kind: "opening", amount_cents: -432000 }),
      },
    ]);
  });

  it("shows the fields of each type", () => {
    renderNew(fakeDb().db);
    expect(screen.getByRole("textbox", { name: "Current balance" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Debt group" })).not.toBeInTheDocument();

    pickType("Card");
    expect(screen.getByRole("textbox", { name: "Card limit" })).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Sender" })).getByRole("button", { name: "KCB card" }),
    );
    expect(screen.getByRole("textbox", { name: "Card ends with" })).toBeInTheDocument();

    pickType("Loan");
    expect(screen.getByRole("checkbox", { name: "Count in net position" })).not.toBeChecked();

    pickType("Cash");
    expect(screen.queryByRole("region", { name: "Match SMS automatically" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "🎯 Goal · optional" })).not.toBeInTheDocument();
  });

  it("saves a savings account with its goal and lock date", async () => {
    const { db, inserts } = fakeDb();
    renderNew(db);

    pickType("Savings");
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "M-Shwari Lock" } });
    fireEvent.change(screen.getByRole("textbox", { name: "🎯 Goal · optional" }), {
      target: { value: "300,000" },
    });
    fireEvent.change(screen.getByLabelText("🔒 Locked until"), { target: { value: "2027-01-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));

    expect(await screen.findByRole("heading", { name: "Accounts list" })).toBeInTheDocument();
    expect(inserts[0]).toEqual({
      table: "accounts",
      row: expect.objectContaining({ kind: "savings", goal_cents: 30000000, locked_until: "2027-01-15" }),
    });
  });

  it("refuses an SMS source another account already receives", async () => {
    const { db, inserts } = fakeDb();
    renderNew(db);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Phone 2" } });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Sender" })).getByRole("button", { name: "M-PESA" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("M-PESA already receives these SMS");
    expect(inserts).toEqual([]);
  });

  it("says so when the account saved but its balance did not", async () => {
    const { db } = fakeDb({ openingError: "network down" });
    renderNew(db);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Bank" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Current balance" }), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The account was saved, but not its balance (network down)",
    );
  });
});

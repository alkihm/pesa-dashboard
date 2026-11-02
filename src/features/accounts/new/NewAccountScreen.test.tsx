import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { Db } from "@/lib/supabase";
import { NewAccountScreen } from "./NewAccountScreen";

const existing = [{ name: "M-PESA", sms_account_hint: "mpesa", archived_at: null, sort_order: 3 }];

// A stand-in for the client: answers the accounts read and records inserts.
function fakeDb(insertError: { message: string } | null = null) {
  const inserts: unknown[] = [];
  const db = {
    from: () => {
      let writing = false;
      const chain = {
        select: () => chain,
        insert: (row: unknown) => (inserts.push(row), (writing = true), chain),
        then: (resolve: (v: unknown) => void) =>
          resolve(writing ? { data: null, error: insertError } : { data: existing, error: null }),
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

const type = (name: string) =>
  within(screen.getByRole("group", { name: "Type" })).getByRole("button", { name: new RegExp(name) });

describe("New account", () => {
  it("saves a short-term loan with its limit and SMS source, then goes to Accounts", async () => {
    const { db, inserts } = fakeDb();
    renderNew(db);

    fireEvent.click(type("Loan"));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Fuliza" } });
    fireEvent.click(screen.getByRole("button", { name: "Short term" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Limit (KES) · optional" }), {
      target: { value: "5,000" },
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "SMS matching" })).getByRole("button", { name: "Fuliza" }),
    );
    expect(screen.getByRole("switch", { name: "Counts in net position" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    expect(await screen.findByRole("heading", { name: "Accounts list" })).toBeInTheDocument();
    expect(inserts).toEqual([
      expect.objectContaining({
        name: "Fuliza",
        kind: "loan",
        debt_term: "short",
        limit_cents: 500000,
        counts_in_net: true,
        sms_account_hint: "fuliza",
        sms_sender: "MPESA",
        sort_order: 4,
      }),
    ]);
  });

  it("shows the fields of each type", () => {
    renderNew(fakeDb().db);
    expect(screen.queryByRole("group", { name: "Debt term" })).not.toBeInTheDocument();

    fireEvent.click(type("Loan"));
    expect(screen.getByRole("textbox", { name: "Borrowed (KES) · optional" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Counts in net position" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    fireEvent.click(type("Card"));
    fireEvent.click(
      within(screen.getByRole("group", { name: "SMS matching" })).getByRole("button", { name: "KCB card" }),
    );
    expect(screen.getByRole("textbox", { name: "Card ends in" })).toBeInTheDocument();

    fireEvent.click(type("Cash"));
    expect(screen.queryByRole("group", { name: "SMS matching" })).not.toBeInTheDocument();
  });

  it("refuses an SMS source another account already receives", async () => {
    const { db, inserts } = fakeDb();
    renderNew(db);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument());

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Phone 2" } });
    fireEvent.click(
      within(screen.getByRole("group", { name: "SMS matching" })).getByRole("button", { name: "M-PESA" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("M-PESA already receives these SMS");
    expect(inserts).toEqual([]);
  });
});

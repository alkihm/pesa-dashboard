import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { Db } from "@/lib/supabase";
import { readExport } from "./export";
import { ExportScreen } from "./ExportScreen";

// Invented: two accounts and three transactions; every other table is empty.
const tables: Record<string, unknown[]> = {
  accounts: [
    { id: "a1", name: "Wallet" },
    { id: "a2", name: "Bank" },
  ],
  transactions: [
    { id: "t1", occurred_at: "2026-10-01T06:00:00+00:00", account_id: "a1", amount_cents: -100 },
    { id: "t2", occurred_at: "2026-10-02T06:00:00+00:00", account_id: "a1", amount_cents: -200 },
    { id: "t3", occurred_at: "2026-10-03T06:00:00+00:00", account_id: "a2", amount_cents: 300 },
  ],
};

function fakeDb(fail?: string) {
  const db = {
    from(table: string) {
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve(
            table === fail
              ? { data: null, error: { message: "permission denied" } }
              : { data: tables[table] ?? [], error: null },
          ).then(ok),
      };
      for (const name of ["select", "order", "range"]) builder[name] = () => builder;
      return builder;
    },
  };
  return db as unknown as Db;
}

function renderExport(db = fakeDb()) {
  const download = vi.fn<(bytes: Uint8Array, fileName: string) => void>();
  const router = createMemoryRouter([
    { path: "/", element: <ExportScreen db={() => db} download={download} /> },
  ]);
  render(<RouterProvider router={router} />);
  return download;
}

describe("Export everything", () => {
  it("downloads one ZIP with every table and lists the rows per table", async () => {
    const download = renderExport();
    fireEvent.click(screen.getByRole("button", { name: "⬇ Download everything (.zip)" }));

    expect(
      await screen.findByText(/^✅ pesa-export-\d{4}-\d{2}-\d{2}\.zip · 5 rows in 13 tables$/),
    ).toBeInTheDocument();
    expect(download).toHaveBeenCalledOnce();
    const [bytes, fileName] = download.mock.calls[0]!;
    expect(fileName).toMatch(/^pesa-export-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(readExport(bytes).tables.transactions).toHaveLength(3);

    const list = within(screen.getByRole("list", { name: "Rows per table" }));
    expect(list.getByText("transactions.csv").parentElement).toHaveTextContent(
      "Transactionstransactions.csv3",
    );
  });

  it("says what went wrong and downloads nothing", async () => {
    const download = renderExport(fakeDb("transactions"));
    fireEvent.click(screen.getByRole("button", { name: "⬇ Download everything (.zip)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not export: transactions: permission denied",
    );
    expect(download).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "⬇ Download everything (.zip)" })).toBeEnabled();
  });
});

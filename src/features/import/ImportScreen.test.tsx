import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { readXlsx } from "./xlsx";
import type { Db } from "@/lib/supabase";
import { ImportScreen, type Download } from "./ImportScreen";

// Invented accounts, categories and ledger.
const tables: Record<string, unknown[]> = {
  account_balances: [
    { account_id: "mp", name: "M-PESA", kind: "wallet", balance_cents: 0 },
    { account_id: "bk", name: "Bank current", kind: "bank", balance_cents: 0 },
  ],
  accounts: [
    { id: "mp", due_day: null, original_cents: null, limit_cents: null, sms_account_hint: "mpesa" },
    { id: "bk", due_day: null, original_cents: null, limit_cents: null, sms_account_hint: "kcb" },
  ],
  categories: [
    {
      id: "food",
      name: "Eating out",
      kind: "spending",
      emoji: "🍽️",
      colour: "cat-1",
      system: false,
      sort_order: 1,
    },
    { id: "pay", name: "Salary", kind: "income", emoji: "💼", colour: "cat-2", system: false, sort_order: 2 },
  ],
  // Already in the ledger: an SMS with ref TKA0000002.
  transactions: [
    {
      account_id: "mp",
      occurred_at: "2026-11-04T08:00:00Z",
      amount_cents: -20_000,
      ref: "TKA0000002",
      dedupe_key: "sms:x",
    },
  ],
};

function fakeDb() {
  const writes: { table: string; values: unknown }[] = [];
  const db = {
    from(table: string) {
      let wrote = false;
      const builder: Record<string, unknown> = {
        insert: (values: unknown) => {
          wrote = true;
          writes.push({ table, values });
          return builder;
        },
        update: (values: unknown) => {
          wrote = true;
          writes.push({ table, values });
          return builder;
        },
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({
            data: wrote ? (table === "import_batches" ? { id: "batch1" } : null) : (tables[table] ?? []),
            error: null,
          }).then(ok),
      };
      for (const name of ["select", "eq", "is", "in", "gte", "lt", "order", "range", "single", "not"])
        builder[name] = () => builder;
      return builder;
    },
  };
  return { db: db as unknown as Db, writes };
}

const CSV = [
  "Date,Time,Account,Kind,Amount (KES),Category,Payee,Note,Ref,To account",
  "2026-11-04,09:00,M-PESA,spending,450,Eating out,DEMO CAFE,lunch,TKA0000001,",
  "2026-11-04,11:00,M-PESA,spending,200,,DEMO SHOP,,TKA0000002,",
  "2026-11-05,,Bank current,transfer,3000,,,,,M-PESA",
  "2026-11-05,,Nowhere,spending,10,,,,,",
].join("\r\n");

function renderImport(fake = fakeDb()) {
  const download = vi.fn<Download>();
  const router = createMemoryRouter([
    { path: "/", element: <ImportScreen db={() => fake.db} download={download} /> },
  ]);
  render(<RouterProvider router={router} />);
  return { ...fake, download };
}

async function upload(name: string, content: string) {
  const input = await screen.findByLabelText("File to import");
  await vi.waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { files: [new File([content], name, { type: "text/csv" })] } });
}

describe("Bulk import", () => {
  it("previews the file: new rows, duplicates and errors per row", async () => {
    renderImport();
    await upload("gaps.csv", CSV);
    const summary = within(await screen.findByRole("list", { name: "Summary" }));
    expect(summary.getByText("✓ 2 to import")).toBeInTheDocument();
    expect(summary.getByText("⧉ 1 duplicate")).toBeInTheDocument();
    expect(summary.getByText("⚠ 1 error")).toBeInTheDocument();

    const rows = within(screen.getByRole("list", { name: "Rows" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^Row 2.*M-PESA · DEMO CAFE.*−450New$/),
      expect.stringMatching(/^Row 3.*Already in the ledger \(ref TKA0000002\).*Duplicate$/),
      expect.stringMatching(/^Row 4.*Bank current → M-PESA.*−3,000New$/),
      expect.stringMatching(/^Row 5.*No account called “Nowhere”Error$/),
    ]);
  });

  it("imports the new rows in one batch, then sums up", async () => {
    const fake = renderImport();
    await upload("gaps.csv", CSV);
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 transactions" }));

    expect(await screen.findByText("✅ Imported 2 transactions from gaps.csv")).toBeInTheDocument();
    expect(screen.getByText("1 duplicate skipped")).toBeInTheDocument();
    expect(screen.getByText("1 row with errors left out")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See them in Activity ›" })).toHaveAttribute("href", "/activity");

    expect(fake.writes[0]).toEqual({
      table: "import_batches",
      values: { file_name: "gaps.csv", row_count: 0 },
    });
    const saved = fake.writes.find((w) => w.table === "transactions")!.values as Record<string, unknown>[];
    expect(saved.map((t) => [t.account_id, t.amount_cents, t.kind, t.source, t.import_batch_id])).toEqual([
      ["mp", -45_000, "spending", "import", "batch1"],
      ["bk", -300_000, "transfer", "import", "batch1"],
      ["mp", 300_000, "transfer", "import", "batch1"],
    ]);
    expect(fake.writes.at(-1)).toEqual({ table: "import_batches", values: { row_count: 2 } });
  });

  it("says what is wrong with a file it cannot use", async () => {
    renderImport();
    await upload("notes.csv", "Name,Value\r\nx,1\r\n");
    expect(await screen.findByRole("alert")).toHaveTextContent("Missing: Date, Account, Amount (KES)");
  });

  it("downloads an Excel template with the owner's own lists, and a CSV template", async () => {
    const { download } = renderImport();
    const excel = await screen.findByRole("button", { name: "⬇️ Excel template (.xlsx)" });
    await vi.waitFor(() => expect(excel).toBeEnabled());
    fireEvent.click(excel);
    const [bytes, name] = download.mock.calls[0]!;
    expect(name).toBe("pesa-import-template.xlsx");
    expect(await readXlsx(bytes as Uint8Array)).toEqual([
      ["Date", "Time", "Account", "Kind", "Amount (KES)", "Category", "Payee", "Note", "Ref", "To account"],
    ]);

    fireEvent.click(screen.getByRole("button", { name: "CSV template" }));
    expect(download.mock.calls[1]![1]).toBe("pesa-import-template.csv");
  });
});

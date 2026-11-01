// Ledger rows for the Google Sheet backup ([1.7]): one table per year, in a layout close to the old Sheet so
// it stays familiar. Dates are Nairobi dates; amounts are KES numbers (cents / 100).

export interface BackupTransaction {
  occurred_at: string;
  amount_cents: number;
  kind: string;
  channel: string | null;
  payee: string | null;
  note: string | null;
  ref: string | null;
  source: string;
  needs_review: boolean;
  original_currency: string | null;
  original_minor: number | null;
  account: string;
  category: string | null;
}

export const HEADER = [
  "Date",
  "Month",
  "Account",
  "Type",
  "Description",
  "Class",
  "Category",
  "Currency",
  "Amount (orig)",
  "Amount (KES)",
  "Ref",
  "Note",
  "Needs review",
  "Source",
];

const CLASS: Record<string, string> = {
  spending: "Expense",
  income: "Income",
  transfer: "Transfer",
  adjustment: "Adjustment",
  opening: "Opening balance",
};

const NAIROBI_MS = 3 * 3_600_000; // Africa/Nairobi has no daylight saving

/** Nairobi calendar date of a UTC timestamp, as yyyy-mm-dd. */
export function nairobiDate(iso: string): string {
  return new Date(Date.parse(iso) + NAIROBI_MS).toISOString().slice(0, 10);
}

export type Cell = string | number;

/** Rows per year (Nairobi dates), each with the header first, in time order. */
export function backupTables(rows: BackupTransaction[]): Record<string, Cell[][]> {
  const sorted = [...rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const tables: Record<string, Cell[][]> = {};
  for (const t of sorted) {
    const date = nairobiDate(t.occurred_at);
    const year = date.slice(0, 4);
    (tables[year] ??= [HEADER]).push([
      date,
      date.slice(0, 7),
      t.account,
      t.channel ?? "",
      t.payee ?? "",
      CLASS[t.kind] ?? t.kind,
      t.category ?? "",
      t.original_currency ?? "KES",
      t.original_minor == null ? t.amount_cents / 100 : t.original_minor / 100,
      t.amount_cents / 100,
      t.ref ?? "",
      t.note ?? "",
      t.needs_review ? "yes" : "",
      t.source,
    ]);
  }
  return tables;
}

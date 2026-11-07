// [4.10] Export everything: read every table a page at a time (the API returns at most 1,000 rows per request),
// write one CSV per table plus a readable transactions file, a manifest and a README, and put them in one ZIP.
// readExport() reads such a ZIP back into rows — the round trip the tests check, and what a restore starts from.

import { nairobiToday } from "@/lib/due";
import type { Db } from "@/lib/supabase";
import { parseCsv, toCsv, type Cell } from "./csv";
import { EXPORT_TABLES, type ExportTable, type TableName } from "./tables";
import { unzip, zip, type ZipEntry } from "./zip";

export const EXPORT_FORMAT = "pesa-dashboard-export";
export const EXPORT_VERSION = 1;
const PAGE = 1000;

export type Row = Record<string, Cell>;

export interface Manifest {
  format: typeof EXPORT_FORMAT;
  version: number;
  exported_at: string;
  /** Rows per table, in restore order. */
  tables: Record<string, number>;
}

/** Every row of one table, ordered by id so pages never overlap. */
export async function readTable(db: Db, table: ExportTable, onPage?: (rows: number) => void): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table.name)
      .select(table.columns.join(","))
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table.name}: ${error.message}`);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    onPage?.(rows.length);
    if (page.length < PAGE) return rows;
  }
}

export const tableCsv = (table: ExportTable, rows: readonly Row[]) =>
  toCsv(
    table.columns,
    rows.map((r) => table.columns.map((c) => r[c])),
  );

/** The Nairobi day of a time; empty rather than failing the whole export on a value that is not a time. */
function day(at: unknown): string {
  const time = Date.parse(String(at));
  return Number.isNaN(time) ? "" : nairobiToday(new Date(time));
}

const kes = (cents: unknown) => (typeof cents === "number" ? (cents / 100).toFixed(2) : "");

/** One line per transaction with names instead of ids and KES instead of cents, for a spreadsheet. */
export function readableTransactions(data: Partial<Record<TableName, Row[]>>): string {
  const names = (rows: Row[] = []) => new Map(rows.map((r) => [r.id, String(r.name ?? "")]));
  const account = names(data.accounts);
  const category = names(data.categories);
  const rows = [...(data.transactions ?? [])]
    .filter((t) => !t.deleted_at)
    .sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
  return toCsv(
    ["Date", "Account", "Kind", "Category", "Payee", "Amount (KES)", "Note", "Ref", "Source", "To review"],
    rows.map((t) => [
      day(t.occurred_at),
      account.get(t.account_id) ?? "",
      t.kind,
      t.category_id ? (category.get(t.category_id) ?? "") : "",
      t.payee,
      kes(t.amount_cents),
      t.note,
      t.ref,
      t.source,
      t.needs_review ? "yes" : "",
    ]),
  );
}

function readme(manifest: Manifest): string {
  const lines = Object.entries(manifest.tables).map(([name, n]) => `  ${name}.csv  ${n} rows`);
  return [
    "Pesa Dashboard — export of everything",
    `Exported ${manifest.exported_at} (format ${manifest.format}, version ${manifest.version}).`,
    "",
    "One CSV per table, in the database's own columns, listed in the order a restore inserts them:",
    ...lines,
    "",
    "transactions-readable.csv is for spreadsheets: dates in Nairobi time, account and category names, amounts in",
    "KES. Deleted transactions are left out of it (they are kept in transactions.csv). A restore ignores it.",
    "",
    "How to read the CSV files:",
    "  - Money columns ending in _cents are whole cents: 150000 is KES 1,500.00.",
    "  - Times are ISO 8601 with their UTC offset.",
    '  - An empty field is null (no value); "" is an empty piece of text.',
    "  - JSON columns (settings.alerts) hold JSON text.",
    "",
    "Not included: the PIN, push-notification device keys and the backup log.",
    "",
  ].join("\n");
}

export interface ExportProgress {
  table: TableName;
  rows: number;
}

export async function buildExport(
  db: Db,
  now = new Date(),
  onProgress?: (p: ExportProgress) => void,
): Promise<{ bytes: Uint8Array; manifest: Manifest; fileName: string }> {
  const data: Partial<Record<TableName, Row[]>> = {};
  for (const table of EXPORT_TABLES) {
    data[table.name] = await readTable(db, table, (rows) => onProgress?.({ table: table.name, rows }));
  }
  return packExport(data, now);
}

export function packExport(data: Partial<Record<TableName, Row[]>>, now = new Date()) {
  const manifest: Manifest = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: now.toISOString(),
    tables: Object.fromEntries(EXPORT_TABLES.map((t) => [t.name, data[t.name]?.length ?? 0])),
  };
  const entries: ZipEntry[] = [
    { name: "README.txt", data: readme(manifest) },
    { name: "manifest.json", data: JSON.stringify(manifest, null, 2) + "\n" },
    ...EXPORT_TABLES.map((t) => ({ name: `${t.name}.csv`, data: tableCsv(t, data[t.name] ?? []) })),
    { name: "transactions-readable.csv", data: readableTransactions(data) },
  ];
  return {
    bytes: zip(entries, now),
    manifest,
    fileName: `pesa-export-${nairobiToday(now)}.zip`,
  };
}

/** A value as read back: text, or null; JSON columns parsed. */
export type ReadValue = string | null | unknown;

/** Reads an export ZIP back into rows per table, checking the format and every table's header. */
export function readExport(bytes: Uint8Array): {
  manifest: Manifest;
  tables: Record<string, Record<string, ReadValue>[]>;
} {
  const files = unzip(bytes);
  const text = (name: string) => {
    const file = files.get(name);
    if (!file) throw new Error(`The export has no ${name}`);
    return new TextDecoder().decode(file);
  };
  const manifest = JSON.parse(text("manifest.json")) as Manifest;
  if (manifest.format !== EXPORT_FORMAT) throw new Error("This is not a Pesa Dashboard export");
  if (manifest.version > EXPORT_VERSION)
    throw new Error(`Export version ${manifest.version} is newer than this app`);

  const tables: Record<string, Record<string, ReadValue>[]> = {};
  for (const table of EXPORT_TABLES) {
    const [header = [], ...rows] = parseCsv(text(`${table.name}.csv`));
    const expected = table.columns.join(",");
    if (header.join(",") !== expected)
      throw new Error(`${table.name}.csv: the columns are not the expected ones`);
    tables[table.name] = rows.map((r) =>
      Object.fromEntries(
        table.columns.map((c, i) => {
          const v = r[i] ?? null;
          return [c, v !== null && table.json?.includes(c) ? JSON.parse(v) : v];
        }),
      ),
    );
    if (tables[table.name]!.length !== manifest.tables[table.name])
      throw new Error(
        `${table.name}.csv: ${tables[table.name]!.length} rows, the manifest says ${manifest.tables[table.name]}`,
      );
  }
  return { manifest, tables };
}

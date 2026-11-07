// [4.7] Bulk import, step one: turn the rows of an uploaded sheet into transactions to add, or a reason per row why
// not. The template's columns are below; headers are matched loosely (case, spaces, "(KES)"), so the readable file
// from Export everything ([4.10]) can be uploaded too. Plain functions, tested on their own.

import { nairobiToday } from "@/lib/due";
import { amountToCents } from "@/lib/import/ledger";

export const TEMPLATE_COLUMNS = [
  "Date",
  "Time",
  "Account",
  "Kind",
  "Amount (KES)",
  "Category",
  "Payee",
  "Note",
  "Ref",
  "To account",
] as const;

type Field = "date" | "time" | "account" | "kind" | "amount" | "category" | "payee" | "note" | "ref" | "to";

const ALIASES: Record<string, Field> = {
  date: "date",
  day: "date",
  time: "time",
  account: "account",
  from: "account",
  "from account": "account",
  kind: "kind",
  type: "kind",
  amount: "amount",
  category: "category",
  payee: "payee",
  description: "payee",
  details: "payee",
  note: "note",
  notes: "note",
  comment: "note",
  ref: "ref",
  reference: "ref",
  code: "ref",
  "receipt no": "ref",
  "to account": "to",
  to: "to",
};

const normal = (h: string) =>
  h
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export interface ImportAccount {
  id: string;
  name: string;
  sms_account_hint?: string | null;
}

export interface ImportCategory {
  id: string;
  name: string;
  kind: string;
}

export type ImportKind = "spending" | "income" | "transfer";

/** A row that can be imported. Amounts are positive; the kind says which way the money went. */
export interface PlannedRow {
  /** The row number in the file, as the spreadsheet shows it. */
  line: number;
  day: string;
  occurredAt: string;
  accountId: string;
  accountName: string;
  kind: ImportKind;
  cents: number;
  categoryId: string | null;
  categoryName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  payee: string | null;
  note: string | null;
  ref: string | null;
}

export interface RowError {
  line: number;
  errors: string[];
  /** What the row said, to show next to the errors. */
  text: string;
}

export interface ParsedSheet {
  rows: PlannedRow[];
  errors: RowError[];
  /** Data rows read (blank rows not counted). */
  read: number;
}

/** Excel stores dates as days since 30 Dec 1899 (its 1900 system). */
function excelDay(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}

function validDay(y: number, m: number, d: number): string | null {
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d
    ? at.toISOString().slice(0, 10)
    : null;
}

/** "2026-11-05", "5/11/2026" (day first, as in Kenya), "05.11.2026", or an Excel date number. */
export function parseDay(text: string): string | null {
  const t = text.trim();
  if (/^\d{5}(\.\d+)?$/.test(t)) return excelDay(Number(t));
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (m) return validDay(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) return validDay(m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!, +m[2]!, +m[1]!);
  return null;
}

/** "14:05", "2:05 pm", or an Excel time fraction → "14:05"; empty → noon. */
export function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return "12:00";
  if (/^0?\.\d+$|^0$/.test(t)) {
    const minutes = Math.round(Number(t) * 24 * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parseKind(text: string): ImportKind | "unknown" | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (["spending", "spend", "expense", "out", "money out", "paid"].includes(t)) return "spending";
  if (["income", "in", "money in", "received"].includes(t)) return "income";
  if (["transfer", "move"].includes(t)) return "transfer";
  return "unknown";
}

const byName = <T extends { name: string }>(list: readonly T[], text: string) => {
  const t = text.trim().toLowerCase();
  return list.find((x) => x.name.trim().toLowerCase() === t);
};

function findAccount(accounts: readonly ImportAccount[], text: string) {
  const t = text.trim().toLowerCase();
  return byName(accounts, text) ?? accounts.find((a) => (a.sms_account_hint ?? "").toLowerCase() === t);
}

export interface ParseOptions {
  accounts: readonly ImportAccount[];
  categories: readonly ImportCategory[];
  now?: Date;
}

/** Reads a sheet (header row first) into rows to import and per-row errors. */
export function parseSheet(
  table: readonly (readonly string[])[],
  { accounts, categories, now = new Date() }: ParseOptions,
): ParsedSheet {
  const headerAt = table.findIndex((r) => r.some((c) => c.trim()));
  if (headerAt < 0) throw new Error("The file is empty");
  const header = table[headerAt]!;
  const column = new Map<Field, number>();
  header.forEach((h, i) => {
    const field = ALIASES[normal(h)];
    if (field && !column.has(field)) column.set(field, i);
  });
  const missing = (["date", "account", "amount"] as const).filter((f) => !column.has(f));
  if (missing.length)
    throw new Error(
      `The first row must be the column names. Missing: ${missing.map((f) => ({ date: "Date", account: "Account", amount: "Amount (KES)" })[f]).join(", ")}. Use the template.`,
    );

  const today = nairobiToday(now);
  const rows: PlannedRow[] = [];
  const errors: RowError[] = [];
  let read = 0;

  for (let r = headerAt + 1; r < table.length; r++) {
    const cells = table[r] ?? [];
    if (!cells.some((c) => (c ?? "").trim())) continue;
    read++;
    const get = (f: Field) => (column.has(f) ? (cells[column.get(f)!] ?? "").trim() : "");
    const line = r + 1;
    const problems: string[] = [];

    const day = parseDay(get("date"));
    if (!get("date")) problems.push("Date is empty");
    else if (!day) problems.push(`Date “${get("date")}” is not a date (use 2026-11-05 or 5/11/2026)`);
    else if (day > today) problems.push("Date is in the future");

    const time = parseTime(get("time"));
    if (!time) problems.push(`Time “${get("time")}” is not a time (use 14:05)`);

    const account = get("account") ? findAccount(accounts, get("account")) : undefined;
    if (!get("account")) problems.push("Account is empty");
    else if (!account) problems.push(`No account called “${get("account")}”`);

    const amountText = get("amount")
      .replace(/^KES\s*/i, "")
      .replace(/\s/g, "");
    const signed = amountText ? amountToCents(amountText) : undefined;
    if (!amountText) problems.push("Amount is empty");
    else if (signed === undefined) problems.push(`Amount “${get("amount")}” is not a number`);
    else if (signed === 0) problems.push("Amount is zero");

    const kindText = parseKind(get("kind"));
    let kind: ImportKind | null = null;
    if (kindText === "unknown") problems.push(`Kind “${get("kind")}” must be spending, income or transfer`);
    else kind = kindText ?? (signed !== undefined && signed > 0 ? "income" : "spending");

    let to: ImportAccount | undefined;
    if (kind === "transfer") {
      to = get("to") ? findAccount(accounts, get("to")) : undefined;
      if (!get("to")) problems.push("A transfer needs To account");
      else if (!to) problems.push(`No account called “${get("to")}”`);
      else if (account && to.id === account.id) problems.push("A transfer needs two different accounts");
    }

    let category: ImportCategory | undefined;
    if (get("category")) {
      if (kind === "transfer") problems.push("A transfer has no category");
      else {
        category = categories.find(
          (c) => c.name.trim().toLowerCase() === get("category").toLowerCase() && c.kind === kind,
        );
        if (!category)
          problems.push(
            byName(categories, get("category"))
              ? `“${get("category")}” is not a${kind === "income" ? "n income" : " spending"} category`
              : `No category called “${get("category")}”`,
          );
      }
    }

    if (problems.length) {
      errors.push({ line, errors: problems, text: cells.filter((c) => (c ?? "").trim()).join(" · ") });
      continue;
    }
    rows.push({
      line,
      day: day!,
      occurredAt: new Date(`${day}T${time}:00+03:00`).toISOString(),
      accountId: account!.id,
      accountName: account!.name,
      kind: kind!,
      cents: Math.abs(signed!),
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      toAccountId: to?.id ?? null,
      toAccountName: to?.name ?? null,
      payee: get("payee") || null,
      note: get("note") || null,
      ref: get("ref") ? get("ref").toUpperCase() : null,
    });
  }
  return { rows, errors, read };
}

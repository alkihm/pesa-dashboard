// [4.7] Bulk import, step two: which rows are already in the ledger. In order:
//   1. Same ref (M-PESA or bank code) as an earlier row in the file → duplicate.
//   2. Same ref as a live transaction in the ledger, whatever its source (the SMS may have arrived after all) →
//      duplicate.
//   3. Imported before: its dedupe key is in the ledger (uploading the same file twice adds nothing) → duplicate.
//   4. No ref, but a live transaction on the same account, same Nairobi day and same amount → "looks like" a
//      duplicate: skipped unless the owner ticks "Import anyway". Each ledger row matches one file row at most.
// Everything else is new.

import { nairobiToday } from "@/lib/due";
import type { Db } from "@/lib/supabase";
import type { PlannedRow } from "./rows";

export type Verdict =
  { status: "new" } | { status: "duplicate"; reason: string } | { status: "likely"; reason: string };

export interface Checked {
  row: PlannedRow;
  /** dedupe_key for the row (a transfer's legs add ":out" and ":in"). */
  key: string;
  verdict: Verdict;
}

export interface LedgerRow {
  account_id: string;
  occurred_at: string;
  amount_cents: number;
  ref: string | null;
  dedupe_key: string | null;
}

/** Stable short hash (FNV-1a, 2×32 bits). */
function hash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/**
 * Keys that stay the same when the same file is uploaded again: the ref when there is one, else a hash of the row
 * plus how many identical rows came before it (so two real, identical purchases both import).
 */
export function dedupeKeys(rows: readonly PlannedRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    if (r.ref) return `import:ref:${r.ref}`;
    const base = hash(
      [
        r.day,
        r.occurredAt,
        r.accountId,
        r.kind,
        r.cents,
        r.toAccountId ?? "",
        r.payee ?? "",
        r.categoryId ?? "",
      ].join("|"),
    );
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `import:${base}:${n}`;
  });
}

/** The signed amount a row puts on its own account. */
const signed = (r: PlannedRow) => (r.kind === "income" ? r.cents : -r.cents);

export function classify(rows: readonly PlannedRow[], ledger: readonly LedgerRow[]): Checked[] {
  const keys = dedupeKeys(rows);
  const live = new Set(ledger.flatMap((t) => (t.dedupe_key ? [t.dedupe_key] : [])));
  const refs = new Set(ledger.flatMap((t) => (t.ref ? [t.ref.toUpperCase()] : [])));
  const sameDay = new Map<string, number>();
  for (const t of ledger) {
    const k = `${t.account_id}|${nairobiToday(new Date(t.occurred_at))}|${t.amount_cents}`;
    sameDay.set(k, (sameDay.get(k) ?? 0) + 1);
  }
  const refLine = new Map<string, number>();

  return rows.map((row, i) => {
    const key = keys[i]!;
    const verdict = ((): Verdict => {
      if (row.ref) {
        const earlier = refLine.get(row.ref);
        if (earlier) return { status: "duplicate", reason: `Same ref as row ${earlier}` };
        refLine.set(row.ref, row.line);
        if (refs.has(row.ref))
          return { status: "duplicate", reason: `Already in the ledger (ref ${row.ref})` };
      }
      if (live.has(key) || live.has(`${key}:out`)) return { status: "duplicate", reason: "Imported before" };
      if (!row.ref) {
        const k = `${row.accountId}|${row.day}|${signed(row)}`;
        const left = sameDay.get(k) ?? 0;
        if (left > 0) {
          sameDay.set(k, left - 1);
          return { status: "likely", reason: "The ledger has the same amount on this account that day" };
        }
      }
      return { status: "new" };
    })();
    return { row, key, verdict };
  });
}

const PAGE = 1000;

/** Live transactions that could match: the file's days on its accounts, plus anything with one of its refs or keys. */
export async function loadLedger(db: Db, rows: readonly PlannedRow[]): Promise<LedgerRow[]> {
  if (!rows.length) return [];
  const days = rows.map((r) => r.day).sort();
  const from = `${days[0]}T00:00:00+03:00`;
  const until = new Date(Date.parse(`${days.at(-1)}T00:00:00+03:00`) + 86_400_000).toISOString();
  const accounts = [
    ...new Set(rows.flatMap((r) => (r.toAccountId ? [r.accountId, r.toAccountId] : [r.accountId]))),
  ];
  const columns = "account_id, occurred_at, amount_cents, ref, dedupe_key";
  const out: LedgerRow[] = [];

  for (let at = 0; ; at += PAGE) {
    const { data, error } = await db
      .from("transactions")
      .select(columns)
      .is("deleted_at", null)
      .in("account_id", accounts)
      .gte("occurred_at", from)
      .lt("occurred_at", until)
      .order("id")
      .range(at, at + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }

  const refs = [...new Set(rows.flatMap((r) => (r.ref ? [r.ref] : [])))];
  const keys = dedupeKeys(rows).flatMap((k) => [k, `${k}:out`]);
  for (const [column, values] of [
    ["ref", refs],
    ["dedupe_key", keys],
  ] as const) {
    for (let i = 0; i < values.length; i += 100) {
      const { data, error } = await db
        .from("transactions")
        .select(columns)
        .is("deleted_at", null)
        .in(column, values.slice(i, i + 100));
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
    }
  }
  return out;
}

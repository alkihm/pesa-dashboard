// [4.7] Bulk import, step three: save the rows the owner kept. One import_batches row names the file; every
// transaction points at it, is marked source "import" and carries its dedupe key, so the same file uploaded again
// adds nothing (the database's unique index on dedupe_key backs that up). Rows go in chunks of up to 500, a
// transfer's two legs always in the same chunk (the database refuses a lone leg). Rows without a category wait in
// Review, as on Add transaction.

import type { Db } from "@/lib/supabase";
import type { Checked } from "./dedupe";

export interface ImportRowInsert {
  id: string;
  occurred_at: string;
  account_id: string;
  amount_cents: number;
  kind: "spending" | "income" | "transfer";
  category_id: string | null;
  transfer_id: string | null;
  payee: string | null;
  note: string | null;
  ref: string | null;
  source: "import";
  dedupe_key: string;
  needs_review: boolean;
  import_batch_id: string;
}

/** The transactions one row becomes: one, or two for a transfer. */
export function rowsFor(
  c: Checked,
  batchId: string,
  newId: () => string = () => crypto.randomUUID(),
): ImportRowInsert[] {
  const r = c.row;
  const common = {
    occurred_at: r.occurredAt,
    payee: r.payee,
    note: r.note,
    source: "import" as const,
    import_batch_id: batchId,
  };
  if (r.kind === "transfer") {
    const transfer = {
      ...common,
      kind: "transfer" as const,
      transfer_id: newId(),
      category_id: null,
      needs_review: false,
    };
    return [
      {
        ...transfer,
        id: newId(),
        account_id: r.accountId,
        amount_cents: -r.cents,
        ref: r.ref,
        dedupe_key: `${c.key}:out`,
      },
      {
        ...transfer,
        id: newId(),
        account_id: r.toAccountId!,
        amount_cents: r.cents,
        ref: null,
        dedupe_key: `${c.key}:in`,
      },
    ];
  }
  return [
    {
      ...common,
      id: newId(),
      account_id: r.accountId,
      amount_cents: r.kind === "income" ? r.cents : -r.cents,
      kind: r.kind,
      category_id: r.categoryId,
      transfer_id: null,
      ref: r.ref,
      dedupe_key: c.key,
      needs_review: !r.categoryId,
    },
  ];
}

export interface ImportResult {
  batchId: string;
  /** File rows saved (a transfer counts once). */
  saved: number;
  /** Set when a chunk failed: rows before it are saved; uploading the file again adds only the rest. */
  error?: string;
}

const CHUNK = 500;

export async function saveImport(
  db: Db,
  fileName: string,
  rows: readonly Checked[],
  newId?: () => string,
): Promise<ImportResult> {
  const batch = await db
    .from("import_batches")
    .insert({ file_name: fileName, row_count: 0 })
    .select("id")
    .single();
  if (batch.error) throw new Error(batch.error.message);
  const batchId = batch.data.id;

  const chunks: { inserts: ImportRowInsert[]; count: number }[] = [{ inserts: [], count: 0 }];
  for (const c of rows) {
    const unit = rowsFor(c, batchId, newId);
    if (chunks.at(-1)!.inserts.length + unit.length > CHUNK) chunks.push({ inserts: [], count: 0 });
    chunks.at(-1)!.inserts.push(...unit);
    chunks.at(-1)!.count++;
  }

  let saved = 0;
  let error: string | undefined;
  for (const chunk of chunks) {
    if (!chunk.inserts.length) continue;
    const res = await db.from("transactions").insert(chunk.inserts);
    if (res.error) {
      error = res.error.message;
      break;
    }
    saved += chunk.count;
  }
  await db.from("import_batches").update({ row_count: saved }).eq("id", batchId);
  return { batchId, saved, error };
}

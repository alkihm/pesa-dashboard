// Saving an edited transaction ([2.6]): its category and note, and optionally a payee rule so the same payee is
// categorised from now on and in past rows (apply_payee_rule, [1.9]).

import type { Db } from "../../lib/supabase";
import { COLUMNS, type ActivityRow } from "./query";

export interface Changes {
  categoryId: string | null;
  note: string;
  /** Make a payee rule from this row's payee to the chosen category. */
  always: boolean;
}

export interface Saved {
  row: ActivityRow;
  /** Other past rows the payee rule categorised; undefined when no rule was made. */
  applied?: number;
}

const count = new Intl.NumberFormat("en-KE");

/** The confirmation shown after a save. */
export function savedMessage({ applied }: Saved) {
  if (applied === undefined) return "Saved";
  if (applied === 0) return "Saved · the rule applies to new messages from now on";
  return `Saved · the rule also categorised ${count.format(applied)} past transaction${applied === 1 ? "" : "s"}`;
}

export class StaleRowError extends Error {
  constructor() {
    super("This transaction was changed somewhere else. Reload to see the latest version.");
  }
}

/** The fields to write. A chosen category clears review, except for a foreign-currency estimate (as the rules do). */
export function patchFor(row: ActivityRow, { categoryId, note }: Changes) {
  return {
    category_id: categoryId,
    note: note.trim() || null,
    needs_review: categoryId !== null ? row.needs_review && row.original_currency !== null : row.needs_review,
  };
}

export async function saveTransaction(db: Db, row: ActivityRow, changes: Changes): Promise<Saved> {
  // Sends the version the edit started from; a row changed since then matches nothing.
  const { data, error } = await db
    .from("transactions")
    .update(patchFor(row, changes))
    .eq("id", row.id)
    .eq("version", row.version)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new StaleRowError();

  if (!changes.always || !changes.categoryId || !row.payee?.trim()) return { row: data };
  const applied = await ruleForPayee(db, row.payee.trim(), changes.categoryId);
  return { row: data, applied };
}

/** Points the payee's existing rule at the category, or makes one, then applies it to uncategorised past rows. */
async function ruleForPayee(db: Db, payee: string, categoryId: string) {
  const existing = await db.from("payee_rules").select("id").eq("pattern", payee).limit(1).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const rule = existing.data
    ? await db
        .from("payee_rules")
        .update({ category_id: categoryId, transfer_account_id: null })
        .eq("id", existing.data.id)
        .select("id")
        .single()
    : await db.from("payee_rules").insert({ pattern: payee, category_id: categoryId }).select("id").single();
  if (rule.error) throw new Error(rule.error.message);

  const applied = await db.rpc("apply_payee_rule", { p_rule_id: rule.data.id });
  if (applied.error) throw new Error(applied.error.message);
  return applied.data;
}

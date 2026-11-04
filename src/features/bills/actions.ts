// [3.3] Pay, skip and undo for one bill month. Each action is one update of the bill_months row, sent with the
// version the screen showed, so a row changed elsewhere in the meantime is refused, not overwritten (ARCHITECTURE
// "Offline"). The screen applies the change at once and puts it back if the database refuses. The offline queue
// ([4.5]) will send these same updates.

import type { Database } from "@/lib/database.types";
import type { Db } from "@/lib/supabase";
import type { BillRow } from "./data";

export type BillAction = "pay" | "skip" | "undo";
type BillMonthUpdate = Database["public"]["Tables"]["bill_months"]["Update"];

/** Pay and Skip are for months still owed. */
export function canPayOrSkip(row: Pick<BillRow, "status">): boolean {
  return row.status === "due";
}

/**
 * Undo is for months paid by hand or skipped. A month an SMS payment paid has no undo here: the database guards it
 * ([3.2], D-015) and a wrong match is set back on purpose, not with this button.
 */
export function canUndo(row: Pick<BillRow, "status" | "viaSms">): boolean {
  if (row.status === "skipped") return true;
  return row.status === "paid" && !row.viaSms;
}

/** The fields an action writes. */
export function actionChanges(action: BillAction, now = new Date()): BillMonthUpdate {
  if (action === "pay") return { status: "paid", paid_at: now.toISOString(), skip_reason: null };
  if (action === "skip") return { status: "skipped", paid_at: null };
  return { status: "due", paid_at: null, skip_reason: null };
}

/** The row as it looks once the action is applied, for the screen to show before the database answers. */
export function applyAction(row: BillRow, action: BillAction, now = new Date()): BillRow {
  const c = actionChanges(action, now);
  return {
    ...row,
    status: c.status as BillRow["status"],
    paidAt: c.paid_at ?? null,
    version: row.version + 1,
  };
}

export function allowed(row: BillRow, action: BillAction): boolean {
  return action === "undo" ? canUndo(row) : canPayOrSkip(row);
}

export type ActionResult =
  { ok: true; version: number } | { ok: false; reason: "changed" | "error"; message: string };

/** Sends one action. Refused when the row is no longer at the version the screen showed. */
export async function sendBillAction(
  db: Db,
  row: BillRow,
  action: BillAction,
  now = new Date(),
): Promise<ActionResult> {
  const { data, error } = await db
    .from("bill_months")
    .update(actionChanges(action, now))
    .eq("id", row.id)
    .eq("version", row.version)
    .select("version");
  if (error) return { ok: false, reason: "error", message: error.message };
  if (!data || data.length === 0)
    return {
      ok: false,
      reason: "changed",
      message: `${row.name} was changed elsewhere; showing the latest.`,
    };
  return { ok: true, version: data[0]!.version };
}

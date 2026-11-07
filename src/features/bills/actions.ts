// [3.3] Pay, skip and undo for one bill month. Each action is one update of the bill_months row, sent with the
// version the screen showed, so a row changed elsewhere in the meantime is refused, not overwritten (ARCHITECTURE
// "Offline"). The screen applies the change at once and puts it back if the database refuses. With no connection
// the update waits in the offline queue ([4.5]) and is sent later with that same version.

import type { Database } from "@/lib/database.types";
import { offlineQueue } from "@/lib/offline/queue";
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
  | { ok: true; version: number; queued?: boolean }
  | { ok: false; reason: "changed" | "error"; message: string };

const VERB: Record<BillAction, string> = { pay: "Paid", skip: "Skipped", undo: "Undo" };

/** Sends one action, or queues it offline. Refused when the row is no longer at the version the screen showed. */
export async function sendBillAction(
  db: Db,
  row: BillRow,
  action: BillAction,
  now = new Date(),
): Promise<ActionResult> {
  const result = await offlineQueue().submit(
    db,
    {
      kind: "update",
      table: "bill_months",
      id: row.id,
      version: row.version,
      changes: actionChanges(action, now),
    },
    `${VERB[action]} · ${row.name}`,
    "version",
  );
  if (result.status === "queued") return { ok: true, version: row.version + 1, queued: true };
  if (result.status === "error") return { ok: false, reason: "error", message: result.message };
  if (result.status === "changed" || !result.row)
    return {
      ok: false,
      reason: "changed",
      message: `${row.name} was changed elsewhere; showing the latest.`,
    };
  return { ok: true, version: Number(result.row.version) };
}

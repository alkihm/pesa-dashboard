// Fixing a mismatch ([4.2]) without editing history: add the transaction the SMS feed missed, or record an
// `adjustment` with a reason. Both are dated at or before the reading's time, because the database compares the
// ledger up to that moment (account_balances: occurred_at <= the reading's as_of); a fix dated later would leave the
// account red.

import type { Account } from "@/lib/data/accounts";
import { nairobiToday } from "@/lib/due";
import type { Db } from "@/lib/supabase";

/** Add transaction, filled in with what is missing: money out when the ledger is higher than the reading. */
export function missingTransactionLink(a: Account): string {
  const diff = a.difference_cents ?? 0;
  const params = new URLSearchParams({
    direction: diff < 0 ? "out" : "in",
    account: a.account_id,
    amount: String(Math.abs(diff)),
    date: nairobiToday(new Date(a.snapshot_at!)),
    at: a.snapshot_at!,
    back: "/review",
  });
  return `/transactions/new?${params.toString()}`;
}

export function reasonProblem(reason: string): string | undefined {
  return reason.trim().length < 3
    ? "Say why the balance is off, e.g. “Counted cash, 100 missing”."
    : undefined;
}

/** The adjustment that brings the ledger to the reading: its amount is the difference, its time the reading's. */
export function adjustmentRow(a: Account, reason: string) {
  return {
    account_id: a.account_id,
    amount_cents: a.difference_cents!,
    kind: "adjustment",
    reason: reason.trim(),
    source: "manual",
    payee: "Balance adjustment",
    occurred_at: a.snapshot_at!,
  } as const;
}

export async function saveAdjustment(db: Db, a: Account, reason: string) {
  const why = reasonProblem(reason);
  if (why) throw new Error(why);
  const { error } = await db.from("transactions").insert(adjustmentRow(a, reason));
  if (error) throw new Error(error.message);
}

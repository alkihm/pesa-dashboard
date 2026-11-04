// [3.1] Reads for the Bills screen. Each visit first asks the database to make this month's row for every live bill
// (ensure_bill_months is idempotent and runs as the caller, so row-level security applies), then reads this month's
// rows plus any earlier month left unpaid, so a bill missed in October still shows as overdue in November.

import { useCallback, useEffect, useState } from "react";

import { supabase, type Db } from "@/lib/supabase";
import type { BillMonthStatus } from "./status";

export function billMonthsQuery(db: Db, month: string) {
  return db
    .from("bill_months")
    .select(
      "id, bill_id, month, due_on, amount_cents, status, paid_at, transaction_id, " +
        "bill:bills!inner(name, emoji, account_id, archived_at), paid_by:transactions(source)",
    )
    .is("bill.archived_at", null)
    .or(`month.eq.${month},and(status.eq.due,month.lt.${month})`);
}

type Raw = {
  id: string;
  bill_id: string;
  month: string;
  due_on: string;
  amount_cents: number;
  status: string;
  paid_at: string | null;
  transaction_id: string | null;
  bill: { name: string; emoji: string | null; account_id: string | null } | null;
  paid_by: { source: string } | null;
};

export interface BillRow {
  id: string;
  billId: string;
  month: string;
  name: string;
  emoji: string;
  accountId: string | null;
  due_on: string;
  amount_cents: number;
  status: BillMonthStatus;
  paidAt: string | null;
  viaSms: boolean;
}

const STATUSES: readonly string[] = ["due", "paid", "skipped"];

export function toBillRow(r: Raw): BillRow {
  return {
    id: r.id,
    billId: r.bill_id,
    month: r.month,
    name: r.bill?.name ?? "Bill",
    emoji: r.bill?.emoji ?? "🧾",
    accountId: r.bill?.account_id ?? null,
    due_on: r.due_on,
    amount_cents: r.amount_cents,
    status: (STATUSES.includes(r.status) ? r.status : "due") as BillMonthStatus,
    paidAt: r.paid_at,
    viaSms: r.paid_by?.source === "sms",
  };
}

export async function loadBills(db: Db, month: string): Promise<{ rows: BillRow[]; error?: string }> {
  const made = await db.rpc("ensure_bill_months", { p_month: month });
  if (made.error) return { rows: [], error: made.error.message };
  const { data, error } = await billMonthsQuery(db, month);
  if (error) return { rows: [], error: error.message };
  return { rows: (data as unknown as Raw[]).map(toBillRow) };
}

export function useBills(db: () => Db = supabase, month: string) {
  const [rows, setRows] = useState<BillRow[]>();
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void loadBills(db(), month).then((r) => {
      if (!live) return;
      setRows(r.error ? (rows) => rows ?? [] : r.rows);
      setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [db, month, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { rows, error, reload };
}

/** Accounts a bill can be paid from, for the Add bill form. */
export function payingAccountsQuery(db: Db) {
  return db
    .from("accounts")
    .select("id, name, emoji, kind")
    .is("archived_at", null)
    .in("kind", ["wallet", "bank", "cash", "card"])
    .order("sort_order")
    .order("name");
}

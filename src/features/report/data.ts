// [4.8] Reads for the month report: six months of totals and two months of categories (as the Month screen), the
// month's bills, and every account's balance at the month's end (account_balances_at). Read-only: the report never
// creates bill months or writes anything.

import { useEffect, useState } from "react";

import { categoryTotalsQuery, monthTotalsQuery } from "@/features/month/data";
import { addMonths, type Month } from "@/features/month/month";
import { supabase, type Db } from "@/lib/supabase";
import { buildReport, monthEnd, type Report } from "./report";

export function reportBillsQuery(db: Db, month: Month) {
  return db
    .from("bill_months")
    .select("amount_cents, status, bill:bills!inner(archived_at)")
    .eq("month", month)
    .is("bill.archived_at", null);
}

export function balancesAtQuery(db: Db, month: Month) {
  return db.rpc("account_balances_at", { p_at: monthEnd(month) });
}

export async function loadReport(db: Db, month: Month, now = new Date()): Promise<Report> {
  const [totals, categories, bills, balances] = await Promise.all([
    monthTotalsQuery(db, addMonths(month, -5), month),
    categoryTotalsQuery(db, [month, addMonths(month, -1)]),
    reportBillsQuery(db, month),
    balancesAtQuery(db, month),
  ]);
  const error = totals.error ?? categories.error ?? bills.error ?? balances.error;
  if (error) throw new Error(error.message);
  return buildReport({
    month,
    totals: totals.data ?? [],
    categories: categories.data ?? [],
    bills: bills.data ?? [],
    balances: balances.data ?? [],
    now,
  });
}

export function useReport(month: Month, db: () => Db = supabase) {
  const [result, setResult] = useState<{ month: Month; report?: Report; error?: string }>();

  useEffect(() => {
    let live = true;
    loadReport(db(), month).then(
      (report) => live && setResult({ month, report }),
      (e: unknown) => live && setResult({ month, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [db, month]);

  const current = result?.month === month ? result : undefined;
  return { report: current?.report, error: current?.error };
}

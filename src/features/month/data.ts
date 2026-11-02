// The Month screen's data: month totals for the 6-month bars, spending by category for this month and the one
// before, and the month's transactions a page at a time. All three come from the database's own totals or
// indexes, so a month of any size costs a few small queries.

import { useCallback, useEffect, useState } from "react";

import { activityQuery, nextCursor, type ActivityRow, type Cursor } from "@/features/activity/query";
import { supabase, type Db } from "@/lib/supabase";
import { addMonths, monthRange, type CategoryMonthRow, type Month, type MonthTotalsRow } from "./month";

export function monthTotalsQuery(db: Db, from: Month, to: Month) {
  return db
    .from("month_totals")
    .select("month, income_cents, spending_cents, fees_cents, repaid_cents, saved_cents")
    .gte("month", from)
    .lte("month", to);
}

export function categoryTotalsQuery(db: Db, months: Month[]) {
  return db
    .from("category_month_totals")
    .select("month, category_id, total_cents, category:categories(name, emoji, colour)")
    .in("month", months)
    .eq("kind", "spending");
}

export interface MonthData {
  totals: MonthTotalsRow[];
  categories: CategoryMonthRow[];
}

export function useMonthData(month: Month, db: () => Db = supabase) {
  const [result, setResult] = useState<{ month: Month; data?: MonthData; error?: string }>();

  useEffect(() => {
    let live = true;
    const previous = addMonths(month, -1);
    Promise.all([
      monthTotalsQuery(db(), addMonths(month, -5), month),
      categoryTotalsQuery(db(), [month, previous]),
    ]).then(
      ([totals, categories]) => {
        if (!live) return;
        const error = totals.error?.message ?? categories.error?.message;
        setResult(
          error
            ? { month, error }
            : { month, data: { totals: totals.data ?? [], categories: categories.data ?? [] } },
        );
      },
      (e: unknown) => live && setResult({ month, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [db, month]);

  const current = result?.month === month ? result : undefined;
  return { data: current?.data, error: current?.error, loading: !current };
}

interface Page {
  month: Month;
  rows: ActivityRow[];
  cursor?: Cursor;
  error?: string;
  more?: boolean;
}

/** The month's transactions, newest first, 50 at a time. */
export function useMonthTransactions(month: Month, db: () => Db = supabase) {
  const [page, setPage] = useState<Page>();

  const fetchPage = useCallback(
    (from?: Cursor) =>
      activityQuery(db(), { filter: "all", search: "", range: monthRange(month), cursor: from }).then(
        ({ data, error }) =>
          setPage((prev) => {
            const earlier = from && prev?.month === month ? prev.rows : [];
            const rows = [...earlier, ...(data ?? [])];
            return { month, rows, cursor: nextCursor(data ?? []), error: error?.message };
          }),
      ),
    [db, month],
  );

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const current = page?.month === month ? page : undefined;
  const loadMore = useCallback(() => {
    if (!current?.cursor || current.more) return;
    setPage({ ...current, more: true });
    void fetchPage(current.cursor);
  }, [current, fetchPage]);

  return {
    rows: current?.rows ?? [],
    hasMore: !!current?.cursor,
    loadMore,
    loading: !current || !!current.more,
    error: current?.error,
  };
}

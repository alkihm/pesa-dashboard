// Overview's data besides the accounts (useAccounts): twelve months of totals for the trend, and spending by
// category since the start of the chosen period. Both come from the database's totals views.

import { useEffect, useState } from "react";

import { monthTotalsQuery } from "@/features/month/data";
import type { CategoryMonthRow, MonthTotalsRow } from "@/features/month/month";
import { supabase, type Db } from "@/lib/supabase";
import { periodStart, trendFrom, type Period } from "./overview";
import { useLive } from "@/lib/live";

export function periodCategoriesQuery(db: Db, from: string | null) {
  const query = db
    .from("category_month_totals")
    .select("month, category_id, total_cents, category:categories(name, emoji, colour)")
    .eq("kind", "spending");
  return from ? query.gte("month", from) : query;
}

export interface OverviewData {
  totals: MonthTotalsRow[];
  categories: CategoryMonthRow[];
}

export function useOverviewData(period: Period, db: () => Db = supabase, now?: Date) {
  const [result, setResult] = useState<{ period: Period; data?: OverviewData; error?: string }>();
  const from = periodStart(period, now);
  const trend = trendFrom(now);
  const fresh = useLive(["transactions", "categories"]);

  useEffect(() => {
    let live = true;
    Promise.all([monthTotalsQuery(db(), trend.from, trend.to), periodCategoriesQuery(db(), from)]).then(
      ([totals, categories]) => {
        if (!live) return;
        const error = totals.error?.message ?? categories.error?.message;
        setResult(
          error
            ? { period, error }
            : { period, data: { totals: totals.data ?? [], categories: categories.data ?? [] } },
        );
      },
      (e: unknown) => live && setResult({ period, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [db, period, from, trend.from, trend.to, fresh]);

  const current = result?.period === period ? result : undefined;
  return { data: current?.data, error: current?.error };
}

// The parts of Activity above the list: this month's spending by category and how many rows wait for review.
// Both are totals the database already keeps (category_month_totals) or counts, so they cost one small query each.

import { useCallback, useEffect, useState } from "react";

import { supabase, type Db } from "../../lib/supabase";
import { monthStart } from "./format";

export function monthByCategoryQuery(db: Db, month: string) {
  return db
    .from("category_month_totals")
    .select("category_id, total_cents, category:categories(name, emoji, colour)")
    .eq("month", month)
    .eq("kind", "spending")
    .order("total_cents", { ascending: false });
}

export function reviewCountQuery(db: Db) {
  return db
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("needs_review", true);
}

export interface CategoryTotal {
  key: string;
  label: string;
  emoji: string;
  /** Category colour key; none for spending without a category, which is shown as "To review". */
  colour?: string;
  cents: number;
}

type MonthRow = NonNullable<Awaited<ReturnType<typeof monthByCategoryQuery>>["data"]>[number];

/** Largest first; rows without a category become one "To review" line. */
export function toCategoryTotals(rows: MonthRow[]): CategoryTotal[] {
  return rows
    .filter((r) => (r.total_cents ?? 0) > 0)
    .map((r) =>
      r.category
        ? {
            key: r.category_id ?? r.category.name,
            label: r.category.name,
            emoji: r.category.emoji ?? "🏷️",
            colour: r.category.colour,
            cents: r.total_cents ?? 0,
          }
        : { key: "review", label: "To review", emoji: "❓", cents: r.total_cents ?? 0 },
    )
    .sort((a, b) => b.cents - a.cents);
}

export function useActivitySummary(db: () => Db = supabase, now = new Date()) {
  const month = monthStart(now);
  const [byCategory, setByCategory] = useState<CategoryTotal[]>();
  const [reviewCount, setReviewCount] = useState<number>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void monthByCategoryQuery(db(), month).then(
      ({ data }) => live && setByCategory(toCategoryTotals(data ?? [])),
    );
    void reviewCountQuery(db()).then(({ count }) => live && setReviewCount(count ?? 0));
    return () => {
      live = false;
    };
  }, [db, month, version]);

  /** Fetches the totals again after an edit, so a new category shows in the month at once. */
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { month, byCategory, reviewCount, reload };
}

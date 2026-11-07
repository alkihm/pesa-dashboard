// Categories' data: every category (archived ones too, for restoring), this month's total per category, and the
// payee rules that point at a category. Saving writes the category, then its rules, and runs each new rule over
// past rows (apply_payee_rule), as "always use this category" does in [2.6].

import { useCallback, useEffect, useState } from "react";

import { currentMonth } from "@/features/month/month";
import { supabase, type Db } from "@/lib/supabase";
import { ruleChanges, values, type CategoryRecord, type Form, type Rule } from "./category";
import { useLive } from "@/lib/live";

export function allCategoriesQuery(db: Db) {
  return db
    .from("categories")
    .select("id, name, emoji, colour, kind, monthly_budget_cents, system, sort_order, archived_at, version")
    .order("sort_order")
    .order("name");
}

export function monthTotalsQuery(db: Db, month: string) {
  return db.from("category_month_totals").select("category_id, total_cents").eq("month", month);
}

export function categoryRulesQuery(db: Db) {
  return db
    .from("payee_rules")
    .select("id, pattern, category_id")
    .not("category_id", "is", null)
    .order("pattern");
}

export interface CategoryData {
  categories: CategoryRecord[];
  totals: Map<string, number>;
  rules: Rule[];
}

export function useCategoryData(db: () => Db = supabase, now?: Date) {
  const month = currentMonth(now);
  const [result, setResult] = useState<{ data?: CategoryData; error?: string }>();
  const [version, setVersion] = useState(0);
  const fresh = useLive(["categories", "transactions"]);

  useEffect(() => {
    let live = true;
    Promise.all([allCategoriesQuery(db()), monthTotalsQuery(db(), month), categoryRulesQuery(db())]).then(
      ([categories, totals, rules]) => {
        if (!live) return;
        const error = categories.error ?? totals.error ?? rules.error;
        if (error) return setResult({ error: error.message });
        const byCategory = new Map<string, number>();
        for (const t of totals.data ?? []) {
          if (t.category_id)
            byCategory.set(t.category_id, (byCategory.get(t.category_id) ?? 0) + (t.total_cents ?? 0));
        }
        setResult({
          data: { categories: categories.data ?? [], totals: byCategory, rules: rules.data ?? [] },
        });
      },
      (e: unknown) => live && setResult({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [db, month, version, fresh]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { month, data: result?.data, error: result?.error, reload };
}

/** The category changed on another device since it was loaded. */
export class StaleCategoryError extends Error {
  constructor() {
    super("This category was changed elsewhere. It has been reloaded; make the change again.");
  }
}

export interface SaveResult {
  id: string;
  /** Past transactions the new rules gave this category. */
  applied: number;
}

export async function saveCategory(
  db: Db,
  form: Form,
  { existing, rules, nextOrder }: { existing?: CategoryRecord; rules: Rule[]; nextOrder: number },
): Promise<SaveResult> {
  let id: string;
  if (existing) {
    const { name, emoji, colour, monthly_budget_cents } = values(form); // a category keeps its kind
    const { data, error } = await db
      .from("categories")
      .update({ name, emoji, colour, monthly_budget_cents })
      .eq("id", existing.id)
      .eq("version", existing.version)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new StaleCategoryError();
    id = data.id;
  } else {
    const { data, error } = await db
      .from("categories")
      .insert({ ...values(form), sort_order: nextOrder })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    id = data.id;
  }

  const stored = rules.filter((r) => r.category_id === id);
  const { add, remove } = ruleChanges(form, stored);
  if (remove.length) {
    const { error } = await db.from("payee_rules").delete().in("id", remove);
    if (error) throw new Error(error.message);
  }
  let applied = 0;
  if (add.length) {
    const { data, error } = await db
      .from("payee_rules")
      .insert(add.map((pattern) => ({ pattern, category_id: id })))
      .select("id");
    if (error) throw new Error(error.message);
    for (const rule of data ?? []) {
      const result = await db.rpc("apply_payee_rule", { p_rule_id: rule.id });
      if (result.error) throw new Error(result.error.message);
      applied += result.data ?? 0;
    }
  }
  return { id, applied };
}

/** Archived categories stay on past rows but are no longer offered (D-009 rule 8). */
export async function setArchived(db: Db, category: CategoryRecord, archived: boolean) {
  const { data, error } = await db
    .from("categories")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", category.id)
    .eq("version", category.version)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new StaleCategoryError();
}

export function savedMessage(name: string, { applied }: SaveResult) {
  if (!applied) return `Saved ${name}.`;
  return `Saved ${name}. ${applied} past ${applied === 1 ? "transaction" : "transactions"} now ${applied === 1 ? "has" : "have"} this category.`;
}

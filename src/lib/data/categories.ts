// The owner's active categories, in their chosen order. Shared by screens that pick or show a category
// (transaction detail [2.6], add transaction [2.7], categories [2.8]).

import { useEffect, useState } from "react";

import { supabase, type Db } from "../supabase";
import { useLive } from "@/lib/live";

export function categoriesQuery(db: Db) {
  return db
    .from("categories")
    .select("id, name, emoji, colour, kind, system, sort_order")
    .is("archived_at", null)
    .order("sort_order")
    .order("name");
}

export type Category = NonNullable<Awaited<ReturnType<typeof categoriesQuery>>["data"]>[number];

export function useCategories(db: () => Db = supabase) {
  const [categories, setCategories] = useState<Category[]>();
  const [error, setError] = useState<string>();
  const fresh = useLive(["categories"]);

  useEffect(() => {
    let live = true;
    void categoriesQuery(db()).then(({ data, error }) => {
      if (!live) return;
      setCategories(data ?? []);
      setError(error?.message);
    });
    return () => {
      live = false;
    };
  }, [db, fresh]);

  return { categories, error };
}

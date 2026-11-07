// [3.4] Budget items: planned spending from a chosen account that waits for approval (R12). Approval never moves
// money (ARCHITECTURE: budget_items): an approved item is set aside from what is available until transactions with
// its budget_item_id spend it ("done"). Pending items are only a plan and set nothing aside.

import { useCallback, useEffect, useState } from "react";

import type { Database } from "@/lib/database.types";
import { offlineQueue } from "@/lib/offline/queue";
import { supabase, type Db } from "@/lib/supabase";
import { amountCents } from "../transactions/form";
import { useLive } from "@/lib/live";

export type BudgetStatus = "pending" | "approved" | "done" | "cancelled";
type BudgetInsert = Database["public"]["Tables"]["budget_items"]["Insert"];
type BudgetUpdate = Database["public"]["Tables"]["budget_items"]["Update"];

export interface BudgetItem {
  id: string;
  name: string;
  amount_cents: number;
  status: BudgetStatus;
  month: string;
  accountId: string;
  accountName: string;
  accountEmoji: string;
  version: number;
}

/** This month's items, plus any earlier item still pending or approved. Cancelled items are left out. */
export function budgetItemsQuery(db: Db, month: string) {
  return db
    .from("budget_items")
    .select("id, name, amount_cents, status, month, account_id, version, account:accounts(name, emoji)")
    .neq("status", "cancelled")
    .or(`month.eq.${month},status.in.(pending,approved)`)
    .order("created_at");
}

type Raw = {
  id: string;
  name: string;
  amount_cents: number;
  status: string;
  month: string;
  account_id: string;
  version: number;
  account: { name: string; emoji: string | null } | null;
};

const STATUSES: readonly string[] = ["pending", "approved", "done", "cancelled"];

export function toBudgetItem(r: Raw): BudgetItem {
  return {
    id: r.id,
    name: r.name,
    amount_cents: r.amount_cents,
    status: (STATUSES.includes(r.status) ? r.status : "pending") as BudgetStatus,
    month: r.month,
    accountId: r.account_id,
    accountName: r.account?.name ?? "Account",
    accountEmoji: r.account?.emoji ?? "💰",
    version: r.version,
  };
}

/** Pending first (they need a decision), then approved, then done; oldest first within each. */
export function sortBudgetItems(items: readonly BudgetItem[]): BudgetItem[] {
  const rank: Record<BudgetStatus, number> = { pending: 0, approved: 1, done: 2, cancelled: 3 };
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rank[a.item.status] - rank[b.item.status] || a.i - b.i)
    .map((x) => x.item);
}

/** Money approved but not yet spent: set aside from what is available. */
export function setAsideCents(items: readonly Pick<BudgetItem, "status" | "amount_cents">[]): number {
  return items.reduce((sum, i) => sum + (i.status === "approved" ? i.amount_cents : 0), 0);
}

// ---- the new item form ---------------------------------------------------------------------------------

export interface BudgetForm {
  name: string;
  amount: string;
  accountId: string;
}

export const emptyBudgetForm = (): BudgetForm => ({ name: "", amount: "", accountId: "" });

export function budgetProblem(form: BudgetForm): string | undefined {
  if (!form.name.trim()) return "Say what the money is for.";
  if (!amountCents(form.amount)) return "The amount must be above zero.";
  if (!form.accountId) return "Choose the account it comes from.";
  return undefined;
}

export function buildBudgetItem(form: BudgetForm, month: string): BudgetInsert {
  return {
    name: form.name.trim(),
    amount_cents: amountCents(form.amount)!,
    account_id: form.accountId,
    month,
  };
}

// ---- approve and cancel ----------------------------------------------------------------------------------

export type BudgetAction = "approve" | "cancel";

export function budgetChanges(action: BudgetAction, now = new Date()): BudgetUpdate {
  return action === "approve"
    ? { status: "approved", approved_at: now.toISOString() }
    : { status: "cancelled" };
}

/** Approve a pending item; cancel a pending or approved one. Done items are spent and stay. */
export function canBudget(item: Pick<BudgetItem, "status">, action: BudgetAction): boolean {
  return action === "approve"
    ? item.status === "pending"
    : item.status === "pending" || item.status === "approved";
}

export async function sendBudgetAction(db: Db, item: BudgetItem, action: BudgetAction, now = new Date()) {
  const result = await offlineQueue().submit(
    db,
    {
      kind: "update",
      table: "budget_items",
      id: item.id,
      version: item.version,
      changes: budgetChanges(action, now),
    },
    `${action === "approve" ? "Approved" : "Cancelled"} · ${item.name}`,
    "version",
  );
  if (result.status === "sent" || result.status === "queued")
    return { ok: true as const, queued: result.status === "queued" };
  if (result.status === "error") return { ok: false as const, message: result.message };
  return { ok: false as const, message: `${item.name} was changed elsewhere; showing the latest.` };
}

// ---- reads ---------------------------------------------------------------------------------------------

export function useBudgetItems(db: () => Db = supabase, month: string) {
  const [items, setItems] = useState<BudgetItem[]>();
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  const fresh = useLive(["budget_items", "transactions"]);

  useEffect(() => {
    let live = true;
    void budgetItemsQuery(db(), month).then(({ data, error }) => {
      if (!live) return;
      setItems(error ? (items) => items ?? [] : (data as unknown as Raw[]).map(toBudgetItem));
      setError(error?.message);
    });
    return () => {
      live = false;
    };
  }, [db, month, version, fresh]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const replace = useCallback(
    (item: BudgetItem) => setItems((list) => list?.map((i) => (i.id === item.id ? item : i))),
    [],
  );
  return { items, error, reload, replace };
}

/** Accounts money can be set aside from: everyday accounts and savings (not loans or cards). */
export function fundingAccountsQuery(db: Db) {
  return db
    .from("accounts")
    .select("id, name, emoji, kind")
    .is("archived_at", null)
    .in("kind", ["wallet", "bank", "cash", "savings"])
    .order("sort_order")
    .order("name");
}

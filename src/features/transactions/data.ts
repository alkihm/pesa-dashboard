// What Add transaction reads and writes. Accounts come from the accounts table, not account_balances, because
// matching a pasted SMS needs each account's sms_account_hint.

import { useCallback, useEffect, useState } from "react";

import { useCategories } from "../../lib/data/categories";
import { supabase, type Db } from "../../lib/supabase";
import type { TxInsert } from "./form";

export function accountsQuery(db: Db) {
  return db
    .from("accounts")
    .select("id, name, emoji, kind, sms_account_hint, archived_at")
    .is("archived_at", null)
    .order("sort_order")
    .order("name");
}

export function rulesQuery(db: Db) {
  return db.from("payee_rules").select("pattern, priority, category_id, transfer_account_id");
}

/** SMS the intake kept but could not turn into a transaction ("to review"), with no transaction made since. */
export function pendingSmsQuery(db: Db) {
  return db
    .from("sms_messages")
    .select("id, sender, body, received_at, transactions(id)")
    .eq("parse_status", "to_review")
    .is("transactions", null)
    .order("received_at", { ascending: false })
    .limit(10);
}

export type AccountOption = NonNullable<Awaited<ReturnType<typeof accountsQuery>>["data"]>[number];
export type PendingSms = NonNullable<Awaited<ReturnType<typeof pendingSmsQuery>>["data"]>[number];
type Rule = NonNullable<Awaited<ReturnType<typeof rulesQuery>>["data"]>[number];

export class DuplicateError extends Error {
  constructor() {
    super("This SMS is already in the ledger.");
  }
}

/**
 * Inserts the rows of one save in a single request, so a transfer's legs and a fee land together or not at all
 * (the database refuses a lone transfer leg). Rows differ in their fields, so a field one row leaves out must take
 * its column default, not null (needs_review is not null).
 */
export async function insertRows(db: Db, rows: TxInsert[]) {
  const { error } = await db.from("transactions").insert(rows, { defaultToNull: false });
  if (error?.code === "23505") throw new DuplicateError();
  if (error) throw new Error(error.message);
}

export function useAddTransactionData(db: () => Db = supabase) {
  const { categories } = useCategories(db);
  const [accounts, setAccounts] = useState<AccountOption[]>();
  const [rules, setRules] = useState<Rule[]>([]);
  const [pending, setPending] = useState<PendingSms[]>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void accountsQuery(db()).then(({ data }) => live && setAccounts(data ?? []));
    void rulesQuery(db()).then(({ data }) => live && setRules(data ?? []));
    return () => {
      live = false;
    };
  }, [db]);

  useEffect(() => {
    let live = true;
    void pendingSmsQuery(db()).then(({ data }) => live && setPending(data ?? []));
    return () => {
      live = false;
    };
  }, [db, version]);

  /** Fetches the unledgered SMS again, after one of them was saved. */
  const reloadPending = useCallback(() => setVersion((v) => v + 1), []);

  return { accounts, categories, rules, pending, reloadPending };
}

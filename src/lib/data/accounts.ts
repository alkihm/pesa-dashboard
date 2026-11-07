// The owner's accounts with their balances: the account_balances view (ledger balance, latest SMS or count, D-010
// net flags) plus the loan and card fields it leaves out. Shared by Accounts [2.3], Overview [2.2] and Add
// transaction's account tiles. Archived accounts are left out; totals come from src/lib/balances.ts.

import { useCallback, useEffect, useState } from "react";

import type { AccountBalance } from "../balances";
import { supabase, type Db } from "../supabase";
import { useLive } from "@/lib/live";

export function accountBalancesQuery(db: Db) {
  return db.from("account_balances").select("*").is("archived_at", null).order("sort_order").order("name");
}

export function accountTermsQuery(db: Db) {
  return db
    .from("accounts")
    .select("id, due_day, original_cents, limit_cents, sms_account_hint")
    .is("archived_at", null);
}

type Terms = NonNullable<Awaited<ReturnType<typeof accountTermsQuery>>["data"]>[number];

export type Account = AccountBalance & { account_id: string } & Omit<Terms, "id">;

const NO_TERMS = { due_day: null, original_cents: null, limit_cents: null, sms_account_hint: null };

export function useAccounts(db: () => Db = supabase) {
  const [result, setResult] = useState<{ accounts?: Account[]; error?: string }>();
  const [version, setVersion] = useState(0);
  const fresh = useLive(["accounts", "transactions", "sms_messages"]);

  useEffect(() => {
    let live = true;
    Promise.all([accountBalancesQuery(db()), accountTermsQuery(db())]).then(
      ([balances, terms]) => {
        if (!live) return;
        const error = balances.error ?? terms.error;
        if (error) return setResult({ error: error.message });
        const byId = new Map((terms.data ?? []).map(({ id, ...rest }) => [id, rest]));
        const accounts = (balances.data ?? [])
          .filter((a): a is AccountBalance & { account_id: string } => a.account_id != null)
          .map((a) => ({ ...a, ...(byId.get(a.account_id) ?? NO_TERMS) }));
        setResult({ accounts });
      },
      (e: unknown) => live && setResult({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [db, version, fresh]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { accounts: result?.accounts, error: result?.error, reload };
}

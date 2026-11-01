// Balance maths for the screens, on rows of the `account_balances` view: whether each account agrees with
// its latest SMS or count, and the totals on Home (net position D-010, savings R3, debt R2).

import type { Database } from "./database.types";

export type AccountBalance = Database["public"]["Views"]["account_balances"]["Row"];

/** `match`: the latest reading equals the ledger at that time. `mismatch`: it does not (R15, shown red).
 *  `no_reading`: nothing to compare against yet. */
export type ReconcileState = "match" | "mismatch" | "no_reading";

export function reconcileState(a: AccountBalance): ReconcileState {
  if (a.snapshot_at == null || a.difference_cents == null) return "no_reading";
  return a.difference_cents === 0 ? "match" : "mismatch";
}

export interface BalanceSummary {
  /** Wallets, bank and cash. */
  availableCents: number;
  savingsCents: number;
  /** What is owed, as positive numbers. An overpaid loan owes nothing. */
  shortDebtCents: number;
  longDebtCents: number;
  /** Sum of the accounts that count in net: available + savings − short-term debt by default (D-010). */
  netPositionCents: number;
  /** Ids of accounts whose latest reading disagrees with the ledger. */
  mismatched: string[];
}

const isDebt = (a: AccountBalance) => a.kind === "loan" || a.kind === "card";

export function summarise(rows: AccountBalance[]): BalanceSummary {
  const live = rows.filter((a) => a.archived_at == null);
  const sum = (list: AccountBalance[], f: (a: AccountBalance) => number) =>
    list.reduce((t, a) => t + f(a), 0);
  const balance = (a: AccountBalance) => a.balance_cents ?? 0;
  const owed = (a: AccountBalance) => Math.max(0, -balance(a));

  return {
    availableCents: sum(
      live.filter((a) => a.kind === "wallet" || a.kind === "bank" || a.kind === "cash"),
      balance,
    ),
    savingsCents: sum(
      live.filter((a) => a.kind === "savings"),
      balance,
    ),
    shortDebtCents: sum(
      live.filter((a) => isDebt(a) && a.debt_term === "short"),
      owed,
    ),
    longDebtCents: sum(
      live.filter((a) => isDebt(a) && a.debt_term === "long"),
      owed,
    ),
    netPositionCents: sum(
      live.filter((a) => a.counts_in_net),
      balance,
    ),
    mismatched: live.filter((a) => reconcileState(a) === "mismatch").map((a) => a.account_id!),
  };
}

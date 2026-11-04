// Reconcile ([4.1]): each account's ledger against its latest SMS or count (R15). The database works out the
// difference at the reading's time (account_balances.difference_cents = reading − ledger then); this turns it into
// the row, the explanation and the banner the Review screen shows. Plain functions, tested on their own.

import type { Tone } from "@/components/StatusPill";
import type { Account } from "@/lib/data/accounts";
import { reconcileState } from "@/lib/balances";
import { formatDay, nairobiToday } from "@/lib/due";
import { formatAmount } from "@/lib/money";

export type RowState = "match" | "mismatch" | "manual" | "no_sms";

export interface ReconcileRow {
  account: Account;
  state: RowState;
  pill: { tone: Tone; text: string };
  /** "64,200 · SMS 31 Oct", "Ledger 64,200 · SMS 61,700", "3,500 · counted 28 Oct". */
  detail: string;
  /** Mismatches only: which way the ledger is off, and the likely cause. */
  explanation?: string;
}

const day = (iso: string) => formatDay(nairobiToday(new Date(iso)));

export function reconcileRow(a: Account): ReconcileRow {
  const ledger = formatAmount(a.balance_cents ?? 0);
  const counted = a.snapshot_source === "manual";
  const source = counted ? "count" : "SMS";

  switch (reconcileState(a)) {
    case "match":
      return {
        account: a,
        state: "match",
        pill: { tone: "green", text: "✓ Match" },
        detail: counted
          ? `${ledger} · counted ${day(a.snapshot_at!)}`
          : `${ledger} · SMS ${day(a.snapshot_at!)}`,
      };
    case "mismatch": {
      const diff = a.difference_cents!;
      const by = formatAmount(Math.abs(diff));
      return {
        account: a,
        state: "mismatch",
        pill: { tone: "red", text: `⚠ ${formatAmount(diff, { signed: true })}` },
        detail: `Ledger ${ledger} · ${counted ? "Count" : "SMS"} ${formatAmount(a.snapshot_cents ?? 0)}`,
        explanation:
          diff < 0
            ? `${a.name}: ledger is ${by} higher than the ${source}. ${counted ? "Something may have been spent without being recorded." : "A payment may not have sent an SMS."}`
            : `${a.name}: ledger is ${by} lower than the ${source}. ${counted ? "Money may have come in without being recorded." : "Money may have come in without an SMS."}`,
      };
    }
    default:
      // Cash and other accounts no SMS reaches are counted by hand; until a count, there is nothing to compare.
      return a.sms_account_hint
        ? { account: a, state: "no_sms", pill: { tone: "grey", text: "No SMS yet" }, detail: ledger }
        : {
            account: a,
            state: "manual",
            pill: { tone: "grey", text: "Manual" },
            detail: `${ledger} · not counted yet`,
          };
  }
}

export interface Banner {
  tone: "red" | "green";
  title: string;
  text: string;
}

/** The banner at the top of Review: red while any account disagrees, green when every reading matches. */
export function banner(rows: ReconcileRow[]): Banner {
  const off = rows.filter((r) => r.state === "mismatch");
  if (off.length === 1) {
    const r = off[0]!;
    return {
      tone: "red",
      title: "Needs reconciling",
      text: `${r.account.name} is off by ${formatAmount(Math.abs(r.account.difference_cents!))} against its ${r.account.snapshot_source === "manual" ? "count" : "SMS balance"}.`,
    };
  }
  if (off.length > 1) {
    return {
      tone: "red",
      title: "Needs reconciling",
      text: `${off.length} accounts are off: ${off.map((r) => r.account.name).join(", ")}.`,
    };
  }
  const unread = rows.filter((r) => r.state === "no_sms" || r.state === "manual").length;
  return {
    tone: "green",
    title: "All balances match",
    text: unread
      ? `Every reading agrees with the ledger. ${unread} ${unread === 1 ? "account has" : "accounts have"} no reading yet.`
      : "Every account agrees with its latest SMS or count.",
  };
}

/** Every account in the owner's order, as on the board; the banner names the ones that are off. */
export const reconcileRows = (accounts: Account[]): ReconcileRow[] => accounts.map(reconcileRow);

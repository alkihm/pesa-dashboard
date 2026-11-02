// [2.9] New account: which fields each kind needs, the SMS sources an account can match, and the rows a save
// inserts (the account, and its opening balance). Pure, so it is unit-tested; the screen supplies the existing
// accounts.

import type { Database } from "../../../lib/database.types";
import { amountCents, type TxInsert } from "../../transactions/form";

export type Kind = "wallet" | "bank" | "cash" | "savings" | "loan" | "card";
export type DebtTerm = "short" | "long";

// Order, labels and placeholders as in the "New account" board.
export const KINDS: { value: Kind; label: string; emoji: string; example: string }[] = [
  { value: "wallet", label: "Mobile money", emoji: "📱", example: "e.g. M-PESA" },
  { value: "bank", label: "Bank", emoji: "🏦", example: "e.g. Bank current" },
  { value: "cash", label: "Cash", emoji: "💵", example: "e.g. Wallet" },
  { value: "card", label: "Card", emoji: "💳", example: "e.g. Credit card" },
  { value: "savings", label: "Savings", emoji: "🐷", example: "e.g. Money market fund" },
  { value: "loan", label: "Loan", emoji: "💸", example: "e.g. Tala" },
];

export const ICONS: { emoji: string; name: string }[] = [
  { emoji: "📲", name: "phone" },
  { emoji: "📱", name: "mobile" },
  { emoji: "🏦", name: "bank" },
  { emoji: "💵", name: "cash" },
  { emoji: "💳", name: "card" },
  { emoji: "🐷", name: "piggy bank" },
  { emoji: "🤝", name: "SACCO" },
  { emoji: "🚗", name: "car" },
];

export function isDebt(kind: Kind) {
  return kind === "loan" || kind === "card";
}

/**
 * An SMS source the intake can route to an account. `hint` is the exact `sms_account_hint` the intake looks for
 * (src/lib/intake/plan.ts accountKey), so choosing from this list can never miss. A free-text sender, as the board
 * sketches it, could name a sender the parser does not read and never match anything.
 */
export interface SmsSource {
  value: string;
  label: string;
  sender: string;
  /** The hint, or a function of the card's last four digits. */
  hint: string | ((last4: string) => string);
}

const SOURCES: Record<Kind, SmsSource[]> = {
  wallet: [
    { value: "mpesa", label: "M-PESA", sender: "MPESA", hint: "mpesa" },
    { value: "airtel-money", label: "Airtel Money", sender: "AIRTEL", hint: "airtel-money" },
  ],
  bank: [{ value: "kcb", label: "KCB account", sender: "KCB", hint: "kcb" }],
  card: [{ value: "kcb-card", label: "KCB card", sender: "KCB", hint: (last4) => `kcb card ${last4}` }],
  savings: [
    { value: "mshwari", label: "M-Shwari", sender: "MPESA", hint: "mshwari" },
    { value: "kcb-mpesa", label: "KCB M-PESA savings", sender: "MPESA", hint: "kcb-mpesa" },
  ],
  loan: [
    { value: "fuliza", label: "Fuliza", sender: "MPESA", hint: "fuliza" },
    { value: "kcb-mpesa-loan", label: "KCB M-PESA loan", sender: "MPESA", hint: "kcb-mpesa-loan" },
  ],
  // The intake files cash by account kind; there is nothing to match.
  cash: [],
};

export function smsSources(kind: Kind) {
  return SOURCES[kind];
}

export interface Form {
  kind: Kind;
  name: string;
  emoji: string;
  /** Current balance, or for debt the amount owed now, as typed. Saved as an opening balance. */
  balance: string;
  debtTerm: DebtTerm | null;
  /** Card limit (cards) or amount borrowed (loans), as typed. */
  limit: string;
  dueDay: string;
  /** Savings only: the goal, as typed, and the day the money unlocks ("2027-01-15"). */
  goal: string;
  lockedUntil: string;
  /** "" for no SMS matching. */
  source: string;
  last4: string;
  /** Undefined until the owner changes it: then the kind's default applies. */
  countsInNet?: boolean;
}

export function emptyForm(kind: Kind = "wallet"): Form {
  return {
    kind,
    name: "",
    emoji: KINDS.find((k) => k.value === kind)!.emoji,
    balance: "",
    debtTerm: kind === "card" ? "short" : kind === "loan" ? "long" : null,
    limit: "",
    dueDay: "",
    goal: "",
    lockedUntil: "",
    source: "",
    last4: "",
  };
}

/** A new kind keeps the name, the balance and a chosen icon, and resets what depends on the kind. */
export function withKind(form: Form, kind: Kind): Form {
  const fresh = emptyForm(kind);
  const iconWasDefault = KINDS.some((k) => k.emoji === form.emoji);
  return {
    ...fresh,
    name: form.name,
    balance: form.balance,
    emoji: iconWasDefault ? fresh.emoji : form.emoji,
  };
}

export function labels(kind: Kind) {
  return {
    balance: isDebt(kind) ? "Amount owed now" : "Current balance",
    limit: kind === "card" ? "Card limit" : "Amount borrowed",
  };
}

/** The database's default (D-010): money you hold and short-term debt count in net position. */
export function netDefault(kind: Kind, debtTerm: DebtTerm | null) {
  return (
    kind === "wallet" || kind === "bank" || kind === "cash" || kind === "savings" || debtTerm === "short"
  );
}

export function countsInNet(form: Form) {
  return form.countsInNet ?? netDefault(form.kind, form.debtTerm);
}

export function hintFor(form: Form): { hint: string; sender: string } | undefined {
  const source = smsSources(form.kind).find((s) => s.value === form.source);
  if (!source) return undefined;
  const hint = typeof source.hint === "string" ? source.hint : source.hint(form.last4.trim());
  return { hint, sender: source.sender };
}

export interface ExistingAccount {
  name: string;
  sms_account_hint: string | null;
  archived_at: string | null;
  sort_order: number;
}

/** What stops a save, or undefined when the form can be saved. */
export function problem(form: Form, existing: ExistingAccount[]): string | undefined {
  const name = form.name.trim();
  if (!name) return "Give the account a name.";
  const live = existing.filter((a) => !a.archived_at);
  if (live.some((a) => a.name.trim().toLowerCase() === name.toLowerCase())) {
    return `There is already an account called ${name}.`;
  }
  if (form.balance.trim() && !/^\d+(\.\d{1,2})?$/.test(form.balance.replace(/,/g, "").trim())) {
    return `${labels(form.kind).balance} must be an amount.`;
  }
  if (isDebt(form.kind)) {
    if (!form.debtTerm) return "Choose short-term or long-term.";
    if (form.limit.trim() && !amountCents(form.limit))
      return `${labels(form.kind).limit} must be above zero.`;
    if (form.dueDay.trim() && !/^([1-9]|[12]\d|3[01])$/.test(form.dueDay.trim())) {
      return "The due day is a day of the month, 1 to 31.";
    }
  }
  if (form.kind === "savings") {
    if (form.goal.trim() && !amountCents(form.goal)) return "The goal must be an amount above zero.";
    if (form.lockedUntil && !/^\d{4}-\d{2}-\d{2}$/.test(form.lockedUntil))
      return "Choose the day it unlocks.";
  }
  if (form.source === "kcb-card" && !/^\d{4}$/.test(form.last4.trim()))
    return "Enter the last four digits of the card.";
  const match = hintFor(form);
  const taken = match && live.find((a) => a.sms_account_hint?.trim().toLowerCase() === match.hint);
  // The intake sends a message to the first account with the hint; a second one would never receive anything.
  if (taken) return `${taken.name} already receives these SMS. Each SMS source can feed one account.`;
  return undefined;
}

export type AccountInsert = Database["public"]["Tables"]["accounts"]["Insert"];

export function buildAccount(form: Form, existing: ExistingAccount[]): AccountInsert {
  const debt = isDebt(form.kind);
  const savings = form.kind === "savings";
  const limit = debt && form.limit.trim() ? amountCents(form.limit)! : null;
  const match = hintFor(form);
  return {
    name: form.name.trim(),
    emoji: form.emoji || null,
    kind: form.kind,
    debt_term: debt ? form.debtTerm : null,
    counts_in_net: countsInNet(form),
    limit_cents: form.kind === "card" ? limit : null,
    original_cents: form.kind === "loan" ? limit : null,
    due_day: debt && form.dueDay.trim() ? Number(form.dueDay.trim()) : null,
    // The database allows these on savings accounts only (accounts_goal_for_savings).
    goal_cents: savings && form.goal.trim() ? amountCents(form.goal)! : null,
    locked_until: savings && form.lockedUntil ? form.lockedUntil : null,
    sms_account_hint: match?.hint ?? null,
    sms_sender: match?.sender ?? null,
    sort_order: Math.max(0, ...existing.map((a) => a.sort_order)) + 1,
  };
}

/** The opening balance as a transaction (D-007: balances are sums, never stored); debt is owed, so negative. */
export function buildOpening(form: Form, accountId: string, now = new Date()): TxInsert | undefined {
  const cents = amountCents(form.balance);
  if (!cents) return undefined;
  return {
    account_id: accountId,
    kind: "opening",
    amount_cents: isDebt(form.kind) ? -cents : cents,
    occurred_at: now.toISOString(),
    source: "manual",
  };
}

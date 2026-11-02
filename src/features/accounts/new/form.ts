// [2.9] New account: which fields each kind needs, the SMS sources an account can match, and the row a save
// inserts. Pure, so it is unit-tested; the screen supplies the existing accounts.

import type { Database } from "../../../lib/database.types";
import { amountCents } from "../../transactions/form";

export type Kind = "wallet" | "bank" | "cash" | "savings" | "loan" | "card";
export type DebtTerm = "short" | "long";

export const KINDS: { value: Kind; label: string; emoji: string }[] = [
  { value: "wallet", label: "Wallet", emoji: "📱" },
  { value: "bank", label: "Bank", emoji: "🏦" },
  { value: "cash", label: "Cash", emoji: "💵" },
  { value: "savings", label: "Savings", emoji: "🐷" },
  { value: "loan", label: "Loan", emoji: "💸" },
  { value: "card", label: "Card", emoji: "💳" },
];

export function isDebt(kind: Kind) {
  return kind === "loan" || kind === "card";
}

/**
 * An SMS source the intake can route to an account. `hint` is the exact `sms_account_hint` the intake looks for
 * (src/lib/intake/plan.ts accountKey), so choosing from this list can never miss.
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
  debtTerm: DebtTerm | null;
  /** Credit limit (card, short loans like Fuliza), as typed. */
  limit: string;
  /** Amount borrowed (long loans), as typed. */
  borrowed: string;
  dueDay: string;
  /** "" for no SMS matching. */
  source: string;
  last4: string;
  /** Undefined until the owner flips the switch: then the kind's default applies. */
  countsInNet?: boolean;
}

export function emptyForm(kind: Kind = "wallet"): Form {
  return {
    kind,
    name: "",
    emoji: KINDS.find((k) => k.value === kind)!.emoji,
    debtTerm: kind === "card" ? "short" : kind === "loan" ? "long" : null,
    limit: "",
    borrowed: "",
    dueDay: "",
    source: "",
    last4: "",
  };
}

/** A new kind keeps the name and resets what depends on the kind. */
export function withKind(form: Form, kind: Kind): Form {
  const fresh = emptyForm(kind);
  const emojiWasDefault = KINDS.some((k) => k.emoji === form.emoji);
  return { ...fresh, name: form.name, emoji: emojiWasDefault ? fresh.emoji : form.emoji };
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
  return {
    hint: typeof source.hint === "string" ? source.hint : source.hint(form.last4),
    sender: source.sender,
  };
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
  if (live.some((a) => a.name.trim().toLowerCase() === name.toLowerCase()))
    return `There is already an account called ${name}.`;
  if (isDebt(form.kind) && !form.debtTerm) return "Choose whether the debt is short or long term.";
  if (form.limit.trim() && !amountCents(form.limit)) return "The limit must be an amount above zero.";
  if (form.borrowed.trim() && !amountCents(form.borrowed)) return "The amount borrowed must be above zero.";
  if (form.dueDay.trim() && !/^([1-9]|[12]\d|3[01])$/.test(form.dueDay.trim()))
    return "The due day is a day of the month, 1 to 31.";
  if (form.source === "kcb-card" && !/^\d{4}$/.test(form.last4.trim()))
    return "Enter the last four digits of the card.";
  const match = hintFor(form);
  const taken = match && live.find((a) => a.sms_account_hint?.trim().toLowerCase() === match.hint);
  // The intake sends a message to the first account with the hint; a second one would never receive anything.
  if (taken) return `${taken.name} already receives these SMS. Each SMS source can feed one account.`;
  return undefined;
}

export type AccountInsert = Database["public"]["Tables"]["accounts"]["Insert"];

export function buildRow(form: Form, existing: ExistingAccount[]): AccountInsert {
  const debt = isDebt(form.kind);
  const match = hintFor({ ...form, last4: form.last4.trim() });
  return {
    name: form.name.trim(),
    emoji: form.emoji.trim() || null,
    kind: form.kind,
    debt_term: debt ? form.debtTerm : null,
    counts_in_net: countsInNet(form),
    limit_cents: debt && form.limit.trim() ? amountCents(form.limit)! : null,
    original_cents: debt && form.borrowed.trim() ? amountCents(form.borrowed)! : null,
    due_day: debt && form.dueDay.trim() ? Number(form.dueDay.trim()) : null,
    sms_account_hint: match?.hint ?? null,
    sms_sender: match?.sender ?? null,
    sort_order: Math.max(0, ...existing.map((a) => a.sort_order)) + 1,
  };
}

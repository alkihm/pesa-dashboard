// Turns a parsed SMS into the rows the database function `ingest_sms` writes: matches accounts, applies payee
// rules, links fees to their payment. Pure, so it is unit-tested; the intake function supplies the lookups.

import type { AccountRef, SmsParse } from "../sms/index.ts";

export interface AccountRow {
  id: string;
  kind: string;
  sms_account_hint: string | null;
  archived_at: string | null;
}

export interface RuleRow {
  pattern: string;
  priority: number;
  category_id: string | null;
  transfer_account_id: string | null;
}

export interface CategoryRow {
  id: string;
  name: string;
  kind: string;
  system: boolean;
}

export interface Lookups {
  accounts: AccountRow[];
  rules: RuleRow[];
  categories: CategoryRow[];
}

export interface PlannedRow {
  key: string;
  account_id: string;
  amount_cents: number;
  kind: "spending" | "income" | "transfer";
  category_id: string | null;
  /** Legs of one transfer within this message share it; the database gives each group a uuid. */
  transfer_group: string | null;
  /** A transfer to an account named by a payee rule: the other leg is claimed from an earlier message or
   *  created, flagged for review, until the other side's SMS arrives. */
  peer_account_id: string | null;
  parent_key: string | null;
  payee: string | null;
  channel: string;
  ref: string | null;
  dedupe_key: string;
  occurred_at: string;
  needs_review: boolean;
  original_currency: string | null;
  original_minor: number | null;
}

export interface PlannedSnapshot {
  account_id: string;
  balance_cents: number;
  as_of: string;
}

export interface Plan {
  status: "parsed" | "ignored" | "to_review";
  error: string | null;
  rows: PlannedRow[];
  snapshots: PlannedSnapshot[];
}

/** The value an account's `sms_account_hint` holds to receive this parser account: `mpesa`, `fuliza`, `kcb`… */
export function accountKey(ref: AccountRef): string {
  return (ref.hint ?? ref.product).toLowerCase();
}

export function findAccount(ref: AccountRef, accounts: AccountRow[]): AccountRow | undefined {
  const live = accounts.filter((a) => !a.archived_at);
  const key = accountKey(ref);
  return (
    live.find((a) => a.sms_account_hint?.trim().toLowerCase() === key) ??
    (ref.product === "cash" ? live.find((a) => a.kind === "cash") : undefined)
  );
}

/** First rule (lowest priority number) whose pattern appears in the text, ignoring case. */
export function matchRule(text: string, rules: RuleRow[]): RuleRow | undefined {
  const t = text.toUpperCase();
  return [...rules]
    .sort((a, b) => a.priority - b.priority)
    .find((r) => r.pattern.trim() && t.includes(r.pattern.trim().toUpperCase()));
}

const nothing = (status: Plan["status"], error: string | null): Plan => ({
  status,
  error,
  rows: [],
  snapshots: [],
});

export function planIngest(parse: SmsParse, { accounts, rules, categories }: Lookups): Plan {
  if (parse.status === "ignored") return nothing("ignored", parse.reason);
  if (parse.status === "to_review") return nothing("to_review", parse.reason);

  const refs = [...parse.entries.map((e) => e.account), ...parse.balances.map((b) => b.account)];
  const missing = refs.find((r) => !findAccount(r, accounts));
  if (missing) return nothing("to_review", `no account has sms_account_hint "${accountKey(missing)}"`);

  const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
  const feeCategory = categories.find((c) => c.system && c.name.trim().toLowerCase() === "transaction fees");
  const hasMain = parse.entries.some((e) => e.key === "main");

  const rows = parse.entries.map((e): PlannedRow => {
    const account = findAccount(e.account, accounts)!;
    const row: PlannedRow = {
      key: e.key,
      account_id: account.id,
      amount_cents: e.amountCents,
      kind: e.kind,
      category_id: null,
      transfer_group: e.transferGroup ?? null,
      peer_account_id: null,
      parent_key: e.channel === "fee" && hasMain && e.key !== "main" ? "main" : null,
      payee: e.payee ?? null,
      channel: e.channel,
      ref: parse.ref ?? null,
      dedupe_key: e.dedupeKey,
      occurred_at: parse.occurredAt.toISOString(),
      needs_review: parse.needsReview,
      original_currency: e.originalCurrency ?? null,
      original_minor: e.originalMinor ?? null,
    };
    if (e.kind === "transfer") return row;

    // Fees never go through payee rules: their payee is the merchant, not what the money was for.
    if (e.channel === "fee") {
      if (feeCategory) row.category_id = feeCategory.id;
      else row.needs_review = true;
      return row;
    }

    const rule = matchRule([e.payee, e.payeeAccount].filter(Boolean).join(" "), rules);
    if (rule?.transfer_account_id && rule.transfer_account_id !== account.id) {
      return {
        ...row,
        kind: "transfer",
        peer_account_id: rule.transfer_account_id,
        transfer_group: `peer:${e.key}`,
      };
    }
    if (rule?.category_id && kindOf.get(rule.category_id) === e.kind) row.category_id = rule.category_id;
    else row.needs_review = true;
    return row;
  });

  const snapshots = parse.balances.map((b) => ({
    account_id: findAccount(b.account, accounts)!.id,
    balance_cents: b.cents,
    as_of: parse.occurredAt.toISOString(),
  }));

  return { status: "parsed", error: null, rows, snapshots };
}

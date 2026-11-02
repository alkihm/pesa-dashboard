// [2.7] Add transaction: the form's state, filling it from a pasted SMS, and the rows a save inserts. Pure, so it is
// unit-tested; the screen supplies accounts, categories and rules.

import type { Database } from "../../lib/database.types";
import {
  planIngest,
  type AccountRow,
  type CategoryRow,
  type PlannedRow,
  type RuleRow,
} from "../../lib/intake/plan";
import { parseSms } from "../../lib/sms";

export type Direction = "out" | "in" | "transfer";

export interface Form {
  direction: Direction;
  /** As typed: "2,500" or "2500.50". */
  amount: string;
  accountId: string | null;
  /** Transfers only: where the money went. */
  toAccountId: string | null;
  categoryId: string | null;
  payee: string;
  /** Nairobi day, "2026-11-02". */
  date: string;
  note: string;
  /** Set when the form was filled from an SMS. */
  sms?: FromSms;
}

export interface FromSms {
  /** The stored message, when it came from "Not yet in the ledger". */
  smsId?: string;
  /** The SMS's own time, used when the date is left as filled. */
  occurredAt: string;
  ref: string | null;
  /** The intake's key for the payment (the outgoing leg of a transfer): saving an SMS twice is refused. */
  dedupeKey: string | null;
  /** Transfers: the incoming leg's key. */
  inKey?: string | null;
  originalCurrency: string | null;
  originalMinor: number | null;
  /** Fee rows the SMS also carried, saved with the payment (D-009 rule 4). */
  fees: PlannedRow[];
}

export type TxInsert = Database["public"]["Tables"]["transactions"]["Insert"];

const NAIROBI_MS = 3 * 3_600_000; // Africa/Nairobi has no daylight saving

export function nairobiDate(at: Date) {
  return new Date(at.getTime() + NAIROBI_MS).toISOString().slice(0, 10);
}

export function emptyForm(now = new Date(), direction: Direction = "out"): Form {
  return {
    direction,
    amount: "",
    accountId: null,
    toAccountId: null,
    categoryId: null,
    payee: "",
    date: nairobiDate(now),
    note: "",
  };
}

/** "2,500" → 250000 cents; anything that is not a positive amount → undefined. */
export function amountCents(text: string) {
  const clean = text.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return undefined;
  const cents = Math.round(Number(clean) * 100);
  return cents > 0 ? cents : undefined;
}

export function formatTyped(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** What stops a save, or undefined when the form can be saved. */
export function problem(form: Form): string | undefined {
  if (!amountCents(form.amount)) return "Enter an amount above zero.";
  if (!form.accountId)
    return form.direction === "in" ? "Choose the account it came into." : "Choose the account it left.";
  if (form.direction === "transfer") {
    if (!form.toAccountId) return "Choose the account it went to.";
    if (form.toAccountId === form.accountId) return "A transfer needs two different accounts.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return "Choose a date.";
  return undefined;
}

export interface Lookups {
  accounts: AccountRow[];
  categories: CategoryRow[];
  rules: RuleRow[];
}

export type Fill = { ok: true; form: Form } | { ok: false; reason: string; form?: Form };

/**
 * Reads an SMS with the same parser and rules as the intake and fills the form from its payment. Partly readable
 * messages ("to review") still fill the amount and date.
 */
export function fillFromSms(
  body: string,
  lookups: Lookups,
  { sender = "", smsId, now = new Date() }: { sender?: string; smsId?: string; now?: Date } = {},
): Fill {
  const parse = parseSms({ sender, body, receivedAt: now });
  if (parse.status === "ignored") return { ok: false, reason: `Not a payment message (${parse.reason}).` };

  if (parse.status === "to_review") {
    const form: Form = {
      ...emptyForm(now),
      amount: parse.amountCents ? formatTyped(Math.abs(parse.amountCents)) : "",
      date: nairobiDate(parse.occurredAt),
      sms: smsOnly(parse.occurredAt, parse.ref ?? null, smsId),
    };
    return { ok: false, reason: `Only partly read: ${parse.reason}. Check the details.`, form };
  }

  const plan = planIngest(parse, lookups);
  if (plan.status !== "parsed") {
    const main = parse.entries.find((e) => e.key === "main") ?? parse.entries[0];
    const form: Form = {
      ...emptyForm(now),
      amount: main ? formatTyped(Math.abs(main.amountCents)) : "",
      payee: main?.payee ?? "",
      date: nairobiDate(parse.occurredAt),
      sms: smsOnly(parse.occurredAt, parse.ref ?? null, smsId),
    };
    return {
      ok: false,
      reason: `Read, but ${plan.error ?? "no account matched"}. Choose the account.`,
      form,
    };
  }

  const fees = plan.rows.filter((r) => r.channel === "fee" && r.key !== "main");
  const rest = plan.rows.filter((r) => !fees.includes(r));
  const transferLegs = rest.filter((r) => r.kind === "transfer" && r.transfer_group && !r.peer_account_id);
  const main = rest.find((r) => r.key === "main") ?? rest[0];
  if (!main) return { ok: false, reason: "The message has no payment in it." };

  const sms: FromSms = {
    smsId,
    occurredAt: main.occurred_at,
    ref: main.ref,
    dedupeKey: main.dedupe_key,
    originalCurrency: main.original_currency,
    originalMinor: main.original_minor,
    fees,
  };
  const base = { ...emptyForm(now), date: nairobiDate(new Date(main.occurred_at)), sms };

  if (transferLegs.length === 2) {
    const from = transferLegs.find((r) => r.amount_cents < 0)!;
    const to = transferLegs.find((r) => r.amount_cents > 0)!;
    return {
      ok: true,
      form: {
        ...base,
        direction: "transfer",
        amount: formatTyped(to.amount_cents),
        accountId: from.account_id,
        toAccountId: to.account_id,
        sms: { ...sms, dedupeKey: from.dedupe_key, inKey: to.dedupe_key },
      },
    };
  }
  if (main.peer_account_id) {
    // A payee rule says this payee is one of the owner's accounts: a transfer to it. The other leg gets the key
    // the database gives a rule-made leg.
    const out = main.amount_cents < 0;
    const peer = `${main.dedupe_key}:peer`;
    return {
      ok: true,
      form: {
        ...base,
        direction: "transfer",
        amount: formatTyped(Math.abs(main.amount_cents)),
        accountId: out ? main.account_id : main.peer_account_id,
        toAccountId: out ? main.peer_account_id : main.account_id,
        payee: main.payee ?? "",
        sms: { ...sms, dedupeKey: out ? main.dedupe_key : peer, inKey: out ? peer : main.dedupe_key },
      },
    };
  }
  return {
    ok: true,
    form: {
      ...base,
      direction: main.amount_cents < 0 ? "out" : "in",
      amount: formatTyped(Math.abs(main.amount_cents)),
      accountId: main.account_id,
      categoryId: main.category_id,
      payee: main.payee ?? "",
    },
  };
}

function smsOnly(at: Date, ref: string | null, smsId?: string): FromSms {
  return {
    smsId,
    occurredAt: at.toISOString(),
    ref,
    dedupeKey: null,
    originalCurrency: null,
    originalMinor: null,
    fees: [],
  };
}

/** The time to store: the SMS's own time while its day is kept, now for today, else midday on the chosen day. */
export function occurredAt(form: Form, now = new Date()) {
  if (form.sms && nairobiDate(new Date(form.sms.occurredAt)) === form.date) return form.sms.occurredAt;
  if (form.date === nairobiDate(now)) return now.toISOString();
  return new Date(`${form.date}T12:00:00+03:00`).toISOString();
}

/** The rows one save inserts, all marked `manual`. `newId` is injectable so tests get stable ids. */
export function buildRows(
  form: Form,
  now = new Date(),
  newId: () => string = () => crypto.randomUUID(),
): TxInsert[] {
  const cents = amountCents(form.amount)!;
  const at = occurredAt(form, now);
  const sms = form.sms;
  const note = form.note.trim() || null;
  const payee = form.payee.trim() || null;
  const common = {
    occurred_at: at,
    source: "manual",
    sms_id: sms?.smsId ?? null,
    ref: sms?.ref ?? null,
    note,
  };
  const mainId = newId();

  if (form.direction === "transfer") {
    const transfer = { ...common, kind: "transfer", transfer_id: newId(), payee };
    return [
      {
        ...transfer,
        id: mainId,
        account_id: form.accountId!,
        amount_cents: -cents,
        dedupe_key: sms?.dedupeKey ?? null,
      },
      {
        ...transfer,
        id: newId(),
        account_id: form.toAccountId!,
        amount_cents: cents,
        dedupe_key: sms?.inKey ?? null,
      },
      ...feeRows(form, mainId, at),
    ];
  }

  const out = form.direction === "out";
  return [
    {
      ...common,
      id: mainId,
      kind: out ? "spending" : "income",
      account_id: form.accountId!,
      amount_cents: out ? -cents : cents,
      category_id: form.categoryId,
      // Without a category the row waits in Review, like an SMS no rule matched.
      needs_review: !form.categoryId,
      payee,
      dedupe_key: sms?.dedupeKey ?? null,
      original_currency: sms?.originalCurrency ?? null,
      original_minor: sms?.originalMinor ?? null,
    },
    ...feeRows(form, mainId, at),
  ];
}

function feeRows(form: Form, parentId: string, at: string): TxInsert[] {
  return (form.sms?.fees ?? []).map((f) => ({
    occurred_at: at,
    source: "manual",
    sms_id: form.sms?.smsId ?? null,
    ref: f.ref,
    kind: "spending",
    account_id: f.account_id,
    amount_cents: f.amount_cents,
    category_id: f.category_id,
    needs_review: f.needs_review,
    payee: f.payee,
    channel: "fee",
    parent_id: parentId,
    dedupe_key: f.dedupe_key,
  }));
}

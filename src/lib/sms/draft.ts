// What each per-source parser returns. `parse.ts` fills in times and dedupe keys.

import type { AccountRef, BalanceReading, Channel, ParsedEntry } from "./types.ts";

export type DraftEntry = Omit<ParsedEntry, "dedupeKey">;

export type Draft =
  | {
      status: "parsed";
      ref?: string;
      /** Undefined → the time the phone received it. */
      occurredAt?: Date;
      entries: DraftEntry[];
      balances: BalanceReading[];
      needsReview?: boolean;
    }
  | { status: "to_review"; reason: string; ref?: string; occurredAt?: Date; amountCents?: number }
  | { status: "ignored"; reason: string };

export const ignored = (reason: string): Draft => ({ status: "ignored", reason });

export function review(reason: string, extra: { ref?: string; amountCents?: number } = {}): Draft {
  return { status: "to_review", reason, ...extra };
}

/** Money leaving `account` for a payee. */
export function spend(
  account: AccountRef,
  cents: number,
  channel: Channel,
  extra: Partial<DraftEntry> = {},
): DraftEntry {
  return { account, kind: "spending", amountCents: -cents, key: "main", channel, ...extra };
}

/** Money arriving in `account` from a payer. */
export function receive(
  account: AccountRef,
  cents: number,
  channel: Channel,
  extra: Partial<DraftEntry> = {},
): DraftEntry {
  return { account, kind: "income", amountCents: cents, key: "main", channel, ...extra };
}

/** A fee charged to `account`, as its own spending row (D-009 rule 4). */
export function fee(account: AccountRef, cents: number, payee?: string, key = "fee"): DraftEntry {
  return { account, kind: "spending", amountCents: -cents, key, channel: "fee", payee };
}

/** Both legs of a move between two of the owner's accounts (D-009 rule 3). */
export function transfer(
  from: AccountRef,
  to: AccountRef,
  cents: number,
  channel: Channel,
  group = "main",
): DraftEntry[] {
  return [
    {
      account: from,
      kind: "transfer",
      amountCents: -cents,
      key: `${group}-out`,
      channel,
      transferGroup: group,
    },
    { account: to, kind: "transfer", amountCents: cents, key: `${group}-in`, channel, transferGroup: group },
  ];
}

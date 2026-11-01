// What the SMS parser hands to the intake. It reports only what the message says: no categories (those come
// from payee rules) and no database ids (the intake matches `AccountRef` to an account).

export interface SmsInput {
  sender: string;
  body: string;
  receivedAt: Date;
}

/** Which kind of account a message is about. `hint` narrows it: a card suffix, a bank name. */
export interface AccountRef {
  product: "mpesa" | "fuliza" | "mshwari" | "kcb-mpesa" | "kcb-mpesa-loan" | "airtel-money" | "bank" | "cash";
  hint?: string;
}

export type Channel =
  | "till"
  | "paybill"
  | "send"
  | "receive"
  | "withdrawal"
  | "deposit"
  | "airtime"
  | "card"
  | "transfer"
  | "loan"
  | "reversal"
  | "fee";

export interface ParsedEntry {
  account: AccountRef;
  kind: "spending" | "income" | "transfer";
  /** Signed effect on `account`, in cents (D-007, D-009). */
  amountCents: number;
  /** Unique within the message: `main`, `fee`, `out`, `in`, `fuliza-fee`… */
  key: string;
  /** `source:ref:key`, or time and amount when the message has no reference code. */
  dedupeKey: string;
  /** The legs of one transfer share this. */
  transferGroup?: string;
  payee?: string;
  /** The "for account …" part of a paybill payment. */
  payeeAccount?: string;
  channel: Channel;
  originalCurrency?: string;
  originalMinor?: number;
}

export interface BalanceReading {
  account: AccountRef;
  cents: number;
}

export type Source = "mpesa" | "bank" | "airtel";

export type SmsParse =
  | {
      status: "parsed";
      source: Source;
      ref?: string;
      occurredAt: Date;
      entries: ParsedEntry[];
      balances: BalanceReading[];
      needsReview: boolean;
    }
  | {
      status: "to_review";
      source?: Source;
      reason: string;
      ref?: string;
      occurredAt: Date;
      amountCents?: number;
    }
  | { status: "ignored"; reason: string };

export interface ParseOptions {
  /** KES per unit of a foreign currency, for card purchases abroad. Missing rate → `to_review`. */
  fxToKes?: Record<string, number>;
}

// Airtel Money. The wording here follows published examples and has not yet been checked against a message
// received by the owner; anything that does not match goes to review.

import { fee, ignored, receive, review, spend, transfer, type Draft, type DraftEntry } from "./draft.ts";
import { AMT, cleanPayee, pick, pickCents, smsTime, toCents } from "./text.ts";
import type { AccountRef, BalanceReading } from "./types.ts";

const AIRTEL: AccountRef = { product: "airtel-money" };
const CASH: AccountRef = { product: "cash" };
const KSH = String.raw`(?:Ksh|KES)\.?\s?`;
// Tagged so backslashes stay literal: re`\d+ ${AMT}` builds /\d+ …/i.
const re = (s: TemplateStringsArray, ...v: string[]) => new RegExp(String.raw(s, ...v), "i");

export function parseAirtel(t: string): Draft {
  const ref = pick(/\b(?:TID|Trans(?:action)?\.? ?ID)[:.\s]*([A-Z0-9][A-Z0-9.]*[A-Z0-9])/i, t);
  const left = pickCents(re`balance is ${KSH}${AMT}`, t);
  const balances: BalanceReading[] = left === undefined ? [] : [{ account: AIRTEL, cents: left }];
  const cost = pickCents(re`(?:charge|fee|cost)s?(?: is| of)?:? ${KSH}${AMT}`, t) ?? 0;
  const parsed = (entries: DraftEntry[]): Draft => ({
    status: "parsed",
    ref,
    occurredAt: smsTime(t),
    entries,
    balances,
  });
  const withFee = (main: DraftEntry) => parsed(cost > 0 ? [main, fee(AIRTEL, cost, main.payee)] : [main]);
  const upTo = String.raw`(.+?)(?:,|\.\s| on \d| at \d|\.$)`;
  let m: RegExpExecArray | null;

  if (/\bfailed\b/i.test(t)) return ignored("failed transaction");

  if ((m = re`received ${KSH}${AMT} from ${upTo}`.exec(t))) {
    return parsed([receive(AIRTEL, toCents(m[1])!, "receive", { payee: cleanPayee(m[2]) })]);
  }
  if ((m = re`withdrawn? ${KSH}${AMT}`.exec(t))) {
    const legs = transfer(AIRTEL, CASH, toCents(m[1])!, "withdrawal");
    return parsed(cost > 0 ? [...legs, fee(AIRTEL, cost, "Withdrawal")] : legs);
  }
  if ((m = re`paid ${KSH}${AMT} to ${upTo}`.exec(t))) {
    return withFee(spend(AIRTEL, toCents(m[1])!, "till", { payee: cleanPayee(m[2]) }));
  }
  if ((m = re`(?:sent|transferred) ${KSH}${AMT} to ${upTo}`.exec(t))) {
    return withFee(spend(AIRTEL, toCents(m[1])!, "send", { payee: cleanPayee(m[2]) }));
  }

  const amount = pickCents(re`${KSH}${AMT}`, t);
  return amount && ref
    ? review("unrecognised Airtel Money wording", { ref, amountCents: amount })
    : ignored("not a transaction");
}

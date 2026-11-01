// Bank notices: card purchases, credits, and sends from the bank account to M-PESA. Written against KCB's
// wording; other banks can add branches here.

import { fee, ignored, receive, review, spend, transfer, type Draft, type DraftEntry } from "./draft.ts";
import { AMT, cleanPayee, pick, pickCents, smsTime, toCents } from "./text.ts";
import type { AccountRef, BalanceReading, ParseOptions } from "./types.ts";

const CASH: AccountRef = { product: "cash" };
const KES = String.raw`(?:KES|KSH)\.?\s?`;
// Tagged so backslashes stay literal: re`\d+ ${AMT}` builds /\d+ …/i.
const re = (s: TemplateStringsArray, ...v: string[]) => new RegExp(String.raw(s, ...v), "i");

export function parseBank(t: string, bankName: string, opts: ParseOptions): Draft {
  const bank: AccountRef = { product: "bank", hint: bankName };
  const available = pickCents(re`Avail(?:able)? balance (?:is )?${KES}${AMT}`, t);
  const balances: BalanceReading[] = available === undefined ? [] : [{ account: bank, cents: available }];
  const parsed = (entries: DraftEntry[], ref?: string, extra: { needsReview?: boolean } = {}): Draft => ({
    status: "parsed",
    ref,
    occurredAt: smsTime(t),
    entries,
    balances,
    ...extra,
  });
  let m: RegExpExecArray | null;

  // Notices that repeat something another message records, or that are not money moving.
  if (/declined/i.test(t)) return ignored("declined card attempt");
  if (/You have initiated|has initiated|MOBI LOAN request/i.test(t))
    return ignored("request, not a completed payment");
  if (/^\w{10} completed\.\s*KES\s?[\d,.]+ sent to M-PESA \d/i.test(t))
    return ignored("number-only copy of a named send notice");
  if (/LOAN REPAYMENT request of/i.test(t) && /KCB M-?PESA/i.test(t))
    return ignored("copy of an M-PESA loan repayment");
  if (/has transferred KES/i.test(t)) return ignored("copy of an M-PESA receipt");

  // Card purchase, possibly abroad: "USD 12.00 transaction made on KCB card 1234***5678 at SHOP on 23/01/2026 15:32".
  if ((m = re`^([A-Z]{3})\s?${AMT} transaction made on \w+ card (\S+) at (.+?) on \d\d/\d\d/\d{4}`.exec(t))) {
    const currency = m[1]!.toUpperCase() === "KSH" ? "KES" : m[1]!.toUpperCase();
    const minor = toCents(m[2])!;
    const card: AccountRef = { product: "bank", hint: `${bankName} card ${m[3]!.slice(-4)}` };
    const shop = cleanPayee(m[4]);
    const cardBalances = available === undefined ? [] : [{ account: card, cents: available }];
    let cents = minor;
    if (currency !== "KES") {
      const rate = opts.fxToKes?.[currency];
      if (!rate) return review(`no exchange rate for ${currency}`);
      cents = Math.round(minor * rate);
    }
    if (/^ATM\b/i.test(shop ?? "")) {
      const legs = transfer(card, CASH, cents, "withdrawal");
      legs[0]!.payee = shop;
      return { status: "parsed", occurredAt: smsTime(t), entries: legs, balances: cardBalances };
    }
    const foreign = currency === "KES" ? {} : { originalCurrency: currency, originalMinor: minor };
    return {
      status: "parsed",
      occurredAt: smsTime(t),
      entries: [spend(card, cents, "card", { payee: shop, ...foreign })],
      balances: cardBalances,
      needsReview: currency !== "KES",
    };
  }

  // Send from the bank account to an M-PESA number, named form. A send to the owner's own number becomes a
  // transfer through payee rules in the intake.
  if (
    (m = re`SEND TO M-PESA request of ${KES}${AMT} from .*? to \S+ - (.+?) at `.exec(t)) ||
    (m = re`successfully transferred ${KES}${AMT} to \S+?-(.+?) on `.exec(t))
  ) {
    const cents = toCents(m[1])!;
    const ref = pick(/M-PESA REF:?\s?(\w{10})/i, t) ?? pick(/Transaction Ref No (\w+)/i, t);
    const main = spend(bank, cents, "send", { payee: cleanPayee(m[2]) });
    const cost = pickCents(re`Transaction cost ${KES}${AMT}`, t) ?? 0;
    return parsed(cost > 0 ? [main, fee(bank, cost, main.payee)] : [main], ref);
  }

  if ((m = re`successfully transferred ${KES}${AMT} from \d+ to card no\.? ?(\S+)`.exec(t))) {
    const card: AccountRef = {
      product: "bank",
      hint: `${bankName} card ${m[2]!.replace(/\W+$/, "").slice(-4)}`,
    };
    return parsed(transfer(bank, card, toCents(m[1])!, "transfer"), pick(/reference number (\w+)/i, t));
  }

  if ((m = re`^(\w{10}) Completed.*?${KES}${AMT} paid to (.+?) for`.exec(t))) {
    const main = spend(bank, toCents(m[2])!, "till", { payee: cleanPayee(m[3]) });
    const cost = pickCents(re`Transaction cost ${KES}${AMT}`, t) ?? 0;
    return parsed(cost > 0 ? [main, fee(bank, cost, main.payee)] : [main], m[1]);
  }

  // Money in. Paid in from M-PESA (it quotes the M-PESA code), from a person, or a plain credit.
  if (/has been received on/i.test(t) && /M-PESA [Rr]ef/i.test(t)) {
    const cents = pickCents(re`${KES}${AMT}`, t);
    if (cents)
      return parsed(
        [receive(bank, cents, "deposit", { payee: "M-PESA" })],
        pick(/M-PESA [Rr]ef:?\s?(\w{10})/, t),
      );
  }
  if ((m = re`You have received ${KES}${AMT} from (.+?)\.`.exec(t))) {
    return parsed(
      [receive(bank, toCents(m[1])!, "receive", { payee: cleanPayee(m[2]) })],
      pick(/Ref:? (\w{10})/, t),
    );
  }
  if ((m = re`card payment of ${KES}${AMT}`.exec(t))) {
    // Ambiguous in the old ledger (salary, or a load from the bank account) — always reviewed.
    return parsed([receive(bank, toCents(m[1])!, "deposit", { payee: "Card payment" })], undefined, {
      needsReview: true,
    });
  }
  if (!/loan/i.test(t) && (m = re`credited (?:with |by )?${KES}${AMT}`.exec(t))) {
    return parsed(
      [receive(bank, toCents(m[1])!, "deposit", { payee: "Deposit" })],
      pick(/Ref:? ?(\w{6,})/i, t),
    );
  }

  const amount = pickCents(re`${KES}${AMT}`, t);
  return amount
    ? review(`unrecognised ${bankName} wording`, { amountCents: amount })
    : ignored("not a transaction");
}

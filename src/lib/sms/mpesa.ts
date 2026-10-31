// M-PESA confirmations, including Fuliza, M-Shwari and KCB M-PESA notices sent by M-PESA.

import { fee, ignored, receive, review, spend, transfer, type Draft, type DraftEntry } from "./draft.ts";
import { AMT, cleanPayee, pick, pickCents, smsTime } from "./text.ts";
import type { AccountRef, BalanceReading } from "./types.ts";

const MPESA: AccountRef = { product: "mpesa" };
const FULIZA: AccountRef = { product: "fuliza" };
const MSHWARI: AccountRef = { product: "mshwari" };
const KCB_MPESA: AccountRef = { product: "kcb-mpesa" }; // the savings side
const KCB_MPESA_LOAN: AccountRef = { product: "kcb-mpesa-loan" };
const CASH: AccountRef = { product: "cash" };

const KSH = String.raw`Ksh\.?\s*`;
// Tagged so backslashes stay literal: re`\d+ ${AMT}` builds /\d+ …/i.
const re = (s: TemplateStringsArray, ...v: string[]) => new RegExp(String.raw(s, ...v), "i");

export function parseMpesa(t: string): Draft {
  const ref = pick(/^([A-Z0-9]{10})\s+Confirmed/i, t) ?? pick(/^([A-Z0-9]{10})\b/, t);
  const cost = pickCents(re`Transaction cost,?\s*${KSH}${AMT}`, t) ?? 0;
  // Some notices drop the currency: "Your M-PESA balance is 0.00."
  const mpesaBalance = pickCents(re`M-PESA (?:account )?balance is (?:${KSH})?${AMT}`, t);
  const balances: BalanceReading[] =
    mpesaBalance === undefined ? [] : [{ account: MPESA, cents: mpesaBalance }];
  const parsed = (
    entries: DraftEntry[],
    extra: { occurredAt?: Date; balances?: BalanceReading[] } = {},
  ): Draft => ({
    status: "parsed",
    ref,
    occurredAt: "occurredAt" in extra ? extra.occurredAt : smsTime(t),
    entries,
    balances: extra.balances ?? balances,
  });
  let m: RegExpExecArray | null;

  if (/^Failed\b|\bfailed\b.*\binsufficient\b/i.test(t)) return ignored("failed transaction");

  // Fuliza funding part of a payment. The payment's own SMS records the spend; this adds the draw and the fee.
  // These notices quote only a due date, so the time comes from when the phone received it.
  if (re`Fuliza M-?PESA amount is ${KSH}${AMT}`.test(t)) {
    const drawn = pickCents(re`amount is ${KSH}${AMT}`, t)!;
    const charge = pickCents(re`(?:Access )?(?:Fee|Interest) charged ${KSH}${AMT}`, t) ?? 0;
    const owed = pickCents(re`outstanding amount is ${KSH}${AMT}`, t);
    const entries = transfer(FULIZA, MPESA, drawn, "loan", "fuliza-draw");
    if (charge > 0) entries.push(fee(FULIZA, charge, "Fuliza", "fuliza-fee"));
    return parsed(entries, {
      occurredAt: undefined,
      balances: owed === undefined ? [] : [{ account: FULIZA, cents: -owed }],
    });
  }

  if (
    re`${KSH}${AMT} from your M-PESA has been used to (?:fully |partially )?pay your outstanding Fuliza`.test(
      t,
    )
  ) {
    return parsed(
      transfer(MPESA, FULIZA, pickCents(re`${KSH}${AMT} from your M-PESA`, t)!, "loan", "fuliza-repay"),
    );
  }

  if ((m = re`${KSH}${AMT} transferred (to|from) M-Shwari account`.exec(t))) {
    const cents = pickCents(re`${KSH}${AMT} transferred`, t)!;
    const toShwari = m[2]!.toLowerCase() === "to";
    const shwari = pickCents(re`M-Shwari (?:saving )?(?:account )?balance is ${KSH}${AMT}`, t);
    return parsed(transfer(toShwari ? MPESA : MSHWARI, toShwari ? MSHWARI : MPESA, cents, "transfer"), {
      balances: shwari === undefined ? balances : [...balances, { account: MSHWARI, cents: shwari }],
    });
  }

  if (/KCB M-?PESA/i.test(t) && re`loan repayment of ${KSH}${AMT}`.test(t)) {
    return parsed(transfer(MPESA, KCB_MPESA_LOAN, pickCents(re`repayment of ${KSH}${AMT}`, t)!, "loan"));
  }

  if (re`transfer+ed ${KSH}${AMT} from your KCB M-?PESA account`.test(t)) {
    return parsed(transfer(KCB_MPESA, MPESA, pickCents(re`transfer+ed ${KSH}${AMT}`, t)!, "transfer"));
  }

  if (/account balance was/i.test(t)) {
    const enquiry = pickCents(re`M-PESA Account\s*:\s*${KSH}${AMT}`, t);
    return parsed(cost > 0 ? [fee(MPESA, cost, "Balance enquiry")] : [], {
      balances: enquiry === undefined ? [] : [{ account: MPESA, cents: enquiry }],
    });
  }

  if (/Reversal/i.test(t) && (m = re`${KSH}${AMT} is (credited|debited)`.exec(t))) {
    const cents = pickCents(re`${KSH}${AMT} is`, t)!;
    // Credited: a payment came back (spending, positive). Debited: money received was taken back.
    const entry =
      m[2]!.toLowerCase() === "credited"
        ? { ...spend(MPESA, cents, "reversal", { payee: "Reversal" }), amountCents: cents }
        : { ...receive(MPESA, cents, "reversal", { payee: "Reversal" }), amountCents: -cents };
    return parsed([entry]);
  }

  // Money from the owner's KCB M-PESA savings arrives as "received … from KCB M-PESA …": a transfer.
  if (re`received ${KSH}${AMT} from KCB M-?PESA.*? on \d`.test(t)) {
    const legs = transfer(KCB_MPESA, MPESA, pickCents(re`received ${KSH}${AMT}`, t)!, "transfer");
    legs[1]!.payee = "KCB M-PESA";
    return parsed(legs);
  }

  if ((m = re`received ${KSH}${AMT} from (.+?) on \d`.exec(t))) {
    return parsed([
      receive(MPESA, pickCents(re`received ${KSH}${AMT}`, t)!, "receive", { payee: cleanPayee(m[2]) }),
    ]);
  }

  const withFee = (main: DraftEntry): Draft =>
    parsed(cost > 0 ? [main, fee(MPESA, cost, main.payee)] : [main]);

  if ((m = re`Withdraw ${KSH}${AMT} from (.+?)\s+New M-PESA`.exec(t))) {
    const cents = pickCents(re`Withdraw ${KSH}${AMT}`, t)!;
    const legs = transfer(MPESA, CASH, cents, "withdrawal");
    legs[0]!.payee = cleanPayee(m[2]);
    return parsed(cost > 0 ? [...legs, fee(MPESA, cost, legs[0]!.payee)] : legs);
  }

  if ((m = re`Give ${KSH}${AMT} (?:cash )?to (.+?)\s+New M-PESA`.exec(t))) {
    const legs = transfer(CASH, MPESA, pickCents(re`Give ${KSH}${AMT}`, t)!, "deposit");
    legs[1]!.payee = cleanPayee(m[2]);
    return parsed(legs);
  }

  if (re`bought ${KSH}${AMT} of airtime`.test(t)) {
    return withFee(spend(MPESA, pickCents(re`bought ${KSH}${AMT}`, t)!, "airtime", { payee: "Airtime" }));
  }

  if ((m = re`${KSH}${AMT} paid to (.+?)\.?\s+on \d`.exec(t))) {
    return withFee(spend(MPESA, pickCents(re`${KSH}${AMT} paid`, t)!, "till", { payee: cleanPayee(m[2]) }));
  }

  if ((m = re`${KSH}${AMT} sent to (.+?) for account (.+?) on \d`.exec(t))) {
    const cents = pickCents(re`${KSH}${AMT} sent`, t)!;
    return withFee(spend(MPESA, cents, "paybill", { payee: cleanPayee(m[2]), payeeAccount: m[3]!.trim() }));
  }

  if (
    (m = re`sent ${KSH}${AMT} to (.+?)(?: on \d|\.)`.exec(t)) ||
    (m = re`${KSH}${AMT} sent to (.+?) on \d`.exec(t))
  ) {
    return withFee(spend(MPESA, pickCents(re`${KSH}${AMT}`, t)!, "send", { payee: cleanPayee(m[2]) }));
  }

  // A confirmation in a wording not seen before: keep it for review rather than guess.
  if (/Confirmed/i.test(t)) {
    return review("unrecognised M-PESA wording", { ref, amountCents: pickCents(re`${KSH}${AMT}`, t) });
  }
  return ignored("not a transaction");
}

// KCB M-PESA's own notices about its savings side. The M-PESA confirmation of the same move records the
// transfer, so these only contribute the savings balance, or nothing.
export function parseKcbMpesa(t: string): Draft {
  if (/withdrawn .* from your KCB M-?Pesa wallet/i.test(t)) return ignored("copy of an M-PESA receipt");
  const savings = pickCents(re`M-PESA savings Account balance is (?:KES|Ksh)\.?\s*${AMT}`, t);
  if (/transferred (?:KES|Ksh)/i.test(t) && savings !== undefined) {
    return { status: "parsed", entries: [], balances: [{ account: KCB_MPESA, cents: savings }] };
  }
  return ignored("not a transaction");
}

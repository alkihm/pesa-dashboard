import { parseAirtel } from "./airtel.ts";
import { parseBank } from "./bank.ts";
import type { Draft } from "./draft.ts";
import { parseMpesa } from "./mpesa.ts";
import type { ParseOptions, SmsInput, SmsParse, Source } from "./types.ts";

/** One-time codes are never stored (ARCHITECTURE: sms_messages). The intake checks this before saving. */
export function isOneTimeCode(body: string): boolean {
  return /activation code|verification code|\bOTP\b|one[- ]time (?:pin|password|code)/i.test(body);
}

// Reminders, offers and notices that look like money but are not a payment.
function notATransaction(t: string): string | undefined {
  if (
    /\b(?:is|are) due (?:on|today)\b|\bdue on \d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i.test(t) &&
    !/Confirmed|approved|credited|has been received|Fuliza M-?PESA amount/i.test(t)
  ) {
    return "payment reminder";
  }
  if (
    /^(?:Umepata|Own a stake|Shop beyond|Spend [A-Z]{3} \d+ or more|Sort your financial|Want to upgrade|Get (?:a|up to) )/i.test(
      t,
    )
  ) {
    return "offer";
  }
  if (/is now fully paid/i.test(t)) return "loan closed notice";
  return undefined;
}

function route(sender: string, t: string, opts: ParseOptions): { source: Source; draft: Draft } | undefined {
  const mpesaFormat = /^[A-Z0-9]{10}\s+Confirmed/i.test(t);
  // A KCB notice can quote an M-PESA code; an M-PESA confirmation can mention KCB. The format decides.
  // Batched messages from the Shortcut carry no sender, so the text has to say who sent it.
  const kcb = /KCB/i.test(sender) || (!sender.trim() && /\bKCB\b/i.test(t));
  if (kcb && !mpesaFormat) return { source: "bank", draft: parseBank(t, "KCB", opts) };
  if (/M-?PESA/i.test(sender) || mpesaFormat) return { source: "mpesa", draft: parseMpesa(t) };
  if (/AIRTEL/i.test(sender) || /Airtel Money/i.test(t)) return { source: "airtel", draft: parseAirtel(t) };
  return undefined;
}

/** Turns one SMS into ledger entries. Never throws: anything unexpected comes back as `to_review`. */
export function parseSms(input: SmsInput, opts: ParseOptions = {}): SmsParse {
  const t = input.body
    .replace(/^\s*Spam Alert:\s*/i, "") // iOS tags some genuine M-PESA texts from unknown numbers
    .replace(/\s+/g, " ")
    .trim();
  try {
    if (!t) return { status: "ignored", reason: "empty message" };
    if (isOneTimeCode(t)) return { status: "ignored", reason: "one-time code" };
    const skip = notATransaction(t);
    if (skip) return { status: "ignored", reason: skip };

    const routed = route(input.sender, t, opts);
    if (!routed) return { status: "ignored", reason: "sender not handled" };
    const { source, draft } = routed;

    if (draft.status === "ignored") return draft;
    const occurredAt = draft.occurredAt ?? input.receivedAt;
    if (draft.status === "to_review") return { ...draft, source, occurredAt };

    const stem = draft.ref ?? occurredAt.toISOString().slice(0, 16);
    return {
      status: "parsed",
      source,
      ref: draft.ref,
      occurredAt,
      balances: draft.balances,
      needsReview: draft.needsReview ?? false,
      entries: draft.entries.map((e) => ({
        ...e,
        dedupeKey: draft.ref
          ? `${source}:${stem}:${e.key}`
          : `${source}:${stem}:${Math.abs(e.amountCents)}:${e.key}`,
      })),
    };
  } catch (err) {
    return {
      status: "to_review",
      reason: `parser error: ${err instanceof Error ? err.message : String(err)}`,
      occurredAt: input.receivedAt,
    };
  }
}

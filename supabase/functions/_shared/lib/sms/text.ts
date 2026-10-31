// Small helpers shared by the per-source parsers.

/** An amount as written in an SMS: `1,234`, `1,234.5`, `20000.0`. */
export const AMT = String.raw`((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)`;

/** "1,234.5" → 123450. Done on the digits, so no float ever touches money. */
export function toCents(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return undefined;
  return Number(m[1]!.replace(/,/g, "")) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** First capture group of `re` in `text`, trimmed. */
export function pick(re: RegExp, text: string, group = 1): string | undefined {
  return re.exec(text)?.[group]?.trim();
}

/** Amount captured by `re` (its first group), in cents. */
export function pickCents(re: RegExp, text: string): number | undefined {
  return toCents(pick(re, text));
}

/** "JANE DOE 0700000001" and "JANE DOE 07******01" are both "JANE DOE". */
export function cleanPayee(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const name = raw
    .replace(/\s*[,-]?\s*\+?[\d*]{4,}\s*$/, "")
    .replace(/[\s.,]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return name || raw.trim() || undefined;
}

const NAIROBI_UTC_OFFSET_HOURS = 3; // Africa/Nairobi has no daylight saving

function nairobi(y: number, mo: number, d: number, h: number, mi: number, s = 0): Date | undefined {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return undefined;
  return new Date(Date.UTC(y, mo - 1, d, h - NAIROBI_UTC_OFFSET_HOURS, mi, s));
}

function hour24(h: number, ampm: string | undefined): number {
  if (!ampm) return h;
  const pm = ampm.toUpperCase() === "PM";
  return (h % 12) + (pm ? 12 : 0);
}

/** The transaction time written in the message (Nairobi time), as UTC. Undefined when there is none. */
export function smsTime(text: string): Date | undefined {
  // M-PESA: "on 2/1/26 at 1:23 PM"
  let m = /\bon (\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}) at (\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(text);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return nairobi(y, Number(m[2]), Number(m[1]), hour24(Number(m[4]), m[6]), Number(m[5]));
  }
  // Bank card: "on 23/01/2026 15:32"
  m = /\bon (\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})/.exec(text);
  if (m) return nairobi(Number(m[3]), Number(m[2]), Number(m[1]), Number(m[4]), Number(m[5]));
  // Bank notices: "at 2026-10-24 12:39:21 AM"
  m = /\b(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i.exec(text);
  if (m) {
    const h = hour24(Number(m[4]), m[7]);
    return nairobi(Number(m[1]), Number(m[2]), Number(m[3]), h, Number(m[5]), Number(m[6] ?? 0));
  }
  return undefined;
}

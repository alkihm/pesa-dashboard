// Reads what the iPhone Shortcut posts. It keeps accepting the shapes the old Apps Script took, so moving the
// Shortcut to the intake function only changes the URL ([1.6]):
//   { secret, sender, text, received }        one message
//   { secret, batch: "date|||text|||END..." }  the phone's pending file in one go
//   { secret, action: "status" }               counts for the phone
// and the new shapes { sender, body, received_at } and { messages: [...] }. The key can also come in the
// x-intake-key header, which keeps it out of the body.

export interface IntakeMessage {
  sender: string;
  body: string;
  receivedAt: Date;
}

export type IntakeRequest =
  | { key: string | undefined; action: "ingest"; messages: IntakeMessage[] }
  | { key: string | undefined; action: "status" };

type Json = Record<string, unknown>;

const text = (v: unknown) => (typeof v === "string" ? v : "");

function when(v: unknown, now: Date): Date {
  const d = typeof v === "string" && v.trim() ? new Date(v.trim()) : now;
  return Number.isNaN(d.getTime()) ? now : d;
}

function one(m: Json, now: Date): IntakeMessage {
  return {
    sender: text(m.sender).trim(),
    body: text(m.body ?? m.text).trim(),
    receivedAt: when(m.received_at ?? m.received, now),
  };
}

function batch(raw: string, now: Date): IntakeMessage[] {
  return raw.split(/\|+END\s*/).map((record) => {
    const i = record.indexOf("|||");
    return i === -1
      ? { sender: "", body: record.trim(), receivedAt: now }
      : { sender: "", body: record.slice(i + 3).trim(), receivedAt: when(record.slice(0, i), now) };
  });
}

export function readPayload(json: unknown, headerKey: string | null, now: Date): IntakeRequest {
  const b: Json = json && typeof json === "object" && !Array.isArray(json) ? (json as Json) : {};
  const key = headerKey?.trim() || text(b.secret).trim() || undefined;
  if (b.action === "status") return { key, action: "status" };

  let messages: IntakeMessage[];
  if (Array.isArray(b.messages))
    messages = b.messages.map((m) => one(m && typeof m === "object" ? (m as Json) : {}, now));
  else if (typeof b.batch === "string") messages = batch(b.batch, now);
  else messages = [one(b, now)];

  return { key, action: "ingest", messages: messages.filter((m) => m.body) };
}

/** Compares two keys in time that does not depend on where they differ. */
export function sameKey(given: string | undefined, expected: string): boolean {
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** sha-256 of sender and body, hex — the `sms_messages.hash` that drops repeat posts. */
export async function smsHash(sender: string, body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${sender}|${body}`));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

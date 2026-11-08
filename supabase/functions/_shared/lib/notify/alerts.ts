// The alert switches in Settings ([4.9]) and what the notifications ([4.4]) check before sending. Stored in
// settings.alerts (jsonb) as { key: boolean }; a key not stored yet takes its default.

export const BIG_SPEND_CENTS = 1_000_000; // KES 10,000

/** [5.5] No SMS for this many daytime hours (07:00–22:00 Nairobi) and intake counts as quiet. */
export const INTAKE_QUIET_HOURS = 8;
/** [5.5] Parse failures alert: at least this many SMS left to review in the last day, and at least this share. */
export const PARSE_FAILURE_MIN = 3;
export const PARSE_FAILURE_SHARE = 0.3;

export const ALERTS = [
  { key: "review_due", emoji: "🛡️", label: "Review is due", on: true },
  { key: "mismatch", emoji: "⚠️", label: "A balance does not match its SMS", on: true },
  { key: "bill_tomorrow", emoji: "⏰", label: "A bill is due tomorrow", on: true },
  { key: "bill_overdue", emoji: "🔴", label: "A bill is overdue", on: true },
  { key: "big_spend", emoji: "💸", label: "A single spend over 10,000", on: true },
  { key: "intake_quiet", emoji: "📵", label: "No SMS for 8 daytime hours", on: true },
  { key: "parse_failures", emoji: "🧩", label: "Many SMS could not be read", on: true },
  { key: "weekly_summary", emoji: "📅", label: "Weekly summary on Sunday", on: false },
] as const;

export type AlertKey = (typeof ALERTS)[number]["key"];
export type Alerts = Record<AlertKey, boolean>;

/** Every switch, from what is stored (anything else in the jsonb is ignored). */
export function alertsFrom(stored: unknown): Alerts {
  const saved = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(
    ALERTS.map((a) => [a.key, typeof saved[a.key] === "boolean" ? (saved[a.key] as boolean) : a.on]),
  ) as Alerts;
}

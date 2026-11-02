// How a transaction reads in the list and table: its day, its category line and its tile. Days are Nairobi days
// (D-007), so a payment at 01:00 EAT counts as that morning, not the evening before in UTC.

import type { ActivityRow } from "./query";

const NAIROBI_MS = 3 * 3_600_000; // Africa/Nairobi has no daylight saving
const DAY_MS = 86_400_000;

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Nairobi",
});
const dayMonthYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Nairobi",
});

function nairobiDay(ms: number) {
  return Math.floor((ms + NAIROBI_MS) / DAY_MS);
}

/** "Today", "Yesterday", "29 Oct", or "29 Oct 2025" outside the current year. */
export function dayLabel(iso: string, now = new Date()) {
  const at = new Date(iso);
  const diff = nairobiDay(now.getTime()) - nairobiDay(at.getTime());
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return shortDate(iso, now);
}

/** "29 Oct", or "29 Oct 2025" outside the current year: the desktop table's date column. */
export function shortDate(iso: string, now = new Date()) {
  const at = new Date(iso);
  const sameYear =
    new Date(at.getTime() + NAIROBI_MS).getUTCFullYear() ===
    new Date(now.getTime() + NAIROBI_MS).getUTCFullYear();
  return (sameYear ? dayMonth : dayMonthYear).format(at);
}

/** First day of the Nairobi month holding `now`, as the `month` column of the totals views has it: "2026-10-01". */
export function monthStart(now = new Date()) {
  const local = new Date(now.getTime() + NAIROBI_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const KIND_LOOK: Record<string, { label: string; emoji: string }> = {
  transfer: { label: "Transfer", emoji: "🔁" },
  adjustment: { label: "Adjustment", emoji: "⚖️" },
  opening: { label: "Opening balance", emoji: "🏁" },
};

export interface RowLook {
  label: string;
  emoji: string;
  /** Category colour key for the tile; none for transfers and other non-category rows. */
  colour?: string;
  review: boolean;
}

/** Only spending and income carry a category; transfers and adjustments are edited for their note only. */
export function canCategorise(row: Pick<ActivityRow, "kind">) {
  return row.kind === "spending" || row.kind === "income";
}

/** What a row shows for its category: "To review" wins, then the category, then the transaction kind. */
export function rowLook(row: Pick<ActivityRow, "kind" | "needs_review" | "category">): RowLook {
  if (row.needs_review) return { label: "To review", emoji: "❓", review: true };
  if (row.category) {
    return {
      label: row.category.name,
      emoji: row.category.emoji ?? "🏷️",
      colour: row.category.colour,
      review: false,
    };
  }
  return { ...(KIND_LOOK[row.kind] ?? { label: "Uncategorised", emoji: "🏷️" }), review: false };
}

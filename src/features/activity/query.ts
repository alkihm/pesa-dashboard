// The Activity list's data ([2.5]): one page of transactions at a time, newest first, with the filter chips and the
// search box applied in the database so years of history never load at once.

import type { Db } from "../../lib/supabase";

export type ActivityFilter = "all" | "review" | "notes";

export const PAGE_SIZE = 50;

/** Where the next page starts: the last row of the previous page. Keyset paging stays fast at any depth. */
export interface Cursor {
  occurredAt: string;
  id: string;
}

export interface ActivityQuery {
  filter: ActivityFilter;
  search: string;
  cursor?: Cursor;
  pageSize?: number;
}

const COLUMNS = `id, occurred_at, amount_cents, kind, payee, note, channel, needs_review, transfer_id, parent_id,
  original_currency, original_minor,
  account:accounts!inner(id, name, emoji),
  category:categories(id, name, emoji, colour)`;

export interface Search {
  /** Text to match in payee or note, with characters that break the filter syntax removed. */
  text: string;
  /** Set when the search reads as an amount ("1,500", "250.50"); matches money in or out. */
  amountCents?: number;
}

export function parseSearch(raw: string): Search {
  const text = raw
    .replace(/[,()"\\%*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const number = raw
    .trim()
    .replace(/^(kes|ksh)\s*/i, "")
    .replace(/,/g, "");
  const amountCents = /^\d+(\.\d{1,2})?$/.test(number) ? Math.round(Number(number) * 100) : undefined;
  return amountCents ? { text, amountCents } : { text };
}

export function activityQuery(db: Db, { filter, search, cursor, pageSize = PAGE_SIZE }: ActivityQuery) {
  let q = db.from("transactions").select(COLUMNS).is("deleted_at", null);

  if (filter === "review") q = q.eq("needs_review", true);
  if (filter === "notes") q = q.not("note", "is", null).neq("note", "");

  // Both are "or" groups; PostgREST takes one `or` parameter, so they are joined under a single and(…).
  const groups = [searchGroup(parseSearch(search)), cursor && cursorGroup(cursor)].filter(Boolean);
  if (groups.length === 1) q = q.or(groups[0]!.slice(3, -1));
  if (groups.length === 2) q = q.or(`and(${groups.join(",")})`);

  return q.order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize);
}

// Values are double-quoted because timestamps and search text can hold the filter syntax's reserved . and :
function searchGroup({ text, amountCents }: Search) {
  const terms = [];
  if (text) terms.push(`payee.ilike."*${text}*"`, `note.ilike."*${text}*"`);
  if (amountCents) terms.push(`amount_cents.eq.${amountCents}`, `amount_cents.eq.${-amountCents}`);
  return terms.length ? `or(${terms.join(",")})` : undefined;
}

function cursorGroup({ occurredAt, id }: Cursor) {
  return `or(occurred_at.lt."${occurredAt}",and(occurred_at.eq."${occurredAt}",id.lt.${id}))`;
}

export type ActivityRow = NonNullable<Awaited<ReturnType<typeof activityQuery>>["data"]>[number];

export function nextCursor(rows: ActivityRow[], pageSize = PAGE_SIZE): Cursor | undefined {
  const last = rows.at(-1);
  return last && rows.length === pageSize ? { occurredAt: last.occurred_at, id: last.id } : undefined;
}

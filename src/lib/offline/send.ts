// Sends one queued write and says what happened. "offline" means the database never answered (keep it queued);
// every other outcome is the database's answer.

import type { Db } from "@/lib/supabase";
import type { Op, Row } from "./store";

export type Outcome =
  | { status: "sent"; row?: Row }
  /** No answer: no connection, or the request never got through. */
  | { status: "offline" }
  /** An update matched no row at the version it started from. `server` is the row now, or null when deleted. */
  | { status: "changed"; server: Row | null }
  | { status: "error"; message: string; code?: string };

interface DbError {
  message: string;
  code?: string;
}

/**
 * True when the request never reached the database. supabase-js turns a failed fetch into an error with an empty
 * code and the browser's message ("Failed to fetch", "Load failed", "NetworkError when attempting to fetch").
 */
export function isNetworkError(error: DbError | null | undefined): boolean {
  if (!error) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return !error.code && /failed to fetch|fetch failed|load failed|networkerror/i.test(error.message);
}

// The queue writes to a few tables chosen at run time; the generated types want a literal table name.
interface LooseQuery extends PromiseLike<{ data: Row[] | Row | null; error: DbError | null }> {
  eq(column: string, value: unknown): LooseQuery;
  select(columns?: string): LooseQuery;
  maybeSingle(): LooseQuery;
}
interface LooseTable {
  insert(rows: Row[], options?: { defaultToNull?: boolean }): LooseQuery;
  update(changes: Row): LooseQuery;
  select(columns?: string): LooseQuery;
}
const table = (db: Db, name: string) => (db as unknown as { from(t: string): LooseTable }).from(name);

/**
 * Sends `op`. An update returns `select` (default id and version) of the saved row. An insert refused as a
 * duplicate whose first row already exists counts as sent: an earlier try landed but its answer was lost.
 */
export async function sendOp(db: Db, op: Op, select = "id, version"): Promise<Outcome> {
  try {
    if (op.kind === "insert") {
      const { error } = await table(db, op.table).insert(op.rows, { defaultToNull: false });
      if (!error) return { status: "sent" };
      if (isNetworkError(error)) return { status: "offline" };
      if (error.code === "23505" && (await exists(db, op.table, op.rows[0]?.id))) return { status: "sent" };
      return { status: "error", message: error.message, code: error.code };
    }

    const { data, error } = await table(db, op.table)
      .update(op.changes)
      .eq("id", op.id)
      .eq("version", op.version)
      .select(select);
    if (error) {
      if (isNetworkError(error)) return { status: "offline" };
      return { status: "error", message: error.message, code: error.code };
    }
    const rows = (Array.isArray(data) ? data : data ? [data] : []) as Row[];
    if (rows.length > 0) return { status: "sent", row: rows[0] };

    const server = await current(db, op.table, op.id);
    return server === "offline" ? { status: "offline" } : { status: "changed", server };
  } catch (e) {
    // fetch itself threw (some browsers, some fakes): treat like a failed request.
    const message = e instanceof Error ? e.message : String(e);
    return isNetworkError({ message }) ? { status: "offline" } : { status: "error", message };
  }
}

/** The row as the server has it now; null when it is gone or cannot be read, "offline" when there was no answer. */
async function current(db: Db, name: string, id: string): Promise<Row | null | "offline"> {
  try {
    const { data, error } = await table(db, name).select("*").eq("id", id).maybeSingle();
    if (error) return isNetworkError(error) ? "offline" : null;
    return (data as Row | null) ?? null;
  } catch {
    return null;
  }
}

async function exists(db: Db, name: string, id: unknown): Promise<boolean> {
  if (typeof id !== "string") return false;
  const row = await current(db, name, id);
  return row !== null && row !== "offline";
}

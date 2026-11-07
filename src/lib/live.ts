// [4.6] "Something changed, read it again." Screens list the tables they show with useLive() and put the number it
// returns in their fetch effect's dependencies; announce() bumps it. Announcements come from the database
// (realtime: a new SMS, a bill an SMS paid), from the offline queue after it sent edits, from the app coming back
// to the front or online, and from pull-to-refresh. A screen keeps showing what it has while it reads again.

import { useSyncExternalStore } from "react";

import type { Db } from "./supabase";

export type LiveTable =
  | "transactions"
  | "sms_messages"
  | "bill_months"
  | "budget_items"
  | "accounts"
  | "categories"
  | "reviews"
  | "settings";

export const ALL_TABLES: readonly LiveTable[] = [
  "transactions",
  "sms_messages",
  "bill_months",
  "budget_items",
  "accounts",
  "categories",
  "reviews",
  "settings",
];

const ticks = new Map<LiveTable, number>(ALL_TABLES.map((t) => [t, 0]));
const listeners = new Set<() => void>();

/** Tables changed: every screen showing one of them reads again. No argument: everything. */
export function announce(tables: readonly LiveTable[] = ALL_TABLES) {
  for (const t of tables) ticks.set(t, (ticks.get(t) ?? 0) + 1);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** A number that changes whenever one of `tables` is announced; 0 until the first change. */
export function liveTick(tables: readonly LiveTable[]) {
  return tables.reduce((sum, t) => sum + (ticks.get(t) ?? 0), 0);
}

export function useLive(tables: readonly LiveTable[]): number {
  return useSyncExternalStore(subscribe, () => liveTick(tables));
}

/**
 * Collects announcements that arrive close together (one SMS writes the message, its transaction and maybe a bill
 * month) into one, `wait` ms after the last.
 */
export function batched(wait = 400, send: (tables: LiveTable[]) => void = announce) {
  const pending = new Set<LiveTable>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const add = (tables: readonly LiveTable[]) => {
    tables.forEach((t) => pending.add(t));
    clearTimeout(timer);
    timer = setTimeout(() => {
      const out = [...pending];
      pending.clear();
      send(out);
    }, wait);
  };
  add.cancel = () => clearTimeout(timer);
  return add;
}

/** Tables the database streams to the app (they are in the supabase_realtime publication). */
export const REALTIME_TABLES = ["transactions", "sms_messages", "bill_months", "accounts"] as const;

/**
 * Follows changes in the realtime tables for the signed-in user (row-level security applies) and announces them.
 * Returns the unsubscribe.
 */
let channels = 0;

export function followDatabase(db: Db, add: (tables: readonly LiveTable[]) => void = batched()) {
  // A fresh name each time: the client hands back a channel of the same name that may still be subscribed.
  let channel = db.channel(`live-changes-${++channels}`);
  for (const table of REALTIME_TABLES)
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => add([table]));
  channel.subscribe();
  return () => void db.removeChannel(channel);
}

// What the offline bar and Settings read about the queue. Outside a SyncProvider (screen tests) the hooks fall
// back to the shared queue, sending with the app's client.

import { createContext, useContext, useSyncExternalStore } from "react";

import { offlineQueue, type OfflineQueue, type ReplayResult } from "@/lib/offline/queue";
import type { QueueItem } from "@/lib/offline/store";
import { supabase } from "@/lib/supabase";

export interface SyncValue {
  queue: OfflineQueue;
  items: readonly QueueItem[];
  /** The device is online and the last send reached the database. */
  online: boolean;
  syncing: boolean;
  syncNow(): Promise<ReplayResult>;
  keepMine(id: string): Promise<void>;
  discard(id: string): Promise<void>;
}

export const SyncContext = createContext<SyncValue | null>(null);

export function useSync(): SyncValue {
  const value = useContext(SyncContext);
  const queue = value?.queue ?? offlineQueue();
  const items = useSyncExternalStore(queue.subscribe, queue.items);
  const syncing = useSyncExternalStore(queue.subscribe, queue.replaying);
  const unreachable = useSyncExternalStore(queue.subscribe, queue.unreachable);
  if (value) return value;
  return {
    queue,
    items,
    online: (typeof navigator === "undefined" || navigator.onLine) && !unreachable,
    syncing,
    syncNow: () => queue.replay(supabase()),
    keepMine: (id) => queue.keepMine(id),
    discard: (id) => queue.discard(id),
  };
}

export interface QueueSummary {
  waiting: number;
  /** Conflicts and refusals: the user has to look. */
  attention: number;
}

export function summarise(items: readonly QueueItem[]): QueueSummary {
  return {
    waiting: items.filter((i) => i.state === "waiting").length,
    attention: items.filter((i) => i.state !== "waiting").length,
  };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The offline bar's text, or null when there is nothing to say. */
export function bannerText(online: boolean, { waiting, attention }: QueueSummary): string | null {
  if (attention > 0)
    return `${plural(attention, "change")} ${attention === 1 ? "needs" : "need"} your choice`;
  if (!online)
    return waiting > 0
      ? `Offline · ${plural(waiting, "change")} will sync`
      : "Offline · changes you make are kept on this device";
  if (waiting > 0) return `Sending ${plural(waiting, "change")}…`;
  return null;
}

/** The queue line in Settings · Data & sync. */
export function queueLabel({ waiting, attention }: QueueSummary): string {
  if (waiting === 0 && attention === 0) return "All changes sent";
  const parts = [];
  if (waiting > 0) parts.push(`${plural(waiting, "change")} waiting to sync`);
  if (attention > 0) parts.push(`${attention} to check`);
  return parts.join(" · ");
}

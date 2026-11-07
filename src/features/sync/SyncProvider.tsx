// [4.5] Keeps the offline queue moving for the signed-in user: sends it when the app starts, when the connection
// returns, when the app comes back to the front, and every 30 s while something waits. Draws the offline bar
// above the app shell, so the shell itself needs no change.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { useSession } from "@/features/auth/session";
import { offlineQueue, type OfflineQueue } from "@/lib/offline/queue";
import { supabase, type Db } from "@/lib/supabase";
import { OfflineBanner } from "./OfflineBanner";
import { SyncContext, type SyncValue } from "./sync";

const RETRY_MS = 30_000;

function onConnectionChange(change: () => void) {
  window.addEventListener("online", change);
  window.addEventListener("offline", change);
  return () => {
    window.removeEventListener("online", change);
    window.removeEventListener("offline", change);
  };
}

const useOnline = () => useSyncExternalStore(onConnectionChange, () => navigator.onLine);

interface Props {
  children: ReactNode;
  db?: () => Db;
  queue?: OfflineQueue;
}

export function SyncProvider({ children, db = supabase, queue = offlineQueue() }: Props) {
  const session = useSession();
  const userId = session.status === "signed-in" ? session.session.user.id : null;
  const deviceOnline = useOnline();
  const items = useSyncExternalStore(queue.subscribe, queue.items);
  const syncing = useSyncExternalStore(queue.subscribe, queue.replaying);
  const [loadedFor, setLoadedFor] = useState<string | null>();
  const ready = loadedFor === userId;
  const unreachable = useSyncExternalStore(queue.subscribe, queue.unreachable);
  const syncNow = useCallback(() => queue.replay(db()), [db, queue]);

  useEffect(() => {
    let live = true;
    void queue.setUser(userId).then(() => live && setLoadedFor(userId));
    return () => {
      live = false;
    };
  }, [queue, userId]);

  const waiting = items.some((i) => i.state === "waiting");

  // On start (once the user's items are loaded) and whenever the device comes back online.
  useEffect(() => {
    if (ready && deviceOnline && waiting) void syncNow();
  }, [ready, deviceOnline, waiting, syncNow]);

  useEffect(() => {
    if (!ready || !waiting) return;
    const onVisible = () => document.visibilityState === "visible" && void syncNow();
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => navigator.onLine && void syncNow(), RETRY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [ready, waiting, syncNow]);

  const value = useMemo<SyncValue>(
    () => ({
      queue,
      items,
      online: deviceOnline && !unreachable,
      syncing,
      syncNow,
      keepMine: async (id) => {
        await queue.keepMine(id);
        await syncNow();
      },
      discard: (id) => queue.discard(id),
    }),
    [queue, items, deviceOnline, unreachable, syncing, syncNow],
  );

  return (
    <SyncContext.Provider value={value}>
      <OfflineBanner />
      {children}
    </SyncContext.Provider>
  );
}

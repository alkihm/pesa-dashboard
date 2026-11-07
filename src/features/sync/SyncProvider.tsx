// [4.5] Keeps the offline queue moving for the signed-in user: sends it when the app starts, when the connection
// returns, when the app comes back to the front, and every 30 s while something waits. Draws the offline bar
// above the app shell, so the shell itself needs no change.
// [4.6] Also tells the screens to read again (src/lib/live.ts): on a database change (realtime), after the queue
// sent edits, when the app comes back to the front after a while or comes back online, and on pull-to-refresh.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { useSession } from "@/features/auth/session";
import { setMonthStartDay } from "@/lib/budgetMonth";
import { announce, followDatabase, useLive } from "@/lib/live";
import { setCurrency } from "@/lib/money";
import { offlineQueue, type OfflineQueue } from "@/lib/offline/queue";
import { supabase, type Db } from "@/lib/supabase";
import { OfflineBanner } from "./OfflineBanner";
import { PullToRefresh } from "./PullToRefresh";
import { SyncContext, type SyncValue } from "./sync";

const RETRY_MS = 30_000;
/** Away at least this long: read everything again on return. */
const STALE_MS = 15_000;

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
  const syncNow = useCallback(async () => {
    const result = await queue.replay(db());
    if (result.sent > 0) announce();
    return result;
  }, [db, queue]);

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

  // [4.9] The ledger currency and the budget month start day, read at sign-in and whenever settings may have
  // changed (Settings, another device on return). Screens re-read only when a value really changed.
  const settingsTick = useLive(["settings"]);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    void db()
      .from("settings")
      .select("currency, month_start_day")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live || error) return;
        const currency = setCurrency(data?.currency);
        const month = setMonthStartDay(data?.month_start_day);
        if (currency || month) announce();
      });
    return () => {
      live = false;
    };
  }, [db, userId, settingsTick]);

  // Changes made elsewhere: a new SMS, a bill an SMS paid, an edit on another device.
  useEffect(() => {
    if (!userId) return;
    return followDatabase(db());
  }, [db, userId]);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= STALE_MS) announce();
    };
    const onOnline = () => announce();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, []);

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
      <PullToRefresh />
      {children}
    </SyncContext.Provider>
  );
}

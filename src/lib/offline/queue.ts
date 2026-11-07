// [4.5] The offline queue. A write goes out at once when it can; with no connection it waits here and is sent in
// order when the connection returns (R25). An edit to a row that changed on the server since the edit was made is
// never sent over it: it waits as a conflict for the user to choose (ARCHITECTURE "Offline").
//
// Two edits to the same row while offline become one queue item (the later fields win, the first version stays),
// so a row is never refused because of our own earlier edit.

import type { Db } from "@/lib/supabase";
import { sendOp, type Outcome } from "./send";
import { deviceStore, type Op, type QueueItem, type QueueStore, type Row } from "./store";

export type SubmitResult =
  | { status: "sent"; row?: Row }
  /** Kept on this device; it is sent when the connection returns. */
  | { status: "queued" }
  /** An update started from an old version (online, so the screen should reload). */
  | { status: "changed" }
  | { status: "error"; message: string; code?: string };

export interface ReplayResult {
  sent: number;
  /** Stopped because the database could not be reached. */
  offline: boolean;
}

export interface OfflineQueue {
  /** This user's items, oldest first. */
  items(): readonly QueueItem[];
  subscribe(listener: () => void): () => void;
  /** A replay is running. */
  replaying(): boolean;
  /** The last request found no connection, though the device may say it is online. */
  unreachable(): boolean;
  setUser(userId: string | null): Promise<void>;
  submit(db: Db, op: Op, label: string, select?: string): Promise<SubmitResult>;
  replay(db: Db): Promise<ReplayResult>;
  /** Conflict: send my edit over the row as it is now. */
  keepMine(id: string): Promise<void>;
  /** Conflict or failed: drop my edit. */
  discard(id: string): Promise<void>;
}

const keysOf = (op: Op) =>
  op.kind === "update" ? [`${op.table}:${op.id}`] : op.rows.map((r) => `${op.table}:${String(r.id)}`);

/** Readable reason for a refusal. */
export function refusal(outcome: { message: string; code?: string }) {
  return outcome.code === "23505" ? "Already in the ledger" : outcome.message;
}

interface Options {
  store?: QueueStore | Promise<QueueStore>;
  now?: () => Date;
  newId?: () => string;
  /** Whether the device thinks it is online; offline, writes are queued without trying. */
  online?: () => boolean;
}

export function createQueue({
  store: given,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  online = () => typeof navigator === "undefined" || navigator.onLine,
}: Options = {}): OfflineQueue {
  let store: Promise<QueueStore> | undefined = given ? Promise.resolve(given) : undefined;
  const getStore = () => (store ??= deviceStore());
  let user: string | null = null;
  let all: QueueItem[] = [];
  let mine: readonly QueueItem[] = [];
  const listeners = new Set<() => void>();
  let running: Promise<ReplayResult> | undefined;
  let noAnswer = false;

  function reached(offline: boolean) {
    if (noAnswer === offline) return;
    noAnswer = offline;
    listeners.forEach((l) => l());
  }

  async function refresh() {
    all = await (await getStore()).all();
    mine = all.filter((i) => i.userId === (user ?? ""));
    listeners.forEach((l) => l());
  }

  async function put(item: QueueItem) {
    await (await getStore()).put(item);
    await refresh();
  }

  async function remove(id: string) {
    await (await getStore()).remove(id);
    await refresh();
  }

  async function enqueue(op: Op, label: string) {
    await refresh();
    const waiting = mine.filter((i) => i.state === "waiting");

    if (op.kind === "update") {
      const same = waiting.find(
        (i) => i.op.kind === "update" && i.op.table === op.table && i.op.id === op.id,
      );
      if (same && same.op.kind === "update")
        return put({ ...same, label, op: { ...same.op, changes: { ...same.op.changes, ...op.changes } } });

      const inserted = waiting.find(
        (i) => i.op.kind === "insert" && i.op.table === op.table && i.op.rows.some((r) => r.id === op.id),
      );
      if (inserted && inserted.op.kind === "insert") {
        const rows = inserted.op.rows.map((r) => (r.id === op.id ? { ...r, ...op.changes } : r));
        return put({ ...inserted, op: { ...inserted.op, rows } });
      }
    }

    const seq = all.reduce((max, i) => Math.max(max, i.seq), 0) + 1;
    return put({
      id: newId(),
      seq,
      userId: user ?? "",
      createdAt: now().toISOString(),
      label,
      op,
      state: "waiting",
    });
  }

  async function replayOnce(db: Db): Promise<ReplayResult> {
    await refresh();
    let sent = 0;
    // A row with an unresolved item is held back, so its later edits do not jump the queue.
    const held = new Set<string>();
    for (const item of mine) {
      const keys = keysOf(item.op);
      if (item.state !== "waiting" || keys.some((k) => held.has(k))) {
        keys.forEach((k) => held.add(k));
        continue;
      }
      const outcome: Outcome = await sendOp(db, item.op);
      reached(outcome.status === "offline");
      if (outcome.status === "offline") return { sent, offline: true };
      if (outcome.status === "sent") {
        sent++;
        await remove(item.id);
        continue;
      }
      keys.forEach((k) => held.add(k));
      if (outcome.status === "changed") await put({ ...item, state: "conflict", server: outcome.server });
      else await put({ ...item, state: "failed", error: refusal(outcome) });
    }
    return { sent, offline: false };
  }

  return {
    items: () => mine,

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async setUser(userId) {
      user = userId;
      await refresh();
    },

    async submit(db, op, label, select) {
      await refresh();
      const pending = new Set(mine.flatMap((i) => keysOf(i.op)));
      // Behind an older queued edit of the same row, or offline: wait in the queue.
      if (!online() || keysOf(op).some((k) => pending.has(k))) {
        await enqueue(op, label);
        return { status: "queued" };
      }
      const outcome = await sendOp(db, op, select);
      reached(outcome.status === "offline");
      if (outcome.status === "offline") {
        await enqueue(op, label);
        return { status: "queued" };
      }
      if (outcome.status === "changed") return { status: "changed" };
      return outcome;
    },

    replaying: () => running !== undefined,
    unreachable: () => noAnswer,

    replay(db) {
      // One replay at a time; a second call waits for the first.
      if (!running) {
        running = replayOnce(db).finally(() => {
          running = undefined;
          listeners.forEach((l) => l());
        });
        listeners.forEach((l) => l());
      }
      return running;
    },

    async keepMine(id) {
      const item = mine.find((i) => i.id === id);
      if (!item || item.state !== "conflict" || item.op.kind !== "update" || !item.server) return;
      const version = Number(item.server.version);
      await put({ ...item, state: "waiting", server: undefined, op: { ...item.op, version } });
    },

    discard: remove,
  };
}

let shared: OfflineQueue | undefined;

/** The app's one queue. */
export function offlineQueue(): OfflineQueue {
  shared ??= createQueue();
  return shared;
}

/** Tests: start each from an empty queue. */
export function resetOfflineQueue(queue?: OfflineQueue) {
  shared = queue;
}

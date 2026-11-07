// Where queued edits live ([4.5], D-002): IndexedDB on the device, so they survive a reload or a closed app.
// A memory store stands in when IndexedDB is missing (tests, some private windows); edits then last until reload.

/** Tables whose writes can wait for a connection. Each has `id` and a `version` the database bumps (ARCHITECTURE). */
export type QueueTable = "transactions" | "bill_months" | "budget_items";

export type Row = Record<string, unknown>;

export type Op =
  /** New rows with ids made by the app, so a replay that already landed is recognised, not doubled. */
  | { kind: "insert"; table: QueueTable; rows: Row[] }
  /** Changes to one row, guarded by the version the edit started from. */
  | { kind: "update"; table: QueueTable; id: string; version: number; changes: Row };

export type ItemState =
  /** Waiting for a connection. */
  | "waiting"
  /** The row changed on the server since the edit was made: the user chooses. `server` is null when it was deleted. */
  | "conflict"
  /** The database refused it for another reason (`error`); the user can discard it. */
  | "failed";

export interface QueueItem {
  id: string;
  /** Replay order. */
  seq: number;
  userId: string;
  createdAt: string;
  /** What the user did, in their words: "Paid · Rent". */
  label: string;
  op: Op;
  state: ItemState;
  error?: string;
  server?: Row | null;
}

export interface QueueStore {
  all(): Promise<QueueItem[]>;
  put(item: QueueItem): Promise<void>;
  remove(id: string): Promise<void>;
}

export function memoryStore(initial: QueueItem[] = []): QueueStore {
  const items = new Map(initial.map((i) => [i.id, structuredClone(i)]));
  return {
    all: async () => [...items.values()].map((i) => structuredClone(i)).sort((a, b) => a.seq - b.seq),
    put: async (item) => void items.set(item.id, structuredClone(item)),
    remove: async (id) => void items.delete(id),
  };
}

const DB_NAME = "pesa-offline";
const STORE = "queue";

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  const r = factory.open(DB_NAME, 1);
  r.onupgradeneeded = () => {
    if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "id" });
  };
  return request(r);
}

export function indexedDbStore(factory: IDBFactory): QueueStore {
  let db: Promise<IDBDatabase> | undefined;
  const tx = async (mode: IDBTransactionMode) => {
    db ??= open(factory);
    return (await db).transaction(STORE, mode).objectStore(STORE);
  };
  return {
    all: async () => {
      const items = await request((await tx("readonly")).getAll() as IDBRequest<QueueItem[]>);
      return items.sort((a, b) => a.seq - b.seq);
    },
    put: async (item) => void (await request((await tx("readwrite")).put(item))),
    remove: async (id) => void (await request((await tx("readwrite")).delete(id))),
  };
}

/** IndexedDB when the device has it and it opens; otherwise memory. */
export async function deviceStore(): Promise<QueueStore> {
  if (typeof indexedDB === "undefined") return memoryStore();
  try {
    const store = indexedDbStore(indexedDB);
    await store.all();
    return store;
  } catch {
    return memoryStore();
  }
}

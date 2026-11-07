// A tiny stand-in for the database, for offline-queue tests: tables of rows with the version trigger
// (version + 1 on every update), unique ids, and a switch that makes every request fail like a dropped connection.

import type { Db } from "@/lib/supabase";

type Row = Record<string, unknown>;

export interface FakeServer {
  db: Db;
  tables: Record<string, Row[]>;
  /** false: every request fails as if the network were down. */
  up: boolean;
  /** Requests that reached the server. */
  requests: string[];
  /** Change a row "on another device". */
  edit(table: string, id: string, changes: Row): void;
}

const NETWORK = { message: "TypeError: Failed to fetch", code: "" };

export function fakeServer(initial: Record<string, Row[]> = {}): FakeServer {
  const server: FakeServer = {
    tables: structuredClone(initial),
    up: true,
    requests: [],
    db: undefined as unknown as Db,
    edit(table, id, changes) {
      const row = rows(table).find((r) => r.id === id)!;
      Object.assign(row, changes, { version: Number(row.version) + 1 });
    },
  };
  const rows = (t: string) => (server.tables[t] ??= []);

  function query(table: string, run: (filters: [string, unknown][]) => { data: unknown; error: unknown }) {
    const filters: [string, unknown][] = [];
    let single = false;
    const q = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return q;
      },
      select() {
        return q;
      },
      maybeSingle() {
        single = true;
        return q;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        if (!server.up) return Promise.resolve({ data: null, error: NETWORK }).then(resolve, reject);
        server.requests.push(table);
        const out = run(filters);
        if (single && Array.isArray(out.data)) out.data = out.data[0] ?? null;
        return Promise.resolve(out).then(resolve, reject);
      },
    };
    return q;
  }

  const match = (r: Row, filters: [string, unknown][]) => filters.every(([c, v]) => r[c] === v);

  server.db = {
    from: (table: string) => ({
      insert: (newRows: Row[]) =>
        query(table, () => {
          if (newRows.some((n) => rows(table).some((r) => r.id === n.id)))
            return { data: null, error: { message: "duplicate key value", code: "23505" } };
          rows(table).push(...newRows.map((n) => ({ version: 1, ...structuredClone(n) })));
          return { data: null, error: null };
        }),
      update: (changes: Row) =>
        query(table, (filters) => {
          const hit = rows(table).filter((r) => match(r, filters));
          hit.forEach((r) => Object.assign(r, changes, { version: Number(r.version) + 1 }));
          return { data: structuredClone(hit), error: null };
        }),
      select: () =>
        query(table, (filters) => ({
          data: structuredClone(rows(table).filter((r) => match(r, filters))),
          error: null,
        })),
    }),
  } as unknown as Db;

  return server;
}

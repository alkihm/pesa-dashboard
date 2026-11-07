import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { fakeServer } from "@/test/fakeServer";
import { createQueue } from "./queue";
import { indexedDbStore, memoryStore, type Op } from "./store";

const bill = (id: string, version = 3) => ({ id, status: "due", paid_at: null, version });
type Update = Extract<Op, { kind: "update" }>;
const pay = (id: string, version = 3): Update => ({
  kind: "update",
  table: "bill_months",
  id,
  version,
  changes: { status: "paid", paid_at: "2026-11-07T09:00:00.000Z" },
});

function setup(initial = { bill_months: [bill("m1"), bill("m2")] }) {
  const server = fakeServer(initial);
  let online = true;
  let n = 0;
  const queue = createQueue({
    store: memoryStore(),
    online: () => online,
    newId: () => `q${++n}`,
    now: () => new Date("2026-11-07T09:00:00Z"),
  });
  return {
    server,
    queue,
    /** Airplane mode on or off: the device knows, and requests fail. */
    airplane(on: boolean) {
      online = !on;
      server.up = !on;
    },
  };
}

describe("sending a write", () => {
  it("goes straight to the database when online", async () => {
    const { server, queue } = setup();
    const result = await queue.submit(server.db, pay("m1"), "Paid · Internet");
    expect(result).toEqual({ status: "sent", row: expect.objectContaining({ id: "m1", version: 4 }) });
    expect(queue.items()).toHaveLength(0);
  });

  it("waits in the queue in airplane mode and goes out in order when the connection returns", async () => {
    const { server, queue, airplane } = setup();
    airplane(true);
    expect(await queue.submit(server.db, pay("m2"), "Paid · Rent")).toEqual({ status: "queued" });
    expect(await queue.submit(server.db, pay("m1"), "Paid · Internet")).toEqual({ status: "queued" });
    expect(queue.items().map((i) => [i.label, i.state])).toEqual([
      ["Paid · Rent", "waiting"],
      ["Paid · Internet", "waiting"],
    ]);
    expect(server.requests).toEqual([]);

    expect(await queue.replay(server.db)).toEqual({ sent: 0, offline: true });
    expect(queue.items()).toHaveLength(2);

    airplane(false);
    expect(await queue.replay(server.db)).toEqual({ sent: 2, offline: false });
    expect(queue.items()).toEqual([]);
    expect(server.tables.bill_months).toEqual([
      expect.objectContaining({ id: "m1", status: "paid", version: 4 }),
      expect.objectContaining({ id: "m2", status: "paid", version: 4 }),
    ]);
    expect(server.requests).toEqual(["bill_months", "bill_months"]);
  });

  it("queues a write whose request fails although the device says it is online", async () => {
    const { server, queue } = setup();
    server.up = false;
    expect(await queue.submit(server.db, pay("m1"), "Paid · Internet")).toEqual({ status: "queued" });
    expect(queue.items()).toHaveLength(1);
  });

  it("reports an online edit of an old version so the screen reloads, without queueing it", async () => {
    const { server, queue } = setup();
    server.edit("bill_months", "m1", { status: "skipped" });
    expect(await queue.submit(server.db, pay("m1"), "Paid · Internet")).toEqual({ status: "changed" });
    expect(queue.items()).toHaveLength(0);
  });
});

describe("several offline edits of one row", () => {
  it("become one item with the first version, so our own edits never conflict", async () => {
    const { server, queue, airplane } = setup();
    airplane(true);
    await queue.submit(server.db, pay("m1"), "Paid · Internet");
    const undo: Op = { ...pay("m1", 4), changes: { status: "due", paid_at: null } };
    await queue.submit(server.db, undo, "Undo · Internet");

    expect(queue.items()).toHaveLength(1);
    expect(queue.items()[0]).toMatchObject({
      label: "Undo · Internet",
      op: { version: 3, changes: { status: "due", paid_at: null } },
    });

    airplane(false);
    await queue.replay(server.db);
    expect(server.tables.bill_months![0]).toMatchObject({ status: "due", version: 4 });
  });

  it("fold an edit of a row made offline into its insert", async () => {
    const { server, queue, airplane } = setup();
    airplane(true);
    const add: Op = {
      kind: "insert",
      table: "transactions",
      rows: [{ id: "t1", amount_cents: 500, note: null }],
    };
    await queue.submit(server.db, add, "Added · 5.00");
    await queue.submit(
      server.db,
      { kind: "update", table: "transactions", id: "t1", version: 1, changes: { note: "lunch" } },
      "Edited · lunch",
    );
    expect(queue.items()).toHaveLength(1);

    airplane(false);
    await queue.replay(server.db);
    expect(server.tables.transactions).toEqual([{ id: "t1", amount_cents: 500, note: "lunch", version: 1 }]);
  });

  it("send a new online edit behind an older queued one of the same row", async () => {
    const { server, queue, airplane } = setup();
    airplane(true);
    await queue.submit(server.db, pay("m1"), "Paid · Internet");
    airplane(false);
    expect(await queue.submit(server.db, { ...pay("m1", 4), changes: { status: "due" } }, "Undo")).toEqual({
      status: "queued",
    });
    expect(server.requests).toEqual([]);
  });
});

describe("a row changed on another device while offline", () => {
  async function conflicted() {
    const s = setup();
    s.airplane(true);
    await s.queue.submit(s.server.db, pay("m1"), "Paid · Internet");
    await s.queue.submit(s.server.db, pay("m2"), "Paid · Rent");
    s.airplane(false);
    s.server.edit("bill_months", "m1", { status: "skipped" });
    await s.queue.replay(s.server.db);
    return s;
  }

  it("is not overwritten: the edit waits as a conflict with the row as it is now, the others still go", async () => {
    const { server, queue } = await conflicted();
    expect(server.tables.bill_months![0]).toMatchObject({ status: "skipped", version: 4 });
    expect(server.tables.bill_months![1]).toMatchObject({ status: "paid" });
    expect(queue.items()).toEqual([
      expect.objectContaining({
        label: "Paid · Internet",
        state: "conflict",
        server: expect.objectContaining({ status: "skipped", version: 4 }),
      }),
    ]);
  });

  it("holds later edits of that row until the user chooses", async () => {
    const { server, queue } = await conflicted();
    await queue.submit(server.db, { ...pay("m1", 4), changes: { paid_at: null } }, "Edited again");
    await queue.replay(server.db);
    expect(queue.items().map((i) => i.state)).toEqual(["conflict", "waiting"]);
    expect(server.tables.bill_months![0]).toMatchObject({ status: "skipped" });
  });

  it("Keep mine sends the edit over the row as it is now", async () => {
    const { server, queue } = await conflicted();
    await queue.keepMine(queue.items()[0]!.id);
    expect(queue.items()[0]).toMatchObject({ state: "waiting", op: { version: 4 } });
    await queue.replay(server.db);
    expect(queue.items()).toEqual([]);
    expect(server.tables.bill_months![0]).toMatchObject({ status: "paid", version: 5 });
  });

  it("Keep theirs drops the edit", async () => {
    const { server, queue } = await conflicted();
    await queue.discard(queue.items()[0]!.id);
    expect(queue.items()).toEqual([]);
    expect(server.tables.bill_months![0]).toMatchObject({ status: "skipped" });
  });

  it("is a conflict with nothing to keep when the row was deleted", async () => {
    const s = setup();
    s.airplane(true);
    await s.queue.submit(s.server.db, pay("m1"), "Paid · Internet");
    s.airplane(false);
    s.server.tables.bill_months = [];
    await s.queue.replay(s.server.db);
    expect(s.queue.items()[0]).toMatchObject({ state: "conflict", server: null });
    await s.queue.keepMine(s.queue.items()[0]!.id);
    expect(s.queue.items()[0]).toMatchObject({ state: "conflict" });
  });
});

describe("inserts", () => {
  it("count as sent when an earlier try landed but its answer was lost", async () => {
    const { server, queue, airplane } = setup();
    airplane(true);
    await queue.submit(server.db, { kind: "insert", table: "transactions", rows: [{ id: "t1" }] }, "Added");
    server.tables.transactions = [{ id: "t1", version: 1 }];
    airplane(false);
    expect(await queue.replay(server.db)).toEqual({ sent: 1, offline: false });
    expect(server.tables.transactions).toHaveLength(1);
  });

  it("fail with a reason when the database refuses them, and can be discarded", async () => {
    const { server, queue, airplane } = setup();
    airplane(true);
    await queue.submit(server.db, { kind: "insert", table: "transactions", rows: [{ id: "t2" }] }, "Added");
    airplane(false);
    // The same SMS was saved from another device under another id: the unique key on sms_id refuses it.
    const refusing = {
      from: () => ({
        insert: () => Promise.resolve({ data: null, error: { message: "duplicate key", code: "23505" } }),
        select: () => {
          const q = { eq: () => q, maybeSingle: () => Promise.resolve({ data: null, error: null }) };
          return q;
        },
      }),
    } as unknown as typeof server.db;
    await queue.replay(refusing);
    expect(queue.items()[0]).toMatchObject({ state: "failed", error: "Already in the ledger" });
    await queue.discard(queue.items()[0]!.id);
    expect(queue.items()).toEqual([]);
  });
});

describe("whose queue", () => {
  it("shows and sends only the signed-in user's items", async () => {
    const { server, queue, airplane } = setup();
    await queue.setUser("u1");
    airplane(true);
    await queue.submit(server.db, pay("m1"), "Paid · Internet");
    await queue.setUser("u2");
    expect(queue.items()).toEqual([]);
    airplane(false);
    expect(await queue.replay(server.db)).toEqual({ sent: 0, offline: false });
    await queue.setUser("u1");
    expect(queue.items()).toHaveLength(1);
  });
});

describe("the device store", () => {
  it("keeps queued edits in IndexedDB across a reload", async () => {
    const idb = new IDBFactory();
    const server = fakeServer({ bill_months: [bill("m1")] });
    const before = createQueue({ store: indexedDbStore(idb), online: () => false });
    await before.submit(server.db, pay("m1"), "Paid · Internet");

    const after = createQueue({ store: indexedDbStore(idb), online: () => true });
    await after.setUser(null);
    expect(after.items()).toEqual([expect.objectContaining({ label: "Paid · Internet", state: "waiting" })]);
    await after.replay(server.db);
    expect(server.tables.bill_months![0]).toMatchObject({ status: "paid" });
    expect(after.items()).toEqual([]);
  });
});

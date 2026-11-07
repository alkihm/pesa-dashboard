import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAccounts } from "./data/accounts";
import { announce, batched, followDatabase, liveTick, REALTIME_TABLES, useLive } from "./live";
import type { Db } from "./supabase";

describe("announce and useLive", () => {
  it("changes the number only for screens that show an announced table", () => {
    const bills = renderHook(() => useLive(["bill_months"]));
    const accounts = renderHook(() => useLive(["accounts", "transactions"]));
    const before = { bills: bills.result.current, accounts: accounts.result.current };

    act(() => announce(["transactions"]));
    expect(bills.result.current).toBe(before.bills);
    expect(accounts.result.current).toBe(before.accounts + 1);

    act(() => announce());
    // Everything: each listed table plus settings, which every screen follows (currency, month start).
    expect(bills.result.current).toBe(before.bills + 2);
    expect(accounts.result.current).toBe(before.accounts + 4);
  });
});

describe("batched announcements", () => {
  afterEach(() => vi.useRealTimers());

  it("turns the writes of one SMS into one announcement", () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const add = batched(400, send);
    add(["sms_messages"]);
    vi.advanceTimersByTime(100);
    add(["transactions"]);
    add(["bill_months", "transactions"]);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toEqual(["sms_messages", "transactions", "bill_months"]);
  });
});

describe("following the database", () => {
  function fakeRealtime() {
    const handlers: { table: string; run: () => void }[] = [];
    const names: string[] = [];
    const removed: unknown[] = [];
    const channel = {
      on: (_: string, filter: { table: string }, run: () => void) => (
        handlers.push({ table: filter.table, run }),
        channel
      ),
      subscribe: vi.fn(() => channel),
    };
    const db = {
      channel: (name: string) => (names.push(name), channel),
      removeChannel: (c: unknown) => (removed.push(c), Promise.resolve("ok")),
    } as unknown as Db;
    return { db, handlers, names, removed, channel };
  }

  it("listens to every realtime table and announces the one that changed", () => {
    const { db, handlers, channel } = fakeRealtime();
    const add = vi.fn();
    followDatabase(db, add);
    expect(handlers.map((h) => h.table)).toEqual([...REALTIME_TABLES]);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    handlers.find((h) => h.table === "sms_messages")!.run();
    expect(add).toHaveBeenCalledWith(["sms_messages"]);
  });

  it("uses a new channel each time and removes it on stop", () => {
    const { db, names, removed, channel } = fakeRealtime();
    const stop = followDatabase(db, vi.fn());
    followDatabase(db, vi.fn());
    expect(new Set(names).size).toBe(2);
    stop();
    expect(removed).toEqual([channel]);
  });
});

describe("a screen's data after an announcement", () => {
  it("reads again and keeps the old rows on screen meanwhile", async () => {
    let balance = 1000;
    const waiting: (() => void)[] = [];
    const answer = () => ({
      data: [{ account_id: "a1", name: "M-PESA", balance_cents: balance }],
      error: null,
    });
    const query = {
      select: () => query,
      order: () => query,
      is: () => query,
      then: (ok: (v: unknown) => unknown) =>
        balance === 1000
          ? Promise.resolve(answer()).then(ok)
          : new Promise<void>((r) => waiting.push(r)).then(() => ok(answer())),
    };
    const db = { from: () => query } as unknown as Db;
    const getDb = () => db;
    const { result } = renderHook(() => useAccounts(getDb));
    await waitFor(() => expect(result.current.accounts?.[0]?.balance_cents).toBe(1000));

    const tick = liveTick(["accounts"]);
    balance = 2500;
    act(() => announce(["transactions"]));
    expect(liveTick(["accounts"])).toBe(tick);
    expect(result.current.accounts?.[0]?.balance_cents).toBe(1000);
    // Promise.all asks for the answers a tick later; then let them through.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
      expect(waiting).toHaveLength(2);
      waiting.forEach((r) => r());
    });
    await waitFor(() => expect(result.current.accounts?.[0]?.balance_cents).toBe(2500));
  });
});

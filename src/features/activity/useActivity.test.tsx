import { act, renderHook, waitFor } from "@testing-library/react";

import type { Db } from "../../lib/supabase";
import { useActivity } from "./useActivity";

// A stand-in for the client: records each query's filters and answers with rows from `pages`.
function fakeDb(pages: Record<string, { id: string; occurred_at: string }[]>) {
  const calls: string[] = [];
  const db = {
    from: () => {
      const parts: string[] = [];
      const chain = {
        select: () => chain,
        is: () => chain,
        eq: (c: string, v: unknown) => (parts.push(`${c}=${String(v)}`), chain),
        not: () => (parts.push("notes"), chain),
        neq: () => chain,
        or: (f: string) => (parts.push(f.includes("occurred_at.lt") ? "more" : `search`), chain),
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: unknown) => void) => {
          const key = parts.join("&") || "all";
          calls.push(key);
          resolve({ data: pages[key] ?? [], error: null });
        },
      };
      return chain;
    },
  };
  return { db: () => db as unknown as Db, calls };
}

const rows = (n: number, prefix = "r") =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    occurred_at: `2026-10-${String(30 - i).padStart(2, "0")}`,
  }));

describe("useActivity", () => {
  it("loads the first page, then more from where it stopped", async () => {
    const { db, calls } = fakeDb({ all: rows(50), more: rows(3, "m") });
    const { result } = renderHook(() => useActivity(db));

    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(53));
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(calls).toEqual(["all", "more"]);
  });

  it("starts again when the filter changes", async () => {
    const { db } = fakeDb({ all: rows(50), "needs_review=true": rows(2, "v") });
    const { result } = renderHook(() => useActivity(db));
    await waitFor(() => expect(result.current.rows).toHaveLength(50));

    act(() => result.current.setFilter("review"));
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["v0", "v1"]));
    expect(result.current.hasMore).toBe(false);
  });

  it("waits for a pause in typing before searching", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { db, calls } = fakeDb({ all: rows(1), search: rows(1, "s") });
    const { result } = renderHook(() => useActivity(db));
    await waitFor(() => expect(calls).toEqual(["all"]));

    act(() => result.current.setSearch("n"));
    act(() => result.current.setSearch("na"));
    act(() => result.current.setSearch("nai"));
    await act(() => vi.advanceTimersByTimeAsync(300));
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["s0"]));
    expect(calls).toEqual(["all", "search"]);
    vi.useRealTimers();
  });
});

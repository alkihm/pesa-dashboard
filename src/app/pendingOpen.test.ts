// [4.4] #141 The page side of a tapped notification: it takes the target the service worker stored, once.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPEN_CACHE,
  OPEN_KEY,
  OPEN_MAX_AGE_MS,
  sameSitePath,
  takePendingOpen,
  watchPendingOpen,
} from "./pendingOpen";

const ORIGIN = window.location.origin;
let store: Map<string, string>;

function fakeCaches() {
  store = new Map();
  const cache = {
    match: vi.fn(async (key: string) => (store.has(key) ? new Response(store.get(key)) : undefined)),
    delete: vi.fn(async (key: string) => store.delete(key)),
  };
  vi.stubGlobal("caches", { open: vi.fn(async (name: string) => (name === OPEN_CACHE ? cache : null)) });
}

const stash = (url: string, at = Date.now()) => store.set(OPEN_KEY, JSON.stringify({ url, at }));
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(fakeCaches);
afterEach(() => vi.unstubAllGlobals());

describe("takePendingOpen", () => {
  it("returns the stored screen once", async () => {
    stash(`${ORIGIN}/settings`);
    expect(await takePendingOpen()).toBe("/settings");
    expect(await takePendingOpen()).toBeNull();
  });

  it("ignores a stale target and clears it", async () => {
    stash(`${ORIGIN}/bills`, Date.now() - OPEN_MAX_AGE_MS - 1);
    expect(await takePendingOpen()).toBeNull();
    expect(store.size).toBe(0);
  });

  it("never leaves the app", async () => {
    stash("https://evil.example/phish");
    expect(await takePendingOpen()).toBeNull();
    expect(sameSitePath("/activity/t1?x=1#y")).toBe("/activity/t1?x=1#y");
  });

  it("is null without the Cache API", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await takePendingOpen()).toBeNull();
  });
});

describe("watchPendingOpen", () => {
  it("opens the stored screen at start and again when the app comes back to the front", async () => {
    const go = vi.fn();
    stash(`${ORIGIN}/review`);
    watchPendingOpen(go);
    await flush();
    expect(go).toHaveBeenCalledWith("/review");

    stash(`${ORIGIN}/bills?m=2026-11`);
    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(go).toHaveBeenLastCalledWith("/bills?m=2026-11");
    expect(go).toHaveBeenCalledTimes(2);
  });

  it("does nothing when there is no tap to follow", async () => {
    const go = vi.fn();
    watchPendingOpen(go);
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(go).not.toHaveBeenCalled();
  });
});

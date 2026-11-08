// [4.4] public/push-sw.js runs inside the service worker; here it runs against a fake `self` to check what a tap
// on a notification does in each case iPhone and other browsers can present.
import { describe, expect, it, vi } from "vitest";

const code = Object.values(
  import.meta.glob<string>("/public/push-sw.js", { query: "?raw", import: "default", eager: true }),
)[0]!;
const ORIGIN = "https://pesa.example";

type Handler = (event: unknown) => void;

function worker(windows: Record<string, unknown>[], withCache = false) {
  const handlers: Record<string, Handler> = {};
  const openWindow = vi.fn(async () => null);
  const stored = new Map<string, string>();
  const cacheOpen = vi.fn(async () => ({
    put: async (req: Request, res: Response) =>
      void stored.set(`${cacheOpen.mock.calls.at(-1)}|${req.url}`, await res.text()),
  }));
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    registration: { showNotification: vi.fn() },
    clients: { matchAll: vi.fn(async () => windows), openWindow },
    ...(withCache ? { caches: { open: cacheOpen } } : {}),
  };
  new Function("self", code)(self);
  async function tap(url = "/bills") {
    let done: Promise<unknown> = Promise.resolve();
    handlers.notificationclick!({
      notification: { close: vi.fn(), data: { url } },
      waitUntil: (p: Promise<unknown>) => (done = p),
    });
    await done;
  }
  async function push(data: unknown) {
    let done: Promise<unknown> = Promise.resolve();
    handlers.push!({
      data: { json: () => data, text: () => "" },
      waitUntil: (p: Promise<unknown>) => (done = p),
    });
    await done;
  }
  return { self, openWindow, tap, push, stored };
}

const win = (over: Record<string, unknown> = {}) => {
  const w: Record<string, unknown> = {
    url: `${ORIGIN}/settings`,
    navigate: vi.fn(async () => w),
    postMessage: vi.fn(),
    ...over,
  };
  w.focus ??= vi.fn(async () => w);
  return w;
};

describe("tapping a notification", () => {
  it("opens the app at the screen when no window is open", async () => {
    const w = worker([]);
    await w.tap("/bills");
    expect(w.openWindow).toHaveBeenCalledWith(`${ORIGIN}/bills`);
  });

  it("brings the open app forward and moves it to the screen", async () => {
    const open = win();
    const w = worker([open]);
    await w.tap("/review");
    expect(open.focus).toHaveBeenCalled();
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/review`);
    expect(w.openWindow).not.toHaveBeenCalled();
  });

  it("asks the page to move itself when the worker cannot redirect it (iPhone, uncontrolled window)", async () => {
    const open = win({ navigate: vi.fn(async () => Promise.reject(new TypeError("not controlled"))) });
    const w = worker([open]);
    await w.tap("/activity/t1");
    expect(open.postMessage).toHaveBeenCalledWith({ type: "pesa:open", url: `${ORIGIN}/activity/t1` });
    expect(w.openWindow).not.toHaveBeenCalled();
  });

  it("opens the app when the window refuses to come forward", async () => {
    const open = win({ focus: vi.fn(async () => Promise.reject(new Error("InvalidAccessError"))) });
    const w = worker([open]);
    await w.tap("/bills");
    expect(w.openWindow).toHaveBeenCalledWith(`${ORIGIN}/bills`);
  });

  it("stores the screen before bringing the app forward, for the page to pick up (iPhone)", async () => {
    const open = win({ navigate: vi.fn(async () => open) });
    const w = worker([open], true);
    await w.tap("/settings");
    const [key, value] = [...w.stored.entries()][0]!;
    expect(key).toBe(`pesa-open|${ORIGIN}/__pesa-open`);
    expect(JSON.parse(value)).toEqual({ url: `${ORIGIN}/settings`, at: expect.any(Number) });
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/settings`);
  });

  it("still opens the screen when the Cache API fails", async () => {
    const w = worker([], true);
    (w.self as unknown as { caches: { open: () => Promise<never> } }).caches.open = async () => {
      throw new Error("quota");
    };
    await w.tap("/bills");
    expect(w.openWindow).toHaveBeenCalledWith(`${ORIGIN}/bills`);
  });

  it("shows a pushed notice with the screen to open", async () => {
    const w = worker([]);
    await w.push({
      title: "Rent is due tomorrow",
      body: "KES 12,500",
      url: "/bills",
      tag: "bill_tomorrow:tomorrow:m1",
    });
    expect(w.self.registration.showNotification).toHaveBeenCalledWith(
      "Rent is due tomorrow",
      expect.objectContaining({
        body: "KES 12,500",
        tag: "bill_tomorrow:tomorrow:m1",
        data: { url: "/bills" },
      }),
    );
  });
});

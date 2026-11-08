// [4.4] #141 The screen a tapped notification is about, handed from the service worker to the page.
// On iPhone the worker's navigate() can be ignored without an error, a message to a page frozen in the background is
// lost, and a closed app starts at the manifest's start_url (which reopens the last screen). So public/push-sw.js
// also writes the target into the Cache API before it brings the app forward, and the page takes it from there
// when it starts, comes back to the front or gets the worker's message. Taking it clears it, so it is used once.

export const OPEN_CACHE = "pesa-open";
export const OPEN_KEY = "/__pesa-open";
/** A target older than this is from a tap that was already handled some other way (or never arrived): ignore it. */
export const OPEN_MAX_AGE_MS = 5 * 60 * 1000;

/** The same-site path for a URL, or null for anything that leaves the app. */
export function sameSitePath(url: string, origin = window.location.origin) {
  try {
    const target = new URL(url, origin);
    return target.origin === origin ? target.pathname + target.search + target.hash : null;
  } catch {
    return null;
  }
}

/** Reads and clears the pending target. Null when there is none, it is stale, or the Cache API is unavailable. */
export async function takePendingOpen(now = Date.now()): Promise<string | null> {
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open(OPEN_CACHE);
    const hit = await cache.match(OPEN_KEY);
    if (!hit) return null;
    await cache.delete(OPEN_KEY);
    const { url, at } = (await hit.json()) as { url?: string; at?: number };
    if (!url || typeof at !== "number" || now - at > OPEN_MAX_AGE_MS) return null;
    return sameSitePath(url);
  } catch {
    return null;
  }
}

/** Follows a tapped notification: at start, whenever the app returns to the front, and on the worker's message. */
export function watchPendingOpen(go: (path: string) => void) {
  let busy = false;
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      const path = await takePendingOpen();
      if (path && path !== window.location.pathname + window.location.search + window.location.hash) go(path);
    } finally {
      busy = false;
    }
  };

  void check();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  window.addEventListener("focus", () => void check());
  window.addEventListener("pageshow", () => void check());
  navigator.serviceWorker?.addEventListener(
    "message",
    (event: MessageEvent<{ type?: string; url?: string }>) => {
      if (event.data?.type !== "pesa:open" || !event.data.url) return;
      const path = sameSitePath(event.data.url);
      if (path) go(path);
      // The message did its job; drop the stored copy so a later focus does not repeat it.
      void takePendingOpen();
    },
  );
}

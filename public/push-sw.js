// [4.4] Push notifications, loaded into the generated service worker (vite.config.ts workbox.importScripts).
// The notify Edge Function sends { title, body, url, tag }; tapping opens that screen in the app.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Pesa", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Pesa", {
      body: data.body || "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

// Tapping opens the screen the notification is about. On iPhone, bringing a window forward can be refused and a
// window this worker does not control cannot be redirected, so each step falls back: focus, then navigate or ask
// the page to go there itself (src/app/App.tsx listens for "pesa:open"), and if any of that fails or no window is
// open, open the app at that screen.
// #141 On iPhone none of those steps is reliable (navigate can be ignored silently, a message to a frozen page is
// lost, a closed app starts on its last screen), so the target is also stored first; the page takes it when it
// starts or comes to the front (src/app/pendingOpen.ts; keep the cache name and key in step).
async function rememberTarget(scope, url) {
  try {
    if (!scope.caches) return;
    const cache = await scope.caches.open("pesa-open");
    await cache.put(
      new Request(new URL("/__pesa-open", scope.location.origin).href),
      new Response(JSON.stringify({ url, at: Date.now() }), {
        headers: { "content-type": "application/json" },
      }),
    );
  } catch {
    // No Cache API: the other steps still run.
  }
}

async function openFromNotification(scope, url) {
  await rememberTarget(scope, url);
  const windows = await scope.clients.matchAll({ type: "window", includeUncontrolled: true });
  const open = windows.find((w) => w.url.startsWith(scope.location.origin));
  if (open) {
    try {
      const focused = (await open.focus()) || open;
      try {
        if (focused.navigate) {
          await focused.navigate(url);
          return;
        }
      } catch {
        // Not controlled by this worker: the page moves itself.
      }
      focused.postMessage({ type: "pesa:open", url });
      return;
    } catch {
      // Could not bring it forward: open the app instead.
    }
  }
  if (scope.clients.openWindow) await scope.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(openFromNotification(self, url));
});

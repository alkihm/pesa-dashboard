import { createBrowserRouter, RouterProvider } from "react-router";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { launchPath, rememberRoute } from "./lastRoute";
import { routes } from "./routes";

const start = launchPath(window.location);
if (start) window.history.replaceState(null, "", start);

const router = createBrowserRouter(routes);
router.subscribe(({ location }) => rememberRoute(location.pathname, location.search));
rememberRoute(window.location.pathname, window.location.search);

// [4.4] A tapped notification whose window could not be redirected by the service worker asks the page to go
// there itself (public/push-sw.js). Only same-site paths are followed.
navigator.serviceWorker?.addEventListener(
  "message",
  (event: MessageEvent<{ type?: string; url?: string }>) => {
    if (event.data?.type !== "pesa:open" || !event.data.url) return;
    const target = new URL(event.data.url, window.location.origin);
    if (target.origin === window.location.origin)
      void router.navigate(target.pathname + target.search + target.hash);
  },
);

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}

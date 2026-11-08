import { createBrowserRouter, RouterProvider } from "react-router";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { launchPath, rememberRoute } from "./lastRoute";
import { watchPendingOpen } from "./pendingOpen";
import { routes } from "./routes";

const start = launchPath(window.location);
if (start) window.history.replaceState(null, "", start);

const router = createBrowserRouter(routes);
router.subscribe(({ location }) => rememberRoute(location.pathname, location.search));
rememberRoute(window.location.pathname, window.location.search);

// [4.4] #141 A tapped notification opens its screen, however the service worker managed to hand it over
// (public/push-sw.js, ./pendingOpen.ts). Only same-site paths are followed.
watchPendingOpen((path) => void router.navigate(path));

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}

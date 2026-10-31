import { createBrowserRouter, RouterProvider } from "react-router";
import { launchPath, rememberRoute } from "./lastRoute";
import { routes } from "./routes";

const start = launchPath(window.location);
if (start) window.history.replaceState(null, "", start);

const router = createBrowserRouter(routes);
router.subscribe(({ location }) => rememberRoute(location.pathname, location.search));
rememberRoute(window.location.pathname, window.location.search);

export function App() {
  return <RouterProvider router={router} />;
}

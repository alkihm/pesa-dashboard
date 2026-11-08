import { Outlet, type RouteObject } from "react-router";
import { RequireSession } from "@/features/auth/RequireSession";
import { SignInScreen } from "@/features/auth/SignInScreen";
import { SyncProvider } from "@/features/sync/SyncProvider";
import { collectFeatureRoutes, type FeatureRoutes } from "./featureRoutes";
import { AppShell } from "./shell/AppShell";
import { NotFound } from "./Placeholder";

// [5.0] Each feature registers its screens in src/features/<feature>/routes.tsx (see featureRoutes.ts). This file
// keeps only the shell, sign-in, the dev gallery and the catch-all, so two laptops never edit the same line here.
export const featureRoutes = collectFeatureRoutes(
  import.meta.glob<{ routes: FeatureRoutes }>("/src/features/*/routes.tsx", { eager: true }),
);

export const routes: RouteObject[] = [
  { path: "/sign-in", element: <SignInScreen /> },
  {
    element: (
      <RequireSession>
        <Outlet />
      </RequireSession>
    ),
    children: featureRoutes.signedIn,
  },
  {
    element: (
      <RequireSession>
        <SyncProvider>
          <AppShell />
        </SyncProvider>
      </RequireSession>
    ),
    children: [
      ...featureRoutes.shell,
      ...(import.meta.env.DEV
        ? [
            {
              path: "dev/components",
              lazy: () => import("./dev/ComponentGallery").then((m) => ({ Component: m.ComponentGallery })),
            },
          ]
        : []),
      { path: "*", element: <NotFound /> },
    ],
  },
];

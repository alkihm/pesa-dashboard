import type { RouteObject } from "react-router";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { AppShell } from "./shell/AppShell";
import { NotFound, Placeholder } from "./Placeholder";

// Every screen in docs/DESIGN.md. Placeholders name the issue that builds the real screen.
export const routes: RouteObject[] = [
  { path: "/sign-in", element: <Placeholder title="Sign in" issue="2.1" bare /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Placeholder title="Overview" phoneTitle="Budget" issue="2.2" home /> },
      { path: "activity", element: <Placeholder title="Activity" issue="2.5" /> },
      { path: "activity/:id", element: <Placeholder title="Transaction" issue="2.6" back="/activity" /> },
      { path: "transactions/new", element: <Placeholder title="Add transaction" issue="2.7" back="/" /> },
      { path: "month", element: <Placeholder title="Month" issue="2.4" /> },
      { path: "bills", element: <Placeholder title="Bills & budget" issue="3.1" /> },
      { path: "review", element: <Placeholder title="Review & reconcile" issue="4.1" /> },
      { path: "accounts", element: <Placeholder title="Accounts" issue="2.3" back="/" /> },
      { path: "accounts/savings", element: <Placeholder title="Savings" issue="2.3" back="/accounts" /> },
      { path: "accounts/debt", element: <Placeholder title="Debt" issue="2.3" back="/accounts" /> },
      { path: "accounts/new", element: <Placeholder title="New account" issue="2.9" back="/accounts" /> },
      { path: "categories", element: <Placeholder title="Categories" issue="2.8" back="/" /> },
      {
        path: "categories/new",
        element: <Placeholder title="New category" issue="2.8" back="/categories" />,
      },
      { path: "settings", element: <SettingsScreen /> },
      { path: "report", element: <Placeholder title="Month report" issue="4.8" back="/month" /> },
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

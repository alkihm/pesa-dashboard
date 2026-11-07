import type { RouteObject } from "react-router";
import { AccountsScreen, DebtScreen, SavingsScreen } from "@/features/accounts/AccountsScreen";
import { NewAccountScreen } from "@/features/accounts/new/NewAccountScreen";
import { ActivityScreen } from "@/features/activity/ActivityScreen";
import { TransactionScreen } from "@/features/activity/TransactionScreen";
import { BillsScreen } from "@/features/bills/BillsScreen";
import { NewBudgetItemScreen } from "@/features/bills/BudgetItems";
import { NewBillScreen } from "@/features/bills/NewBillScreen";
import { RequireSession } from "@/features/auth/RequireSession";
import { SignInScreen } from "@/features/auth/SignInScreen";
import { CategoriesScreen, CategoryScreen } from "@/features/categories/CategoriesScreen";
import { MonthScreen } from "@/features/month/MonthScreen";
import { OverviewScreen } from "@/features/overview/OverviewScreen";
import { ReportScreen } from "@/features/report/ReportScreen";
import { ReviewScreen } from "@/features/review/ReviewScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { SyncProvider } from "@/features/sync/SyncProvider";
import { AddTransactionScreen } from "@/features/transactions/AddTransactionScreen";
import { AppShell } from "./shell/AppShell";
import { NotFound } from "./Placeholder";

// Every screen in docs/DESIGN.md. Placeholders name the issue that builds the real screen.
export const routes: RouteObject[] = [
  { path: "/sign-in", element: <SignInScreen /> },
  // [4.8] Outside the app shell, so the phone tab bar never prints.
  {
    path: "/report",
    element: (
      <RequireSession>
        <ReportScreen />
      </RequireSession>
    ),
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
      { index: true, element: <OverviewScreen /> },
      { path: "activity", element: <ActivityScreen /> },
      { path: "activity/:id", element: <TransactionScreen /> },
      { path: "transactions/new", element: <AddTransactionScreen /> },
      { path: "month", element: <MonthScreen /> },
      { path: "bills", element: <BillsScreen /> },
      { path: "bills/new", element: <NewBillScreen /> },
      { path: "bills/budget/new", element: <NewBudgetItemScreen /> },
      { path: "review", element: <ReviewScreen /> },
      { path: "accounts", element: <AccountsScreen /> },
      { path: "accounts/savings", element: <SavingsScreen /> },
      { path: "accounts/debt", element: <DebtScreen /> },
      { path: "accounts/new", element: <NewAccountScreen /> },
      { path: "categories", element: <CategoriesScreen /> },
      { path: "categories/new", element: <CategoryScreen /> },
      { path: "categories/:id", element: <CategoryScreen /> },
      { path: "settings", element: <SettingsScreen /> },
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

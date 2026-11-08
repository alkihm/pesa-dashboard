import type { FeatureRoutes } from "@/app/featureRoutes";
import { AccountsScreen, DebtScreen, SavingsScreen } from "./AccountsScreen";
import { NewAccountScreen } from "./new/NewAccountScreen";

export const routes: FeatureRoutes = {
  shell: [
    { path: "accounts", element: <AccountsScreen /> },
    { path: "accounts/savings", element: <SavingsScreen /> },
    { path: "accounts/debt", element: <DebtScreen /> },
    { path: "accounts/new", element: <NewAccountScreen /> },
  ],
};

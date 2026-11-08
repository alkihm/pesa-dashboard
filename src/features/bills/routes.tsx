import type { FeatureRoutes } from "@/app/featureRoutes";
import { BillsScreen } from "./BillsScreen";
import { NewBudgetItemScreen } from "./BudgetItems";
import { NewBillScreen } from "./NewBillScreen";

export const routes: FeatureRoutes = {
  shell: [
    { path: "bills", element: <BillsScreen /> },
    { path: "bills/new", element: <NewBillScreen /> },
    { path: "bills/budget/new", element: <NewBudgetItemScreen /> },
  ],
};

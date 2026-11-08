import type { FeatureRoutes } from "@/app/featureRoutes";
import { AddTransactionScreen } from "./AddTransactionScreen";

export const routes: FeatureRoutes = {
  shell: [{ path: "transactions/new", element: <AddTransactionScreen /> }],
};

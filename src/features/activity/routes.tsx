import type { FeatureRoutes } from "@/app/featureRoutes";
import { ActivityScreen } from "./ActivityScreen";
import { TransactionScreen } from "./TransactionScreen";

export const routes: FeatureRoutes = {
  shell: [
    { path: "activity", element: <ActivityScreen /> },
    { path: "activity/:id", element: <TransactionScreen /> },
  ],
};

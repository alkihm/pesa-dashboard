import type { FeatureRoutes } from "@/app/featureRoutes";
import { MonthScreen } from "./MonthScreen";

export const routes: FeatureRoutes = {
  shell: [{ path: "month", element: <MonthScreen /> }],
};

import type { FeatureRoutes } from "@/app/featureRoutes";
import { PlanScreen } from "./PlanScreen";

export const routes: FeatureRoutes = {
  shell: [{ path: "plan", element: <PlanScreen /> }],
};

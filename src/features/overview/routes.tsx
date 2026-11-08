import type { FeatureRoutes } from "@/app/featureRoutes";
import { OverviewScreen } from "./OverviewScreen";

export const routes: FeatureRoutes = {
  shell: [{ index: true, element: <OverviewScreen /> }],
};

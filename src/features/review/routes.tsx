import type { FeatureRoutes } from "@/app/featureRoutes";
import { ReviewScreen } from "./ReviewScreen";

export const routes: FeatureRoutes = {
  shell: [{ path: "review", element: <ReviewScreen /> }],
};

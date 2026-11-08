import type { FeatureRoutes } from "@/app/featureRoutes";
import { ImportScreen } from "./ImportScreen";

export const routes: FeatureRoutes = {
  shell: [{ path: "import", element: <ImportScreen /> }],
};

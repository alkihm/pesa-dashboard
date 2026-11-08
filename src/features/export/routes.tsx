import type { FeatureRoutes } from "@/app/featureRoutes";
import { ExportScreen } from "./ExportScreen";

export const routes: FeatureRoutes = {
  shell: [{ path: "export", element: <ExportScreen /> }],
};

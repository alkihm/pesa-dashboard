import type { FeatureRoutes } from "@/app/featureRoutes";
import { SettingsScreen } from "./SettingsScreen";

export const routes: FeatureRoutes = {
  shell: [{ path: "settings", element: <SettingsScreen /> }],
};

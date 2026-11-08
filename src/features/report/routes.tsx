import type { FeatureRoutes } from "@/app/featureRoutes";
import { ReportScreen } from "./ReportScreen";

// [4.8] Outside the app shell, so the phone tab bar never prints.
export const routes: FeatureRoutes = {
  signedIn: [{ path: "/report", element: <ReportScreen /> }],
};

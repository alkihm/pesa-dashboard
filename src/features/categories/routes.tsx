import type { FeatureRoutes } from "@/app/featureRoutes";
import { CategoriesScreen, CategoryScreen } from "./CategoriesScreen";

export const routes: FeatureRoutes = {
  shell: [
    { path: "categories", element: <CategoriesScreen /> },
    { path: "categories/new", element: <CategoryScreen /> },
    { path: "categories/:id", element: <CategoryScreen /> },
  ],
};

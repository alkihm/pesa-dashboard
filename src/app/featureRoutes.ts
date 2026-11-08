import type { RouteObject } from "react-router";

/**
 * What a feature registers in its own `src/features/<feature>/routes.tsx` ([5.0], #134). `src/app/routes.tsx` collects
 * every file with `import.meta.glob`, so adding a screen never touches a shared file.
 *
 * - `shell`: signed in, inside the AppShell (header, sidebar, tab bar). Paths are relative, without a leading `/`.
 * - `signedIn`: signed in but outside the shell, e.g. `/report`, which prints alone. Paths start with `/`.
 */
export interface FeatureRoutes {
  shell?: RouteObject[];
  signedIn?: RouteObject[];
}

/** Merge every feature's routes in a stable order (by file path), so the list is the same on every build. */
export function collectFeatureRoutes(
  modules: Record<string, { routes: FeatureRoutes }>,
): Required<FeatureRoutes> {
  const shell: RouteObject[] = [];
  const signedIn: RouteObject[] = [];
  const files = Object.entries(modules).sort(([a], [b]) => a.localeCompare(b));
  for (const [file, { routes }] of files) {
    if (!routes) throw new Error(`${file} must export \`routes\` (a FeatureRoutes object)`);
    shell.push(...(routes.shell ?? []));
    signedIn.push(...(routes.signedIn ?? []));
  }
  return { shell, signedIn };
}

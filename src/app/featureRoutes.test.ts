import { collectFeatureRoutes } from "./featureRoutes";
import { featureRoutes } from "./routes";

describe("per-feature routes [5.0]", () => {
  it("merges every feature's routes in file order", () => {
    const collected = collectFeatureRoutes({
      "/src/features/b/routes.tsx": { routes: { shell: [{ path: "b" }] } },
      "/src/features/a/routes.tsx": { routes: { shell: [{ path: "a" }], signedIn: [{ path: "/a-print" }] } },
    });
    expect(collected.shell.map((r) => r.path)).toEqual(["a", "b"]);
    expect(collected.signedIn.map((r) => r.path)).toEqual(["/a-print"]);
  });

  it("names the file that forgot to export routes", () => {
    expect(() => collectFeatureRoutes({ "/src/features/x/routes.tsx": {} as never })).toThrow(
      "/src/features/x/routes.tsx must export `routes`",
    );
  });

  it("finds the real feature files", () => {
    expect(featureRoutes.shell.length).toBeGreaterThan(15);
    expect(featureRoutes.signedIn.map((r) => r.path)).toContain("/report");
  });

  // A leading "/" inside the shell would still match, but read as outside it; keep the two lists honest.
  it("keeps shell paths relative and outside-shell paths absolute", () => {
    expect(featureRoutes.shell.filter((r) => r.path?.startsWith("/"))).toEqual([]);
    expect(featureRoutes.signedIn.filter((r) => !r.path?.startsWith("/"))).toEqual([]);
  });
});

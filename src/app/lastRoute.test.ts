import { LAST_ROUTE_KEY, launchPath, rememberRoute } from "./lastRoute";

const at = (pathname: string, search = "", hash = "") => ({ pathname, search, hash });

describe("last route", () => {
  afterEach(() => localStorage.clear());

  it("leaves ordinary visits alone", () => {
    rememberRoute("/bills");
    expect(launchPath(at("/month"))).toBeNull();
  });

  it("reopens the saved screen when launched from the home screen", () => {
    rememberRoute("/accounts/savings", "?tab=goals");
    expect(launchPath(at("/", "?source=pwa"))).toBe("/accounts/savings?tab=goals");
  });

  it("falls back to the start URL without the marker when nothing is saved", () => {
    expect(launchPath(at("/", "?source=pwa"))).toBe("/");
    expect(launchPath(at("/", "?source=pwa&x=1", "#top"))).toBe("/?x=1#top");
  });

  it("does not remember sign-in or developer pages", () => {
    rememberRoute("/sign-in");
    rememberRoute("/dev/components");
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBeNull();
  });

  it("ignores a saved value that is not a local path", () => {
    localStorage.setItem(LAST_ROUTE_KEY, "//example.com/");
    expect(launchPath(at("/", "?source=pwa"))).toBe("/");
  });
});

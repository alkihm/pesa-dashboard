import { applyTheme, getThemePreference, resolveTheme, setThemePreference, THEME_STORAGE_KEY } from "./theme";

describe("theme", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.unstubAllGlobals();
  });

  it("follows the system when nothing is stored", () => {
    expect(getThemePreference()).toBe("system");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("ignores an unknown stored value", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(getThemePreference()).toBe("system");
  });

  it("stores and applies an override", () => {
    setThemePreference("dark");
    expect(getThemePreference()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("clears the override when set back to system", () => {
    setThemePreference("light");
    setThemePreference("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("resolves system to the media query result", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(prefers-color-scheme: dark)" }));
    expect(resolveTheme("system")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
  });
});

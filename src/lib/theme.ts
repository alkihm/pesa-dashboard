export type ThemePreference = "system" | "light" | "dark";

// Also read by the pre-paint script in index.html — keep the two in step.
export const THEME_STORAGE_KEY = "pesa-theme";

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(preference: ThemePreference, root: HTMLElement = document.documentElement) {
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
  syncThemeColor();
}

/**
 * Points the browser's theme-color (iOS status bar, Android toolbar) at the header colour actually on screen.
 * The tags in index.html follow the system setting only, so an in-app override would leave the wrong colour.
 * The body is painted in the header colour (base.css), so its computed background is the resolved value.
 */
export function syncThemeColor() {
  const colour = getComputedStyle(document.body).backgroundColor;
  if (!colour) return;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = colour;
  });
}

/** Keeps theme-color right from start-up and when the system setting changes while following it. */
export function watchThemeColor() {
  syncThemeColor();
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", syncThemeColor);
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage blocked (private mode): the choice still applies for this visit.
  }
  applyTheme(preference);
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

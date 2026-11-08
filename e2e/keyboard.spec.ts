import { expect, test, type Page } from "@playwright/test";
import { settled, signIn } from "./support";

// [5.2] Keyboard pass, the part axe cannot check: Tab moves through every screen without getting stuck, and each
// control it lands on shows a focus ring. Read-only: only Tab is pressed, never Enter or Space.
const screens = [
  ["Overview", "/"],
  ["Activity", "/activity"],
  ["Add transaction", "/transactions/new"],
  ["Month", "/month"],
  ["Bills", "/bills"],
  ["Review", "/review"],
  ["Accounts", "/accounts"],
  ["New account", "/accounts/new"],
  ["Categories", "/categories"],
  ["Settings", "/settings"],
  ["Export", "/export"],
  ["Import", "/import"],
  ["Report", "/report?m=2026-10"],
] as const;

const MAX_TABS = 80;

interface Stop {
  label: string;
  ring: boolean;
}

/** What has focus now, and whether it (or its label, for hidden inputs) draws a visible focus indicator. */
function focused(page: Page) {
  return page.evaluate((): Stop | null => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    // Focus inside the browser's own parts of a control (the calendar button of a date or month input): the
    // browser draws that ring, and the page cannot style it.
    if (!el.matches(":focus")) return { label: "browser control", ring: true };
    const visible = (e: Element) => {
      const s = getComputedStyle(e);
      const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      return outline || s.boxShadow !== "none";
    };
    // Visually hidden inputs (switches, chips) draw the ring on their label or wrapper.
    const ring =
      visible(el) ||
      (el.parentElement !== null && visible(el.parentElement)) ||
      Boolean(el.closest("label") && visible(el.closest("label")!));
    const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? "";
    return { label: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${name}"`, ring };
  });
}

test("Tab reaches every screen's controls and each shows a focus ring", async ({ page }) => {
  await signIn(page);
  for (const [name, path] of screens) {
    await test.step(name, async () => {
      await page.goto(path);
      await settled(page);
      const stops: Stop[] = [];
      let first: string | null = null;
      for (let i = 0; i < MAX_TABS; i++) {
        await page.keyboard.press("Tab");
        const stop = await focused(page);
        if (!stop) continue;
        if (stop.label === first) break; // wrapped round: the whole screen was reached
        first ??= stop.label;
        stops.push(stop);
      }
      expect.soft(stops.length, `${name}: Tab reached no control`).toBeGreaterThan(2);
      expect
        .soft(
          stops.filter((s) => !s.ring).map((s) => s.label),
          `${name}: focused without a visible ring`,
        )
        .toEqual([]);
    });
  }
});

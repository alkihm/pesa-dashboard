import { expect, test } from "@playwright/test";
import { settled, signIn, snap } from "./support";

// Every main screen opens for the seed user without a page error, fits the width, and gets a screenshot in the
// report (phone in light, desktop in dark). Read-only: nothing here writes to the database.
const screens = [
  ["Overview", "/"],
  ["Activity", "/activity"],
  ["Month", "/month"],
  ["Bills", "/bills"],
  ["Review", "/review"],
  ["Accounts", "/accounts"],
  ["Categories", "/categories"],
  ["Settings", "/settings"],
  ["Export", "/export"],
  ["Import", "/import"],
  ["Report", "/report?m=2026-10"],
] as const;

test("every main screen opens", async ({ page }, info) => {
  const errors = await signIn(page);
  for (const [name, path] of screens) {
    await test.step(name, async () => {
      await page.goto(path);
      await settled(page);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Not found" })).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
      await snap(page, info, name);
    });
  }
  expect(errors, "page errors").toEqual([]);
});

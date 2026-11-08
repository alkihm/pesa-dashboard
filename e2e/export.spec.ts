import { expect, test } from "@playwright/test";
import { settled, signIn } from "./support";

// [4.10] Export everything downloads one zip.
test("export downloads a zip", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-light", "one download check is enough");
  await signIn(page);
  await page.goto("/export");
  await settled(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Download everything/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
});

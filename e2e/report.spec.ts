import { expect, test } from "@playwright/test";
import { settled, signIn } from "./support";

// [4.8] The month report prints on one A4 page, even when the screen is in dark mode.
test("month report prints on one A4 page", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-dark", "one print check is enough");
  await signIn(page);
  await page.goto("/report?m=2026-10");
  await settled(page);

  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  await info.attach("report.pdf", { body: pdf, contentType: "application/pdf" });

  const pages = pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? [];
  expect(pages.length).toBe(1);
});

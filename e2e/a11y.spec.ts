import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SEED_USER, settled, signIn } from "./support";

// [5.2] axe (WCAG 2.1 A + AA, including colour contrast 4.5:1) on every screen. The two projects run it at phone
// width in light mode and desktop width in dark mode, so both themes are covered. Read-only: forms are opened,
// never saved. The keyboard pass that axe cannot do is written up in docs/A11Y.md.
const screens = [
  ["Overview", "/"],
  ["Activity", "/activity"],
  ["Add transaction", "/transactions/new"],
  ["Month", "/month"],
  ["Bills", "/bills"],
  ["New bill", "/bills/new"],
  ["New budget item", "/bills/budget/new"],
  ["Review", "/review"],
  ["Accounts", "/accounts"],
  ["Savings", "/accounts/savings"],
  ["Debt", "/accounts/debt"],
  ["New account", "/accounts/new"],
  ["Categories", "/categories"],
  ["New category", "/categories/new"],
  ["Settings", "/settings"],
  ["Export", "/export"],
  ["Import", "/import"],
  ["Report", "/report?m=2026-10"],
] as const;

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function check(page: Page, info: TestInfo, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  if (violations.length > 0) {
    await info.attach(`axe · ${name} · ${info.project.name}`, {
      body: JSON.stringify(violations, null, 2),
      contentType: "application/json",
    });
  }
  // One line per problem and element, so the CI log says what to fix without opening the report.
  const lines = violations.flatMap((v) =>
    v.nodes.map(
      (n) => `${v.id} (${v.impact}): ${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1]?.trim()}`,
    ),
  );
  // Soft, so one run lists every screen's problems instead of stopping at the first.
  expect.soft(lines, `${name}: accessibility problems`).toEqual([]);
}

test("sign-in screen has no accessibility problems", async ({ page }, info) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await check(page, info, "Sign in");
});

test("every screen has no accessibility problems", async ({ page }, info) => {
  await signIn(page);
  for (const [name, path] of screens) {
    await test.step(name, async () => {
      await page.goto(path);
      await settled(page);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await check(page, info, name);
    });
  }
});

test("a transaction's detail screen has no accessibility problems", async ({ page }, info) => {
  const db = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false },
  });
  await db.auth.signInWithPassword(SEED_USER);
  const { data, error } = await db.from("transactions").select("id").limit(1).single();
  if (error) throw error;

  await signIn(page);
  await page.goto(`/activity/${data.id}`);
  await settled(page);
  await expect(page.getByRole("heading", { level: 1, name: "Transaction" })).toBeVisible();
  await check(page, info, "Transaction");
});

import { expect, test } from "@playwright/test";
import { settled, signIn, snap, throwawayUser, type TestUser } from "./support";

// [4.7] Import round trip: upload a CSV, import it, then upload the same file again and get "nothing new".
// Runs as a throwaway user, so the rows never reach the seed user and are deleted with the user afterwards.
let user: TestUser;

test.beforeEach(async () => {
  user = await throwawayUser();
  const { error } = await user.client
    .from("accounts")
    .insert({ name: "E2E Wallet", kind: "wallet", counts_in_net: true });
  if (error) throw error;
});

test.afterEach(async () => {
  await user?.remove();
});

test("import a CSV, then the same file again", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-light", "one round trip is enough");
  const errors = await signIn(page, user);
  await page.goto("/import");
  await settled(page);

  const csv = [
    "Date,Account,Kind,Amount (KES),Payee,Ref",
    "2026-10-03,E2E Wallet,income,5000,Invented Employer,E2EREF0001",
    "2026-10-04,E2E Wallet,spending,1250.50,Invented Grocer,E2EREF0002",
  ].join("\n");
  const file = { name: "e2e.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };

  await page.getByLabel("File to import").setInputFiles(file);
  await page.getByRole("button", { name: "Import 2 transactions" }).click();
  await expect(page.getByText(/Imported 2 transactions/)).toBeVisible();
  await snap(page, info, "Import done");

  const { count } = await user.client.from("transactions").select("id", { count: "exact", head: true });
  expect(count).toBe(2);

  await page.goto("/import");
  await settled(page);
  await page.getByLabel("File to import").setInputFiles(file);
  await expect(page.getByRole("button", { name: "Nothing new to import" })).toBeVisible();
  expect(errors, "page errors").toEqual([]);
});

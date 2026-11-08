import { randomUUID } from "node:crypto";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The seed user (supabase/seed.sql). Read-only tests sign in as this user; tests that write data use
// throwawayUser() instead, so nothing they create is left in a shared database.
export const SEED_USER = { email: "sample@example.test", password: "sample-password-1" };
export const TEST_PIN = "135790";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  /** A client signed in as this user, for setting up rows under row-level security. */
  client: SupabaseClient;
  remove(): Promise<void>;
}

function env(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is not set. In CI it comes from \`supabase status -o env\`; see WORKFLOW.md.`);
  return value;
}

/** A new confirmed user with no data. `remove()` deletes it, and every row it owns goes with it (on delete cascade). */
export async function throwawayUser(): Promise<TestUser> {
  const url = env("SUPABASE_URL");
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const email = `e2e-${randomUUID()}@example.test`;
  const password = `e2e-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");

  const client = createClient(url, env("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  const id = data.user.id;
  return {
    id,
    email,
    password,
    client,
    async remove() {
      const { error: removeError } = await admin.auth.admin.deleteUser(id);
      if (removeError) throw removeError;
    },
  };
}

/**
 * Signs in, then gets past the PIN gate (choosing TEST_PIN if the user has none). The production build only
 * offers Google on the sign-in screen, so the session is made here with the password and handed to the page the
 * way supabase-js stores it (localStorage, `sb-<first host label>-auth-token`).
 */
export async function signIn(page: Page, user: { email: string; password: string } = SEED_USER) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const url = env("SUPABASE_URL");
  const client = createClient(url, env("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword(user);
  if (error || !data.session) throw error ?? new Error("signInWithPassword returned no session");
  const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

  await page.goto("/sign-in");
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify(data.session)] as const);
  await page.goto("/");
  await expect(page.getByLabel("Loading")).toHaveCount(0, { timeout: 20_000 });

  const choose = page.getByText(/^Choose a (new )?PIN$/);
  const enter = page.getByText("Enter your PIN");
  const empty = page.getByRole("status", { name: "0 of 6 digits entered" });
  if (await choose.isVisible()) {
    await page.keyboard.type(TEST_PIN);
    await expect(empty).toBeVisible(); // the pad clears and asks for the PIN again
    await page.keyboard.type(TEST_PIN);
  } else if (await enter.isVisible()) {
    // A password sign-in counts as recent, so the gate should not ask. Never guess: wrong tries lock the account.
    throw new Error(
      "The PIN gate asked for an existing PIN after a fresh sign-in. Check pin_recent_sign_in().",
    );
  }
  await expect(choose.or(enter)).toHaveCount(0, { timeout: 15_000 });
  return errors;
}

/** Waits until no loading splash or skeleton is left on the page. */
export async function settled(page: Page) {
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0, { timeout: 20_000 });
}

/** Attaches a full-page screenshot to the test report, named after the project (phone-light, desktop-dark). */
export async function snap(page: Page, info: TestInfo, name: string) {
  const body = await page.screenshot({ fullPage: true });
  await info.attach(`${name} · ${info.project.name}`, { body, contentType: "image/png" });
}

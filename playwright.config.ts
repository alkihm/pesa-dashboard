import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (e2e/) against a production build and a local Supabase with the seed data. CI runs them on a
// fresh stack in the `e2e` job; on the server you can point them at your own dev server with E2E_BASE_URL.
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  // One worker: the tests share one database and nascore has little memory to spare.
  workers: 1,
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    // The PWA service worker would cache between tests; the tests check the network build, not offline mode.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "phone-light",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 900 }, colorScheme: "light" },
    },
    {
      name: "desktop-dark",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, colorScheme: "dark" },
    },
    // [5.1] The other two engines, CI only: nascore lacks their system libraries (E2E_ALL_BROWSERS=1 forces them).
    // WebKit is Safari's engine, run as an iPhone (touch, mobile viewport); the owner's real iPhone check is
    // docs/DEVICE-CHECKLIST.md. Firefox stands in for the other desktop browsers (Edge is Chromium).
    ...(ci || process.env.E2E_ALL_BROWSERS
      ? [
          { name: "iphone-webkit", use: { ...devices["iPhone 15"], colorScheme: "dark" as const } },
          {
            name: "desktop-firefox",
            use: {
              ...devices["Desktop Firefox"],
              viewport: { width: 1280, height: 900 },
              colorScheme: "light" as const,
            },
          },
        ]
      : []),
  ],
  // Without E2E_BASE_URL, serve the build in dist/ (run `pnpm build` first, with the local stack's env values).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm preview --host 127.0.0.1 --port 4173 --strictPort",
        url: baseURL,
        reuseExistingServer: !ci,
      },
});

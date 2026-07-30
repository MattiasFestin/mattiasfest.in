import { defineConfig, devices } from "@playwright/test";

/* E2E tests run against the local dev server (scripts/dev.mjs), which
   serves a full production-ish build (zola + math + optimize) from
   public/. A dedicated port keeps it from colliding with a dev server
   you may already have running on 1111. */
const PORT = 1112;

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  /* The site is static and served locally; everything should be
     near-instant. Keep timeouts short so regressions fail fast. */
  timeout: 10_000,
  expect: { timeout: 2_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 2_000,
    navigationTimeout: 5_000,
    /* main.js already skips SW registration on 127.0.0.1, but block it
       outright so tests always exercise the network, never a cache. */
    serviceWorkers: "block",
    trace: "on-first-retry",
  },
  /* Top browser engines: Chrome, Firefox, Safari - desktop and mobile.
     (Firefox has no mobile emulation in Playwright.) */
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: "node scripts/dev.mjs",
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

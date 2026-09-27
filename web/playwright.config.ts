import { defineConfig, devices } from "@playwright/test";

// Smoke tests against a running build on a local Supabase seeded by
// scripts/seed-e2e.ts. CI starts both; see the e2e job in .github/workflows/ci.yml.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      grep: /@mobile/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});

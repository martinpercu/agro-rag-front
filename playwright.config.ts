import { defineConfig, devices } from "@playwright/test";

// Dev server corre en :3002 (no levantar otro — lockfile de Next).
// reuseExistingServer:true reutiliza el del usuario.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:3002",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
      threshold: 0.3,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3002",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

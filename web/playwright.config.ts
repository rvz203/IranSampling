import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3001";
if (process.env.E2E_TEST_MODE !== "1") {
  throw new Error(
    "Run scripts/test-platform.ps1 to prepare the isolated Go/PostgreSQL test environment.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  outputDir: "test-results/artifacts",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/platform-results.json" }],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL,
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    viewport: { width: 1440, height: 1000 },
    locale: "en-GB",
    timezoneId: "Asia/Tehran",
    permissions: ["geolocation"],
    geolocation: { latitude: 35.7902, longitude: 51.4105, accuracy: 15 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${new URL(baseURL).port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      E2E_TEST_MODE: "1",
      API_URL: process.env.E2E_API_URL || "http://127.0.0.1:8081",
    },
  },
});

import { defineConfig, devices } from "@playwright/test";

/** Browser-based development checks. No test writes to FarmingMain. */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.EXPO_TEST_URL || "http://127.0.0.1:19006",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.EXPO_TEST_URL ? undefined : {
    command: "npx expo start --web --port 19006",
    url: "http://127.0.0.1:19006/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

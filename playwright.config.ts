import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure" },
  webServer: [
    {
      command:
        "npx wrangler d1 migrations apply DB --local --persist-to work/e2e-data && npx wrangler dev --local --port 8790 --persist-to work/e2e-data --var ALLOWED_ORIGINS:http://127.0.0.1:5174",
      url: "http://127.0.0.1:8790/api/health",
      reuseExistingServer: false,
      timeout: 180000,
    },
    {
      command: "GBS_DEV_API_PORT=8790 npm run dev -- --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "phone",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel: "chrome",
      },
    },
  ],
  reporter: [["list"]],
});

import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";

loadEnvFile(".env");
process.env.NO_PROXY = [process.env.NO_PROXY, "localhost", "127.0.0.1"].filter(Boolean).join(",");

const port = process.env.PW_PORT || "3000";
const baseURL = process.env.PW_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      process.platform === "win32"
        ? `node_modules\\.bin\\next.cmd dev --webpack --hostname 127.0.0.1 --port ${port}`
        : `node_modules/.bin/next dev --webpack --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

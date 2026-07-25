import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";

loadEnvFile(".env");
process.env.NO_PROXY = [process.env.NO_PROXY, "localhost", "127.0.0.1"].filter(Boolean).join(",");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.PW_BASE_URL || "http://localhost:3000",
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
        ? `node_modules\\.bin\\next.cmd dev --webpack --hostname 127.0.0.1 --port ${process.env.PW_PORT || "3000"}`
        : `node_modules/.bin/next dev --webpack --hostname 127.0.0.1 --port ${process.env.PW_PORT || "3000"}`,
    url: `${process.env.PW_BASE_URL || "http://localhost:3000"}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

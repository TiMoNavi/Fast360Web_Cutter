import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});

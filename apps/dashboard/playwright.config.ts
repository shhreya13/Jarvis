import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3300",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e/gateway-harness.mjs",
      url: "http://127.0.0.1:4821/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "pnpm dev",
      url: "http://127.0.0.1:3300",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

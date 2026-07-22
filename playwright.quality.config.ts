import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.QUALITY_TEST_PORT ?? "3101");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/quality",
  snapshotPathTemplate: "{testDir}/__snapshots__/{testFilePath}/{arg}{ext}",
  globalSetup: "./tests/browser/global-setup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  outputDir: "test-results/quality",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.03,
      threshold: 0.3,
    },
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-quality",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run test:browser:server -- --production --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});

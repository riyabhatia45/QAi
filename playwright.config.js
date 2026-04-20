// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',

  // Store Playwright artifacts in the repo so videos are easy to find locally.
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || './test-results/playwright-artifacts',

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120000,
  reporter: [['list']],

  use: {
    trace: 'off',
    actionTimeout: 15000,
    screenshot: 'only-on-failure',
    video: process.env.PLAYWRIGHT_VIDEO_MODE || 'on',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

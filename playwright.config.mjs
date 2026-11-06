import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: 'list',
  outputDir: 'work/ui-results',
  use: {
    baseURL: 'http://127.0.0.1:4180/super-day/',
    serviceWorkers: 'block',
    locale: 'vi-VN',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
    screenshot: 'only-on-failure',
  },
  webServer: { command: 'PORT=4180 node scripts/serve.mjs dist', url: 'http://127.0.0.1:4180/super-day/', reuseExistingServer: !process.env.CI },
});

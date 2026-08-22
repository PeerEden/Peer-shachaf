import { defineConfig } from '@playwright/test';

/**
 * E2E suite. Requires a built client (npm run build) — the server serves
 * client/dist. In environments with a pre-provisioned Chromium, set
 * CHROMIUM_PATH to its executable.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    viewport: { width: 390, height: 844 },
    locale: 'he-IL',
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npx tsx e2e/start-server.ts',
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: false,
    timeout: 90_000,
  },
});

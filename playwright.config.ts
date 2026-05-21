import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const PORT = Number(process.env.DUST_PORT ?? 5174);
// PLAYWRIGHT_BASE_URL lets the suite run against the deployed site
// (e.g. https://electricrv.ca/dust-analysis/) instead of a local dev server.
const LIVE = process.env.PLAYWRIGHT_BASE_URL;
const BASE = LIVE ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: BASE,
    viewport: { width: 1280, height: 800 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Only spin up a local dev server when not targeting a live URL.
  ...(LIVE
    ? {}
    : {
        webServer: {
          command: `npm run dev -- --port ${PORT} --strictPort`,
          url: BASE,
          reuseExistingServer: !isCI,
          timeout: 120_000,
          env: { DUST_PORT: String(PORT) },
        },
      }),
});

import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the running compose stack.
 *   ./raadi e2e   (runs in the toolbox, inside Traefik's network namespace)
 */
export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Every worker reaches Traefik from the same IP and shares its per-client
  // rate limit (sized for one person), so the worker count is fixed instead of
  // scaling with the host's cores.
  workers: 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.PUBLIC_BASE_URL ?? 'http://raadi.localhost',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'nb-NO',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

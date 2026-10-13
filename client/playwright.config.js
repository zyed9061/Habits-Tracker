import { defineConfig, devices } from '@playwright/test';

// E2E suite (real browser, real API, dev database server/data/habits.db).
// Tests create their own habits prefixed "QA-e2e" and archive them afterwards.
// workers: 1 because every test shares the same database and the stats depend on it.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Starts API + client from the project root only if they are not already running.
    command: 'npm --prefix .. run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

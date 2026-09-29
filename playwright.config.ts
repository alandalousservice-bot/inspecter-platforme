import { defineConfig, devices } from '@playwright/test';

if (!process.env.G3_E2E_DATABASE_URL) {
  throw new Error('Run connected browser tests with npm run e2e:g3.');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'g3-connected-flow.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: 'test-results',
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node packages/api/dist/main.js',
      url: 'http://127.0.0.1:3101/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { PORT: '3101', DATABASE_URL: process.env.G3_E2E_DATABASE_URL },
    },
    {
      command: 'npm run dev --workspace @inspector/web -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3101' },
    },
  ],
});

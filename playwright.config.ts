import { defineConfig, devices } from '@playwright/test';

const task045 = process.env.TASK045_E2E === '1';
const task075 = process.env.TASK075_E2E === '1';
const task051 = process.env.TASK051_E2E === '1';
const task052a = process.env.TASK052A_E2E === '1';
const task052 = process.env.TASK052_E2E === '1';
const task053 = process.env.TASK053_E2E === '1';
const task053a = process.env.TASK053A_E2E === '1';
const task054 = process.env.TASK054_E2E === '1';
const task081 = process.env.TASK081_E2E === '1';
const task082 = process.env.TASK082_E2E === '1';
const task083 = process.env.TASK083_E2E === '1';
const task084 = process.env.TASK084_E2E === '1';
const task085 = process.env.TASK085_E2E === '1';
const task086 = process.env.TASK086_E2E === '1';
const task077d = process.env.TASK077D_E2E === '1';
if (!process.env.G3_E2E_DATABASE_URL) throw new Error('Run connected browser tests with the isolated E2E command.');

export default defineConfig({
  testDir: './e2e',
  testMatch: task077d ? 'task077d-location-proposal.spec.ts' : task075 ? 'task075-declaration-import.spec.ts' : task086 ? 'task086-information-card-print.spec.ts' : task085 ? 'task085-public-intake.spec.ts' : task084 ? 'task084-teacher-information-card.spec.ts' : task083 ? 'task083-workplace-aware-visits.spec.ts' : task082 ? 'task082-teacher-supplementary-workplaces.spec.ts' : task081 ? 'task081-teacher-qualifications.spec.ts' : task054 ? 'task054-inspector-visit-report.spec.ts' : task053 ? 'task053-followups.spec.ts' : task053a ? ['task051-pedagogical-visits.spec.ts', 'task053a-visit-types.spec.ts'] : task052 ? 'task052-inspection-report.spec.ts' : task052a ? 'task052a-professional-identity.spec.ts' : task051 ? 'task051-pedagogical-visits.spec.ts' : task045 ? 'task045-teacher-directory.spec.ts' : 'g3-connected-flow.spec.ts',
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

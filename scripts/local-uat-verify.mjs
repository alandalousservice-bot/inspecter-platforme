import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import { assertTarget, parseApprovedUrl, UAT_INSPECTOR } from './local-uat.mjs';

const root = process.cwd();
const secretPath = 'D:\\pg-task020-temp\\local-uat-inspector-password.secret';
const secret = readFileSync(secretPath, 'utf8').trim();
if (secret.length < 20) throw new Error('Local UAT credential file is invalid.');
const databaseSecret = readFileSync('D:\\pg-task020-temp\\task020-test-url.secret', 'utf8').trim();
const assignedUrl = databaseSecret.match(/^(?:TEST_DATABASE_URL|DATABASE_URL)=(.*)$/u)?.[1]?.trim();
const databaseUrl = parseApprovedUrl(assignedUrl ?? databaseSecret);
const require = createRequire(resolve(root, 'packages/api/package.json'));
const { chromium } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
let browser;
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));
async function waitFor(url) {
  for (let i = 0; i < 90; i += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* wait for local service */ }
    await pause(1000);
  }
  throw new Error('Local UAT service did not become ready.');
}
try {
  await db.$connect();
  await assertTarget(db);
  await waitFor('http://127.0.0.1:3001/api/v1/health');
  await waitFor('http://127.0.0.1:5173/login');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173/login');
  await page.getByLabel('البريد الإلكتروني').fill(UAT_INSPECTOR.email);
  await page.getByLabel('كلمة المرور').fill(secret);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await page.waitForURL('**/app/**');
  const year = new Date().getUTCMonth() >= 8 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  const routes = [
    '/app', '/app/institutions', '/app/submissions', '/app/teachers', '/app/visits', '/app/follow-ups',
    '/app/me/professional-identity', `/app/teachers/${'84000000-0000-4000-8000-000000000101'}`,
    `/app/submissions/${'84000000-0000-4000-8000-000000000903'}`,
    `/app/teachers/${'84000000-0000-4000-8000-000000000101'}/information-card`,
    `/app/teachers/${'84000000-0000-4000-8000-000000000101'}/information-card/print?academicYear=${year}-${year + 1}`,
  ];
  for (const route of routes) {
    await page.goto(`http://127.0.0.1:5173${route}`);
    await page.waitForLoadState('networkidle');
    if (new URL(page.url()).pathname === '/login') throw new Error(`Authenticated route redirected to login: ${route}`);
    const body = await page.locator('body').innerText();
    if (!body.trim()) throw new Error(`Authenticated route returned no visible content: ${route}`);
    if (route.includes('/submissions/84000000-0000-4000-8000-000000000903')
      && (!body.includes('مؤهل مصرح به غير معتمد') || !body.includes('مؤسسة إضافية مصرح بها فقط'))) {
      throw new Error('TASK-085 declarations were not visible as submission-only information.');
    }
    console.log(`authenticated_route=PASS ${new URL(page.url()).pathname}`);
  }
  await page.goto('http://127.0.0.1:5173/public/d/84000000-0000-4000-8000-000000000001/register');
  await page.waitForLoadState('networkidle');
  if (!(await page.locator('body').innerText()).includes('نموذج تقديم بيانات الأستاذ')) throw new Error('Public Teacher intake form did not render.');
  console.log('public_teacher_intake_form=PASS');
  await page.goto('http://127.0.0.1:5173/app');
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await page.waitForURL('**/login');
  console.log('real_browser_login=PASS');
} finally {
  await browser?.close();
  await db.$disconnect();
}

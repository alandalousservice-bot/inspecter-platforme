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
const businessModels = [
  'district', 'inspectorDistrictMembership', 'institution', 'teacher', 'teacherSubmission',
  'pedagogicalVisit', 'inspectionReport', 'followUp', 'weeklySchedule', 'weeklyScheduleSlot',
  'teacherSupplementaryWorkplace', 'teacherQualification', 'auditLog',
];
let browser;
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));
async function businessCounts() {
  return Object.fromEntries(await Promise.all(businessModels.map(async (model) => [model, await db[model].count()])));
}
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
  const before = await businessCounts();
  await waitFor('http://127.0.0.1:3001/api/v1/health');
  await waitFor('http://127.0.0.1:5173/login');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const viewports = [{ width: 1440, height: 1100 }, { width: 768, height: 1024 }, { width: 390, height: 844 }];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:5173/login');
    const loginGeometry = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      direction: getComputedStyle(document.documentElement).direction,
    }));
    if (loginGeometry.scrollWidth > loginGeometry.width || loginGeometry.direction !== 'rtl') {
      throw new Error(`Login geometry/RTL failed at viewport ${viewport.width}.`);
    }
  }
  await page.setViewportSize(viewports[0]);
  await page.goto('http://127.0.0.1:5173/login');
  await page.getByLabel('البريد الإلكتروني').fill(UAT_INSPECTOR.email);
  await page.getByLabel('كلمة المرور').fill(secret);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await page.waitForURL((url) => url.pathname === '/app' || url.pathname.startsWith('/app/'));
  const year = new Date().getUTCMonth() >= 8 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  const routes = [
    '/app', '/app/institutions', '/app/submissions', '/app/teachers', '/app/visits', '/app/follow-ups',
    '/app/me/professional-identity', `/app/teachers/${'84000000-0000-4000-8000-000000000101'}`,
    `/app/submissions/${'84000000-0000-4000-8000-000000000903'}`,
    `/app/visits/${'84000000-0000-4000-8000-000000000602'}`,
    `/app/visits/${'84000000-0000-4000-8000-000000000602'}/report`,
    `/app/teachers/${'84000000-0000-4000-8000-000000000101'}/information-card?academicYear=${year}-${year + 1}`,
    `/app/teachers/${'84000000-0000-4000-8000-000000000101'}/information-card/print?academicYear=${year}-${year + 1}`,
  ];
  for (const route of routes) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`http://127.0.0.1:5173${route}`);
      await page.waitForLoadState('networkidle');
      if (new URL(page.url()).pathname === '/login') throw new Error(`Authenticated route redirected to login: ${route}`);
      const body = await page.locator('body').innerText();
      if (!body.trim()) throw new Error(`Authenticated route returned no visible content: ${route}`);
      const geometry = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        direction: getComputedStyle(document.documentElement).direction,
        mainCount: document.querySelectorAll('main').length,
        sidebarVisibility: document.querySelector('.app-sidebar')
          ? getComputedStyle(document.querySelector('.app-sidebar')).visibility
          : 'absent',
        topbarCount: document.querySelectorAll('.app-topbar').length,
      }));
      if (geometry.scrollWidth > geometry.width || geometry.direction !== 'rtl' || geometry.mainCount !== 1) {
        throw new Error(`Authenticated route geometry/RTL failed at viewport ${viewport.width}: ${route}`);
      }
      if (route.includes('/information-card/print') && (geometry.topbarCount !== 0 || geometry.sidebarVisibility !== 'absent')) {
        throw new Error('TASK-086 print route inherited AppShell visibility.');
      }
      if (!route.includes('/information-card/print') && viewport.width < 1024 && geometry.sidebarVisibility !== 'hidden') {
        throw new Error(`Closed mobile drawer is not hidden at viewport ${viewport.width}: ${route}`);
      }
      if (route.includes('/submissions/84000000-0000-4000-8000-000000000903')
        && (!body.includes('مؤهل مصرح به غير معتمد') || !body.includes('مؤسسة إضافية مصرح بها فقط'))) {
        throw new Error('TASK-085 declarations were not visible as submission-only information.');
      }
      console.log(`authenticated_route=PASS viewport=${viewport.width} path=${new URL(page.url()).pathname}`);
    }
  }
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:5173/public/d/84000000-0000-4000-8000-000000000001/register');
    await page.waitForLoadState('networkidle');
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      direction: getComputedStyle(document.documentElement).direction,
      shellCount: document.querySelectorAll('.app-shell, .app-sidebar, .app-topbar').length,
    }));
    if (!(await page.locator('body').innerText()).includes('نموذج تقديم بيانات الأستاذ')
      || geometry.scrollWidth > geometry.width || geometry.direction !== 'rtl' || geometry.shellCount !== 0) {
      throw new Error(`Public Teacher intake responsive/isolation check failed at viewport ${viewport.width}.`);
    }
    console.log(`public_teacher_intake=PASS viewport=${viewport.width}`);
  }
  await page.goto('http://127.0.0.1:5173/app');
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await page.waitForURL('**/login');
  const after = await businessCounts();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Persistent LOCAL UAT business data changed during visual verification.');
  console.log('real_browser_login=PASS; route_matrix=1440/768/390; uat_business_data_preserved=true');
} finally {
  await browser?.close();
  await db.$disconnect();
}

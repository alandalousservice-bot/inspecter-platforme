import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { assertTarget, parseApprovedUrl, UAT_DATABASE, UAT_INSPECTOR } from './local-uat.mjs';

const root = process.cwd();
const require = createRequire(resolve(root, 'packages/api/package.json'));
const { chromium } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const password = readFileSync('D:\\pg-task020-temp\\local-uat-inspector-password.secret', 'utf8').trim();
const databaseText = readFileSync('D:\\pg-task020-temp\\task020-test-url.secret', 'utf8').trim();
const databaseUrl = parseApprovedUrl(databaseText.match(/^(?:TEST_DATABASE_URL|DATABASE_URL)=(.*)$/u)?.[1]?.trim() ?? databaseText);
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const keepScreenshots = process.env.TASK070B_KEEP_SCREENSHOTS === '1';
const screenshotDir = mkdtempSync(join(tmpdir(), 'task070b-visual-'));
const evidence = { dashboard: false, navigation: false, representativeAttention: false, upcomingVisit: false, publicIsolation: false, printIsolation: false, viewport: [], modes: [] };
const businessModels = [
  'district', 'inspectorDistrictMembership', 'institution', 'teacher', 'teacherSubmission',
  'pedagogicalVisit', 'inspectionReport', 'followUp', 'weeklySchedule', 'weeklyScheduleSlot',
  'teacherSupplementaryWorkplace', 'teacherQualification',
];

async function businessCounts() {
  const result = {};
  for (const model of businessModels) result[model] = await db[model].count();
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyViewport(width, height, filename) {
  await page.setViewportSize({ width, height });
  await page.goto('http://127.0.0.1:5173/app');
  await page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 }).waitFor();
  await page.locator('.dashboard-freshness').waitFor();
  const metrics = await page.evaluate(() => ({
    innerWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    mainCount: document.querySelectorAll('main').length,
    h1Count: document.querySelectorAll('h1').length,
    attentionTop: document.querySelector('#dashboard-attention-title')?.getBoundingClientRect().top,
    visitsTop: document.querySelector('#dashboard-visits-title')?.getBoundingClientRect().top,
    actionsTop: document.querySelector('#dashboard-actions-title')?.getBoundingClientRect().top,
  }));
  assert(metrics.scrollWidth <= metrics.innerWidth, `Horizontal document overflow at viewport ${width}.`);
  assert(metrics.mainCount === 1 && metrics.h1Count === 1, `Landmark or heading count incorrect at viewport ${width}.`);
  assert(metrics.attentionTop < metrics.visitsTop && metrics.visitsTop < metrics.actionsTop, `Dashboard priority order incorrect at viewport ${width}.`);
  await page.screenshot({ path: join(screenshotDir, filename), fullPage: true });
  evidence.viewport.push(`${width}x${height}:PASS`);
}

let beforeCounts;
let stage = 'preflight';
const apiStatuses = [];
const loginStatuses = [];
const pageErrorKinds = [];
try {
  assert(password.length >= 20, 'Approved local UAT password source is invalid.');
  await db.$connect();
  await assertTarget(db);
  assert(UAT_DATABASE.host === '127.0.0.1' && UAT_DATABASE.port === 55432
    && UAT_DATABASE.database === 'task020_test' && UAT_DATABASE.user === 'task020_test_user', 'UAT allowlist mismatch.');
  beforeCounts = await businessCounts();

  stage = 'login and dashboard API';
  page.on('response', (response) => {
    if (response.url().includes('/api/v1/dashboard/summary')) apiStatuses.push(response.status());
    if (response.url().includes('/api/v1/auth/login')) loginStatuses.push(response.status());
  });
  page.on('pageerror', (error) => pageErrorKinds.push(error.name));
  stage = 'login form';
  await page.goto('http://127.0.0.1:5173/login');
  await page.getByLabel('البريد الإلكتروني').fill(UAT_INSPECTOR.email);
  await page.getByLabel('كلمة المرور').fill(password);
  stage = 'login submit';
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  stage = 'login redirect';
  await page.waitForURL((url) => url.pathname === '/app');
  stage = 'dashboard render';
  await page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 }).waitFor();
  await page.locator('.dashboard-freshness').waitFor();
  stage = 'dashboard API contract';
  assert(apiStatuses.includes(200), 'Dashboard aggregate API did not return success.');
  assert(await page.getByRole('link', { name: 'لوحة المتابعة' }).getAttribute('aria-current') === 'page', 'Dashboard navigation item is not active.');
  assert(await page.locator('main').count() === 1, 'Dashboard must have one main landmark.');
  evidence.dashboard = true;

  stage = 'representative attention navigation';
  const pendingLink = page.locator('.dashboard-count').filter({ hasText: 'طلبات الأساتذة المعلقة' }).locator('a[href^="/app/submissions/"]').first();
  if (await pendingLink.count()) {
    await pendingLink.click();
    await page.waitForURL(/\/app\/submissions\/[^/]+$/u);
    assert(new URL(page.url()).pathname.startsWith('/app/submissions/'), 'Representative pending submission navigation failed.');
    evidence.representativeAttention = true;
    await page.getByRole('link', { name: 'لوحة المتابعة' }).click();
    await page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 }).waitFor();
  }

  const nextVisit = page.locator('.dashboard-visit a[href^="/app/visits/"]').first();
  if (await nextVisit.count()) {
    await nextVisit.click();
    await page.waitForURL(/\/app\/visits\/[^/]+$/u);
    evidence.upcomingVisit = true;
    await page.getByRole('link', { name: 'لوحة المتابعة' }).click();
    await page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 }).waitFor();
  }

  const destinations = [
    { label: 'جدولة زيارة', path: '/app/visits/new' },
    { label: 'دليل الأساتذة', path: '/app/teachers' },
    { label: 'مراجعة الطلبات', path: '/app/submissions' },
    { label: 'المتابعات', path: '/app/follow-ups' },
  ];
  stage = 'quick action routes';
  for (const destination of destinations) {
    await page.locator('.dashboard-actions').getByRole('link', { name: destination.label }).click();
    await page.waitForURL((url) => url.pathname === destination.path);
    assert(await page.getByRole('main').count() === 1, `AppShell main landmark regressed on ${destination.path}.`);
    await page.goto('http://127.0.0.1:5173/app');
    await page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 }).waitFor();
  }
  await page.getByRole('link', { name: 'المؤسسات' }).click();
  await page.waitForURL((url) => url.pathname === '/app/institutions');
  assert(await page.locator('main').count() === 1, 'AppShell main landmark regressed on institutions.');
  await page.getByRole('link', { name: 'الزيارات' }).click();
  await page.waitForURL((url) => url.pathname === '/app/visits');
  evidence.navigation = true;

  stage = 'responsive visual geometry';
  await verifyViewport(1440, 1100, 'dashboard-1440.png');
  await verifyViewport(768, 1024, 'dashboard-768.png');
  await verifyViewport(390, 844, 'dashboard-390.png');
  await verifyViewport(720, 900, 'dashboard-200-percent-equivalent.png');

  stage = 'dense response visual';
  const denseSummary = {
    asOf: '2026-10-02T09:00:00.000Z', today: '2026-10-02',
    attention: {
      pendingSubmissions: { total: 12, items: [1, 2, 3].map((n) => ({ id: `submission-${n}`, submittedAt: '2026-10-02T08:00:00.000Z' })) },
      ownedFollowUps: { overdueTotal: 9, dueTodayTotal: 7, items: [
        { id: 'follow-overdue-1', dueDate: '2026-09-29', alertState: 'OVERDUE' },
        { id: 'follow-today-1', dueDate: '2026-10-02', alertState: 'DUE_TODAY' },
        { id: 'follow-today-2', dueDate: '2026-10-02', alertState: 'DUE_TODAY' },
      ] },
      reports: { draftTotal: 4, completedVisitWithoutReportTotal: 6, items: [
        { visitId: 'visit-draft-1', reportId: 'report-1', kind: 'DRAFT_REPORT', referenceAt: '2026-10-02T08:30:00.000Z' },
        { visitId: 'visit-no-report-1', reportId: null, kind: 'NO_REPORT', referenceAt: '2026-10-01T08:30:00.000Z' },
        { visitId: 'visit-no-report-2', reportId: null, kind: 'NO_REPORT', referenceAt: '2026-09-30T08:30:00.000Z' },
      ] },
    },
    upcomingVisits: [1, 2, 3].map((n) => ({
      id: `visit-${n}`, scheduledStartAt: `2026-10-0${n + 2}T08:00:00.000Z`, scheduledEndAt: `2026-10-0${n + 2}T09:00:00.000Z`,
      visitType: n === 2 ? null : 'GUIDANCE', institutionName: 'ابتدائية محلية ذات اسم عربي طويل لاختبار التفاف المحتوى دون اقتطاع المعنى',
    })),
  };

  await page.route('**/api/v1/dashboard/summary', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: denseSummary }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5173/app');
  await page.getByText('ابتدائية محلية ذات اسم عربي طويل لاختبار التفاف المحتوى دون اقتطاع المعنى').first().waitFor();
  assert(await page.locator('.dashboard-visit').count() === 3, 'Dense Dashboard did not render all bounded upcoming visits.');
  const denseWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert(denseWidth.scroll <= denseWidth.client, 'Dense Arabic content caused document overflow.');
  await page.screenshot({ path: join(screenshotDir, 'dashboard-dense-390.png'), fullPage: true });
  evidence.modes.push('DENSE:PASS');

  stage = 'empty response visual';
  await page.unroute('**/api/v1/dashboard/summary');
  const emptySummary = {
    asOf: '2026-10-02T09:00:00.000Z', today: '2026-10-02',
    attention: { pendingSubmissions: { total: 0, items: [] }, ownedFollowUps: { overdueTotal: 0, dueTodayTotal: 0, items: [] }, reports: { draftTotal: 0, completedVisitWithoutReportTotal: 0, items: [] } },
    upcomingVisits: [],
  };
  await page.route('**/api/v1/dashboard/summary', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: emptySummary }) }));
  await page.goto('http://127.0.0.1:5173/app');
  await page.getByText('لا توجد عناصر تحتاج انتباهك حاليًا.').waitFor();
  await page.screenshot({ path: join(screenshotDir, 'dashboard-empty-390.png'), fullPage: true });
  evidence.modes.push('EMPTY:PASS');

  stage = 'error response visual';
  await page.unroute('**/api/v1/dashboard/summary');
  await page.route('**/api/v1/dashboard/summary', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'تعذر إكمال العملية.' } }) }));
  await page.goto('http://127.0.0.1:5173/app');
  await page.getByRole('alert').waitFor();
  assert(!(await page.locator('body').innerText()).includes('INTERNAL_ERROR'), 'Internal API error details were exposed.');
  await page.screenshot({ path: join(screenshotDir, 'dashboard-error-390.png'), fullPage: true });
  evidence.modes.push('ERROR:PASS');

  stage = 'public intake isolation';
  await page.unroute('**/api/v1/dashboard/summary');
  await page.goto('http://127.0.0.1:5173/public/d/84000000-0000-4000-8000-000000000001/register');
  await page.getByRole('heading', { name: 'نموذج تقديم بيانات الأستاذ' }).waitFor();
  assert(await page.locator('main[dir="rtl"]').count() === 1 && await page.locator('.app-sidebar').count() === 0, 'Public intake entered AppShell.');
  evidence.publicIsolation = true;

  stage = 'TASK-086 print isolation';
  const year = new Date().getUTCMonth() >= 8 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  await page.goto(`http://127.0.0.1:5173/app/teachers/84000000-0000-4000-8000-000000000101/information-card/print?academicYear=${year}-${year + 1}`);
  await page.locator('.teacher-print__document').waitFor();
  assert(await page.locator('.app-sidebar').count() === 0 && await page.locator('.app-topbar').count() === 0
    && await page.locator('.ui-page').count() === 0 && await page.locator('.dashboard-page').count() === 0, 'TASK-086 print route inherited AppShell or Dashboard styles.');
  evidence.printIsolation = true;

  stage = 'persistent data verification';
  const afterCounts = await businessCounts();
  assert(JSON.stringify(beforeCounts) === JSON.stringify(afterCounts), 'Persistent UAT business data counts changed.');
  console.log(`TASK-070B connected checks PASS; dashboard=${evidence.dashboard}; representative_attention=${evidence.representativeAttention}; upcoming_visit=${evidence.upcomingVisit}; route_navigation=${evidence.navigation}; viewports=${evidence.viewport.join(',')}; modes=${evidence.modes.join(',')}; public_isolation=${evidence.publicIsolation}; print_isolation=${evidence.printIsolation}; business_data_preserved=true.${keepScreenshots ? ` Visual evidence: ${screenshotDir}` : ''}`);
} catch {
  if (keepScreenshots) await page.screenshot({ path: join(screenshotDir, 'failure-state.png'), fullPage: true }).catch(() => {});
  const safeState = {
    titleVisible: await page.getByRole('heading', { name: 'لوحة المتابعة' }).count().catch(() => 0) > 0,
    loadingVisible: await page.getByText('جارٍ تحميل لوحة المتابعة…').count().catch(() => 0) > 0,
    errorVisible: await page.getByRole('alert').count().catch(() => 0) > 0,
  };
  console.error(`TASK-070B connected verification failed during ${stage}; path=${new URL(page.url()).pathname}; login_http=${loginStatuses.join(',') || 'none'}; dashboard_http=${apiStatuses.join(',') || 'none'}; page_errors=${pageErrorKinds.join(',') || 'none'}; state=${JSON.stringify(safeState)}${keepScreenshots ? `; evidence=${screenshotDir}` : ''}. No credential or response payload was written to output.`);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
  if (!keepScreenshots) rmSync(screenshotDir, { recursive: true, force: true });
}

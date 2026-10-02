import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { assertTarget, parseApprovedUrl, UAT_DATABASE, UAT_INSPECTOR } from './local-uat.mjs';

const root = process.cwd();
const require = createRequire(resolve(root, 'packages/api/package.json'));
const { chromium } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const databaseText = readFileSync('D:\\pg-task020-temp\\task020-test-url.secret', 'utf8').trim();
const databaseUrl = parseApprovedUrl(databaseText.match(/^(?:TEST_DATABASE_URL|DATABASE_URL)=(.*)$/u)?.[1]?.trim() ?? databaseText);
const password = readFileSync('D:\\pg-task020-temp\\local-uat-inspector-password.secret', 'utf8').trim();
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const profilePath = mkdtempSync(join(tmpdir(), 'task070c-real-zoom-profile-'));
const screenshotDirectory = mkdtempSync(join(tmpdir(), 'task070c-real-zoom-visual-'));
const screenshotPath = join(screenshotDirectory, 'dashboard-actual-200-percent.png');
const businessModels = [
  'district', 'inspectorDistrictMembership', 'institution', 'teacher', 'teacherSubmission',
  'pedagogicalVisit', 'inspectionReport', 'followUp', 'weeklySchedule', 'weeklyScheduleSlot',
  'teacherSupplementaryWorkplace', 'teacherQualification', 'auditLog',
];
let context;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function businessCounts() {
  return Object.fromEntries(await Promise.all(businessModels.map(async (model) => [model, await db[model].count()])));
}

function algiersToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

const today = algiersToday();
const dateOffset = (amount) => {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const timestampOffset = (amount) => new Date(Date.now() + amount * 86_400_000).toISOString();
const denseSummary = {
  asOf: new Date().toISOString(),
  today,
  attention: {
    pendingSubmissions: { total: 7, items: [1, 2, 3].map((n) => ({ id: randomUUID(), submittedAt: new Date().toISOString() })) },
    ownedFollowUps: {
      overdueTotal: 4,
      dueTodayTotal: 3,
      items: [
        { id: randomUUID(), dueDate: dateOffset(-2), alertState: 'OVERDUE' },
        { id: randomUUID(), dueDate: today, alertState: 'DUE_TODAY' },
      ],
    },
    reports: {
      draftTotal: 2,
      completedVisitWithoutReportTotal: 5,
      items: [
        { visitId: randomUUID(), reportId: randomUUID(), kind: 'DRAFT_REPORT', referenceAt: new Date().toISOString() },
        { visitId: randomUUID(), reportId: null, kind: 'NO_REPORT', referenceAt: new Date().toISOString() },
      ],
    },
  },
  upcomingVisits: [1, 2, 3].map((n) => ({
    id: randomUUID(),
    scheduledStartAt: timestampOffset(n),
    scheduledEndAt: new Date(Date.now() + n * 86_400_000 + 3_600_000).toISOString(),
    visitType: n === 2 ? null : 'GUIDANCE',
    institutionName: 'ابتدائية ذات اسم عربي طويل لاختبار الالتفاف عند التكبير — School-ABC 2026-2027',
  })),
};

try {
  assert(password.length >= 20, 'Approved local UAT password source is invalid.');
  assert(UAT_DATABASE.host === '127.0.0.1' && UAT_DATABASE.port === 55432
    && UAT_DATABASE.database === 'task020_test' && UAT_DATABASE.user === 'task020_test_user', 'Local UAT allowlist mismatch.');
  await db.$connect();
  await assertTarget(db);
  const before = await businessCounts();

  context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    viewport: null,
    args: ['--window-size=1440,1100'],
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto('http://127.0.0.1:5173/login');
  const settings = await context.newPage();
  await settings.goto('chrome://settings/appearance');
  const zoomSelect = settings.locator('select').nth(1);
  await zoomSelect.selectOption({ label: '100%' });
  await page.getByLabel('البريد الإلكتروني').fill(UAT_INSPECTOR.email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await page.waitForURL((url) => url.pathname === '/app');

  await page.route('**/api/v1/dashboard/summary', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: denseSummary }),
  }));
  await page.goto('http://127.0.0.1:5173/app');
  await page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 }).waitFor();
  await page.locator('.dashboard-freshness').waitFor();

  const measure = () => page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top, left: bounds.left, right: bounds.right, bottom: bounds.bottom, width: bounds.width };
    };
    return {
      dpr: window.devicePixelRatio,
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX: window.scrollX,
      direction: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
      mainCount: document.querySelectorAll('main').length,
      h1Count: document.querySelectorAll('h1').length,
      attention: rect('#dashboard-attention-title'),
      visits: rect('#dashboard-visits-title'),
      actions: rect('#dashboard-actions-title'),
      appMain: rect('.app-main'),
      pageContainer: rect('.ui-page'),
      dashboardSections: [...document.querySelectorAll('.dashboard-section')].map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      }),
      requiredText: [...document.querySelectorAll(
        '.app-main h1, .dashboard-section h2, .dashboard-count__title, .dashboard-count__link, .dashboard-visit__topline h3, .dashboard-visit__institution, .dashboard-visit__time, .dashboard-actions a',
      )].map((element) => {
        const box = element.getBoundingClientRect();
        return {
          text: element.textContent?.trim(), left: box.left, right: box.right,
          clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        };
      }),
      counts: [...document.querySelectorAll('.dashboard-count')].map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      }),
      visitCards: document.querySelectorAll('.dashboard-visit').length,
      actionLinks: [...document.querySelectorAll('.dashboard-actions a')].map((link) => ({
        text: link.textContent?.trim(), href: link.getAttribute('href'),
      })),
    };
  });

  const at100 = await measure();
  assert(at100.direction === 'rtl' && at100.mainCount === 1 && at100.h1Count === 1, '100% RTL landmarks failed.');
  assert(at100.scrollWidth <= at100.clientWidth, 'Horizontal overflow at 100% browser zoom.');

  await zoomSelect.selectOption({ label: '200%' });
  await page.reload();
  await page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 }).waitFor();
  await page.getByText('ابتدائية ذات اسم عربي طويل لاختبار الالتفاف عند التكبير — School-ABC 2026-2027').first().waitFor();
  const at200 = await measure();
  assert(Math.abs(at200.dpr / at100.dpr - 2) < 0.08, 'Chrome did not apply a real 200% page zoom.');
  assert(Math.abs(at100.innerWidth / at200.innerWidth - 2) < 0.08, 'Actual page zoom did not halve the CSS layout viewport.');
  assert(at200.scrollWidth <= at200.clientWidth, 'Horizontal overflow at actual 200% browser zoom.');
  assert(at200.scrollX === 0, 'Dashboard is horizontally scrolled at actual 200% browser zoom.');
  assert(at200.direction === 'rtl' && at200.mainCount === 1 && at200.h1Count === 1, '200% RTL landmarks failed.');
  for (const item of at200.requiredText) {
    assert(item.left >= -1 && item.right <= at200.clientWidth + 1, `Required text is clipped horizontally at 200%: ${item.text}.`);
    assert(item.scrollWidth <= item.clientWidth + 1, `Required text overflows its element at 200%: ${item.text}.`);
  }
  assert(at200.attention.top < at200.visits.top && at200.visits.top < at200.actions.top, '200% section reading order changed.');
  assert(at200.visitCards === 3 && at200.counts.length === 5, 'A required 200% operational category was hidden.');
  assert(await page.getByText('نوع الزيارة غير موثق (سجل سابق)').count() === 1, 'Legacy null type is not visible at 200%.');
  for (const label of ['المتابعات المتأخرة', 'المتابعات المستحقة اليوم', 'طلبات الأساتذة المعلقة', 'مسودات التقارير', 'زيارات مكتملة بلا تقرير']) {
    assert(await page.getByRole('heading', { name: label }).isVisible(), `200% category clipped or hidden: ${label}.`);
  }
  assert(at200.actionLinks.map((item) => item.href).join('|') === '/app/visits/new|/app/teachers|/app/submissions|/app/follow-ups', 'Approved quick actions changed at 200%.');
  for (let index = 0; index < at200.counts.length; index += 1) {
    const current = at200.counts[index];
    assert(current.left >= -1 && current.right <= at200.clientWidth + 1, 'An attention card is horizontally clipped at 200%.');
    for (const next of at200.counts.slice(index + 1)) {
      const overlaps = current.left < next.right && current.right > next.left && current.top < next.bottom && current.bottom > next.top;
      assert(!overlaps, 'Attention cards overlap at 200%.');
    }
  }

  await page.keyboard.press('Tab');
  let focusedMenu = false;
  for (let index = 0; index < 24; index += 1) {
    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      return {
        label: element?.getAttribute('aria-label'),
        focusVisible: element?.matches(':focus-visible') ?? false,
        outlineWidth: Number.parseFloat(getComputedStyle(element).outlineWidth) || 0,
        outlineStyle: getComputedStyle(element).outlineStyle,
      };
    });
    if (focus.label === 'فتح قائمة التنقل') {
      assert(focus.focusVisible && focus.outlineStyle !== 'none' && focus.outlineWidth >= 2, 'Mobile navigation focus ring is not visible at 200%.');
      focusedMenu = true;
      break;
    }
    await page.keyboard.press('Tab');
  }
  assert(focusedMenu, 'Keyboard could not reach the responsive navigation opener at 200%.');
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'قائمة التنقل الرئيسية' });
  await drawer.waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'إغلاق القائمة' }).waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'detached' });
  assert(await page.getByRole('button', { name: 'فتح قائمة التنقل' }).getAttribute('aria-expanded') === 'false', 'Drawer did not close and restore its state.');

  await page.screenshot({ path: screenshotPath, fullPage: true });
  const quickAction = page.locator('.dashboard-actions').getByRole('link', { name: 'جدولة زيارة' });
  await quickAction.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => url.pathname === '/app/visits/new');
  await page.goto('http://127.0.0.1:5173/app');
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await page.waitForURL('**/login');

  await assertTarget(db);
  const after = await businessCounts();
  assert(JSON.stringify(before) === JSON.stringify(after), 'Persistent LOCAL UAT business records changed during zoom verification.');

  console.log(`TASK-070C real Chrome zoom PASS; 100pct_dpr=${at100.dpr.toFixed(2)}; 200pct_dpr=${at200.dpr.toFixed(2)}; css_width=${at100.innerWidth}->${at200.innerWidth}; overflow=none; keyboard_drawer=PASS; keyboard_quick_action=PASS; business_data_preserved=true; geometry=${JSON.stringify({ scrollX: at200.scrollX, appMain: at200.appMain, pageContainer: at200.pageContainer, dashboardSections: at200.dashboardSections })}; screenshot=${screenshotPath}`);
} finally {
  await context?.close();
  await db.$disconnect();
  if (profilePath.startsWith(tmpdir())) rmSync(profilePath, { recursive: true, force: true });
}

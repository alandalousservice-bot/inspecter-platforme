import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const url = process.env.G3_E2E_DATABASE_URL;
const inspectorEmail = process.env.G3_E2E_INSPECTOR_EMAIL;
const inspectorPassword = process.env.G3_E2E_INSPECTOR_PASSWORD;
const districtId = process.env.G3_E2E_DISTRICT_ID;
const teacherInsideId = process.env.TASK051_TEACHER_INSIDE_ID;
const teacherOutsideId = process.env.TASK051_TEACHER_OUTSIDE_ID;
const institutionId = process.env.TASK051_INSTITUTION_ID;
if (!url || !inspectorEmail || !inspectorPassword || !districtId || !teacherInsideId || !teacherOutsideId || !institutionId) throw new Error('TASK-051 E2E fixture missing.');
const db = new PrismaClient({ datasources: { db: { url } } });

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(inspectorEmail!);
  await page.getByLabel('كلمة المرور').fill(inspectorPassword!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeVisible();
}

async function planVisit(page: Page, teacherName: string, start: string, end: string, acknowledgeWarning = false) {
  await page.goto('/app/visits/new');
  await page.getByLabel('البحث عن أستاذ').fill(teacherName);
  await page.getByRole('button', { name: new RegExp(teacherName, 'u') }).click();
  await expect(page.getByText(new RegExp(`الأستاذ المختار:.*${teacherName}`, 'u'))).toBeVisible();
  await page.getByLabel(/السنة الدراسية/u).fill('2026-2027');
  await page.getByLabel('نوع الزيارة').selectOption('GUIDANCE');
  await page.getByLabel(/بداية الزيارة/u).fill(start);
  await page.getByLabel(/نهاية الزيارة/u).fill(end);
  await page.getByLabel('مؤسسة الزيارة').selectOption(institutionId!);
  await page.getByRole('button', { name: 'إنشاء الزيارة' }).click();
  if (acknowledgeWarning) {
    await page.getByRole('dialog', { name: 'تنبيه الجدول الأسبوعي' }).waitFor();
    await page.getByRole('button', { name: 'متابعة مع هذا الموعد' }).click();
  }
}

test.beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS database, current_user AS role`;
  expect(identity[0]).toMatchObject({ database: 'task020_test', role: 'task020_test_user' });
});
test.afterAll(async () => { await db.$disconnect(); });

test('TASK-051 connected list, create/advisory, reschedule, concurrency, completion, cancellation and history', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto('/app/visits');
  await expect(page.getByRole('heading', { name: 'الزيارات التربوية' })).toBeVisible();
  await expect(page.getByText('إجمالي النتائج: 0', { exact: true }).first()).toBeVisible();

  await planVisit(page, 'زيارة داخل الجدول', '2026-10-06T08:30', '2026-10-06T09:00', true);
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]+$/u);
  await expect(page.locator('dd').filter({ hasText: 'ابتدائية TASK-051 الأصلية' })).toBeVisible();
  const firstVisitId = new URL(page.url()).pathname.split('/').at(-1)!;
  await expect(page.getByRole('link', { name: 'العودة إلى الزيارات' })).toBeVisible();
  const completeTrigger = page.getByRole('button', { name: 'إكمال الزيارة' });
  await completeTrigger.focus();
  await page.keyboard.press('Enter');
  const completeDialog = page.getByRole('dialog', { name: 'إكمال الزيارة' });
  await expect(completeDialog).toBeVisible();
  await expect.poll(() => completeDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(completeDialog).toBeHidden();
  await expect(completeTrigger).toBeFocused();

  await planVisit(page, 'زيارة خارج الجدول', '2026-10-06T11:00', '2026-10-06T12:00');
  await expect(page.getByRole('dialog', { name: 'تنبيه الجدول الأسبوعي' })).toBeVisible();
  await expect(page.getByText(/الموعد لا يقع بالكامل ضمن التوزيع الأسبوعي المسجل/u)).toBeVisible();
  await expect(page.getByText(/تنبيه استشاري ولا يمنع التخطيط/u)).toBeVisible();
  await page.getByRole('button', { name: 'متابعة مع هذا الموعد' }).click();
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]+$/u);
  const secondVisitId = new URL(page.url()).pathname.split('/').at(-1)!;

  await page.getByRole('button', { name: 'إعادة جدولة' }).click();
  await page.getByLabel(/نهاية الزيارة/u).fill('2026-10-06T13:00');
  await page.getByRole('button', { name: 'حفظ الموعد' }).click();
  await expect(page.getByRole('dialog', { name: 'تنبيه الجدول الأسبوعي' })).toBeVisible();
  await page.getByRole('button', { name: 'متابعة مع هذا الموعد' }).click();
  await expect(page.getByText('13:00')).toBeVisible();

  const loaded = await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: secondVisitId } });
  await db.pedagogicalVisit.update({ where: { id: loaded.id }, data: { revision: { increment: 1 } } });
  await page.getByRole('button', { name: 'إعادة جدولة' }).click();
  await page.getByLabel(/نهاية الزيارة/u).fill('2026-10-06T14:00');
  await page.getByRole('button', { name: 'حفظ الموعد' }).click();
  await expect(page.getByText(/تغيّرت الزيارة منذ تحميلها/u)).toBeVisible();
  await page.getByRole('button', { name: 'تحديث البيانات' }).click();
  await expect(page.getByRole('button', { name: 'حفظ الموعد' })).toBeVisible();
  await expect(page.getByText('13:00')).toBeVisible();
  await page.getByRole('button', { name: 'إلغاء إعادة الجدولة' }).click();

  await page.getByRole('button', { name: 'إكمال الزيارة' }).click();
  await page.getByLabel(/وقت الإنجاز الفعلي/u).fill('2020-01-01T09:00');
  await page.getByRole('button', { name: 'تأكيد إكمال الزيارة' }).click();
  await expect(page.getByText('مكتملة')).toBeVisible();
  await expect(page.getByRole('button', { name: /إعادة جدولة|إكمال الزيارة|إلغاء الزيارة/u })).toHaveCount(0);

  await page.goto(`/app/visits/${firstVisitId}`);
  await page.getByRole('button', { name: 'إلغاء الزيارة' }).click();
  await page.getByRole('button', { name: 'تأكيد إلغاء الزيارة' }).click();
  await expect(page.getByText('ملغاة')).toBeVisible();
  await expect(page.locator('dd').filter({ hasText: 'ابتدائية TASK-051 الأصلية' })).toBeVisible();
  await expect(page.getByRole('button', { name: /إعادة جدولة|إكمال الزيارة|إلغاء الزيارة/u })).toHaveCount(0);

  await db.institution.update({ where: { id: institutionId }, data: { name: 'اسم حالي مختلف' } });
  await page.reload();
  await expect(page.locator('dd').filter({ hasText: 'ابتدائية TASK-051 الأصلية' })).toBeVisible();
  await expect(page.getByText('اسم حالي مختلف', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'محمد زيارة داخل الجدول' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${teacherInsideId}$`, 'u'));
  await page.goto('/app/visits');
  await expect(page.getByRole('link', { name: /زيارة خارج الجدول/u })).toBeVisible();
  await expect(page.locator('.visit-page')).toHaveAttribute('dir', 'rtl');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.visit-mobile-list')).toBeVisible();
  await expect(page.locator('.visit-desktop-list')).toBeHidden();
  await page.getByRole('button', { name: 'فتح قائمة التنقل' }).click();
  await expect(page.getByRole('link', { name: 'الزيارات' })).toBeVisible();
  await page.getByRole('button', { name: 'إغلاق القائمة' }).click();
  // A 384×500 CSS viewport models 200% zoom from the preceding 768×1000 viewport.
  await page.setViewportSize({ width: 384, height: 500 });
  await expect(page.locator('.visit-mobile-list')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  void teacherOutsideId;
});

test('G8-07 connected Visit visual states at desktop, tablet, mobile and dense widths', async ({ page }, testInfo: TestInfo) => {
  const inspector = await db.inspector.findUniqueOrThrow({ where: { email: inspectorEmail! }, select: { id: true } });
  const types = ['GUIDANCE', 'TENURE_CONFIRMATION', 'PROMOTION_EVALUATION', 'MONITORING_FOLLOW_UP', 'EXCEPTIONAL'];
  const base = Date.UTC(2027, 0, 1, 8, 30);
  await db.pedagogicalVisit.createMany({ data: Array.from({ length: 30 }, (_, index) => {
    const start = new Date(base + index * 86_400_000);
    const end = new Date(start.getTime() + 45 * 60_000);
    const status = index % 3 === 0 ? 'COMPLETED' : index % 3 === 1 ? 'CANCELLED' : 'PLANNED';
    return {
      districtId: districtId!, inspectorId: inspector.id, teacherId: teacherInsideId!, institutionId: institutionId!,
      institutionNameSnapshot: 'ابتدائية TASK-051 الأصلية', academicYear: '2026-2027', visitType: types[index % types.length],
      scheduledStartAt: start, scheduledEndAt: end,
      ...(status === 'COMPLETED' ? { occurredAt: end } : {}),
      status,
    };
  }) });

  await login(page);
  const widths = [1440, 1280, 768, 390] as const;
  const plannedVisit = await db.pedagogicalVisit.findFirstOrThrow({ where: { districtId: districtId!, status: 'PLANNED' }, orderBy: { scheduledStartAt: 'desc' }, select: { id: true } });
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto(`/app/visits/${plannedVisit.id}`);
    await expect(page.getByRole('heading', { name: 'تفاصيل الزيارة' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'إعادة جدولة' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`g8-07-detail-${width}.png`), fullPage: true });
  }
  const states = [
    { name: 'dense', path: '/app/visits', heading: 'قائمة الزيارات' },
    { name: 'upcoming', path: '/app/visits?status=PLANNED', heading: 'قائمة الزيارات' },
    { name: 'history', path: '/app/visits?status=COMPLETED', heading: 'قائمة الزيارات' },
    { name: 'filtered-empty', path: '/app/visits?status=PLANNED&fromDate=2040-01-01&toDate=2040-01-02', heading: 'لا توجد زيارات مطابقة' },
  ];
  for (const state of states) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await page.goto(state.path);
      await expect(page.getByRole('heading', { name: state.heading })).toBeVisible();
      if (state.name === 'dense') {
        if (width <= 768) await expect(page.locator('.visit-mobile-list')).toBeVisible();
        else await expect(page.locator('.visit-desktop-list')).toBeVisible();
        await expect(page.locator('.visit-mobile-card')).toHaveCount(25);
        if (width > 768) await expect(page.locator('.visit-desktop-list tbody tr')).toHaveCount(25);
        for (const label of ['زيارة توجيهية / تكوينية', 'زيارة التثبيت / الترسيم', 'زيارة الترقية / التقييم', 'زيارة المراقبة والمتابعة', 'زيارة استثنائية']) {
          const visibleList = page.locator(width <= 768 ? '.visit-mobile-list' : '.visit-desktop-list');
          await expect(visibleList.locator('.visit-type-badge').filter({ hasText: label }).first()).toBeVisible();
        }
      }
      if (state.name === 'history') await expect(page.locator(width <= 768 ? '.visit-mobile-list .ui-status-badge' : '.visit-desktop-list .ui-status-badge').filter({ hasText: 'مكتملة' }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`g8-07-${state.name}-${width}.png`), fullPage: true });
    }
  }

  await page.route('**/api/v1/visits?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [], page: { limit: 25, total: 0, nextCursor: null } }),
  }));
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto('/app/visits');
    await expect(page.getByRole('heading', { name: 'لا توجد زيارات مطابقة' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`g8-07-empty-${width}.png`), fullPage: true });
  }
  await page.unroute('**/api/v1/visits?*');

  await page.route('**/api/v1/visits?*', (route) => route.abort());
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto('/app/visits');
    await expect(page.getByRole('heading', { name: 'تعذر تحميل الزيارات' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`g8-07-error-${width}.png`), fullPage: true });
  }
  await page.unroute('**/api/v1/visits?*');

  await page.goto('/app/visits/new');
  await page.getByLabel('البحث عن أستاذ').fill('زيارة داخل الجدول');
  await page.getByRole('button', { name: /محمد زيارة داخل الجدول/u }).click();
  await page.getByLabel(/السنة الدراسية/u).fill('2026-2027');
  await page.getByLabel('نوع الزيارة').selectOption('EXCEPTIONAL');
  await page.getByLabel(/بداية الزيارة/u).fill('2026-10-13T09:30');
  await page.getByLabel(/نهاية الزيارة/u).fill('2026-10-13T10:00');
  await page.getByLabel('مؤسسة الزيارة').selectOption(institutionId!);
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await expect(page.getByLabel('نوع الزيارة')).toHaveValue('EXCEPTIONAL');
    await expect(page.getByLabel('مؤسسة الزيارة')).toHaveValue(institutionId!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`g8-07-scheduling-${width}.png`), fullPage: true });
  }
  await page.getByLabel(/السنة الدراسية/u).fill('2026-2028');
  await page.getByRole('button', { name: 'إنشاء الزيارة' }).click();
  await expect(page.getByRole('alert')).toContainText('أدخل سنة دراسية صحيحة مثل 2026-2027.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('g8-07-scheduling-validation-390.png'), fullPage: true });
});

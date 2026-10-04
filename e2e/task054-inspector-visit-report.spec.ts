import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const dbUrl = process.env.G3_E2E_DATABASE_URL; const email = process.env.G3_E2E_INSPECTOR_EMAIL; const password = process.env.G3_E2E_INSPECTOR_PASSWORD;
const visitId = process.env.TASK054_E2E_VISIT_ID;
if (!dbUrl || !email || !password || !visitId) throw new Error('TASK-054 isolated browser fixture missing.');
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function login(page: Page) {
  await page.goto('/login'); await page.getByLabel('البريد الإلكتروني').fill(email!); await page.getByLabel('كلمة المرور').fill(password!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click(); await expect(page).toHaveURL(/\/app$/u);
  await expect(page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeVisible();
}

test.beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS database,current_user AS role`;
  expect(identity[0]).toMatchObject({ database: 'task020_test', role: 'task020_test_user' });
});
test.afterAll(async () => { await db.$disconnect(); });

test('G8-08 connected report workspace responsive and Arabic-content review', async ({ page }, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const visit = await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: visitId }, select: { teacherId: true, institutionId: true } });
  await db.teacher.update({ where: { id: visit.teacherId }, data: { surname: 'المعلمة صاحبة الاسم العربي الطويل لاختبار التفاف المحتوى في شاشة التقرير المهني' } });
  await db.institution.update({ where: { id: visit.institutionId }, data: { name: 'ابتدائية الاختبار ذات الاسم المطول لضمان التفاف السياق العربي بصورة سليمة في مختلف أحجام العرض' } });
  await page.goto(`/app/visits/${visitId}/report`);
  await expect(page.getByRole('heading', { name: 'تقرير زيارة المفتش — الإصدار الأول' })).toBeVisible();
  await expect(page.getByText('لم يُحفظ بعد')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /العلامة البيداغوجية/u })).toHaveValue('');
  await expect(page.getByText(/المعلمة صاحبة الاسم العربي الطويل/u)).toBeVisible();
  const widths = [1440, 1280, 768, 390] as const;
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`g8-08-empty-${width}.png`), fullPage: true });
  }

  const mark = page.getByRole('textbox', { name: /العلامة البيداغوجية/u });
  await mark.fill('14.257');
  await page.getByRole('button', { name: 'حفظ المسودة' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'راجع الحقول المشار إليها ثم أعد الحفظ.' })).toBeVisible();
  await expect(mark).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').filter({ hasText: 'القيمة غير صالحة.' })).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`g8-08-validation-${width}.png`), fullPage: true });
  }

  await mark.fill('14.5');
  const longArabic = 'ملاحظة ميدانية عربية ممتدة لاختبار وضوح الفقرات والتفافها وارتفاع مساحة التحرير دون قص المحتوى. '.repeat(18);
  await page.getByRole('textbox', { name: 'الإرشادات والتوجيهات التربوية' }).fill(longArabic);
  await page.getByRole('textbox', { name: 'الخلاصة — مطلوبة للإتمام' }).fill(longArabic);
  expect(await mark.evaluate((input) => getComputedStyle(input).direction)).toBe('ltr');
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await expect(page.getByRole('textbox', { name: /العلامة البيداغوجية/u })).toHaveValue('14.5');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`g8-08-dense-${width}.png`), fullPage: true });
  }
  if (process.env.G8_08_MANUAL_ZOOM === '1') {
    await page.setViewportSize({ width: 1440, height: 900 });
    const initialPixelRatio = await page.evaluate(() => window.devicePixelRatio);
    for (let step = 0; step < 6; step += 1) await page.keyboard.press('Control+Equal');
    const zoomedPixelRatio = await page.evaluate(() => window.devicePixelRatio);
    expect(zoomedPixelRatio / initialPixelRatio).toBeGreaterThanOrEqual(1.8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('g8-08-real-browser-zoom.png'), fullPage: true });
  }
  await page.getByRole('button', { name: 'حفظ المسودة' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'تم حفظ مسودة التقرير.' })).toBeVisible();
  await expect(page.getByText('مسودة', { exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const printStyles = await page.locator('.report-page').evaluate((element) => ({
    layout: getComputedStyle(element).display,
    sectionScrollMargin: getComputedStyle(document.querySelector('.v1-report-section')!).scrollMarginBlockStart,
  }));
  expect(printStyles.layout).not.toBe('grid');
  expect(printStyles.sectionScrollMargin).toBe('0px');
  await page.emulateMedia({ media: 'screen' });
  await db.inspectionReport.deleteMany({ where: { visitId } });
  expect(await db.inspectionReport.count({ where: { visitId } })).toBe(0);
});

test('TASK-054 connected V1 draft and final lifecycle for promotion report', async ({ page }) => {
  await login(page); await page.goto(`/app/visits/${visitId}/report`);
  await expect(page.getByRole('heading', { name: 'تقرير زيارة المفتش — الإصدار الأول' })).toBeVisible();
  await expect(page.locator('.v1-report-page')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('زيارة الترقية / التقييم')).toBeVisible();
  await expect(page.getByRole('heading', { name: /11\. الخلاصة والنتيجة المهنية/u })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /المستوى \/ القسم/u })).toHaveValue('');
  await page.getByRole('textbox', { name: /المستوى \/ القسم/u }).fill('السنة الخامسة');
  await page.getByRole('textbox', { name: /ميدان \/ موضوع الحصة/u }).fill('ألعاب القوى');
  await page.getByRole('textbox', { name: /الخلاصة — مطلوبة للإتمام/u }).fill('خلاصة التقرير المتصل');
  await page.getByRole('textbox', { name: /العلامة البيداغوجية/u }).fill('14.25');
  await page.getByRole('textbox', { name: /التنظيم والانضباط/u }).fill('مؤشر محفوظ');
  await page.getByRole('button', { name: 'حفظ المسودة' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'تم حفظ مسودة التقرير' })).toBeVisible();
  const draft = await db.inspectionReport.findUniqueOrThrow({ where: { visitId }, include: { observations: true } });
  expect(draft.reportType).toBe('INSPECTOR_VISIT'); expect(draft.templateVersion).toBe(1); expect(draft.status).toBe('DRAFT');
  expect(draft.pedagogicalMark?.toFixed(2)).toBe('14.25'); expect(draft.inspectorConclusion).toBe('خلاصة التقرير المتصل');
  expect(draft.observations).toMatchObject([{ criterionKey: 'organization_discipline', valueText: 'مؤشر محفوظ' }]);

  await page.getByRole('button', { name: 'اعتماد التقرير النهائي' }).click();
  await page.getByRole('button', { name: 'تأكيد الاعتماد النهائي' }).click();
  await expect(page.getByText('تم اعتماد التقرير النهائي، وأصبح للقراءة فقط.')).toBeVisible();
  await expect(page.getByText('نهائي — للقراءة فقط')).toBeVisible();
  await expect(page.getByRole('button', { name: 'حفظ المسودة' })).toHaveCount(0);
  const final = await db.inspectionReport.findUniqueOrThrow({ where: { visitId } });
  expect(final.status).toBe('FINAL'); expect(final.finalizedTeacherNameSnapshot).toBe('ليلى');
  expect(final.finalizedInspectorNameSnapshot).toBe('مفتش TASK-054');
  expect(await db.auditLog.count({ where: { action: 'INSPECTION_REPORT_FINALIZED', entityId: final.id } })).toBe(1);
});

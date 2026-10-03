import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const dbUrl = process.env.G3_E2E_DATABASE_URL;
const email = process.env.G3_E2E_INSPECTOR_EMAIL;
const password = process.env.G3_E2E_INSPECTOR_PASSWORD;
const plannedId = process.env.TASK052_PLANNED_VISIT_ID;
const cancelledId = process.env.TASK052_CANCEL_VISIT_ID;
const conflictId = process.env.TASK052_CONFLICT_VISIT_ID;
if (!dbUrl || !email || !password || !plannedId || !cancelledId || !conflictId) throw new Error('TASK-052 isolated browser fixture missing.');
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function login(page: Page) {
  await page.goto('/login'); await page.getByLabel('البريد الإلكتروني').fill(email!); await page.getByLabel('كلمة المرور').fill(password!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click(); await expect(page).toHaveURL(/\/app$/u);
  await expect(page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeVisible();
}
async function fillMinimum(page: Page) {
  await page.getByRole('textbox', { name: /المستوى \/ القسم/u }).fill('السنة الرابعة');
  await page.getByRole('textbox', { name: /الميدان البيداغوجي أو موضوع الحصة/u }).fill('الألعاب الجماعية');
  await page.getByRole('textbox', { name: /خلاصة المفتش/u }).fill('خلاصة مرافقة تربوية تجريبية');
}
async function saveDraft(page: Page) { const button = page.getByRole('button', { name: 'حفظ المسودة' }); await button.focus(); await button.press('Enter'); await expect(page.getByRole('status').filter({ hasText: 'تم حفظ المسودة' })).toBeVisible(); }

test.beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS database, current_user AS role`;
  expect(identity[0]).toMatchObject({ database: 'task020_test', role: 'task020_test_user' });
});
test.afterAll(async () => { await db.$disconnect(); });

test('TASK-052 connected draft, final snapshots, cancelled draft and stale revision UX', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await login(page);
  // FLOW A: a planned visit starts as no report, saves explicitly, then reloads from persistence.
  await page.goto(`/app/visits/${plannedId}/report`);
  await expect(page.getByRole('heading', { name: 'محتوى التقرير' })).toBeVisible();
  await expect(page.locator('.report-page')).toHaveAttribute('dir', 'rtl');
  await fillMinimum(page); await page.getByRole('textbox', { name: /الملاحظات البيداغوجية/u }).fill('ملاحظة ميدانية خاصة غير معروضة في الرابط');
  await saveDraft(page); await expect(page.getByRole('textbox', { name: /المستوى \/ القسم/u })).toHaveValue('السنة الرابعة');
  await page.reload(); await expect(page.getByRole('textbox', { name: /خلاصة المفتش/u })).toHaveValue('خلاصة مرافقة تربوية تجريبية');

  // FLOW B: use the existing TASK-051 completion UI, then finalize and verify persistence/read-only.
  await page.goto(`/app/visits/${plannedId}`); await page.getByRole('button', { name: 'إكمال الزيارة' }).click();
  await page.getByLabel(/وقت الإنجاز الفعلي/u).fill('2026-09-30T10:00'); await page.getByRole('button', { name: 'تأكيد إكمال الزيارة' }).click();
  await expect(page.getByText('مكتملة')).toBeVisible(); await page.getByRole('link', { name: 'تقرير المرافقة البيداغوجية' }).click();
  await expect(page.getByRole('textbox', { name: /خلاصة المفتش/u })).toHaveValue('خلاصة مرافقة تربوية تجريبية');
  await page.getByRole('button', { name: 'اعتماد التقرير النهائي' }).click();
  await expect(page.getByRole('dialog', { name: 'اعتماد التقرير النهائي' })).toBeVisible();
  await expect(page.getByText(/ليس توقيعًا رقميًا/u)).toBeVisible(); await page.getByRole('button', { name: 'تأكيد الاعتماد النهائي' }).click();
  await expect(page.getByRole('heading', { name: 'محتوى التقرير النهائي' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'حفظ المسودة' })).toHaveCount(0); await expect(page.getByRole('button', { name: 'اعتماد التقرير النهائي' })).toHaveCount(0);

  // FLOW C: mutate live identities in the isolated fixture; final report must retain snapshots.
  const report = await db.inspectionReport.findUniqueOrThrow({ where: { visitId: plannedId } });
  const inspectorId = (await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: plannedId }, select: { inspectorId: true } })).inspectorId;
  const teacherId = (await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: plannedId }, select: { teacherId: true } })).teacherId;
  await db.inspector.update({ where: { id: inspectorId }, data: { name: 'هوية لاحقة', surname: 'مختلفة' } });
  await db.teacher.update({ where: { id: teacherId }, data: { name: 'اسم لاحق', surname: 'مختلف' } });
  await page.reload(); await expect(page.getByText('مفتش تجريبي')).toBeVisible(); await expect(page.getByText('ليلى علي').first()).toBeVisible();
  expect(report.status).toBe('FINAL');

  // FLOW D: saved draft remains visible but read-only after cancelling its Visit.
  await page.goto(`/app/visits/${cancelledId}/report`); await fillMinimum(page); await saveDraft(page);
  await page.goto(`/app/visits/${cancelledId}`); await page.getByRole('button', { name: 'إلغاء الزيارة' }).click();
  await page.getByRole('button', { name: 'تأكيد إلغاء الزيارة' }).click(); await expect(page.getByText('ملغاة')).toBeVisible();
  await page.getByRole('link', { name: 'تقرير المرافقة البيداغوجية' }).click();
  await expect(page.getByText(/الزيارة ملغاة/u)).toBeVisible(); await expect(page.getByRole('button', { name: 'حفظ المسودة' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'اعتماد التقرير النهائي' })).toHaveCount(0);

  // FLOW E: two independent stale views; no silent retry or replacement of local text.
  await page.goto(`/app/visits/${conflictId}/report`); await fillMinimum(page); await saveDraft(page);
  const second = await context.newPage(); await second.goto(`/app/visits/${conflictId}/report`);
  await expect(second.getByRole('textbox', { name: /المستوى \/ القسم/u })).toHaveValue('السنة الرابعة');
  await page.getByRole('textbox', { name: /المستوى \/ القسم/u }).fill('نسخة محفوظة أولى'); await saveDraft(page);
  await second.getByRole('textbox', { name: /المستوى \/ القسم/u }).fill('نص محلي متعارض'); await second.getByRole('button', { name: 'حفظ المسودة' }).click();
  await expect(second.getByText(/بقيت كتابتك الحالية كما هي/u)).toBeVisible(); await expect(second.getByRole('textbox', { name: /المستوى \/ القسم/u })).toHaveValue('نص محلي متعارض');
  await second.getByRole('button', { name: 'مراجعة النسخة الأحدث' }).click();
  await second.getByRole('button', { name: 'تحميل النسخة الأحدث' }).click();
  await expect(second.getByRole('textbox', { name: /المستوى \/ القسم/u })).toHaveValue('نسخة محفوظة أولى');
  await second.close();

  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/app/visits/${cancelledId}/report`);
  await expect(page.locator('.report-page')).toHaveAttribute('dir', 'rtl');
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

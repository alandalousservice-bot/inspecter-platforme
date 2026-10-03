import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

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
  await expect(page.getByRole('button', { name: 'حفظ المسودة' })).toHaveCount(0);
  const final = await db.inspectionReport.findUniqueOrThrow({ where: { visitId } });
  expect(final.status).toBe('FINAL'); expect(final.finalizedTeacherNameSnapshot).toBe('ليلى');
  expect(final.finalizedInspectorNameSnapshot).toBe('مفتش TASK-054');
  expect(await db.auditLog.count({ where: { action: 'INSPECTION_REPORT_FINALIZED', entityId: final.id } })).toBe(1);
});

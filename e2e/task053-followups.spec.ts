import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const dbUrl = process.env.G3_E2E_DATABASE_URL; const email = process.env.G3_E2E_INSPECTOR_EMAIL; const password = process.env.G3_E2E_INSPECTOR_PASSWORD;
const otherEmail = process.env.TASK053_E2E_OTHER_EMAIL; const otherPassword = process.env.TASK053_E2E_OTHER_PASSWORD;
const reportId = process.env.TASK053_E2E_REPORT_ID; const visitId = process.env.TASK053_E2E_VISIT_ID;
if (!dbUrl || !email || !password || !otherEmail || !otherPassword || !reportId || !visitId) throw new Error('TASK-053 isolated browser fixture missing.');
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function login(page: Page, selectedEmail = email!, selectedPassword = password!) {
  await page.goto('/login'); await page.getByLabel('البريد الإلكتروني').fill(selectedEmail); await page.getByLabel('كلمة المرور').fill(selectedPassword);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click(); await expect(page).toHaveURL(/\/app/u);
}

test.beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS database,current_user AS role`;
  expect(identity[0]).toMatchObject({ database: 'task020_test', role: 'task020_test_user' });
});
test.afterAll(async () => { await db.$disconnect(); });

test('TASK-053 connected Visit→FINAL Report→FollowUp lifecycle and immutable report evidence', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await login(page);
  await page.goto(`/app/visits/${visitId}/report`);
  await expect(page.getByRole('textbox', { name: /المستوى \/ القسم/u })).toHaveValue('السنة الرابعة');
  await page.getByRole('button', { name: 'اعتماد التقرير النهائي' }).click();
  await page.getByRole('button', { name: 'تأكيد الاعتماد النهائي' }).click();
  await expect(page.getByRole('heading', { name: 'إجراءات المتابعة' })).toBeVisible();
  const finalSnapshot = await db.inspectionReport.findUniqueOrThrow({ where: { id: reportId } });
  const finalAudit = await db.auditLog.findMany({ where: { action: 'INSPECTION_REPORT_FINALIZED', entityId: reportId }, orderBy: { occurredAt: 'asc' } });
  expect(finalSnapshot.status).toBe('FINAL'); expect(finalAudit).toHaveLength(1);

  await page.getByRole('button', { name: 'إضافة إجراء متابعة' }).click();
  await page.getByLabel('الإجراء المطلوب').fill('مراجعة تطبيق الإحماء'); await page.getByLabel('تاريخ الاستحقاق').fill('2020-01-01');
  await page.getByRole('button', { name: 'حفظ الإجراء' }).click(); await expect(page.getByText('مراجعة تطبيق الإحماء').first()).toBeVisible();
  const todayParts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  await page.getByRole('button', { name: 'إضافة إجراء متابعة' }).click();
  await page.getByLabel('الإجراء المطلوب').fill('التحقق من تنفيذ التوجيه'); await page.getByLabel('تاريخ الاستحقاق').fill(today);
  await page.getByRole('button', { name: 'حفظ الإجراء' }).click(); await expect(page.getByText('التحقق من تنفيذ التوجيه').first()).toBeVisible();
  expect(await db.inspectionReport.findUniqueOrThrow({ where: { id: reportId } })).toEqual(finalSnapshot);

  await page.getByRole('link', { name: 'إجراءات المتابعة', exact: true }).click(); await expect(page.getByRole('heading', { name: 'إجراءات المتابعة' })).toBeVisible();
  await expect(page.locator('.followup-badge--overdue')).toBeVisible(); await expect(page.locator('.followup-badge--due_today')).toBeVisible();
  await page.getByLabel('الاستحقاق').selectOption('OVERDUE'); await expect(page.getByText('مراجعة تطبيق الإحماء').first()).toBeVisible();
  await page.getByLabel('الاستحقاق').selectOption('DUE_TODAY'); await expect(page.getByText('التحقق من تنفيذ التوجيه').first()).toBeVisible();
  await page.getByLabel('الاستحقاق').selectOption(''); await expect(page.getByText('مراجعة تطبيق الإحماء').first()).toBeVisible();

  const browser = page.context().browser(); if (!browser) throw new Error('Browser context is unavailable.');
  const readerContext = await browser.newContext(); const readerPage = await readerContext.newPage();
  await login(readerPage, otherEmail!, otherPassword!); await readerPage.goto('/app/follow-ups');
  await expect(readerPage.getByText('مراجعة تطبيق الإحماء').first()).toBeVisible();
  await expect(readerPage.getByRole('button', { name: 'تعديل الإجراء' })).toHaveCount(0);
  await expect(readerPage.getByRole('button', { name: 'إكمال الإجراء' })).toHaveCount(0); await readerContext.close();

  const staleItem = await db.followUp.findFirstOrThrow({ where: { reportId, note: 'مراجعة تطبيق الإحماء' } });
  await db.followUp.update({ where: { id: staleItem.id }, data: { revision: { increment: 1 } } });
  await page.getByRole('button', { name: 'تعديل الإجراء' }).first().click();
  const staleResponsePromise = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes(`/api/v1/follow-ups/${staleItem.id}`));
  await page.getByRole('button', { name: 'حفظ التعديل' }).click();
  const staleResponse = await staleResponsePromise; expect(staleResponse.status()).toBe(409);
  expect((await staleResponse.json()).error.code).toBe('FOLLOW_UP_REVISION_CONFLICT');
  await expect(page.getByRole('button', { name: 'تحديث البيانات' })).toBeVisible();
  await page.getByRole('button', { name: 'تحديث البيانات' }).click(); await expect(page.getByText('مراجعة تطبيق الإحماء').first()).toBeVisible();

  await page.getByRole('button', { name: 'تعديل الإجراء' }).first().click();
  await page.getByLabel('تاريخ الاستحقاق').fill('2020-01-02'); await page.getByRole('button', { name: 'حفظ التعديل' }).click();
  await expect(page.getByText('تم حفظ التعديل.')).toBeVisible();
  await page.getByRole('button', { name: 'إكمال الإجراء' }).first().click();
  await page.getByLabel('نتيجة المتابعة').fill('تمت المراجعة ميدانيًا'); await page.getByRole('button', { name: 'تأكيد الإكمال' }).click();
  await expect(page.getByText('تم إكمال إجراء المتابعة.')).toBeVisible();
  await page.getByLabel('الحالة').selectOption('COMPLETED'); await expect(page.getByRole('listitem').getByText('تمت المراجعة ميدانيًا', { exact: true })).toBeVisible();
  await expect(page.getByText('هذه المتابعة مكتملة وللقراءة فقط.')).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'إجراءات المتابعة' })).toBeVisible();
  await page.getByLabel('الحالة').selectOption('COMPLETED'); await expect(page.getByRole('listitem').getByText('تمت المراجعة ميدانيًا', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تعديل الإجراء' })).toHaveCount(0); await expect(page.getByRole('button', { name: 'إكمال الإجراء' })).toHaveCount(0);

  const reportAfter = await db.inspectionReport.findUniqueOrThrow({ where: { id: reportId } });
  expect(reportAfter).toEqual(finalSnapshot);
  const finalAuditAfter = await db.auditLog.findMany({ where: { action: 'INSPECTION_REPORT_FINALIZED', entityId: reportId }, orderBy: { occurredAt: 'asc' } });
  expect(finalAuditAfter).toEqual(finalAudit);
  const followUps = await db.followUp.findMany({ where: { reportId }, orderBy: { dueDate: 'asc' } });
  expect(followUps).toHaveLength(2); expect(followUps[0].status).toBe('COMPLETED'); expect(followUps[0].revision).toBe(4); expect(followUps[0].completedAt).not.toBeNull();
  expect(await db.auditLog.count({ where: { action: 'FOLLOW_UP_STATE_CHANGED', entityId: followUps[0].id } })).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 768, height: 1000 }); await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

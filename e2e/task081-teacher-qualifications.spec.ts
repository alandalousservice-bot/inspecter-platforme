import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const dbUrl = process.env.G3_E2E_DATABASE_URL;
const email = process.env.G3_E2E_INSPECTOR_EMAIL;
const password = process.env.G3_E2E_INSPECTOR_PASSWORD;
const teacherId = process.env.TASK081_E2E_TEACHER_ID;
if (!dbUrl || !email || !password || !teacherId) throw new Error('TASK-081 isolated browser fixture is missing.');
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email!);
  await page.getByLabel('كلمة المرور').fill(password!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/app\/institutions$/u);
}

test.beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  expect(identity[0]).toMatchObject({ database: 'task020_test', role: 'task020_test_user', address: '127.0.0.1/32', port: 55432 });
});
test.afterAll(async () => { await db.$disconnect(); });

test('TASK-081 connected profile create, edit, delete and legacy-text preservation', async ({ page }) => {
  await login(page);
  await page.goto(`/app/teachers/${teacherId}`);
  await expect(page.getByRole('heading', { name: 'ملف الأستاذ' })).toBeVisible();
  await expect(page.getByText('مؤهلات سابقة غير مفصلة')).toBeVisible();
  await expect(page.getByText('نص قديم للاختبار')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'المؤهلات والشهادات' })).toBeVisible();
  await expect(page.locator('.teacher-profile')).toHaveAttribute('dir', 'rtl');

  await page.getByRole('button', { name: 'إضافة مؤهل' }).click();
  await page.getByLabel(/الشهادة/u).fill('شهادة متصلة');
  await page.getByLabel('مصدرها').fill('معهد اختباري');
  await page.getByLabel('تاريخها').fill('2021-06-15');
  await page.getByRole('button', { name: 'حفظ المؤهل' }).click();
  await expect(page.getByRole('heading', { name: 'شهادة متصلة' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'شهادة متصلة' })).toBeVisible();

  await page.getByRole('button', { name: 'تعديل شهادة متصلة' }).click();
  await page.getByLabel(/الشهادة/u).fill('شهادة معدلة');
  await page.getByRole('button', { name: 'حفظ المؤهل' }).click();
  await expect(page.getByRole('heading', { name: 'شهادة معدلة' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'شهادة معدلة' })).toBeVisible();

  await page.getByRole('button', { name: 'حذف شهادة معدلة' }).click();
  await page.getByRole('button', { name: 'تأكيد الحذف' }).click();
  await expect(page.getByRole('heading', { name: 'لم تُسجَّل مؤهلات منظَّمة بعد' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'لم تُسجَّل مؤهلات منظَّمة بعد' })).toBeVisible();
  await expect(page.getByText('نص قديم للاختبار')).toBeVisible();

  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: teacherId } });
  expect(teacher.qualifications).toBe('نص قديم للاختبار');
  expect(await db.teacherQualification.count({ where: { teacherId } })).toBe(0);
  expect(await db.auditLog.count({ where: { action: 'TEACHER_QUALIFICATION_CREATED', entityType: 'TeacherQualification' } })).toBe(1);
  expect(await db.auditLog.count({ where: { action: 'TEACHER_QUALIFICATION_UPDATED', entityType: 'TeacherQualification' } })).toBe(1);
  expect(await db.auditLog.count({ where: { action: 'TEACHER_QUALIFICATION_DELETED', entityType: 'TeacherQualification' } })).toBe(1);
});

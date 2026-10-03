import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const databaseUrl = process.env.G3_E2E_DATABASE_URL;
const email = process.env.G3_E2E_INSPECTOR_EMAIL;
const password = process.env.G3_E2E_INSPECTOR_PASSWORD;
const teacherId = process.env.TASK084_E2E_TEACHER_ID;
const academicYear = process.env.TASK084_E2E_ACADEMIC_YEAR;
const supplementaryName = process.env.TASK084_E2E_SUPPLEMENTARY_NAME;
if (!databaseUrl || !email || !password || !teacherId || !academicYear || !supplementaryName) throw new Error('TASK-084 isolated browser fixture is missing.');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email!);
  await page.getByLabel('كلمة المرور').fill(password!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeVisible();
}

test.beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  expect(identity[0]).toMatchObject({ database: 'task020_test', role: 'task020_test_user', address: '127.0.0.1/32', port: 55432 });
});
test.afterAll(async () => { await db.$disconnect(); });

test('TASK-084 Inspector directory to current information card, source independence and fresh aggregate after workplace close', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await login(page);
  await page.goto('/app/teachers');
  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: teacherId! } });
  await page.getByRole('link', { name: `${teacher.name} ${teacher.surname}` }).click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${teacherId}$`, 'u'));
  await page.getByRole('link', { name: 'بطاقة معلومات الأستاذ' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${teacherId}/information-card$`, 'u'));
  await page.getByLabel('السنة الدراسية').fill(academicYear!);
  await page.getByRole('button', { name: 'عرض البطاقة' }).click();
  await expect(page.getByText(supplementaryName!, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('شهادة منظمة', { exact: true })).toBeVisible();
  await expect(page.getByText('مؤهل قديم غير مفصل', { exact: true })).toBeVisible();
  await expect(page.getByText('15.5 / 20', { exact: true })).toBeVisible();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  await expect(page.getByText(today, { exact: true })).toBeVisible();
  await expect(page.locator('.teacher-card')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'عرض التوزيع الأسبوعي الكامل' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.goto(`/app/teachers/${teacherId}`);
  await page.getByRole('button', { name: 'إنهاء العلاقة' }).click();
  await page.getByRole('button', { name: 'تأكيد الإنهاء' }).click();
  await expect(page.getByRole('heading', { name: 'السابقة (1)' })).toBeVisible();
  await page.goto(`/app/teachers/${teacherId}/information-card?academicYear=${academicYear}`);
  await expect(page.getByText('لا توجد تكملة نصاب حالية')).toBeVisible();
  expect(await db.teacherSupplementaryWorkplace.count({ where: { teacherId: teacherId! } })).toBe(1);
});

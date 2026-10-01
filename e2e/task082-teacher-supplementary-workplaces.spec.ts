import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const dbUrl = process.env.G3_E2E_DATABASE_URL;
const email = process.env.G3_E2E_INSPECTOR_EMAIL;
const password = process.env.G3_E2E_INSPECTOR_PASSWORD;
const teacherId = process.env.TASK082_E2E_TEACHER_ID;
const homeName = process.env.TASK082_E2E_HOME_NAME;
const supplementaryName = process.env.TASK082_E2E_SUPPLEMENTARY_NAME;
const homeId = process.env.TASK082_E2E_HOME_ID;
const supplementaryId = process.env.TASK082_E2E_SUPPLEMENTARY_ID;
const scheduleId = process.env.TASK082_E2E_SCHEDULE_ID;
const visitId = process.env.TASK082_E2E_VISIT_ID;
if (!dbUrl || !email || !password || !teacherId || !homeName || !supplementaryName || !homeId || !supplementaryId || !scheduleId || !visitId) throw new Error('TASK-082 isolated browser fixture is missing.');
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email!);
  await page.getByLabel('كلمة المرور').fill(password!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/app\/institutions$/u);
}

function algiersToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

test.beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  expect(identity[0]).toMatchObject({ database: 'task020_test', role: 'task020_test_user', address: '127.0.0.1/32', port: 55432 });
});
test.afterAll(async () => { await db.$disconnect(); });

test('TASK-082 connected profile add, reload and close retain home, schedule and Visit', async ({ page }) => {
  await login(page);
  await page.goto(`/app/teachers/${teacherId}`);
  await expect(page.getByRole('heading', { name: 'ملف الأستاذ' })).toBeVisible();
  await expect(page.locator('.teacher-profile')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText(homeName!, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'مؤسسات تكملة النصاب' })).toBeVisible();

  await page.getByRole('button', { name: 'إضافة مؤسسة تكملة النصاب' }).click();
  await page.getByRole('button', { name: new RegExp(supplementaryName!, 'u') }).click();
  const today = algiersToday();
  const yesterdayDate = new Date(`${today}T00:00:00.000Z`); yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  await page.getByLabel('تاريخ بداية العلاقة').fill(yesterdayDate.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'الحالية (1)' })).toBeVisible();
  await page.reload();
  await expect(page.getByText(supplementaryName!, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'الحالية (1)' })).toBeVisible();

  await page.getByRole('button', { name: 'إنهاء العلاقة' }).click();
  await page.getByRole('button', { name: 'تأكيد الإنهاء' }).click();
  await expect(page.getByRole('heading', { name: 'السابقة (1)' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'السابقة (1)' })).toBeVisible();
  await expect(page.getByText(homeName!, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /حذف|أرشفة/ })).toHaveCount(0);

  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: teacherId! } });
  expect(teacher.institutionId).toBe(homeId);
  expect(teacher.institutionAppointmentNumber).toBe('E2E-1');
  const workplace = await db.teacherSupplementaryWorkplace.findFirstOrThrow({ where: { teacherId: teacherId!, institutionId: supplementaryId! } });
  expect(workplace.validTo).not.toBeNull();
  expect(await db.weeklySchedule.findUniqueOrThrow({ where: { id: scheduleId! } })).toMatchObject({ teacherId: teacherId!, academicYear: '2026-2027' });
  expect(await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: visitId! } })).toMatchObject({ teacherId: teacherId!, institutionId: homeId!, institutionNameSnapshot: homeName! });
});

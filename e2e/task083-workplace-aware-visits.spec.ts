import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const url = process.env.G3_E2E_DATABASE_URL;
const email = process.env.G3_E2E_INSPECTOR_EMAIL;
const password = process.env.G3_E2E_INSPECTOR_PASSWORD;
const teacherId = process.env.TASK083_E2E_TEACHER_ID;
const teacherName = process.env.TASK083_E2E_TEACHER_NAME;
const homeId = process.env.TASK083_E2E_HOME_ID;
const homeName = process.env.TASK083_E2E_HOME_NAME;
const supplementaryId = process.env.TASK083_E2E_SUPPLEMENTARY_ID;
const supplementaryName = process.env.TASK083_E2E_SUPPLEMENTARY_NAME;
const scheduleId = process.env.TASK083_E2E_SCHEDULE_ID;
const visitDate = process.env.TASK083_E2E_DATE;
const validTo = process.env.TASK083_E2E_VALID_TO;
const academicYear = process.env.TASK083_E2E_YEAR;
const weekday = process.env.TASK083_E2E_WEEKDAY;
if (!url || !email || !password || !teacherId || !teacherName || !homeId || !homeName || !supplementaryId || !supplementaryName || !scheduleId || !visitDate || !validTo || !academicYear || !weekday) {
  throw new Error('TASK-083 isolated browser fixture is missing.');
}
const db = new PrismaClient({ datasources: { db: { url } } });

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email!);
  await page.getByLabel('كلمة المرور').fill(password!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/app\/institutions$/u);
}

async function createVisit(page: Page, start: string, end: string) {
  await page.goto('/app/visits/new');
  await page.getByLabel('البحث عن أستاذ').fill(teacherName!);
  await page.getByRole('button', { name: new RegExp(teacherName!, 'u') }).click();
  await expect(page.getByText(new RegExp(`الأستاذ المختار:.*${teacherName!}`, 'u'))).toBeVisible();
  await page.getByLabel('السنة الدراسية').fill(academicYear!);
  await page.getByLabel('نوع الزيارة').selectOption('GUIDANCE');
  await page.getByLabel(/بداية الزيارة/u).fill(start);
  await page.getByLabel(/نهاية الزيارة/u).fill(end);
  await page.getByLabel('مؤسسة الزيارة').selectOption(supplementaryId!);
  await page.getByRole('button', { name: 'إنشاء الزيارة' }).click();
}

async function loadSchedule(page: Page) {
  await page.getByLabel('السنة الدراسية').fill(academicYear!);
  await page.getByRole('button', { name: 'عرض التوزيع' }).click();
  await expect(page.getByRole('heading', { name: `السنة الدراسية ${academicYear}` })).toBeVisible();
}

test.beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  expect(identity[0]).toMatchObject({ database: 'task020_test', role: 'task020_test_user', address: '127.0.0.1/32', port: 55432 });
});
test.afterAll(async () => { await db.$disconnect(); });

test('TASK-083 connected workplace-aware schedule and visit creation, warning acknowledgement and historic snapshot', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await login(page);

  await page.goto(`/app/teachers/${teacherId}/schedules`);
  await loadSchedule(page);
  await page.getByLabel('بداية السريان').fill(visitDate!);
  await page.getByLabel('نهاية السريان (اختياري)').fill(validTo!);
  await page.getByLabel('مكان العمل').selectOption(supplementaryId!);
  await page.getByLabel('اليوم').selectOption(weekday!);
  await page.getByLabel('وقت البداية').fill('08:00');
  await page.getByLabel('وقت النهاية').fill('10:00');
  await page.getByRole('button', { name: 'إضافة الحصة' }).click();
  await expect(page.getByText(supplementaryName!, { exact: true })).toBeVisible();
  await expect(page.getByText(`${visitDate} — ${validTo}`, { exact: true })).toBeVisible();
  const slot = await db.weeklyScheduleSlot.findFirstOrThrow({ where: { scheduleId: scheduleId! } });
  expect(slot).toMatchObject({ institutionId: supplementaryId, validFrom: new Date(`${visitDate}T00:00:00.000Z`), validTo: new Date(`${validTo}T00:00:00.000Z`) });

  await page.reload();
  await loadSchedule(page);
  await expect(page.getByText(supplementaryName!, { exact: true })).toBeVisible();
  await expect(page.getByText(`${visitDate} — ${validTo}`, { exact: true })).toBeVisible();
  await createVisit(page, `${visitDate}T08:00`, `${visitDate}T10:00`);
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]+$/u);
  let visitId = new URL(page.url()).pathname.split('/').at(-1)!;
  let visit = await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: visitId } });
  expect(visit).toMatchObject({ teacherId, institutionId: supplementaryId, institutionNameSnapshot: supplementaryName, status: 'PLANNED' });

  await page.goto(`/app/teachers/${teacherId}/schedules`);
  await loadSchedule(page);
  await page.getByLabel('بداية السريان').fill(visitDate!);
  await page.getByLabel('نهاية السريان (اختياري)').fill(validTo!);
  await page.getByLabel('مكان العمل').selectOption(homeId!);
  await page.getByLabel('اليوم').selectOption(weekday!);
  await page.getByLabel('وقت البداية').fill('11:00');
  await page.getByLabel('وقت النهاية').fill('12:00');
  await page.getByRole('button', { name: 'إضافة الحصة' }).click();
  await expect(page.locator('.weekly-schedule__slot').filter({ hasText: homeName! })).toBeVisible();
  const homeSlot = await db.weeklyScheduleSlot.findFirstOrThrow({ where: { scheduleId: scheduleId!, institutionId: homeId } });
  expect(homeSlot).toMatchObject({ validFrom: slot.validFrom, validTo: slot.validTo, dayOfWeek: slot.dayOfWeek, startMinute: 660, endMinute: 720 });

  await createVisit(page, `${visitDate}T11:00`, `${visitDate}T12:00`);
  await expect(page.getByRole('dialog', { name: 'تنبيه الجدول الأسبوعي' })).toBeVisible();
  await expect(page.getByText(/تنبيه استشاري ولا يمنع التخطيط/u)).toBeVisible();
  await page.getByRole('button', { name: 'متابعة مع هذا الموعد' }).click();
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]+$/u);
  visitId = new URL(page.url()).pathname.split('/').at(-1)!;
  visit = await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: visitId } });
  expect(visit).toMatchObject({ institutionId: supplementaryId, institutionNameSnapshot: supplementaryName });
  const warningAudit = await db.auditLog.findFirstOrThrow({ where: { entityId: visitId, action: 'PEDAGOGICAL_VISIT_CREATED' } });
  expect(warningAudit.metadata).toMatchObject({ scheduleWarningCode: 'VISIT_OUTSIDE_WEEKLY_SCHEDULE' });

  await page.goto(`/app/teachers/${teacherId}`);
  await page.getByRole('button', { name: 'إنهاء العلاقة' }).click();
  await page.getByRole('button', { name: 'تأكيد الإنهاء' }).click();
  await expect(page.getByRole('heading', { name: 'السابقة (1)' })).toBeVisible();
  const closedSlot = await db.weeklyScheduleSlot.findUniqueOrThrow({ where: { id: slot.id } });
  expect(closedSlot).toMatchObject({ institutionId: supplementaryId, validFrom: slot.validFrom, validTo: slot.validTo, dayOfWeek: slot.dayOfWeek, startMinute: 480, endMinute: 600 });
  expect(await db.weeklyScheduleSlot.findUniqueOrThrow({ where: { id: homeSlot.id } })).toMatchObject({ institutionId: homeId, validFrom: slot.validFrom, validTo: slot.validTo, dayOfWeek: slot.dayOfWeek, startMinute: 660, endMinute: 720 });

  await page.goto(`/app/visits/${visitId}`);
  await expect(page.locator('dd').filter({ hasText: supplementaryName! })).toBeVisible();
  const historicalVisit = await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: visitId } });
  expect(historicalVisit).toMatchObject({ institutionId: supplementaryId, institutionNameSnapshot: supplementaryName });
  await page.goto(`/app/teachers/${teacherId}/schedules`);
  await loadSchedule(page);
  await expect(page.getByText('يحتاج إلى تصحيح', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

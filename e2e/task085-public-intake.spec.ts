import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const databaseUrl = process.env.G3_E2E_DATABASE_URL;
const districtId = process.env.TASK085_E2E_DISTRICT_ID;
const tag = process.env.TASK085_E2E_TAG;
const email = process.env.G3_E2E_INSPECTOR_EMAIL;
const password = process.env.G3_E2E_INSPECTOR_PASSWORD;
if (!databaseUrl || !districtId || !tag || !email || !password) throw new Error('TASK-085 isolated browser fixture is missing.');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const teacherData = {
  firstName: 'سلمى', lastName: `TASK085 ${tag}`, email: `teacher-${tag}@example.invalid`, phone: '0555123456',
  home: `ابتدائية مصرح بها ${tag}`, extraOne: `مؤسسة إضافية أولى ${tag}`, extraTwo: `مؤسسة إضافية ثانية ${tag}`,
  qualificationOne: `شهادة أولى ${tag}`, qualificationTwo: `شهادة ثانية ${tag}`,
};

async function loginInspector(page: Page) {
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

test('TASK-085 public declarations, Inspector acceptance and authoritative information card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/public/d/${districtId}/register`);
  await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
  await page.getByLabel('الاسم').fill(teacherData.firstName);
  await page.getByLabel('اللقب').fill(teacherData.lastName);
  await page.getByLabel('تاريخ الميلاد').fill('1985-03-04');
  await page.getByLabel('مكان الميلاد').fill('وهران');
  await page.getByLabel('رقم الهاتف').fill(teacherData.phone);
  await page.locator('#email').fill(teacherData.email);
  await page.getByLabel('الصفة المهنية').selectOption('SUBSTITUTE');
  await page.getByLabel('تاريخ التوظيف').fill('2005-09-01');
  await page.getByLabel('تاريخ الترسيم أو التثبيت').fill('2007-09-01');
  await page.getByLabel('تاريخ الترسيم أو التثبيت').fill('2007-09-01');
  await page.getByLabel('الشهادات والمؤهلات').fill(`مؤهلات قديمة ${tag}`);
  await page.getByLabel('اسم المؤسسة').fill(teacherData.home);
  await page.getByLabel('بلدية العمل').fill(`بلدية ${tag}`);
  await page.getByLabel('عنوان المؤسسة').fill(`عنوان ${tag}`);
  await page.getByLabel('رقم هاتف مدير المؤسسة').fill('021234567');
  await page.getByLabel('تاريخ التعيين بالمؤسسة المصرح بها').fill('2010-09-01');
  await page.getByLabel('رقم التعيين بالمؤسسة المصرح بها').fill(`قرار المؤسسة ${tag}`);
  await page.getByLabel('البريد الإلكتروني للمؤسسة').fill(`home-${tag}@example.invalid`);
  await page.getByLabel('خط العرض').fill('36.752887');
  await page.getByLabel('خط الطول').fill('3.042048');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator('main[dir="rtl"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByLabel('خط العرض')).toBeVisible();
    await expect(page.getByLabel('خط الطول')).toBeVisible();
  }
  await page.getByLabel('تاريخ أول تعيين في التعليم').fill('2005-09-01');
  await page.getByLabel('رقم قرار أول تعيين في التعليم').fill(`قرار أول ${tag}`);
  await page.getByLabel('تاريخ أول تنصيب').fill('2005-10-01');
  await page.getByLabel('تاريخ التربص').fill('2005-08-01');
  await page.getByLabel('ولاية الميلاد').fill('وهران');
  await page.getByLabel('الإطار').fill('إطار مصرح به');
  await page.getByLabel('العنوان الشخصي').fill(`عنوان خاص ${tag}`);
  await page.getByLabel('الصنف').fill('صنف مصرح به');
  await page.getByLabel('القسم الإداري').fill('قسم مصرح به');
  await page.getByLabel('الدرجة').fill('درجة مصرح بها');
  await page.getByLabel('تاريخ سريان التصنيف الإداري').fill('2020-01-01');
  await page.getByRole('button', { name: 'إضافة مؤسسة مصرح بها' }).click();
  await page.getByLabel('اسم المؤسسة الإضافية').nth(0).fill(teacherData.extraOne);
  await page.getByRole('button', { name: 'إضافة مؤسسة مصرح بها' }).click();
  await page.getByLabel('اسم المؤسسة الإضافية').nth(1).fill(teacherData.extraTwo);
  await page.getByRole('button', { name: 'إضافة مؤهل مصرح به' }).click();
  await page.getByLabel('اسم الشهادة أو المؤهل').nth(0).fill(teacherData.qualificationOne);
  await page.getByLabel('الجهة المانحة').nth(0).fill(`جامعة ${tag}`);
  await page.getByRole('button', { name: 'إضافة مؤهل مصرح به' }).click();
  await page.getByLabel('اسم الشهادة أو المؤهل').nth(1).fill(teacherData.qualificationTwo);
  await page.getByRole('button', { name: 'إرسال البيانات' }).click();
  await expect(page.getByRole('heading', { name: 'تم استلام بياناتك' })).toBeVisible();
  await expect(page.getByText(teacherData.email, { exact: true })).toHaveCount(0);
  await expect(page.getByText(teacherData.qualificationOne, { exact: true })).toHaveCount(0);
  await expect(page.getByText(`عنوان خاص ${tag}`, { exact: true })).toHaveCount(0);

  const submission = await db.teacherSubmission.findFirstOrThrow({ where: { districtId: districtId!, submittedProfile: { path: ['email'], equals: teacherData.email } } });
  expect(submission.status).toBe('PENDING');
  expect(submission.proposedInstitutionLatitude?.toString()).toBe('36.752887');
  expect(submission.proposedInstitutionLongitude?.toString()).toBe('3.042048');
  await loginInspector(page);
  await page.goto('/app/submissions');
  await page.getByLabel('البحث في الطلبات').fill(teacherData.lastName);
  await page.getByRole('button', { name: 'تطبيق' }).click();
  await page.getByRole('link', { name: new RegExp(teacherData.lastName) }).click();
  await expect(page.getByRole('heading', { name: /بيانات إدارية مصرح بها — غير معتمدة/ })).toBeVisible();
  await expect(page.getByText(`قرار المؤسسة ${tag}`, { exact: true })).toBeVisible();
  await expect(page.getByText(teacherData.qualificationOne, { exact: true })).toBeVisible();
  await expect(page.getByText(teacherData.extraTwo, { exact: true })).toBeVisible();
  await expect(page.getByText(/لا تُعرض كمؤهلات معتمدة/)).toBeVisible();
  await page.getByRole('button', { name: 'قبول الطلب' }).click();
  await page.getByRole('dialog', { name: 'تأكيد قبول الطلب' }).getByRole('button', { name: 'تأكيد القرار' }).click();
  await expect(page.getByText('مقبول', { exact: true })).toBeVisible();

  const accepted = await db.teacherSubmission.findUniqueOrThrow({ where: { id: submission.id } });
  const teacherId = accepted.acceptedTeacherId!;
  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: teacherId } });
  expect(teacher).toMatchObject({
    districtId: districtId!, name: teacherData.firstName, surname: teacherData.lastName, professionalStatus: 'SUBSTITUTE',
    birthProvince: 'وهران', professionalFramework: 'إطار مصرح به', firstEducationAppointmentDate: new Date('2005-09-01T00:00:00.000Z'),
    firstInstallationDate: new Date('2005-10-01T00:00:00.000Z'), traineeshipDate: new Date('2005-08-01T00:00:00.000Z'),
    administrativeCategory: 'صنف مصرح به', administrativeSection: 'قسم مصرح به', administrativeGrade: 'درجة مصرح بها',
    administrativeClassificationEffectiveDate: new Date('2020-01-01T00:00:00.000Z'), personalAddress: `عنوان خاص ${tag}`,
    confirmedAt: new Date('2007-09-01T00:00:00.000Z'), qualifications: `مؤهلات قديمة ${tag}`, institutionId: null,
    firstEducationAppointmentDecisionNumber: null, institutionAppointmentDate: null, institutionAppointmentNumber: null,
  });
  expect(accepted.firstEducationAppointmentDecisionNumber).toBe(`قرار أول ${tag}`);
  expect(accepted.institutionAppointmentDate).toEqual(new Date('2010-09-01T00:00:00.000Z'));
  expect(accepted.institutionAppointmentNumber).toBe(`قرار المؤسسة ${tag}`);
  expect(accepted.declaredHomeInstitutionEmail).toBe(`home-${tag}@example.invalid`);
  expect(await db.teacherSubmissionQualificationDeclaration.count({ where: { submissionId: submission.id } })).toBe(2);
  expect(await db.teacherSubmissionSupplementaryWorkplaceDeclaration.count({ where: { submissionId: submission.id } })).toBe(2);
  expect(await db.teacherQualification.count({ where: { teacherId } })).toBe(0);
  expect(await db.teacherSupplementaryWorkplace.count({ where: { teacherId } })).toBe(0);
  expect(await db.institution.count()).toBe(0);
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: submission.id, action: 'TEACHER_SUBMISSION_ACCEPTED' } });
  for (const privateValue of [`عنوان خاص ${tag}`, `قرار أول ${tag}`, `قرار المؤسسة ${tag}`, teacherData.qualificationOne, teacherData.extraOne, `home-${tag}@example.invalid`]) expect(JSON.stringify(audit.metadata)).not.toContain(privateValue);

  await page.getByRole('link', { name: 'فتح ملف الأستاذ' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${teacherId}$`, 'u'));
  await page.getByRole('link', { name: 'بطاقة معلومات الأستاذ' }).click();
  await page.getByLabel('السنة الدراسية').fill('2026-2027');
  await page.getByRole('button', { name: 'عرض البطاقة' }).click();
  await expect(page.getByText('وهران', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`عنوان خاص ${tag}`, { exact: true })).toBeVisible();
  await expect(page.getByText(teacherData.qualificationOne, { exact: true })).toHaveCount(0);
  await expect(page.getByText(teacherData.extraOne, { exact: true })).toHaveCount(0);
  await expect(page.getByText(teacherData.home, { exact: true })).toHaveCount(0);
  await expect(page.locator('.teacher-card')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('main')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

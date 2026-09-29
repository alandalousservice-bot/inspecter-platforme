import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');

const databaseUrl = process.env.G3_E2E_DATABASE_URL;
const districtId = process.env.G3_E2E_DISTRICT_ID;
const inspectorEmail = process.env.G3_E2E_INSPECTOR_EMAIL;
const inspectorPassword = process.env.G3_E2E_INSPECTOR_PASSWORD;
if (!databaseUrl || !districtId || !inspectorEmail || !inspectorPassword) {
  throw new Error('G3 E2E fixture was not prepared. Run npm run e2e:g3.');
}

const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const runTag = randomUUID().slice(0, 8);
const mainTeacher = { firstName: 'أمينة', lastName: `اختبار ${runTag}`, email: `teacher-${runTag}@example.invalid`, phone: '0555123456' };
const rejectTeacher = { firstName: 'ليلى', lastName: `رفض ${runTag}`, email: `reject-${runTag}@example.invalid`, phone: '0555123458' };
const reviewTeacher = { firstName: 'سلمى', lastName: `مراجعة ${runTag}`, email: `review-${runTag}@example.invalid`, phone: '0555123459' };

async function submitPublic(page: Page, teacher: typeof mainTeacher) {
  await page.goto(`/public/d/${districtId}/register`);
  await page.getByLabel('الاسم').fill(teacher.firstName);
  await page.getByLabel('اللقب').fill(teacher.lastName);
  await page.getByLabel('تاريخ الميلاد').fill('1985-03-04');
  await page.getByLabel('مكان الميلاد').fill('وهران');
  await page.getByLabel('رقم الهاتف').fill(teacher.phone);
  await page.getByLabel('البريد الإلكتروني').fill(teacher.email);
  await page.getByLabel('الصفة المهنية').selectOption('PERMANENT');
  await page.getByLabel('تاريخ التوظيف').fill('2005-09-01');
  await page.getByLabel('تاريخ الترسيم أو التثبيت').fill('2007-09-01');
  await page.getByLabel('الشهادات والمؤهلات').fill('اختبار اصطناعي');
  await page.getByLabel('اسم المؤسسة الأساسية').fill(`ابتدائية ${runTag}`);
  await page.getByRole('button', { name: 'إضافة مؤسسة أخرى' }).click();
  await page.getByLabel('اسم المؤسسة الإضافية 1').fill(`مؤسسة إضافية ${runTag}`);
  await page.getByLabel('ملاحظات إضافية').fill('ملاحظة اختبار اصطناعية');
  await page.getByRole('button', { name: 'إرسال البيانات' }).click();
  await expect(page.getByRole('heading', { name: 'تم استلام بياناتك' })).toBeVisible();
  await expect(page.getByText(/أُرسلت البيانات إلى مفتش المقاطعة للمراجعة/)).toBeVisible();
  await expect(page.getByText(/فتح ملف الأستاذ|مقبول|Teacher/i)).toHaveCount(0);
  const rows = await db.teacherSubmission.findMany({ where: { districtId } });
  const row = rows.find((item) => (item.submittedProfile as Record<string, unknown>).email === teacher.email);
  expect(row, 'browser form should persist one submission').toBeTruthy();
  expect(row?.status).toBe('PENDING');
  expect(row?.submittedProfile).toMatchObject({
    firstName: teacher.firstName, lastName: teacher.lastName, email: teacher.email,
    primaryInstitutionName: `ابتدائية ${runTag}`, additionalInstitutionNames: [`مؤسسة إضافية ${runTag}`],
  });
  return row!;
}

async function loginInspector(page: Page) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(inspectorEmail!);
  await page.getByLabel('كلمة المرور').fill(inspectorPassword!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/app\/institutions$/u);
  await page.goto('/app/submissions');
  await expect(page.getByRole('heading', { name: 'طلبات الأساتذة' })).toBeVisible();
}

async function openSubmission(page: Page, surname: string, statusLabel = 'قيد الانتظار') {
  await page.goto('/app/submissions');
  await page.getByLabel('حالة الطلب').selectOption({ label: statusLabel });
  await page.getByLabel('البحث في الطلبات').fill(surname);
  await page.getByRole('button', { name: 'تطبيق' }).click();
  await page.getByRole('link', { name: new RegExp(surname) }).click();
  await expect(page.getByRole('heading', { name: new RegExp(surname) })).toBeVisible();
}

async function confirmDecision(page: Page, actionLabel: string, confirmationTitle: string) {
  await page.getByRole('button', { name: actionLabel }).click();
  await expect(page.getByRole('dialog', { name: confirmationTitle })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد القرار' }).click();
}

test.beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS database, current_user AS role`;
  expect(identity[0]).toMatchObject({ database: 'task020_test', role: 'task020_test_user' });
});
test.afterAll(async () => { await db.$disconnect(); });

test('G3 connected browser workflow: public intake, decisions, profile edit and persistence', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await db.teacherSubmission.create({
    data: {
      districtId,
      status: 'PENDING',
      submittedProfile: {
        firstName: 'مرشح', lastName: 'مشابه', dateOfBirth: '1985-03-04', placeOfBirth: 'الجزائر',
        phone: mainTeacher.phone, email: `candidate-${runTag}@example.invalid`, professionalStatus: 'PERMANENT',
        employmentDate: '2005-09-01', primaryInstitutionName: 'ابتدائية اصطناعية',
      },
    },
  });

  const initialSubmissionCount = await db.teacherSubmission.count({ where: { districtId } });
  const initialTeacherCount = await db.teacher.count({ where: { districtId } });
  const acceptedSubmission = await submitPublic(page, mainTeacher);
  expect(await db.teacherSubmission.count({ where: { districtId } })).toBe(initialSubmissionCount + 1);
  expect(await db.teacher.count({ where: { districtId } })).toBe(initialTeacherCount);
  await loginInspector(page);
  await openSubmission(page, mainTeacher.lastName);
  await expect(page.getByText('اختبار اصطناعي', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'توجد طلبات مشابهة محتملة' })).toBeVisible();
  await expect(page.getByRole('button', { name: /دمج/ })).toHaveCount(0);
  await confirmDecision(page, 'قبول الطلب', 'تأكيد قبول الطلب');
  await expect(page.getByText('مقبول', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /قبول الطلب|رفض الطلب/ })).toHaveCount(0);
  const profileLink = page.getByRole('link', { name: 'فتح ملف الأستاذ' });
  await expect(profileLink).toBeVisible();

  const accepted = await db.teacherSubmission.findUniqueOrThrow({ where: { id: acceptedSubmission.id } });
  expect(accepted.status).toBe('ACCEPTED');
  expect(accepted.acceptedTeacherId).toBeTruthy();
  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: accepted.acceptedTeacherId! } });
  expect(teacher).toMatchObject({
    districtId, name: mainTeacher.firstName, surname: mainTeacher.lastName,
    phone: '+213555123456', email: mainTeacher.email, professionalStatus: 'PERMANENT', recordStatus: 'ACTIVE',
  });
  expect(Object.keys(teacher)).not.toContain('notes');
  expect(await db.teacher.count({ where: { districtId, id: teacher.id } })).toBe(1);
  expect(await db.institution.count()).toBe(0);
  const assignmentTable = await db.$queryRaw`SELECT to_regclass('"TeacherInstitutionAssignment"')::text AS name`;
  expect(assignmentTable[0]?.name ?? null).toBeNull();
  const originalProfile = accepted.submittedProfile;
  const originalDecision = { decidedAt: accepted.decidedAt, decidedByInspectorId: accepted.decidedByInspectorId, acceptedTeacherId: accepted.acceptedTeacherId };

  await profileLink.click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${teacher.id}$`));
  await expect(page.getByRole('heading', { name: 'ملف الأستاذ' })).toBeVisible();
  await expect(page.getByText('نشط', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'المؤسسات المصرح بها' })).toBeVisible();
  await expect(page.getByText(`ابتدائية ${runTag}`)).toBeVisible();
  await expect(page.getByRole('button', { name: /إسناد|أرشفة|تغيير الحالة/ })).toHaveCount(0);

  const beforeEdit = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  await page.getByRole('button', { name: 'تعديل الملف' }).click();
  await page.getByLabel('الاسم').fill(`اسم ${runTag}`);
  await page.getByRole('textbox', { name: 'رقم الهاتف' }).fill('0555123457');
  await page.getByLabel('الصفة المهنية', { exact: true }).selectOption('TRAINEE');
  await page.getByRole('textbox', { name: 'المؤهلات' }).fill(`مؤهل ${runTag}`);
  await page.getByRole('button', { name: 'مسح مكان الميلاد' }).click();
  const saveButton = page.getByRole('button', { name: 'حفظ التغييرات' });
  let releasePatch!: () => void;
  let markPatchStarted!: () => void;
  const patchGate = new Promise<void>((resolve) => { releasePatch = resolve; });
  const patchStarted = new Promise<void>((resolve) => { markPatchStarted = resolve; });
  const profileEndpoint = `**/api/v1/teachers/${teacher.id}`;
  await page.route(profileEndpoint, async (route) => {
    if (route.request().method() === 'PATCH') {
      markPatchStarted();
      await patchGate;
    }
    await route.continue();
  });
  try {
    const patchResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/v1/teachers/${teacher.id}`) && response.request().method() === 'PATCH');
    await saveButton.click();
    await patchStarted;
    await expect(page.getByRole('button', { name: 'جارٍ الحفظ…' })).toBeDisabled();
    releasePatch();
    expect((await patchResponse).ok()).toBe(true);
  } finally {
    releasePatch();
    await page.unroute(profileEndpoint);
  }
  await expect(page.getByRole('heading', { name: 'تم حفظ الملف بنجاح.' })).toBeVisible();
  await expect(page.getByText(`اسم ${runTag}`, { exact: true })).toBeVisible();

  const editedTeacher = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  expect(editedTeacher).toMatchObject({ name: `اسم ${runTag}`, surname: mainTeacher.lastName, phone: '+213555123457', professionalStatus: 'TRAINEE', qualifications: `مؤهل ${runTag}`, placeOfBirth: null });
  expect(editedTeacher.updatedAt.getTime()).toBeGreaterThan(beforeEdit.updatedAt.getTime());
  const audit = await db.auditLog.findMany({ where: { entityId: teacher.id, action: 'TEACHER_PROFILE_UPDATED' } });
  expect(audit).toHaveLength(1);
  expect(audit[0].metadata).toEqual({ changedFields: ['name', 'phone', 'placeOfBirth', 'professionalStatus', 'qualifications'] });
  expect(audit[0].actorInspectorId).toBeTruthy();
  expect(audit[0].districtId).toBe(districtId);
  expect(audit[0].requestId).toBeTruthy();
  expect(JSON.stringify(audit[0].metadata)).not.toContain(runTag);
  const unchangedSubmission = await db.teacherSubmission.findUniqueOrThrow({ where: { id: accepted.id } });
  expect(unchangedSubmission.submittedProfile).toEqual(originalProfile);
  expect({ decidedAt: unchangedSubmission.decidedAt, decidedByInspectorId: unchangedSubmission.decidedByInspectorId, acceptedTeacherId: unchangedSubmission.acceptedTeacherId }).toEqual(originalDecision);
  await page.reload();
  await expect(page.getByText(`اسم ${runTag}`, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const publicOnly = await browser.newPage();
  await publicOnly.goto(`/app/teachers/${teacher.id}`);
  await expect(publicOnly).toHaveURL(/\/login$/u);
  await expect(publicOnly.getByRole('heading', { name: 'دخول المفتش' })).toBeVisible();
  await publicOnly.close();

  const rejectedSubmission = await submitPublic(page, rejectTeacher);
  await openSubmission(page, rejectTeacher.lastName);
  await confirmDecision(page, 'رفض الطلب', 'تأكيد رفض الطلب');
  await expect(page.getByText('مرفوض', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'فتح ملف الأستاذ' })).toHaveCount(0);
  expect((await db.teacherSubmission.findUniqueOrThrow({ where: { id: rejectedSubmission.id } })).acceptedTeacherId).toBeNull();

  const reviewSubmission = await submitPublic(page, reviewTeacher);
  await openSubmission(page, reviewTeacher.lastName);
  await confirmDecision(page, 'إحالة إلى المراجعة الداخلية', 'تأكيد الإحالة للمراجعة الداخلية');
  await expect(page.getByText('قيد المراجعة الداخلية', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إحالة إلى المراجعة الداخلية' })).toHaveCount(0);
  expect((await db.teacherSubmission.findUniqueOrThrow({ where: { id: reviewSubmission.id } })).acceptedTeacherId).toBeNull();
  await confirmDecision(page, 'قبول الطلب', 'تأكيد قبول الطلب');
  await expect(page.getByRole('link', { name: 'فتح ملف الأستاذ' })).toBeVisible();
  const reviewed = await db.teacherSubmission.findUniqueOrThrow({ where: { id: reviewSubmission.id } });
  expect(reviewed.status).toBe('ACCEPTED');
  expect(reviewed.acceptedTeacherId).toBeTruthy();
  expect(await db.teacher.count({ where: { id: reviewed.acceptedTeacherId! } })).toBe(1);
});

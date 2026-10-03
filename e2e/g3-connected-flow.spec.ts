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
  await page.locator('#email').fill(teacher.email);
  await page.getByLabel('الصفة المهنية').selectOption('PERMANENT');
  await page.getByLabel('تاريخ التوظيف').fill('2005-09-01');
  await page.getByLabel('تاريخ الترسيم أو التثبيت').fill('2007-09-01');
  await page.getByLabel('الشهادات والمؤهلات').fill('اختبار اصطناعي');
  await page.getByLabel('اسم المؤسسة').fill(`ابتدائية ${runTag}`);
  await page.getByLabel('بلدية العمل').fill(`بلدية ${runTag}`);
  await page.getByLabel('عنوان المؤسسة').fill(`شارع اختبار ${runTag}`);
  await page.getByLabel('رقم هاتف مدير المؤسسة').fill('021234567');
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
    workplace: { institutionName: `ابتدائية ${runTag}`, municipality: `بلدية ${runTag}`, institutionAddress: `شارع اختبار ${runTag}`, directorPhone: '+21321234567' },
  });
  return row!;
}

async function loginInspector(page: Page) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(inspectorEmail!);
  await page.getByLabel('كلمة المرور').fill(inspectorPassword!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeVisible();
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
  const initialSubmissionCount = await db.teacherSubmission.count({ where: { districtId } });
  const initialTeacherCount = await db.teacher.count({ where: { districtId } });
  await loginInspector(page);
  await openSubmission(page, 'مرشح');
  await expect(page.getByRole('heading', { name: 'جهة العمل المصرح بها — غير معتمدة' })).toBeVisible();
  await expect(page.getByText('ابتدائية تجريبية')).toBeVisible();
  await expect(page.getByText('ملحقة تاريخية')).toBeVisible();
  await expect(page.getByText('غير متاحة').first()).toBeVisible();
  const acceptedSubmission = await submitPublic(page, mainTeacher);
  expect(await db.teacherSubmission.count({ where: { districtId } })).toBe(initialSubmissionCount + 1);
  expect(await db.teacher.count({ where: { districtId } })).toBe(initialTeacherCount);
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
  expect(teacher.institutionId).toBeNull();
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
  const currentInstitutionCard = page.locator('.ui-card').filter({ has: page.getByRole('heading', { name: 'المؤسسة الحالية المعتمدة' }) });
  await expect(page.getByText('نشط', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'جهة العمل المصرح بها — غير معتمدة' })).toBeVisible();
  await expect(page.getByText(`ابتدائية ${runTag}`)).toBeVisible();
  await expect(page.getByRole('button', { name: /إسناد|أرشفة|تغيير الحالة/ })).toHaveCount(0);

  const beforeEdit = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  await page.getByRole('button', { name: 'تعديل الملف' }).click();
  await page.getByLabel('الاسم').fill(`اسم ${runTag}`);
  await page.getByRole('textbox', { name: 'رقم الهاتف' }).fill('0555123457');
  await page.getByLabel('الصفة المهنية', { exact: true }).selectOption('TRAINEE');
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
  expect(editedTeacher).toMatchObject({ name: `اسم ${runTag}`, surname: mainTeacher.lastName, phone: '+213555123457', professionalStatus: 'TRAINEE', placeOfBirth: null });
  expect(editedTeacher.qualifications).toBe(beforeEdit.qualifications);
  expect(editedTeacher.updatedAt.getTime()).toBeGreaterThan(beforeEdit.updatedAt.getTime());
  const audit = await db.auditLog.findMany({ where: { entityId: teacher.id, action: 'TEACHER_PROFILE_UPDATED' } });
  expect(audit).toHaveLength(1);
  expect(audit[0].metadata).toEqual({ changedFields: ['name', 'phone', 'placeOfBirth', 'professionalStatus'] });
  expect(audit[0].actorInspectorId).toBeTruthy();
  expect(audit[0].districtId).toBe(districtId);
  expect(audit[0].requestId).toBeTruthy();
  expect(JSON.stringify(audit[0].metadata)).not.toContain(runTag);
  const unchangedSubmission = await db.teacherSubmission.findUniqueOrThrow({ where: { id: accepted.id } });
  expect(unchangedSubmission.submittedProfile).toEqual(originalProfile);
  expect({ decidedAt: unchangedSubmission.decidedAt, decidedByInspectorId: unchangedSubmission.decidedByInspectorId, acceptedTeacherId: unchangedSubmission.acceptedTeacherId }).toEqual(originalDecision);
  await page.reload();
  await expect(page.getByText(`اسم ${runTag}`, { exact: true })).toBeVisible();

  // Scenario A: explicitly review the declared workplace, then atomically create and link it.
  await expect(page.getByRole('heading', { name: 'جهة العمل المصرح بها — غير معتمدة' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'المؤسسة الحالية المعتمدة' })).toBeVisible();
  await expect(page.getByText('لم تُعتمد مؤسسة حالية')).toBeVisible();
  await page.getByRole('button', { name: 'اعتماد المؤسسة' }).click();
  const approvalDialog = page.getByRole('dialog', { name: 'اعتماد المؤسسة الحالية' });
  await page.keyboard.press('Escape');
  await expect(approvalDialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'اعتماد المؤسسة' })).toBeFocused();
  await page.getByRole('button', { name: 'اعتماد المؤسسة' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'إنشاء مؤسسة جديدة' }).click();
  await expect(page.getByLabel('اسم المؤسسة')).toHaveValue(`ابتدائية ${runTag}`);
  await expect(page.getByLabel('البلدية')).toHaveValue(`بلدية ${runTag}`);
  await expect(page.getByLabel('عنوان المؤسسة')).toHaveValue(`شارع اختبار ${runTag}`);
  await expect(page.getByLabel('هاتف المدير')).toHaveValue('+21321234567');
  await page.getByRole('button', { name: 'مراجعة القيم والتأكيد' }).click();
  await expect(page.getByText('سيُنشأ سجل مؤسسة بالقيم التالية ويرتبط بالأستاذ في عملية واحدة.')).toBeVisible();
  const createLinkResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/teachers/${teacher.id}/current-institution`) && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'تأكيد الاعتماد' }).click();
  expect((await createLinkResponse).ok()).toBe(true);
  await expect(currentInstitutionCard.getByText(`ابتدائية ${runTag}`, { exact: true })).toBeVisible();
  await expect(page.getByText('تم تحديث المؤسسة الحالية بنجاح.')).toBeVisible();
  expect(await db.institution.count()).toBe(1);
  const institutionA = await db.institution.findFirstOrThrow({ where: { districtId } });
  expect(institutionA).toMatchObject({ name: `ابتدائية ${runTag}`, municipality: `بلدية ${runTag}`, address: `شارع اختبار ${runTag}`, directorPhone: '+21321234567' });
  expect((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).institutionId).toBe(institutionA.id);
  await page.reload();
  await expect(currentInstitutionCard.getByText(`ابتدائية ${runTag}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'جهة العمل المصرح بها — غير معتمدة' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'المؤسسة الحالية المعتمدة' })).toBeVisible();

  // TASK-048: connected weekly schedule workflow for a currently assigned Teacher.
  await page.getByRole('link', { name: 'التوزيع الأسبوعي' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${teacher.id}/schedules$`));
  await page.getByLabel('السنة الدراسية').fill('2026-2027');
  await page.getByRole('button', { name: 'عرض التوزيع' }).click();
  await expect(page.getByRole('heading', { name: 'لا يوجد توزيع لهذه السنة' })).toBeVisible();
  await page.getByRole('button', { name: 'إنشاء توزيع فارغ' }).click();
  await expect(page.getByRole('heading', { name: 'إضافة حصة' })).toBeVisible();
  async function addScheduleSlot(start: string, end: string) {
    const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const today = `${dateParts.find((part) => part.type === 'year')!.value}-${dateParts.find((part) => part.type === 'month')!.value}-${dateParts.find((part) => part.type === 'day')!.value}`;
    await page.getByLabel('بداية السريان').fill(today);
    await page.getByLabel('مكان العمل').selectOption(institutionA.id);
    await page.getByLabel('اليوم').selectOption('1');
    await page.getByLabel('وقت البداية').fill(start);
    await page.getByLabel('وقت النهاية').fill(end);
    const mutation = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/slots')
      && new URL(response.url()).pathname.startsWith('/api/v1/schedules/') && response.request().method() === 'POST');
    const addButton = page.locator('.weekly-schedule__form button[type="submit"]');
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeEnabled();
    await addButton.click();
    expect((await mutation).status()).toBe(201);
    await expect(page.getByText(/تمت إضافة الحصة/)).toBeVisible();
  }
  const weeklyScheduleId = (await db.weeklySchedule.findUniqueOrThrow({ where: { teacherId_academicYear: { teacherId: teacher.id, academicYear: '2026-2027' } } })).id;
  await addScheduleSlot('08:00', '09:00');
  await addScheduleSlot('09:00', '10:00');
  let weeklySchedule = await db.weeklySchedule.findUniqueOrThrow({ where: { teacherId_academicYear: { teacherId: teacher.id, academicYear: '2026-2027' } }, include: { slots: true } });
  expect(weeklySchedule.revision).toBe(3);
  expect(weeklySchedule.slots).toHaveLength(2);
  await page.reload();
  await page.getByLabel('السنة الدراسية').fill('2026-2027');
  await page.getByRole('button', { name: 'عرض التوزيع' }).click();
  await expect(page.getByText('08:00 – 09:00')).toBeVisible();
  await expect(page.getByText('09:00 – 10:00')).toBeVisible();
  await page.getByRole('button', { name: 'تعديل' }).first().click();
  await page.getByLabel('وقت البداية').fill('08:15');
  await page.getByLabel('وقت النهاية').fill('08:45');
  await page.getByRole('button', { name: 'حفظ الحصة' }).click();
  await expect(page.getByText(/تم تحديث الحصة/)).toBeVisible();
  weeklySchedule = await db.weeklySchedule.findUniqueOrThrow({ where: { id: weeklySchedule.id }, include: { slots: true } });
  expect(weeklySchedule.revision).toBe(4);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'حذف' }).last().click();
  await expect(page.getByText(/تم حذف الحصة/)).toBeVisible();
  await page.reload();
  await page.getByLabel('السنة الدراسية').fill('2026-2027');
  await page.getByRole('button', { name: 'عرض التوزيع' }).click();
  await expect(page.getByText('08:15 – 08:45')).toBeVisible();
  await expect(page.getByText('09:00 – 10:00')).toHaveCount(0);
  weeklySchedule = await db.weeklySchedule.findUniqueOrThrow({ where: { id: weeklySchedule.id }, include: { slots: true } });
  expect(weeklySchedule.revision).toBe(5);
  expect(weeklySchedule.slots).toHaveLength(1);
  await page.getByRole('link', { name: 'ملف الأستاذ', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${teacher.id}$`));

  // Create B in the isolated test fixture; Scenario C changes the current link without mutating either Institution.
  const institutionB = await db.institution.create({ data: { districtId, name: `ابتدائية ثانية ${runTag}`, municipality: `بلدية ثانية ${runTag}` } });
  await page.getByRole('button', { name: 'تغيير المؤسسة الحالية' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'اختيار مؤسسة موجودة' }).click();
  await page.getByLabel('البحث عن مؤسسة').fill(`ابتدائية ثانية ${runTag}`);
  await page.getByRole('button', { name: 'بحث' }).click();
  await page.getByRole('button', { name: new RegExp(`ابتدائية ثانية ${runTag}`) }).click();
  await expect(page.getByText('سيُربط ملف الأستاذ بالمؤسسة المختارة. بيانات المؤسسة القائمة لن تتغير.')).toBeVisible();
  const linkExistingResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/teachers/${teacher.id}/current-institution`) && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'تأكيد الاعتماد' }).click();
  const linkResponse = await linkExistingResponse;
  expect(linkResponse.ok()).toBe(true);
  expect(await linkResponse.request().postDataJSON()).toEqual({ institutionId: institutionB.id, expectedInstitutionId: institutionA.id });
  await expect(currentInstitutionCard.getByText(`ابتدائية ثانية ${runTag}`, { exact: true })).toBeVisible();
  expect((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).institutionId).toBe(institutionB.id);
  expect(await db.institution.findUniqueOrThrow({ where: { id: institutionA.id } })).toMatchObject({ name: `ابتدائية ${runTag}`, municipality: `بلدية ${runTag}` });
  expect(await db.institution.findUniqueOrThrow({ where: { id: institutionB.id } })).toMatchObject({ name: `ابتدائية ثانية ${runTag}`, municipality: `بلدية ثانية ${runTag}` });
  await page.reload();
  await expect(currentInstitutionCard.getByText(`ابتدائية ثانية ${runTag}`, { exact: true })).toBeVisible();
  await expect(page.getByText(/نقل الأستاذ|تحويل الأستاذ|سجل الانتقالات/)).toHaveCount(0);

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

  // Scenario B: select an existing authoritative Institution for an unassigned Teacher.
  await page.getByRole('link', { name: 'فتح ملف الأستاذ' }).click();
  await expect(page.getByText('لم تُعتمد مؤسسة حالية')).toBeVisible();
  await page.getByRole('link', { name: 'التوزيع الأسبوعي' }).click();
  await page.getByLabel('السنة الدراسية').fill('2026-2027');
  await page.getByRole('button', { name: 'عرض التوزيع' }).click();
  await expect(page.getByRole('heading', { name: 'لا يوجد توزيع لهذه السنة' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إنشاء توزيع فارغ' })).toBeEnabled();
  await page.getByRole('link', { name: 'ملف الأستاذ', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${reviewed.acceptedTeacherId}$`));
  await page.getByRole('button', { name: 'اعتماد المؤسسة' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'اختيار مؤسسة موجودة' }).click();
  await page.getByLabel('البحث عن مؤسسة').fill(`ابتدائية ثانية ${runTag}`);
  await page.getByRole('button', { name: 'بحث' }).click();
  await page.getByRole('button', { name: new RegExp(`ابتدائية ثانية ${runTag}`) }).click();
  const beforeExistingSelection = await db.institution.findUniqueOrThrow({ where: { id: institutionB.id } });
  await page.getByRole('button', { name: 'تأكيد الاعتماد' }).click();
  await expect(currentInstitutionCard.getByText(`ابتدائية ثانية ${runTag}`, { exact: true })).toBeVisible();
  const reviewedTeacher = await db.teacher.findUniqueOrThrow({ where: { id: reviewed.acceptedTeacherId! } });
  expect(reviewedTeacher.institutionId).toBe(institutionB.id);
  expect(await db.institution.findUniqueOrThrow({ where: { id: institutionB.id } })).toEqual(beforeExistingSelection);
});

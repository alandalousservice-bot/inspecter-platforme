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
if (!databaseUrl || !email || !password || !teacherId || !academicYear) throw new Error('TASK-086 isolated browser fixture is missing.');
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

test('TASK-086 connected authorized print flow, privacy, native action and rendered A4 cases', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.addInitScript(() => {
    (window as typeof window & { __task086PrintCalls?: number }).__task086PrintCalls = 0;
    window.print = () => { (window as typeof window & { __task086PrintCalls?: number }).__task086PrintCalls! += 1; };
  });
  await login(page);
  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: teacherId! } });
  await page.goto(`/app/teachers/${teacherId}`);
  await page.getByRole('link', { name: 'بطاقة معلومات الأستاذ' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${teacherId}/information-card$`, 'u'));
  await page.getByLabel('السنة الدراسية').fill(academicYear!);
  await page.getByRole('button', { name: 'عرض البطاقة' }).click();
  await expect(page.getByText(`${teacher.name} ${teacher.surname}`, { exact: true })).toBeVisible();
  await expect(page.getByText('ملاحظة إدارية اصطناعية', { exact: true })).toBeVisible();

  const printHref = `/app/teachers/${teacherId}/information-card/print?academicYear=${academicYear}`;
  await expect(page.getByRole('link', { name: 'طباعة بطاقة المعلومات' })).toHaveAttribute('href', printHref);
  const beforeUpdatedAt = (await db.teacher.findUniqueOrThrow({ where: { id: teacherId! }, select: { updatedAt: true } })).updatedAt;
  const beforeAuditCount = await db.auditLog.count();
  await page.getByRole('link', { name: 'طباعة بطاقة المعلومات' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${teacherId}/information-card/print\\?academicYear=${academicYear}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'بطاقة معلومات الأستاذ' })).toBeVisible();
  await expect(page.getByText('شهادة منظمة', { exact: true })).toBeVisible();
  await expect(page.getByText('مؤهل قديم غير مفصل', { exact: true })).toBeVisible();
  await expect(page.getByText('15.5 / 20', { exact: true })).toBeVisible();
  await expect(page.getByText('صورة شمسية', { exact: true })).toBeVisible();
  await expect(page.getByText('التوقيع', { exact: true })).toHaveCount(1);
  await expect(page.getByText('ملاحظة إدارية اصطناعية', { exact: true })).toHaveCount(0);
  await expect(page.getByText('يرفق التوزيع الأسبوعي منفصلًا عند توفره.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __task086PrintCalls?: number }).__task086PrintCalls)).toBe(0);
  await page.getByRole('button', { name: 'طباعة' }).click();
  expect(await page.evaluate(() => (window as typeof window & { __task086PrintCalls?: number }).__task086PrintCalls)).toBe(1);
  expect((await db.teacher.findUniqueOrThrow({ where: { id: teacherId! }, select: { updatedAt: true } })).updatedAt).toEqual(beforeUpdatedAt);
  expect(await db.auditLog.count()).toBe(beforeAuditCount);

  const printApi = `**/api/v1/teachers/${teacherId}/information-card?academicYear=${academicYear}`;
  let visualCase: 'minimal' | 'normal' | 'stress' = 'normal';
  await page.route(printApi, async (route) => {
    const response = await route.fetch();
    const payload = await response.json() as { data: { card: Record<string, any> } };
    const c = payload.data.card;
    if (visualCase === 'minimal') {
      for (const key of Object.keys(c.teacher)) if (!['id', 'name', 'surname', 'recordStatus', 'archivedAt'].includes(key)) c.teacher[key] = null;
      c.homeInstitution = null; c.currentSupplementaryWorkplaces = []; c.qualifications = { items: [], legacyText: null };
      c.weeklySchedule = null; c.inspectionSummary = { lastInspectionDate: null, pedagogicalMark: null }; c.organizationalContext.inspector = null;
    }
    if (visualCase === 'stress') {
      const longArabic = 'عنوان عربي طويل للاختبار '.repeat(28);
      c.teacher.personalAddress = longArabic; c.teacher.professionalFramework = 'إطار مهني طويل '.repeat(18);
      c.teacher.administrativeNote = 'ملاحظة داخلية يجب ألا تطبع '.repeat(50);
      c.teacher.firstEducationAppointmentDecisionNumber = 'مرجع إداري mixed-123456789 '.repeat(12);
      c.teacher.email = `${'long-address-'.repeat(12)}teacher@example.invalid`;
      c.homeInstitution.name = `مؤسسة تعليمية طويلة ${'ابتدائية '.repeat(12)}`;
      c.homeInstitution.municipality = `بلدية ${'الاختبار '.repeat(18)}`;
      c.currentSupplementaryWorkplaces = Array.from({ length: 4 }, (_, index) => ({
        id: `fixture-work-${index}`, institution: { id: `fixture-inst-${index}`, name: `مؤسسة إضافية ${index + 1} ${'نص طويل '.repeat(10)}`, municipality: `بلدية ${'ممتدة '.repeat(10)}`, archivedAt: null },
        validFrom: '2026-09-01', validTo: null,
      }));
      c.qualifications.items = Array.from({ length: 6 }, (_, index) => ({ id: `fixture-qualification-${index}`, name: `شهادة ${index + 1} ${'مؤهل تربوي '.repeat(9)}`, issuingBody: `جهة مانحة ${'مؤسسة '.repeat(9)}`, qualificationDate: '2020-01-01' }));
      c.qualifications.legacyText = `نص مؤهلات سابق طويل ${'نص عربي ممتد للاختبار '.repeat(60)}`;
      c.organizationalContext.inspector = { name: `مفتش ${'اسم طويل '.repeat(15)}`, surname: 'Test-Inspector' };
    }
    await route.fulfill({ response, json: payload });
  });

  for (const visual of ['minimal', 'normal', 'stress'] as const) {
    visualCase = visual;
    await page.goto(printHref);
    await expect(page.getByRole('heading', { name: 'بطاقة معلومات الأستاذ' })).toBeVisible();
    await expect(page.getByText('ملاحظة داخلية يجب ألا تطبع', { exact: false })).toHaveCount(0);
    const pdfPath = resolve(process.cwd(), 'test-results', `task086-${visual}.pdf`);
    const pageRule = await page.evaluate(() => [...document.styleSheets]
      .flatMap((sheet) => {
        try { return [...sheet.cssRules]; } catch { return []; }
      })
      .map((rule) => rule.cssText)
      .find((text) => text.startsWith('@page')) ?? '');
    expect(pageRule.toLowerCase()).toContain('size: a4');
    expect(pageRule).toContain('margin: 12mm');
    const pdf = await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(1000);
    const pdfText = pdf.toString('latin1');
    const boxes = [...pdfText.matchAll(/\/MediaBox\s*\[0\s+0\s+([\d.]+)\s+([\d.]+)\]/gu)];
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(Number(box[1]) * 25.4 / 72).toBeCloseTo(210, 0);
      expect(Number(box[2]) * 25.4 / 72).toBeCloseTo(297, 0);
    }
    const pageCount = (pdfText.match(/\/Type\s*\/Page\b/gu) ?? []).length;
    const expectedPageCount = { minimal: 1, normal: 2, stress: 3 }[visual];
    expect(pageCount).toBe(expectedPageCount);
    console.log(`TASK086_PRINT_QA case=${visual} pageCount=${pageCount} pdfBytes=${pdf.byteLength}`);
  }
});

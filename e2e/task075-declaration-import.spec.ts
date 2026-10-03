import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const url = process.env.G3_E2E_DATABASE_URL;
const districtId = process.env.TASK075_E2E_DISTRICT_ID;
if (!url || !districtId) throw new Error('Isolated TASK-075 fixture is required.');
const db = new PrismaClient({ datasources: { db: { url } } });
const declaration = { firstName: 'أمينة', lastName: `TASK075 ${process.env.TASK075_E2E_TAG}`, dateOfBirth: '1985-03-04', placeOfBirth: 'وهران', phone: '0555123456', email: 'task075@example.invalid', professionalStatus: 'SUBSTITUTE', employmentDate: '2005-09-01', institutionName: 'ابتدائية النور School-ABC', municipality: 'وهران', institutionAddress: 'شارع النور', directorPhone: '021234567' };
const buffer = Buffer.from(JSON.stringify({ packageVersion: '1.0', type: 'INSPECTOR_TEACHER_RECORD', exportedAt: '2026-10-03T00:00:00Z', teacherData: declaration }));
const models = ['teacher', 'institution', 'teacherSupplementaryWorkplace', 'weeklyScheduleSlot', 'pedagogicalVisit', 'inspectionReport', 'followUp', 'auditLog'] as const;
const counts = async () => Object.fromEntries(await Promise.all(models.map(async (model) => [model, await db[model].count()])));
test.afterAll(async () => { await db.$disconnect(); });

test('local preview → explicit public POST → PENDING → inspector review and atomic acceptance', async ({ page }) => {
  const before = await counts(); const beforeSubmissions = await db.teacherSubmission.count();
  let posts = 0;
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().includes('/public/')) posts++; });
  await page.goto(`/public/d/${districtId}/register`);
  await page.getByLabel(/اختيار ملف تصريح/).setInputFiles({ name: 'declaration.json', mimeType: 'application/json', buffer });
  await expect(page.getByRole('heading', { name: 'معاينة البيانات المصرح بها' })).toBeFocused(); expect(posts).toBe(0);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('nav[aria-label="التنقل الرئيسي"]')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`preview-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'تطبيق البيانات على الاستمارة' }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#firstName')).toBeFocused(); expect(posts).toBe(0);
  const storage = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), url: location.href }));
  expect(JSON.stringify(storage)).not.toContain(declaration.email);
  await page.getByRole('button', { name: 'إرسال البيانات' }).click();
  await expect(page.getByRole('heading', { name: 'تم استلام بياناتك' })).toBeVisible();
  expect(posts).toBe(1); expect(await counts()).toEqual(before);
  expect(await db.teacherSubmission.count()).toBe(beforeSubmissions + 1);
  const submission = await db.teacherSubmission.findFirstOrThrow({ where: { districtId, submittedProfile: { path: ['email'], equals: declaration.email } } });
  expect(submission.status).toBe('PENDING'); expect(submission.acceptedTeacherId).toBeNull();
  await page.goto('/login'); await page.getByLabel('البريد الإلكتروني').fill(process.env.G3_E2E_INSPECTOR_EMAIL!);
  await page.getByLabel('كلمة المرور').fill(process.env.G3_E2E_INSPECTOR_PASSWORD!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click(); await expect(page).toHaveURL(/\/app$/u);
  const detail = await page.request.get(`/api/v1/submissions/${submission.id}`); expect(detail.status()).toBe(200);
  const detailBody = await detail.json(); expect(detailBody.data.potentialDuplicates).toEqual([]);
  const cookies = await page.context().cookies(); const csrf = cookies.find((cookie) => cookie.name === 'inspector_csrf')?.value; expect(csrf).toBeTruthy();
  const accepted = await page.request.post(`/api/v1/submissions/${submission.id}/decision`, { headers: { 'x-csrf-token': decodeURIComponent(csrf!) }, data: { action: 'ACCEPT', expectedStatus: 'PENDING' } });
  expect(accepted.status()).toBe(200);
  const persisted = await db.teacherSubmission.findUniqueOrThrow({ where: { id: submission.id } });
  expect(persisted.status).toBe('ACCEPTED'); expect(persisted.acceptedTeacherId).not.toBeNull();
  expect(await db.teacher.count()).toBe(before.teacher + 1); expect(await db.auditLog.count()).toBe(before.auditLog + 1);
});

test('real Chrome 200% zoom, RTL/Bidi preview, keyboard and visible focus', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'task075-zoom-'));
  const context = await chromium.launchPersistentContext(profile, { headless: false, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', viewport: null, deviceScaleFactor: undefined, args: ['--window-size=1440,1100'] });
  try {
    const page = context.pages()[0]; const settings = await context.newPage();
    await settings.goto('chrome://settings/appearance'); const zoom = settings.locator('select').nth(1);
    await zoom.selectOption({ label: '100%' }); await page.goto(`http://127.0.0.1:5173/public/d/${districtId}/register`);
    const before = await page.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth }));
    await zoom.selectOption({ label: '200%' }); await page.reload();
    const after = await page.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth }));
    expect(after.dpr / before.dpr).toBeCloseTo(2, 1); expect(before.width / after.width).toBeCloseTo(2, 1);
    await page.getByLabel(/اختيار ملف تصريح/).setInputFiles({ name: 'declaration.json', mimeType: 'application/json', buffer });
    await expect(page.getByRole('heading', { name: 'معاينة البيانات المصرح بها' })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'تطبيق البيانات على الاستمارة' }).focus();
    const focus = await page.evaluate(() => { const style = getComputedStyle(document.activeElement!); return { width: parseFloat(style.outlineWidth), style: style.outlineStyle }; });
    expect(focus.width).toBeGreaterThanOrEqual(2); expect(focus.style).not.toBe('none');
    await page.keyboard.press('Enter'); await expect(page.locator('#firstName')).toBeFocused();
    await expect(page.getByLabel('خط العرض')).toBeVisible(); await expect(page.getByLabel('خط الطول')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('actual-200-percent.png'), fullPage: true });
  } finally { await context.close(); rmSync(profile, { recursive: true, force: true }); }
});

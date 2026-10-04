import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { rmSync } from 'node:fs';
import { chromium, expect, test, type Page } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const databaseUrl = process.env.G3_E2E_DATABASE_URL;
const email = process.env.TASK077D_E2E_EMAIL;
const password = process.env.TASK077D_E2E_PASSWORD;
const submissionId = process.env.TASK077D_E2E_SUBMISSION_ID;
const institutionId = process.env.TASK077D_E2E_INSTITUTION_ID;
const zeroSubmissionId = process.env.TASK077F_ZERO_SUBMISSION_ID;
const zeroInstitutionId = process.env.TASK077F_ZERO_INSTITUTION_ID;
const staleSubmissionId = process.env.TASK077F_STALE_SUBMISSION_ID;
const staleInstitutionId = process.env.TASK077F_STALE_INSTITUTION_ID;
const noProposalSubmissionId = process.env.TASK077F_NO_PROPOSAL_SUBMISSION_ID;
const districtId = process.env.TASK077F_DISTRICT_ID;
const publicEmail = process.env.TASK077F_PUBLIC_EMAIL;
if (!databaseUrl || !email || !password || !submissionId || !institutionId || !zeroSubmissionId || !zeroInstitutionId
  || !staleSubmissionId || !staleInstitutionId || !noProposalSubmissionId || !districtId || !publicEmail) throw new Error('Isolated TASK-077F fixture is required.');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email!);
  await page.getByLabel('كلمة المرور').fill(password!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/app$/u);
}

test.beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  expect(identity[0]).toMatchObject({ database: 'task020_test', role: 'task020_test_user', address: '127.0.0.1/32', port: 55432 });
});
test.afterAll(async () => { await db.$disconnect(); });

test('real Chrome 200% zoom keeps the pending Inspector review RTL and within the viewport', async () => {
  const profile = join(tmpdir(), `task077d-zoom-${process.pid}-${Date.now()}`);
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    executablePath: `C:\\Program Files\\${String.fromCharCode(71, 111, 111, 103, 108, 101)}\\Chrome\\Application\\chrome.exe`,
    viewport: null, deviceScaleFactor: undefined, args: ['--window-size=1440,1100'],
  });
  try {
    const page = context.pages()[0];
    const settings = await context.newPage();
    await settings.goto('chrome://settings/appearance');
    const zoom = settings.locator('select').nth(1);
    await zoom.selectOption({ label: '100%' });
    await page.goto(`http://127.0.0.1:5173/login`);
    await page.getByLabel('البريد الإلكتروني').fill(email!);
    await page.getByLabel('كلمة المرور').fill(password!);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page).toHaveURL(/\/app$/u);
    await page.goto(`/app/submissions/${submissionId}`);
    await expect(page.getByRole('heading', { name: 'مراجعة موقع المؤسسة المقترح' })).toBeVisible();
    const before = await page.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth }));
    await zoom.selectOption({ label: '200%' });
    await page.reload();
    const after = await page.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth }));
    expect(after.dpr / before.dpr).toBeCloseTo(2, 1);
    expect(before.width / after.width).toBeCloseTo(2, 1);
    await expect(page.locator('.submission-detail-page')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByText('35.654321', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'اعتماد الموقع المقترح' }).focus();
    const focus = await page.evaluate(() => ({ outline: parseFloat(getComputedStyle(document.activeElement!).outlineWidth), style: getComputedStyle(document.activeElement!).outlineStyle }));
    expect(focus.outline).toBeGreaterThanOrEqual(2);
    expect(focus.style).not.toBe('none');
    await page.screenshot({ path: test.info().outputPath('inspector-review-200-percent.png'), fullPage: true });
    await page.goto('http://127.0.0.1:5173/app/institutions');
    await expect(page.getByRole('heading', { name: 'المؤسسات', exact: true })).toBeVisible();
    await expect(page.locator('.institutions-page')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole('textbox', { name: 'البحث عن مؤسسة' }).focus();
    const institutionFocus = await page.evaluate(() => ({ outline: parseFloat(getComputedStyle(document.activeElement!).outlineWidth), style: getComputedStyle(document.activeElement!).outlineStyle }));
    expect(institutionFocus.outline).toBeGreaterThanOrEqual(2);
    expect(institutionFocus.style).not.toBe('none');
    await page.screenshot({ path: test.info().outputPath('institutions-200-percent.png'), fullPage: true });
    await zoom.selectOption({ label: '100%' });
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
});

test('G8-06 Institution directory visual states stay usable across desktop, tablet, and mobile', async ({ page }) => {
  const institution = await db.institution.findUniqueOrThrow({ where: { id: institutionId! } });
  const widths = [1440, 1280, 768, 390] as const;
  const capture = async (state: string) => {
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${state} overflow at ${width}px`).toBe(true);
      if (width <= 768 && state === 'populated') {
        await expect(page.getByText('يمكن تمرير الجدول أفقيًا لعرض بقية الأعمدة.')).toBeVisible();
        const tableRegion = await page.locator('.institutions-card .ui-table-wrap').evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
        expect(tableRegion.scrollWidth).toBeGreaterThan(tableRegion.clientWidth);
      }
      await page.screenshot({ path: `test-results/g8-06-institutions-${state}-${width}.png`, fullPage: true });
    }
  };

  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('heading', { name: 'لوحة المتابعة', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/g8-06-dashboard-continuity.png', fullPage: true });
  await page.goto('/app/institutions');
  await expect(page.getByRole('heading', { name: 'المؤسسات', exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(institution.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u') })).toBeVisible();
  await expect(page.getByText('وهران').first()).toBeVisible();
  await expect(page.getByText('الموقع المعتمد للمؤسسة').first()).toBeVisible();
  await expect(page.getByText('35.123456, -0.123456')).toBeVisible();
  await expect(page.getByText('35.654321')).toHaveCount(0);
  await capture('populated');

  const search = page.getByRole('textbox', { name: 'البحث عن مؤسسة' });
  await search.fill(institution.name);
  await page.getByRole('button', { name: 'بحث' }).click();
  await expect(page.getByText('إجمالي المؤسسات: 1')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(institution.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u') })).toBeVisible();
  await capture('filtered');

  await search.fill('لا توجد مؤسسة بهذا الاسم');
  await page.getByRole('button', { name: 'بحث' }).click();
  await expect(page.getByRole('heading', { name: 'لا توجد نتائج مطابقة' })).toBeVisible();
  await capture('empty');

  await page.unrouteAll();
  await page.route('**/api/v1/institutions**', (route) => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'private transport details' } }),
  }));
  await page.goto('/app/institutions');
  await expect(page.getByRole('heading', { name: 'تعذر تحميل المؤسسات' })).toBeVisible();
  await expect(page.getByText('private transport details')).toHaveCount(0);
  await capture('error');
});

test('Inspector reviews and accepts proposed Institution coordinates with explicit confirmation and authoritative refresh', async ({ page }) => {
  const consoleOutput: string[] = [];
  const requestUrls: string[] = [];
  page.on('console', (message) => consoleOutput.push(message.text()));
  page.on('request', (request) => requestUrls.push(request.url()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const auditBeforeRead = await db.auditLog.count({ where: { entityId: { in: [submissionId!, institutionId!] } } });
  await page.goto(`/app/submissions/${submissionId}`);
  await expect(page.getByRole('heading', { name: 'مراجعة موقع المؤسسة المقترح' })).toBeVisible();
  await expect(page.getByText('قيد مراجعة المفتش')).toBeVisible();
  await expect(page.getByText('35.654321', { exact: true })).toBeVisible();
  await expect(page.getByText('-0.654321', { exact: true })).toBeVisible();
  await expect(page.getByText('35.123456', { exact: true })).toBeVisible();
  await expect(page.getByText('-0.123456', { exact: true })).toBeVisible();
  await expect(page.getByText(/مدخل يدويًا من طرف المفتش/u)).toBeVisible();
  const initialDirections = page.getByRole('link', { name: 'الاتجاه إلى المؤسسة' });
  await expect(initialDirections).toBeVisible();
  const initialUrl = new URL(await initialDirections.getAttribute('href')!);
  expect([...initialUrl.searchParams.entries()]).toEqual([['api', '1'], ['destination', '35.123456,-0.123456']]);
  await expect(initialDirections).toHaveAttribute('target', '_blank');
  await expect(initialDirections).toHaveAttribute('rel', 'noopener noreferrer');
  expect(requestUrls.some((url) => url.includes('google.com'))).toBe(false);
  expect(await page.locator('iframe').count()).toBe(0);
  expect(await db.auditLog.count({ where: { entityId: { in: [submissionId!, institutionId!] } } })).toBe(auditBeforeRead);

  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(page.locator('.submission-detail-page')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'اعتماد الموقع المقترح' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'تأكيد استبدال موقع المؤسسة' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/سيتم استبدال الإحداثيات المعتمدة/u)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'إلغاء' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'تأكيد اعتماد الموقع المقترح' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'اعتماد الموقع المقترح' })).toBeFocused();
  let current = await db.institution.findUniqueOrThrow({ where: { id: institutionId! } });
  expect(current.latitude?.toFixed(6)).toBe('35.123456');

  await page.getByRole('button', { name: 'اعتماد الموقع المقترح' }).click();
  await expect(page.getByRole('dialog', { name: 'تأكيد استبدال موقع المؤسسة' })).toBeVisible();
  await page.getByRole('button', { name: 'تأكيد اعتماد الموقع المقترح' }).click();
  await expect(page.getByText('تم اعتماد الموقع المقترح')).toBeVisible();
  await expect(page.getByRole('button', { name: 'اعتماد الموقع المقترح' })).toHaveCount(0);
  const refreshedDirections = page.getByRole('link', { name: 'الاتجاه إلى المؤسسة' });
  const refreshedUrl = new URL(await refreshedDirections.getAttribute('href')!);
  expect([...refreshedUrl.searchParams.entries()]).toEqual([['api', '1'], ['destination', '35.654321,-0.654321']]);
  expect(refreshedUrl.searchParams.get('destination')).not.toContain('35.123456');
  expect(refreshedUrl.searchParams.get('destination')).not.toContain('-0.123456');
  await refreshedDirections.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  expect(await refreshedDirections.evaluate((element) => element === document.activeElement)).toBe(true);
  const directionsFocus = await page.evaluate(() => ({ outline: parseFloat(getComputedStyle(document.activeElement!).outlineWidth), style: getComputedStyle(document.activeElement!).outlineStyle }));
  expect(directionsFocus.outline).toBeGreaterThanOrEqual(2);
  expect(directionsFocus.style).not.toBe('none');
  expect(requestUrls.some((url) => url.includes('google.com'))).toBe(false);
  current = await db.institution.findUniqueOrThrow({ where: { id: institutionId! } });
  expect(current.latitude?.toFixed(6)).toBe('35.654321');
  expect(current.longitude?.toFixed(6)).toBe('-0.654321');
  expect(current.locationSource).toBe('TEACHER_PROPOSED_APPROVED');
  const proposal = await db.teacherSubmission.findUniqueOrThrow({ where: { id: submissionId! } });
  expect(proposal.locationProposalStatus).toBe('ACCEPTED');
  expect(proposal.locationProposalInstitutionId).toBe(institutionId);
  const locationAudits = await db.auditLog.findMany({ where: {
    entityId: { in: [submissionId!, institutionId!] },
    action: { in: ['INSTITUTION_LOCATION_PROPOSAL_ACCEPTED', 'INSTITUTION_UPDATED'] },
  } });
  expect(locationAudits.map((event) => event.action).sort()).toEqual(['INSTITUTION_LOCATION_PROPOSAL_ACCEPTED', 'INSTITUTION_UPDATED']);
  expect(locationAudits.every((event) => !JSON.stringify(event.metadata).match(/35\.654321|-0\.654321|35\.123456|-0\.123456/u))).toBe(true);
  const browserState = await page.evaluate(async () => ({
    url: location.href,
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
    databases: JSON.stringify(await indexedDB.databases()),
  }));
  const privateValues = ['35.654321', '-0.654321', '35.123456', '-0.123456'];
  for (const value of privateValues) {
    expect(consoleOutput.join('\n')).not.toContain(value);
    expect(requestUrls.join('\n')).not.toContain(value);
    expect(JSON.stringify(browserState)).not.toContain(value);
  }
  expect(browserState.url).not.toContain('35.654321');
  expect(browserState.url).not.toContain('-0.654321');
});

test('first 0,0 proposal is pending until explicit acceptance and then becomes the canonical directions destination', async ({ page }) => {
  const requestUrls: string[] = [];
  page.on('request', (request) => requestUrls.push(request.url()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto(`/app/submissions/${zeroSubmissionId}`);
  await expect(page.getByRole('heading', { name: 'مراجعة موقع المؤسسة المقترح' })).toBeVisible();
  await expect(page.getByText('0.000000', { exact: true })).toHaveCount(2);
  await expect(page.getByText('لا يوجد موقع معتمد للمؤسسة حاليًا.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'الاتجاه إلى المؤسسة' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'الاحتفاظ بالموقع الحالي' })).toHaveCount(0);
  expect((await db.institution.findUniqueOrThrow({ where: { id: zeroInstitutionId! } })).latitude).toBeNull();
  expect(requestUrls.some((url) => url.includes('google.com'))).toBe(false);

  await page.getByRole('button', { name: 'اعتماد الموقع المقترح' }).click();
  await expect(page.getByText('تم اعتماد الموقع المقترح')).toBeVisible();
  const directions = page.getByRole('link', { name: 'الاتجاه إلى المؤسسة' });
  await expect(directions).toBeVisible();
  expect([...new URL(await directions.getAttribute('href')!).searchParams.entries()]).toEqual([
    ['api', '1'], ['destination', '0.000000,0.000000'],
  ]);
  expect(requestUrls.some((url) => url.includes('google.com'))).toBe(false);
  const canonical = await db.institution.findUniqueOrThrow({ where: { id: zeroInstitutionId! } });
  expect(canonical.latitude?.toFixed(6)).toBe('0.000000');
  expect(canonical.longitude?.toFixed(6)).toBe('0.000000');
  expect(canonical.locationSource).toBe('TEACHER_PROPOSED_APPROVED');
  expect((await db.teacherSubmission.findUniqueOrThrow({ where: { id: zeroSubmissionId! } })).locationProposalStatus).toBe('ACCEPTED');
  expect(requestUrls.some((url) => url.includes('google.com'))).toBe(false);
  let interceptedDirectionsUrl = '';
  await page.context().route('https://www.google.com/**', async (route) => {
    interceptedDirectionsUrl = route.request().url();
    await route.abort();
  });
  const popupPromise = page.waitForEvent('popup');
  await directions.click();
  const popup = await popupPromise;
  await expect.poll(() => interceptedDirectionsUrl).toContain('https://www.google.com/maps/dir/');
  const external = new URL(interceptedDirectionsUrl);
  expect(external.protocol).toBe('https:');
  expect(external.host).toBe('www.google.com');
  expect([...external.searchParams.entries()]).toEqual([['api', '1'], ['destination', '0.000000,0.000000']]);
  expect(external.searchParams.has('origin')).toBe(false);
  await popup.close();
});

test('review without a proposal offers no location actions or directions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto(`/app/submissions/${noProposalSubmissionId}`);
  await expect(page.getByText('لم يقدّم الأستاذ إحداثيات لموقع المؤسسة.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'اعتماد الموقع المقترح' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'رفض المقترح' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'الاحتفاظ بالموقع الحالي' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'الاتجاه إلى المؤسسة' })).toHaveCount(0);
});

test('connected public HOME proposal stays pending through submission review and explicit Institution resolution before location acceptance', async ({ page }) => {
  const consoleOutput: string[] = [];
  const internalUrls: string[] = [];
  page.on('console', (message) => consoleOutput.push(message.text()));
  page.on('request', (request) => internalUrls.push(request.url()));
  const tag = Date.now().toString();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/public/d/${districtId}/register`);
  await page.locator('#firstName').fill('أمينة');
  await page.locator('#lastName').fill(`TASK077F ${tag}`);
  await page.locator('#dateOfBirth').fill('1985-03-04');
  await page.locator('#placeOfBirth').fill('وهران');
  await page.locator('#phone').fill('0555123456');
  await page.locator('#email').fill(publicEmail!);
  await page.locator('#professionalStatus').selectOption('SUBSTITUTE');
  await page.locator('#employmentDate').fill('2005-09-01');
  await page.locator('#institutionName').fill(`ابتدائية TASK077F ${tag}`);
  await page.locator('#municipality').fill('وهران');
  await page.locator('#institutionAddress').fill('عنوان مصرح به');
  await page.locator('#directorPhone').fill('021234567');
  await page.locator('#institutionLatitude').fill('34.123456');
  await page.locator('#institutionLongitude').fill('-1.234567');
  await page.getByRole('button', { name: 'إضافة مؤسسة مصرح بها' }).click();
  await page.locator('#supplementary-0-institutionName').fill(`مؤسسة إضافية ${tag}`);
  await expect(page.getByLabel('خط العرض')).toHaveCount(1);
  await expect(page.getByLabel('خط الطول')).toHaveCount(1);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByLabel('خط العرض')).toBeVisible();
    await expect(page.getByLabel('خط الطول')).toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  const receiptResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/public/districts/'));
  await page.getByRole('button', { name: 'إرسال البيانات' }).click();
  const receiptResponse = await receiptResponsePromise;
  expect(receiptResponse.status()).toBe(202);
  const receiptBody = await receiptResponse.json();
  expect(Object.keys(receiptBody.data)).toEqual(['receiptId']);
  expect(JSON.stringify(receiptBody)).not.toContain('34.123456');
  expect(JSON.stringify(receiptBody)).not.toContain('-1.234567');
  await expect(page.getByRole('heading', { name: 'تم استلام بياناتك' })).toBeVisible();
  const submission = await db.teacherSubmission.findUniqueOrThrow({ where: { id: receiptBody.data.receiptId } });
  expect(submission.locationProposalStatus).toBe('PENDING');
  expect(submission.proposedInstitutionLatitude?.toFixed(6)).toBe('34.123456');
  expect(submission.proposedInstitutionLongitude?.toFixed(6)).toBe('-1.234567');
  const declaredAdditional = await db.teacherSubmissionSupplementaryWorkplaceDeclaration.count({ where: { submissionId: submission.id } });
  expect(declaredAdditional).toBe(1);
  const institutionsBeforeReview = await db.institution.count();
  expect(await db.institution.count({ where: { name: `ابتدائية TASK077F ${tag}` } })).toBe(0);

  await login(page);
  await page.goto(`/app/submissions/${submission.id}`);
  await expect(page.getByText('قيد مراجعة المفتش')).toBeVisible();
  await expect(page.getByText('لم تُربط مؤسسة معتمدة بهذا الطلب بعد.')).toBeVisible();
  await expect(page.getByText('34.123456', { exact: true })).toBeVisible();
  await expect(page.getByText('لا يوجد موقع معتمد للمؤسسة حاليًا.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'الاتجاه إلى المؤسسة' })).toHaveCount(0);
  const cookies = await page.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === 'inspector_csrf')?.value;
  expect(csrf).toBeTruthy();
  const submissionDecision = await page.request.post(`/api/v1/submissions/${submission.id}/decision`, {
    headers: { 'x-csrf-token': decodeURIComponent(csrf!) }, data: { action: 'ACCEPT', expectedStatus: 'PENDING' },
  });
  expect(submissionDecision.status()).toBe(200);
  const accepted = await db.teacherSubmission.findUniqueOrThrow({ where: { id: submission.id } });
  expect(accepted.status).toBe('ACCEPTED');
  expect(accepted.locationProposalStatus).toBe('PENDING');
  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: accepted.acceptedTeacherId } });
  expect(teacher.institutionId).toBeNull();
  expect(await db.institution.count()).toBe(institutionsBeforeReview);

  const link = await page.request.put(`/api/v1/teachers/${teacher.id}/current-institution`, {
    headers: { 'x-csrf-token': decodeURIComponent(csrf!) },
    data: { expectedInstitutionId: null, createInstitution: { name: `مؤسسة محلولة ${tag}`, municipality: 'وهران' } },
  });
  expect(link.status()).toBe(200);
  const linked = await link.json();
  const targetInstitutionId = linked.data.currentInstitution.id as string;
  expect((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).institutionId).toBe(targetInstitutionId);
  expect(await db.teacherSupplementaryWorkplace.count({ where: { teacherId: teacher.id } })).toBe(0);
  expect((await db.institution.findUniqueOrThrow({ where: { id: targetInstitutionId } })).latitude).toBeNull();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'مراجعة موقع المؤسسة المقترح' })).toBeVisible();
  await expect(page.getByText('لا يوجد موقع معتمد للمؤسسة حاليًا.')).toBeVisible();
  await page.getByRole('button', { name: 'اعتماد الموقع المقترح' }).click();
  await expect(page.getByText('تم اعتماد الموقع المقترح')).toBeVisible();
  const directions = page.getByRole('link', { name: 'الاتجاه إلى المؤسسة' });
  const destination = new URL(await directions.getAttribute('href')!).searchParams.get('destination');
  expect(destination).toBe('34.123456,-1.234567');
  const finalInstitution = await db.institution.findUniqueOrThrow({ where: { id: targetInstitutionId } });
  expect(finalInstitution.latitude?.toFixed(6)).toBe('34.123456');
  expect(finalInstitution.longitude?.toFixed(6)).toBe('-1.234567');
  expect(finalInstitution.locationSource).toBe('TEACHER_PROPOSED_APPROVED');
  const finalSubmission = await db.teacherSubmission.findUniqueOrThrow({ where: { id: submission.id } });
  expect(finalSubmission.locationProposalStatus).toBe('ACCEPTED');
  expect(finalSubmission.locationProposalInstitutionId).toBe(targetInstitutionId);
  expect(consoleOutput.join('\n')).not.toContain('34.123456');
  expect(consoleOutput.join('\n')).not.toContain('-1.234567');
  expect(internalUrls.join('\n')).not.toContain('34.123456');
  expect(internalUrls.join('\n')).not.toContain('-1.234567');
  expect(internalUrls.some((url) => url.includes('google.com'))).toBe(false);
  expect(await page.locator('iframe').count()).toBe(0);
});

test('TASK-075 JSON import with non-empty coordinates is rejected before prefill or network submission', async ({ page }) => {
  const imported = {
    packageVersion: '1.0', type: 'INSPECTOR_TEACHER_RECORD', exportedAt: '2026-10-04T00:00:00Z',
    teacherData: {
      firstName: 'أمينة', lastName: 'تصريح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران', phone: '0555123456',
      email: 'import-coordinate@example.invalid', professionalStatus: 'SUBSTITUTE', employmentDate: '2005-09-01',
      institutionName: 'ابتدائية مصرح بها', municipality: 'وهران', institutionAddress: 'عنوان', directorPhone: '021234567',
      latitude: '36', longitude: '3',
    },
  };
  let publicPosts = 0;
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().includes('/public/districts/')) publicPosts++; });
  await page.goto(`/public/d/${districtId}/register`);
  await page.getByLabel(/اختيار ملف تصريح/).setInputFiles({
    name: 'declaration-with-coordinates.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.getByText('إحداثيات الموقع غير مدعومة في استيراد التصريح الحالي.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'معاينة البيانات المصرح بها' })).toHaveCount(0);
  await expect(page.locator('#firstName')).toHaveValue('');
  await expect(page.locator('#institutionLatitude')).toHaveValue('');
  expect(publicPosts).toBe(0);
});

test('stale canonical conflict refetches safely once and never retries the decision automatically', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto(`/app/submissions/${staleSubmissionId}`);
  await expect(page.getByText('11.000000', { exact: true })).toBeVisible();
  await expect(page.getByText('33.000000', { exact: true })).toBeVisible();
  await db.institution.update({ where: { id: staleInstitutionId! }, data: {
    latitude: '12', longitude: '23', locationSource: 'MANUAL_INSPECTOR',
  } });
  const decisions: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/location-proposal-decision')) decisions.push(request.url());
  });
  await page.getByRole('button', { name: 'اعتماد الموقع المقترح' }).click();
  await page.getByRole('button', { name: 'تأكيد اعتماد الموقع المقترح' }).click();
  await expect(page.getByText('تم تحديث بيانات الموقع منذ فتح هذه الصفحة. راجع البيانات الحالية قبل اتخاذ القرار.')).toBeVisible();
  await expect(page.getByText('12.000000', { exact: true })).toBeVisible();
  const directions = page.getByRole('link', { name: 'الاتجاه إلى المؤسسة' });
  expect([...new URL(await directions.getAttribute('href')!).searchParams.entries()]).toEqual([
    ['api', '1'], ['destination', '12.000000,23.000000'],
  ]);
  expect(decisions).toHaveLength(1);
  expect((await db.teacherSubmission.findUniqueOrThrow({ where: { id: staleSubmissionId! } })).locationProposalStatus).toBe('PENDING');
  const current = await db.institution.findUniqueOrThrow({ where: { id: staleInstitutionId! } });
  expect(current.latitude?.toFixed(6)).toBe('12.000000');
  expect(current.longitude?.toFixed(6)).toBe('23.000000');
  expect(current.locationSource).toBe('MANUAL_INSPECTOR');
});

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
if (!databaseUrl || !email || !password || !submissionId || !institutionId) throw new Error('Isolated TASK-077D fixture is required.');
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
    await zoom.selectOption({ label: '100%' });
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
});

test('Inspector reviews and accepts proposed Institution coordinates with explicit confirmation and authoritative refresh', async ({ page }) => {
  const consoleOutput: string[] = [];
  const requestUrls: string[] = [];
  page.on('console', (message) => consoleOutput.push(message.text()));
  page.on('request', (request) => requestUrls.push(request.url()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
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

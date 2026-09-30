import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const databaseUrl = process.env.G3_E2E_DATABASE_URL;
const inspectorEmail = process.env.G3_E2E_INSPECTOR_EMAIL;
const inspectorPassword = process.env.G3_E2E_INSPECTOR_PASSWORD;
if (!databaseUrl || !inspectorEmail || !inspectorPassword) throw new Error('TASK-045 E2E fixture missing.');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(inspectorEmail!);
  await page.getByLabel('كلمة المرور').fill(inspectorPassword!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/app\/institutions$/u);
}

test.beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw`SELECT current_database() AS database, current_user AS role`;
  expect(identity[0]).toMatchObject({ database: 'task020_test', role: 'task020_test_user' });
});
test.afterAll(async () => { await db.$disconnect(); });

test('TASK-045 connected Arabic directory filters, cursor pages, profile and schedule routes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requestUrls: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/api/v1/')) requestUrls.push(request.url()); });
  const primary = await db.teacher.findFirst({ where: { surname: { startsWith: 'دليل ' } }, include: { institution: true } });
  expect(primary).toBeTruthy();
  await login(page);
  await page.goto('/app/teachers');
  await expect(page.getByRole('heading', { name: 'دليل الأساتذة' })).toBeVisible();
  await expect(page.getByText('إجمالي النتائج: 32')).toBeVisible();
  await expect(page.getByRole('cell', { name: `${primary!.name} ${primary!.surname}` })).toBeVisible();
  await expect(page.getByText(primary!.email!, { exact: true })).toHaveCount(0);
  await expect(page.getByText(primary!.phone!, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: /غير نشط/ })).toHaveCount(0);
  await page.getByLabel('حالة السجل').selectOption('INACTIVE');
  await expect(page.getByRole('cell', { name: new RegExp(`سجل`) })).toBeVisible();
  await page.getByLabel('حالة السجل').selectOption('ACTIVE');
  await expect(page.getByText('إجمالي النتائج: 32')).toBeVisible();

  const search = page.getByRole('textbox', { name: 'البحث عن أستاذ' });
  await search.fill(primary!.surname);
  await expect(page.getByRole('cell', { name: `${primary!.name} ${primary!.surname}` })).toBeVisible();
  await search.fill('');
  await expect(page.getByText('إجمالي النتائج: 32')).toBeVisible();

  await page.getByLabel('الصفة المهنية').selectOption('PERMANENT');
  await expect(page.getByRole('cell').filter({ hasText: 'متربص' })).toHaveCount(0);
  await page.getByLabel('الصفة المهنية').selectOption('');
  await page.getByLabel('المؤسسة الحالية المعتمدة').selectOption('false');
  await expect(page.getByRole('cell', { name: 'لم تُعتمد مؤسسة حالية' }).first()).toBeVisible();
  await page.getByLabel('المؤسسة الحالية المعتمدة').selectOption('');

  await page.getByLabel('البحث عن مؤسسة حالية معتمدة').fill(primary!.institution!.name);
  await page.getByRole('combobox', { name: 'نتائج المؤسسات' }).selectOption(primary!.institution!.id);
  await expect(page.getByRole('cell', { name: `${primary!.name} ${primary!.surname}` })).toBeVisible();
  const districtFilter = page.getByLabel('المقاطعة');
  if (await districtFilter.count()) await districtFilter.selectOption({ index: 0 });

  await page.getByLabel('السنة الدراسية').fill('2026-2027');
  await page.getByLabel('يوم العمل').selectOption('2');
  await page.getByLabel('وقت الحصة').fill('08:30');
  await expect(page.getByRole('cell', { name: `${primary!.name} ${primary!.surname}` })).toBeVisible();
  await expect(page.locator('.teacher-directory')).toHaveAttribute('dir', 'rtl');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('table', { name: 'دليل الأساتذة' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: 'مسح المرشحات' }).first().click();
  await expect(page.getByText('إجمالي النتائج: 32')).toBeVisible();
  await page.getByRole('button', { name: 'النتائج التالية' }).click();
  await expect(page.getByText('النتائج 26–32 من 32')).toBeVisible();
  await page.getByRole('button', { name: 'السابق' }).click();
  await expect(page.getByText('النتائج 1–25 من 32')).toBeVisible();

  expect(requestUrls.some((url) => /\/api\/v1\/teachers\/[0-9a-f-]+(?:\?|$)/u.test(url))).toBe(false);
  await page.getByRole('link', { name: `${primary!.name} ${primary!.surname}` }).click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${primary!.id}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'ملف الأستاذ' })).toBeVisible();
  await page.goto('/app/teachers');
  await page.getByRole('link', { name: 'التوزيع الأسبوعي' }).first().click();
  await expect(page).toHaveURL(/\/app\/teachers\/[0-9a-f-]+\/schedules$/u);
  await expect(page.getByRole('heading', { name: 'التوزيع الأسبوعي' })).toBeVisible();
});

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
  await expect(page).toHaveURL(/\/app$/u);
  await expect(page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeVisible();
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
  await page.screenshot({ path: 'test-results/g8-05-dashboard-continuity.png', fullPage: true });
  await page.goto('/app/teachers');
  await expect(page.getByRole('heading', { name: 'دليل الأساتذة' })).toBeVisible();
  await expect(page.getByText('إجمالي النتائج: 32')).toBeVisible();
  await expect(page.getByRole('link', { name: `${primary!.name} ${primary!.surname}`, exact: true })).toBeVisible();
  await expect(page.getByText(primary!.email!, { exact: true })).toHaveCount(0);
  await expect(page.getByText(primary!.phone!, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: /غير نشط/ })).toHaveCount(0);
  await page.getByLabel('حالة السجل').selectOption('INACTIVE');
  await expect(page.getByRole('link', { name: /^غير نشط سجل /u })).toBeVisible();
  await page.getByLabel('حالة السجل').selectOption('ACTIVE');
  await expect(page.getByText('إجمالي النتائج: 32')).toBeVisible();

  const search = page.getByRole('textbox', { name: 'البحث عن أستاذ' });
  await search.fill(primary!.surname);
  await expect(page.getByRole('link', { name: `${primary!.name} ${primary!.surname}`, exact: true })).toBeVisible();
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
  await expect(page.getByRole('link', { name: `${primary!.name} ${primary!.surname}`, exact: true })).toBeVisible();
  const districtFilter = page.getByLabel('المقاطعة');
  if (await districtFilter.count()) await districtFilter.selectOption({ index: 0 });

  await page.getByRole('button', { name: 'مرشحات التوزيع الأسبوعي' }).click();
  await page.getByLabel('السنة الدراسية').fill('2026-2027');
  await page.getByLabel('يوم العمل').selectOption('2');
  await page.getByLabel('وقت الحصة').fill('08:30');
  await expect(page.getByRole('link', { name: `${primary!.name} ${primary!.surname}`, exact: true })).toBeVisible();
  await expect(page.locator('.teacher-directory')).toHaveAttribute('dir', 'rtl');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('list', { name: 'دليل الأساتذة' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'دليل الأساتذة' })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: 'مسح المرشحات' }).first().click();
  await expect(page.getByText('إجمالي النتائج: 32')).toBeVisible();
  await page.getByRole('button', { name: 'النتائج التالية' }).click();
  await expect(page.getByText('النتائج 26–32 من 32')).toBeVisible();
  await page.getByRole('button', { name: 'السابق' }).click();
  await expect(page.getByText('النتائج 1–25 من 32')).toBeVisible();

  expect(requestUrls.some((url) => /\/api\/v1\/teachers\/[0-9a-f-]+(?:\?|$)/u.test(url))).toBe(false);
  await page.getByRole('link', { name: `${primary!.name} ${primary!.surname}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/teachers/${primary!.id}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'ملف الأستاذ', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: `${primary!.name} ${primary!.surname}`, level: 2 })).toBeVisible();
  await page.goto('/app/teachers');
  await page.getByRole('link', { name: /^التوزيع الأسبوعي —/u }).first().click();
  await expect(page).toHaveURL(/\/app\/teachers\/[0-9a-f-]+\/schedules$/u);
  await expect(page.getByRole('heading', { name: 'التوزيع الأسبوعي' })).toBeVisible();
});

test('G8-05 directory and profile states remain composed at desktop, tablet, and mobile widths', async ({ page }) => {
  const primary = await db.teacher.findFirstOrThrow({ where: { surname: { startsWith: 'دليل ' } }, include: { institution: true } });
  const optional = await db.teacher.findFirstOrThrow({ where: { surname: { startsWith: 'لقب ' }, districtId: primary.districtId, professionalStatus: 'TRAINEE' } });
  const widths = [1440, 1280, 768, 390] as const;
  const capture = async (name: string) => {
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name} page overflow at ${width}px`).toBe(true);
      await page.screenshot({ path: `test-results/g8-05-${name}-${width}.png`, fullPage: true });
    }
  };

  await login(page);
  await page.goto('/app/teachers');
  await expect(page.getByRole('link', { name: `${primary.name} ${primary.surname}`, exact: true })).toBeVisible();
  await capture('directory-populated');

  const search = page.getByRole('textbox', { name: 'البحث عن أستاذ' });
  await search.fill(primary.surname);
  await expect(page.getByRole('link', { name: `${primary.name} ${primary.surname}`, exact: true })).toBeVisible();
  await expect(page.getByText('إجمالي النتائج: 1')).toBeVisible();
  await capture('directory-filtered');

  await search.fill('لا توجد مطابقة لهذا البحث');
  await expect(page.getByRole('heading', { name: 'لا توجد نتائج مطابقة' })).toBeVisible();
  await capture('directory-empty');

  await page.unrouteAll();
  await page.route('**/api/v1/teachers*', (route) => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'تعذر تحميل البيانات.' } }),
  }));
  await page.goto('/app/teachers');
  await expect(page.getByRole('heading', { name: 'تعذر تحميل دليل الأساتذة' })).toBeVisible();
  await capture('directory-error');
  await page.unrouteAll();

  await page.goto(`/app/teachers/${primary.id}`);
  await expect(page.getByRole('heading', { name: `${primary.name} ${primary.surname}` })).toBeVisible();
  await expect(page.getByText('شهادة مهنية اصطناعية')).toBeVisible();
  await expect(page.getByRole('heading', { name: /الحالية \(1\)/u })).toBeVisible();
  await capture('profile-dense');

  await page.goto(`/app/teachers/${optional.id}`);
  await expect(page.getByRole('heading', { name: `${optional.name} ${optional.surname}` })).toBeVisible();
  await expect(page.getByText('غير متوفر').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'مؤسسات تكملة النصاب' })).toBeVisible();
  await capture('profile-optional');
});

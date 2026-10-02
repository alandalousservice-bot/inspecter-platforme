import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const apiRequire = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client') as typeof import('@prisma/client');
const url = process.env.G3_E2E_DATABASE_URL;
const email = process.env.G3_E2E_INSPECTOR_EMAIL;
const password = process.env.G3_E2E_INSPECTOR_PASSWORD;
if (!url || !email || !password) throw new Error('TASK-052A connected fixture missing.');
const db = new PrismaClient({ datasources: { db: { url } } });

test.afterAll(async () => { await db.$disconnect(); });

test('existing Inspector completes and edits professional identity without losing session', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email!);
  await page.getByLabel('كلمة المرور').fill(password!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/app\/institutions$/u);
  await page.getByRole('link', { name: 'هويتي المهنية' }).click();
  await expect(page.getByText('لم تكتمل الهوية المهنية بعد.')).toBeVisible();
  await page.getByLabel('الاسم').fill('أمينة');
  await page.getByLabel('اللقب').fill('بن سالم');
  await page.getByRole('button', { name: 'حفظ الهوية المهنية' }).click();
  await expect(page.getByText('حُفظت الهوية المهنية.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('الاسم')).toHaveValue('أمينة');
  await page.getByLabel('الاسم').fill('ليلى');
  await page.getByRole('button', { name: 'حفظ الهوية المهنية' }).click();
  await expect(page.getByText('حُفظت الهوية المهنية.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('الاسم')).toHaveValue('ليلى');
  await page.getByRole('link', { name: 'المؤسسات' }).click();
  await expect(page).toHaveURL(/\/app\/institutions$/u);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('button', { name: 'فتح قائمة التنقل' }).click();
  await expect(page.getByRole('link', { name: 'هويتي المهنية' })).toBeVisible();
  await page.getByRole('link', { name: 'هويتي المهنية' }).click();
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(mobileOverflow).toBe(false);
  // A 400×400 CSS viewport models the available space at 200% browser zoom
  // from the preceding 800×800 viewport and activates the responsive shell.
  await page.setViewportSize({ width: 400, height: 400 });
  await expect(page.getByLabel('الاسم')).toBeVisible();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(horizontalOverflow).toBe(false);
  const inspector = await db.inspector.findUniqueOrThrow({ where: { email: email! } });
  expect(inspector.name).toBe('ليلى');
  expect(inspector.surname).toBe('بن سالم');
  const events = await db.auditLog.findMany({ where: { actorInspectorId: inspector.id, action: 'INSPECTOR_PROFESSIONAL_IDENTITY_UPDATED' } });
  expect(events).toHaveLength(2);
  expect(events.map((event) => event.metadata)).toEqual([{ changedFields: ['name', 'surname'] }, { changedFields: ['name'] }]);
});

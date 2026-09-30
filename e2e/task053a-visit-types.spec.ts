import { expect, test, type Page } from '@playwright/test';

const inspectorEmail = process.env.G3_E2E_INSPECTOR_EMAIL;
const inspectorPassword = process.env.G3_E2E_INSPECTOR_PASSWORD;
const teacherName = 'محمد زيارة داخل الجدول';
if (!inspectorEmail || !inspectorPassword) throw new Error('TASK-053A E2E fixture missing.');

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(inspectorEmail!);
  await page.getByLabel('كلمة المرور').fill(inspectorPassword!);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/app\/institutions$/u);
}

test('TASK-053A creates an explicitly typed visit, filters it server-side, and completes it', async ({ page }) => {
  await login(page);
  await page.goto('/app/visits/new');
  await page.getByLabel('البحث عن أستاذ').fill(teacherName);
  await page.getByRole('button', { name: new RegExp(teacherName, 'u') }).click();
  await page.getByLabel(/السنة الدراسية/u).fill('2026-2027');
  await page.getByLabel('نوع الزيارة').selectOption('PROMOTION_EVALUATION');
  await page.getByLabel(/بداية الزيارة/u).fill('2026-10-13T08:30');
  await page.getByLabel(/نهاية الزيارة/u).fill('2026-10-13T09:00');
  await page.getByRole('button', { name: 'إنشاء الزيارة' }).click();
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]+$/u);
  const visitId = new URL(page.url()).pathname.split('/').at(-1)!;
  await expect(page.getByText('زيارة الترقية / التقييم')).toBeVisible();

  await page.goto('/app/visits');
  await page.getByLabel('نوع الزيارة').selectOption('PROMOTION_EVALUATION');
  await expect(page).toHaveURL(/visitType=PROMOTION_EVALUATION/u);
  const matchingVisit = page.locator(`a[href^="/app/visits/${visitId}"]`).first();
  await expect(matchingVisit).toBeVisible();
  await matchingVisit.click();
  await expect(page).toHaveURL(new RegExp(`/app/visits/${visitId}(?:\\?.*)?$`, 'u'));
  await page.getByRole('button', { name: 'إكمال الزيارة' }).click();
  await page.getByLabel(/وقت الإنجاز الفعلي/u).fill('2026-09-30T09:05');
  await page.getByRole('button', { name: 'تأكيد إكمال الزيارة' }).click();
  await expect(page.getByText('مكتملة')).toBeVisible();
  await expect(page.getByText('زيارة الترقية / التقييم')).toBeVisible();
});

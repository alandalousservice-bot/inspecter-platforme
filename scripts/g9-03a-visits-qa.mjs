// Real Chrome, real app, synthetic intercepted read models. No business mutations or database.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const require = createRequire(resolve('packages/web/package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const output = await mkdtemp(join(tmpdir(), 'g9-03a-visits-'));
const profile = await mkdtemp(join(tmpdir(), 'g9-03a-chrome-'));
const server = await createServer({ root: resolve('packages/web'), server: { host: '127.0.0.1', port: 5192, strictPort: true } });
const district = { id: '11111111-1111-4111-8111-111111111111', name: 'مقاطعة اختبار اصطناعية' };
const types = ['GUIDANCE', 'TENURE_CONFIRMATION', 'PROMOTION_EVALUATION', 'MONITORING_FOLLOW_UP', 'EXCEPTIONAL'];
const rows = Array.from({ length: 25 }, (_, i) => ({
  id: `55555555-5555-4555-8555-${String(i + 1).padStart(12, '0')}`, districtId: district.id,
  teacher: { id: `44444444-4444-4444-8444-${String(i + 1).padStart(12, '0')}`, name: i === 0 ? 'أستاذ ذو اسم عربي طويل جدًا لاختبار وضوح الهوية' : `أستاذ تجريبي ${i + 1}`, surname: 'بن عبد الرحمن' },
  institution: { id: district.id, name: i === 0 ? 'ابتدائية محفوظة تاريخيًا باسم عربي طويل لاختبار الالتفاف وليست المؤسسة الحالية للأستاذ' : 'مؤسسة الزيارة التاريخية' },
  academicYear: '2026-2027', visitType: types[i % 5],
  intervalKind: i % 5 === 4 ? 'ACTUAL_RETROSPECTIVE' : 'SCHEDULED',
  scheduledStartAt: i % 5 === 4 ? null : '2026-10-15T08:30:00Z', scheduledEndAt: i % 5 === 4 ? null : '2026-10-15T09:30:00Z',
  actualStartAt: i % 5 === 4 ? '2025-01-15T08:30:00Z' : null, actualEndAt: i % 5 === 4 ? '2025-01-15T09:30:00Z' : null,
  status: i % 5 === 4 ? 'COMPLETED' : ['PLANNED', 'COMPLETED', 'CANCELLED'][i % 3],
  occurredAt: null, visitTypeEditable: false, revision: 1, createdAt: '', updatedAt: '',
}));
let context, mode = 'dense', releaseLoading;
const queries = [], unexpected = [], errors = [], reportRequests = [];
try {
  await server.listen();
  context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1440,1100'] });
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()), method = route.request().method();
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (method !== 'GET') { unexpected.push(`${method} ${url.pathname}`); return route.abort(); }
    if (url.pathname === '/api/v1/auth/me') return respond({ data: { id: district.id, email: 'visual-qa@example.invalid' } });
    if (url.pathname === '/api/v1/me/districts') return respond({ items: [district] });
    if (['/api/v1/teachers', '/api/v1/institutions'].includes(url.pathname)) return respond({ data: [], page: { limit: 10, total: 0, nextCursor: null } });
    if (url.pathname === '/api/v1/visits') {
      queries.push(Object.fromEntries(url.searchParams));
      if (mode === 'loading') await new Promise((resolve) => { releaseLoading = resolve; });
      if (mode === 'error') return respond({ error: { code: 'INTERNAL_ERROR', message: 'خطأ عام', requestId: 'synthetic' } }, 500);
      return respond({ data: mode === 'empty' ? [] : rows, page: { limit: 25, total: mode === 'empty' ? 0 : 205, nextCursor: mode === 'empty' || url.searchParams.has('cursor') ? null : rows.at(-1).id } });
    }
    if (url.pathname.match(/^\/api\/v1\/visits\/[^/]+$/u)) return respond({ data: { visit: rows.find((row) => url.pathname.endsWith(row.id)) } });
    if (url.pathname.endsWith('/report')) { reportRequests.push(url.pathname); return respond({ data: { report: null } }); }
    if (url.pathname === '/api/v1/report-templates/inspector-visit/v1') return respond({ data: { reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1, criteria: [] } });
    unexpected.push(`${method} ${url.pathname}`); return route.abort();
  });
  const page = context.pages()[0]; page.on('pageerror', (error) => errors.push(error.message));
  const settings = await context.newPage(); await settings.goto('chrome://settings/appearance');
  const zoom = settings.locator('select').nth(1); await zoom.selectOption({ label: '100%' });
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1100 }); await page.goto('http://127.0.0.1:5192/app/visits');
    await page.locator('.visit-workspace__identity').first().waitFor();
    assert.equal(await page.locator('.visit-workspace__identity').count(), 25);
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await page.getByRole('table', { name: 'قائمة الزيارات التربوية' }).count(), width > 1024 ? 1 : 0);
    assert.equal(await page.getByRole('list', { name: 'قائمة الزيارات التربوية' }).count(), width <= 1024 ? 1 : 0);
    assert.equal(await page.locator('.visit-workspace__identity').first().getAttribute('href'), `/app/teachers/${rows[0].teacher.id}`);
    assert.equal(await page.getByRole('link', { name: /تفاصيل الزيارة —/ }).first().getAttribute('href'), `/app/visits/${rows[0].id}`);
    assert.equal(await page.getByRole('link', { name: 'زيارة جديدة' }).getAttribute('href'), '/app/visits/new');
    const geometry = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, rtl: getComputedStyle(document.querySelector('.visit-workspace')).direction }));
    assert.equal(geometry.overflow, false); assert.equal(geometry.rtl, 'rtl');
    await page.screenshot({ path: join(output, `${width}.png`) });
    await page.locator('.visit-workspace__identity').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `${width}-records.png`) });
    const disclosure = page.getByRole('button', { name: 'فترة الزيارة' }); await disclosure.focus(); await disclosure.press('Enter');
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'true'); assert.notEqual(await disclosure.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
    await disclosure.press('Space'); assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
    console.log(`RESPONSIVE_${width}: PASS`);
  }
  assert.equal(reportRequests.length, 0);
  await Promise.all([page.waitForResponse((response) => response.url().includes('/api/v1/visits?') && response.url().includes('visitType=EXCEPTIONAL')), page.getByLabel('نوع الزيارة', { exact: true }).selectOption('EXCEPTIONAL')]);
  await page.waitForURL('**visitType=EXCEPTIONAL'); await page.locator('.visit-workspace__identity').first().waitFor();
  assert.equal(queries.at(-1).visitType, 'EXCEPTIONAL');
  await Promise.all([page.waitForResponse((response) => response.url().includes('/api/v1/visits?') && response.url().includes('cursor=')), page.getByRole('button', { name: 'النتائج التالية', exact: true }).click()]);
  await page.waitForFunction(() => document.querySelector('.visit-pagination')?.textContent.includes('صفحة 2'));
  assert.equal(queries.at(-1).cursor, rows.at(-1).id);
  await page.getByRole('navigation', { name: 'صفحات الزيارات' }).getByRole('button', { name: 'السابق', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.visit-pagination')?.textContent.includes('صفحة 1'));
  mode = 'empty'; await page.goto('http://127.0.0.1:5192/app/visits?status=PLANNED'); await page.getByText('لا توجد زيارات مطابقة', { exact: true }).waitFor();
  await page.screenshot({ path: join(output, 'filtered-empty.png') });
  await page.goto('http://127.0.0.1:5192/app/visits'); await page.getByText('لا توجد زيارات بعد', { exact: true }).waitFor();
  mode = 'error'; await page.reload(); await page.getByRole('heading', { name: 'تعذر تحميل الزيارات' }).waitFor();
  assert.equal(await page.getByText('إجمالي النتائج: غير متاح').count(), 1); await page.screenshot({ path: join(output, 'error.png') });
  mode = 'dense'; await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click(); await page.locator('.visit-workspace__identity').first().waitFor();
  mode = 'loading'; await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByText('جارٍ تحميل الزيارات…').waitFor(); await page.screenshot({ path: join(output, 'loading.png') });
  mode = 'dense'; releaseLoading(); await page.locator('.visit-workspace__identity').first().waitFor();
  for (const index of [0, 2]) {
    await page.goto(`http://127.0.0.1:5192/app/visits/${rows[index].id}`);
    const link = page.getByRole('link', { name: 'صفحة تقرير الزيارة' }); await link.waitFor();
    assert.equal(await link.getAttribute('href'), `/app/visits/${rows[index].id}/report`);
    if (index === 2) await page.getByText('قراءة التقرير الموجود فقط؛ لا يمكن إنشاء تقرير للزيارة الملغاة.').waitFor();
    await link.click(); await page.waitForURL('**/report');
    if (index === 2) {
      await page.getByText(/لا يمكن إنشاء تقرير/).first().waitFor();
      assert.equal(await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).count(), 0);
    } else await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).waitFor();
  }
  const zoomPage = await context.newPage(); await zoomPage.goto('http://127.0.0.1:5192/app/visits'); await zoomPage.locator('.visit-workspace__identity').first().waitFor();
  const before = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth })); await zoom.selectOption({ label: '200%' });
  await zoomPage.waitForFunction((dpr) => devicePixelRatio > dpr * 1.9, before.dpr);
  const after = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  assert.equal(after.overflow, false); assert(after.width < before.width * .6); assert.equal(await zoomPage.getByRole('table').count(), 0);
  await zoomPage.bringToFront();
  await zoomPage.waitForFunction(() => matchMedia('(max-width: 64rem)').matches);
  const cdp = await context.newCDPSession(zoomPage);
  await zoomPage.locator('.visit-workspace__identity').first().scrollIntoViewIfNeeded();
  const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
  await writeFile(join(output, 'zoom-200.png'), Buffer.from(capture.data, 'base64')); await cdp.detach();
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert(queries.every((query) => query.limit === '25'));
  console.log(`ZOOM_200: PASS ${before.dpr}->${after.dpr}; ${before.width}->${after.width}`);
  console.log('STATES_FILTERS_PAGINATION_LINKS_REPORT_ELIGIBILITY: PASS'); console.log(`VISUAL_EVIDENCE: ${output}`);
} finally { releaseLoading?.(); await context?.close(); await server.close(); }

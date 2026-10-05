// Controlled browser evidence for the real directory consumer. All API requests
// are intercepted with synthetic bounded pages; no DB or persistent UAT writes.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const require = createRequire(resolve('packages/web/package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const output = await mkdtemp(join(tmpdir(), 'g9-02a-directory-'));
const profile = await mkdtemp(join(tmpdir(), 'g9-02a-chrome-'));
const server = await createServer({ root: resolve('packages/web'), server: { host: '127.0.0.1', port: 5190, strictPort: true } });
const district = { id: '11111111-1111-4111-8111-111111111111', name: 'مقاطعة الاختبار' };
const statuses = ['PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT', 'SUBSTITUTE'];
const rows = Array.from({ length: 25 }, (_, i) => ({
  id: `44444444-4444-4444-8444-${String(i + 1).padStart(12, '0')}`, districtId: district.id,
  name: i === 0 ? 'أستاذ باسم عربي طويل جدًا لاختبار وضوح الهوية دون قطع' : `أستاذ تجريبي ${i + 1}`,
  surname: 'بن عبد الرحمن', professionalStatus: statuses[i % 5], recordStatus: i === 3 ? 'INACTIVE' : 'ACTIVE',
  currentInstitution: i === 2 ? null : { id: '33333333-3333-4333-8333-333333333333', name: i === 0 ? 'ابتدائية ذات اسم عربي طويل جدًا في حي تربوي لاختبار الالتفاف' : 'ابتدائية النور', municipality: 'بلدية الجزائر' },
}));
let context;
let mode = 'dense';
let releaseLoading;
const queries = [];
const unexpected = [];
try {
  await server.listen();
  context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1440,1100'] });
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (route.request().method() !== 'GET') { unexpected.push('mutation'); return route.abort(); }
    if (url.pathname === '/api/v1/auth/me') return respond({ data: { id: district.id, email: 'visual-qa@example.invalid' } });
    if (url.pathname === '/api/v1/me/districts') return respond({ items: [district] });
    if (url.pathname === '/api/v1/teachers') {
      queries.push(Object.fromEntries(url.searchParams));
      if (mode === 'loading') await new Promise((resolve) => { releaseLoading = resolve; });
      if (mode === 'error') return respond({ error: { code: 'INTERNAL_ERROR', message: 'خطأ عام', requestId: 'synthetic' } }, 500);
      const data = mode === 'empty' ? [] : rows;
      return respond({ data, page: { limit: 25, total: mode === 'empty' ? 0 : 205, nextCursor: url.searchParams.has('cursor') || mode === 'empty' ? null : rows.at(-1).id } });
    }
    unexpected.push(url.pathname); return route.abort();
  });
  const page = context.pages()[0]; const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const settings = await context.newPage(); await settings.goto('chrome://settings/appearance');
  const zoom = settings.locator('select').nth(1); await zoom.selectOption({ label: '100%' });
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto('http://127.0.0.1:5190/app/teachers');
    await page.locator('.teacher-directory__identity-link').first().waitFor();
    assert.equal(await page.locator('.teacher-directory__identity-link').count(), 25);
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await page.getByRole('table', { name: 'دليل الأساتذة' }).count(), width > 1024 ? 1 : 0);
    assert.equal(await page.getByRole('list', { name: 'دليل الأساتذة' }).count(), width <= 1024 ? 1 : 0);
    const geometry = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rtl: getComputedStyle(document.querySelector('.teacher-directory')).direction,
      targets: [...document.querySelectorAll('.teacher-directory__identity-link, .teacher-directory__actions a')].every((el) => el.getBoundingClientRect().height >= 40) }));
    assert.equal(geometry.overflow, false); assert.equal(geometry.rtl, 'rtl'); assert.equal(geometry.targets, true);
    await page.screenshot({ path: join(output, `${width}.png`), fullPage: true });
    await page.screenshot({ path: join(output, `${width}-viewport.png`) });
    const trigger = page.getByRole('button', { name: 'مرشحات التوزيع الأسبوعي' });
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await trigger.focus(); await trigger.press('Space');
    await page.getByLabel('السنة الدراسية').fill('invalid');
    assert.equal(await trigger.isDisabled(), true); await page.getByRole('alert').waitFor();
    await page.getByLabel('السنة الدراسية').fill('2026-2027');
    await page.waitForURL('**/*academicYear=2026-2027*');
    await page.getByText('إجمالي النتائج: 205').waitFor();
    // Router search-param navigation commits asynchronously; assert the final
    // controlled state rather than check()'s immediate post-click DOM snapshot.
    await page.getByLabel('يعمل الآن').click();
    await page.waitForFunction(() => document.querySelector('.teacher-directory__check input:checked') !== null);
    assert.equal(await page.getByLabel('يعمل الآن').isChecked(), true);
    await page.getByText('مرشحات جدول نشطة: 1').waitFor();
    await trigger.focus(); await trigger.press('Enter');
    assert.equal(await page.getByLabel('السنة الدراسية').isVisible(), false);
    assert.equal(await page.getByText('مرشحات جدول نشطة: 1').isVisible(), true);
    assert.notEqual(await trigger.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
    await trigger.press('Space');
    await page.screenshot({ path: join(output, `${width}-expanded.png`) });
    console.log(`RESPONSIVE_${width}: PASS; dense/long/unassigned/statuses/RTL/keyboard/targets`);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('http://127.0.0.1:5190/app/teachers');
  await page.getByRole('button', { name: 'النتائج التالية' }).click();
  await page.waitForFunction(() => document.querySelector('.ui-pagination')?.textContent.includes('26–50'));
  assert(queries.some((query) => query.cursor === rows.at(-1).id));
  await page.getByRole('textbox', { name: 'البحث عن أستاذ' }).fill('اسم تجريبي');
  await page.waitForURL('**/*q=*'); assert.equal(new URL(page.url()).searchParams.get('q'), 'اسم تجريبي');
  await page.getByText('النتائج 1–25 من 205').waitFor();
  await page.goBack(); await page.getByRole('textbox', { name: 'البحث عن أستاذ' }).waitFor();
  await page.waitForFunction(() => document.querySelector('#teacher-directory-search')?.value === '');
  assert.equal(await page.getByRole('textbox', { name: 'البحث عن أستاذ' }).inputValue(), '');
  for (const state of ['loading', 'empty', 'error']) {
    mode = state;
    await page.goto(`http://127.0.0.1:5190/app/teachers${state === 'empty' ? '?q=missing' : ''}`);
    await page.getByText(state === 'loading' ? 'جارٍ تحميل دليل الأساتذة…' : state === 'empty' ? 'لا توجد نتائج مطابقة' : 'تعذر تحميل دليل الأساتذة', { exact: true }).waitFor();
    await page.screenshot({ path: join(output, `${state}.png`) });
    if (state === 'loading') { mode = 'dense'; releaseLoading(); await page.locator('.teacher-directory__identity-link').first().waitFor(); }
    if (state === 'error') { assert.equal(await page.getByText('إجمالي النتائج: غير متاح').isVisible(), true); mode = 'dense'; await page.getByRole('button', { name: 'إعادة المحاولة' }).click(); await page.locator('.teacher-directory__identity-link').first().waitFor(); }
  }
  mode = 'empty'; await page.goto('http://127.0.0.1:5190/app/teachers'); await page.getByText('لا توجد سجلات أساتذة ظاهرة', { exact: true }).waitFor();
  mode = 'dense';
  const zoomPage = await context.newPage(); await zoomPage.goto('http://127.0.0.1:5190/app/teachers');
  await zoomPage.locator('.teacher-directory__identity-link').first().waitFor();
  const before = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth }));
  await zoom.selectOption({ label: '200%' });
  await zoomPage.waitForFunction((dpr) => devicePixelRatio > dpr * 1.9, before.dpr);
  const after = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  assert.equal(after.overflow, false); assert(after.width < before.width * 0.6);
  assert.equal(await zoomPage.getByRole('table', { name: 'دليل الأساتذة' }).count(), 0);
  const cdp = await context.newCDPSession(zoomPage);
  const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(join(output, 'zoom-200.png'), Buffer.from(capture.data, 'base64')); await cdp.detach();
  await zoomPage.locator('.teacher-directory__identity-link').first().scrollIntoViewIfNeeded();
  const recordsCdp = await context.newCDPSession(zoomPage);
  const recordsCapture = await recordsCdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(join(output, 'zoom-200-records.png'), Buffer.from(recordsCapture.data, 'base64')); await recordsCdp.detach();
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  assert(queries.every((query) => query.limit === '25'));
  assert(queries.some((query) => query.worksNow === 'true' && query.academicYear === '2026-2027'));
  console.log(`ZOOM_200: PASS; ${before.dpr}->${after.dpr}; ${before.width}->${after.width}`);
  console.log('STATES_SEARCH_PAGINATION_BACK_NO_PER_ROW_REQUESTS: PASS');
  console.log(`VISUAL_EVIDENCE: ${output}`);
} finally { releaseLoading?.(); await context?.close(); await server.close(); }

// Real app/browser presentation gate with synthetic intercepted API responses.
// No database, persistent UAT or production mutation is performed.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const require = createRequire(resolve('packages/web/package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const output = await mkdtemp(join(tmpdir(), 'g9-02b-institutions-'));
const profile = await mkdtemp(join(tmpdir(), 'g9-02b-chrome-'));
const server = await createServer({ root: resolve('packages/web'), server: { host: '127.0.0.1', port: 5191, strictPort: true } });
const district = { id: '11111111-1111-4111-8111-111111111111', name: 'مقاطعة اختبار اصطناعية' };
const rows = Array.from({ length: 25 }, (_, i) => ({
  id: `33333333-3333-4333-8333-${String(i + 1).padStart(12, '0')}`, districtId: district.id,
  name: i === 0 ? 'ابتدائية ذات اسم عربي طويل جدًا لاختبار وضوح الهوية دون قص النص' : `ابتدائية تجريبية ${i + 1}`,
  externalCode: i === 0 ? 'INS-QA-01' : null,
  municipality: i === 0 ? 'بلدية باسم عربي طويل جدًا لاختبار التفاف السياق' : 'بلدية الجزائر',
  address: i === 0 ? 'حي النخيل شارع المؤسسة التربوية بعنوان عربي طويل لاختبار القراءة دون تمرير أفقي' : 'حي المدرسة',
  email: i === 1 ? null : `institution-${i + 1}@example.invalid`, directorPhone: i === 1 ? null : '+213555123456',
  location: i === 1 ? null : { latitude: '35.123456', longitude: '-0.123456', source: 'MANUAL_INSPECTOR' },
  archivedAt: null, createdAt: '', updatedAt: '',
}));
let context; let mode = 'dense'; let releaseLoading;
const queries = []; const mutations = []; const unexpected = []; const errors = [];
try {
  await server.listen();
  context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1440,1100'] });
  await context.addCookies([{ name: 'inspector_csrf', value: 'synthetic-qa-only', url: 'http://127.0.0.1:5191' }]);
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method();
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/v1/auth/me' && method === 'GET') return respond({ data: { id: district.id, email: 'visual-qa@example.invalid' } });
    if (url.pathname === '/api/v1/me/districts' && method === 'GET') return respond({ items: [district] });
    if (url.pathname === '/api/v1/institutions' && method === 'GET') {
      queries.push(Object.fromEntries(url.searchParams));
      if (mode === 'loading') await new Promise((resolve) => { releaseLoading = resolve; });
      if (mode === 'error') return respond({ error: { code: 'INTERNAL_ERROR', message: 'خطأ عام', requestId: 'synthetic' } }, 500);
      return respond({ data: mode === 'empty' ? [] : rows, page: { limit: 25, total: mode === 'empty' ? 0 : 205, nextCursor: mode === 'empty' || url.searchParams.has('cursor') ? null : rows.at(-1).id } });
    }
    if (url.pathname === '/api/v1/institutions' && method === 'POST') { mutations.push({ method, body: route.request().postDataJSON() }); return respond({ data: rows[0] }, 201); }
    if (url.pathname === `/api/v1/institutions/${rows[0].id}` && method === 'PATCH') { mutations.push({ method, body: route.request().postDataJSON() }); return respond({ data: rows[0] }); }
    unexpected.push(`${method} ${url.pathname}`); return route.abort();
  });
  const page = context.pages()[0]; page.on('pageerror', (error) => errors.push(error.message));
  const settings = await context.newPage(); await settings.goto('chrome://settings/appearance');
  const zoom = settings.locator('select').nth(1); await zoom.selectOption({ label: '100%' });
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1100 }); await page.goto('http://127.0.0.1:5191/app/institutions');
    await page.locator('.institutions-identity').first().waitFor();
    assert.equal(await page.locator('.institutions-identity').count(), 25);
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await page.getByRole('table', { name: 'قائمة المؤسسات' }).count(), width > 1024 ? 1 : 0);
    assert.equal(await page.getByRole('list', { name: 'قائمة المؤسسات' }).count(), width <= 1024 ? 1 : 0);
    assert.equal(await page.locator('.institutions-identity a').count(), 0);
    const geometry = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rtl: getComputedStyle(document.querySelector('.institutions-page')).direction,
      targets: [...document.querySelectorAll('.institutions-results button')].every((el) => el.getBoundingClientRect().height >= 40) }));
    assert.equal(geometry.overflow, false); assert.equal(geometry.rtl, 'rtl'); assert.equal(geometry.targets, true);
    await page.screenshot({ path: join(output, `${width}.png`), fullPage: true });
    await page.screenshot({ path: join(output, `${width}-viewport.png`) });
    const create = page.getByRole('button', { name: 'إضافة مؤسسة', exact: true }); await create.focus(); await create.press('Enter');
    const createDialog = page.getByRole('dialog', { name: 'إضافة مؤسسة' }); await createDialog.waitFor();
    assert.equal(await createDialog.getByLabel('اسم المؤسسة', { exact: false }).evaluate((el) => document.activeElement === el), true);
    await page.screenshot({ path: join(output, `${width}-create.png`) });
    await page.keyboard.press('Escape'); await createDialog.waitFor({ state: 'hidden' });
    assert.equal(await create.evaluate((el) => document.activeElement === el), true);
    const edit = page.getByRole('button', { name: 'تعديل البريد', exact: true }).first(); await edit.focus(); await edit.press('Space');
    const editDialog = page.getByRole('dialog', { name: 'تعديل بريد المؤسسة' }); await editDialog.waitFor();
    assert.equal(await editDialog.getByLabel('البريد الإلكتروني').inputValue(), rows[0].email);
    await page.screenshot({ path: join(output, `${width}-email.png`) });
    await page.keyboard.press('Escape'); await editDialog.waitFor({ state: 'hidden' });
    assert.equal(await edit.evaluate((el) => document.activeElement === el), true);
    assert.notEqual(await edit.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
    console.log(`RESPONSIVE_${width}: PASS; identity/contact/location/RTL/keyboard/dialogs/focus`);
  }
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto('http://127.0.0.1:5191/app/institutions');
  await page.getByRole('button', { name: 'التالي', exact: true }).click(); await page.getByText('النتائج 26–50 من 205').waitFor();
  assert(queries.some((query) => query.cursor === rows.at(-1).id));
  await page.getByLabel('البحث عن مؤسسة').fill('بحث تجريبي'); await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await page.waitForURL('**/*q=*'); await page.getByText('النتائج 1–25 من 205').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'بحث تجريبي');
  await page.goBack(); await page.waitForFunction(() => document.querySelector('#institution-search')?.value === '');
  for (const state of ['loading', 'empty', 'error']) {
    mode = state; await page.goto(`http://127.0.0.1:5191/app/institutions${state === 'empty' ? '?q=missing' : ''}`);
    await page.getByText(state === 'loading' ? 'جارٍ تحميل المؤسسات…' : state === 'empty' ? 'لا توجد نتائج مطابقة' : 'تعذر تحميل المؤسسات', { exact: true }).waitFor();
    await page.screenshot({ path: join(output, `${state}.png`) });
    if (state === 'loading') { mode = 'dense'; releaseLoading(); await page.locator('.institutions-identity').first().waitFor(); }
    if (state === 'error') { assert.equal(await page.getByText('إجمالي المؤسسات: غير متاح').isVisible(), true); mode = 'dense'; await page.getByRole('button', { name: 'إعادة المحاولة' }).click(); await page.locator('.institutions-identity').first().waitFor(); }
  }
  mode = 'empty'; await page.goto('http://127.0.0.1:5191/app/institutions'); await page.getByText('لا توجد مؤسسات بعد', { exact: true }).waitFor();
  await page.screenshot({ path: join(output, 'empty-default.png') }); mode = 'dense';
  await page.goto('http://127.0.0.1:5191/app/institutions'); await page.getByRole('button', { name: 'إضافة مؤسسة', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: 'إضافة مؤسسة' }); await createDialog.getByLabel('اسم المؤسسة', { exact: false }).fill('مؤسسة اختبار');
  await createDialog.getByRole('button', { name: 'إنشاء المؤسسة' }).click(); await page.getByText('تم إنشاء المؤسسة بنجاح.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'تعديل البريد', exact: true }).first().click();
  const editDialog = page.getByRole('dialog', { name: 'تعديل بريد المؤسسة' }); await editDialog.getByLabel('البريد الإلكتروني').fill('changed@example.invalid');
  await editDialog.getByRole('button', { name: 'حفظ البريد' }).click(); await page.getByText('تم تحديث بريد المؤسسة بنجاح.', { exact: true }).waitFor();
  assert.deepEqual(mutations, [{ method: 'POST', body: { districtId: district.id, name: 'مؤسسة اختبار' } }, { method: 'PATCH', body: { email: 'changed@example.invalid' } }]);
  const zoomPage = await context.newPage(); await zoomPage.goto('http://127.0.0.1:5191/app/institutions'); await zoomPage.locator('.institutions-identity').first().waitFor();
  const before = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth })); await zoom.selectOption({ label: '200%' });
  await zoomPage.waitForFunction((dpr) => devicePixelRatio > dpr * 1.9, before.dpr);
  const after = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  assert.equal(after.overflow, false); assert(after.width < before.width * 0.6); assert.equal(await zoomPage.getByRole('table').count(), 0);
  const cdp = await context.newCDPSession(zoomPage);
  for (const name of ['zoom-200', 'zoom-200-records']) {
    if (name.endsWith('records')) await zoomPage.locator('.institutions-identity').first().scrollIntoViewIfNeeded();
    const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    await writeFile(join(output, `${name}.png`), Buffer.from(capture.data, 'base64'));
  }
  await cdp.detach(); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert(queries.every((query) => query.limit === '25'));
  console.log(`ZOOM_200: PASS; ${before.dpr}->${after.dpr}; ${before.width}->${after.width}`);
  console.log('STATES_SEARCH_PAGINATION_CREATE_EMAIL_NO_PER_ROW_REQUESTS: PASS'); console.log(`VISUAL_EVIDENCE: ${output}`);
} finally { releaseLoading?.(); await context?.close(); await server.close(); }

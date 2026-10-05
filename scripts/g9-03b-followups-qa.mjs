// Actual app/Chrome presentation gate; intercepted synthetic data only, no DB or UAT writes.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const require = createRequire(resolve('packages/web/package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const server = await createServer({ root: resolve('packages/web'), server: { host: '127.0.0.1', port: 5193, strictPort: true } });
const output = await mkdtemp(join(tmpdir(), 'g9-03b-followups-'));
const profile = await mkdtemp(join(tmpdir(), 'g9-03b-chrome-'));
const inspectorId = '33333333-3333-4333-8333-333333333333', districtId = '55555555-5555-4555-8555-555555555555';
const rows = Array.from({ length: 25 }, (_, i) => ({
  id: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`, reportId: inspectorId,
  ownerInspectorId: i === 1 ? districtId : inspectorId,
  status: 'OPEN', note: i === 0 ? 'مرافقة الأستاذ في تنظيم مراحل الحصة وتوفير شروط السلامة أثناء الأنشطة الجماعية. '.repeat(5) : `متابعة الإجراء البيداغوجي المحفوظ رقم ${i + 1}`,
  dueDate: ['2026-01-15', '2026-10-05', '2099-01-01'][i % 3], alertState: ['OVERDUE', 'DUE_TODAY', 'NONE'][i % 3],
  completionNote: null, completedAt: null, revision: 1, createdAt: '', updatedAt: '',
  context: { visitId: `44444444-4444-4444-8444-${String(i + 1).padStart(12, '0')}`, districtId,
    teacher: { id: `66666666-6666-4666-8666-${String(i + 1).padStart(12, '0')}`, name: i === 0 ? 'أستاذ ذو اسم عربي طويل جدًا لاختبار التفاف الهوية' : 'أستاذ تجريبي', surname: `بن عبد الرحمن ${i + 1}` },
    institution: { id: districtId, name: i === 0 ? 'ابتدائية الزيارة التاريخية ذات اسم طويل وليست المؤسسة الحالية للأستاذ' : 'مؤسسة الزيارة التاريخية' } },
}));
let context, mode = 'dense', releaseLoading;
const queries = [], unexpected = [], mutations = [], errors = [];
try {
  await server.listen();
  context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1440,1100'] });
  await context.addCookies([{ name: 'inspector_csrf', value: 'synthetic-qa-only', url: 'http://127.0.0.1:5193' }]);
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()), method = route.request().method();
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/v1/auth/me' && method === 'GET') return respond({ data: { id: inspectorId, email: 'visual-qa@example.invalid' } });
    if (url.pathname === '/api/v1/me/districts' && method === 'GET') return respond({ items: [{ id: districtId, name: 'مقاطعة اصطناعية' }] });
    if (url.pathname === '/api/v1/follow-ups' && method === 'GET') {
      queries.push(Object.fromEntries(url.searchParams));
      if (mode === 'loading') await new Promise((resolve) => { releaseLoading = resolve; });
      if (mode === 'error') return respond({ error: { code: 'INTERNAL_ERROR', message: 'خطأ عام', requestId: 'synthetic' } }, 500);
      const completed = url.searchParams.get('status') === 'COMPLETED';
      return respond({ data: mode === 'empty' ? [] : rows.map((row) => completed ? { ...row, status: 'COMPLETED', alertState: 'NONE', completionNote: 'نتيجة المرافقة محفوظة', completedAt: '2026-10-01T10:00:00Z' } : row),
        page: { limit: 25, total: mode === 'empty' ? 0 : 205, nextCursor: mode === 'empty' || url.searchParams.has('cursor') ? null : rows.at(-1).id } });
    }
    if (url.pathname === `/api/v1/follow-ups/${rows[0].id}` && method === 'PATCH') { mutations.push(route.request().postDataJSON()); return respond({ data: { followUp: rows[0] } }); }
    unexpected.push(`${method} ${url.pathname}`); return route.abort();
  });
  const page = context.pages()[0]; page.on('pageerror', (error) => errors.push(error.message));
  const settings = await context.newPage(); await settings.goto('chrome://settings/appearance');
  const zoom = settings.locator('select').nth(1); await zoom.selectOption({ label: '100%' });
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1100 }); await page.goto('http://127.0.0.1:5193/app/follow-ups');
    const list = page.getByRole('list', { name: 'إجراءات المتابعة' }); await list.waitFor();
    assert.equal(await list.getByRole('listitem').count(), 25); assert.equal(await page.getByRole('table').count(), 0);
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await list.locator('.ui-record-row__identity').first().textContent(), rows[0].note);
    assert.equal(await list.getByRole('link', { name: /تقرير/ }).count(), 0);
    assert.equal(await list.getByRole('link', { name: 'الزيارة المصدر' }).first().getAttribute('href'), `/app/visits/${rows[0].context.visitId}`);
    assert.equal(await list.locator('.followup-teacher').first().getAttribute('href'), `/app/teachers/${rows[0].context.teacher.id}`);
    assert.equal(await list.getByRole('listitem').nth(1).getByRole('button').count(), 0);
    const geometry = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, rtl: getComputedStyle(document.querySelector('.followups-page')).direction }));
    assert.equal(geometry.overflow, false); assert.equal(geometry.rtl, 'rtl');
    await page.screenshot({ path: join(output, `${width}.png`) });
    const complete = list.getByRole('button', { name: 'إكمال الإجراء', exact: true }).first(); await complete.focus(); await complete.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'إكمال إجراء المتابعة' }); await dialog.waitFor();
    assert.equal(await dialog.getByLabel('نتيجة المتابعة').evaluate((el) => document.activeElement === el), true);
    await page.screenshot({ path: join(output, `${width}-complete.png`) }); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await complete.evaluate((el) => document.activeElement === el), true); assert.notEqual(await complete.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
    console.log(`RESPONSIVE_${width}: PASS`);
  }
  await Promise.all([page.waitForResponse((r) => r.url().includes('alert=DUE_TODAY')), page.getByLabel('الاستحقاق').selectOption('DUE_TODAY')]);
  assert.equal(queries.at(-1).alert, 'DUE_TODAY');
  await Promise.all([page.waitForResponse((r) => r.url().includes('cursor=')), page.getByRole('button', { name: /التالي/ }).click()]); assert.equal(queries.at(-1).cursor, rows.at(-1).id);
  await Promise.all([page.waitForResponse((r) => r.url().includes('/follow-ups?') && !r.url().includes('alert=')), page.getByLabel('الاستحقاق').selectOption('')]);
  await Promise.all([page.waitForResponse((r) => r.url().includes('status=COMPLETED')), page.getByLabel('الحالة').selectOption('COMPLETED')]);
  await page.getByText('نتيجة المرافقة محفوظة', { exact: true }).first().waitFor(); assert.equal(await page.getByRole('button', { name: 'إكمال الإجراء', exact: true }).count(), 0);
  mode = 'empty'; await page.goto('http://127.0.0.1:5193/app/follow-ups'); await page.getByText('لا توجد إجراءات مفتوحة', { exact: true }).waitFor();
  await page.getByLabel('الاستحقاق').selectOption('OVERDUE'); await page.getByText('لا توجد إجراءات مطابقة', { exact: true }).waitFor();
  await page.screenshot({ path: join(output, 'filtered-empty.png') });
  mode = 'error'; await page.reload(); await page.getByText('إجمالي الإجراءات: غير متاح').waitFor(); await page.screenshot({ path: join(output, 'error.png') });
  mode = 'dense'; await page.getByRole('button', { name: 'إعادة التحميل', exact: true }).click(); await page.getByRole('list', { name: 'إجراءات المتابعة' }).waitFor();
  mode = 'loading'; await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByText('جارٍ تحميل إجراءات المتابعة…').waitFor(); await page.screenshot({ path: join(output, 'loading.png') });
  mode = 'dense'; releaseLoading(); await page.getByRole('list', { name: 'إجراءات المتابعة' }).waitFor();
  await page.getByRole('button', { name: 'تعديل الإجراء', exact: true }).first().click();
  const edit = page.getByRole('dialog', { name: 'تعديل إجراء المتابعة' }); await edit.getByLabel('الإجراء المطلوب').fill('إجراء اصطناعي معدل'); await edit.getByRole('button', { name: 'حفظ التعديل' }).click(); await page.getByText('تم حفظ التعديل.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'إكمال الإجراء', exact: true }).first().click(); await page.getByRole('button', { name: 'تأكيد الإكمال' }).click(); await page.getByText('تم إكمال إجراء المتابعة.', { exact: true }).waitFor();
  assert.deepEqual(mutations, [{ operation: 'EDIT', expectedRevision: 1, note: 'إجراء اصطناعي معدل', dueDate: rows[0].dueDate }, { operation: 'COMPLETE', expectedRevision: 1 }]);
  const zoomPage = await context.newPage(); await zoomPage.goto('http://127.0.0.1:5193/app/follow-ups'); await zoomPage.getByRole('list', { name: 'إجراءات المتابعة' }).waitFor();
  const before = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth })); await zoom.selectOption({ label: '200%' });
  await zoomPage.waitForFunction((dpr) => devicePixelRatio > dpr * 1.9, before.dpr); await zoomPage.bringToFront();
  const after = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  assert.equal(after.overflow, false); assert(after.width < before.width * .6);
  const cdp = await context.newCDPSession(zoomPage); const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
  await writeFile(join(output, 'zoom-200.png'), Buffer.from(shot.data, 'base64')); await cdp.detach();
  await zoomPage.locator('.ui-record-row').first().scrollIntoViewIfNeeded();
  const recordsCdp = await context.newCDPSession(zoomPage); const recordsShot = await recordsCdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
  await writeFile(join(output, 'zoom-200-records.png'), Buffer.from(recordsShot.data, 'base64')); await recordsCdp.detach();
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []); assert(queries.every((q) => q.limit === '25'));
  console.log(`ZOOM_200: PASS ${before.dpr}->${after.dpr}; ${before.width}->${after.width}`); console.log('STATES_FILTERS_CURSOR_OWNER_DIALOGS_CONTEXT_NO_PER_ROW_FETCH: PASS'); console.log(`VISUAL_EVIDENCE: ${output}`);
} finally { releaseLoading?.(); await context?.close(); await server.close(); }

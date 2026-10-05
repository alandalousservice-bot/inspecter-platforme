// Real application/Chrome; every API call intercepted, no database/UAT access.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const require = createRequire(resolve('packages/web/package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const server = await createServer({ root: resolve('packages/web'), server: { host: '127.0.0.1', port: 5197, strictPort: true } });
const output = await mkdtemp(join(tmpdir(), 'g9-07-visual-'));
const browserProfile = await mkdtemp(join(tmpdir(), 'g9-07-chrome-'));
const base = 'http://127.0.0.1:5197';
const id = '44444444-4444-4444-8444-444444444444';
const districtId = '22222222-2222-4222-8222-222222222222';
const institution = { id: '33333333-3333-4333-8333-333333333333', name: 'ابتدائية ذات اسم عربي طويل — École 2026', municipality: 'بلدية النور', address: null, directorPhone: null };
const teacher = { id, districtId, name: 'أستاذ ذو اسم عربي طويل لاختبار قراءة الملف', surname: 'بن عبد الرحمن', professionalStatus: 'PERMANENT', recordStatus: 'ACTIVE', currentInstitution: institution, birthDate: '1985-03-04', placeOfBirth: 'وهران', employedAt: '2010-09-01', confirmedAt: null, phone: '+213555123456', email: 'qa@example.invalid', qualifications: null, declaredInstitutions: { primaryInstitutionName: 'تصريح غير معتمد', additionalInstitutionNames: [] }, declaredWorkplace: { institutionName: 'تصريح غير معتمد', municipality: null, institutionAddress: null, directorPhone: null, legacyAdditionalInstitutionNames: [] } };
const visit = { id, districtId, teacher, institution, academicYear: '2026-2027', visitType: 'GUIDANCE', intervalKind: 'SCHEDULED', scheduledStartAt: '2026-10-15T08:30:00Z', scheduledEndAt: '2026-10-15T09:30:00Z', actualStartAt: null, actualEndAt: null, occurredAt: '2026-10-15T09:30:00Z', status: 'COMPLETED', revision: 1, visitTypeEditable: false };
const report = { id, visitId: id, reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1, status: 'DRAFT', revision: 1, levelClass: 'السنة الرابعة', lessonTopic: 'التوازن', inspectorConclusion: 'خلاصة اصطناعية', displayIdentity: { inspector: { name: 'مفتش', surname: 'تجريبي' }, teacher }, visit, displayContext: { districtName: 'مقاطعة النور', institutionMunicipality: 'بلدية النور', visitType: 'GUIDANCE' }, inspectorVisitV1: { observations: [], pedagogicalMark: null } };
const submission = { id, districtId, status: 'PENDING', submittedAt: '2026-10-01T09:30:00Z', acceptedTeacherId: null, submittedProfile: { firstName: teacher.name, lastName: teacher.surname, dateOfBirth: teacher.birthDate, placeOfBirth: teacher.placeOfBirth, phone: teacher.phone, email: teacher.email, professionalStatus: 'PERMANENT', employmentDate: teacher.employedAt }, declaredAdministrative: {}, declaredWorkplace: { institutionName: 'مؤسسة مصرح بها فقط', municipality: 'بلدية النور', institutionAddress: null, directorPhone: null, institutionEmail: null, legacyAdditionalInstitutionNames: [] }, structuredQualifications: [], supplementaryWorkplaces: [], locationProposal: null, potentialDuplicates: [] };
let mode = 'normal', identityMode = 'normal', release;
let identity = { name: 'محمد', surname: 'بن عبد الرحمن ذو اسم مهني طويل للاختبار' };
const requests = [], unexpected = [], errors = [];
function summary() {
  const dense = mode === 'dense';
  return { asOf: '2026-10-05T09:00:00Z', today: '2026-10-05', attention: {
    pendingSubmissions: { total: dense ? 8 : 0, items: dense ? [{ id, submittedAt: submission.submittedAt }] : [] },
    ownedFollowUps: { overdueTotal: dense ? 4 : 0, dueTodayTotal: dense ? 2 : 0, items: dense ? [{ id, dueDate: '2026-10-04', alertState: 'OVERDUE' }] : [] },
    reports: { draftTotal: dense ? 1 : 0, completedVisitWithoutReportTotal: dense ? 5 : 0, items: dense ? [{ visitId: id, reportId: id, kind: 'DRAFT_REPORT', referenceAt: '2026-10-05T08:00:00Z' }] : [] },
  }, upcomingVisits: dense ? [{ id, scheduledStartAt: visit.scheduledStartAt, scheduledEndAt: visit.scheduledEndAt, visitType: 'GUIDANCE', institutionName: institution.name }] : [] };
}
let context;
try {
  await server.listen();
  context = await chromium.launchPersistentContext(browserProfile, { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1440,1100'] });
  await context.addCookies([{ name: 'inspector_csrf', value: 'synthetic-only', url: base }]);
  await context.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname, method = route.request().method(); requests.push(`${method} ${pathname}`);
    const respond = (json, status = 200) => route.fulfill({ json, status });
    const failure = () => respond({ error: { code: 'INTERNAL_ERROR', message: 'غير متاح', requestId: 'synthetic' } }, 500);
    if (pathname === '/api/v1/auth/me' && method === 'GET') return respond({ data: { id: 'inspector-synthetic', email: 'visual-qa@example.invalid' } });
    if (pathname === '/api/v1/me/professional-identity') {
      if (identityMode === 'loading') await new Promise((resolve) => { release = resolve; });
      if (identityMode === 'error') return failure();
      if (method === 'PUT') identity = route.request().postDataJSON();
      return respond({ data: identity });
    }
    if (method !== 'GET') { unexpected.push(`${method} ${pathname}`); return route.abort(); }
    if (pathname === '/api/v1/dashboard/summary') {
      if (mode === 'loading') await new Promise((resolve) => { release = resolve; });
      return mode === 'error' ? failure() : respond({ data: summary() });
    }
    if (pathname === '/api/v1/me/districts') return respond({ items: [{ id: districtId, name: 'مقاطعة النور' }] });
    const page = (data) => respond({ data, page: { limit: 25, total: data.length, nextCursor: null } });
    if (pathname === '/api/v1/teachers') return page([teacher]);
    if (pathname === `/api/v1/teachers/${id}`) return respond({ data: teacher });
    if (pathname === `/api/v1/teachers/${id}/qualifications` || pathname === `/api/v1/teachers/${id}/supplementary-workplaces`) return respond({ items: [] });
    if (pathname === '/api/v1/institutions') return page([institution]);
    if (pathname === '/api/v1/visits') return page([visit]);
    if (pathname === `/api/v1/visits/${id}`) return respond({ data: { visit } });
    if (pathname === `/api/v1/visits/${id}/report`) return respond({ data: { report } });
    if (pathname === '/api/v1/report-templates/inspector-visit/v1') return respond({ data: { reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1, criteria: [] } });
    if (pathname === '/api/v1/follow-ups') return page([]);
    if (pathname === '/api/v1/submissions') return page([{ id, firstName: teacher.name, lastName: teacher.surname, dateOfBirth: teacher.birthDate, primaryInstitutionName: 'مؤسسة مصرح بها فقط', status: 'PENDING', submittedAt: submission.submittedAt, hasPotentialDuplicates: false }]);
    if (pathname === `/api/v1/submissions/${id}`) return respond({ data: submission });
    unexpected.push(`${method} ${pathname}`); return route.abort();
  });
  const page = context.pages()[0]; page.on('pageerror', (error) => errors.push(error.message));
  const settings = await context.newPage(); await settings.goto('chrome://settings/appearance');
  const zoom = settings.locator('select').nth(1); await zoom.selectOption({ label: '100%' });
  async function loaded(target, route) {
    await target.getByRole('heading', { level: 1 }).waitFor();
    await target.locator(route === '/app' ? '.dashboard-count' : '#inspector-name').first().waitFor();
  }
  async function geometry(target) {
    assert.equal(await target.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, 'page overflow');
    assert.equal(await target.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await target.getByRole('main').count(), 1);
    assert.equal(await target.locator('html').getAttribute('dir'), 'rtl');
  }
  for (const route of ['/app', '/app/me/professional-identity']) {
    for (const width of [1440,1280,768,390]) {
      await page.setViewportSize({ width, height: 1100 }); await page.goto(base + route); await loaded(page,route); await geometry(page);
      const name = route === '/app' ? 'dashboard' : 'identity';
      await page.screenshot({ path: join(output, `${name}-${width}.png`), fullPage: true });
      if (width >= 1024) {
        await page.getByRole('button', { name: 'طي القائمة الجانبية' }).click();
        await page.keyboard.press('Tab');
        const link = page.locator('.app-sidebar').getByRole('link', { name: 'هويتي المهنية', exact: true }); await link.focus();
        assert.notEqual(await link.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
        await geometry(page); await page.screenshot({ path: join(output, `${name}-${width}-collapsed.png`) });
      } else {
        const opener = page.getByRole('button', { name: 'فتح قائمة التنقل' }); await opener.click();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('button', { name: 'إغلاق القائمة', exact: true }).waitFor();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.app-sidebar')).transform === 'matrix(1, 0, 0, 1, 0, 0)');
        assert.equal(await page.locator('.app-sidebar__group').count(),3);
        assert.equal(await page.locator('.app-sidebar a').evaluateAll((links) => links.every((link) => link.getBoundingClientRect().width > 44)),true);
        await page.screenshot({ path: join(output, `${name}-${width}-drawer.png`) });
        assert.equal(await page.locator('.app-shell__content').getAttribute('inert'), '');
        await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
        assert.equal(await opener.evaluate((el) => document.activeElement === el), true);
        await opener.click(); await page.locator('.app-sidebar').getByRole('link', { name: 'هويتي المهنية', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  mode = 'dense'; await page.goto(base + '/app'); await loaded(page,'/app');
  assert.equal(await page.getByRole('link', { name: /^عرض القسم:/ }).count(), 5);
  await page.screenshot({ path: join(output, 'dashboard-dense.png'), fullPage: true });
  mode = 'error'; await page.goto(base + '/app'); await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.dashboard-count').count(),0);
  mode = 'normal'; await page.getByRole('button', { name: 'إعادة المحاولة' }).click(); await loaded(page,'/app');
  identityMode = 'error'; await page.goto(base + '/app/me/professional-identity'); await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('textbox').count(),0);
  identityMode = 'normal'; await page.reload(); await loaded(page,'identity');
  await page.getByRole('textbox', { name: /الاسم/ }).fill(''); await page.getByRole('button', { name: 'حفظ الهوية المهنية' }).click();
  assert.equal(await page.locator('#inspector-name').getAttribute('aria-invalid'), 'true');
  await page.getByRole('textbox', { name: /الاسم/ }).fill('محمد');
  await page.getByRole('button', { name: 'حفظ الهوية المهنية' }).click(); await page.getByText('حُفظت الهوية المهنية.', { exact: true }).waitFor();
  // Bounded read-only real route journey; all responses above are synthetic.
  await page.goto(base + '/app'); await loaded(page,'/app');
  const nav = page.locator('.app-sidebar');
  await nav.getByRole('link', { name: 'دليل الأساتذة', exact: true }).click();
  await page.locator(`a[href="/app/teachers/${id}"]`).first().click();
  await page.getByRole('link', { name: 'زيارات الأستاذ', exact: true }).click();
  await page.getByRole('link', { name: /تفاصيل الزيارة —/ }).first().click();
  await page.getByRole('link', { name: 'صفحة تقرير الزيارة', exact: true }).click();
  await page.locator('.report-page').waitFor(); await geometry(page);
  await nav.getByRole('link', { name: 'إجراءات المتابعة', exact: true }).click(); await page.getByRole('heading', { name: 'لا توجد إجراءات مفتوحة' }).waitFor();
  await nav.getByRole('link', { name: 'طلبات الأساتذة', exact: true }).click();
  await page.locator(`a[href="/app/submissions/${id}"]`).first().click(); await page.locator('.submission-review-context').waitFor(); await geometry(page);
  await nav.getByRole('link', { name: 'المؤسسات', exact: true }).click(); await page.getByText(institution.name, { exact: true }).first().waitFor();
  await nav.getByRole('link', { name: 'هويتي المهنية', exact: true }).click(); await loaded(page,'identity');
  const zoomPage = await context.newPage(); await zoomPage.goto(base + '/app'); await loaded(zoomPage,'/app');
  const before = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth })); await zoom.selectOption({ label: '200%' });
  await zoomPage.waitForFunction((dpr) => devicePixelRatio > dpr * 1.9, before.dpr);
  const after = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth }));
  for (const route of ['/app','/app/me/professional-identity']) {
    await zoomPage.goto(base + route); await loaded(zoomPage,route); await geometry(zoomPage); await zoomPage.bringToFront();
    assert((await zoomPage.evaluate(() => innerWidth)) < before.width * .6);
    if (route !== '/app') {
      for (const selector of ['#inspector-name','#inspector-surname','button[type="submit"]']) {
        const control = zoomPage.locator(selector); await control.scrollIntoViewIfNeeded();
        const rect = await control.boundingBox(); const width = await zoomPage.evaluate(() => innerWidth);
        assert(rect && rect.x >= 0 && rect.x + rect.width <= width);
      }
      await zoomPage.evaluate(() => scrollTo(0,0));
    }
    await zoomPage.getByRole('button', { name: 'فتح قائمة التنقل' }).click(); await zoomPage.getByRole('dialog').waitFor(); await zoomPage.keyboard.press('Escape');
    const cdp = await context.newCDPSession(zoomPage); const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
    await writeFile(join(output, `${route === '/app' ? 'dashboard' : 'identity'}-zoom-200.png`), Buffer.from(shot.data,'base64')); await cdp.detach();
  }
  await zoom.selectOption({ label: '100%' });
  for (const route of ['/login', `/public/d/${districtId}/register`]) {
    await page.goto(base + route); await page.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(await page.locator('.app-sidebar,.app-topbar').count(),0); await geometry(page);
  }
  assert.deepEqual(unexpected,[]); assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ status: 'PASS', output, widths: [1440,1280,768,390], realChromeZoom: '200%', zoomBefore: before, zoomAfter: after, journey: 'PASS', unexpectedRequests: unexpected, database: 'NOT_ACCESSED', persistentUat: 'UNTOUCHED' }));
} finally { release?.(); if (context) await context.close(); await server.close(); }

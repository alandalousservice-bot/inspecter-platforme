// Presentation-only browser gate; every API call is intercepted. No UAT writes.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const require = createRequire(resolve('packages/web/package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const { inspectorVisitV1Criteria: criteria } = await import(pathToFileURL(resolve('packages/api/dist/reports/inspector-visit-v1.js')));
const server = await createServer({ root: resolve('packages/web'), server: { host: '127.0.0.1', port: 5195, strictPort: true } });
const output = await mkdtemp(join(tmpdir(), 'g9-05-documents-'));
const profile = await mkdtemp(join(tmpdir(), 'g9-05-chrome-'));
const id = '55555555-5555-4555-8555-555555555555';
const teacher = { id: '44444444-4444-4444-8444-444444444444', name: 'أستاذة ذات اسم عربي طويل لاختبار قراءة الوثيقة', surname: 'بن عبد الرحمن' };
const narrative = 'راجع المفتش تنظيم الأنشطة الحركية ومشاركة التلاميذ وقواعد السلامة، ودوّن ملاحظاته وتوجيهاته يدويًا دون توليد آلي. '.repeat(12).trim();
const institution = { id: '33333333-3333-4333-8333-333333333333', name: 'ابتدائية المؤسسة التاريخية وقت الزيارة ذات اسم طويل للقراءة' };
let family = 'v1', state = 'DRAFT', visitType = 'PROMOTION_EVALUATION', mode = 'normal', mark = '14.25', release;
const unexpected = [], errors = [], mutations = [];
function visit() { return { id, districtId: '11111111-1111-4111-8111-111111111111', teacher, institution, academicYear: '2026-2027',
  visitType: family === 'v1' ? visitType : null, scheduledStartAt: '2026-10-15T08:30:00Z', scheduledEndAt: '2026-10-15T09:30:00Z',
  actualStartAt: null, actualEndAt: null, intervalKind: 'SCHEDULED', occurredAt: '2026-10-15T09:30:00Z', status: 'COMPLETED', revision: 1 }; }
function report() {
  const base = { id: 'report-1', visitId: id, reportType: family === 'v1' ? 'INSPECTOR_VISIT' : 'PEDAGOGICAL_ACCOMPANIMENT',
    templateSource: family === 'v1' ? 'PRODUCT_OWNER_ADOPTED' : 'INSPECTOR_AUTHORED', templateVersion: 1, status: state, revision: 1,
    levelClass: 'السنة الرابعة', lessonTopic: 'التوازن والألعاب الجماعية', inspectorConclusion: narrative,
    pedagogicalObservations: narrative, strengths: narrative, improvementAreas: narrative, guidanceRecommendations: narrative,
    finalizedAt: state === 'FINAL' ? '2026-10-15T10:00:00Z' : null, finalizedInspectorNameSnapshot: 'مفتش', finalizedInspectorSurnameSnapshot: 'تجريبي',
    finalizedTeacherNameSnapshot: teacher.name, finalizedTeacherSurnameSnapshot: teacher.surname,
    displayIdentity: { inspector: { name: 'مفتش', surname: 'تجريبي' }, teacher }, visit: visit(),
    displayContext: { teacherBirthDate: '1990-01-01', teacherPlaceOfBirth: 'وهران', teacherQualifications: 'شهادة جامعية', districtName: 'مقاطعة النور', institutionMunicipality: 'بلدية النور', visitType },
  };
  return { ...base, inspectorVisitV1: { ...Object.fromEntries([
    'educationDirectorateText','administrativeDivisionText','teacherClassificationText','teacherGradeText','teacherNationalityText','teacherEffectiveDateText',
    'teacherLastInspectionText','teacherAppointmentText','teacherProfessionalFrameworkText','actualLessonDurationText','studentCount','studentsPresentCount',
    'studentsAbsentCount','lessonObjective','tenureConclusionText','generalAssessmentText','markText','markWordsText',
  ].map((key) => [key, null])), pedagogicalMark: visitType === 'PROMOTION_EVALUATION' ? mark : null,
    pedagogicalGuidanceText: narrative, practicalGuidanceText: narrative, visitStrengthsText: narrative, visitImprovementAreasText: narrative,
    observations: criteria.map(({ criterionKey }) => ({ criterionKey, valueText: 'ملاحظة نوعية يدوية موجزة دون تنقيط' })) } };
}
let context;
try {
  await server.listen();
  context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1440,1100'] });
  await context.addCookies([{ name: 'inspector_csrf', value: 'synthetic-only', url: 'http://127.0.0.1:5195' }]);
  await context.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname, method = route.request().method();
    const respond = (json, status = 200) => route.fulfill({ json, status });
    if (pathname === '/api/v1/auth/me') return respond({ data: { id: 'synthetic-inspector', email: 'qa@example.invalid' } });
    if (pathname === `/api/v1/visits/${id}`) {
      if (mode === 'loading') await new Promise((resolve) => { release = resolve; });
      if (mode === 'error') return respond({ error: { code: 'NOT_FOUND', message: 'غير متاح', requestId: 'synthetic' } }, 404);
      return respond({ data: { visit: visit() } });
    }
    if (pathname === `/api/v1/visits/${id}/report` && method === 'GET') return respond({ data: { report: report() } });
    if (pathname === '/api/v1/report-templates/inspector-visit/v1') return respond({ data: { criteria } });
    if (pathname === '/api/v1/reports/report-1/follow-ups' && method === 'GET') return respond({ data: [] });
    if (method === 'PUT' && pathname === `/api/v1/visits/${id}/inspector-visit-report`) {
      mutations.push('validation-only'); return respond({ error: { code: 'VALIDATION_ERROR', message: 'غير صالح', requestId: 'synthetic', fields: { 'inspectorVisitV1.pedagogicalMark': ['invalid'] } } }, 400);
    }
    unexpected.push(`${method} ${pathname}`); return route.abort();
  });
  const page = context.pages()[0]; page.on('pageerror', (error) => errors.push(error.message));
  const settings = await context.newPage(); await settings.goto('chrome://settings/appearance');
  const zoom = settings.locator('select').nth(1); await zoom.selectOption({ label: '100%' });
  const url = `http://127.0.0.1:5195/app/visits/${id}/report`;
  async function loaded(target = page) { await target.getByRole('textbox', { name: /خلاصة المفتش|الخلاصة — مطلوبة للإتمام/u }).waitFor(); }
  async function geometry(target = page) {
    assert.equal(await target.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    assert.equal(await target.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await target.locator('.report-page').evaluate((el) => getComputedStyle(el).direction), 'rtl');
    assert.equal(await target.locator('.report-field :is(input,textarea)').evaluateAll((fields) => fields.every((el) => el.labels.length > 0)), true);
  }
  for (const document of ['v1', 'accompaniment']) {
    family = document;
    for (const width of [1440, 1280, 768, 390]) {
      await page.setViewportSize({ width, height: 1100 }); await page.goto(url); await loaded(); await geometry();
      if (family === 'v1') assert(await page.locator('.v1-report-sections').evaluate((el) => parseFloat(getComputedStyle(el).paddingInlineStart)) >= 12);
      assert.equal(await page.getByText(institution.name, { exact: true }).count(), 1);
      assert.equal(await page.getByRole('link', { name: 'ملف الأستاذ', exact: true }).getAttribute('href'), `/app/teachers/${teacher.id}`);
      assert.equal(await page.getByRole('button', { name: 'إضافة إجراء متابعة', exact: true }).count(), 0);
      await page.screenshot({ path: join(output, `${document}-${width}.png`) });
      const prose = page.getByRole('textbox', { name: /خلاصة المفتش|الخلاصة — مطلوبة للإتمام/u }); await prose.scrollIntoViewIfNeeded();
      assert.equal(await prose.inputValue(), narrative); await prose.focus();
      assert.notEqual(await prose.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
      await page.screenshot({ path: join(output, `${document}-${width}-content.png`) });
      const save = page.getByRole('button', { name: 'حفظ المسودة', exact: true });
      await save.focus(); await save.press('Tab');
      assert.equal(await page.getByRole('button', { name: 'اعتماد التقرير النهائي', exact: true }).evaluate((el) => document.activeElement === el), true);
    }
    state = 'FINAL'; await page.goto(url); await loaded(); await geometry();
    await page.getByText('نهائي — للقراءة فقط', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).count(), 0);
    assert.equal(await page.locator('.report-field :is(input,textarea)').evaluateAll((fields) => fields.every((el) => el.readOnly)), true);
    await page.getByRole('button', { name: 'إضافة إجراء متابعة', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `${document}-final.png`) }); state = 'DRAFT';
    mode = 'error'; await page.goto(url); await page.getByText('تعذر تحميل التقرير', { exact: true }).waitFor();
    assert.equal(await page.locator('.report-field').count(), 0); await page.screenshot({ path: join(output, `${document}-error.png`) });
    mode = 'loading'; await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.getByText('جارٍ تحميل التقرير…', { exact: true }).waitFor();
    await page.screenshot({ path: join(output, `${document}-loading.png`) }); mode = 'normal'; release(); await loaded();
  }
  family = 'v1'; await page.setViewportSize({ width: 1280, height: 1100 });
  for (const type of ['GUIDANCE', 'TENURE_CONFIRMATION', 'PROMOTION_EVALUATION', 'MONITORING_FOLLOW_UP', 'EXCEPTIONAL']) {
    visitType = type; await page.goto(url); await loaded();
    const numeric = page.getByRole('textbox', { name: 'العلامة البيداغوجية (اختيارية من 0 إلى 20)', exact: true });
    assert.equal(await numeric.count(), type === 'PROMOTION_EVALUATION' ? 1 : 0); await geometry();
  }
  visitType = 'PROMOTION_EVALUATION'; mark = null; await page.goto(url); await loaded();
  const numeric = page.getByRole('textbox', { name: 'العلامة البيداغوجية (اختيارية من 0 إلى 20)', exact: true });
  assert.equal(await numeric.inputValue(), ''); await numeric.fill('14.257');
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click(); await page.getByText('القيمة غير صالحة.', { exact: true }).waitFor();
  assert.equal(await numeric.getAttribute('aria-invalid'), 'true'); await numeric.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(output, 'v1-validation.png') });
  const zoomPage = await context.newPage(); family = 'v1'; await zoomPage.goto(url); await loaded(zoomPage);
  const before = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth })); await zoom.selectOption({ label: '200%' });
  await zoomPage.waitForFunction((dpr) => devicePixelRatio > dpr * 1.9, before.dpr);
  for (const document of ['v1', 'accompaniment']) {
    family = document; await zoomPage.goto(url); await loaded(zoomPage); await geometry(zoomPage); await zoomPage.bringToFront();
    const after = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth })); assert(after.width < before.width * .6);
    for (const location of ['header', 'actions']) {
      if (location === 'actions') await zoomPage.getByRole('button', { name: 'حفظ المسودة', exact: true }).scrollIntoViewIfNeeded();
      const cdp = await context.newCDPSession(zoomPage); const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
      await writeFile(join(output, `${document}-zoom-200-${location}.png`), Buffer.from(shot.data, 'base64')); await cdp.detach();
    }
    console.log(`${document} REAL_CHROME_ZOOM_200 PASS ${JSON.stringify({ before, after })}`);
  }
  family = 'v1'; state = 'FINAL'; await zoomPage.goto(`${url}/print`);
  await zoomPage.getByRole('main', { name: 'نموذج تقرير زيارة معتمد للمنصة' }).waitFor();
  await zoomPage.emulateMedia({ media: 'print' });
  for (const selector of ['.app-sidebar', '.app-topbar', '.app-topbar__menu-button--mobile']) {
    assert.equal(await zoomPage.locator(selector).evaluate((el) => {
      for (let current = el; current; current = current.parentElement) if (getComputedStyle(current).display === 'none') return true;
      return false;
    }), true);
  }
  assert.equal(await zoomPage.locator('.visit-report-print__sheet').count(), 2);
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []); assert.deepEqual(mutations, ['validation-only']);
  console.log('BOTH_DOCUMENTS: 1440/1280/768/390; DRAFT/FINAL; RTL/labels/focus; long prose; loading/error; five types; optional mark + validation: PASS');
  console.log(`VISUAL_EVIDENCE: ${output}`);
} finally { release?.(); await context?.close(); await server.close(); }

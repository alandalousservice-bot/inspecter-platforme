// Synthetic presentation gate: intercept every API call; never touch UAT.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const require = createRequire(resolve('packages/web/package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const server = await createServer({ root: resolve('packages/web'), server: { host: '127.0.0.1', port: 5196, strictPort: true } });
const output = await mkdtemp(join(tmpdir(), 'g9-06-requests-'));
const profile = await mkdtemp(join(tmpdir(), 'g9-06-chrome-'));
const base = 'http://127.0.0.1:5196';
const identity = 'أستاذة ذات اسم عربي طويل بن عبد الرحمن لاختبار القراءة المتأنية';
const workplace = 'ابتدائية الشهيد ذات اسم طويل ومختلط École 2026 — بلدية النور';
let mode = 'normal', status = 'PENDING', candidateCount = 2, release;
const requests = [], unexpected = [], errors = [];
const administrative = Object.fromEntries(['birthProvince','professionalFramework','firstEducationAppointmentDate','firstEducationAppointmentDecisionNumber','firstInstallationDate','traineeshipDate','institutionAppointmentDate','institutionAppointmentNumber','administrativeCategory','administrativeSection','administrativeGrade','administrativeClassificationEffectiveDate','personalAddress'].map((key) => [key, null]));
function detail() { return { id: 'request-1', districtId: 'district-synthetic', status, submittedAt: '2026-10-01T09:30:00Z', acceptedTeacherId: status === 'ACCEPTED' ? 'teacher-result' : null,
  submittedProfile: { firstName: identity, lastName: 'بن صالح', dateOfBirth: '1990-03-04', placeOfBirth: 'وهران', phone: '+213555123456', email: 'qa@example.invalid', professionalStatus: 'SUBSTITUTE', employmentDate: '2015-09-01' },
  declaredAdministrative: administrative, declaredWorkplace: { institutionName: workplace, municipality: 'بلدية النور', institutionAddress: 'عنوان مصرح به', directorPhone: null, institutionEmail: null, legacyAdditionalInstitutionNames: [] },
  structuredQualifications: [], supplementaryWorkplaces: [], locationProposal: null,
  potentialDuplicates: Array.from({ length: candidateCount }, (_, index) => ({ id: `candidate-${index}`, firstName: identity, lastName: 'بن صالح', dateOfBirth: '1990-03-04', placeOfBirth: 'وهران', status: 'PENDING', submittedAt: '2026-09-30T09:30:00Z', matchReasons: ['SAME_NAME_AND_DOB'] })) }; }
let context;
try {
  await server.listen();
  context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1440,1100'] });
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()), method = route.request().method(); requests.push({ method, path: url.pathname, query: url.search });
    if (url.pathname === '/api/v1/auth/me') return route.fulfill({ json: { data: { id: 'inspector-synthetic', email: 'qa@example.invalid' } } });
    if (method !== 'GET' || !['/api/v1/submissions','/api/v1/submissions/request-1'].includes(url.pathname)) { unexpected.push(`${method} ${url.pathname}`); return route.abort(); }
    if (mode === 'loading') await new Promise((resolve) => { release = resolve; });
    if (mode === 'error') return route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'غير متاح', requestId: 'synthetic' } } });
    if (url.pathname.endsWith('/request-1')) return route.fulfill({ json: { data: detail() } });
    const rows = mode === 'empty' ? [] : Array.from({ length: url.searchParams.has('cursor') ? 1 : 8 }, (_, index) => ({ id: `request-${index + 1}`, firstName: identity, lastName: `بن صالح ${index + 1}`, dateOfBirth: '1990-03-04', primaryInstitutionName: workplace, submittedAt: '2026-10-01T09:30:00Z', status: url.searchParams.get('status') ?? 'PENDING', hasPotentialDuplicates: index === 0 }));
    return route.fulfill({ json: { data: rows, page: { limit: 25, total: mode === 'empty' ? 0 : 26, nextCursor: !url.searchParams.has('cursor') && mode !== 'empty' ? 'synthetic-next' : null } } });
  });
  const page = context.pages()[0]; page.on('pageerror', (error) => errors.push(error.message));
  const settings = await context.newPage(); await settings.goto('chrome://settings/appearance');
  const zoom = settings.locator('select').nth(1); await zoom.selectOption({ label: '100%' });
  async function loaded(target, kind) { await target.getByRole('heading', { level: 1 }).waitFor(); await target.locator(kind === 'list' ? '.submission-review-table' : '.submission-review-context').waitFor(); }
  async function geometry(target) {
    assert.equal(await target.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    assert.equal(await target.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await target.locator('.submissions-page,.submission-detail-page').evaluate((el) => getComputedStyle(el).direction), 'rtl');
  }
  for (const kind of ['list','detail']) {
    for (const width of [1440,1280,768,390]) {
      await page.setViewportSize({ width, height: 1100 }); await page.goto(`${base}/app/submissions${kind === 'detail' ? '/request-1' : ''}`); await loaded(page,kind); await geometry(page);
      if (kind === 'list') {
        assert.equal(await page.getByRole('table', { name: 'طلبات الأساتذة' }).count(), 1);
        assert.equal(await page.locator('tbody tr').count(), 8);
        const link = page.getByRole('link', { name: `مراجعة طلب ${identity} بن صالح 1`, exact: true }); await link.focus();
        assert.notEqual(await link.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
      } else {
        assert.equal(await page.getByRole('link', { name: 'فتح ملف الأستاذ' }).count(), 0);
        await page.getByRole('button', { name: 'قبول الطلب', exact: true }).scrollIntoViewIfNeeded();
        await page.getByRole('button', { name: 'قبول الطلب', exact: true }).click();
        await page.getByRole('dialog').waitFor(); await geometry(page);
        await page.screenshot({ path: join(output, `detail-${width}-confirmation.png`) });
        await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(),0);
        assert.equal(await page.getByRole('button', { name: 'قبول الطلب', exact: true }).evaluate((el) => document.activeElement === el), true);
        await page.screenshot({ path: join(output, `detail-${width}-decision.png`) });
        await page.evaluate(() => scrollTo(0,0));
      }
      await page.screenshot({ path: join(output, `${kind}-${width}.png`) });
    }
  }
  await page.goto(`${base}/app/submissions`); await loaded(page,'list');
  await page.getByRole('textbox', { name: 'البحث في الطلبات' }).fill('أمينة');
  await page.getByRole('combobox', { name: 'حالة الطلب' }).selectOption('INTERNAL_REVIEW');
  await page.getByRole('button', { name: 'تطبيق', exact: true }).click(); await page.waitForURL(/status=INTERNAL_REVIEW/);
  await page.getByRole('button', { name: 'التالي', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  assert(requests.some(({ query }) => query.includes('cursor=synthetic-next') && query.includes('status=INTERNAL_REVIEW') && query.includes('q=')));
  assert.equal(requests.filter(({ path }) => /candidate-/u.test(path)).length,0);
  for (const kind of ['list','detail']) {
    const url = `${base}/app/submissions${kind === 'detail' ? '/request-1' : ''}`;
    mode = 'error'; await page.goto(url); await page.getByRole('alert').waitFor(); await geometry(page);
    await page.screenshot({ path: join(output, `${kind}-error.png`) });
    if (kind === 'list') { assert.equal(await page.getByText('إجمالي النتائج: غير متاح').count(),1); mode = 'normal'; await page.getByRole('button', { name: 'إعادة المحاولة' }).click(); await loaded(page,kind); }
    mode = 'loading'; await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.getByText(kind === 'list' ? 'جارٍ تحميل الطلبات…' : 'جارٍ تحميل تفاصيل الطلب…', { exact: true }).waitFor();
    await page.screenshot({ path: join(output, `${kind}-loading.png`) }); mode = 'normal'; release(); await loaded(page,kind);
  }
  mode = 'empty';
  for (const suffix of ['', '?q=غيرموجود']) { await page.goto(`${base}/app/submissions${suffix}`); await page.getByRole('heading', { name: suffix ? 'لا توجد نتائج مطابقة' : 'لا توجد طلبات في هذه الحالة' }).waitFor(); await page.screenshot({ path: join(output, suffix ? 'filtered-empty.png' : 'empty.png') }); }
  mode = 'normal';
  for (const current of ['ACCEPTED','REJECTED','INTERNAL_REVIEW']) {
    status = current; await page.goto(`${base}/app/submissions/request-1`); await loaded(page,'detail');
    assert.equal(await page.getByRole('button', { name: 'قبول الطلب', exact: true }).count(), current === 'INTERNAL_REVIEW' ? 1 : 0);
    assert.equal(await page.getByRole('button', { name: 'رفض الطلب', exact: true }).count(), current === 'INTERNAL_REVIEW' ? 1 : 0);
    assert.equal(await page.getByRole('link', { name: 'فتح ملف الأستاذ' }).count(), current === 'ACCEPTED' ? 1 : 0);
    await page.screenshot({ path: join(output, `detail-${current}.png`) });
  }
  status = 'PENDING';
  for (const count of [0,1,2]) { candidateCount = count; await page.goto(`${base}/app/submissions/request-1`); await loaded(page,'detail'); await page.getByRole('heading', { name: 'طلبات مشابهة محتملة', exact: true }).scrollIntoViewIfNeeded(); assert.equal(await page.locator('.submission-candidate-list > li').count(),count); await page.screenshot({ path: join(output, `advisory-${count}.png`) }); }
  const zoomPage = await context.newPage(); await zoomPage.goto(`${base}/app/submissions`); await loaded(zoomPage,'list');
  const before = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth })); await zoom.selectOption({ label: '200%' });
  await zoomPage.waitForFunction((dpr) => devicePixelRatio > dpr * 1.9,before.dpr);
  for (const kind of ['list','detail']) {
    await zoomPage.goto(`${base}/app/submissions${kind === 'detail' ? '/request-1' : ''}`); await loaded(zoomPage,kind); await geometry(zoomPage); await zoomPage.bringToFront();
    const after = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth })); assert(after.width < before.width * .6);
    const cdp = await context.newCDPSession(zoomPage);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
    await writeFile(join(output, `${kind}-zoom-200.png`), Buffer.from(shot.data,'base64')); await cdp.detach();
    if (kind === 'detail') {
      const accept = zoomPage.getByRole('button', { name: 'قبول الطلب', exact: true });
      await accept.scrollIntoViewIfNeeded();
      for (const name of ['قبول الطلب','رفض الطلب','إحالة إلى المراجعة الداخلية']) {
        const rect = await zoomPage.getByRole('button', { name, exact: true }).boundingBox();
        assert(rect && rect.x >= 0 && rect.x + rect.width <= after.width);
      }
      const actionsCdp = await context.newCDPSession(zoomPage);
      const actionsShot = await actionsCdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
      await writeFile(join(output, 'detail-zoom-200-actions.png'), Buffer.from(actionsShot.data,'base64')); await actionsCdp.detach();
    }
    console.log(`${kind} REAL_CHROME_ZOOM_200 PASS ${JSON.stringify({ before, after })}`);
  }
  assert.deepEqual(unexpected,[]); assert.deepEqual(errors,[]);
  assert(requests.every(({ method }) => method === 'GET'));
  console.log('REQUESTS: responsive/RTL/focus/confirmation; loading/empty/filtered-empty/error/retry; server filters/cursor; pending/accepted/rejected/internal-review; advisory 0/1/2; no automatic mutations: PASS');
  console.log(`VISUAL_EVIDENCE: ${output}`);
} finally { release?.(); await context?.close(); await server.close(); }

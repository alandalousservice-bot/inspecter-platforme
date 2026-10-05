// Bounded presentation gate: synthetic intercepted API only; no persistent DB/UAT writes.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const require = createRequire(resolve('packages/web/package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const server = await createServer({ root: resolve('packages/web'), server: { host: '127.0.0.1', port: 5194, strictPort: true } });
const output = await mkdtemp(join(tmpdir(), 'g9-04-dossier-'));
const browserProfile = await mkdtemp(join(tmpdir(), 'g9-04-chrome-'));
const teacherId = '11111111-1111-4111-8111-111111111111', districtId = '22222222-2222-4222-8222-222222222222';
const institution = { id: '33333333-3333-4333-8333-333333333333', name: 'ابتدائية المؤسسة الحالية المعتمدة ذات اسم طويل لاختبار القراءة والتفاف النص', municipality: 'بلدية النخيل', address: 'عنوان المؤسسة الحالية', directorPhone: '+21321234567' };
let profile = {
  id: teacherId, districtId, name: 'أستاذ ذو اسم عربي طويل لاختبار ترتيب هوية الملف', surname: 'بن عبد الرحمن',
  professionalStatus: 'SUBSTITUTE', recordStatus: 'ACTIVE', currentInstitution: institution,
  birthDate: '1985-03-04', placeOfBirth: 'وهران', birthProvince: 'ولاية وهران', phone: '+213555123456', email: 'synthetic-inspector-qa@example.invalid',
  employedAt: '2010-09-01', confirmedAt: null, qualifications: 'معلومات مؤهلات تاريخية منفصلة', professionalFramework: 'إطار مهني مدخل يدويًا',
  firstEducationAppointmentDate: '2010-09-01', firstEducationAppointmentDecisionNumber: 'قرار تعيين 12/2010', firstInstallationDate: '2010-09-05', traineeshipDate: null,
  institutionAppointmentDate: '2020-09-01', institutionAppointmentNumber: 'قرار 20/2020', financialControllerVisaNumber: 'تأشيرة 12',
  administrativeCategory: 'صنف مسجل', administrativeSection: 'شعبة مسجلة', administrativeGrade: 'رتبة مسجلة', administrativeClassificationEffectiveDate: '2020-01-01',
  personalAddress: 'عنوان شخصي اصطناعي', administrativeNote: 'ملاحظة خاصة بالمفتش لا تدخل في الطباعة. '.repeat(15).trim(), archivedAt: null, createdAt: '', updatedAt: '',
  declaredInstitutions: { primaryInstitutionName: 'ابتدائية مصرح بها غير معتمدة', additionalInstitutionNames: ['اسم تاريخي إضافي'] },
  declaredWorkplace: { institutionName: 'ابتدائية مصرح بها غير معتمدة', municipality: 'بلدية معلنة', institutionAddress: 'عنوان معلن غير معتمد', directorPhone: '+21321234567', legacyAdditionalInstitutionNames: ['اسم تاريخي إضافي'] },
};
const qualifications = [
  { id: 'q1', name: 'شهادة في التربية البدنية والرياضية', issuingBody: 'معهد اصطناعي', qualificationDate: '2010-01-01', createdAt: '', updatedAt: '' },
  { id: 'q2', name: 'شهادة ثانية مستقلة لا تُرتَّب ولا تُدمج', issuingBody: null, qualificationDate: null, createdAt: '', updatedAt: '' },
];
const workplaces = [
  { id: 'w1', institution: { id: 'i1', name: 'ابتدائية تكملة النصاب الحالية', municipality: 'بلدية التكملة', archivedAt: null }, validFrom: '2020-01-01', validTo: null, isCurrent: true, createdAt: '', updatedAt: '' },
  { id: 'w2', institution: { id: 'i2', name: 'ابتدائية تكملة تاريخية مغلقة', municipality: null, archivedAt: null }, validFrom: '2020-01-01', validTo: '2021-01-01', isCurrent: false, createdAt: '', updatedAt: '' },
  { id: 'w3', institution: { id: 'i3', name: 'ابتدائية تكملة مستقبلية', municipality: null, archivedAt: null }, validFrom: '2099-01-01', validTo: null, isCurrent: false, createdAt: '', updatedAt: '' },
];
let context, mode = 'normal', releaseLoading;
const requests = [], unexpected = [], errors = [], mutations = [];
try {
  await server.listen();
  context = await chromium.launchPersistentContext(browserProfile, { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1440,1100'] });
  await context.addCookies([{ name: 'inspector_csrf', value: 'synthetic-qa-only', url: 'http://127.0.0.1:5194' }]);
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()), method = route.request().method();
    requests.push(`${method} ${url.pathname}`);
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/v1/auth/me' && method === 'GET') return respond({ data: { id: districtId, email: 'visual-qa@example.invalid' } });
    if (url.pathname === `/api/v1/teachers/${teacherId}` && method === 'GET') {
      if (mode === 'loading') await new Promise((resolve) => { releaseLoading = resolve; });
      if (mode === 'error') return respond({ error: { code: 'NOT_FOUND', message: 'غير متاح', requestId: 'synthetic' } }, 404);
      return respond({ data: profile });
    }
    if (url.pathname === `/api/v1/teachers/${teacherId}/qualifications` && method === 'GET') return respond({ items: qualifications });
    if (url.pathname === `/api/v1/teachers/${teacherId}/supplementary-workplaces` && method === 'GET') return respond({ items: workplaces });
    if (url.pathname === `/api/v1/teachers/${teacherId}` && method === 'PATCH') {
      const patch = route.request().postDataJSON(); mutations.push(patch); profile = { ...profile, ...patch }; return respond({ data: profile });
    }
    unexpected.push(`${method} ${url.pathname}`); return route.abort();
  });
  const page = context.pages()[0]; page.on('pageerror', (error) => errors.push(error.message));
  const settings = await context.newPage(); await settings.goto('chrome://settings/appearance');
  const zoom = settings.locator('select').nth(1); await zoom.selectOption({ label: '100%' });
  const url = `http://127.0.0.1:5194/app/teachers/${teacherId}`;
  async function geometry() {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    assert.equal(await page.locator('.teacher-dossier').evaluate((el) => getComputedStyle(el).direction), 'rtl');
  }
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1100 }); await page.goto(url);
    await page.getByRole('heading', { name: qualifications[1].name }).waitFor();
    await page.getByText(workplaces[0].institution.name, { exact: true }).waitFor();
    const identity = page.getByRole('region', { name: 'الوضعية الحالية للأستاذ' });
    assert((await identity.textContent()).includes('مستخلف'));
    assert((await identity.textContent()).includes(institution.municipality));
    const nav = page.getByRole('navigation', { name: 'مساحات الإشراف على الأستاذ' });
    assert.equal(await nav.getByRole('link', { name: 'زيارات الأستاذ' }).getAttribute('href'), `/app/visits?teacherId=${teacherId}&districtId=${districtId}`);
    assert.equal(await nav.getByRole('link', { name: 'التوزيع الأسبوعي' }).getAttribute('href'), `/app/teachers/${teacherId}/schedules`);
    assert.equal(await nav.getByRole('link', { name: 'بطاقة معلومات الأستاذ' }).getAttribute('href'), `/app/teachers/${teacherId}/information-card`);
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await page.locator('.teacher-profile__sections > details[open]').count(), 0);
    const box = await identity.boundingBox(); assert(box.y + box.height < 650);
    await geometry(); await page.screenshot({ path: join(output, `${width}.png`) });
    const disclosures = page.locator('.teacher-profile__sections > details');
    for (let i = 0; i < await disclosures.count(); i++) {
      const summary = disclosures.nth(i).locator('summary'); await summary.focus(); await summary.press('Enter');
      assert.equal(await disclosures.nth(i).evaluate((el) => el.open), true);
      assert.notEqual(await summary.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
    }
    await page.locator('.teacher-dossier__private').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.teacher-dossier__private dd').textContent(), profile.administrativeNote);
    await geometry(); await page.screenshot({ path: join(output, `${width}-secondary.png`) });
    await page.getByText('علاقات تكملة النصاب السابقة (1)', { exact: true }).click();
    await page.getByText(workplaces[1].institution.name, { exact: true }).waitFor();
    assert.equal(await page.getByText(workplaces[1].institution.name, { exact: true }).isVisible(), true);
    console.log(`RESPONSIVE_${width}: PASS`);
  }
  for (const [status, label] of [['PERMANENT', 'مرسم'], ['TRAINEE', 'متربص'], ['CONTRACT', 'متعاقد'], ['TEMPORARY_CONTRACT', 'متعاقد مؤقت'], ['SUBSTITUTE', 'مستخلف']]) {
    profile.professionalStatus = status; profile.recordStatus = status === 'CONTRACT' ? 'INACTIVE' : 'ACTIVE';
    await page.goto(url); const identity = page.getByRole('region', { name: 'الوضعية الحالية للأستاذ' }); await identity.waitFor();
    assert((await identity.textContent()).includes(`الصفة المهنية: ${label}`));
  }
  profile.currentInstitution = null; await page.goto(url); await page.getByRole('button', { name: 'اعتماد المؤسسة', exact: true }).waitFor();
  assert(!(await page.getByRole('region', { name: 'الوضعية الحالية للأستاذ' }).textContent()).includes(profile.declaredWorkplace.institutionName));
  await page.screenshot({ path: join(output, 'unassigned.png') }); profile.currentInstitution = institution;
  mode = 'error'; await page.goto(url); await page.getByRole('heading', { name: 'تعذر عرض ملف الأستاذ' }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'الوضعية الحالية للأستاذ' }).count(), 0); await page.screenshot({ path: join(output, 'error.png') });
  mode = 'normal'; await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click(); await page.getByRole('region', { name: 'الوضعية الحالية للأستاذ' }).waitFor();
  mode = 'loading'; await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByText('جارٍ تحميل ملف الأستاذ…', { exact: true }).waitFor(); await page.screenshot({ path: join(output, 'loading.png') });
  mode = 'normal'; releaseLoading(); await page.getByRole('button', { name: 'تعديل الملف', exact: true }).waitFor();
  await page.getByRole('button', { name: 'تعديل الملف', exact: true }).click();
  await page.getByRole('textbox', { name: 'اللقب', exact: true }).fill('اسم معدل اصطناعي');
  await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click(); await page.getByRole('heading', { name: 'تم حفظ الملف بنجاح.' }).waitFor();
  assert.deepEqual(mutations, [{ surname: 'اسم معدل اصطناعي' }]);
  const zoomPage = await context.newPage(); await zoomPage.goto(url); await zoomPage.getByRole('region', { name: 'الوضعية الحالية للأستاذ' }).waitFor();
  const before = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth })); await zoom.selectOption({ label: '200%' });
  await zoomPage.waitForFunction((dpr) => devicePixelRatio > dpr * 1.9, before.dpr); await zoomPage.bringToFront();
  const after = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  assert.equal(after.overflow, false); assert(after.width < before.width * .6);
  const cdp = await context.newCDPSession(zoomPage); const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
  await writeFile(join(output, 'zoom-200.png'), Buffer.from(shot.data, 'base64')); await cdp.detach();
  await zoomPage.getByRole('navigation', { name: 'مساحات الإشراف على الأستاذ' }).scrollIntoViewIfNeeded();
  const second = await context.newCDPSession(zoomPage); const image = await second.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
  await writeFile(join(output, 'zoom-200-navigation.png'), Buffer.from(image.data, 'base64')); await second.detach();
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  assert(requests.every((r) => r.includes('/auth/me') || r.includes(`/teachers/${teacherId}`)));
  console.log(`ZOOM_200: PASS ${before.dpr}->${after.dpr}; ${before.width}->${after.width}`);
  console.log('IDENTITY_STATUS_WORKPLACE_DISCLOSURES_PRIVATE_NOTE_NAVIGATION_STATES_EDIT_PRESERVATION: PASS');
  console.log(`VISUAL_EVIDENCE: ${output}`);
} finally { releaseLoading?.(); await context?.close(); await server.close(); }

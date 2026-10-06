import { test, expect, chromium } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';

test('connected Inspector invitation -> Teacher portal -> proposal review -> schedule correction, with responsive/RTL checks', async ({ browser, page }) => {
  test.setTimeout(240000);
  const captureMatrix = async (target: typeof page, name: string) => {
    for (const width of [1440,1280,768,390]) {
      await target.setViewportSize({ width, height: 900 });
      await expect(target.getByRole('main')).toBeVisible();
      await expect(target.getByRole('main')).toHaveCount(1); await expect(target.getByRole('heading', { level: 1 })).toHaveCount(1);
      expect(await target.locator('html').getAttribute('dir')).toBe('rtl');
      await expect.poll(() => target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      // Start from a known visible control, not the prior viewport's last tab stop.
      await target.getByRole('main').locator('button:visible, a[href]:visible, input:visible, select:visible').first().focus();
      await target.keyboard.press('Tab');
      await expect.poll(() => target.evaluate(() => document.activeElement !== document.body && document.activeElement?.matches(':focus-visible'))).toBe(true);
      await target.screenshot({ path: `.cache/product-evolution-qa/${name}-${width}.png`, fullPage: true });
    }
  };
  const teacherId = process.env.EVOLUTION_TEACHER_ID!; const password = process.env.EVOLUTION_PASSWORD!;
  // Keep synthetic HOME validity prospective across midnight; never relax the API's date contract.
  const validFrom = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date(Date.now() + 86_400_000));
  await page.goto('/login'); await page.getByLabel('البريد الإلكتروني').fill(process.env.EVOLUTION_INSPECTOR_EMAIL!);
  await page.getByLabel('كلمة المرور').fill(password); await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:\?|$)/u);
  await page.goto(`/app/teachers/${teacherId}`); await page.getByText('حساب الأستاذ — دعوة مقيدة بالملف', { exact: true }).click();
  await page.getByLabel('بريد تسجيل دخول الحساب').fill('teacher-browser@example.invalid');
  await page.getByRole('checkbox', { name: 'تحققت من الهوية وقناة التسليم الخاصة بالأستاذ' }).check();
  await page.getByRole('button', { name: 'إصدار دعوة', exact: true }).click();
  const activation = await page.getByLabel('رابط التفعيل — لا تحفظه في ملفات المشروع').inputValue();
  const teacherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const own = await teacherContext.newPage();
  try {
    await own.goto(activation); await expect(own).not.toHaveURL(/#/u);
    await own.getByLabel('كلمة المرور').fill(password); await own.getByRole('button', { name: 'تفعيل الحساب' }).click();
    await expect(own.getByText('تم تفعيل الحساب. سجّل الدخول بالبريد المحدد في الدعوة.')).toBeVisible();
    await own.getByLabel('البريد الإلكتروني للحساب').fill('teacher-browser@example.invalid'); await own.getByLabel('كلمة المرور').fill(password);
    await own.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click(); await expect(own).toHaveURL(/\/teacher$/u);
    await expect(own.getByRole('heading', { name: 'أستاذ المساحة المهنية' })).toBeVisible();
    await expect(own.getByRole('navigation', { name: 'إدارة العمل' })).toHaveCount(0);
    await own.getByLabel('الصورة الشخصية — PNG / JPEG، حتى 2 ميغابايت').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(process.env.EVOLUTION_PHOTO_BASE64!, 'base64') });
    await expect(own.getByText('تم تحديث الصورة الشخصية.')).toBeVisible();
    await expect(own.locator('.teacher-avatar img')).toBeVisible();
    await own.getByRole('button', { name: 'الطلبات والتحديثات' }).click(); await own.getByLabel('البريد المقترح').fill('contact-browser@example.invalid');
    await own.getByRole('button', { name: 'إرسال للمراجعة' }).click(); await expect(own.getByText(/تم إرسال التصريح للمفتش/u)).toBeVisible();
    await page.goto('/app/teacher-requests?kind=CONTACT'); await expect(page.getByText('contact-browser@example.invalid')).toBeVisible();
    await page.getByRole('button', { name: 'اعتماد القرار' }).click(); await page.getByRole('button', { name: 'تأكيد القرار' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await own.reload(); await expect(own.getByText('contact-browser@example.invalid')).toBeVisible();
    await own.getByRole('button', { name: 'الطلبات والتحديثات' }).click(); await own.getByLabel('نوع الطلب').selectOption('TRAINING');
    await own.getByLabel('حالة التكوين المصرح بها').selectOption('COMPLETED'); await own.getByRole('button', { name: 'إرسال للمراجعة' }).click();
    await expect(own.getByText(/تم إرسال التصريح للمفتش/u)).toBeVisible();
    await page.goto('/app/teacher-requests?kind=TRAINING'); await expect(page.getByRole('button', { name: 'اعتماد القرار' })).toBeDisabled();
    await own.getByLabel('نوع الطلب').selectOption('TRANSFER'); await own.getByLabel('المقاطعة المقصودة').selectOption(process.env.EVOLUTION_DESTINATION_ID!);
    await own.getByLabel('سبب طلب الانتقال').fill('طلب تجريبي لا ينقل الملكية'); await own.getByRole('button', { name: 'إرسال للمراجعة' }).click();
    await expect(own.getByText(/تم إرسال التصريح للمفتش/u)).toBeVisible();
    await page.goto('/app/teacher-requests?kind=TRANSFER'); await page.getByRole('button', { name: 'اعتماد القرار' }).click(); await page.getByRole('button', { name: 'تأكيد القرار' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible(); await own.reload(); await expect(own.getByText('مقاطعة اختبار معزول', { exact: true }).first()).toBeVisible();
    await own.getByRole('button', { name: 'التوزيع الأسبوعي', exact: true }).click(); await own.getByLabel('السنة الدراسية').fill('2026-2027');
    await own.getByRole('button', { name: 'عرض التوزيع' }).click(); await own.getByLabel('المؤسسة المعتمدة', { exact: true }).selectOption(process.env.EVOLUTION_INSTITUTION_ID!);
    await own.getByLabel('بداية الحصة').fill('08:00'); await own.getByLabel('نهاية الحصة').fill('09:00'); await own.getByLabel('سارية من').fill(validFrom);
    await own.getByRole('button', { name: 'إضافة إلى المسودة' }).click(); await own.getByRole('button', { name: 'تسجيل التوزيع الأولي' }).click();
    await expect(own.getByText('تم تسجيل التوزيع الأولي.')).toBeVisible();
    await page.goto(`/app/teachers/${teacherId}/schedules?academicYear=2026-2027`); await page.getByRole('button', { name: 'عرض التوزيع' }).click();
    await page.getByLabel('التصحيح المطلوب من الأستاذ').fill('راجع موعد الاثنين'); await page.getByRole('button', { name: 'طلب تصحيح' }).click();
    await expect(page.getByText('تم تسجيل الإجراء.')).toBeVisible(); await own.reload(); await expect(own.getByText('راجع موعد الاثنين')).toBeVisible();
    for (const width of [1440, 1280, 768, 390]) {
      await own.setViewportSize({ width, height: 900 }); await page.setViewportSize({ width, height: 900 });
      await expect(own.getByRole('heading', { name: 'أستاذ المساحة المهنية' })).toBeVisible();
      expect(await own.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await own.getByRole('main').getAttribute('dir')).toBe('rtl');
    }
    await own.getByRole('button', { name: 'فتح التوزيع الأسبوعي' }).click(); await own.getByLabel('السنة الدراسية').fill('2026-2027'); await own.getByRole('button', { name: 'عرض التوزيع' }).click();
    await own.getByRole('button', { name: 'إرسال التصحيح للمراجعة' }).click(); await expect(own.getByText('تم إرسال التصحيح للمفتش. يبقى الجدول السابق ساريًا حتى الاعتماد.')).toBeVisible();
    await page.getByRole('button', { name: 'عرض التوزيع' }).click(); await page.getByRole('button', { name: 'اعتماد التصحيح', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تأكيد اعتماد التصحيح' })).toBeFocused(); await page.getByRole('button', { name: 'تأكيد اعتماد التصحيح' }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    // Independent proposal, explicit rejection/reason, and a fresh accepted update.
    await own.reload(); await own.getByRole('button', { name: 'التوزيع الأسبوعي', exact: true }).click();
    await own.getByLabel('السنة الدراسية').fill('2026-2027'); await own.getByRole('button', { name: 'عرض التوزيع' }).click();
    await own.getByRole('button', { name: 'إرسال التحديث للمراجعة' }).click();
    await expect(own.getByText('تم إرسال التحديث للمراجعة. يبقى الجدول الساري دون تغيير حتى الاعتماد.')).toBeVisible();
    await expect(own.getByRole('heading', { name: 'المقترح المرسل — غير ساري بعد' })).toBeVisible();
    await captureMatrix(own, 'teacher-pending');
    await page.getByRole('button', { name: 'عرض التوزيع' }).click();
    await expect(page.getByRole('button', { name: 'اعتماد التحديث' })).toBeVisible();
    await captureMatrix(page, 'inspector-review');
    await page.getByRole('button', { name: 'رفض المقترح' }).click();
    await expect(page.getByRole('button', { name: 'تأكيد رفض المقترح' })).toBeDisabled();
    await page.getByLabel('سبب رفض المقترح').fill('راجع موعد الحصة ثم أرسل نسخة جديدة');
    await page.getByRole('button', { name: 'تأكيد رفض المقترح' }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    await own.getByRole('button', { name: 'عرض التوزيع' }).click();
    await expect(own.getByText('راجع موعد الحصة ثم أرسل نسخة جديدة')).toBeVisible();
    await captureMatrix(own, 'teacher-rejected');
    await own.getByRole('button', { name: 'حذف حصة الاثنين 08:00' }).click();
    await own.getByLabel('المؤسسة المعتمدة', { exact: true }).selectOption(process.env.EVOLUTION_INSTITUTION_ID!);
    await own.getByLabel('بداية الحصة').fill('12:00'); await own.getByLabel('نهاية الحصة').fill('13:00'); await own.getByLabel('سارية من').fill(validFrom);
    await own.getByRole('button', { name: 'إضافة إلى المسودة' }).click(); await own.getByRole('button', { name: 'إرسال التحديث للمراجعة' }).click();
    await expect(own.getByText('08:00 — 09:00')).toBeVisible();
    await page.getByRole('button', { name: 'عرض التوزيع' }).click(); await page.getByRole('button', { name: 'اعتماد التحديث', exact: true }).click();
    await page.getByRole('button', { name: 'تأكيد اعتماد التحديث' }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    await own.getByRole('button', { name: 'عرض التوزيع' }).click(); await expect(own.getByText('12:00 — 13:00').first()).toBeVisible();
    await captureMatrix(own, 'teacher-schedule');
    await own.getByRole('button', { name: 'بياناتي وأماكن العمل' }).click(); await captureMatrix(own, 'teacher-portal');
    await page.goto(`/app/teachers/${teacherId}`); await expect(page.getByText('حساب الأستاذ — دعوة مقيدة بالملف', { exact: true })).toBeVisible(); await captureMatrix(page, 'inspector-dossier');
    await page.goto('/app'); await expect(page.getByRole('heading', { name: 'لوحة المتابعة', exact: true })).toBeVisible(); await captureMatrix(page, 'dashboard');
    await page.goto('/app/teachers'); await expect(page.getByText('206', { exact: false }).first()).toBeVisible();
    expect(await page.locator('.teacher-directory__card').count()).toBe(25);
    for (const width of [1440, 1280, 768, 390]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); await page.screenshot({ path: `.cache/product-evolution-qa/directory-${width}.png`, fullPage: true }); }
    await page.getByLabel('البحث عن أستاذ', { exact: true }).fill('باسم عربي طويل');
    await expect(page).toHaveURL(/q=/u);
    await expect(page.getByText('أستاذ تجريبي باسم عربي طويل للتحقق من وضوح الهوية دون اقتطاع ملف الإشراف والتكوين والمرافقة البيداغوجية', { exact: true })).toBeVisible();
    await captureMatrix(page, 'directory-long-name');
    await page.goto('/app/institutions'); await page.getByText('المقاطعة والبلدية — تنقل جغرافي', { exact: true }).click();
    await page.getByLabel('المقاطعة', { exact: true }).selectOption(process.env.EVOLUTION_DESTINATION_ID!); await expect(page.getByLabel('البلدية', { exact: true }).locator('option')).toHaveCount(1);
    await page.getByLabel('المقاطعة', { exact: true }).selectOption({ label: 'مقاطعة اختبار معزول' }); await page.getByLabel('البلدية', { exact: true }).selectOption('بلدية اختبار معزول');
    await captureMatrix(page, 'institutions-hierarchy');
    await page.getByRole('link', { name: 'ابتدائية الاختبار المعزول', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/app/institutions/${process.env.EVOLUTION_INSTITUTION_ID}`));
    await expect(page.locator('.teacher-directory__card')).toHaveCount(25);
    await own.getByRole('button', { name: 'بياناتي وأماكن العمل' }).click(); await own.screenshot({ path: '.cache/product-evolution-qa/teacher-390.png', fullPage: true });
    await own.getByRole('button', { name: 'التوزيع الأسبوعي', exact: true }).click(); await own.getByLabel('السنة الدراسية').fill('2030-2031'); await own.getByRole('button', { name: 'عرض التوزيع' }).click();
    await expect(own.getByText('لا يوجد توزيع لهذه السنة بعد')).toBeVisible(); await own.screenshot({ path: '.cache/product-evolution-qa/schedule-empty.png', fullPage: true });
    let releaseLoading!: () => void;
    const pendingResponse = new Promise<void>(resolve => { releaseLoading = resolve; });
    await own.route('**/api/v1/teacher/schedules?**', async route => { await pendingResponse; await route.continue(); });
    await own.getByRole('button', { name: 'عرض التوزيع' }).click();
    await expect(own.getByText('جارٍ التحميل', { exact: true })).toBeVisible();
    await own.screenshot({ path: '.cache/product-evolution-qa/schedule-loading.png', fullPage: true });
    releaseLoading(); await expect(own.getByText('لا يوجد توزيع لهذه السنة بعد')).toBeVisible(); await own.unroute('**/api/v1/teacher/schedules?**');
    await own.route('**/api/v1/teacher/schedules?**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'تعذر تحميل التوزيع مؤقتًا', requestId: 'synthetic' } }) }));
    await own.getByRole('button', { name: 'عرض التوزيع' }).click(); await expect(own.getByText('تعذر إكمال العملية. تحقق من البيانات والاتصال ثم أعد المحاولة.')).toBeVisible();
    await expect(own.getByText('synthetic', { exact: true })).toHaveCount(0);
    await own.screenshot({ path: '.cache/product-evolution-qa/schedule-error.png', fullPage: true }); await own.unroute('**/api/v1/teacher/schedules?**');
    await own.getByRole('button', { name: 'تسجيل الخروج' }).click(); await expect(own).toHaveURL(/\/teacher\/login$/u);
  } finally { await teacherContext.close(); }
});

test('real browser 200% zoom, RTL and keyboard/reduced-motion QA in a disposable browser profile', async () => {
  // The required branded Chrome is not substituted with Edge or CSS/emulated zoom.
  // Empty userDataDir creates a disposable profile, not the operator's installed-browser profile.
  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, baseURL: test.info().project.use.baseURL, viewport: null, deviceScaleFactor: undefined, reducedMotion: 'reduce', args: ['--window-size=1440,1000'] });
  try {
    const settings = await context.newPage(); await settings.goto('chrome://settings/appearance');
    const zoomControl = settings.locator('select').nth(1); await zoomControl.selectOption({ label: '100%' });
    const page = await context.newPage();
    await page.goto('/login'); await page.getByLabel('البريد الإلكتروني').fill(process.env.EVOLUTION_INSPECTOR_EMAIL!); await page.getByLabel('كلمة المرور').fill(process.env.EVOLUTION_PASSWORD!); await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click(); await expect(page).toHaveURL(/\/app$/u);
    const baseline = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
    await zoomControl.selectOption({ label: '200%' }); await page.reload();
    const enlarged = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
    expect(baseline.width / enlarged.width).toBeCloseTo(2,1); expect(enlarged.dpr / baseline.dpr).toBeCloseTo(2,1);
    console.log('CHROME_NATIVE_ZOOM_200: PASS', JSON.stringify({ baseline, enlarged }));
    const capture = async (path: string) => {
      // Capture the actual browser viewport: Playwright's full-page CSS clip is cropped by native tab zoom.
      const session = await context.newCDPSession(page);
      try {
        await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
        const result = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
        const bytes = Buffer.from(result.data, 'base64');
        expect(bytes.readUInt32BE(16)).toBe(Math.round(baseline.width * baseline.dpr));
        await mkdir('.cache/product-evolution-qa', { recursive: true });
        await writeFile(path, bytes);
      } finally { await session.detach(); }
    };
    for (const route of ['/app', '/app/teachers', `/app/teachers/${process.env.EVOLUTION_TEACHER_ID}`, `/app/teachers/${process.env.EVOLUTION_TEACHER_ID}/schedules?academicYear=2026-2027`, '/app/institutions', '/app/teacher-requests', '/app/visits', '/app/follow-ups']) {
      await page.goto(route); await expect(page.getByRole('main')).toBeVisible(); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (route.includes('/schedules?')) { await page.getByRole('button', { name: 'عرض التوزيع' }).click(); await expect(page.getByRole('heading', { name: 'الجدول الساري' })).toBeVisible(); }
      if (route === '/app/teachers') await expect(page.locator('.teacher-directory__card')).toHaveCount(25);
      if (route === '/app/institutions') {
        await page.getByText('المقاطعة والبلدية — تنقل جغرافي', { exact: true }).click();
        await page.getByLabel('المقاطعة', { exact: true }).selectOption({ label: 'مقاطعة اختبار معزول' });
        await page.getByLabel('البلدية', { exact: true }).selectOption('بلدية اختبار معزول');
        await expect(page.getByRole('link', { name: 'ابتدائية الاختبار المعزول', exact: true })).toBeVisible();
      }
      expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
      await page.getByRole('main').locator('button:visible, a[href]:visible, input:visible, select:visible').first().focus();
      await page.keyboard.press('Tab'); await expect.poll(() => page.evaluate(() => document.activeElement !== document.body && document.activeElement?.matches(':focus-visible'))).toBe(true);
      if (route.includes('/schedules?')) await page.getByRole('heading', { name: 'الجدول الساري' }).evaluate(element => element.scrollIntoView({ block: 'start' }));
      await capture(`.cache/product-evolution-qa/zoom-${route.replace(/[^a-zA-Z0-9_-]/gu, '_')}.png`);
    }
    await page.goto(`/app/teachers?q=${encodeURIComponent('باسم عربي طويل')}`);
    await expect(page.locator('.teacher-directory__card')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('.teacher-directory__card').evaluate(element => element.scrollIntoView({ block: 'start' })); await capture('.cache/product-evolution-qa/zoom-long-name.png');
    await page.goto('/teacher/login'); await page.getByLabel('البريد الإلكتروني للحساب').fill('teacher-browser@example.invalid'); await page.getByLabel('كلمة المرور').fill(process.env.EVOLUTION_PASSWORD!); await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click(); await expect(page).toHaveURL(/\/teacher$/u);
    expect((await page.evaluate(() => devicePixelRatio)) / baseline.dpr).toBeCloseTo(2,1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); await capture('.cache/product-evolution-qa/zoom-teacher.png');
    await page.getByRole('button', { name: 'التوزيع الأسبوعي', exact: true }).click(); await page.getByLabel('السنة الدراسية').fill('2026-2027'); await page.getByRole('button', { name: 'عرض التوزيع' }).click(); await expect(page.getByRole('heading', { name: 'الجدول الساري' })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); await page.getByRole('heading', { name: 'الجدول الساري' }).evaluate(element => element.scrollIntoView({ block: 'start' })); await capture('.cache/product-evolution-qa/zoom-teacher-schedule.png');
  } finally { await context.close(); }
});

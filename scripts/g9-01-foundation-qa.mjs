// Dedicated test server only: no production route, API request or database.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { chromium } from '@playwright/test';

const require = createRequire(resolve('packages/web/package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const output = await mkdtemp(join(tmpdir(), 'g9-01-visual-'));
const profile = await mkdtemp(join(tmpdir(), 'g9-01-chrome-'));
const server = await createServer({ root: resolve('packages/web'), server: { middlewareMode: true } });
const http = createHttpServer(async (req, res) => {
  if (req.url !== '/__g9_foundation') return server.middlewares(req, res);
  try {
    const html = await server.transformIndexHtml(req.url, `<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>G9 foundation QA</title></head><body><div id="root"></div><script type="module">
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import '/src/ui/tokens.css'; import '/src/ui/shell.css'; import '/src/ui/primitives.css';
      import {WorkspaceFoundationFixture} from '/src/ui/workspace-foundation.fixture.tsx';
      createRoot(document.getElementById('root')).render(React.createElement(WorkspaceFoundationFixture));
    </script></body></html>`);
    res.setHeader('Content-Type', 'text/html'); res.end(html);
  } catch { res.statusCode = 500; res.end('Fixture failed.'); }
});
let context;
try {
  await new Promise((resolve, reject) => { http.once('error', reject); http.listen(5189, '127.0.0.1', resolve); });
  context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1440,1100'] });
  const page = context.pages()[0];
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  const apiRequests = []; page.on('request', (request) => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  const settings = await context.newPage(); await settings.goto('chrome://settings/appearance');
  const zoom = settings.locator('select').nth(1); await zoom.selectOption({ label: '100%' });
  await page.goto('http://127.0.0.1:5189/__g9_foundation');
  await page.getByRole('heading', { level: 1 }).waitFor();
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      return { overflow: root.scrollWidth > root.clientWidth, rtl: getComputedStyle(root).direction,
        clipped: [...document.querySelectorAll('.ui-record-row, .ui-page-header, .ui-filter-bar, .ui-state')].some((el) => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > root.clientWidth + 1; }),
        targets: [...document.querySelectorAll('button')].filter((el) => el.getClientRects().length).every((el) => el.getBoundingClientRect().height >= 40),
        h1: document.querySelectorAll('h1').length };
    });
    assert.equal(metrics.overflow, false); assert.equal(metrics.clipped, false); assert.equal(metrics.rtl, 'rtl'); assert.equal(metrics.targets, true); assert.equal(metrics.h1, 1);
    const trigger = page.getByRole('button', { name: 'مرشحات إضافية' });
    await trigger.focus(); await trigger.press('Space'); assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    await page.getByLabel('السنة الدراسية').focus();
    await trigger.focus(); await trigger.press('Enter'); assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByLabel('السنة الدراسية').isVisible(), false);
    const outline = await trigger.evaluate((el) => getComputedStyle(el).outlineStyle); assert.notEqual(outline, 'none');
    await page.screenshot({ path: join(output, `${width}.png`), fullPage: true });
    await page.screenshot({ path: join(output, `${width}-viewport.png`), scale: 'css' });
    console.log(`RESPONSIVE_${width}: PASS; keyboard disclosure/focus/RTL/targets/overflow PASS`);
  }
  const zoomPage = await context.newPage();
  await zoomPage.goto('http://127.0.0.1:5189/__g9_foundation');
  await zoomPage.getByRole('heading', { level: 1 }).waitFor();
  await zoom.selectOption({ label: '100%' });
  const before = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth }));
  await zoom.selectOption({ label: '200%' });
  await zoomPage.waitForFunction((dpr) => devicePixelRatio > dpr * 1.9, before.dpr);
  const after = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  assert(after.width < before.width * 0.6); assert.equal(after.overflow, false);
  // Capture the actual zoomed Chrome surface without screenshot viewport emulation.
  const cdp = await context.newCDPSession(zoomPage);
  const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(join(output, 'zoom-200-viewport.png'), Buffer.from(capture.data, 'base64'));
  await cdp.detach();
  console.log(`ZOOM_200: PASS; DPR ${before.dpr}->${after.dpr}; CSS width ${before.width}->${after.width}`);
  assert.deepEqual(errors, []); assert.deepEqual(apiRequests, []);
  console.log(`VISUAL_EVIDENCE: ${output}`);
  console.log('NO_API_OR_DATABASE_ACCESS: PASS');
} finally {
  await context?.close(); await server.close(); await new Promise((resolve) => http.close(resolve));
}

/* Header fade must follow page scrolling, never an internal list.
 * node registry/test-header-fade.cjs [path/to/standalone.html]
 * BPM_HEADER_FADE_FILE=../Sber-BPM-Registry-Standalone.html node test-header-fade.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file = path.resolve(process.argv[2] || process.env.BPM_HEADER_FADE_FILE || path.join(__dirname, 'index.html'));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-header-fade-'));

async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function state(page) {
  return page.locator('.header').evaluate(header => {
    const pseudo = getComputedStyle(header, '::after'), style = getComputedStyle(header);
    return {y:scrollY, marked:header.hasAttribute('data-page-scrolled'), opacity:Number(pseudo.opacity),
      display:pseudo.display, height:header.getBoundingClientRect().height,
      fadeHeight:parseFloat(pseudo.height), pointerEvents:pseudo.pointerEvents,
      position:style.position, background:style.backgroundColor};
  });
}
async function expectFade(page, visible, label) {
  await page.waitForFunction(visible => {
    const header = document.querySelector('.header');
    return !!header && header.hasAttribute('data-page-scrolled') === visible &&
      Number(getComputedStyle(header, '::after').opacity) === Number(visible);
  }, visible);
  const current = await state(page);
  assert.equal(current.opacity, Number(visible), `${label}: fade opacity`);
  assert.equal(current.marked, visible, `${label}: page-scroll marker`);
  return current;
}
async function ready(page, route) {
  const selector = route === 'cabinet' ? '#cabinet-feed-insights' : route === 'tasks' ? '#tasks-results' : '#results';
  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-busy') === 'false', selector);
  await paint(page);
}
async function viewFade(page, label, button, busySelector) {
  await page.locator(button).click();
  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-busy') === 'false', busySelector);
  await page.evaluate(() => scrollTo({top:0, behavior:'instant'}));
  await expectFade(page, false, `${label}/top`);
  await page.evaluate(() => scrollTo({top:1, behavior:'instant'}));
  assert.equal((await expectFade(page, true, `${label}/first-pixel`)).y, 1);
  await page.evaluate(() => scrollTo({top:180, behavior:'instant'}));
  await expectFade(page, true, `${label}/down`);
  await page.evaluate(() => scrollTo({top:0, behavior:'instant'}));
  await expectFade(page, false, `${label}/back-to-top`);
  console.log(`PASS ${label}: hidden at top, visible from first scroll, hidden on return`);
}

(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  const context = await browser.newContext({reducedMotion:'reduce', offline:true});
  await context.addInitScript(() => localStorage.setItem('bpm-registry-menu', 'expanded'));
  const errors = [], missing = [];
  try {
    for (const width of [1440, 390]) for (const route of ['cabinet', 'main', 'tasks']) {
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => missing.push(`${request.url()}: ${request.failure()?.errorText}`));
      await page.setViewportSize({width, height:900});
      await page.goto(`${pathToFileURL(file).href}#${route}`);
      await ready(page, route);
      const label = `${width}px/${route}`, initial = await expectFade(page, false, `${label}/initial`);
      assert.equal(initial.y, 0, `${label}: starts at page top`);
      assert.equal(initial.height, width < 768 ? 72 : route === 'cabinet' ? 98 : 100, `${label}: header size unchanged`);
      assert.equal(initial.position, 'fixed', `${label}: header remains fixed`);
      assert.equal(initial.pointerEvents, 'none', `${label}: decorative edge does not intercept clicks`);
      assert.equal(initial.background, 'rgb(242, 244, 248)', `${label}: opaque header background unchanged`);
      assert.ok(initial.fadeHeight > 0 && initial.fadeHeight <= 24, `${label}: short decorative fade`);
      if (route === 'cabinet') {
        await page.screenshot({path:path.join(output, `${width}-top.png`)});
        const internal = await page.locator('#cabinet-feed-insights').evaluate(element => {
          const range = element.scrollHeight - element.clientHeight;
          element.scrollTo({top:Math.min(100, range), behavior:'instant'});
          return range;
        });
        assert.ok(internal > 100, `${label}: internal overflow fixture exists`);
        await paint(page);
        assert.ok(await page.locator('#cabinet-feed-insights').evaluate(element => element.scrollTop) > 0);
        const stillTop = await expectFade(page, false, `${label}/internal-scroll`);
        assert.equal(stillTop.y, 0, `${label}: internal scroll leaves header fade off`);
      }
      await page.evaluate(() => scrollTo({top:180, behavior:'instant'}));
      const scrolled = await expectFade(page, true, `${label}/down`);
      assert.ok(scrolled.y > 0, `${label}: page actually scrolled`);
      assert.equal(scrolled.height, initial.height, `${label}: fade does not resize header`);
      if (route === 'cabinet') {
        await page.screenshot({path:path.join(output, `${width}-scrolled.png`)});
        await page.emulateMedia({media:'print'});
        assert.equal((await state(page)).display, 'none', `${label}: no decorative fade in print`);
        await page.emulateMedia({media:'screen', forcedColors:'active'});
        assert.equal((await state(page)).display, 'none', `${label}: no decorative fade in forced colors`);
        await page.emulateMedia({forcedColors:'none'});
        await page.reload();
        await ready(page, route);
        const restored = await state(page);
        await expectFade(page, restored.y > 0, `${label}/reload-state`);
      }
      await page.evaluate(() => scrollTo({top:0, behavior:'instant'}));
      await expectFade(page, false, `${label}/back-to-top`);
      assert.equal((await state(page)).y, 0, `${label}: returns to top`);
      console.log(`PASS ${label}: initial hidden, page scroll visible, return hidden${route === 'cabinet' ? ', internal scroll ignored, reload/accessibility checked' : ''}`);
      if (route === 'main') {
        await viewFade(page, `${width}px/registry-paths-table`, '#table-view', '#results');
        await viewFade(page, `${width}px/registry-processes-table`, '#processes-tab', '#results');
        await viewFade(page, `${width}px/registry-processes-cards`, '#cards-view', '#results');
        await viewFade(page, `${width}px/structure-processes`, '#structure-toggle', '#structure-list');
        await viewFade(page, `${width}px/structure-paths`, '#structure-paths-tab', '#structure-list');
      } else if (route === 'tasks') {
        await viewFade(page, `${width}px/tasks-cards`, '#tasks-cards', '#tasks-results');
        await viewFade(page, `${width}px/tasks-table`, '#tasks-table', '#tasks-results');
      }
      await page.close();
    }
    assert.deepEqual(errors, [], 'No browser errors');
    assert.deepEqual(missing, [], 'No missing resources');
    console.log(`PASS header fade regression: ${file}\nScreenshots: ${output}`);
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

/* Stacked process → task drawer regression. No user profile or live data writes.
 * node test-process-task-drawer.cjs [../Sber-BPM-Registry-Standalone.html]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file = path.resolve(process.argv[2] || path.join(__dirname, 'index.html'));
const base = pathToFileURL(file).href;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-process-task-drawer-'));
const createSelector = '#process-drawer [data-pd-action="create-task"]';
const near = (actual, expected, label, tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const report = message => console.log(`PASS — ${message}`);

async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function ready(page, id) {
  await page.waitForFunction(id => {
    const dialog = document.getElementById(id);
    return dialog?.open && !dialog.inert && (matchMedia('(prefers-reduced-motion: reduce)').matches || dialog.classList.contains('has-entered'));
  }, id);
  await paint(page);
}
async function openProcess(page) {
  await page.goto(`${base}#main`);
  await page.locator('#processes-tab').click();
  await page.locator('.entity-card:not(.skeleton-card) [data-detail]').first().waitFor();
  const entry = page.locator('.entity-card:not(.skeleton-card) [data-detail]').first();
  await entry.click();
  await page.waitForFunction(() => {
    const dialog = document.getElementById('process-drawer');
    return dialog?.open && !dialog.classList.contains('pd-is-loading') && !dialog.querySelector('.pd-main').inert;
  });
  await page.locator('#process-drawer .pd-anchors [data-pd-anchor="tasks"]').click();
  await page.waitForFunction(() => {
    const main = document.querySelector('#process-drawer .pd-main'), section = document.getElementById('pd-tasks');
    return Math.abs(main.getBoundingClientRect().top - section.getBoundingClientRect().top) <= 2 || main.scrollTop + main.clientHeight >= main.scrollHeight - 3;
  });
  await page.locator(createSelector).scrollIntoViewIfNeeded();
  await paint(page);
  await page.evaluate(() => {
    const main = document.querySelector('#process-drawer .pd-main');
    window.__stackedDrawerFixture = {main, section:document.getElementById('pd-tasks'), button:document.querySelector('#process-drawer [data-pd-action="create-task"]'), title:document.getElementById('pd-title').textContent, scroll:main.scrollTop, page:scrollY};
  });
  return entry;
}
async function parentPreserved(page, label, focus = false) {
  const actual = await page.evaluate(() => {
    const prior = window.__stackedDrawerFixture, dialog = document.getElementById('process-drawer');
    return {open:dialog.open, modal:dialog.matches(':modal'), main:prior.main === dialog.querySelector('.pd-main'),
      section:prior.section === document.getElementById('pd-tasks'), button:prior.button === document.querySelector('#process-drawer [data-pd-action="create-task"]'),
      title:document.getElementById('pd-title').textContent, previousTitle:prior.title,
      scroll:prior.main.scrollTop, previousScroll:prior.scroll, page:scrollY, previousPage:prior.page,
      bodyOverflow:getComputedStyle(document.body).overflowY, focus:document.activeElement === prior.button};
  });
  for (const property of ['open', 'modal', 'main', 'section', 'button']) assert.ok(actual[property], `${label}: parent ${property} is preserved`);
  assert.equal(actual.title, actual.previousTitle, `${label}: selected process stays the same`);
  near(actual.scroll, actual.previousScroll, `${label}: parent scroll position`);
  near(actual.page, actual.previousPage, `${label}: background page position`);
  assert.equal(actual.bodyOverflow, 'hidden', `${label}: body remains locked under parent`);
  if (focus) assert.ok(actual.focus, `${label}: focus returns to the process creation button`);
}
async function stacked(page, id, label) {
  await ready(page, id);
  assert.deepEqual(await page.locator('dialog[open]').evaluateAll(elements => elements.map(element => element.id).sort()), ['process-drawer', id].sort(), `${label}: exactly the parent and active task drawer are open`);
  assert.deepEqual(await page.locator('dialog:modal').evaluateAll(elements => elements.map(element => element.id).sort()), ['process-drawer', id].sort(), `${label}: both layers are native modals`);
  const geometry = await page.locator(`#${id}`).evaluate(element => {
    const rect = element.getBoundingClientRect(), backdrop = getComputedStyle(element, '::backdrop');
    return {x:rect.x,y:rect.y,width:rect.width,right:rect.right,height:rect.height,backdrop:backdrop.backgroundColor,focus:element.contains(document.activeElement),pageWidth:document.documentElement.scrollWidth};
  });
  const width = page.viewportSize().width;
  if (width >= 768) {
    near(geometry.width, (width - 328) * 5 / 12 + 96, `${label}: existing five-column width`);
    near(geometry.right, width - 32, `${label}: right aligned with existing drawer grid`);
    const parent = await page.locator('#process-drawer').boundingBox();
    const point = {x:parent.x + 24,y:Math.max(parent.y + 100, 200)};
    assert.ok(point.x < geometry.x, `${label}: parent has a visible region under the top backdrop`);
    assert.equal(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.id, point), id, `${label}: top modal backdrop intercepts the underlying process`);
  } else {
    near(geometry.x, 0, `${label}: mobile left edge`);
    near(geometry.width, width, `${label}: mobile keeps existing full-width drawer`);
  }
  assert.equal(geometry.backdrop, 'rgba(0, 36, 68, 0.2)', `${label}: top layer has its own design-system dim backdrop`);
  assert.ok(geometry.focus, `${label}: keyboard focus belongs to the top layer`);
  assert.ok(geometry.pageWidth <= width, `${label}: no horizontal document overflow`);
  await parentPreserved(page, label);
}
async function openChooser(page, label) {
  await page.locator(createSelector).click();
  await stacked(page, 'task-drawer', label);
  assert.equal(await page.locator('#task-drawer [data-task-type]').count(), 8, `${label}: reuses existing eight task types`);
}
async function closedChild(page, id, label) {
  await page.waitForFunction(id => !document.getElementById(id)?.open, id);
  await paint(page);
  assert.equal(await page.locator('dialog[open]').count(), 1, `${label}: only the process remains open`);
  await parentPreserved(page, label, true);
}
async function keyboardTrap(page, label) {
  await page.locator('#task-drawer .task-drawer-close').focus();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab');
    const safe = await page.evaluate(() => {
      const active = document.activeElement;
      // Native Tab traversal may visit browser chrome (reported as body), but
      // it must never focus controls in the process or background registry.
      return active === document.body || document.getElementById('task-drawer').contains(active);
    });
    assert.ok(safe, `${label}: Tab cannot reach the underlying process or registry`);
  }
  await page.locator('#task-drawer .task-drawer-close').focus();
}
async function exercise(page, width, motion) {
  const label = `${width}px/${motion}`;
  const entry = await openProcess(page);
  await openChooser(page, `${label}/initial`);
  await page.screenshot({path:path.join(output, `stack-${width}-${motion}.png`)});
  await keyboardTrap(page, label);
  await page.keyboard.press('Escape');
  await closedChild(page, 'task-drawer', `${label}/Escape`);

  await openChooser(page, `${label}/reopen`);
  await page.locator('#task-drawer .task-drawer-close').click();
  await closedChild(page, 'task-drawer', `${label}/close button`);

  if (width >= 768) {
    await openChooser(page, `${label}/backdrop reopen`);
    const parent = await page.locator('#process-drawer').boundingBox();
    await page.mouse.click(parent.x + 24, Math.max(parent.y + 100, 200));
    await closedChild(page, 'task-drawer', `${label}/backdrop`);
  }

  await openChooser(page, `${label}/form reopen`);
  await page.locator('#task-drawer [data-task-type="standard"]').click();
  await stacked(page, 'task-flow', `${label}/standard form`);
  assert.equal(await page.locator('#task-flow').getAttribute('data-mode'), 'create');
  await page.locator('#tf-title').fill('Проверка вложенного дровера');
  await page.locator('#task-flow [data-tf-action="back"]').click();
  await stacked(page, 'task-drawer', `${label}/back to types`);
  await page.locator('#task-drawer [data-task-type="standard"]').click();
  await stacked(page, 'task-flow', `${label}/resume form`);
  assert.equal(await page.locator('#tf-title').inputValue(), 'Проверка вложенного дровера', `${label}: back navigation retains creation draft`);
  await page.locator('#task-flow [data-tf-action="cancel"]').click();
  await closedChild(page, 'task-flow', `${label}/cancel form`);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('process-drawer').open);
  await paint(page);
  assert.equal(await page.locator('dialog[open]').count(), 0, `${label}: final Escape closes parent`);
  assert.notEqual(await page.locator('body').evaluate(element => getComputedStyle(element).overflowY), 'hidden', `${label}: page unlocks only after parent closes`);
  assert.ok(await entry.evaluate(element => element === document.activeElement), `${label}: parent restores registry trigger`);
  report(`${label}: stacked chooser/form, geometry, backdrop, focus isolation, Escape/close/cancel/back and preserved parent state`);
}

(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  let page;
  try {
    for (const [width, motion] of [[1920,'reduce'],[390,'reduce'],[320,'reduce'],[1920,'no-preference']]) {
      const context = await browser.newContext({viewport:{width,height:900}, reducedMotion:motion, offline:true});
      await context.addInitScript(() => localStorage.setItem('bpm-registry-menu','expanded'));
      page = await context.newPage();
      page.setDefaultTimeout(12000);
      const errors = [], failed = [];
      page.on('pageerror', error => errors.push(error.stack || error.message));
      page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
      await exercise(page, width, motion);
      assert.deepEqual(errors, [], `${width}/${motion}: no browser errors`);
      assert.deepEqual(failed, [], `${width}/${motion}: no missing resources`);
      await context.close();
    }
    report(`source/offline stacked-drawer regression: ${file}`);
    console.log(`Screenshots: ${output}`);
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({path:path.join(output,'failure.png')});
    console.error(`Screenshot: ${output}/failure.png`);
    throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});

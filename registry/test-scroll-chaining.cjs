/* Native wheel handoff regression for the source page and offline build.
 * node test-scroll-chaining.cjs
 * BPM_SCROLL_CHAIN_FILE=../Sber-BPM-Registry-Standalone.html node test-scroll-chaining.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file = path.resolve(process.env.BPM_SCROLL_CHAIN_FILE || path.join(__dirname, 'index.html'));
const base = pathToFileURL(file).href;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-scroll-chaining-'));
const list = key => `[data-cabinet-section="${key}"] > :is(.cabinet-feed,.cabinet-entity-grid)`;
const report = message => console.log(`PASS — ${message}`);

async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function fresh(page, width) {
  await page.setViewportSize({width, height:900});
  await page.goto(`${base}#cabinet`);
  await page.waitForFunction(() => !document.querySelector('#cabinet-panel')?.hidden && document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy') === 'false');
  await page.mouse.move(width - 1, 1);
  if (await page.locator('body').evaluate(element => element.classList.contains('mobile-menu-open'))) await page.locator('#collapse-menu').click();
  if (width < 768) await page.waitForFunction(() => document.querySelector('#sidebar').getBoundingClientRect().right <= 0);
  if (await page.locator('#cabinet-tab-incoming').getAttribute('aria-selected') !== 'true') await page.locator('#cabinet-tab-incoming').click();
  await paint(page);
}
async function sample(page, selector) {
  return page.locator(selector).evaluate(element => {
    const style = getComputedStyle(element);
    return {inner:element.scrollTop, range:element.scrollHeight - element.clientHeight, page:scrollY,
      pageRange:document.scrollingElement.scrollHeight - innerHeight, overflow:style.overflowY,
      overscroll:style.overscrollBehaviorY, fade:element.dataset.scrollFade, mask:style.maskImage};
  });
}
async function fade(page, selector, expected, label) {
  await page.waitForFunction(({selector, expected}) => document.querySelector(selector)?.dataset.scrollFade === expected, {selector, expected});
  const current = await sample(page, selector);
  assert.equal(current.fade, expected, `${label}: ${expected} boundary fade`);
  if (expected === 'none') assert.equal(current.mask, 'none', `${label}: fitting list stays unmasked`);
  else assert.match(current.mask, /linear-gradient\(/, `${label}: scrolling list retains its fade`);
}
async function hit(page, selector, point, label) {
  const result = await page.evaluate(({selector, point}) => {
    const scroller = document.querySelector(selector);
    const target = document.elementFromPoint(point.x, point.y);
    return {inside:!!target && scroller.contains(target), target:target?.id || target?.className,
      bounds:scroller.getBoundingClientRect().toJSON(), page:scrollY};
  }, {selector, point});
  assert.ok(result.inside, `${label}: stationary cursor must hit the current scroller, ${JSON.stringify(result)}`);
}
async function wheel(page, selector, point, delta, label) {
  await hit(page, selector, point, label);
  await page.mouse.wheel(0, delta);
  // Wheel scrolling is asynchronous. Wait for compositor movement to finish and
  // the wheel transaction to settle without moving the pointer or adding handlers.
  await page.evaluate(async selector => {
    const element = document.querySelector(selector);
    const started = performance.now();
    let previous = '', stable = 0;
    while (performance.now() - started < 2500) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const current = `${element.scrollTop}/${scrollY}`;
      stable = current === previous ? stable + 1 : 0;
      previous = current;
      if (stable >= 8 && performance.now() - started >= 350) return;
    }
    throw new Error('Wheel scrolling did not settle');
  }, selector);
  return sample(page, selector);
}
async function position(page, selector, label) {
  // Programmatic positioning is fixture setup only. From this point until the
  // whole bottom-and-top cycle ends, every scroll is a real wheel at this point.
  await page.locator(selector).evaluate(element => {
    element.scrollTo({top:0, behavior:'instant'});
    const top = element.getBoundingClientRect().top + scrollY;
    const range = document.scrollingElement.scrollHeight - innerHeight;
    scrollTo({top:Math.min(range - 100, Math.max(100, top - 180)), behavior:'instant'});
  });
  await paint(page);
  const point = await page.locator(selector).evaluate(element => {
    const box = element.getBoundingClientRect();
    const header = document.querySelector('.header').getBoundingClientRect();
    const upper = Math.max(box.top, header.bottom) + 24;
    const lower = Math.min(box.bottom, innerHeight) - 24;
    if (lower <= upper) throw new Error('Scroller has no usable visible content');
    return {x:box.left + box.width / 2, y:(upper + lower) / 2};
  });
  await hit(page, selector, point, label);
  await page.mouse.move(point.x, point.y);
  return point;
}
async function longList(page, key, width) {
  const selector = list(key), label = `${width}px/${key}`;
  const initial = await sample(page, selector);
  if (initial.range <= 1 || !/^(auto|scroll)$/.test(initial.overflow)) {
    await fade(page, selector, 'none', label);
    report(`${label}: naturally sized list has no internal scroll range`);
    return false;
  }
  assert.equal(initial.overscroll, 'auto', `${label}: vertical boundary allows native scroll chaining`);
  const point = await position(page, selector, label);
  const before = await sample(page, selector);
  assert.ok(before.page >= 80 && before.pageRange - before.page >= 80, `${label}: page can scroll in both directions`);
  await fade(page, selector, 'bottom', label);
  const middle = await wheel(page, selector, point, Math.min(120, before.range / 3), `${label}/internal down`);
  assert.ok(middle.inner > 1 && middle.inner < middle.range - 1, `${label}: first wheel scrolls list content`);
  assert.ok(Math.abs(middle.page - before.page) <= 1, `${label}: page stays still while list can scroll`);
  await fade(page, selector, 'both', label);
  const bottom = await wheel(page, selector, point, middle.range - middle.inner, `${label}/reach bottom`);
  assert.ok(bottom.range - bottom.inner <= 1, `${label}: wheel reaches list bottom`);
  assert.ok(Math.abs(bottom.page - before.page) <= 1, `${label}: reaching bottom does not jump the page`);
  await fade(page, selector, 'top', label);
  const down = await wheel(page, selector, point, 60, `${label}/bottom handoff`);
  assert.ok(down.page > bottom.page + 1, `${label}: another down wheel at bottom scrolls the page`);
  assert.ok(down.range - down.inner <= 1, `${label}: list stays at bottom during handoff`);
  await fade(page, selector, 'top', label);
  const reverse = await wheel(page, selector, point, -Math.min(120, down.range / 3), `${label}/internal up`);
  assert.ok(reverse.inner < down.inner - 1 && reverse.inner > 1, `${label}: reverse wheel returns to internal content`);
  assert.ok(Math.abs(reverse.page - down.page) <= 1, `${label}: reverse internal wheel leaves page still`);
  await fade(page, selector, 'both', label);
  const top = await wheel(page, selector, point, -reverse.inner, `${label}/reach top`);
  assert.ok(top.inner <= 1, `${label}: wheel reaches list top`);
  assert.ok(Math.abs(top.page - down.page) <= 1, `${label}: reaching top does not jump the page`);
  await fade(page, selector, 'bottom', label);
  const up = await wheel(page, selector, point, -60, `${label}/top handoff`);
  assert.ok(up.page < top.page - 1, `${label}: another up wheel at top scrolls the page`);
  assert.ok(up.inner <= 1, `${label}: list stays at top during handoff`);
  await fade(page, selector, 'bottom', label);
  await hit(page, selector, point, `${label}/same cursor after both handoffs`);
  report(`${label}: internal wheels, bottom → page, reverse internal wheels, top → page; cursor unchanged and fades correct`);
  return true;
}
async function shortList(page, width) {
  const selector = list('tasks'), label = `${width}px/outgoing task`;
  await page.locator('#cabinet-tab-outgoing').click();
  assert.equal(await page.locator('[data-cabinet-kind="tasks"]').count(), 1, `${label}: one outgoing task`);
  await paint(page);
  const point = await position(page, selector, label), before = await sample(page, selector);
  assert.ok(before.range <= 1, `${label}: no internal scroll range`);
  await fade(page, selector, 'none', label);
  const after = await wheel(page, selector, point, 60, label);
  assert.ok(after.page > before.page + 1, `${label}: wheel goes straight to the page`);
  assert.equal(after.inner, 0, `${label}: short list does not take scroll ownership`);
  await fade(page, selector, 'none', label);
  report(`${label}: wheel immediately scrolls the page and list stays unmasked`);
}
async function drawer(page) {
  await fresh(page, 1440);
  await page.setViewportSize({width:1440, height:650});
  await page.locator('#cabinet-create-tasks').click();
  await page.locator('#task-drawer[open]').waitFor();
  const selector = '#task-drawer .task-drawer-content';
  await paint(page);
  const before = await sample(page, selector);
  assert.equal(before.overscroll, 'contain', 'Task drawer retains vertical overscroll containment');
  assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).overflowY), 'hidden', 'Open drawer retains body scroll lock');
  assert.ok(before.range > 1, 'Task drawer fixture has internal overflow');
  const box = await page.locator(selector).boundingBox(), point = {x:box.x + box.width / 2, y:box.y + box.height / 2};
  await page.mouse.move(point.x, point.y);
  const bottom = await wheel(page, selector, point, before.range, 'drawer/reach bottom');
  assert.ok(bottom.range - bottom.inner <= 1, 'Wheel reaches drawer bottom');
  const after = await wheel(page, selector, point, 120, 'drawer/bottom');
  assert.ok(Math.abs(after.page - before.page) <= 1, 'Drawer boundary never scrolls the page');
  await fade(page, selector, 'top', 'drawer');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#task-drawer').open);
  report('task drawer keeps overscroll containment, body scroll lock, and boundary fade');
}

(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  const context = await browser.newContext({reducedMotion:'reduce', offline:true});
  await context.addInitScript(() => localStorage.setItem('bpm-registry-menu', 'expanded'));
  const page = await context.newPage(), errors = [], missing = [], covered = new Set();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('requestfailed', request => missing.push(`${request.url()}: ${request.failure()?.errorText}`));
  try {
    for (const width of [1440, 390]) {
      await fresh(page, width);
      for (const key of ['insights', 'tasks', 'paths', 'processes']) if (await longList(page, key, width)) covered.add(key);
      await shortList(page, width);
    }
    assert.deepEqual([...covered].sort(), ['insights', 'paths', 'processes', 'tasks'], 'Every Cabinet list exercises real boundary handoff');
    await drawer(page);
    assert.deepEqual(errors, [], 'No browser runtime errors');
    assert.deepEqual(missing, [], 'No missing resources');
    report(`native scroll-chaining regression passed: ${file}`);
  } catch (error) {
    await page.screenshot({path:path.join(output, 'failure.png')});
    console.error(`Screenshot: ${output}/failure.png`);
    throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

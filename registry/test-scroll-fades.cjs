/* Content-only scroll-fade regression for the source page and offline build.
 * node test-scroll-fades.cjs
 * BPM_SCROLL_FADE_FILE=../Sber-BPM-Registry-Standalone.html node test-scroll-fades.cjs
 * Optional groups: cabinet, filtersAndReflow, wheelRouting, drawers, navigation.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file = path.resolve(process.env.BPM_SCROLL_FADE_FILE || path.join(__dirname, 'index.html'));
const base = process.env.BPM_SCROLL_FADE_URL || pathToFileURL(file).href;
const eligible = '.cabinet-feed,.cabinet-entity-grid,.navigation,.pd-main,.task-drawer-content,.tf-content';
const lists = ['insights', 'tasks', 'paths', 'processes'];
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-scroll-fades-'));
const report = message => console.log(`PASS — ${message}`);
const list = key => `[data-cabinet-section="${key}"] > :is(.cabinet-feed,.cabinet-entity-grid)`;

async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  });
}
async function fresh(page, width = 1440, height = 1080) {
  await page.setViewportSize({width, height});
  await page.goto(`${base.split('#')[0]}#cabinet`);
  await page.waitForFunction(() => !document.querySelector('#cabinet-panel')?.hidden && document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy') === 'false');
  await paint(page);
}
async function viewport(page, width, height = 1080) {
  await page.setViewportSize({width, height});
  await page.mouse.move(width - 1, 1);
  if (await page.locator('body').evaluate(element => element.classList.contains('mobile-menu-open'))) await page.locator('#collapse-menu').click();
  if (width < 768) await page.waitForFunction(() => document.querySelector('#sidebar').getBoundingClientRect().right <= 0);
  await paint(page);
}
async function checkFade(page, selector, label, expected) {
  await page.waitForFunction(({selector, expected}) => [...document.querySelectorAll(selector)].every(element => {
    const overflow = /^(auto|scroll)$/.test(getComputedStyle(element).overflowY);
    const range = element.scrollHeight - element.clientHeight;
    const active = element.clientHeight > 0 && overflow && range > 1;
    const top = active && element.scrollTop > 1;
    const bottom = active && range - element.scrollTop > 1;
    return element.dataset.scrollFade === (top ? bottom ? 'both' : 'top' : bottom ? 'bottom' : 'none') && (!expected || element.dataset.scrollFade === expected);
  }), {selector, expected});
  const samples = await page.locator(selector).evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return {state:element.dataset.scrollFade, mask:style.maskImage, webkitMask:style.webkitMaskImage,
      top:element.scrollTop, range:element.scrollHeight - element.clientHeight, client:element.clientHeight,
      overflow:style.overflowY, horizontal:element.scrollWidth - element.clientWidth};
  }));
  assert.ok(samples.length, `${label}: scroller exists`);
  for (const sample of samples) {
    if (expected) assert.equal(sample.state, expected, `${label}: expected ${expected}, ${JSON.stringify(sample)}`);
    if (sample.state === 'none') assert.equal(sample.mask, 'none', `${label}: fitting content is unmasked`);
    else {
      assert.match(sample.mask, /linear-gradient\(/, `${label}: overflow uses an alpha gradient`);
      assert.match(sample.mask, /24px/, `${label}: fade occupies 24px`);
      assert.match(sample.mask, /transparent|rgba\([^)]*,\s*0\)/, `${label}: fade has a transparent endpoint`);
      assert.equal(sample.webkitMask, sample.mask, `${label}: prefixed and standard masks agree`);
    }
    assert.ok(sample.horizontal <= 1, `${label}: content has no horizontal overflow (${sample.horizontal}px)`);
  }
  return samples[0];
}
async function positions(page, selector, label, requireOverflow = false) {
  await paint(page);
  await page.locator(selector).evaluate(element => element.scrollTo({top:0, behavior:'instant'}));
  const sample = await checkFade(page, selector, `${label}/start`);
  if (requireOverflow) assert.ok(sample.range > 4, `${label}: fixture exercises actual vertical scrolling`);
  if (sample.range <= 1 || !/^(auto|scroll)$/.test(sample.overflow)) {
    assert.equal(sample.state, 'none', `${label}: no overflow means no fade`);
    return false;
  }
  await checkFade(page, selector, `${label}/start`, 'bottom');
  await page.locator(selector).evaluate(element => element.scrollTo({top:(element.scrollHeight - element.clientHeight) / 2, behavior:'instant'}));
  await checkFade(page, selector, `${label}/middle`, 'both');
  if (label === '390px/paths') {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output, 'cabinet-paths-390-middle.png')});
  }
  await page.locator(selector).evaluate(element => element.scrollTo({top:element.scrollHeight, behavior:'instant'}));
  await checkFade(page, selector, `${label}/end`, 'top');
  await page.locator(selector).evaluate(element => element.scrollTo({top:0, behavior:'instant'}));
  await checkFade(page, selector, `${label}/restored`, 'bottom');
  return true;
}
async function unmaskedChrome(page, selector, label) {
  const masks = await page.locator(selector).evaluateAll(elements => elements.flatMap(element => {
    const masked = [];
    for (let current = element; current; current = current.parentElement) {
      const mask = getComputedStyle(current).maskImage;
      if (mask !== 'none') masked.push({element:current.id || current.className, mask});
    }
    return masked;
  }));
  assert.ok(await page.locator(selector).count(), `${label}: fixed chrome exists`);
  assert.deepEqual(masks, [], `${label}: header, controls and their ancestors stay unmasked`);
}
async function pageGeometry(page, label) {
  const geometry = await page.evaluate(() => ({viewport:innerWidth, document:document.documentElement.scrollWidth, body:document.body.scrollWidth}));
  assert.ok(geometry.document <= geometry.viewport + 1 && geometry.body <= geometry.viewport + 1, `${label}: page fits viewport ${JSON.stringify(geometry)}`);
}
async function cabinetContract(page, label) {
  await paint(page);
  for (const key of lists) {
    const item = await page.locator(list(key)).evaluate(element => {
      const rows = [];
      for (const card of [...element.children].filter(child => child.matches('.cabinet-card'))) {
        const top = card.getBoundingClientRect().top;
        if (!rows.some(previous => Math.abs(previous - top) < 1)) rows.push(top);
      }
      const style = getComputedStyle(element);
      return {rows:rows.length, reportedRows:Number(element.dataset.cabinetRows), scroll:element.dataset.cabinetScroll,
        overflow:style.overflowY, maxHeight:style.maxHeight, range:element.scrollHeight - element.clientHeight};
    });
    assert.equal(item.reportedRows, item.rows, `${label}/${key}: actual card rows match the sizing controller`);
    assert.equal(item.scroll, String(item.rows > 2), `${label}/${key}: only more than two rows own scrolling`);
    if (item.rows > 2) {
      assert.equal(item.overflow, 'auto', `${label}/${key}: long list owns vertical scroll`);
      assert.ok(item.range > 1, `${label}/${key}: long list has scrollable content`);
    } else {
      assert.equal(item.overflow, 'visible', `${label}/${key}: short list remains naturally sized`);
      assert.equal(item.maxHeight, 'none', `${label}/${key}: short list is not bounded`);
      assert.ok(item.range <= 1, `${label}/${key}: short list has no internal scroll range`);
    }
    await checkFade(page, list(key), `${label}/${key}`);
  }
  const overlays = await page.locator('.cabinet-feed-widget').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element, '::after');
    return style.content !== 'none' && style.content !== 'normal' && style.display !== 'none';
  }));
  assert.ok(overlays.every(value => !value), `${label}: old panel-colored ::after overlays are removed`);
  await unmaskedChrome(page, '.header,.cabinet-widget-header,.cabinet-task-tabs', label);
  await pageGeometry(page, label);
}
async function printMasks(page, label) {
  await page.emulateMedia({media:'print'});
  await paint(page);
  assert.ok(await page.locator(eligible).evaluateAll(elements => elements.every(element => getComputedStyle(element).maskImage === 'none' && getComputedStyle(element).webkitMaskImage === 'none')), `${label}: print disables all masks`);
  await page.emulateMedia({media:'screen'});
  await paint(page);
}

async function cabinet(page) {
  await fresh(page);
  const covered = new Set();
  for (const width of [1440, 1920, 390, 320]) {
    await viewport(page, width);
    await cabinetContract(page, `${width}px`);
    for (const key of lists) if (await positions(page, list(key), `${width}px/${key}`)) covered.add(key);
  }
  assert.deepEqual([...covered].sort(), [...lists].sort(), 'Every Cabinet list exercises bottom/both/top states');
  await printMasks(page, 'Cabinet');
  report(`all four Cabinet lists: actual top/middle/end states, two-row ownership, clean headers and 320/390/1440/1920px layouts; screenshots: ${output}`);
}
async function filter(page, key, value) {
  await page.locator(`#cabinet-filter-${key}`).click();
  await page.locator('.cabinet-menu').getByRole('menuitemradio', {name:value, exact:true}).click();
  await page.keyboard.press('Escape');
  await paint(page);
}
async function filtersAndReflow(page) {
  await fresh(page);
  await page.locator('#cabinet-search').fill('INS-000042');
  await page.waitForFunction(() => document.querySelectorAll('[data-cabinet-kind="insights"]').length === 1);
  await cabinetContract(page, 'single matching insight');
  await checkFade(page, list('insights'), 'single matching insight', 'none');
  await page.locator('#cabinet-search').fill('');
  await page.waitForFunction(() => document.querySelectorAll('[data-cabinet-kind="insights"]').length === 10);
  await positions(page, list('insights'), 'search reset', true);
  await viewport(page, 390);
  for (const [key, value, count] of [['tasks','Комплаенс',2], ['paths','Приостановлен',1], ['processes','Не на мониторинге',1]]) {
    await positions(page, list(key), `before ${key} filter`, true);
    await filter(page, key, value);
    assert.equal(await page.locator(`[data-cabinet-kind="${key}"]`).count(), count, `${key}: filter fixture is a short list`);
    await checkFade(page, list(key), `${key}/filtered`, 'none');
    await cabinetContract(page, `${key}/filtered`);
    await page.locator(`#cabinet-filter-${key}`).click();
    await page.locator('.cabinet-menu [data-clear]').click();
    await page.keyboard.press('Escape');
    await positions(page, list(key), `${key}/filter reset`, true);
  }
  await viewport(page, 1920);
  for (const order of [['insights','tasks'], ['tasks','insights']]) {
    const expanded = new Set();
    for (const key of [...order, ...order]) {
      await page.locator(`#cabinet-expand-${key}`).click();
      if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
      for (const other of ['insights','tasks']) assert.equal(await page.locator(`#cabinet-expand-${other}`).getAttribute('aria-expanded'), String(expanded.has(other)), 'Expansion state is independent');
      await cabinetContract(page, `expanded ${[...expanded].join('+') || 'none'}`);
    }
  }
  await page.locator('#cabinet-expand-insights').click();
  await positions(page, list('insights'), '1920px/expanded insights', true);
  await viewport(page, 2560);
  await checkFade(page, list('insights'), '2560px/two rows', 'none');
  await cabinetContract(page, 'wide reflow');
  await viewport(page, 1920);
  await positions(page, list('insights'), '1920px/overflow restored', true);
  await page.locator('#cabinet-expand-insights').click();
  await cabinetContract(page, 'collapsed after reflow');
  report('search/filter shrink and reset, independent Insights/Tasks expansion in both orders, resize removes and restores fades');
}
async function wheelRouting(page) {
  await fresh(page, 1440, 900);
  async function wheel(key, internal) {
    const target = page.locator(list(key));
    await target.scrollIntoViewIfNeeded();
    await target.evaluate(element => element.scrollTo({top:0, behavior:'instant'}));
    await paint(page);
    const bounds = await target.boundingBox();
    const before = await page.evaluate(() => scrollY);
    const point = {x:bounds.x + Math.min(24, bounds.width / 2), y:Math.max(130, Math.min(850, bounds.y + bounds.height / 2))};
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 300);
    await page.waitForFunction(({selector, internal, before}) => internal ? document.querySelector(selector).scrollTop > 1 : scrollY > before + 1, {selector:list(key), internal, before});
    const after = await target.evaluate(element => ({page:scrollY, inner:element.scrollTop}));
    assert.ok(internal ? Math.abs(after.page - before) <= 1 : after.inner === 0, `${key}: wheel retains ${internal ? 'internal' : 'page'} scroll ownership`);
    await checkFade(page, list(key), `${key}/after wheel`, internal ? 'both' : 'none');
  }
  await wheel('insights', true);
  await page.locator('#cabinet-tab-outgoing').click();
  await checkFade(page, list('tasks'), 'one outgoing task', 'none');
  await wheel('tasks', false);
  report('wheel scrolls long list content and the page over a short list');
}
async function drawers(page) {
  await fresh(page, 1440, 650);
  await page.locator('[data-cabinet-kind="processes"] .card-title').first().click();
  await page.waitForFunction(() => {
    const dialog = document.querySelector('#process-drawer');
    return dialog?.open && !dialog.classList.contains('pd-is-loading') && !dialog.querySelector('.pd-main')?.inert;
  });
  await positions(page, '#process-drawer .pd-main', 'process drawer', true);
  await unmaskedChrome(page, '#process-drawer .pd-navigation', 'process navigation');
  await printMasks(page, 'process drawer');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#process-drawer').open);
  for (const width of [1440, 390]) {
    await viewport(page, width, 650);
    await page.locator('#cabinet-create-tasks').click();
    await page.locator('#task-drawer[open]').waitFor();
    await positions(page, '#task-drawer .task-drawer-content', `${width}px/type chooser`, true);
    await unmaskedChrome(page, '#task-drawer .task-drawer-header', 'type chooser header');
    await pageGeometry(page, 'type chooser');
    await printMasks(page, 'type chooser');
    await page.locator('#task-drawer [data-task-type="standard"]').click();
    await page.waitForFunction(() => document.querySelector('#task-flow')?.open && document.querySelector('#task-flow').dataset.mode === 'create' && !document.querySelector('#task-flow').inert);
    await positions(page, '#task-flow .tf-content', `${width}px/task form`, true);
    await unmaskedChrome(page, '#task-flow .tf-header,#task-flow .tf-footer', 'task form header and CTA');
    await pageGeometry(page, 'task form');
    await printMasks(page, 'task form');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#task-flow').open);
  }
  report('process drawer, task type chooser and task form fade only scrolling content; fixed controls and print remain unmasked');
}
async function navigation(page) {
  await fresh(page, 1440, 650);
  await positions(page, '.navigation', 'short-viewport navigation');
  await unmaskedChrome(page, '.header,.menu-heading,.menu-footer', 'navigation fixed chrome');
  await viewport(page, 1440, 1440);
  await checkFade(page, '.navigation', 'tall navigation', 'none');
  report('navigation fade matches actual overflow at short and tall viewports; heading and footer remain unmasked');
}

(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1440, height:1080}, reducedMotion:'reduce', offline:base.startsWith('file:')});
  await context.addInitScript(() => localStorage.setItem('bpm-registry-menu', 'expanded'));
  const page = await context.newPage(), errors = [], missing = [];
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('requestfailed', request => missing.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => {if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);});
  try {
    const tests = [cabinet, filtersAndReflow, wheelRouting, drawers, navigation], requested = process.argv.slice(2);
    assert.ok(requested.every(name => tests.some(test => test.name === name)), 'Requested test group exists');
    for (const test of tests.filter(test => !requested.length || requested.includes(test.name))) {
      try {await test(page);} catch (error) {
        await page.screenshot({path:path.join(output, `${test.name}-failure.png`)});
        error.message = `${test.name}: ${error.message}\nScreenshot: ${output}`;
        throw error;
      }
    }
    assert.deepEqual(errors, [], 'No browser runtime errors');
    assert.deepEqual(missing, [], 'No missing resources');
    report(`scroll-fade regression passed (${base.startsWith('file:') ? 'offline file' : 'local preview'})`);
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

/* Client Journey Details: registry entry points, linked processes, motion and layout.
 * Run with the bundled Node runtime, or set BPM_PLAYWRIGHT to its module path.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
const report = message => console.log(`PASS — ${message}`);
const near = (actual, expected, label, tolerance = 0.15) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

async function loadedDrawer(page) {
  await page.waitForFunction(() => {
    const drawer = document.querySelector('#process-drawer');
    return drawer.open && !drawer.classList.contains('pd-is-loading') && !drawer.querySelector('.pd-main').inert;
  });
}

async function loadedRegistry(page, view = 'cards') {
  await page.locator(view === 'cards' ? '.entity-card:not(.skeleton-card)' : '.registry-table tr[data-record]').first().waitFor();
}

async function openFrom(page, target, entity, checkLoading = false) {
  const started = Date.now();
  await target.click();
  const drawer = page.locator('#process-drawer');
  await drawer.locator('#pd-title').waitFor({state: 'attached'});
  assert.ok(await drawer.evaluate(element => element.open), 'Drawer is open');
  assert.equal(await drawer.getAttribute('data-pd-entity'), entity);
  if (checkLoading) {
    assert.ok(await drawer.evaluate(element => element.classList.contains('pd-is-loading')));
    assert.equal(await drawer.locator('.pd-main').getAttribute('aria-busy'), 'true');
    assert.ok(await drawer.locator('.pd-skeleton').count() > 0);
    await page.waitForTimeout(500);
    assert.ok(await drawer.evaluate(element => element.classList.contains('pd-is-loading')), 'Loading remains visible before two seconds');
  }
  await loadedDrawer(page);
  if (checkLoading) assert.ok(Date.now() - started >= 1800, 'Drawer includes the requested two-second loading phase');
  assert.equal(await drawer.locator('.pd-skeleton').count(), 0, 'Loading placeholders are removed');
  return drawer;
}

async function closeByEscape(page, trigger) {
  await page.keyboard.press('Escape');
  await page.locator('#process-drawer[open]').waitFor({state: 'hidden'});
  if (trigger) assert.ok(await trigger.evaluate(element => document.activeElement === element), 'Escape restores focus to the registry entry point');
}

async function verifyAnchors(drawer) {
  for (const name of ['assessment', 'benchmark', 'additional']) {
    assert.equal(await drawer.locator(`#pd-${name}`).count(), 1, `Journey section ${name} is present once`);
    assert.equal(await drawer.locator(`[data-pd-anchor="${name}"]`).count(), 1, `Journey section ${name} has an anchor`);
  }
  const targets = await drawer.locator('[data-pd-anchor]').evaluateAll(buttons => buttons.map(button => button.dataset.pdAnchor));
  for (const id of targets) assert.equal(await drawer.locator(`[id="pd-${id}"]`).count(), 1, `Anchor ${id} targets a rendered section`);
}

async function finalCounters(page, drawer) {
  const groups = drawer.locator('[data-pd-motion-group]');
  let checked = 0;
  for (let index = 0; index < await groups.count(); index++) {
    const group = groups.nth(index);
    if (!await group.isVisible()) continue;
    const counters = group.locator('[data-pd-motion-number], .efficiency[data-efficiency-percent]');
    if (!await counters.count()) continue;
    await group.scrollIntoViewIfNeeded();
    await page.waitForFunction(element => {
      const plain = [...element.querySelectorAll('[data-pd-motion-number]')].every(counter => counter.textContent.trim() === counter.dataset.pdMotionNumber.trim());
      const table = [...element.querySelectorAll('.efficiency[data-efficiency-percent]')].every(counter => {
        const number = counter.querySelector('[data-counter-number]');
        return !number || Math.abs(Number(number.textContent.replace(/\s/g, '').replace(',', '.')) - Number(counter.dataset.efficiencyPercent)) < 0.001;
      });
      return plain && table;
    }, await group.elementHandle());
    checked++;
  }
  assert.ok(checked > 0, 'At least one animated efficiency group reaches its final values');
}

async function noOverflow(page, width) {
  const dimensions = await page.evaluate(() => {
    const dialog = document.querySelector('#process-drawer'), main = dialog.querySelector('.pd-main');
    const rect = dialog.getBoundingClientRect();
    return {viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
      drawer: rect.width, left: rect.left, right: rect.right, mainClient: main.clientWidth, mainScroll: main.scrollWidth};
  });
  assert.ok(dimensions.document <= width + 1 && dimensions.body <= width + 1, `${width}px document overflow: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.left >= -1 && dimensions.right <= width + 1, `${width}px drawer fits the viewport: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.mainScroll <= dimensions.mainClient + 1, `${width}px main content does not overflow horizontally: ${JSON.stringify(dimensions)}`);
}

async function sourceData(page) {
  const result = await page.evaluate(() => {
    const row = window.BPM_STRUCTURE_PATHS.records.find(record => record.linkedProcesses.length > 5);
    const before = JSON.stringify(row), processes = window.BpmJourneyDetails.getProcesses(row);
    return {pathId: row.id, title: row.title, unchanged: JSON.stringify(row) === before,
      expected: row.linkedProcesses.map(record => ({id: record.id, title: record.title, owner: record.owner, efficiency: record.efficiency})),
      actual: processes.map(record => ({id: record.id, title: record.title, owner: record.owner, efficiency: record.efficiency}))};
  });
  assert.ok(result.unchanged, 'Opening a journey does not mutate Excel source records');
  assert.deepEqual(result.actual, result.expected, 'Existing Excel process relationships and record data are preserved exactly');
  return result;
}

async function glyphGeometry(page) {
  const measured = await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'journey-glyph-test-fixture';
    fixture.style.cssText = 'position:fixed;left:200px;top:200px;z-index:9999;display:flex;gap:80px;padding:80px;background:white;';
    fixture.innerHTML = [0, 23.5, 55.5, 100].map(value => window.BpmJourneyDetails.renderSphere(value)).join('');
    document.body.append(fixture);
    const results = [...fixture.querySelectorAll('.jd-efficiency-glyph')].map(element => {
      const rectangle = element.getBoundingClientRect(), sphere = element.querySelector('.jd-sphere-ball');
      const curtain = element.querySelector('.jd-curtain'), cr = curtain?.getBoundingClientRect(), sr = sphere.getBoundingClientRect();
      const css = curtain && getComputedStyle(curtain);
      return {value: Number(element.dataset.efficiencyPercent), width: rectangle.width, height: rectangle.height,
        overflow: getComputedStyle(element).overflow, sphereTop: sr.top - rectangle.top,
        curtain: cr ? {left: cr.left - rectangle.left, top: cr.top - rectangle.top, right: cr.right - rectangle.right,
          width: cr.width, height: cr.height, transform: css.transform, backdrop: css.backdropFilter || css.webkitBackdropFilter} : null};
    });
    fixture.remove();
    return results;
  });
  assert.equal(measured.length, 4);
  for (const glyph of measured) {
    near(glyph.width, 64, `${glyph.value}% glyph width`);
    near(glyph.height, 64, `${glyph.value}% glyph height`);
    if (glyph.value === 100) {assert.equal(glyph.curtain, null, '100% has no curtain node, including subpixel overlap'); continue;}
    assert.ok(glyph.curtain.left < 0 && glyph.curtain.right > 0, 'The horizontal curtain covers the complete sphere width');
    assert.ok(glyph.curtain.transform === 'none' || glyph.curtain.transform === 'matrix(1, 0, 0, 1, 0, 0)', 'Curtain remains horizontal rather than rotated');
    assert.match(glyph.curtain.backdrop, /blur\(/, 'Curtain blurs the background sphere');
    if (glyph.value === 0) {
      near(glyph.curtain.top, -32, '0% curtain raised above the root');
      near(glyph.curtain.height, 128, '0% curtain height');
      near(glyph.sphereTop, -9.974, '0% sphere raised to preserve blur');
      assert.equal(glyph.overflow, 'visible', '0% blur is not clipped by the glyph root');
    } else {
      near(glyph.curtain.top, 64 * glyph.value / 100, `${glyph.value}% horizontal curtain edge`);
      near(glyph.curtain.height, 96 - 64 * glyph.value / 100, `${glyph.value}% curtain extends below the sphere`);
    }
  }
}

async function mainFlow(browser) {
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}});
  const page = await context.newPage(), errors = [], failedAssets = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failedAssets.push(`${request.url()}: ${request.failure()?.errorText}`));
  try {
    await page.goto(url);
    await loadedRegistry(page);
    assert.equal(await page.locator('#paths-tab').getAttribute('aria-pressed'), 'true');
    const card = page.locator('.entity-card:not(.skeleton-card)').first(), trigger = card.locator('[data-detail]');
    const pathId = await card.getAttribute('data-record'), title = await trigger.innerText();
    const source = await sourceData(page);
    const demo = await page.evaluate(id => window.BpmJourneyDetails.getProcesses(window.BPM_DATA.find(row => row.id === id)).map(record => ({id: record.id, title: record.title})), pathId);
    assert.equal(demo.length, 4, 'Registry demo journey has four demonstration processes');
    let drawer = await openFrom(page, card.locator('.card-body'), 'paths', true);
    assert.equal(await drawer.locator('#pd-title').innerText(), title);
    assert.ok(await drawer.evaluate(element => element.classList.contains('jd-drawer')));
    await verifyAnchors(drawer);
    assert.equal(await page.locator('#detail-dialog[open]').count(), 0, 'Journey opens in the full Drawer rather than the old short dialog');
    const included = drawer.locator('#jd-included-processes');
    assert.equal(await included.locator('.jd-process-card').count(), 4);
    const initiallyVisible = await included.locator('.jd-process-card:visible').count();
    assert.ok(initiallyVisible > 0 && initiallyVisible < 4, 'Long included-process list starts collapsed');
    const toggle = drawer.locator('[data-jd-toggle-processes]');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    assert.equal(await included.locator('.jd-process-card:visible').count(), 4);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.match(await toggle.innerText(), /Свернуть/);
    await toggle.click();
    assert.equal(await included.locator('.jd-process-card:visible').count(), initiallyVisible);
    assert.match(await toggle.innerText(), /Показать все/);
    await finalCounters(page, drawer);
    const splitNumbers = drawer.locator('.jd-number[data-pd-motion-number]');
    for (let index = 0; index < await splitNumbers.count(); index++) {
      assert.equal(await splitNumbers.nth(index).locator(':scope > [data-pd-number-whole]').count(), 1, 'Counter animation preserves the integer typography');
      assert.equal(await splitNumbers.nth(index).locator(':scope > [data-pd-number-fraction]').count(), 1, 'Counter animation preserves the fractional typography');
    }
    report('card entry point, full journey sections and anchors, two-second shimmer, four-process expansion, final animated values');

    await toggle.click();
    const processButton = included.locator('[data-jd-process="0"]').first();
    drawer = await openFrom(page, processButton, 'processes', true);
    assert.equal(await drawer.locator('#pd-title').innerText(), demo[0].title);
    assert.ok(await drawer.locator('[data-pd-action="back"]').isVisible());
    await drawer.locator('[data-pd-action="back"]').click();
    await loadedDrawer(page);
    assert.equal(await drawer.getAttribute('data-pd-entity'), 'paths');
    assert.equal(await drawer.locator('#pd-title').innerText(), title);
    assert.equal(await drawer.locator('[data-jd-toggle-processes]').getAttribute('aria-expanded'), 'true', 'Back navigation restores expanded processes');
    assert.ok(await drawer.locator('[data-jd-process="0"]').first().evaluate(element => document.activeElement === element), 'Back navigation restores focus to the chosen process');
    await closeByEscape(page, trigger);
    report('included process detail, return to journey with expansion/focus preserved, Escape returns focus to the registry');

    await page.locator('#table-view').click(); await loadedRegistry(page, 'table');
    const tableRow = page.locator('.registry-table tr[data-record]').first(), tableTrigger = tableRow.locator('[data-detail]');
    const tableTitle = await tableTrigger.innerText();
    drawer = await openFrom(page, tableRow.locator('.card-description'), 'paths');
    assert.equal(await drawer.locator('#pd-title').innerText(), tableTitle);
    await closeByEscape(page, tableTrigger);
    await page.locator('#processes-tab').click(); await loadedRegistry(page, 'table');
    const processRow = page.locator('.registry-table tr[data-record]').first(), regularProcessTrigger = processRow.locator('[data-detail]');
    const processTitle = await regularProcessTrigger.innerText();
    drawer = await openFrom(page, regularProcessTrigger, 'processes');
    assert.equal(await drawer.locator('#pd-title').innerText(), processTitle);
    assert.equal(await drawer.locator('#pd-technology').count(), 1, 'Existing process detail retains its technology section');
    assert.equal(await drawer.locator('.jd-process-card, [data-pd-action="back"]').count(), 0, 'Independent process entry has no stale journey content/backlink');
    await closeByEscape(page, regularProcessTrigger);
    report('table row opens journey Drawer; ordinary process detail remains intact without stale journey state');

    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.evaluate(id => window.BpmProcessDrawer.open(window.BPM_STRUCTURE_PATHS.records.find(row => row.id === id)), source.pathId);
    await loadedDrawer(page);
    drawer = page.locator('#process-drawer');
    assert.equal(await drawer.locator('#pd-title').innerText(), source.title);
    assert.equal(await drawer.locator('#jd-included-processes .jd-process-card').count(), source.expected.length, 'Real Excel journey renders all original linked processes');
    for (const width of [1920, 1440, 390, 320]) {
      await page.setViewportSize({width, height: 1080});
      await noOverflow(page, width);
      for (const id of ['assessment', 'benchmark', 'additional']) {
        const anchor = drawer.locator(`[data-pd-anchor="${id}"]`);
        if (await anchor.isVisible()) await anchor.click();
        else await drawer.locator(`#pd-${id}`).scrollIntoViewIfNeeded();
        await noOverflow(page, width);
      }
      await drawer.locator('.pd-main').evaluate(element => element.scrollTo({top: 0, behavior: 'instant'}));
      await page.screenshot({path: `/tmp/bpm-journey-details-${width}.png`, fullPage: false});
    }
    await closeByEscape(page);
    await page.setViewportSize({width: 1920, height: 1080});
    await glyphGeometry(page);
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    assert.deepEqual(failedAssets, [], 'No missing or failed asset requests');
    report('real Excel links preserved, 1920/1440/390/320px layouts, reduced motion, 64px horizontal curtains with unclipped 0% and no curtain at 100%');
  } finally {await context.close();}
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {await mainFlow(browser);} finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

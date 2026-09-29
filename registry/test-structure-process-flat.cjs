/* Processes are terminal rows; client paths still disclose their processes.
 * Optional argv[2] is a standalone HTML copied into a fresh offline directory.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-process-flat-'));
let file = path.join(__dirname, 'index.html');
if (process.argv[2]) {
  file = path.join(output, 'renamed-offline.html');
  fs.copyFileSync(path.resolve(process.argv[2]), file);
}
const ready = page => page.waitForFunction(() => document.querySelector('#structure-list')?.getAttribute('aria-busy') === 'false');
const panel = (page, id) => page.locator(`[id="panel-${id}"]`);
async function openChain(page, chain) {
  for (const id of chain) {
    const heading = page.locator(`[data-expand="${id}"]`);
    if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
  }
}
async function terminal(page, label) {
  assert.ok(await page.locator('#structure-list tr[data-record-entity="processes"]').count(), `${label}: processes remain visible`);
  assert.equal(await page.locator('#structure-list [data-structure-related], #structure-list .structure-row-count, #structure-list .structure-linked-row, #structure-list tr[data-record-entity="paths"]').count(), 0, `${label}: no link, placeholder or hidden reverse KP panel`);
}
(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const context = await browser.newContext({offline: true, viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
    await context.addInitScript(() => {
      localStorage.clear();
      window.__flatCopies = [];
      Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async text => window.__flatCopies.push(text)}});
    });
    const page = await context.newPage(), errors = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(request.url()));
    await page.goto(`${pathToFileURL(file).href}#main`);
    await page.locator('#structure-toggle').click(); await ready(page);
    assert.equal(await page.locator('#structure-owner, #structure-average-toggle, #structure-chart-toggle').count(), 0, 'Removed owner and graph settings are absent, not hidden');
    assert.ok(await page.locator('#structure-list [data-chart-type="2"]').count(), 'Proportional efficiency charts remain enabled');
    assert.equal(await page.locator('#structure-list [data-chart-type="1"]').count(), 0, 'Leader comparison is no longer a structure mode');
    assert.ok(await page.locator('#structure-list [data-average-chart]').count(), 'Average efficiency stays visible');
    const fixture = await page.evaluate(() => {
      const kp = window.BPM_STRUCTURE_PATHS.records.find(row => row.code === 'КП-ДЕМО-0027');
      const productId = kp.productLinks[0].id;
      let chain;
      for (const block of window.BPM_STRUCTURE.roots) for (const division of block.children)
        if (division.children.some(product => product.id === productId)) chain = [block.id, division.id, productId];
      return {chain, id: kp.id, code: kp.code, processes: [...kp.linkedProcesses].sort((a, b) => a.number - b.number).map(row => row.id),
        snapshot: JSON.stringify([window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS])};
    });
    await openChain(page, fixture.chain); await terminal(page, 'Expanded product');
    const product = panel(page, fixture.chain.at(-1));
    const row = product.locator(':scope > .structure-table-scroll > table > tbody > tr[data-structure-record]').first();
    const processId = await row.getAttribute('data-structure-record');
    const source = await page.evaluate(id => window.BPM_STRUCTURE.records.find(record => record.id === id), processId);
    await row.locator('[data-structure-copy]').click();
    assert.equal(await page.evaluate(() => window.__flatCopies.at(-1)), `П ${source.number}`);
    await row.locator('[data-structure-detail]').click();
    await page.locator('#process-drawer').waitFor({state: 'visible'});
    await page.waitForFunction(title => document.querySelector('#pd-title')?.textContent === title, source.title);
    assert.equal(await page.locator('#process-drawer').getAttribute('data-pd-entity'), 'processes');
    await page.keyboard.press('Escape'); await page.locator('#process-drawer').waitFor({state: 'hidden'});
    await product.locator(':scope > .structure-table-scroll > table > thead [data-column="id"]').click();
    await terminal(page, 'After sorting and details');
    for (const kind of ['block', 'division', 'product']) await page.locator(`#structure-${kind} .select-visibility`).click();
    await terminal(page, 'All levels hidden');
    assert.equal(await page.locator('#structure-list > .structure-flat').count(), 1);
    for (const kind of ['block', 'division', 'product']) await page.locator(`#structure-${kind} .select-visibility`).click();
    await page.locator('#structure-search').fill(fixture.code);
    await page.locator(`[data-search-kind="paths"][data-search-id="${fixture.id}"]`).click();
    await ready(page); await terminal(page, 'KP filter in Processes');
    assert.equal(await page.locator(`#structure-chips [data-structure-filter="paths"][data-value="${fixture.id}"]`).count(), 1, 'KP remains available as a search filter');
    const filtered = await page.locator('#structure-list tr[data-record-entity="processes"]').evaluateAll(rows => [...new Set(rows.map(row => row.dataset.structureRecord))].sort());
    assert.deepEqual(filtered, [...fixture.processes].sort(), 'Existing KP → process source links still filter the tree');
    await page.locator('#structure-paths-tab').click(); await ready(page);
    await openChain(page, fixture.chain);
    const disclosure = page.locator(`[data-structure-path="${fixture.id}"]`).first();
    await disclosure.click();
    const linked = panel(page, (await disclosure.getAttribute('aria-controls')).slice(6));
    const linkedIds = await linked.locator('tr[data-record-entity="processes"]').evaluateAll(rows => rows.map(row => row.dataset.structureRecord));
    assert.deepEqual(linkedIds, fixture.processes, 'KP still discloses all four linked processes');
    assert.equal(await linked.locator('.structure-incoming-relationship').count(), fixture.processes.length, 'Participation tags remain visible');
    await page.locator('#structure-processes-tab').click(); await ready(page);
    await openChain(page, fixture.chain); await terminal(page, 'Return to Processes');
    for (const width of [1920, 1440, 390, 320]) {
      await page.setViewportSize({width, height: 900});
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await terminal(page, `${width}px`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px: no page overflow`);
    }
    assert.equal(await page.evaluate(() => JSON.stringify([window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS])), fixture.snapshot, 'Canonical source records and all links are unchanged');
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    console.log(`PASS — terminal process rows, flat hierarchy, copy/details/sort, preserved KP search filter and process disclosure, 4 responsive widths, immutable data and offline assets. ${output}`);
    await context.close();
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

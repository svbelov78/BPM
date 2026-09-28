/* Structure entity suggestions and exact filter chips, against the real workbook.
 * Default: isolated source file://. BPM_SEARCH_FILE=/path/to/standalone.html
 * relocates only the standalone file into an unrelated directory and runs offline.
 * No production writes or persistent browser storage are used.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-structure-search-'));
const standalone = process.env.BPM_SEARCH_FILE;
let file = path.join(__dirname, 'index.html');
if (standalone) {
  file = path.join(output, 'relocated-offline.html');
  fs.copyFileSync(path.resolve(standalone), file);
}
const url = `${pathToFileURL(file).href}#main`;
const report = message => console.log(`PASS — ${message}`);
const near = (a, b, label, tolerance = 1.5) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const ready = page => page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
const input = page => page.locator('#structure-search');
const popup = page => page.locator('#structure-search-suggestions');
const option = (page, kind, id) => popup(page).locator(`[data-search-kind="${kind}"][data-search-id="${id}"]`);
const chip = (page, kind, id) => page.locator(`#structure-chips [data-structure-filter="${kind}"][data-value="${id}"]`);

async function search(page, value) {
  await input(page).fill(value);
  await popup(page).waitFor({state: 'visible'});
  await page.waitForFunction(() => document.querySelector('#structure-search')?.getAttribute('aria-expanded') === 'true');
}
async function select(page, kind, record, query) {
  await search(page, query || record.code || record.name || record.title);
  const choice = option(page, kind, record.id);
  await choice.waitFor({state: 'visible'});
  assert.equal(await choice.getAttribute('role'), 'option');
  await choice.click();
  await chip(page, kind, record.id).waitFor({state: 'visible'});
  assert.equal(await input(page).inputValue(), '', 'Selecting a suggestion clears the draft query');
  await popup(page).waitFor({state: 'hidden'});
  await ready(page);
  assert.equal(await page.locator('#structure-chips [data-structure-filter="query"]').count(), 0, 'Draft query does not remain as a second filter');
}
async function reset(page) {
  if (await page.locator('#structure-reset').isVisible()) await page.locator('#structure-reset').click();
  else if (await input(page).inputValue()) await page.locator('#structure-clear-search').click();
  await ready(page);
  assert.equal(await page.locator('#structure-chips [data-structure-filter]').count(), 0);
  assert.equal(await input(page).inputValue(), '');
}
async function setEntity(page, entity) {
  if (await page.locator(`#structure-${entity}-tab`).getAttribute('aria-pressed') !== 'true') {
    await page.locator(`#structure-${entity}-tab`).click();
    await ready(page);
  }
}

// This oracle deliberately joins raw workbook occurrences, not the production
// filtering implementation or global linkedProcesses sets. The same path may
// link a process in one product but not in another product where both exist.
async function assertFiltered(page, filters, entity, label) {
  const result = await page.evaluate(({filters, entity}) => {
    const models = {paths: window.BPM_STRUCTURE_PATHS, processes: window.BPM_STRUCTURE};
    const pathRows = models.paths.records;
    const expected = {};
    const matches = (row, productId) => {
      if (filters.product?.length && !filters.product.includes(productId)) return false;
      if (entity === 'processes') {
        if (filters.processes?.length && !filters.processes.includes(row.id)) return false;
        return !filters.paths?.length || pathRows.some(kp => filters.paths.includes(kp.id) && kp.sourceLinks.some(link => link.productId === productId && link.processId === row.id));
      }
      if (filters.paths?.length && !filters.paths.includes(row.id)) return false;
      return !filters.processes?.length || row.sourceLinks.some(link => link.productId === productId && filters.processes.includes(link.processId));
    };
    for (const product of models[entity].nodes.filter(node => node.kind === 'product')) {
      const rows = product.records.filter(row => matches(row, product.id)).sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
      if (rows.length) expected[product.id] = rows.map(row => row.id);
    }
    const actual = {};
    for (const product of document.querySelectorAll('#structure-list [data-kind="product"]')) {
      const id = product.dataset.node;
      const heading = product.querySelector(':scope > .structure-heading');
      const allAncestorsOpen = [...function* () {let current = product; while (current?.matches('.structure-node')) {yield current; current = current.parentElement?.closest('.structure-node');}}()].every(node => node.querySelector(':scope > .structure-heading')?.getAttribute('aria-expanded') === 'true');
      const graph = heading.querySelector('[data-chart]');
      actual[id] = {
        allAncestorsOpen,
        rows: [...product.querySelectorAll(':scope > .structure-children > .structure-table-scroll > .structure-table > tbody > tr[data-structure-record]')].map(row => row.dataset.structureRecord),
        total: Number(graph?.querySelector('[data-structure-number]')?.dataset.structureNumber),
        buckets: [...(graph?.querySelectorAll('.structure-segment') || [])].map(segment => [Number(segment.dataset.bucket), Number(segment.dataset.count)])
      };
    }
    const expectedBuckets = Object.fromEntries(Object.entries(expected).map(([id, ids]) => {
      const buckets = [0, 0, 0, 0, 0]; models[entity].records.filter(row => ids.includes(row.id)).forEach(row => buckets[row.bucket]++);
      return [id, buckets];
    }));
    return {expected, actual, expectedBuckets, count: Number(document.getElementById(`structure-${entity === 'paths' ? 'path' : 'process'}-count`).textContent.replace(/\D/g, ''))};
  }, {filters, entity});
  assert.deepEqual(Object.keys(result.actual).sort(), Object.keys(result.expected).sort(), `${label}: exact product occurrences`);
  for (const [id, expected] of Object.entries(result.expected)) {
    const actual = result.actual[id];
    assert.equal(actual.allAncestorsOpen, true, `${label}: all matching ancestors and products automatically open`);
    assert.deepEqual(actual.rows, expected.slice(0, 50), `${label}: exact records inside ${id}`);
    assert.equal(actual.total, expected.length, `${label}: graph count reflects filtered rows`);
    const buckets = [0, 0, 0, 0, 0]; actual.buckets.forEach(([index, count]) => {buckets[index] = count;});
    assert.deepEqual(buckets, result.expectedBuckets[id], `${label}: graph distribution is derived from matching records`);
  }
  assert.equal(result.count, new Set(Object.values(result.expected).flat()).size, `${label}: tab count deduplicates entities`);
  return result;
}

async function geometry(page, width) {
  await page.setViewportSize({width, height: 1080});
  await search(page, 'банков');
  await popup(page).locator('[role="option"]').first().waitFor({state: 'visible'});
  const metrics = await page.evaluate(() => {
    const rect = selector => {const r = document.querySelector(selector).getBoundingClientRect(); return {x: r.x, right: r.right, width: r.width, y: r.y, bottom: r.bottom};};
    const suggestions = document.getElementById('structure-search-suggestions');
    const copies = [...suggestions.querySelectorAll('[data-search-copy] img')].map(image => {const r = image.getBoundingClientRect(); return {w: r.width, h: r.height};});
    const search = document.querySelector('#structure-search-wrap > img').getBoundingClientRect();
    return {field: rect('#structure-search-wrap'), popup: rect('#structure-search-suggestions'), scrollWidth: document.documentElement.scrollWidth, width: innerWidth, copies, search: {w: search.width, h: search.height}, brokenImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src)};
  });
  if (width > 520) {
    near(metrics.popup.x, metrics.field.x, `${width}: popup left aligns with search field`);
    near(metrics.popup.width, metrics.field.width, `${width}: popup width matches search field`);
  } else {
    near(metrics.popup.width, Math.min(Math.max(metrics.field.width, 280), width - 16), `${width}: mobile popup fits complete IDs inside viewport`);
    assert.ok(metrics.popup.x >= 7 && metrics.popup.right <= width - 7, `${width}: mobile popup keeps viewport gutters`);
  }
  assert.ok(metrics.popup.right <= width + 1 && metrics.popup.x >= -1, `${width}: suggestions stay in viewport`);
  assert.ok(metrics.scrollWidth <= width + 1, `${width}: no document horizontal overflow`);
  near(metrics.search.w, 24, 'Native search icon width'); near(metrics.search.h, 24, 'Native search icon height');
  assert.ok(metrics.copies.length, 'ID copy actions use icons');
  metrics.copies.forEach(icon => {near(icon.w, 16, 'Copy icon width'); near(icon.h, 16, 'Copy icon height');});
  assert.deepEqual(metrics.brokenImages, [], 'All local/offline assets are loaded');
  await page.screenshot({path: path.join(output, `search-${width}.png`)});
  await input(page).press('Escape'); await popup(page).waitFor({state: 'hidden'});
  await page.locator('#structure-clear-search').click(); await ready(page);
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const context = await browser.newContext({offline: true, viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
    await context.addInitScript(() => {
      window.__searchCopies = [];
      Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async text => {window.__searchCopies.push(text);}}});
    });
    const page = await context.newPage(), errors = [], failed = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('request', request => {if (/^https?:/i.test(request.url())) external.push(request.url());});
    await page.goto(url);
    await page.locator('#structure-toggle').click(); await ready(page);
    assert.equal(await input(page).getAttribute('role'), 'combobox');
    const baseline = await page.evaluate(() => JSON.stringify([window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS]));
    const examples = await page.evaluate(() => {
      const kp = window.BPM_STRUCTURE_PATHS.records.find(row => new Set(row.sourceLinks.map(link => link.productId)).size > 1 && row.linkedProcesses.length > 1);
      const link = kp.sourceLinks.find(link => link.processId);
      const product = window.BPM_STRUCTURE.nodes.find(node => node.id === link.productId);
      const first = window.BPM_STRUCTURE.records.find(row => row.id === link.processId);
      const second = window.BPM_STRUCTURE.records.find(row => row.id !== first.id && row.title !== first.title);
      return {path: {id: kp.id, code: kp.code, title: kp.title}, product: {id: product.id, name: product.name}, first: {id: first.id, code: first.code, title: first.title}, second: {id: second.id, code: second.code, title: second.title}};
    });

    await search(page, examples.first.code);
    assert.equal(await popup(page).getAttribute('role'), 'listbox');
    await option(page, 'processes', examples.first.id).waitFor({state: 'visible'});
    const copy = option(page, 'processes', examples.first.id).locator('[data-search-copy]');
    await copy.click();
    assert.equal(await page.locator('#structure-chips [data-structure-filter="processes"]').count(), 0, 'Copy badge does not select entity');
    assert.equal(await input(page).inputValue(), examples.first.code, 'Copy preserves search draft');
    assert.ok((await page.evaluate(() => window.__searchCopies)).length, 'ID copy action writes the clipboard');
    await select(page, 'processes', examples.first);
    await assertFiltered(page, {processes: [examples.first.id]}, 'processes', 'One process');
    await select(page, 'processes', examples.second);
    await assertFiltered(page, {processes: [examples.first.id, examples.second.id]}, 'processes', 'Two process selections use OR');
    await search(page, examples.first.code);
    const duplicate = option(page, 'processes', examples.first.id);
    if (await duplicate.count() && await duplicate.getAttribute('aria-disabled') !== 'true' && !await duplicate.isDisabled()) await duplicate.click();
    else await input(page).press('Escape');
    assert.equal(await chip(page, 'processes', examples.first.id).count(), 1, 'Repeated selection cannot duplicate a chip');
    if (await input(page).inputValue()) {await page.locator('#structure-clear-search').click(); await ready(page);}
    await chip(page, 'processes', examples.second.id).click(); await ready(page);
    await assertFiltered(page, {processes: [examples.first.id]}, 'processes', 'Removing only one selected process');
    await reset(page);
    report('process ID search, isolated copy action, exact filters, OR, duplicate prevention, chip removal and reset');

    // Product suggestions are available even when the current tab is Processes.
    await select(page, 'product', examples.product);
    await assertFiltered(page, {product: [examples.product.id]}, 'processes', 'Product exact membership');
    await select(page, 'paths', examples.path);
    await assertFiltered(page, {product: [examples.product.id], paths: [examples.path.id]}, 'processes', 'Product AND path occurrence');
    await select(page, 'processes', examples.first);
    const combined = {product: [examples.product.id], paths: [examples.path.id], processes: [examples.first.id]};
    await assertFiltered(page, combined, 'processes', 'Product AND path AND process');
    await setEntity(page, 'paths');
    await assertFiltered(page, combined, 'paths', 'The same three filters in Paths tab');
    await chip(page, 'product', examples.product.id).click(); await ready(page);
    await assertFiltered(page, {paths: [examples.path.id], processes: [examples.first.id]}, 'paths', 'Shared path/process relationship remains occurrence-aware');
    await setEntity(page, 'processes');
    await assertFiltered(page, {paths: [examples.path.id], processes: [examples.first.id]}, 'processes', 'Reciprocal occurrence-aware relationship');
    await reset(page);
    report('all three entity kinds across both tabs, exact product scoping, AND across kinds, occurrence-aware reciprocal КП ↔ process links');

    const phrase = examples.first.title.split(/\s+/).filter(word => word.length > 3).slice(0, 2).join(' ');
    await search(page, phrase.toUpperCase());
    const highlighted = option(page, 'processes', examples.first.id);
    await highlighted.waitFor({state: 'visible'});
    assert.ok(await highlighted.locator('mark').count() > 0, 'Matched title words are highlighted case-insensitively');
    assert.ok((await highlighted.innerText()).includes(examples.first.title), 'The complete title remains readable');
    await input(page).press('Escape'); await popup(page).waitFor({state: 'hidden'});
    assert.equal(await input(page).inputValue(), phrase.toUpperCase(), 'Escape only dismisses suggestions, preserving draft');
    await input(page).press('ArrowDown'); await popup(page).waitFor({state: 'visible'});
    const selectedId = await input(page).getAttribute('aria-activedescendant');
    assert.ok(selectedId, 'Keyboard navigation exposes active option');
    const active = page.locator(`[id="${selectedId}"]`);
    const selected = {kind: await active.getAttribute('data-search-kind'), id: await active.getAttribute('data-search-id')};
    await input(page).press('Enter');
    await chip(page, selected.kind, selected.id).waitFor({state: 'visible'}); await ready(page);
    assert.equal(await input(page).inputValue(), '');
    await reset(page);
    await search(page, 'банков'); await page.locator('#structure-processes-tab').click();
    await popup(page).waitFor({state: 'hidden'});
    await page.locator('#structure-clear-search').click(); await ready(page);
    await search(page, 'неттакойсущности987654321');
    await ready(page);
    assert.equal(await popup(page).locator('[role="option"]').count(), 0, 'No-result query has no selectable stale options');
    await page.locator('#structure-clear-search').click(); await ready(page);
    report('case-insensitive title highlighting, keyboard selection, Escape, outside dismissal and empty-result state');

    for (const width of [1920, 390, 320]) await geometry(page, width);
    assert.equal(await page.evaluate(() => JSON.stringify([window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS])), baseline, 'Search/filtering never mutates source models or score data');
    assert.deepEqual(errors, [], 'No runtime errors');
    assert.deepEqual(failed, [], 'No failed assets or offline requests');
    assert.deepEqual(external, [], 'No remote dependencies');
    report(`1920/390/320px anchored suggestions, native 24/16px icons, immutable data, no runtime/network errors; ${standalone ? 'relocated standalone' : 'source'}; screenshots: ${output}`);
    await context.close();
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

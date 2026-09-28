/* Browser regression for display levels, real-workbook filters and flat tables.
 * Run with bundled Node; BPM_PLAYWRIGHT may point to another Playwright module.
 * Optional argv[2]: absolute standalone HTML path. Only that file is copied into
 * an isolated temporary directory and exercised with networking disabled.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL, fileURLToPath} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const standalone = process.argv[2];
const output = standalone ? fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-levels-standalone-')) : null;
let file = path.join(__dirname, 'index.html');
if (standalone) {
  assert(path.isAbsolute(standalone), 'Provide an absolute standalone HTML path');
  file = path.join(output, 'relocated-offline.html');
  fs.copyFileSync(standalone, file);
}
const url = `${pathToFileURL(file).href}#main`;
const kinds = ['block', 'division', 'product'];
const decodedAssets = new Set();
const report = message => console.log(`PASS — ${message}`);
const ready = page => page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
const eye = (page, kind) => page.locator(`#structure-${kind} .select-visibility`);
const chip = (page, kind, id) => page.locator(`#structure-chips [data-structure-filter="${kind}"][data-value="${id}"]`);
const panel = (page, id) => page.locator(`[id="panel-${id}"]`);
const recordRows = container => container.locator(':scope > .structure-table-scroll > .structure-table > tbody > tr[data-structure-record]');
const rowIds = container => recordRows(container).evaluateAll(rows => rows.map(row => row.dataset.structureRecord));

async function decodedAsset(locator, filename, size) {
  const actual = await locator.evaluate(async image => {
    await image.decode();
    return {src: image.currentSrc || image.src, width: image.naturalWidth, height: image.naturalHeight};
  });
  assert.deepEqual([actual.width, actual.height], [size, size], `${filename}: SVG decodes at native size`);
  if (standalone) assert(actual.src.startsWith('data:image/svg+xml'), `${filename}: standalone embeds the SVG`);
  const expectedPath = path.join(__dirname, 'assets', filename);
  if (actual.src.startsWith('data:')) {
    const comma = actual.src.indexOf(','), metadata = actual.src.slice(0, comma), data = actual.src.slice(comma + 1);
    const bytes = metadata.includes(';base64') ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data));
    assert(bytes.equals(fs.readFileSync(expectedPath)), `${filename}: embedded bytes match the source asset`);
  } else assert.equal(fileURLToPath(actual.src), expectedPath);
  decodedAssets.add(filename);
}

async function entity(page, next) {
  const tab = page.locator(`#structure-${next}-tab`);
  if (await tab.getAttribute('aria-pressed') !== 'true') {await tab.click(); await ready(page);}
}
async function levels(page, hidden) {
  for (const kind of kinds) {
    const shown = !hidden.includes(kind), button = eye(page, kind);
    if ((await button.getAttribute('aria-pressed') === 'true') !== shown) await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), String(shown));
    assert.equal(await button.isDisabled(), false, `${kind}: eye remains operable while its filter is disabled`);
    assert.equal(await page.locator(`#structure-${kind}-input`).isDisabled(), !shown);
    assert.equal(await page.locator(`#structure-${kind} .select-toggle`).isDisabled(), !shown);
    assert.equal(await page.locator(`#structure-${kind}-list`).count(), 0, 'An eye click does not open the option list');
    await decodedAsset(button.locator('img'), `structure-eye${shown ? '' : '-off'}.svg`, 24);
    if (!shown) await decodedAsset(page.locator(`#structure-${kind} .select-toggle img`), 'field-chevron-disabled-16.svg', 16);
  }
  assert.equal(await page.locator('#structure-list').getAttribute('aria-busy'), 'false', 'Visibility changes immediately without a loading cycle');
}
async function open(page, id) {
  const heading = page.locator(`[data-expand="${id}"]`);
  if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
}
async function selectValue(page, kind, id) {
  await page.locator(`#structure-${kind}-input`).click();
  await page.locator(`#structure-${kind}-list [data-option="${id}"]`).click();
  await page.keyboard.press('Escape');
  await ready(page);
}
async function reset(page) {
  if (await page.locator('#structure-reset').isVisible()) {await page.locator('#structure-reset').click(); await ready(page);}
  assert.equal(await page.locator('#structure-chips [data-structure-filter]').count(), 0);
}
async function counts(page) {
  return page.evaluate(() => Object.fromEntries(['paths', 'processes'].map(entity => [entity,
    Number(document.getElementById(`structure-${entity === 'paths' ? 'path' : 'process'}-count`).textContent.replace(/\s/g, ''))])));
}
function parseCsv(csv) {
  const rows = [], row = [];
  let value = '', quoted = false;
  for (let index = csv.charCodeAt(0) === 0xfeff ? 1 : 0; index < csv.length; index++) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {value += '"'; index++;} else quoted = !quoted;
    } else if (character === ';' && !quoted) {row.push(value); value = '';}
    else if ((character === '\r' || character === '\n') && !quoted) {
      if (character === '\r' && csv[index + 1] === '\n') index++;
      row.push(value); rows.push(row.splice(0)); value = '';
    } else value += character;
  }
  if (value || row.length) {row.push(value); rows.push(row);}
  return rows;
}
async function exportedIds(page, scope = 'filtered') {
  await page.locator('#export').click();
  await page.locator(`#export-form [value="${scope}"]`).check();
  const waiting = page.waitForEvent('download');
  await page.locator('#export-form [type="submit"]').click();
  const download = await waiting;
  assert.equal(await download.failure(), null);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return parseCsv(Buffer.concat(chunks).toString('utf8')).slice(1).map(row => row[1]).sort();
}

async function checkCombination(page, entityName, mask) {
  const hidden = kinds.filter((kind, index) => mask & (1 << index));
  await levels(page, hidden);
  const state = await page.evaluate(({entityName, hidden}) => {
    const model = entityName === 'paths' ? window.BPM_STRUCTURE_PATHS : window.BPM_STRUCTURE;
    const firstKind = ['block', 'division', 'product'].find(kind => !hidden.includes(kind));
    const expected = firstKind ? model.nodes.filter(node => node.kind === firstKind)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ru')).map(node => ({id: node.id, total: node.total})) : [];
    const actual = [...document.querySelectorAll('#structure-list > .structure-node')].map(node => ({
      id: node.dataset.node,
      total: Number(node.querySelector(':scope > .structure-heading [data-structure-number]').dataset.structureNumber),
      level: node.style.getPropertyValue('--level')
    }));
    const byId = new Map(model.nodes.map(node => [node.id, node]));
    const ordered = actual.every((node, index) => !index || actual[index - 1].total > node.total ||
      (actual[index - 1].total === node.total && byId.get(actual[index - 1].id).name.localeCompare(byId.get(node.id).name, 'ru') <= 0));
    return {expected, actual, ordered, total: model.total,
      hiddenVisible: [...document.querySelectorAll('#structure-list .structure-node')].some(node => hidden.includes(node.dataset.kind)),
      ids: model.records.slice().sort((a, b) => a.number - b.number).slice(0, 50).map(row => row.id)};
  }, {entityName, hidden});
  const byId = (a, b) => a.id.localeCompare(b.id);
  assert.deepEqual(state.actual.map(({id, total}) => ({id, total})).sort(byId), state.expected.slice().sort(byId), `${entityName}/${mask}: promoted roots and aggregates`);
  assert.equal(state.ordered, true, 'Promoted siblings are sorted across their original parents');
  assert(state.actual.every(node => node.level === '0'), 'Promoted roots start at rendered depth zero');
  assert.equal(state.hiddenVisible, false, 'Hidden group kinds do not remain in the rendered tree');
  assert.equal((await counts(page))[entityName], state.total, 'Tab count does not depend on visible levels');
  if (mask === 7) {
    const root = panel(page, `structure-flat-${entityName}`);
    assert.equal(await root.getAttribute('role'), 'region');
    assert.match(await root.getAttribute('aria-label'), entityName === 'paths' ? /клиентские пути/i : /процессы/i);
    assert.deepEqual(await rowIds(root), state.ids, 'Fully flat table uses unique entities and normal pagination');
  } else {
    const first = state.expected[0].id;
    await open(page, first);
    const children = await panel(page, first).locator(':scope > .structure-node').evaluateAll(nodes => nodes.map(node => ({kind: node.dataset.kind, level: node.style.getPropertyValue('--level')})));
    assert(children.every(node => !hidden.includes(node.kind) && node.level === '1'), 'Visible children have compressed depth');
    if (hidden.includes('product') && !children.length) assert((await recordRows(panel(page, first)).count()) > 0, 'A retained ancestor renders the promoted record table');
  }
}

async function flatTable(page, entityName) {
  await levels(page, kinds);
  const id = `structure-flat-${entityName}`, root = panel(page, id);
  const expected = await page.evaluate(entityName => {
    const model = entityName === 'paths' ? window.BPM_STRUCTURE_PATHS : window.BPM_STRUCTURE;
    return model.records.slice().sort((a, b) => b.number - a.number).map(row => ({id: row.id, csv: String(row.numberSimulated ? row.code : row.number)}));
  }, entityName);
  await root.locator(':scope > .structure-table-scroll thead [data-column="id"]').click();
  assert.deepEqual(await rowIds(root), expected.slice(0, 50).map(row => row.id), 'Flat sorting runs before slicing');
  await root.locator(':scope > .structure-pagination [data-page="2"]:not([data-direction])').click();
  assert.deepEqual(await rowIds(root), expected.slice(50, 100).map(row => row.id), 'Flat next page uses all unique records');
  await page.locator(`[id="structure-size-${id}-input"]`).click();
  await page.locator(`[id="structure-size-${id}-list"] [data-option="25"]`).click();
  assert.deepEqual(await rowIds(root), expected.slice(0, 25).map(row => row.id), 'Changing page size returns to the first page and retains sort');
  const related = root.locator(':scope > .structure-table-scroll [data-structure-related]').first();
  const controls = await related.getAttribute('aria-controls');
  await related.click();
  assert.equal(await related.getAttribute('aria-expanded'), 'true');
  const incoming = page.locator(`[id="${controls}"]`);
  assert((await incoming.locator('[data-structure-record]').count()) > 0, 'Related records expand from a flat table');
  const linkedEntities = await incoming.locator('[data-structure-record]').evaluateAll(rows => [...new Set(rows.map(row => row.dataset.recordEntity))]);
  assert.deepEqual(linkedEntities, [entityName === 'paths' ? 'processes' : 'paths']);
  assert.deepEqual(await exportedIds(page, 'page'), expected.slice(0, 25).map(row => row.csv).sort(), 'Page export excludes the expanded opposite entity');
  await related.click();
  report(`${entityName}: flat table sorting, pagination, page size, relationship expansion and current-page export`);
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const context = await browser.newContext({offline: true, viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
    // Shorten only the mock loading delay; search, focus and all other timers run normally.
    await context.addInitScript(() => {
      const timeout = window.setTimeout;
      window.setTimeout = function(callback, delay, ...args) {return timeout.call(window, callback, delay === 2000 ? 30 : delay, ...args);};
    });
    const page = await context.newPage(), errors = [], failed = [], outsideRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('request', request => {
      if (standalone && (/^https?:/i.test(request.url()) || (request.url().startsWith('file:') && request.url().split('#')[0] !== pathToFileURL(file).href))) outsideRequests.push(request.url());
    });
    await page.goto(url);
    await page.locator('#structure-toggle').click(); await ready(page);
    await decodedAsset(page.locator('.structure-level-separator').first(), 'structure-level-separator.svg', 16);
    if (output) await page.locator('.structure-level-filters').screenshot({path: path.join(output, 'levels-visible.png')});
    const sourceBefore = await page.evaluate(() => JSON.stringify([window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS]));
    for (const current of ['processes', 'paths']) {
      await entity(page, current);
      for (let mask = 0; mask < 8; mask++) await checkCombination(page, current, mask);
      report(`${current}: all eight group-level combinations, unchanged counts and promoted rows`);
      await flatTable(page, current);
    }

    await entity(page, 'processes'); await levels(page, []);
    const fixture = await page.evaluate(() => {
      const process = window.BPM_STRUCTURE, paths = window.BPM_STRUCTURE_PATHS;
      const product = process.nodes.filter(node => node.kind === 'product' && !node.isPlaceholder && node.total > 50)
        .sort((a, b) => b.total - a.total)[0];
      const division = process.nodes.find(node => node.children.some(child => child.id === product.id));
      const block = process.roots.find(node => node.children.some(child => child.id === division.id));
      return {product: {id: product.id, code: `Пр ${product.productIds.find(id => /^\d+$/.test(id))}`, count: product.total},
        division: division.id, block: {id: block.id, count: block.total,
          pathCount: paths.roots.find(node => node.id === block.id).total,
          csv: block.records.map(row => String(row.number)).sort()}};
    });
    for (const id of [fixture.block.id, fixture.division, fixture.product.id]) await open(page, id);
    const original = panel(page, fixture.product.id);
    await original.locator(':scope > .structure-table-scroll thead [data-column="id"]').click();
    await original.locator(':scope > .structure-pagination [data-page="2"]:not([data-direction])').click();
    const savedRows = await rowIds(original);
    await levels(page, kinds); await levels(page, []);
    for (const id of [fixture.block.id, fixture.division, fixture.product.id]) assert.equal(await page.locator(`[data-expand="${id}"]`).getAttribute('aria-expanded'), 'true');
    assert.deepEqual(await rowIds(original), savedRows);
    assert.equal(await original.locator(':scope > .structure-pagination [aria-current="page"]').innerText(), '2');
    assert.equal(await original.locator(':scope > .structure-table-scroll th[aria-sort]').getAttribute('aria-sort'), 'descending');
    report('Original accordion, table sort and pagination state return after all levels are hidden and restored');

    await selectValue(page, 'block', fixture.block.id);
    assert.equal(await chip(page, 'block', fixture.block.id).count(), 1);
    const beforeHide = await counts(page);
    assert.deepEqual(beforeHide, {paths: fixture.block.pathCount, processes: fixture.block.count});
    const exportBefore = await exportedIds(page);
    assert.deepEqual(exportBefore, fixture.block.csv);
    await levels(page, ['division', 'product']); await open(page, fixture.block.id);
    assert.deepEqual(await counts(page), beforeHide);
    assert.equal(await chip(page, 'block', fixture.block.id).count(), 1);
    assert.deepEqual(await exportedIds(page), exportBefore, 'Visibility does not change filtered export');
    await levels(page, kinds);
    if (output) await page.locator('.structure-level-filters').screenshot({path: path.join(output, 'levels-hidden.png')});
    assert.equal(await page.locator('#structure-block-input').inputValue(), 'Выбрано 1', 'The hidden block retains its selection');
    assert.equal(await chip(page, 'block', fixture.block.id).count(), 1);
    assert.deepEqual(await counts(page), beforeHide);
    await eye(page, 'block').focus(); await page.keyboard.press('Space');
    assert.equal(await eye(page, 'block').getAttribute('aria-pressed'), 'true', 'Keyboard can show a disabled filter');
    assert.equal(await page.locator('#structure-block-input').inputValue(), 'Выбрано 1');
    await eye(page, 'block').focus(); await page.keyboard.press('Enter');
    assert.equal(await eye(page, 'block').getAttribute('aria-pressed'), 'false', 'Keyboard can hide a visible filter');
    report('Selected block survives hidden levels, disabled fields, chips, filtered counts/export and keyboard eye controls');

    await reset(page); await levels(page, []);
    await selectValue(page, 'product', fixture.product.id);
    assert.equal(await chip(page, 'product', fixture.product.id).count(), 1);
    assert.equal((await counts(page)).processes, fixture.product.count);
    await levels(page, ['product']);
    assert.equal(await page.locator('#structure-product-input').inputValue(), 'Выбрано 1');
    assert.equal((await counts(page)).processes, fixture.product.count);
    await chip(page, 'product', fixture.product.id).click(); await ready(page);
    assert.equal(await page.locator('#structure-product-input').inputValue(), '', 'Removing a chip updates the hidden product selector');
    await levels(page, []);
    await page.locator('#structure-search').fill(fixture.product.code);
    const suggestion = page.locator(`#structure-search-suggestions [data-search-kind="product"][data-search-id="${fixture.product.id}"]`);
    await suggestion.waitFor({state: 'visible'}); await suggestion.click(); await ready(page);
    assert.equal(await chip(page, 'product', fixture.product.id).count(), 1);
    assert.equal(await page.locator('#structure-product-input').inputValue(), 'Выбрано 1', 'Search product choice synchronizes the select');
    await page.locator('#structure-product-input').click();
    assert.equal(await page.locator(`#structure-product-list [data-option="${fixture.product.id}"]`).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Escape');
    await page.locator('#structure-product .select-toggle').click(); await ready(page);
    assert.equal(await chip(page, 'product', fixture.product.id).count(), 0, 'Clearing the select removes the search-created product chip');
    report('Product selector, hidden selection, exact product chip and search suggestion share one filter state');

    assert.equal(await page.evaluate(() => JSON.stringify([window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS])), sourceBefore, 'UI operations do not mutate source models');
    assert.deepEqual(errors, []);
    assert.deepEqual([...decodedAssets].sort(), ['field-chevron-disabled-16.svg', 'structure-eye-off.svg', 'structure-eye.svg', 'structure-level-separator.svg']);
    assert.deepEqual(failed, [], 'All requested resources load successfully');
    assert.deepEqual(outsideRequests, [], 'Isolated standalone never requests neighboring files or remote resources');
    report(`All four new SVG assets decode and match source bytes${standalone ? ' from embedded data URLs' : ''}`);
    if (output) report(`Isolated offline standalone and eye-state screenshots: ${output}`);
    await context.close();
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

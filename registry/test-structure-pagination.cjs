/* Standard Table/Pagination threshold and independent structure-list state.
 * Run with the bundled Node runtime, or set BPM_PLAYWRIGHT to its module path.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
const totals = [0, 1, 49, 50, 51, 101];
const report = message => console.log(`PASS — ${message}`);

function installFixtures() {
  let original;
  Object.defineProperty(window, 'BpmStructure', {
    configurable: true,
    get() {return original;},
    set(api) {
      original = {...api, create(options) {
        const processSource = window.BPM_STRUCTURE;
        for (const name of ['BPM_STRUCTURE', 'BPM_STRUCTURE_PATHS']) {
          const source = window[name], entity = name.endsWith('_PATHS') ? 'paths' : 'processes';
          const roots = [], nodes = [], records = [];
          const record = (kind, scope, index) => ({
            ...(kind === 'paths' ? window.BPM_STRUCTURE_PATHS.records[0] : processSource.records[0]),
            id: `pagination-${kind}-${scope}-${index}`, entity: kind, number: index + 1,
            code: `${kind === 'paths' ? 'КП' : 'П'}-${scope}-${index + 1}`,
            title: `Fixture ${scope} record ${index + 1}${scope === 'product-101' && index < 49 ? ' filter-subset-101' : ''}`,
            bucket: index % 5, efficiency: [91, 76, 56, 31, null][index % 5],
            owner: 'Тестовый Владелец', owners: ['Тестовый Владелец'],
            tags: [], status: 'Исполняется', date: '2026-09-21',
            linkedProcesses: [], linkedProcessIds: [], count: 0, processCount: 0,
            products: [`Fixture ${scope}`]
          });
          function group(scope, rows) {
            const buckets = [0, 0, 0, 0, 0]; rows.forEach(row => buckets[row.bucket]++);
            const make = kind => ({
              ...source.nodes.find(node => node.kind === kind),
              id: `pagination-${entity}-${scope}-${kind}`, kind,
              name: `Fixture ${scope} ${kind}`, owner: 'Тестовый Руководитель', owners: ['Тестовый Руководитель'],
              records: rows, total: rows.length, buckets: buckets.slice(), children: []
            });
            const root = make('block'), division = make('division'), product = make('product');
            root.children = [division]; division.children = [product];
            roots.push(root); nodes.push(root, division, product); records.push(...rows);
          }
          for (const count of [0, 1, 49, 50, 51, 101]) {
            const scope = `product-${count}`;
            group(scope, Array.from({length: count}, (_, index) => record(entity, scope, index)));
            if (entity === 'paths') {
              const linkScope = `linked-${count}`, row = record('paths', linkScope, 0);
              row.linkedProcesses = Array.from({length: count}, (_, index) => record('processes', linkScope, index));
              row.linkedProcessIds = row.linkedProcesses.map(process => process.id);
              row.count = row.processCount = count;
              group(linkScope, [row]);
            }
          }
          window[name] = {
            ...source, roots, nodes, records, total: records.length, pathCount: records.length,
            maxima: [21, 20, 20, 20, 20], sourceIssues: [], productCount: roots.length, placeholderCount: 0
          };
        }
        return api.create(options);
      }};
    }
  });
}

async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#structure-list').getAttribute('aria-busy') === 'false');
}

async function entity(page, value) {
  const tab = page.locator(`#structure-${value}-tab`);
  if (await tab.getAttribute('aria-pressed') !== 'true') {await tab.click(); await ready(page);}
}

async function openProduct(page, value, count, kind = 'product') {
  const prefix = `pagination-${value}-${kind}-${count}`;
  for (const level of ['block', 'division', 'product']) {
    const heading = page.locator(`[data-expand="${prefix}-${level}"]`);
    if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
  }
  const id = `${prefix}-product`;
  return {id, panel: page.locator(`[id="panel-${id}"]`)};
}

function recordRows(panel) {return panel.locator(':scope > .structure-table-scroll > .structure-table > tbody > tr[data-structure-record]');}
function pagination(panel) {return panel.locator(':scope > .structure-pagination');}
async function rowIds(panel) {return recordRows(panel).evaluateAll(rows => rows.map(row => row.dataset.structureRecord));}

async function verifyThreshold(panel, total, label) {
  assert.equal(await recordRows(panel).count(), Math.min(total, 50), `${label}: initial list length`);
  assert.equal(await panel.locator('.structure-table-footer').count(), 0, `${label}: old custom footer is absent`);
  const pager = pagination(panel);
  assert.equal(await pager.count(), total > 50 ? 1 : 0, `${label}: pagination appears only above 50 records`);
  if (total <= 50) {
    assert.equal(await panel.locator('[data-structure-page], [data-structure-size]').count(), 0, `${label}: no hidden legacy controls below threshold`);
  } else {
    assert.ok(await pager.evaluate(element => element.classList.contains('pagination')), `${label}: standard Table/Pagination root`);
    assert.equal(await pager.locator('[role="combobox"]').inputValue(), '50');
    assert.equal(await pager.locator('.page-button[aria-current="page"]').innerText(), '1');
    assert.equal(await pager.locator('[data-direction="previous"]').isDisabled(), true);
    assert.equal(await pager.locator('[data-direction="next"]').isDisabled(), false);
  }
}

async function chooseSize(page, panel, value, keyboard = false) {
  const input = pagination(panel).locator('[role="combobox"]');
  await input.click();
  const listId = await input.getAttribute('aria-controls');
  const list = page.locator(`[id="${listId}"]`);
  assert.deepEqual(await list.locator('[role="option"]').evaluateAll(options => options.map(option => option.dataset.option)), ['25', '50', '75', '100'], 'Shared BpmSelect provides the standard page sizes');
  if (keyboard) {
    await input.press('Home');
    for (let i = 0; i < [25, 50, 75, 100].indexOf(value); i++) await input.press('ArrowDown');
    await input.press('Enter');
  } else await list.locator(`[data-option="${value}"]`).click();
  await page.keyboard.press('Escape');
  assert.equal(await pagination(panel).locator('[role="combobox"]').inputValue(), String(value));
}

async function snapshot(panel) {
  return {
    rows: await rowIds(panel), size: await pagination(panel).locator('[role="combobox"]').inputValue(),
    current: await pagination(panel).locator('[aria-current="page"]').innerText(),
    sort: await panel.locator(':scope > .structure-table-scroll th[aria-sort]').getAttribute('aria-sort')
  };
}

async function testPagination(browser) {
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
  await context.addInitScript(installFixtures);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    await page.locator('#structure-toggle').click(); await ready(page);
    for (const value of ['processes', 'paths']) {
      await entity(page, value);
      for (const total of totals) {
        const {panel} = await openProduct(page, value, total);
        await verifyThreshold(panel, total, `${value} product ${total}`);
        if (total === 0) assert.equal(await panel.locator('.structure-empty').count(), 1, 'Zero-record product retains its empty state');
      }
    }
    report('product lists in both entities: 0/1/49/50 have no pagination, 51/101 use standard 50-row pagination');

    for (const total of totals) {
      const {panel} = await openProduct(page, 'paths', total, 'linked');
      if (!total) {
        assert.equal(await panel.locator('[data-structure-path]').count(), 0, 'A path with no linked processes has no empty expansion');
        assert.match(await panel.innerText(), /Нет связанных процессов/);
      } else {
        const button = panel.locator('[data-structure-path]'); await button.click();
        const nested = page.locator(`[id="${await button.getAttribute('aria-controls')}"]`);
        await verifyThreshold(nested, total, `linked processes ${total}`);
      }
    }
    report('linked-process lists use exactly the same 50-record threshold; zero links have no expandable table');

    const linked51Product = await openProduct(page, 'paths', 51, 'linked');
    const linked101Product = await openProduct(page, 'paths', 101, 'linked');
    const linked51 = linked51Product.panel.locator('.structure-linked-processes');
    const linked101 = linked101Product.panel.locator('.structure-linked-processes');
    await chooseSize(page, linked51, 100, true);
    assert.equal(await recordRows(linked51).count(), 51);
    assert.equal(await pagination(linked51).count(), 1, 'Size selector remains because total 51 exceeds the threshold');
    assert.equal(await pagination(linked51).locator('[data-structure-page]:visible').count(), 0, 'One-page result hides page navigation, not the selector');
    assert.equal(await pagination(linked101).locator('[role="combobox"]').inputValue(), '50', 'Changing one linked table does not change another table size');
    await chooseSize(page, linked101, 25);
    await pagination(linked101).locator('.page-button:not([data-direction])[data-page="2"]').click();
    await pagination(linked101).locator('.page-button:not([data-direction])[data-page="3"]').click();
    assert.equal(await recordRows(linked101).count(), 25);
    assert.match((await rowIds(linked101))[0], /-50$/, 'Page 3 begins with the 51st record');
    await linked101.locator(':scope > .structure-table-scroll [data-structure-sort][data-column="id"]').click();
    assert.equal(await pagination(linked101).locator('[aria-current="page"]').innerText(), '3', 'Sorting preserves the selected page');
    assert.match((await rowIds(linked101))[0], /-50$/, 'Descending page 3 is sliced after sorting the complete list');
    await pagination(linked101).locator('.page-button:not([data-direction])[data-page="1"]').click();
    assert.match((await rowIds(linked101))[0], /-100$/, 'Sorting precedes slicing and starts with the highest ID');
    await pagination(linked101).locator('.page-button:not([data-direction])[data-page="2"]').click();
    const before = await snapshot(linked101);
    assert.match(before.rows[0], /-75$/, 'Descending page 2 follows the full sorted list');
    for (const checked of [false, true]) {
      await page.locator('#structure-chart-toggle').setChecked(checked);
      assert.deepEqual(await snapshot(linked101), before, 'Chart switching retains linked table size, page and sort');
      assert.equal(await recordRows(linked51).count(), 51, 'Other linked tables retain their independent size');
    }
    const linkedButton = linked101Product.panel.locator(':scope > .structure-table-scroll [data-structure-path]');
    await linkedButton.click(); await linkedButton.click();
    assert.deepEqual(await snapshot(linked101), before, 'Collapsing and reopening a path retains its table state');
    report('linked table sizes, numbered pages, keyboard selection, full-list sorting and independent persistent state');

    await entity(page, 'processes');
    const small = await openProduct(page, 'processes', 51);
    const large = await openProduct(page, 'processes', 101);
    await chooseSize(page, small.panel, 75);
    assert.equal(await recordRows(small.panel).count(), 51);
    await chooseSize(page, large.panel, 25, true);
    const next = pagination(large.panel).locator('[data-direction="next"]');
    await next.focus(); await page.keyboard.press('Enter');
    assert.equal(await pagination(large.panel).locator('[aria-current="page"]').innerText(), '2', 'Arrow buttons support keyboard activation');
    const productSnapshot = await snapshot(large.panel);
    await page.locator('#structure-chart-toggle').setChecked(false);
    assert.deepEqual(await snapshot(large.panel), productSnapshot, 'Chart switching retains product table state');
    assert.equal(await pagination(small.panel).locator('[role="combobox"]').inputValue(), '75', 'Product list sizes are independent');

    await page.setViewportSize({width: 320, height: 900});
    await pagination(large.panel).scrollIntoViewIfNeeded();
    const dimensions = await page.evaluate(() => ({viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth}));
    assert.ok(dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1, `Pagination fits the 320px layout: ${JSON.stringify(dimensions)}`);
    await chooseSize(page, large.panel, 100, true);
    assert.equal(await recordRows(large.panel).count(), 100);
    await pagination(large.panel).locator('[data-direction="next"]').click();
    assert.equal(await recordRows(large.panel).count(), 1, 'Mobile navigation reaches the 101st record');
    assert.equal(await pagination(large.panel).locator('[data-direction="next"]').isDisabled(), true);
    await page.screenshot({path: '/tmp/bpm-structure-pagination-320.png', fullPage: false});
    report('independent product pagination, keyboard navigation and 320px size selection/last-page behavior');

    await page.setViewportSize({width: 1920, height: 1080});
    await page.locator('#structure-search').fill('filter-subset-101');
    await page.waitForFunction(() => document.querySelector('#structure-list').getAttribute('aria-busy') === 'true');
    await ready(page);
    const filtered = await openProduct(page, 'processes', 101);
    assert.equal(await recordRows(filtered.panel).count(), 49, 'Filtering below the threshold shows all matching rows');
    assert.equal(await pagination(filtered.panel).count(), 0, 'Pagination disappears when filtering reduces the list below 51');
    assert.equal(await page.locator('.structure-table-footer').count(), 0);
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    report('filtering below the threshold removes the pagination completely; no legacy footers or browser errors');
  } finally {await context.close();}
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {await testPagination(browser);} finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

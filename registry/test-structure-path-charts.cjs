/* Client-path row efficiency + linked-process charts. No production data writes.
 * Default: isolated file:// source. BPM_PATH_CHARTS_FILE=/path/to/standalone.html
 * copies only that file to an unrelated directory and runs offline.
 * BPM_PATH_CHARTS_DIAGNOSTICS=1 runs the real-data flow only and reports nested
 * table paint/scroll geometry after the responsive-resize sequence.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-path-charts-qa-'));
const standalone = process.env.BPM_PATH_CHARTS_FILE;
let file = path.join(__dirname, 'index.html');
if (standalone) {
  file = path.join(output, 'relocated-offline.html');
  fs.copyFileSync(path.resolve(standalone), file);
}
const url = `${pathToFileURL(file).href}#main`;
const report = message => console.log(`PASS — ${message}`);
const near = (actual, expected, label, tolerance = 1.5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

function instrument({fixture}) {
  let original;
  window.__pathChartActions = [];
  Object.defineProperty(window, 'BpmStructure', {
    configurable: true,
    get() {return original;},
    set(api) {
      original = {...api, create(options) {
        if (fixture) {
          const pm = window.BPM_STRUCTURE, km = window.BPM_STRUCTURE_PATHS;
          const processes = Array.from({length: 61}, (_, i) => ({
            ...pm.records[0], id: `chart-process-${i + 1}`, number: i + 1,
            code: `П${i + 1}`, title: `Процесс для графика ${i + 1}`, entity: 'processes',
            efficiency: [96, 75, 54, 22, null][i % 5], bucket: i % 5, delta: 0,
            owner: 'Константинопольский Константин Константинович',
            owners: ['Константинопольский Константин Константинович'], tags: [], type: '', count: 0
          }));
          const paths = Array.from({length: 61}, (_, i) => {
            const linked = i === 0 ? [...processes, processes[0], processes[0]] : i === 60 ? [] : processes.slice(0, 1 + i % 11);
            return {...km.records[0], id: `chart-path-${i + 1}`, number: i + 1,
              numberSimulated: true, code: `КП-ДЕМО-${String(i + 1).padStart(4, '0')}`,
              title: `Клиентский путь ${i + 1}`, entity: 'paths', bucket: i % 5,
              efficiency: i === 0 ? 100 : [96, 75, 54, 22, null][i % 5], delta: 0,
              owner: 'Константинопольский Константин Константинович',
              owners: ['Константинопольский Константин Константинович'], tags: [], type: '',
              linkedProcesses: linked, linkedProcessIds: linked.map(row => row.id),
              // Deliberately stale counts: displayed link/chart must use unique records.
              count: 999, processCount: 999};
          });
          for (const [key, source, records] of [['BPM_STRUCTURE', pm, processes], ['BPM_STRUCTURE_PATHS', km, paths]]) {
            const buckets = rows => rows.reduce((result, row) => {result[row.bucket]++; return result;}, [0, 0, 0, 0, 0]);
            const make = (kind, suffix, rows) => ({...source.nodes.find(node => node.kind === kind),
              id: `chart-fixture-${kind}${suffix}`, kind, name: `Тестовый ${kind}${suffix}`,
              owner: records[0].owner, owners: records[0].owners, records: rows,
              total: rows.length, buckets: buckets(rows), children: []});
            const root = make('block', '', records), division = make('division', '', records);
            const product = make('product', '-a', records), second = make('product', '-b', records.slice(0, 1));
            root.children = [division]; division.children = [product, second];
            window[key] = {...source, roots: [root], nodes: [root, division, product, second], records,
              total: records.length, maxima: buckets(records), sourceIssues: [], productCount: 2, placeholderCount: 0};
          }
        }
        window.__pathChartBaseline = JSON.stringify([window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS]);
        return api.create({...options,
          detail(row, trigger) {window.__pathChartActions.push(['detail', row.id]); if (!fixture) return options.detail(row, trigger);},
          menu(row, trigger) {window.__pathChartActions.push(['menu', row.id]); if (!fixture) return options.menu(row, trigger);}
        });
      }};
    }
  });
}

const ready = page => page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
async function paint(page) {
  await page.evaluate(async () => {await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));});
}
async function enter(page) {
  await page.goto(url);
  await page.locator('#structure-toggle').click(); await ready(page);
  await page.locator('#structure-paths-tab').click(); await ready(page);
}
async function expand(page, chain) {
  for (const id of chain) {
    const heading = page.locator(`[data-expand="${id}"]`);
    if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
  }
  await paint(page);
  return page.locator(`[id="panel-${chain.at(-1)}"]`);
}
const rows = panel => panel.locator(':scope > .structure-table-scroll > .structure-table > tbody > tr[data-structure-record]');
const pager = panel => panel.locator(':scope > .structure-pagination');
const rowGraph = row => row.locator('[data-path-process-chart] [data-chart]');

async function assertRows(page, panel, type = '2') {
  const actual = await rows(panel).evaluateAll(elements => elements.map(row => {
    const graph = row.querySelector('[data-path-process-chart] [data-chart]');
    const link = row.querySelector('[data-structure-related]');
    const pill = row.cells[2].querySelector('.table-efficiency')?.getBoundingClientRect();
    const cell = row.cells[2].getBoundingClientRect();
    return {id: row.dataset.structureRecord, cells: row.cells.length,
      sphereCell: row.cells[2].classList.contains('structure-path-efficiency-cell'),
      chartCell: row.cells[3]?.classList.contains('structure-path-chart-cell'),
      sphere: row.cells[2].querySelector('.bpm-efficiency-glyph')?.dataset.efficiency,
      pill: pill ? {left: pill.left, right: pill.right, cellLeft: cell.left, cellRight: cell.right} : null,
      wrapId: graph?.closest('[data-path-process-chart]').dataset.pathProcessChart,
      chartId: graph?.dataset.chart, type: graph?.dataset.chartType,
      total: Number(graph?.querySelector('.structure-total').dataset.structureNumber),
      label: graph?.getAttribute('aria-label'), link: link?.textContent.trim(),
      empty: row.querySelector('.structure-no-efficiency')?.textContent,
      segments: [...(graph?.querySelectorAll('.structure-segment') || [])].map(segment => ({
        index: Number(segment.dataset.bucket), count: Number(segment.dataset.count),
        width: parseFloat(segment.style.flexBasis), ratio: Number(segment.querySelector('[data-fill]').dataset.fill)
      }))};
  }));
  const expected = await page.evaluate(() => Object.fromEntries(window.BPM_STRUCTURE_PATHS.records.map(row => {
    const linked = [...new Map((row.linkedProcesses || []).map(record => [record.id, record])).values()];
    const buckets = linked.reduce((counts, record) => {counts[record.bucket]++; return counts;}, [0, 0, 0, 0, 0]);
    return [row.id, {buckets, count: linked.length, efficiency: row.efficiency}];
  })));
  const processMaxima = await page.evaluate(() => window.BPM_STRUCTURE.maxima);
  assert.ok(actual.length > 0, 'Path table renders rows');
  for (const row of actual) {
    const wanted = expected[row.id];
    assert.equal(row.cells, 4, `${row.id}: four cells`);
    assert.equal(row.sphereCell, true); assert.equal(row.chartCell, true);
    assert.equal(row.wrapId, row.id, 'Each path graph is associated with its own path');
    assert.equal(row.type, type);
    assert.equal(row.total, wanted.count, `${row.id}: count derives from unique linked processes`);
    assert.match(row.label, new RegExp(`процессов: ${wanted.count}(?:[. ;]|$)`));
    assert.doesNotMatch(row.label, /Всего клиентских путей/, 'Graph represents linked processes, not parent paths');
    if (wanted.efficiency !== null) near(Number(row.sphere), wanted.efficiency, 'Existing path score is unchanged', 1e-8);
    if (row.pill) assert.ok(row.pill.left >= row.pill.cellLeft - .5 && row.pill.right <= row.pill.cellRight + .5, `${row.id}: whole percentage pill including100% fits its cell: ${JSON.stringify(row.pill)}`);
    if (wanted.count) assert.equal(Number(row.link.replace(/\D/g, '')), wanted.count, 'Disclosure and graph share one count');
    else assert.match(row.empty, /Нет оценки|Нет связанных процессов/);
    const buckets = [0, 0, 0, 0, 0];
    row.segments.forEach(segment => {buckets[segment.index] = segment.count; assert.ok(Number.isFinite(segment.width) && Number.isFinite(segment.ratio));});
    assert.deepEqual(buckets, wanted.buckets, `${row.id}: all five buckets match underlying linked data`);
    if (type === '2' && wanted.count) {
      const available = 364 - 4 * (row.segments.length - 1);
      row.segments.forEach(segment => near(segment.width, available * segment.count / wanted.count, 'Normalized linked segment width', .001));
    } else if (type === '1') {
      const sum = processMaxima.reduce((total, value) => total + value, 0);
      row.segments.forEach(segment => {
        near(segment.width, 331 * processMaxima[segment.index] / sum, 'Chart1 uses the shared PROCESS leader tracks', .001);
        near(segment.ratio, processMaxima[segment.index] ? Math.min(1, segment.count / processMaxima[segment.index]) : 0, 'Chart1 uses process leaders, not КП leaders', 1e-8);
      });
    }
  }
  const ids = actual.map(row => row.chartId);
  assert.equal(new Set(ids).size, ids.length, 'A table does not reuse graph IDs');
  return actual;
}

async function finalCounter(graph) {
  await graph.scrollIntoViewIfNeeded();
  await graph.page().waitForFunction(id => {
    const graph = [...document.querySelectorAll('[data-chart]')].find(node => node.dataset.chart === id);
    return graph && [...graph.querySelectorAll('[data-structure-number]')].every(node => Number(node.textContent.replace(/\s/g, '')) === Number(node.dataset.structureNumber));
  }, await graph.getAttribute('data-chart'));
}

async function sourceFlow(page) {
  await enter(page);
  const chains = await page.evaluate(() => {
    const found = [];
    function walk(node, chain) {
      const next = [...chain, node.id];
      if (node.kind === 'product' && node.records.length >= 2 && node.records.some(row => row.linkedProcesses?.length >= 4)) found.push({chain: next, count: node.records.length});
      node.children.forEach(child => walk(child, next));
    }
    window.BPM_STRUCTURE_PATHS.roots.forEach(root => walk(root, []));
    return found.sort((a, b) => b.count - a.count)[0].chain;
  });
  const panel = await expand(page, chains);
  await assertRows(page, panel);
  const first = rows(panel).filter({has: page.locator('[data-structure-related]')}).first();
  const link = first.locator('[data-structure-related]');
  await link.click();
  const nested = page.locator(`[id="${await link.getAttribute('aria-controls')}"]`);
  assert.equal(await nested.locator('.structure-incoming-table tbody > tr').count(), Number((await link.innerText()).replace(/\D/g, '')));
  assert.equal(await nested.locator('[data-path-process-chart]').count(), 0, 'Incoming process rows do not receive path graphs');
  assert.equal(await nested.locator('.structure-incoming-relationship').count(), await nested.locator('.structure-incoming-table tbody > tr').count(), 'Participation tags remain');
  assert.equal(await nested.locator('table > tbody > tr').first().locator(':scope > td').count(), 3, 'Incoming process table remains three columns');
  assert.equal(await nested.locator('xpath=ancestor::td[1]').getAttribute('colspan'), '4', 'Linked table spans the full new path row');

  for (const width of [1920, 1440, 390]) {
    await page.setViewportSize({width, height: 1080}); await paint(page);
    await first.scrollIntoViewIfNeeded();
    const geometry = await first.evaluate(row => {
      const rect = selector => {const r = row.querySelector(selector).getBoundingClientRect(); return {x: r.x, y: r.y, right: r.right, width: r.width};};
      const product = row.closest('[data-kind="product"]');
      const heading = product.querySelector(':scope > .structure-heading');
      const headerChart = heading.querySelector('[data-chart]').getBoundingClientRect();
      const headerSphere = heading.querySelector('.structure-average').getBoundingClientRect();
      return {viewport: innerWidth, overflow: document.documentElement.scrollWidth, owner: rect('.structure-owner'),
        sphere: rect('.structure-path-efficiency-cell .bpm-efficiency-glyph'), chart: rect('[data-path-process-chart] [data-chart]'),
        headerChartX: headerChart.x, headerSphereX: headerSphere.x};
    });
    assert.ok(geometry.overflow <= width + 1, `No global overflow at ${width}px: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.owner.x < geometry.sphere.x && geometry.sphere.x < geometry.chart.x, `Owner → score → chart order at ${width}px`);
    assert.ok(geometry.owner.right <= geometry.sphere.x + 2, `Owner does not overlap score at ${width}px`);
    // Chrome may defer painting nested overflow surfaces past two rAFs after a
    // large resize. Geometry is already stable; let the compositor catch up.
    await page.waitForTimeout(250);
    await page.screenshot({path: path.join(output, `linked-process-charts-${width}.png`)});
    if (width === 1920) {
      near(geometry.chart.x, geometry.headerChartX, 'Path graph aligns with product chart');
      near(geometry.sphere.x, geometry.headerSphereX, 'Path score aligns with accordion average', 4);
      const nestedOwner = await nested.locator('.structure-incoming-owner .avatar').first().boundingBox();
      near(nestedOwner.x, geometry.owner.x, 'Nested process owner shares parent owner vertical');
    }
  }
  await page.setViewportSize({width: 1920, height: 1080}); await paint(page);
  await page.locator('#collapse-menu').click(); await page.mouse.move(1000, 200); await paint(page);
  await first.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({path: path.join(output, 'linked-process-charts-1920-collapsed.png')});
  if (process.env.BPM_PATH_CHARTS_DIAGNOSTICS) {
    console.log('RESIZE DIAGNOSTIC', JSON.stringify(await nested.evaluate(panel => {
      const selectors = ['.structure-incoming-scroll', '.structure-incoming-table', 'tbody > tr', '.structure-incoming-process', '.structure-incoming-owner'];
      return selectors.map(selector => {
        const node = panel.querySelector(selector), box = node.getBoundingClientRect(), style = getComputedStyle(node);
        return {selector, box: {x: box.x, y: box.y, width: box.width, height: box.height}, text: node.textContent.slice(0, 100),
          display: style.display, visibility: style.visibility, opacity: style.opacity, transform: style.transform,
          scrollLeft: node.scrollLeft, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth};
      });
    })));
    await page.waitForTimeout(250);
    await page.screenshot({path: path.join(output, 'resize-delayed-paint.png')});
    await nested.locator('tbody > tr').first().scrollIntoViewIfNeeded(); await paint(page);
    await page.screenshot({path: path.join(output, 'resize-incoming-into-view.png')});
  }
  await page.locator('#structure-chart-toggle').setChecked(true);
  const comparison = await assertRows(page, panel, '1');
  assert.equal(await link.getAttribute('aria-expanded'), 'true', 'Chart switching keeps disclosure open');
  const widths = comparison[0].segments.map(segment => segment.width);
  comparison.forEach(row => row.segments.forEach((segment, i) => near(segment.width, widths[i], 'Chart1 common bucket tracks', .001)));
  for (const index of [0, 1, 2, 3, 4]) {
    const scales = comparison.map(row => row.segments[index]).filter(segment => segment.count > 0 && segment.ratio > 0).map(segment => segment.count / segment.ratio);
    scales.forEach(scale => near(scale, scales[0], 'Chart1 common leader denominator', 1e-8));
  }
  await page.locator('#structure-chart-toggle').setChecked(false); await assertRows(page, panel, '2');
  await page.locator('#structure-average-toggle').click(); await assertRows(page, panel, '2');
  assert.equal(await first.locator('.structure-path-efficiency-cell .bpm-efficiency-glyph').count(), 1, 'Toggling optional accordion means does not hide the path own score');
  await page.locator('#structure-average-toggle').click();
  await page.locator('#structure-processes-tab').click(); await ready(page);
  const processChain = await page.evaluate(() => {
    for (const block of window.BPM_STRUCTURE.roots) for (const division of block.children) for (const product of division.children) if (product.records.length) return [block.id, division.id, product.id];
  });
  const processPanel = await expand(page, processChain);
  assert.equal(await rows(processPanel).first().locator(':scope > td').count(), 3, 'Processes tab retains original three columns');
  assert.equal(await processPanel.locator('[data-path-process-chart]').count(), 0, 'No new path chart leaks into process rows');
  report('real Excel links, unique bucket totals, disclosure count/tags, 4-column КП vs unchanged process table, shared Chart1 scale, chart toggles, 1920/1440/390px geometry');
}

async function fixtureFlow(page) {
  await enter(page);
  const panel = await expand(page, ['chart-fixture-block', 'chart-fixture-division', 'chart-fixture-product-a']);
  const second = await expand(page, ['chart-fixture-block', 'chart-fixture-division', 'chart-fixture-product-b']);
  await assertRows(page, panel); await assertRows(page, second);
  const allIds = await page.locator('[data-path-process-chart] [data-chart]').evaluateAll(graphs => graphs.map(graph => graph.dataset.chart));
  assert.equal(new Set(allIds).size, allIds.length, 'Same path in two products gets separate chart IDs');
  const first = rows(panel).first(), id = await first.getAttribute('data-structure-record');
  await finalCounter(rowGraph(first));
  await first.locator('[data-structure-related]').click();
  assert.equal(await first.getAttribute('data-expanded'), 'true');
  assert.equal(await first.locator('xpath=following-sibling::tr[1]').locator('.structure-incoming-table tbody > tr').count(), 50, '61 unique linked rows use existing paginator');
  await first.locator('[data-structure-menu]').click();
  await first.locator('[data-structure-detail]').click();
  assert.deepEqual(await page.evaluate(() => window.__pathChartActions.slice(-2)), [['menu', id], ['detail', id]], 'More/detail actions still delegate the correct path');
  await panel.locator(':scope > .structure-table-scroll > table > thead [data-column="id"]').click();
  await assertRows(page, panel);
  await finalCounter(rowGraph(rows(panel).nth(1)));
  assert.equal(await rows(panel).first().getAttribute('data-structure-record'), 'chart-path-61', 'Sort rebuild orders all records before slicing');
  assert.equal(await rowGraph(rows(panel).first()).locator('.structure-total').getAttribute('data-structure-number'), '0', 'Zero-linked path has an explicit zero chart');
  await pager(panel).locator('[data-page="2"]:not([data-direction])').click();
  assert.equal(await rows(panel).count(), 11, 'Second page receives remaining path charts');
  await assertRows(page, panel);
  await finalCounter(rowGraph(rows(panel).first()));
  const sortedIds = await rows(panel).evaluateAll(elements => elements.map(row => row.dataset.structureRecord));
  const linked = rows(panel).filter({has: page.locator('[data-structure-related="chart-path-1"]')});
  assert.equal(await linked.getAttribute('data-expanded'), 'true', 'Disclosure state survives pagination and sorting');
  for (const checked of [true, false]) {
    await page.locator('#structure-chart-toggle').setChecked(checked);
    await assertRows(page, panel, checked ? '1' : '2');
    assert.deepEqual(await rows(panel).evaluateAll(elements => elements.map(row => row.dataset.structureRecord)), sortedIds, 'Changing chart does not reset page or sort');
    assert.equal(await pager(panel).locator('[aria-current="page"]').innerText(), '2');
    await finalCounter(rowGraph(rows(panel).first()));
  }
  const productHeading = page.locator('[data-expand="chart-fixture-product-a"]');
  await productHeading.click(); await productHeading.click();
  await assertRows(page, panel); await finalCounter(rowGraph(rows(panel).first()));
  assert.equal(await page.evaluate(() => JSON.stringify([window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS]) === window.__pathChartBaseline), true, 'Rendering charts does not mutate model/source records');
  report('deduplicated links, stale count immunity, zero chart, duplicate path memberships, menus/details, >50 pagination, sorting/reopen lifecycle, counters after every rebuild, immutable data');
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    for (const fixture of process.env.BPM_PATH_CHARTS_DIAGNOSTICS ? [false] : [false, true]) {
      const context = await browser.newContext({offline: true, viewport: {width: 1920, height: 1080}, reducedMotion: fixture ? 'no-preference' : 'reduce'});
      await context.addInitScript(instrument, {fixture});
      const page = await context.newPage(), errors = [], failed = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('request', request => {if (/^https?:/i.test(request.url())) external.push(request.url());});
      try {
        if (fixture) await fixtureFlow(page); else await sourceFlow(page);
        assert.deepEqual(errors, [], 'No runtime errors'); assert.deepEqual(failed, [], 'No failed local/offline requests'); assert.deepEqual(external, [], 'No network dependencies');
      } finally {await context.close();}
    }
    report(`${standalone ? 'relocated standalone' : 'source'} offline suite; screenshots: ${output}`);
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

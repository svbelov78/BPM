/* Cross-level desktop column alignment, including intermediate widths.
 * BPM_COLUMN_FILE=/path/to/standalone.html tests a relocated offline copy.
 * BPM_COLUMN_DIAGNOSTICS=1 prints all metrics without failing alignment checks.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-column-alignment-'));
const standalone = process.env.BPM_COLUMN_FILE;
let file = path.join(__dirname, 'index.html');
if (standalone) {
  file = path.join(output, 'relocated-offline.html');
  fs.copyFileSync(path.resolve(standalone), file);
}
const diagnostics = !!process.env.BPM_COLUMN_DIAGNOSTICS;
const widths = [1920, 1800, 1720, 1640, 1639, 1600, 1530, 1440];
const failures = [], metrics = [];
const paint = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
const near = (actual, expected, label, tolerance = 1.5) => {
  if (Math.abs(actual - expected) > tolerance) failures.push(`${label}: ${actual.toFixed(2)} vs ${expected.toFixed(2)}`);
};

function init({menu}) {
  localStorage.clear();
  localStorage.setItem('bpm-registry-menu', menu);
  // Stress title and owner wrapping without changing graph relationships.
  let api;
  Object.defineProperty(window, 'BpmStructure', {configurable: true,
    get() {return api;},
    set(original) {api = {...original, create(options) {
      for (const source of [window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS]) {
        source.nodes.forEach(node => {
          node.owner = 'Константинопольский Константин Константинович';
          node.owners = [node.owner];
          if (node.kind === 'product') node.name += ' — банковское сопровождение избирательных кампаний';
        });
        source.records.forEach(row => {
          row.owner = 'Константинопольский Константин Константинович';
          row.owners = [row.owner];
        });
      }
      return original.create(options);
    }};}
  });
}

function geometry({chain, rowId, relatedId}) {
  const box = element => {
    const rect = element.getBoundingClientRect();
    return {x: rect.left, right: rect.right, width: rect.width, y: rect.top, bottom: rect.bottom};
  };
  const chart = element => {
    const graph = element.querySelector('[data-chart]');
    return {chart: box(graph), bars: box(graph.querySelector('.structure-bars'))};
  };
  const headings = chain.map(id => {
    const element = document.querySelector(`[data-expand="${id}"]`);
    return {id, owner: box(element.querySelector('.structure-owner .avatar')),
      ownerBox: box(element.querySelector('.structure-owner')),
      sphere: element.querySelector('.structure-average')?.getClientRects().length ? box(element.querySelector('.structure-average .bpm-efficiency-glyph')) : null,
      ...chart(element)};
  });
  const row = document.querySelector(`tr[data-structure-record="${rowId}"]`);
  const rowTable = row.closest('.structure-table'), scroll = rowTable.parentElement;
  const incoming = document.getElementById(relatedId);
  const nestedOwner = incoming.querySelector('.structure-incoming-owner .avatar');
  const panel = document.querySelector('.registry-panel');
  const panelStyle = getComputedStyle(panel);
  return {contentWidth: panel.clientWidth - parseFloat(panelStyle.paddingLeft) - parseFloat(panelStyle.paddingRight),
    pageWidth: document.documentElement.scrollWidth,
    headings,
    row: {owner: box(row.querySelector('.structure-owner .avatar')),
      ownerBox: box(row.querySelector('.structure-owner')),
      sphere: box(row.querySelector('.structure-path-efficiency-cell .bpm-efficiency-glyph')),
      pill: box(row.querySelector('.structure-path-efficiency-cell .table-efficiency')),
      scoreCell: box(row.querySelector('.structure-path-efficiency-cell')),
      ...chart(row)},
    nestedOwner: box(nestedOwner),
    table: {width: rowTable.getBoundingClientRect().width, available: scroll.clientWidth,
      scrollWidth: scroll.scrollWidth, scrollLeft: scroll.scrollLeft},
    headers: [...rowTable.querySelectorAll(':scope > thead > tr > th')].map(box)};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    for (const menu of ['expanded', 'collapsed']) {
      const context = await browser.newContext({offline: true, viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
      await context.addInitScript(init, {menu});
      const page = await context.newPage(), errors = [], failed = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('request', request => {if (/^https?:/i.test(request.url())) external.push(request.url());});
      try {
        await page.goto(`${pathToFileURL(file).href}#main`);
        await page.locator('#structure-toggle').click();
        await page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
        await page.locator('#structure-paths-tab').click();
        await page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
        const chain = await page.evaluate(() => {
          for (const block of window.BPM_STRUCTURE_PATHS.roots)
            for (const division of block.children)
              for (const product of division.children)
                if (product.records.length >= 2 && product.records.some(row => row.linkedProcesses?.length >= 2)) return [block.id, division.id, product.id];
        });
        for (const id of chain) await page.locator(`[data-expand="${id}"]`).click();
        const panel = page.locator(`[id="panel-${chain.at(-1)}"]`);
        const row = panel.locator(':scope > .structure-table-scroll > table > tbody > tr[data-structure-record]').filter({has: page.locator('[data-structure-related]')}).first();
        const rowId = await row.getAttribute('data-structure-record');
        const link = row.locator('[data-structure-related]');
        await link.click();
        const relatedId = await link.getAttribute('aria-controls');
        for (const width of widths) {
          await page.setViewportSize({width, height: 1080});
          await paint(page);
          for (const average of [true, false]) {
            const toggle = page.locator('#structure-average-toggle');
            if ((await toggle.getAttribute('aria-checked') === 'true') !== average) await toggle.click();
            for (const chartType of [2, 1]) {
              await page.locator('#structure-chart-toggle').setChecked(chartType === 1);
              await paint(page);
              const data = await page.evaluate(geometry, {chain, rowId, relatedId});
              const label = `${width}px/${menu}/average=${average}/chart=${chartType}`;
              const first = data.headings[0];
              assert.ok(data.pageWidth <= width + 1, `${label}: no page-wide overflow`);
              const oneRow = data.contentWidth > 1204;
              if (oneRow) {
                for (const heading of data.headings.slice(1)) {
                  near(heading.owner.x, first.owner.x, `${label} heading owner`);
                  near(heading.bars.x, first.bars.x, `${label} heading bars left`);
                  near(heading.bars.right, first.bars.right, `${label} heading bars right`);
                  if (average) near(heading.sphere.x, first.sphere.x, `${label} heading sphere`);
                }
                near(data.row.owner.x, first.owner.x, `${label} КП owner`);
                near(data.nestedOwner.x, first.owner.x, `${label} incoming process owner`);
                near(data.row.bars.x, first.bars.x, `${label} КП bars left`);
                near(data.row.bars.right, first.bars.right, `${label} КП bars right`);
                if (average) near(data.row.sphere.x, first.sphere.x, `${label} КП sphere`);
                if (data.table.scrollWidth > data.table.available + 1) failures.push(`${label}: nested table overflows ${data.table.scrollWidth - data.table.available}px in single-row desktop layout`);
                if (data.row.ownerBox.right > data.row.pill.x + 1) failures.push(`${label}: owner overlaps efficiency pill`);
                if (data.row.pill.right > data.row.chart.x + 1) failures.push(`${label}: efficiency pill overlaps chart`);
              }
              const summary = {label, oneRow, contentWidth: data.contentWidth,
                owners: [...data.headings.map(item => item.owner.x), data.row.owner.x, data.nestedOwner.x],
                spheres: [...data.headings.map(item => item.sphere?.x ?? null), data.row.sphere.x],
                barsLeft: [...data.headings.map(item => item.bars.x), data.row.bars.x],
                barsRight: [...data.headings.map(item => item.bars.right), data.row.bars.right], table: data.table};
              metrics.push(summary);
              if (diagnostics || (width === 1720 && average && chartType === 2)) console.log(JSON.stringify(summary));
              if (width === 1720 && average && chartType === 2) {
                await row.scrollIntoViewIfNeeded();
                await page.screenshot({path: path.join(output, `columns-${width}-${menu}.png`)});
              }
            }
          }
        }
        assert.deepEqual(errors, [], 'No runtime errors');
        assert.deepEqual(failed, [], 'No failed offline assets');
        assert.deepEqual(external, [], 'No external dependencies');
      } finally {await context.close();}
    }
    console.log(`Checked ${metrics.length} width/menu/average/chart combinations; ${failures.length} alignment failures. Screenshots: ${output}`);
    if (failures.length) console.log(failures.join('\n'));
    if (!diagnostics) assert.deepEqual(failures, [], 'All one-row desktop structure columns align');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

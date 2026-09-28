/* Process rows and their disclosed client paths share the accordion owner /
 * efficiency axes. BPM_PROCESS_COLUMN_FILE tests a relocated offline HTML.
 * BPM_PROCESS_COLUMN_DIAGNOSTICS=1 prints geometry without failing alignment.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-process-column-alignment-'));
const standalone = process.env.BPM_PROCESS_COLUMN_FILE;
let file = path.join(__dirname, 'index.html');
if (standalone) {
  file = path.join(output, 'relocated-offline.html');
  fs.copyFileSync(path.resolve(standalone), file);
}
const diagnostics = !!process.env.BPM_PROCESS_COLUMN_DIAGNOSTICS;
const widths = [1920, 1800, 1720, 1640, 1440];
const failures = [], metrics = [];
const near = (actual, expected, label, tolerance = 1.5) => {
  if (Math.abs(actual - expected) > tolerance) failures.push(`${label}: ${actual.toFixed(2)} vs ${expected.toFixed(2)}`);
};
const paint = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
function init({menu}) {
  localStorage.clear();
  localStorage.setItem('bpm-registry-menu', menu);
  let api;
  Object.defineProperty(window, 'BpmStructure', {configurable: true,
    get() {return api;},
    set(original) {api = {...original, create(options) {
      for (const source of [window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS]) {
        for (const node of source.nodes) {
          node.owner = 'Константинопольский Константин Константинович';
          node.owners = [node.owner];
        }
        for (const row of source.records) {
          row.owner = 'Константинопольский Константин Константинович';
          row.owners = [row.owner];
        }
      }
      return original.create(options);
    }};}
  });
}
function geometry({chain, rowId, relatedId}) {
  const box = element => {
    const r = element.getBoundingClientRect();
    return {x:r.left, right:r.right, width:r.width, y:r.top, bottom:r.bottom};
  };
  const headings = chain.map(id => {
    const element = document.querySelector(`[data-expand="${id}"]`);
    return {id, owner:box(element.querySelector('.structure-owner .avatar')),
      sphere:element.querySelector('.structure-average')?.getClientRects().length ? box(element.querySelector('.structure-average .bpm-efficiency-glyph')) : null};
  });
  const table = document.querySelector(`[id="panel-${chain.at(-1)}"] > .structure-table-scroll > .structure-process-table`);
  const row = [...table.tBodies[0].rows].find(r => r.dataset.structureRecord === rowId);
  const nested = [...document.getElementById(relatedId).querySelectorAll('.structure-incoming-row')].map(element => ({
    owner:box(element.querySelector('.structure-incoming-owner .avatar')),
    sphere:element.querySelector('.bpm-efficiency-glyph') ? box(element.querySelector('.bpm-efficiency-glyph')) : null,
    cells:element.cells.length
  }));
  const panel = document.querySelector('.registry-panel'), style = getComputedStyle(panel);
  const header = table.tHead.rows[0].cells[2], scoreCell = row.querySelector('.structure-process-efficiency-cell');
  return {contentWidth:panel.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    pageWidth:document.documentElement.scrollWidth, headings, nested,
    row:{owner:box(row.querySelector('.structure-owner .avatar')), ownerBox:box(row.querySelector('.structure-owner')),
      sphere:box(scoreCell.querySelector('.bpm-efficiency-glyph')), pill:box(scoreCell.querySelector('.table-efficiency')),
      scoreCell:box(scoreCell), cells:row.cells.length, chartCount:row.querySelectorAll('[data-chart]').length},
    header:{label:box(header.querySelector('.structure-column-label')), text:header.textContent.trim().replace(/\u00ad/g,''), cell:box(header)},
    table:{width:box(table).width, available:table.parentElement.clientWidth, scrollWidth:table.parentElement.scrollWidth,
      columns:table.querySelectorAll(':scope > colgroup > col').length,
      headings:table.tHead.rows[0].cells.length}};
}
(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  try {
    for (const menu of ['expanded','collapsed']) {
      const context = await browser.newContext({offline:true, viewport:{width:1920,height:1080}, reducedMotion:'reduce'});
      await context.addInitScript(init, {menu});
      const page = await context.newPage(), errors = [], failed = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('request', request => {if (/^https?:/i.test(request.url())) external.push(request.url());});
      try {
        await page.goto(`${pathToFileURL(file).href}#main`);
        await page.locator('#structure-toggle').click();
        await page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
        assert.equal(await page.locator('#structure-processes-tab').getAttribute('aria-pressed'),'true');
        const chosen = await page.evaluate(() => {
          const withPaths = new Set(window.BPM_STRUCTURE_PATHS.records.filter(p => p.efficiency !== null).flatMap(p => p.linkedProcesses.map(r => r.id)));
          for (const block of window.BPM_STRUCTURE.roots)
            for (const division of block.children)
              for (const product of division.children) {
                const row = [...product.records].sort((a,b) => a.number-b.number).slice(0,50).find(r => r.efficiency !== null && withPaths.has(r.id));
                if (row && product.records.length > 1) return {chain:[block.id,division.id,product.id],rowId:row.id};
              }
        });
        assert.ok(chosen, 'Real process with a scored linked client path is available');
        const {chain,rowId} = chosen;
        for (const id of chain) await page.locator(`[data-expand="${id}"]`).click();
        const panel = page.locator(`[id="panel-${chain.at(-1)}"]`);
        const row = panel.locator(`:scope > .structure-table-scroll > table > tbody > tr[data-structure-record="${rowId}"]`);
        const link = row.locator('[data-structure-related]');
        await link.click();
        const relatedId = await link.getAttribute('aria-controls');
        for (const width of widths) {
          await page.setViewportSize({width,height:1080});
          const shown = new Map();
          for (const average of [true,false]) {
            const toggle = page.locator('#structure-average-toggle');
            if ((await toggle.getAttribute('aria-checked') === 'true') !== average) await toggle.click();
            for (const chartType of [2,1]) {
              await page.locator('#structure-chart-toggle').setChecked(chartType === 1);
              await paint(page);
              const data = await page.evaluate(geometry,{chain,rowId,relatedId});
              const label = `${width}px/${menu}/average=${average}/chart=${chartType}`;
              assert.ok(data.pageWidth <= width + 1, `${label}: no page-wide overflow`);
              assert.equal(data.row.cells,3,`${label}: process row has three semantic columns`);
              assert.equal(data.table.columns,3,`${label}: three colgroup columns`);
              assert.equal(data.table.headings,3,`${label}: three visible headings`);
              assert.equal(data.row.chartCount,0,`${label}: no invented process graph`);
              assert.equal(data.header.text,'Эффективность',`${label}: efficiency label remains available`);
              assert.ok(data.nested.length > 0 && data.nested.every(r => r.cells === 3), `${label}: reciprocal paths keep three columns`);
              if (average) shown.set(chartType,data);
              const oneRow = data.contentWidth > 1204;
              if (oneRow) {
                const first = data.headings[0], sphere = shown.get(chartType).headings[0].sphere;
                for (const heading of data.headings.slice(1)) {
                  near(heading.owner.x,first.owner.x,`${label} accordion owners`);
                  if (average) near(heading.sphere.x,sphere.x,`${label} accordion spheres`);
                }
                near(data.row.owner.x,first.owner.x,`${label} process owner`);
                near(data.row.sphere.x,sphere.x,`${label} process sphere`);
                near(data.header.label.x,sphere.x,`${label} efficiency heading belongs to sphere track`);
                for (const nested of data.nested) {
                  near(nested.owner.x,first.owner.x,`${label} nested КП owner`);
                  if (nested.sphere) near(nested.sphere.x,sphere.x,`${label} nested КП sphere`);
                }
                if (!average) near(data.row.owner.x,shown.get(chartType).row.owner.x,`${label} average toggle preserves owner axis`);
                if (data.row.ownerBox.right > data.row.pill.x + 1) failures.push(`${label}: owner overlaps efficiency pill`);
                if (data.table.scrollWidth > data.table.available + 1) failures.push(`${label}: unexpected one-row desktop horizontal overflow`);
              }
              const summary = {label,oneRow,contentWidth:data.contentWidth,
                owners:[...data.headings.map(h => h.owner.x),data.row.owner.x,...data.nested.map(r => r.owner.x)],
                spheres:[...data.headings.map(h => h.sphere?.x ?? null),data.row.sphere.x,...data.nested.map(r => r.sphere?.x ?? null)],
                headerX:data.header.label.x,table:data.table};
              metrics.push(summary);
              if (diagnostics || (width === 1720 && average && chartType === 2)) console.log(JSON.stringify(summary));
              if (width === 1720 && average && chartType === 2) {
                await row.scrollIntoViewIfNeeded();
                await page.waitForTimeout(300);
                await page.screenshot({path:path.join(output,`process-columns-${width}-${menu}.png`)});
              }
            }
          }
        }
        for (const width of [390,320]) {
          await page.setViewportSize({width,height:844});
          await paint(page);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px/${menu}: no mobile document overflow`);
          await page.screenshot({path:path.join(output,`process-columns-${width}-${menu}.png`)});
        }
        assert.deepEqual(errors,[],'No runtime errors');
        assert.deepEqual(failed,[],'No failed offline assets');
        assert.deepEqual(external,[],'No external dependencies');
      } finally {await context.close();}
    }
    console.log(`Checked ${metrics.length} desktop width/menu/average/chart combinations and four mobile cases; ${failures.length} alignment failures. Screenshots: ${output}`);
    if (failures.length) console.log(failures.join('\n'));
    if (!diagnostics) assert.deepEqual(failures,[],'Process table and reciprocal client paths share the accordion axes');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});

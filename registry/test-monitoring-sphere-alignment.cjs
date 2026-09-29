/* Process Monitoring: rated and unrated sphere glyphs share one vertical line.
 * Optional argv[2]: absolute standalone HTML, copied to a fresh offline folder.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-monitoring-spheres-'));
const standalone = process.argv[2];
let file = path.join(__dirname, 'index.html');
if (standalone) {
  assert(path.isAbsolute(standalone), 'Provide an absolute standalone HTML path');
  file = path.join(output, 'relocated-offline.html');
  fs.copyFileSync(standalone, file);
}
const near = (actual, expected, label) => assert(Math.abs(actual - expected) <= 0.6, `${label}: ${actual} vs ${expected}`);
const paint = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

async function measure(page, label) {
  const rows = await page.locator('#pd-monitoring .pd-data-table-monitoring tbody tr').evaluateAll(elements => {
    const box = element => {
      const r = element.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height, cx:r.x+r.width/2, cy:r.y+r.height/2};
    };
    return elements.map(row => {
      const cell = row.querySelector('.pd-data-efficiency');
      const indicator = cell.querySelector('.efficiency');
      const slot = cell.querySelector('.pd-data-efficiency-empty,.table-efficiency');
      const glyph = cell.querySelector('.efficiency-glyph');
      return {key:row.dataset.pdKey, cell:box(cell), indicator:box(indicator), slot:slot && box(slot), glyph:box(glyph),
        unrated:indicator.classList.contains('efficiency-unrated-card'), text:indicator.textContent.trim(),
        glyphCount:cell.querySelectorAll('.efficiency-glyph').length,
        nativeOutline:glyph.tagName === 'IMG' ? {complete:glyph.complete, naturalWidth:glyph.naturalWidth, naturalHeight:glyph.naturalHeight} : null};
    });
  });
  assert.equal(rows.length, 5, `${label}: five monitoring rows`);
  assert.equal(rows.filter(row => row.unrated).length, 1, `${label}: one unrated state`);
  for (const row of rows) {
    const key = `${label}/${row.key}`;
    assert.equal(row.glyphCount, 1, `${key}: one sphere glyph`);
    near(row.glyph.width, 24, `${key}: sphere width`);
    near(row.glyph.height, 24, `${key}: sphere height`);
    near(row.glyph.x, rows[0].glyph.x, `${key}: common sphere left edge`);
    near(row.glyph.cx, rows[0].glyph.cx, `${key}: common sphere center line`);
    near(row.glyph.cy, row.cell.cy, `${key}: sphere vertically centered in row`);
    assert(row.slot, `${key}: indicator has an alignment slot`);
    near(row.slot.width, 110, `${key}: preserved 110px slot`);
    near(row.slot.cx, row.cell.cx, `${key}: slot stays centered in original cell`);
    near(row.glyph.x - row.slot.x, 12, `${key}: sphere has common 12px leading inset`);
    near(row.indicator.cy, row.cell.cy, `${key}: indicator vertically centered`);
    if (row.unrated) {
      near(row.indicator.width, 56, `${key}: native NONE width`);
      near(row.indicator.height, 24, `${key}: native NONE height`);
      assert.equal(row.text, '---', `${key}: no fabricated percentage`);
      assert.deepEqual(row.nativeOutline, {complete:true, naturalWidth:24, naturalHeight:24}, `${key}: original outline asset decoded`);
    } else {
      near(row.indicator.width, 110, `${key}: rated pill width unchanged`);
      near(row.indicator.height, 40, `${key}: rated pill height unchanged`);
    }
  }
  const widths = await page.evaluate(() => {
    const main = document.querySelector('#process-drawer .pd-main');
    return {viewport:innerWidth, document:document.documentElement.scrollWidth, body:document.body.scrollWidth, main:main.clientWidth, mainScroll:main.scrollWidth};
  });
  assert(widths.document <= widths.viewport+1 && widths.body <= widths.viewport+1, `${label}: no page-level horizontal overflow`);
  assert(widths.mainScroll <= widths.main+1, `${label}: wide table does not expand drawer content`);
  console.log(`PASS — ${label}: all sphere edges aligned at ${rows[0].glyph.x.toFixed(2)}px`);
}

(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  let page;
  try {
    const context = await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce',offline:Boolean(standalone)});
    page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.goto(`${pathToFileURL(file).href}#main`);
    await page.locator('.entity-card:not(.skeleton-card)').first().waitFor();
    await page.locator('#processes-tab').click();
    await page.locator('.entity-card:not(.skeleton-card) [data-detail]').first().click();
    await page.waitForFunction(() => {
      const drawer = document.querySelector('#process-drawer');
      return drawer?.open && !drawer.classList.contains('pd-is-loading') && !drawer.querySelector('.pd-main').inert;
    });
    const section = page.locator('#pd-monitoring');
    await section.evaluate(element => {element.open = true;});
    const scroll = section.locator('.pd-data-table-scroll');
    for (const width of [1920,1440,390,320]) {
      await page.setViewportSize({width,height:1080});
      await section.evaluate(element => {
        const main = element.closest('.pd-main');
        main.scrollTop += element.getBoundingClientRect().top - main.getBoundingClientRect().top;
      });
      await scroll.evaluate(element => {element.scrollLeft = 0;});
      await paint(page);
      await measure(page, `${standalone?'offline':'source'} ${width} before horizontal scroll`);
      const geometry = await scroll.evaluate(element => {
        element.scrollLeft = element.scrollWidth;
        return {client:element.clientWidth,scroll:element.scrollWidth,left:element.scrollLeft};
      });
      if (width < 1920) {
        assert(geometry.scroll > geometry.client, `${width}: wide table remains independently scrollable`);
        assert(geometry.left > 0, `${width}: horizontal scrolling changes offset`);
      }
      await paint(page);
      await measure(page, `${standalone?'offline':'source'} ${width} after horizontal scroll`);
      await page.screenshot({path:path.join(output, `${width}-monitoring.png`)});
      if (width === 1920) {
        await section.locator('.pd-data-table-monitoring').screenshot({path:path.join(output,'1920-monitoring-table.png')});
      }
    }
    await page.setViewportSize({width:1920,height:1080});
    await scroll.evaluate(element => {element.scrollLeft = 0;});
    for (let round=0;round<2;round++) {
      await section.locator('[data-pd-sort]').first().click();
      await paint(page);
      await measure(page, `${standalone?'offline':'source'} sorted ${round+1}`);
    }
    assert.deepEqual(errors, [], 'No runtime errors or failed resources');
    console.log(`PASS — monitoring sphere alignment complete; screenshots: ${output}`);
  } catch (error) {
    if (page) await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
    throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});

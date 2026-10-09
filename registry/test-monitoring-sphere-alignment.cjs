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
const variantIds = {'monitoring-0':'В 0001','monitoring-1':'В 0002','monitoring-2':'В 0003','monitoring-3':'В 0004','monitoring-4':'В 0005'};
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
      const titleCell = row.cells[0], wrapper = titleCell.querySelector('.pd-monitoring-title');
      const badge = wrapper.querySelector('.pd-copy-tag'), tag = badge.querySelector('.pd-tag');
      const copyIcon = badge.querySelector('.pd-icon'), title = wrapper.querySelector('.pd-data-title');
      return {key:row.dataset.pdKey, cell:box(cell), indicator:box(indicator), slot:slot && box(slot), glyph:box(glyph),
        unrated:indicator.classList.contains('efficiency-unrated-card'), text:indicator.textContent.trim(),
        glyphCount:cell.querySelectorAll('.efficiency-glyph').length,
        nativeOutline:glyph.tagName === 'IMG' ? {complete:glyph.complete, naturalWidth:glyph.naturalWidth, naturalHeight:glyph.naturalHeight} : null,
        variant:{count:wrapper.querySelectorAll('.pd-copy-tag').length,value:badge.dataset.pdValue,label:badge.querySelector('.pd-data-tag-text').textContent,
          ariaLabel:badge.getAttribute('aria-label'),first:wrapper.firstElementChild === badge && badge.nextElementSibling === title,
          cell:box(titleCell),badge:box(badge),title:box(title),tag:box(tag),icon:box(copyIcon),background:getComputedStyle(tag).backgroundColor,
          nativeIcon:{complete:copyIcon.complete,naturalWidth:copyIcon.naturalWidth,naturalHeight:copyIcon.naturalHeight},
          originalIcon:copyIcon.getAttribute('src') === window.BpmProcessAssets.imgIcon16Copy,
          labels:[...titleCell.querySelectorAll('.pd-data-tag-text')].map(element=>({height:box(element).height,nowrap:getComputedStyle(element).whiteSpace}))}};
    });
  });
  assert.equal(rows.length, 5, `${label}: five monitoring rows`);
  assert.equal(rows.filter(row => row.unrated).length, 1, `${label}: one unrated state`);
  for (const row of rows) {
    const key = `${label}/${row.key}`;
    const variant = row.variant;
    assert.equal(variant.count, 1, `${key}: one standard variant ID badge`);
    assert.equal(variant.value, variantIds[row.key], `${key}: stable variant copy value`);
    assert.equal(variant.label, variant.value, `${key}: ID label matches copied value`);
    assert.equal(variant.ariaLabel, `Скопировать ${variant.value}`, `${key}: accessible copy label`);
    assert(variant.first, `${key}: ID badge precedes the variant title`);
    near(variant.tag.height, 24, `${key}: standard ID badge height`);
    near(variant.icon.width, 16, `${key}: standard copy icon width`);
    near(variant.icon.height, 16, `${key}: standard copy icon height`);
    assert.deepEqual(variant.nativeIcon, {complete:true,naturalWidth:16,naturalHeight:16}, `${key}: native copy icon decoded`);
    assert(variant.originalIcon, `${key}: original design-system 16px Copy asset`);
    assert.equal(variant.background, 'rgb(223, 232, 248)', `${key}: standard ID badge blue panel background`);
    for (const [name, item] of [['ID',variant.badge],['title',variant.title]]) {
      assert(item.x >= variant.cell.x-0.6 && item.x+item.width <= variant.cell.x+variant.cell.width+0.6, `${key}: ${name} fits inside the first column`);
      assert(item.y >= variant.cell.y-0.6 && item.y+item.height <= variant.cell.y+variant.cell.height+0.6, `${key}: ${name} fits inside the row`);
    }
    assert(variant.badge.x+variant.badge.width <= variant.title.x+0.6, `${key}: badge and title do not overlap`);
    for (const tagLabel of variant.labels) {
      assert.equal(tagLabel.nowrap, 'nowrap', `${key}: tags stay on one line`);
      assert(tagLabel.height <= 18.6, `${key}: no two-line tag label`);
    }
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
    await context.addInitScript(() => {
      window.__monitoringCopies = [];
      Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{
        async writeText(value) {window.__monitoringCopies.push(String(value));},
        async readText() {return window.__monitoringCopies.at(-1) || '';}
      }});
    });
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
    const identities = () => section.locator('.pd-data-table-monitoring tbody tr').evaluateAll(rows => Object.fromEntries(rows.map(row => [row.dataset.pdKey,row.querySelector('.pd-monitoring-title .pd-copy-tag').dataset.pdValue])));
    assert.deepEqual(await identities(), variantIds, 'Initial monitoring variants have explicit stable IDs');
    for (const width of [1920,1440,1366,2560,3840,390,320]) {
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
      if (width < 768) {
        assert(geometry.scroll > geometry.client, `${width}: wide table remains independently scrollable`);
        assert(geometry.left > 0, `${width}: horizontal scrolling changes offset`);
      } else {
        assert(geometry.scroll <= geometry.client+1, `${width}: monitoring columns fit without horizontal scrolling`);
        assert.equal(geometry.left, 0, `${width}: no hidden horizontal columns`);
      }
      await paint(page);
      await measure(page, `${standalone?'offline':'source'} ${width} after horizontal scroll`);
      await page.screenshot({path:path.join(output, `${width}-monitoring.png`)});
      if (width === 1920 || width === 1366) {
        await section.locator('.pd-data-table-monitoring').screenshot({path:path.join(output,`${width}-monitoring-table.png`)});
      }
    }
    await page.setViewportSize({width:1920,height:1080});
    await scroll.evaluate(element => {element.scrollLeft = 0;});
    for (let round=0;round<2;round++) {
      await section.locator('[data-pd-sort]').first().click();
      await paint(page);
      await measure(page, `${standalone?'offline':'source'} sorted ${round+1}`);
      assert.deepEqual(await identities(), variantIds, `Sort ${round+1}: IDs remain attached to their source variants`);
      const titles = await section.locator('.pd-data-table-monitoring tbody .pd-monitoring-title .pd-data-title').allTextContents();
      const direction = await section.locator('.pd-data-table-monitoring thead th').first().getAttribute('aria-sort');
      const collator = new Intl.Collator('ru', {numeric:true,sensitivity:'base'});
      assert.deepEqual(titles, [...titles].sort((a,b) => (direction === 'descending' ? -1 : 1)*collator.compare(a,b)), `Sort ${round+1}: sorted by title, not badge ID`);
    }
    for (const id of Object.values(variantIds)) {
      await section.locator(`.pd-monitoring-title .pd-copy-tag[data-pd-value="${id}"]`).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), id, `Copy button writes the complete variant ID ${id}`);
    }
    assert.deepEqual(await page.evaluate(() => window.__monitoringCopies), Object.values(variantIds), 'Only the selected variant IDs were copied');
    await section.locator('.pd-data-filter > summary').click();
    await section.locator('[data-pd-status="pending"][data-pd-scope="monitoring"]').click();
    assert.deepEqual(await section.locator('.pd-data-table-monitoring tbody tr:visible .pd-copy-tag').evaluateAll(badges => badges.map(badge => badge.dataset.pdValue)), ['В 0002'], 'Pending filter keeps the correct variant ID');
    assert.deepEqual(await identities(), variantIds, 'Filtering does not regenerate IDs');
    await section.locator('.pd-data-filter > summary').click();
    await section.locator('[data-pd-status="all"][data-pd-scope="monitoring"]').click();
    assert.equal(await section.locator('.pd-data-table-monitoring tbody tr:visible').count(), 5, 'All variants restored after filtering');
    assert.deepEqual(errors, [], 'No runtime errors or failed resources');
    console.log(`PASS — monitoring sphere alignment complete; screenshots: ${output}`);
  } catch (error) {
    if (page) await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
    throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});

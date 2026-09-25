/* Offline distribution regression. Copies ONLY the generated HTML to a new,
 * unrelated directory and renames it, so sibling files cannot mask omissions.
 * Run: node registry/test-standalone.cjs [absolute/path/to/standalone.html]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source = path.resolve(process.argv[2] || path.join(__dirname, '..', 'Sber-BPM-Registry-Standalone.html'));
const report = text => console.log(`PASS — ${text}`);
const ready = (page, id = 'results') => page.waitForFunction(id => document.getElementById(id)?.getAttribute('aria-busy') === 'false', id);

async function assets(page, label) {
  const images = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
    return [...document.images].map(img => ({src: (img.getAttribute('src') || '').slice(0, 120), width: img.naturalWidth, height: img.naturalHeight}));
  });
  assert.ok(images.length > 15, `${label}: page has real image assets`);
  assert.deepEqual(images.filter(img => !img.width || !img.height), [], `${label}: no broken static or dynamically rendered images`);
  assert.ok(images.every(img => /^(data:|blob:)/.test(img.src)), `${label}: images are embedded`);
  const fonts = await page.evaluate(() => [...document.fonts].map(font => ({family: font.family, status: font.status})));
  assert.ok(fonts.every(font => font.status !== 'error'), `${label}: all declared web fonts load; system-only font stacks require no asset`);
}

async function closeDrawer(page) {
  await page.keyboard.press('Escape');
  await page.locator('#process-drawer[open]').waitFor({state: 'hidden'});
}

async function detail(page, trigger, entity) {
  await trigger.click();
  const drawer = page.locator('#process-drawer');
  await page.waitForFunction(() => {
    const element = document.querySelector('#process-drawer');
    return element?.open && !element.classList.contains('pd-is-loading') && !element.querySelector('.pd-main')?.inert;
  });
  assert.equal(await drawer.getAttribute('data-pd-entity'), entity);
  assert.ok((await drawer.locator('#pd-title').innerText()).trim());
  await assets(page, `${entity} Drawer`);
  for (const group of await drawer.locator('[data-pd-motion-group]').all()) {
    if (await group.isVisible()) await group.scrollIntoViewIfNeeded();
  }
  await assets(page, `${entity} Drawer after scrolling`);
  await closeDrawer(page);
}

async function responsive(page, label) {
  for (const width of [1920, 788, 390, 320]) {
    await page.setViewportSize({width, height: 1000});
    await page.mouse.move(width - 1, 1);
    if (await page.locator('body').evaluate(body => body.classList.contains('mobile-menu-open'))) await page.locator('#collapse-menu').click();
    await page.waitForTimeout(200);
    const sizes = await page.evaluate(() => ({viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth}));
    assert.ok(sizes.document <= width + 1 && sizes.body <= width + 1, `${label} ${width}px: no horizontal page overflow: ${JSON.stringify(sizes)}`);
    await assets(page, `${label} ${width}px`);
    if (width === 1920 || width === 390) await page.screenshot({path: path.join(os.tmpdir(), `bpm-standalone-${label}-${width}.png`)});
  }
  await page.setViewportSize({width: 1920, height: 1080});
}

async function main() {
  assert.ok(fs.existsSync(source), `Build the standalone file first: ${source}`);
  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-standalone-verify-'));
  const copy = path.join(isolated, 'renamed-offline-prototype.html');
  fs.copyFileSync(source, copy);
  assert.deepEqual(fs.readdirSync(isolated), ['renamed-offline-prototype.html']);
  const url = pathToFileURL(copy).href;
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  const context = await browser.newContext({offline: true, acceptDownloads: true, viewport: {width: 1920, height: 1080}});
  const errors = [], failures = [], unexpected = [], resources = new Set();
  const short = value => value.length > 180 ? `${value.slice(0, 180)}…` : value;
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  context.on('request', request => {
    const requested = request.url();
    resources.add(request.resourceType());
    if (!/^(data:|blob:)/.test(requested) && requested.split(/[?#]/)[0] !== url) unexpected.push(short(requested));
  });
  context.on('requestfailed', request => failures.push(`${short(request.url())}: ${request.failure()?.errorText}`));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  try {
    await page.goto(`${url}#main`);
    await ready(page);
    assert.ok(await page.locator('.entity-card:not(.skeleton-card)').count() > 0);
    await assets(page, 'Initial cards');
    await page.waitForFunction(() => [...document.querySelectorAll('.efficiency[data-efficiency-percent]')].filter(e => e.getClientRects().length).every(element => {
      const number = element.querySelector('[data-counter-number]');
      return !number || Math.abs(Number(number.textContent.replace(/\s/g, '').replace(',', '.')) - Number(element.dataset.efficiencyPercent)) < .001;
    }));
    await detail(page, page.locator('#results [data-detail]').first(), 'paths');
    await page.locator('#processes-tab').click(); await ready(page);
    await detail(page, page.locator('#results [data-detail]').first(), 'processes');
    await page.locator('#table-view').click(); await ready(page);
    assert.ok(await page.locator('.registry-table tbody tr[data-record]').count() > 0);
    await page.locator('.registry-table [data-sort="owner"]').click();
    assert.equal(await page.locator('.registry-table th[aria-sort="ascending"], .registry-table th[aria-sort="descending"]').count(), 1);
    await assets(page, 'Registry table');
    await page.locator('#cards-view').click(); await ready(page);
    await page.locator('#registry-search').fill('несуществующая запись standalone 999'); await ready(page);
    assert.equal(await page.locator('.entity-card').count(), 0);
    await page.locator('#clear-search').click(); await ready(page);
    await page.locator('#block-select-input').click();
    const option = page.locator('#block-select-list [role="option"]').filter({hasNotText: /^Все$/}).first();
    await option.click(); await page.keyboard.press('Escape'); await ready(page);
    assert.ok(await page.locator('#selected-filter-groups [data-filter-key="block"]').count() > 0);
    await page.locator('#reset-filters').click(); await ready(page);
    await page.locator('#date-filter').click();
    await page.locator('.bpm-calendar').waitFor();
    await assets(page, 'Registry calendar');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.bpm-calendar').count(), 0);
    await responsive(page, 'registry');
    report('Offline cards/table, search/reset, selected filters, calendar, animated efficiency and both full Drawers');

    await page.locator('#structure-toggle').click(); await ready(page, 'structure-list');
    assert.equal(await page.locator('#structure-list > .structure-node').count(), 9);
    assert.equal(await page.locator('.structure-heading[aria-expanded="true"]').count(), 0);
    assert.ok(await page.locator('[data-chart-type="2"]').count() > 0);
    await page.locator('#structure-chart-toggle').click();
    assert.ok(await page.locator('[data-chart-type="1"]').count() > 0);
    await page.locator('#structure-chart-toggle').click();
    assert.ok(await page.locator('[data-chart-type="2"]').count() > 0);
    const fixture = await page.evaluate(() => {
      const path = window.BPM_STRUCTURE_PATHS.records.find(row => row.code === 'КП-ДЕМО-0027');
      const product = path.productLinks[0].id;
      let chain;
      for (const root of window.BPM_STRUCTURE.roots) for (const division of root.children) if (division.children.some(child => child.id === product)) chain = [root.id, division.id, product];
      return {chain, path: path.id, processes: path.linkedProcessIds.length, process: 'structure-p433', paths: window.BPM_STRUCTURE_PATHS.records.filter(row => row.linkedProcessIds.includes('structure-p433')).length};
    });
    for (const entity of ['processes', 'paths']) {
      const tab = page.locator(`#structure-${entity}-tab`);
      if (await tab.getAttribute('aria-pressed') !== 'true') {await tab.click(); await ready(page, 'structure-list');}
      for (const id of fixture.chain) {
        const heading = page.locator(`[data-expand="${id}"]`);
        if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
      }
      const id = entity === 'processes' ? fixture.process : fixture.path;
      const button = page.locator(`[data-structure-related="${id}"]`).first();
      const control = await button.getAttribute('aria-controls');
      await button.click();
      const panel = page.locator(`[id="${control}"]`);
      const childEntity = entity === 'processes' ? 'paths' : 'processes';
      const rows = panel.locator(`[data-structure-record][data-record-entity="${childEntity}"]`);
      assert.equal(await rows.count(), entity === 'processes' ? fixture.paths : fixture.processes);
      assert.equal(await panel.locator('.structure-pagination').count(), 0);
      if (childEntity === 'processes') assert.equal(await panel.locator('.structure-incoming-relationship').count(), fixture.processes);
      await assets(page, `Structure ${entity} reciprocal rows`);
      await detail(page, rows.first().locator('[data-structure-detail]'), childEntity);
    }
    await responsive(page, 'structure');
    const documentation = page.locator('.structure-note a');
    if (await documentation.count()) {
      await documentation.click();
      const dialog = page.locator('dialog[open]');
      await dialog.waitFor();
      assert.match(await dialog.innerText(), /источник|структур|Excel/i);
      await page.keyboard.press('Escape');
      await dialog.waitFor({state: 'hidden'});
    }
    report('Both Structure charts/entities, Excel-backed reciprocal relationships, participation tags, embedded source documentation and responsive layout');

    await page.locator('#tasks-nav').click(); await ready(page, 'tasks-results');
    assert.ok(await page.locator('.task-table-row[data-task-id]').count() > 0);
    await page.locator('#tasks-cards').click(); await ready(page, 'tasks-results');
    assert.ok(await page.locator('#tasks-results article[data-task-id]').count() > 0);
    await page.locator('[data-task-tab="all"]').click(); await ready(page, 'tasks-results');
    await page.locator('#tasks-search').fill('К-2026-0002'); await ready(page, 'tasks-results');
    assert.equal(await page.locator('#tasks-results article[data-task-id]').count(), 1);
    await page.locator('#tasks-clear-search').click(); await ready(page, 'tasks-results');
    await page.locator('#tasks-date').click();
    await page.locator('.bpm-calendar').waitFor();
    await page.locator('.bpm-calendar [data-picker="year"]').click();
    await page.locator('.bpm-calendar-picker [data-picker-value="2026"]').click();
    await page.locator('.bpm-calendar [data-picker="month"]').click();
    await page.locator('.bpm-calendar-picker [data-picker-value="8"]').click();
    await page.locator('.bpm-calendar [data-date="2026-09-12"][data-own-month="true"]').click();
    await page.locator('.bpm-calendar [data-date="2026-09-16"][data-own-month="true"]').click(); await ready(page, 'tasks-results');
    assert.equal(await page.locator('#tasks-date-summary').innerText(), '12.09.2026 → 16.09.2026');
    await page.locator('#tasks-reset').click(); await ready(page, 'tasks-results');
    await page.locator('#tasks-create').click();
    await page.locator('#task-drawer[open]').waitFor();
    assert.equal(await page.locator('[data-task-type]').count(), 8);
    await page.locator('[data-task-type="standard"]').click();
    assert.equal(await page.locator('[data-task-type="standard"]').getAttribute('aria-pressed'), 'true');
    await assets(page, 'Task type Drawer');
    await page.keyboard.press('Escape');
    await page.locator('#task-drawer[open]').waitFor({state: 'hidden'});
    await responsive(page, 'tasks');
    report('Tasks table/cards, tabs, search, calendar range, type choice Drawer and responsive layout');

    await page.locator('#registry-nav').click(); await ready(page);
    for (const id of ['paths-nav', 'gemba-nav']) {
      await page.locator(`#${id}`).click(); await assets(page, `${id} collapsed chevron`);
      await page.locator(`#${id}`).click(); await assets(page, `${id} expanded chevron`);
    }
    await page.locator('#collapse-menu').click();
    await assets(page, 'Collapsed sidebar arrow');
    await page.mouse.move(1800, 500);
    await page.locator('#sidebar').hover();
    await page.locator('#pin-menu').click();
    await assets(page, 'Pinned sidebar arrow');
    await page.locator('#export').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-form button[type="submit"]').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.csv$/);
    assert.equal(await download.failure(), null);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    assert.match(csv, /Эффективность/);
    assert.ok(csv.split('\n').length > 2);
    await page.locator('.brand').click();
    await page.waitForFunction(() => !document.querySelector('#cabinet-panel')?.hidden && document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy') === 'false');
    assert.equal(page.url().split(/[?#]/)[0], url, 'Brand works after the HTML is renamed');
    await assets(page, 'Brand self navigation');
    report('Dynamic menu assets, offline CSV download and renamed-file logo navigation');

    assert.deepEqual(errors, [], 'No JavaScript errors');
    assert.deepEqual(failures, [], 'No failed resource loads');
    assert.deepEqual(unexpected, [], 'No sibling-file or network resource requests');
    console.log(JSON.stringify({status: 'PASS', source, isolatedFile: copy, bytes: fs.statSync(copy).size, resourceTypes: [...resources], errors, failures, unexpected, screenshots: path.join(os.tmpdir(), 'bpm-standalone-{registry,structure,tasks}-{1920,390}.png')}, null, 2));
  } catch (error) {
    await page.screenshot({path: path.join(os.tmpdir(), 'bpm-standalone-failure.png')}).catch(() => {});
    console.error(JSON.stringify({errors, failures, unexpected, isolatedFile: copy}, null, 2));
    throw error;
  } finally {await context.close(); await browser.close();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});

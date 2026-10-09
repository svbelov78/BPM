/* Browser regression for the Insights registry.
 * Run with the bundled Node runtime:
 *   node test-insights.cjs
 *   BPM_INSIGHTS_URL=http://127.0.0.1:4180/#insights node test-insights.cjs
 * Optional first argument: source index.html, an HTTP URL, or standalone HTML.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {fileURLToPath, pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const requested = process.argv[2] || process.env.BPM_INSIGHTS_URL || 'http://127.0.0.1:4180/#insights';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-insights-test-'));
let target = requested;
if (!/^https?:/.test(target)) {
  const local = target.startsWith('file:') ? fileURLToPath(target.split('#')[0]) : path.resolve(target);
  if (path.basename(local) !== 'index.html') {
    target = path.join(output, 'isolated-prototype.html');
    fs.copyFileSync(local, target);
  } else target = local;
  target = pathToFileURL(target).href;
}
const base = target.split('#')[0];
const entityFields = ['block', 'division', 'product', 'path', 'process', 'source', 'bank', 'owner', 'author'];
const resultsSelector = '#insights-results';
const cardSelector = `${resultsSelector} .insights-card[data-insight-id]`;
const rowSelector = `${resultsSelector} tbody tr[data-insight-id]`;
const report = message => console.log(`PASS — ${message}`);
let capturedTableLoading = false;

async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame);
  });
  if (await page.locator('#insights-panel:not([hidden])').count()) {
    await page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#insights-results .skeleton-shape').count(), 0, 'Ready registry has no stale skeletons');
  }
}

async function assertLoading(page, label, view) {
  await page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'true');
  const currentView = view || (await page.locator('#insights-table').getAttribute('aria-pressed') === 'true' ? 'table' : 'cards');
  assert.ok(await page.locator('#insights-results .skeleton-shape').count() > 0, `${label}: shared shimmer shapes are visible`);
  assert.equal(await page.locator(`${cardSelector}, ${rowSelector}`).count(), 0, `${label}: old interactive records are replaced while loading`);
  const placeholders = page.locator(currentView === 'table' ? '#insights-results tr.insights-skeleton-row' : '#insights-results .cabinet-skeleton');
  assert.ok(await placeholders.count() > 0, `${label}: ${currentView} uses its reference placeholders`);
  const placeholderState = await placeholders.evaluateAll(elements => elements.map(element => ({
    hidden: element.getAttribute('aria-hidden'),
    interactive: element.querySelectorAll('button, a, input, select, textarea, [tabindex], [data-insight-id], [data-insight-open], [data-insight-copy], [data-insight-related]').length,
    cells: element.tagName === 'TR' ? element.children.length : null,
    height: element.getBoundingClientRect().height
  })));
  for (const placeholder of placeholderState) {
    assert.equal(placeholder.hidden, 'true', `${label}: placeholders are hidden from assistive technology`);
    assert.equal(placeholder.interactive, 0, `${label}: placeholders contain no buttons, focus targets, or record actions`);
    if (currentView === 'table') assert.equal(placeholder.cells, 6, `${label}: each skeleton row has six cells`);
    const expectedHeight = currentView === 'table' ? 144 : 311;
    assert.ok(Math.abs(placeholder.height - expectedHeight) < 1, `${label}: placeholder height matches ${expectedHeight}px (${placeholder.height})`);
  }
}

async function ids(page, view = 'cards') {
  return page.locator(view === 'cards' ? cardSelector : rowSelector)
    .evaluateAll(elements => elements.map(element => element.dataset.insightId));
}

async function setView(page, view) {
  const changesView = await page.locator(`#insights-${view}`).getAttribute('aria-pressed') !== 'true';
  await page.locator(`#insights-${view}`).click();
  if (changesView) await assertLoading(page, `Switch to ${view}`, view);
  const loadingColumns = changesView && view === 'table' ? await page.locator('#insights-results thead th').evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width)) : null;
  if (changesView && view === 'table' && !capturedTableLoading) {
    await page.mouse.move(1, 1);
    await page.screenshot({path: path.join(output, 'table-loading-1920.png'), fullPage: false});
    capturedTableLoading = true;
  }
  await paint(page);
  if (loadingColumns) {
    const readyColumns = await page.locator('#insights-results thead th').evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width));
    assert.equal(readyColumns.length, 6, 'Ready table retains all skeleton columns');
    readyColumns.forEach((width, index) => assert.ok(Math.abs(width - loadingColumns[index]) < 1, `Table column ${index + 1} does not jump after loading (${loadingColumns[index]} → ${width})`));
  }
  assert.equal(await page.locator(`#insights-${view}`).getAttribute('aria-pressed'), 'true', `${view} button marks active view`);
}

async function reset(page) {
  await page.keyboard.press('Escape');
  const button = page.locator('#insights-reset');
  if (await button.isVisible()) {
    await button.click();
    await assertLoading(page, 'Reset filters');
  }
  else await page.locator('#insights-search').fill('');
  await paint(page);
}

async function chooseFirstValue(page, key, requestedValue) {
  const input = page.locator(`#insights-${key}-input`);
  await input.click();
  const popup = page.locator(`#insights-${key}-list`);
  await popup.waitFor({state: 'visible'});
  let option = requestedValue ? popup.locator(`[role="option"][data-option="${requestedValue}"]`) : popup.locator('[role="option"][data-option]:not([data-option=""])').first();
  const label = (await option.locator('.option-label').textContent()).trim();
  const value = await option.getAttribute('data-option');
  if (key === 'process') {
    const code = label.match(/П (\d{4,})/);
    assert.ok(code, 'Process choices include an actual, spaced four-digit code');
    await input.fill(`П${code[1]}`);
    option = popup.locator(`[role="option"][data-option="${value}"]`);
    assert.ok(await option.isVisible(), 'Process can be found by its compact ID');
    assert.equal((await option.locator('.option-label').textContent()).trim(),label,'ID search preserves the complete process choice');
  }
  await option.click();
  await assertLoading(page, `${key} filter`);
  await page.keyboard.press('Escape');
  await paint(page);
  assert.equal(await input.getAttribute('aria-expanded'), 'false', `${key}: selector closes with Escape`);
  if (key === 'process') assert.equal(await page.locator('#insights-chips [data-insight-filter-key="process"]').first().evaluate(button => button.closest('.chip').querySelector('.chip-text').textContent),label,'Selected process chip keeps both the name and ID');
  return value;
}

async function assertImages(page, label) {
  await page.waitForFunction(() => [...document.querySelectorAll('#insights-panel img')]
    .filter(image => image.getClientRects().length).every(image => image.complete && image.naturalWidth > 0));
  const broken = await page.locator('#insights-panel img').evaluateAll(images => images
    .filter(image => image.getClientRects().length && (!image.complete || !image.naturalWidth))
    .map(image => image.getAttribute('src')));
  assert.deepEqual(broken, [], `${label}: every visible asset resolves`);
}

async function assertNoOverflow(page, label) {
  const geometry = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: innerWidth,
    panel: document.querySelector('#insights-panel').getBoundingClientRect().toJSON()
  }));
  assert.ok(geometry.page <= geometry.viewport + 1, `${label}: no document-level horizontal overflow (${geometry.page}/${geometry.viewport})`);
  assert.ok(geometry.panel.right <= geometry.viewport + 1, `${label}: registry panel stays inside viewport`);
}

async function main() {
  const startedAt = Date.now();
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}, reducedMotion: 'no-preference', offline: base.startsWith('file:')});
  const errors = [];
  const failed = [];
  const interactionFailures = [];
  await context.addInitScript(() => localStorage.setItem('bpm-registry-menu', 'expanded'));
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
  try {
    await page.goto(`${base}#insights`, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => !document.querySelector('#insights-panel')?.hidden);
    const initialLoadingAt = await page.evaluate(() => performance.now());
    await assertLoading(page, 'Initial entry', 'cards');
    const shimmer = page.locator('#insights-results .skeleton-shape').first();
    assert.equal(await shimmer.evaluate(element => getComputedStyle(element, '::after').animationName), 'bpm-shimmer', 'Default motion uses the shared shimmer animation');
    await page.emulateMedia({reducedMotion: 'reduce'});
    const reducedMotion = await shimmer.evaluate(element => {
      const style = getComputedStyle(element, '::after');
      return {animation: style.animationName, display: style.display};
    });
    assert.deepEqual(reducedMotion, {animation: 'none', display: 'none'}, 'Reduced motion preserves skeleton geometry without animation');
    await page.screenshot({path: path.join(output, 'cards-loading-1920.png'), fullPage: false});
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await paint(page);
    const initialLoadingDuration = await page.evaluate(start => performance.now() - start, initialLoadingAt);
    assert.ok(initialLoadingDuration >= 1500, `Initial loading lasts approximately two seconds (${Math.round(initialLoadingDuration)}ms observed)`);
    report('Initial shared shimmer, noninteractive placeholders and reduced-motion behavior');
    const data = await page.evaluate(() => window.BPM_INSIGHT_DATA);
    assert.ok(Array.isArray(data) && data.length === 16, 'Registry exposes the six original records and ten BRD scenarios');
    assert.deepEqual([...new Set(data.map(row => row.status))].sort(), ['Новый','Согласовано','Мнения собраны','Отклонено','В работе','Реализовано'].sort(), 'Only the six formal business statuses appear');
    const originalIds = await ids(page);
    assert.equal(originalIds.length, data.length, 'Unfiltered registry renders every source record');
    assert.equal(new Set(originalIds).size, originalIds.length, 'Record IDs are unique');
    assert.equal(await page.locator('#insights-nav').getAttribute('aria-current'), 'page');
    assert.ok(await page.locator('#insights-create').isEnabled(), 'Create insight entry point is available');
    for (const key of [...entityFields, 'status']) assert.equal(await page.locator(`#insights-${key}-input`).count(), 1, `${key} selector exists`);
    assert.equal(await page.locator('#insights-bank').isVisible(),false,'Bank selector is hidden until source ТБ is selected');
    await assertImages(page, 'Initial cards');
    const valueTypography = await page.locator('#insights-panel .select-input, #insights-date .single-value').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return {id: element.id, fontSize: style.fontSize, lineHeight: style.lineHeight};
    }));
    valueTypography.forEach(value => {
      assert.equal(value.fontSize, '17px', `${value.id}: filter and date values use the 17px reference font`);
      assert.equal(value.lineHeight, '24px', `${value.id}: filter and date values use a 24px line height`);
    });
    await page.mouse.move(1, 1);
    await page.screenshot({path: path.join(output, 'cards-reference-1920.png'), fullPage: false});
    report(`${data.length} records, navigation, registry controls, original assets`);
    await setView(page, 'table');
    await setView(page, 'cards');

    const firstId = originalIds[0];
    const lastId = originalIds[originalIds.length - 1];
    await page.locator('#insights-search').fill(firstId);
    await assertLoading(page, 'First rapid query', 'cards');
    await page.locator('#insights-search').fill('query-with-no-results-rapid');
    await page.locator('#insights-search').fill(lastId);
    await assertLoading(page, 'Latest rapid query', 'cards');
    await paint(page);
    assert.deepEqual(await ids(page), [lastId], 'Rapid input commits only the most recent query');
    await reset(page);
    report('Rapid consecutive searches are latest-request-wins');

    await page.locator('#insights-search').fill(firstId);
    await assertLoading(page, 'Search by insight ID', 'cards');
    const searchChip = page.locator('#insights-chips [data-insight-filter-key="query"]');
    const focusedChip = await searchChip.elementHandle();
    await searchChip.focus();
    await paint(page);
    assert.equal(await focusedChip.evaluate(element => element.isConnected && document.activeElement === element), true, 'Completing loading preserves the focused filter-chip button and its DOM node');
    await focusedChip.dispose();
    assert.deepEqual(await ids(page), [firstId], 'Search matches the exact insight ID');
    await setView(page, 'table');
    assert.deepEqual(await ids(page, 'table'), [firstId], 'Switching to table preserves search');
    assert.equal(await page.locator(`${resultsSelector} thead th`).count(), 6, 'Table has the six reference columns');
    const headers = await page.locator(`${resultsSelector} thead th`).allTextContents();
    assert.match(headers[0], /ID.*Инсайт/s);
    assert.match(headers[1], /Владелец/);
    assert.match(headers[2], /Дата создания/);
    assert.match(headers[3], /Статус/);
    await setView(page, 'cards');
    assert.deepEqual(await ids(page), [firstId], 'Returning to cards preserves search');
    await reset(page);
    assert.deepEqual((await ids(page)).sort(), originalIds.slice().sort(), 'Reset restores every record');
    await page.locator('#insights-search').fill('insight-with-no-match-987654321');
    await paint(page);
    assert.equal((await ids(page)).length, 0, 'Unmatched search produces an empty result');
    assert.match(await page.locator(resultsSelector).innerText(), /не найден|ничего|нет инсайт/i, 'Empty results have a readable message');
    await reset(page);
    report('Search, empty state, six-column table, cards/table state preservation');

    for (const key of entityFields) {
      if (key === 'bank') {
        await chooseFirstValue(page,'source','ТБ');
        assert.equal(await page.locator('#insights-bank').isVisible(),true,'Source ТБ exposes the bank selector');
      }
      const chosen = await chooseFirstValue(page, key);
      const selected = await ids(page);
      assert.ok(selected.length > 0 && selected.length <= originalIds.length, `${key}: selecting “${chosen}” yields valid records`);
      const matchingIds = data.filter(record => Array.isArray(record[key]) ? record[key].includes(chosen) : (key === 'owner' ? record[key] || 'Не назначен' : record[key]) === chosen).map(record => record.id);
      assert.deepEqual(selected.slice().sort(), matchingIds.sort(), `${key}: filter matches the exact data subset`);
      assert.ok(await page.locator('#insights-reset').isVisible(), `${key}: active filter exposes reset`);
      await reset(page);
      assert.equal((await ids(page)).length, originalIds.length, `${key}: reset removes the restriction`);
      assert.equal(await page.locator('#insights-bank').isVisible(),false,`${key}: reset hides the dependent bank selector`);
    }
    await page.locator('#insights-status-input').click();
    assert.deepEqual((await page.locator('#insights-status-list [role="option"][data-option]:not([data-option=""]) .option-label').allTextContents()).map(value=>value.trim()),['Новый','Согласовано','Мнения собраны','Отклонено','В работе','Реализовано'],'Status filter offers all six formal statuses in workflow order');
    const statusOption = page.locator('#insights-status-list [role="option"][data-option]:not([data-option=""])').first();
    const statusLabel = (await statusOption.locator('.option-label').textContent()).trim();
    await page.locator('#insights-status-input').fill(statusLabel);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await assertLoading(page, 'Status selected from keyboard');
    await paint(page);
    const statusIds = await ids(page);
    assert.ok(statusIds.length > 0 && statusIds.length < originalIds.length, 'Keyboard selection filters by status');
    await setView(page, 'table');
    assert.deepEqual(await ids(page, 'table'), statusIds, 'Status restriction persists across view changes');
    await reset(page);
    await setView(page, 'cards');
    report('All nine entity filters, dependent ТБ bank filter, six formal statuses, reset, keyboard selection');

    await page.locator('#insights-date').click();
    const calendar = page.locator('.bpm-calendar');
    await calendar.waitFor({state: 'visible'});
    await page.keyboard.press('Escape');
    await calendar.waitFor({state: 'hidden'});
    assert.equal((await ids(page)).length, originalIds.length, 'Dismissing the calendar preserves data');
    await page.locator('#insights-date').click();
    await page.locator('.bpm-calendar [data-days="1"]').click();
    await assertLoading(page, 'Date range applied');
    await paint(page);
    assert.ok(await page.locator('#insights-reset').isVisible(), 'Applying a date range exposes reset');
    await reset(page);
    assert.equal((await ids(page)).length, originalIds.length, 'Reset clears the date range');
    report('Shared calendar: cancellation, applying a period, reset');

    await page.locator('#insights-sort-input').click();
    const sorting = page.locator('#insights-sort-list');
    await sorting.waitFor({state: 'visible'});
    const sortOptions = await sorting.locator('[role="option"]').evaluateAll(options => options.map(option => ({value: option.dataset.option, label: option.querySelector('.option-label').textContent.trim()})));
    const titleSort = sortOptions.find(option => option.value === 'title-asc') || sortOptions.find(option => option.value.startsWith('title'));
    assert.ok(titleSort, 'Card sorting offers the insight title');
    await page.locator('#insights-sort-input').fill(titleSort.label);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await assertLoading(page, 'Card sorting');
    await paint(page);
    const sortedIds = await ids(page);
    const titlesById = Object.fromEntries(data.map(record => [record.id, record.title]));
    const expectedTitleOrder = originalIds.slice().sort((left, right) => titlesById[left].localeCompare(titlesById[right], 'ru'));
    assert.deepEqual(sortedIds, expectedTitleOrder, 'Keyboard card sorting orders every title alphabetically');
    await setView(page, 'table');
    const sortIdButton = page.locator('[data-insight-sort="id"]');
    await sortIdButton.click();
    await assertLoading(page, 'Table ID sorting', 'table');
    await page.locator('#insights-results .insights-table-wrap').focus();
    await paint(page);
    assert.equal(await page.evaluate(() => document.activeElement?.matches('#insights-results .insights-table-wrap')), true, 'Completing table loading restores keyboard focus to the local horizontal scroller');
    const firstSort = await ids(page, 'table');
    await sortIdButton.click();
    await assertLoading(page, 'Reverse table ID sorting', 'table');
    await paint(page);
    assert.deepEqual(await ids(page, 'table'), firstSort.slice().reverse(), 'Table sorting reverses ID order');
    await setView(page, 'cards');
    report('Keyboard card sorting and reversible table sorting');

    try {
      const related = page.locator('[data-insight-related]').first();
      assert.ok(await related.count(), 'A registry record demonstrates multiple related entities');
      await related.hover();
      const relatedTooltip = page.locator('#insights-relations-tooltip');
      await relatedTooltip.waitFor({state: 'visible'});
      assert.match(await relatedTooltip.innerText(), /связан|процесс|пут/i, 'Relations tooltip names the linked entities');
      await page.keyboard.press('Escape');
      await relatedTooltip.waitFor({state: 'hidden'});
      await page.locator('#insights-search').focus();
      await related.focus();
      await relatedTooltip.waitFor({state: 'visible'});
      await page.keyboard.press('Escape');
      await relatedTooltip.waitFor({state: 'hidden'});
      await page.mouse.move(1, 1);
      report('Related-entity tooltip on pointer hover and keyboard focus, dismissal with Escape');
    } catch (error) {
      interactionFailures.push(`Related entities: ${error.message}`);
      await page.locator('#insights-search').click();
    }

    await page.locator('#insights-search').fill(firstId);
    await paint(page);
    await page.locator('#insights-export').click();
    const exportDialog = page.locator('#insights-export-dialog');
    await exportDialog.waitFor({state: 'visible'});
    assert.match(await exportDialog.innerText(), /Экспорт инсайтов/);
    const exportGeometry = await exportDialog.evaluate(dialog => {
      const rect = dialog.getBoundingClientRect();
      const headingStyle = getComputedStyle(dialog.querySelector('h3'));
      return {width: rect.width, height: rect.height, fontSize: headingStyle.fontSize, lineHeight: headingStyle.lineHeight};
    });
    assert.ok(Math.abs(exportGeometry.width - 603) < 1, `Desktop export width matches 603px (${exportGeometry.width})`);
    assert.ok(Math.abs(exportGeometry.height - 355) < 1, `Desktop export height matches 355px (${exportGeometry.height})`);
    assert.equal(exportGeometry.fontSize, '22px', 'Export secondary heading uses 22px');
    assert.equal(exportGeometry.lineHeight, '26px', 'Export secondary heading uses a 26px line height');
    await page.mouse.move(1, 1);
    await exportDialog.screenshot({path: path.join(output, 'export-reference-1920.png')});
    await exportDialog.locator('input[name="insights-export-scope"][value="filtered"]').check();
    const downloadPromise = page.waitForEvent('download');
    await exportDialog.getByRole('button', {name: 'Скачать', exact: true}).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const csv = fs.readFileSync(downloadPath, 'utf8');
    assert.ok(csv.includes(firstId), 'Filtered CSV contains the selected insight');
    for (const id of originalIds.filter(id => id !== firstId)) assert.ok(!csv.includes(id), `Filtered CSV excludes ${id}`);
    assert.match(download.suggestedFilename(), /\.csv$/i, 'Export produces a readable CSV file');
    await page.keyboard.press('Escape');
    await exportDialog.waitFor({state: 'hidden'});
    await reset(page);
    report('Export dialog downloads exactly the filtered CSV subset');

    // Responsive checks exercise the actual layout; horizontal overflow is
    // allowed only inside the table's local scroller, never on the page.
    for (const width of [1920, 1440, 768, 390, 3840]) {
      await page.setViewportSize({width, height: width === 3840 ? 2160 : 1080});
      await paint(page);
      // The shared shell retains the expanded-menu preference on resize.
      // Dismiss its mobile overlay as a user would before exercising content.
      await page.keyboard.press('Escape');
      await setView(page, 'cards');
      await assertNoOverflow(page, `${width}px cards`);
      await assertImages(page, `${width}px cards`);
      const widths = await page.locator(cardSelector).evaluateAll(cards => cards.map(card => card.getBoundingClientRect().width));
      assert.ok(Math.max(...widths) - Math.min(...widths) < 1, `${width}px: cards have consistent widths`);
      await page.screenshot({path: path.join(output, `cards-${width}.png`), fullPage: false});
      await setView(page, 'table');
      await assertNoOverflow(page, `${width}px table`);
      await assertImages(page, `${width}px table`);
      assert.equal(await page.locator(`${resultsSelector} thead th`).count(), 6, `${width}px: table retains six columns`);
      assert.equal((await ids(page, 'table')).length, originalIds.length, `${width}px: every record remains accessible`);
      await page.screenshot({path: path.join(output, `table-${width}.png`), fullPage: false});
    }
    report('Responsive cards and table at 1920 / 1440 / 768 / 390 / 3840 px');

    await page.setViewportSize({width: 1920, height: 1080});
    await setView(page, 'cards');
    await page.locator('#insights-search').fill(firstId);
    await assertLoading(page, 'Search before leaving registry', 'cards');
    await page.locator('#cabinet-nav').click();
    await page.waitForFunction(() => !document.querySelector('#cabinet-panel')?.hidden);
    assert.equal(await page.locator('#insights-results').getAttribute('aria-busy'), 'false', 'Leaving cancels the pending registry load');
    const cancelledMarkup = await page.locator('#insights-results').innerHTML();
    // Waiting for Cabinet's own loading completion gives the abandoned
    // registry request time to fire, without a blind two-second sleep.
    await page.waitForFunction(() => !document.querySelector('#cabinet-panel')?.hidden && !document.querySelector('#cabinet-panel [aria-busy="true"]'));
    assert.equal(await page.locator('#insights-results').innerHTML(), cancelledMarkup, 'An abandoned load never commits after leaving the registry');
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('#insights-panel')?.hidden);
    await assertLoading(page, 'Re-entry after cancellation', 'cards');
    await paint(page);
    assert.equal(await page.locator('#insights-search').inputValue(), firstId, 'Browser Back retains registry state');
    assert.deepEqual(await ids(page), [firstId]);
    await reset(page);
    assert.deepEqual(errors, [], 'No browser exceptions');
    assert.deepEqual(failed, [], 'No missing assets or failed resource requests');
    assert.deepEqual(interactionFailures, [], 'Every related-entity interaction passes');
    report('Leaving cancels pending work; re-entry restarts shimmer and preserves filters; no runtime exceptions');
    console.log(`Screenshots: ${output}`);
    console.log(`Duration: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {console.error(error); process.exitCode = 1;});

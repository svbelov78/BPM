/* Field typography and exact-source icon regression. Isolated Chrome only.
 * Default: file:// source page. BPM_FIELD_CONTROLS_FILE copies only an offline
 * build to an unrelated temporary directory before checking it.
 * Expected exported assets are configured below; no SVG path data is inspected.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL, fileURLToPath} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const icons = {
  chevron: process.env.BPM_FIELD_CHEVRON_ASSET || 'assets/field-chevron-down-16.svg',
  clear: process.env.BPM_FIELD_CLEAR_ASSET || 'assets/field-clear-16.svg',
  formChevron: process.env.BPM_FIELD_FORM_CHEVRON_ASSET || process.env.BPM_FIELD_CHEVRON_ASSET || 'assets/field-chevron-down-16.svg',
  paginationChevron: process.env.BPM_FIELD_PAGINATION_CHEVRON_ASSET || 'assets/chevron-down-pagination.svg'
};
const standalone = process.env.BPM_FIELD_CONTROLS_FILE;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-field-controls-qa-'));
const report = message => console.log(`PASS — ${message}`);
const near = (actual, expected, label, tolerance = .55) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const ready = (page, id = 'results') => page.waitForFunction(id => document.getElementById(id)?.getAttribute('aria-busy') === 'false', id);

async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function geometry(locator, size, label) {
  const box = await locator.boundingBox();
  assert.ok(box, `${label}: visible`);
  near(box.width, size, `${label} width`);
  near(box.height, size, `${label} height`);
}

async function exactIcon(locator, asset, label, hidden = false) {
  assert.equal(await locator.count(), 1, `${label}: one icon`);
  const actual = await locator.evaluate(async image => {
    await image.decode();
    await Promise.all(image.getAnimations().map(animation => animation.finished.catch(() => {})));
    const box = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    return {src: image.currentSrc || image.src, width: box.width, height: box.height, cssWidth: style.width, cssHeight: style.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight};
  });
  if (hidden) assert.deepEqual([actual.cssWidth, actual.cssHeight], ['16px', '16px'], `${label}: 16px CSS size while parent pagination is hidden`);
  else {near(actual.width, 16, `${label} width`);near(actual.height, 16, `${label} height`);}
  assert.equal(actual.naturalWidth, 16, `${label}: native 16px source width`);
  assert.equal(actual.naturalHeight, 16, `${label}: native 16px source height`);
  const expected = path.resolve(__dirname, asset);
  if (actual.src.startsWith('data:')) {
    const comma = actual.src.indexOf(','), metadata = actual.src.slice(0, comma), content = actual.src.slice(comma + 1);
    const bytes = metadata.includes(';base64') ? Buffer.from(content, 'base64') : Buffer.from(decodeURIComponent(content));
    assert.ok(bytes.equals(fs.readFileSync(expected)), `${label}: embedded bytes equal the exported source asset`);
  } else {
    assert.equal(path.resolve(fileURLToPath(actual.src)), expected, `${label}: exact exported source path`);
  }
}

async function typography(locator, size, lineHeight, label) {
  const actual = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    return [style.fontSize, style.lineHeight, element.getBoundingClientRect().height];
  });
  assert.deepEqual(actual.slice(0, 2), [`${size}px`, `${lineHeight}px`], `${label}: typography`);
  near(actual[2], 24, `${label}: 24px value slot`);
}

async function alignedDate(page, dateSelector, inputSelector, label) {
  await paint(page);
  const result = await page.evaluate(({dateSelector, inputSelector}) => {
    const date = document.querySelector(dateSelector), input = document.querySelector(inputSelector);
    const dateStyle = getComputedStyle(date), style = getComputedStyle(input);
    const range = document.createRange();
    range.selectNodeContents(date);
    const text = range.getBoundingClientRect();
    // Native single-line inputs center their line box in the content box.
    // An offscreen text probe supplies the browser's actual font ascent/descent
    // and inline Range offset, including platform-specific font fallback.
    const probe = document.createElement('div'), glyphs = document.createElement('span');
    Object.assign(probe.style, {
      position: 'fixed', top: '0', left: '-10000px', width: '1000px',
      height: style.lineHeight, lineHeight: style.lineHeight, padding: '0',
      border: '0', margin: '0', whiteSpace: 'nowrap', textAlign: 'left'
    });
    for (const property of ['fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontStretch', 'fontVariant', 'letterSpacing']) probe.style[property] = style[property];
    glyphs.textContent = date.textContent;
    probe.append(glyphs);document.body.append(probe);
    range.selectNodeContents(glyphs);
    const glyphTop = range.getBoundingClientRect().top - probe.getBoundingClientRect().top;
    probe.remove();
    const box = input.getBoundingClientRect(), number = value => parseFloat(value) || 0;
    const topInset = number(style.borderTopWidth) + number(style.paddingTop);
    const bottomInset = number(style.borderBottomWidth) + number(style.paddingBottom);
    const lineTop = box.top + topInset + (box.height - topInset - bottomInset - number(style.lineHeight)) / 2;
    return {
      dateTextTop: text.top - date.closest('.field').getBoundingClientRect().top,
      inputTextTop: lineTop + glyphTop - input.closest('.field').getBoundingClientRect().top,
      dateFont: [dateStyle.fontFamily, dateStyle.fontSize, dateStyle.fontWeight],
      inputFont: [style.fontFamily, style.fontSize, style.fontWeight],
      dateHeight: date.closest('.field').getBoundingClientRect().height,
      inputHeight: input.closest('.field').getBoundingClientRect().height
    };
  }, {dateSelector, inputSelector});
  assert.deepEqual(result.dateFont, result.inputFont, `${label}: comparable value fonts`);
  near(result.dateHeight, 50, `${label}: date field height`);
  near(result.inputHeight, 50, `${label}: select field height`);
  near(result.dateTextTop, result.inputTextTop, `${label}: rendered text baseline`, .55);
}

async function chevrons(page, ids, asset = icons.chevron) {
  for (const id of ids) await exactIcon(page.locator(`#${id} .select-toggle img`), asset, id);
}

async function multiSelectCycle(page, id, resultsId) {
  await page.locator(`#${id}-input`).click();
  await page.locator(`#${id}-list [data-option]:not([data-option=""])`).first().click();
  await page.keyboard.press('Escape');
  if (resultsId) await ready(page, resultsId);
  const toggle = page.locator(`#${id} .select-toggle`);
  assert.equal(await toggle.getAttribute('aria-label').then(label => label.startsWith('Очистить:')), true, `${id}: clear action is accessible`);
  await exactIcon(toggle.locator('img'), icons.clear, `${id} selected clear`);
  await toggle.click();
  if (resultsId) await ready(page, resultsId);
  assert.equal(await page.locator(`#${id}-input`).inputValue(), '', `${id}: clear removes the selection`);
  assert.ok(await page.locator(`#${id}-input`).evaluate(input => input === document.activeElement), `${id}: clear returns focus to input`);
  await exactIcon(toggle.locator('img'), id.startsWith('tf-') ? icons.formChevron : icons.chevron, `${id} restored chevron`);
}

async function searchClear(page, inputId, clearId, resultsId) {
  await page.locator(`#${inputId}`).fill('field-control-qa-empty-result');
  await page.locator(`#${clearId}`).waitFor({state: 'visible'});
  await ready(page, resultsId);
  await exactIcon(page.locator(`#${clearId} img`), icons.clear, clearId);
  await page.locator(`#${clearId}`).click();
  await page.locator(`#${clearId}`).waitFor({state: 'hidden'});
  await ready(page, resultsId);
  assert.equal(await page.locator(`#${inputId}`).inputValue(), '', `${inputId}: cleared`);
}

async function responsiveDate(page, dateSelector, inputSelector, registry = false) {
  for (const width of [1920, 390]) {
    await page.setViewportSize({width, height: 1080});
    if (registry && width < 768 && await page.locator('#mobile-filters-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#mobile-filters-toggle').click();
    await alignedDate(page, dateSelector, inputSelector, `${dateSelector} at ${width}px`);
    if ((await page.locator(dateSelector).textContent()).includes('→')) {
      await page.locator(registry ? '#filter-grid' : '.tasks-fields').screenshot({path: path.join(output, `${registry ? 'registry' : 'tasks'}-filled-range-${width}.png`)});
    }
  }
  await page.setViewportSize({width: 1920, height: 1080});
}

async function registry(page) {
  await chevrons(page, ['status-select', 'block-select', 'division-select', 'process-select', 'owner-select', 'size-select']);
  await typography(page.locator('#owner-select-input'), 13, 18, 'Registry select');
  await typography(page.locator('#date-summary'), 13, 18, 'Registry date');
  await geometry(page.locator('#sort-select .select-toggle img'), 24, 'Registry sort');
  await geometry(page.locator('#date-filter > img'), 24, 'Registry calendar');
  await responsiveDate(page, '#date-summary', '#owner-select-input', true);
  await multiSelectCycle(page, 'status-select', 'results');
  await searchClear(page, 'registry-search', 'clear-search', 'results');
  report('registry date baseline, filter/page-size chevrons, selected clear, search clear, preserved sort/calendar');
}

async function processDrawer(page) {
  await page.locator('#processes-tab').click();await ready(page);
  await page.locator('#results [data-detail]').first().click();
  await page.waitForFunction(() => document.querySelector('#process-drawer')?.open && !document.querySelector('#process-drawer').classList.contains('pd-is-loading'));
  await geometry(page.locator('.pd-close'), 40, 'Process drawer close target');
  await geometry(page.locator('.pd-close img'), 24, 'Process drawer close icon');
  await page.locator('[data-pd-anchor="insights"]').click();
  await chevrons(page, ['pd-insights-source']);
  await page.locator('#pd-insights-source-input').click();
  await page.locator('#pd-insights-source-list [data-option]:not([data-option=""])').first().click();
  await chevrons(page, ['pd-insights-source']);
  await page.locator('.pd-close').click();
  await page.locator('#process-drawer[open]').waitFor({state: 'hidden'});
  report('process drawer shared single-select chevron and unchanged close geometry');
}

async function structure(page) {
  await page.locator('#structure-toggle').click();await ready(page, 'structure-list');
  await chevrons(page, ['structure-block', 'structure-division', 'structure-owner']);
  await geometry(page.locator('#structure-sort .select-toggle img'), 24, 'Structure sort');
  await multiSelectCycle(page, 'structure-block', 'structure-list');
  await searchClear(page, 'structure-search', 'structure-clear-search', 'structure-list');
  await page.locator('#structure-paths-tab').click();await ready(page, 'structure-list');
  const sample = await page.evaluate(() => {
    for (const root of window.BPM_STRUCTURE_PATHS.roots) for (const division of root.children) for (const product of division.children) {
      const row = product.records.find(record => record.linkedProcesses.length === 92);
      if (row) return {chain: [root.id, division.id, product.id], id: row.id};
    }
  });
  assert.ok(sample, 'Real source has a paginated linked-process list');
  for (const id of sample.chain) await page.locator(`[data-expand="${id}"]`).click();
  const toggle = page.locator(`[id="panel-${sample.chain[2]}"] [data-structure-path="${sample.id}"]`);
  await toggle.click();
  const panel = page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`);
  const pager = panel.locator('.structure-pagination');
  await pager.scrollIntoViewIfNeeded();
  await exactIcon(pager.locator('.select-toggle img'), icons.paginationChevron, 'Structure pagination chevron');
  await typography(pager.locator('.select-input'), 17, 24, 'Structure pagination value');
  await pager.locator('.select-input').click();
  const list = page.locator(`[id="${await pager.locator('.select-input').getAttribute('aria-controls')}"]`);
  await list.locator('[data-option="100"]').click();
  await exactIcon(pager.locator('.select-toggle img'), icons.paginationChevron, 'Structure pagination chosen chevron');
  report('structure multi-select/search clear and real pagination retain exact 16px source icons');
}

async function tasks(page) {
  await page.locator('#tasks-nav').click();await ready(page, 'tasks-results');
  await chevrons(page, ['tasks-block', 'tasks-division', 'tasks-status', 'tasks-type', 'tasks-initiator', 'tasks-assignees']);
  await exactIcon(page.locator('#tasks-size .select-toggle img'), icons.chevron, 'Tasks page size', true);
  await typography(page.locator('#tasks-assignees-input'), 13, 18, 'Task registry select');
  await typography(page.locator('#tasks-date-summary'), 13, 18, 'Task registry date');
  await geometry(page.locator('#tasks-date > img'), 24, 'Task registry calendar');
  await responsiveDate(page, '#tasks-date-summary', '#tasks-assignees-input');
  await multiSelectCycle(page, 'tasks-status', 'tasks-results');
  await searchClear(page, 'tasks-search', 'tasks-clear-search', 'tasks-results');
  await page.locator('#tasks-cards').click();await ready(page, 'tasks-results');
  await geometry(page.locator('#tasks-sort .select-toggle img'), 24, 'Task registry sort');
  await page.locator('#tasks-date').click();
  await page.locator('.bpm-calendar [data-days="7"]').click();await ready(page, 'tasks-results');
  assert.match(await page.locator('#tasks-date-summary').textContent(), /→/, 'Task range is populated');
  await responsiveDate(page, '#tasks-date-summary', '#tasks-assignees-input');
  await page.locator('#tasks-reset').click();await ready(page, 'tasks-results');
  report('task filters/search clear, empty and filled date baseline, and preserved sort/calendar');
}

async function taskForm(page) {
  const stored = await page.evaluate(() => JSON.stringify(window.BpmTaskStore.list()));
  await page.locator('#tasks-create').click();
  await geometry(page.locator('#task-drawer .task-drawer-close'), 40, 'Type chooser close target');
  await geometry(page.locator('#task-drawer .task-drawer-close img'), 24, 'Type chooser close icon');
  await page.locator('[data-task-type="standard"]').click();
  await page.locator('#task-flow[open][data-mode="create"]').waitFor();
  await chevrons(page, ['tf-insight', 'tf-process', 'tf-variant', 'tf-assignees'], icons.formChevron);
  for (const id of ['tf-title', 'tf-deadline', 'tf-process-input', 'tf-assignees-input']) await typography(page.locator(`#${id}`), 17, 24, id);
  await geometry(page.locator('#task-flow .tf-header .task-drawer-close'), 40, 'Task form close target');
  await geometry(page.locator('#task-flow .tf-header .task-drawer-close img'), 24, 'Task form close icon');
  await geometry(page.locator('[data-tf-action="calendar"] img'), 24, 'Task form calendar');
  await multiSelectCycle(page, 'tf-assignees');
  await page.setViewportSize({width: 390, height: 1080});await paint(page);
  await chevrons(page, ['tf-insight', 'tf-process', 'tf-variant', 'tf-assignees'], icons.formChevron);
  await geometry(page.locator('[data-tf-action="calendar"] img'), 24, 'Mobile task form calendar');
  await page.locator('#task-flow .tf-header [data-tf-action="close"]').click();
  await page.locator('#task-flow[open]').waitFor({state: 'hidden'});
  assert.equal(await page.evaluate(() => JSON.stringify(window.BpmTaskStore.list())), stored, 'Inspection and unsaved draft do not create or edit tasks');
  await page.setViewportSize({width: 1920, height: 1080});
  report('task form overrides, 17/24 typography, selected clear, and unchanged calendar/close geometry');
}

async function main() {
  for (const [key, asset] of Object.entries(icons)) assert.ok(asset && fs.existsSync(path.resolve(__dirname, asset)), `Configure exported asset path for ${key}`);
  let url = pathToFileURL(path.join(__dirname, 'index.html')).href;
  if (standalone) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-field-controls-offline-'));
    const target = path.join(directory, 'renamed-field-prototype.html');
    fs.copyFileSync(path.resolve(standalone), target);
    url = pathToFileURL(target).href;
  }
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  const context = await browser.newContext({offline: true, viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
  const page = await context.newPage(), errors = [], failures = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failures.push(request.failure()?.errorText));
  page.setDefaultTimeout(15000);
  try {
    await page.goto(`${url}#main`);await ready(page);
    await registry(page);await processDrawer(page);await structure(page);await tasks(page);await taskForm(page);
    await page.locator('#cabinet-nav').click();
    await page.locator('#cabinet-search-history').waitFor({state: 'visible'});
    await geometry(page.locator('#cabinet-search-history img'), 24, 'Cabinet history icon');
    assert.deepEqual(errors, [], 'No browser script errors');
    assert.deepEqual(failures, [], 'No failed resources');
    report(`${standalone ? 'relocated standalone' : 'file:// source'}: all field controls passed; cabinet history remains 24px`);
    console.log(`Screenshots: ${output}`);
  } finally {await context.close();await browser.close();}
}

main().catch(error => {console.error(error);process.exitCode = 1;});

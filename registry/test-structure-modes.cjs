/* Regression coverage for structure entities and chart presentations.
 * Run with the bundled Node runtime, or set BPM_PLAYWRIGHT to Playwright's module path.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
const number = text => Number(text.replace(/\s/g, ''));
const close = (actual, expected, message, tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const report = label => console.log(`PASS — ${label}`);

async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#structure-list').getAttribute('aria-busy') === 'false');
}

async function reload(page, action) {
  await action();
  await page.waitForFunction(() => document.querySelector('#structure-list').getAttribute('aria-busy') === 'true');
  await ready(page);
}

async function entity(page, name) {
  const tab = page.locator(`#structure-${name}-tab`);
  if (await tab.getAttribute('aria-pressed') !== 'true') await reload(page, () => tab.click());
  assert.equal(await page.locator('#structure-toggle').getAttribute('aria-pressed'), 'true', 'Entity switching retains structure mode');
  assert.equal(await tab.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator(`#structure-${name === 'paths' ? 'processes' : 'paths'}-tab`).getAttribute('aria-pressed'), 'false');
}

async function chartType(page, type, keyboard = false) {
  const toggle = page.locator('#structure-chart-toggle');
  assert.equal(await toggle.getAttribute('role'), 'switch');
  if (await toggle.isChecked() !== (type === 1)) {
    if (keyboard) { await toggle.focus(); await page.keyboard.press('Space'); }
    else await toggle.setChecked(type === 1);
  }
  assert.equal(await toggle.isChecked(), type === 1);
  for (const [id, text] of [
    ['structure-quantity-label', 'Соотношение\nэффективности'],
    ['structure-comparison-label', 'Сравнение\nс лидером']
  ]) {
    const label = await page.locator(`#${id}`).evaluate(element => {
      const style = getComputedStyle(element);
      return {
        text: element.innerText.replace(/[\t ]+/g, ' ').trim(),
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        textTransform: style.textTransform,
        letterSpacing: style.letterSpacing === 'normal' ? '0px' : style.letterSpacing
      };
    });
    assert.equal(label.text, text.toUpperCase(), `${id} retains the two-line label`);
    assert.deepEqual({
      fontSize: label.fontSize, lineHeight: label.lineHeight, fontWeight: label.fontWeight,
      textTransform: label.textTransform, letterSpacing: label.letterSpacing
    }, {
      fontSize: '9px', lineHeight: '12px', fontWeight: '510', textTransform: 'uppercase', letterSpacing: '0px'
    }, `${id} retains the Figma typography at ${page.viewportSize().width}px`);
  }
  const geometry = await page.locator('.structure-chart-control').evaluate(control => {
    const box = control.getBoundingClientRect(), style = getComputedStyle(control);
    const filters = control.closest('.structure-filters'), filterBox = filters.getBoundingClientRect();
    const sortBox = filters.querySelector('#structure-sort').getBoundingClientRect();
    const registry = control.closest('.registry-panel'), registryStyle = getComputedStyle(registry);
    const measure = selector => {
      const child = control.querySelector(selector).getBoundingClientRect();
      return {width: child.width, height: child.height, left: child.left - box.left, top: child.top - box.top};
    };
    return {
      width: box.width, height: box.height,
      left: box.left, top: box.top,
      registryWidth: registry.clientWidth - parseFloat(registryStyle.paddingLeft) - parseFloat(registryStyle.paddingRight),
      filters: {width: filterBox.width, left: filterBox.left, gap: parseFloat(getComputedStyle(filters).columnGap)},
      sort: {width: sortBox.width, height: sortBox.height, left: sortBox.left, top: sortBox.top},
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
      gap: style.columnGap,
      quantity: measure('#structure-quantity-label'),
      track: measure('.structure-switch-track'),
      comparison: measure('#structure-comparison-label'),
      knob: measure('.structure-switch-knob')
    };
  });
  const viewport = `${page.viewportSize().width}px`;
  const stacked = geometry.registryWidth <= 520, sharedRow = geometry.registryWidth <= 1300;
  const expectedWidth = stacked ? geometry.filters.width : sharedRow ? (geometry.filters.width - geometry.filters.gap) / 2 : 255;
  close(geometry.width, expectedWidth, `Responsive chart control width at ${viewport}`, 0.1);
  close(geometry.sort.width, sharedRow ? expectedWidth : 188, `Responsive sorting width at ${viewport}`, 0.1);
  close(geometry.sort.height, 50, `Sorting field height at ${viewport}`, 0.1);
  if (sharedRow) {
    close(geometry.left, geometry.filters.left, `Chart control starts at the filter row edge at ${viewport}`, 0.1);
    close(geometry.sort.left, stacked ? geometry.left : geometry.left + geometry.width + geometry.filters.gap, `Sorting horizontal placement at ${viewport}`, 0.1);
    close(geometry.sort.top, stacked ? geometry.top + geometry.height + geometry.filters.gap : geometry.top, `Sorting vertical placement at ${viewport}`, 0.1);
  }
  close(geometry.height, 50, `Figma chart control height at ${viewport}`, 0.1);
  assert.deepEqual(geometry.padding, ['13px', '16px', '13px', '16px'], `Figma chart control padding at ${viewport}`);
  assert.equal(geometry.gap, '16px', `Figma chart control gap at ${viewport}`);
  const contentLeft = (expectedWidth - 223) / 2;
  for (const [part, expected] of Object.entries({
    quantity: {width: 86, height: 24, left: contentLeft, top: 13},
    track: {width: 48, height: 24, left: contentLeft + 102, top: 13},
    comparison: {width: 57, height: 24, left: contentLeft + 166, top: 13},
    knob: {width: 20, height: 20}
  })) {
    for (const [dimension, value] of Object.entries(expected)) {
      close(geometry[part][dimension], value, `Figma ${part} ${dimension} at ${viewport}`, 0.1);
    }
  }
  assert.ok(await page.locator(type === 2 ? '#structure-quantity-label' : '#structure-comparison-label').evaluate(label => label.classList.contains('is-active')), 'Visible chart label follows the chosen presentation');
  await page.waitForFunction(color => getComputedStyle(document.querySelector('.structure-switch-track')).backgroundColor === color, type === 2 ? 'rgb(0, 136, 255)' : 'rgb(52, 199, 89)');
  await page.waitForFunction(expected => [...document.querySelectorAll('.structure-chart')].every(chart => chart.dataset.chartType === String(expected)), type);
}

async function finalCounters(page, scope = '.structure-chart') {
  const charts = page.locator(scope);
  assert.ok(await charts.count() > 0, 'At least one chart is rendered');
  for (let index = 0; index < await charts.count(); index++) {
    const chart = charts.nth(index);
    if (!await chart.isVisible()) continue;
    await chart.scrollIntoViewIfNeeded();
    await page.waitForFunction(element => [...element.querySelectorAll('[data-structure-number]')].every(counter => Number(counter.textContent.replace(/\s/g, '')) === Number(counter.dataset.structureNumber)), await chart.elementHandle());
  }
}

async function counters(page, paths = 198, processes = 913) {
  assert.equal(number(await page.locator('#structure-path-count').innerText()), paths, 'Client-path counter');
  assert.equal(number(await page.locator('#structure-process-count').innerText()), processes, 'Process counter');
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth}));
  assert.ok(dimensions.document <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, `${label}: ${JSON.stringify(dimensions)}`);
}

async function expand(page, ids) {
  for (const id of ids) {
    const heading = page.locator(`[data-expand="${id}"]`);
    if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
  }
}

async function productFixture(page, modelName, multipleRows = false) {
  return page.evaluate(({modelName, multipleRows}) => {
    const model = window[modelName], candidates = [];
    for (const root of model.roots) for (const division of root.children) for (const product of division.children) {
      const owners = new Map();
      product.records.forEach(row => (row.owners || [row.owner]).forEach(owner => owners.set(owner, (owners.get(owner) || 0) + 1)));
      const selected = [...owners].sort((a, b) => b[1] - a[1])[0];
      if (product.total && (!multipleRows || selected?.[1] > 5)) candidates.push({
        chain: [root.id, division.id, product.id], id: product.id, name: product.name,
        owner: selected?.[0], count: selected?.[1] || 0
      });
    }
    return candidates.sort((a, b) => b.count - a.count)[0];
  }, {modelName, multipleRows});
}

async function linkedPathFixture(page) {
  return page.evaluate(() => {
    for (const root of window.BPM_STRUCTURE_PATHS.roots) for (const division of root.children) for (const product of division.children) {
      // Keep the chosen journey visible while every parent column is sorted.
      if (product.total > 50) continue;
      const row = [...product.records].sort((a, b) => a.number - b.number).slice(0, 50).find(record => record.linkedProcessIds.length > 5 && record.linkedProcessIds.length <= 50);
      if (row) return {chain: [root.id, division.id, product.id], id: product.id, pathId: row.id};
    }
    return null;
  });
}

async function linkedTableStyles(panel) {
  return panel.evaluate(element => ({
    container: getComputedStyle(element.parentElement).backgroundColor,
    rows: [...element.querySelectorAll('.structure-incoming-table > tbody > tr[data-record-entity="processes"]')].map(row => ({
      backgrounds: [...row.children].map(cell => getComputedStyle(cell).backgroundColor),
      titleColor: getComputedStyle(row.querySelector('.structure-incoming-title')).color,
      copyBackground: getComputedStyle(row.querySelector('[data-structure-copy]')).backgroundColor
    }))
  }));
}

async function metrics(chart) {
  return chart.evaluate(element => {
    const bars = element.querySelector('.structure-bars');
    return {
      id: element.dataset.chart,
      type: Number(element.dataset.chartType),
      label: element.getAttribute('aria-label'),
      total: Number(element.querySelector('.structure-total').dataset.structureNumber),
      width: bars.getBoundingClientRect().width,
      gap: parseFloat(getComputedStyle(bars).columnGap),
      segments: [...bars.querySelectorAll('.structure-segment')].map(segment => {
        const track = segment.querySelector('.structure-track'), fill = segment.querySelector('.structure-fill');
        const before = getComputedStyle(track, '::before');
        return {
          count: Number(segment.dataset.count),
          width: segment.getBoundingClientRect().width,
          display: getComputedStyle(segment).display,
          track: track.getBoundingClientRect().width,
          fill: fill.getBoundingClientRect().width,
          fillScale: Number(fill.dataset.fill),
          before: {content: before.content, display: before.display, opacity: before.opacity, background: before.backgroundColor},
          title: segment.getAttribute('title')
        };
      })
    };
  });
}

function normalized(metrics) {
  assert.equal(metrics.type, 2);
  close(metrics.width, 364, 'Chart 2 bars width');
  close(metrics.gap, 4, 'Chart 2 segment gap', 0.01);
  const positive = metrics.segments.filter(segment => segment.count > 0);
  assert.equal(positive.reduce((sum, segment) => sum + segment.count, 0), metrics.total);
  const available = 364 - Math.max(0, positive.length - 1) * 4;
  for (const segment of metrics.segments) {
    if (segment.count === 0) {
      assert.ok(segment.display === 'none' || segment.width === 0, 'Zero-count segments occupy no space');
      assert.equal(segment.fill, 0, 'Zero-count segments have no fill');
    } else {
      close(segment.width, available * segment.count / metrics.total, `Proportional width for ${segment.count}`, 0.1);
      close(segment.fill, segment.track, 'Chart 2 fills the segment track', 0.1);
      assert.ok(segment.title && segment.title.includes(String(segment.count)), 'Exact counts remain available in segment tooltips');
      assert.ok(segment.before.content === 'none' || segment.before.display === 'none' || segment.before.opacity === '0' || segment.before.background === 'rgba(0, 0, 0, 0)', 'Chart 2 has no translucent maximum-track background');
    }
  }
  if (positive.length) close(positive.reduce((sum, segment) => sum + segment.width, 0) + (positive.length - 1) * 4, 364, 'Positive segments and gaps fill the entire chart', 0.2);
  assert.ok(metrics.label.includes(String(metrics.total)), 'Accessible chart label includes the total');
}

async function initialChartType(page) {
  // Do not call chartType() here: its setter could conceal a wrong initial mode.
  assert.equal(await page.locator('#structure-chart-toggle').isChecked(), false, 'The initial switch selects efficiency ratio rather than comparison with the leader');
  assert.equal(await page.locator('#structure-quantity-label').evaluate(label => label.classList.contains('is-active')), true, 'Efficiency ratio is the initially active label');
  assert.equal(await page.locator('#structure-comparison-label').evaluate(label => label.classList.contains('is-active')), false, 'Comparison with the leader is initially inactive');
  assert.equal(await page.locator('.structure-switch-track').evaluate(track => getComputedStyle(track).backgroundColor), 'rgb(0, 136, 255)', 'The default efficiency-ratio track is blue');
  const charts = page.locator('#structure-list > .structure-node > .structure-heading .structure-chart');
  assert.ok(await charts.count() > 0, 'Default-mode charts render without changing the switch');
  assert.deepEqual(await charts.evaluateAll(elements => [...new Set(elements.map(chart => chart.dataset.chartType))]), ['2'], 'All initial charts use Structure Chart 2');
  await finalCounters(page, '#structure-list > .structure-node > .structure-heading .structure-chart');
  for (let index = 0; index < await charts.count(); index++) normalized(await metrics(charts.nth(index)));
}

async function csvDownload(page, scope = 'filtered') {
  await page.locator('#export').click();
  await page.locator(`#export-form input[value="${scope}"]`).check();
  const waiting = page.waitForEvent('download');
  await page.locator('#export-form button[type="submit"]').click();
  const download = await waiting;
  assert.equal(await download.failure(), null);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function parseCsv(csv) {
  const rows = [], row = [];
  let value = '', quoted = false;
  for (let index = csv.charCodeAt(0) === 0xfeff ? 1 : 0; index < csv.length; index++) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (character === ';' && !quoted) { row.push(value); value = ''; }
    else if ((character === '\r' || character === '\n') && !quoted) {
      if (character === '\r' && csv[index + 1] === '\n') index++;
      row.push(value); rows.push(row.splice(0)); value = '';
    } else value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

async function mainFlow(browser) {
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}, acceptDownloads: true});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    await page.locator('.entity-card:not(.skeleton-card)').first().waitFor();
    assert.equal(await page.locator('#global-search').count(), 0, 'The redundant gray search button is removed from the shared header');
    await page.locator('#registry-search').fill('Нет такой сущности narrow-layout-regression');
    await page.locator('#results .empty-state').waitFor();
    assert.ok(await page.locator('#clear-search').isVisible(), 'The registry search retains its clear action');
    await page.locator('#clear-search').click();
    await page.locator('.entity-card:not(.skeleton-card)').first().waitFor();
    assert.equal(await page.locator('#registry-search').inputValue(), '', 'The ordinary registry search still filters and clears without a header shortcut');
    await page.locator('#table-view').click();
    await page.locator('.registry-table [data-record]').first().waitFor();
    const regularEntity = await page.locator('#paths-tab[aria-pressed="true"], #processes-tab[aria-pressed="true"]').getAttribute('id');
    const started = Date.now();
    await page.locator('#structure-toggle').click();
    assert.equal(await page.locator('.view-switch').isVisible(), false, 'Cards/table switch is hidden in structure mode');
    assert.equal(await page.locator('#structure-list').getAttribute('aria-busy'), 'true');
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#structure-list').getAttribute('aria-busy'), 'true', 'Structure retains the loading skeleton before two seconds');
    await ready(page);
    assert.ok(Date.now() - started >= 1800, 'Entry includes the requested two-second loading phase');
    assert.equal(await page.locator('.structure-heading[aria-expanded="true"]').count(), 0);
    assert.equal(await page.locator('#structure-processes-tab').getAttribute('aria-pressed'), 'true');
    await counters(page);
    await initialChartType(page);
    report('default efficiency-ratio selection, blue switch, and proportional Chart 2 before any mode changes');
    const tabsPosition = await page.evaluate(() => {
      const tabs = document.querySelector('#structure-entity-tabs');
      const box = tabs.getBoundingClientRect(), toggle = document.querySelector('#structure-toggle').getBoundingClientRect();
      return {insideToolbar: Boolean(tabs.closest('#structure-toolbar')), top: box.top, toggleTop: toggle.top};
    });
    assert.ok(tabsPosition.insideToolbar, 'Entity tabs belong to the main structure toolbar');
    close(tabsPosition.top, tabsPosition.toggleTop, 'Entity tabs share the first toolbar row');
    await chartType(page, 1);
    await finalCounters(page, '#structure-list > .structure-node > .structure-heading .structure-chart');
    const maxima = await page.evaluate(() => window.BPM_STRUCTURE.maxima);
    const initial = await metrics(page.locator('.structure-chart').first());
    assert.equal(initial.segments.length, 5, 'Chart 1 keeps all five maximum tracks');
    initial.segments.forEach((segment, index) => {
      assert.ok(Number.isFinite(segment.count));
      close(segment.fill, segment.track * (maxima[index] ? segment.count / maxima[index] : 0), 'Chart 1 fill follows the fixed maximum scale', 0.3);
    });
    report('two-second entry, process default, both entity counters, fixed maximum scale');

    await entity(page, 'paths');
    await counters(page);
    assert.equal(await page.locator('.structure-heading[aria-expanded="true"]').count(), 0, 'Paths start collapsed');
    const paths = await linkedPathFixture(page);
    assert.ok(paths, 'A client path with more than five linked processes is available on the first page');
    await expand(page, paths.chain);
    const product = page.locator(`[data-node="${paths.id}"]`);
    const firstRow = product.locator(`tr[data-structure-record="${paths.pathId}"]`).first();
    const pathId = await firstRow.getAttribute('data-structure-record');
    assert.match(pathId, /^structure-kp-/);
    const sourcePath = await page.evaluate(id => {
      const row = window.BPM_STRUCTURE_PATHS.records.find(record => record.id === id);
      return {title: row.title, number: row.number, count: row.linkedProcessIds.length,
        linkedIds: [...row.linkedProcesses].sort((a, b) => a.number - b.number).map(record => record.id),
        linkedRows: row.linkedProcesses.map(({id, number, owner, efficiency}) => ({id, number, owner, efficiency}))};
    }, pathId);
    assert.equal(await firstRow.locator('.structure-row-title').innerText(), sourcePath.title, 'Path name comes from the path model');
    assert.match(await firstRow.locator('.id-badge').innerText(), /КП/);
    assert.ok(sourcePath.count > 5, 'Fixture explicitly exercises a formerly paginated linked-process list');
    const drillButton = firstRow.locator('[data-structure-path]');
    const drillPanelId = await drillButton.getAttribute('aria-controls');
    await drillButton.click();
    assert.equal(await drillButton.getAttribute('aria-expanded'), 'true');
    const drillPanel = page.locator(`[id="${drillPanelId}"]`);
    assert.ok(await drillPanel.isVisible());
    assert.equal(await drillPanel.locator('.structure-incoming-table').count(), 1, 'Linked processes use the incoming insertion');
    assert.equal(await drillPanel.locator('tr[data-record-entity="processes"]').count(), sourcePath.count, 'All linked processes render together');
    assert.equal(await drillPanel.locator('.structure-incoming-table tbody > tr > td').count(), sourcePath.count * 3, 'Incoming rows retain their three-column design');
    assert.equal(await drillPanel.locator('[data-structure-sort], [data-structure-menu], [data-structure-close]').count(), 0, 'Incoming insertion has no duplicate sorting, context-menu or close controls');
    assert.equal(await drillPanel.locator('.structure-table-footer, .structure-pagination, [data-structure-page]').count(), 0, 'Linked-process lists with at most 50 records have no pagination controls');
    assert.deepEqual(await drillPanel.locator('tr[data-structure-record]').evaluateAll(rows => rows.map(row => row.dataset.structureRecord)), sourcePath.linkedIds, 'All actual source links render in initial ID order');

    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    const idleStyles = await linkedTableStyles(drillPanel);
    assert.equal(idleStyles.rows.length, sourcePath.count, 'Hover checks inspect every actual incoming row');
    await drillPanel.locator('.structure-incoming').hover({position: {x: 8, y: 8}});
    await page.waitForTimeout(200);
    assert.deepEqual(await linkedTableStyles(drillPanel), idleStyles, 'Hovering the non-interactive insertion gutter does not highlight rows or actions');
    await drillPanel.locator('tr[data-record-entity="processes"] .structure-incoming-title').first().hover();
    await page.waitForTimeout(200);
    const rowHoverStyles = await linkedTableStyles(drillPanel);
    assert.equal(rowHoverStyles.container, idleStyles.container, 'A nested row does not activate a hover background on its enclosing container');
    assert.deepEqual(rowHoverStyles.rows.slice(1), idleStyles.rows.slice(1), 'Hovering one linked row leaves every sibling row and action unchanged');
    assert.deepEqual(rowHoverStyles.rows[0].backgrounds, idleStyles.rows[0].backgrounds, 'Title hover preserves the incoming row background');
    assert.notEqual(rowHoverStyles.rows[0].titleColor, idleStyles.rows[0].titleColor, 'The individual title retains its interactive hover');
    assert.equal(rowHoverStyles.rows[0].titleColor, 'rgb(0, 136, 255)', 'Hovered incoming title uses the shared blue');
    assert.equal(rowHoverStyles.rows[0].copyBackground, idleStyles.rows[0].copyBackground, 'Title hover does not activate the copy action');

    const parentSort = async (key, direction) => {
      const button = product.locator(`[data-structure-sort="${paths.id}"][data-column="${key}"]`);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (await button.getAttribute('data-active') === 'true' && await button.locator('..').getAttribute('aria-sort') === direction) break;
        await button.click();
      }
      assert.equal(await button.getAttribute('data-active'), 'true', `Parent ${key} is the selected sort`);
      assert.equal(await button.locator('..').getAttribute('aria-sort'), direction);
      assert.equal(await drillButton.getAttribute('aria-expanded'), 'true', 'Parent sorting retains the path expansion');
    };
    const expectedLinkedIds = (key, direction) => [...sourcePath.linkedRows].sort((a, b) => {
      const value = key === 'owner' ? String(a.owner || '').localeCompare(String(b.owner || ''), 'ru')
        : key === 'efficiency' ? (a.efficiency ?? -1) - (b.efficiency ?? -1) : a.number - b.number;
      return (direction === 'descending' ? -value : value) || a.number - b.number;
    }).map(row => row.id);
    for (const key of ['owner', 'efficiency']) {
      for (const direction of ['ascending', 'descending']) {
        await parentSort(key, direction);
        assert.deepEqual(await drillPanel.locator('tr[data-structure-record]').evaluateAll(rows => rows.map(row => row.dataset.structureRecord)), expectedLinkedIds(key, direction), `All linked rows follow parent ${key} ${direction}`);
      }
    }
    assert.equal(await product.locator('[data-structure-sort][data-column="status"], [data-structure-sort][data-column="tags"]').count(), 0, 'Removed status/date and marks columns have no hidden sorting controls');
    await parentSort('id', 'descending');
    const linkedIds = await drillPanel.locator('tr[data-structure-record]').evaluateAll(rows => rows.map(row => row.dataset.structureRecord));
    assert.deepEqual(linkedIds, [...sourcePath.linkedIds].reverse(), 'Parent ID sorting applies to the complete linked-process list, including records beyond the old five-row limit');
    assert.equal(await product.locator('.structure-table > thead > tr > th[aria-sort="descending"]').count(), 1, 'Parent remains the single visible sort control');
    assert.equal(await drillPanel.locator('th[aria-sort], [data-structure-sort]').count(), 0, 'Incoming table adds no independent sort state');
    assert.equal(await drillPanel.locator('.structure-table-footer, .structure-pagination, [data-structure-page]').count(), 0, 'Sorting does not restore small linked-list pagination');
    await drillPanel.evaluate(panel => { window.__structureModeTestLinkedTable = panel.querySelector('.structure-incoming-table'); });
    await chartType(page, 2);
    assert.equal(await drillButton.getAttribute('aria-expanded'), 'true', 'Chart switch retains the linked-process expansion');
    assert.ok(await drillPanel.evaluate(panel => panel.querySelector('.structure-incoming-table') === window.__structureModeTestLinkedTable), 'Chart switch preserves the incoming table DOM');
    assert.deepEqual(await drillPanel.locator('tr[data-structure-record]').evaluateAll(rows => rows.map(row => row.dataset.structureRecord)), linkedIds);
    const pageCsv = parseCsv(await csvDownload(page, 'page'));
    assert.ok(pageCsv.length > 1);
    assert.ok(pageCsv.slice(1).every(row => row[0] === 'Клиентский путь'), 'Expanded-tables export includes the selected entity only');
    await chartType(page, 1);
    await firstRow.locator('[data-structure-detail]').first().click();
    await page.locator('#detail-dialog[open], #process-drawer[open]').waitFor();
    if (await page.locator('#process-drawer[open]').count()) {
      await page.waitForFunction(() => {
        const drawer = document.querySelector('#process-drawer');
        const main = drawer?.querySelector('.pd-main');
        return drawer?.open && !drawer.classList.contains('pd-is-loading') && main?.getAttribute('aria-busy') !== 'true' && !main?.inert;
      });
    }
    const dialogText = await page.locator('#detail-dialog[open], #process-drawer[open]').innerText();
    assert.ok(dialogText.includes(sourcePath.title), 'Detail opens the selected path');
    await page.keyboard.press('Escape');
    await page.locator('#detail-dialog[open], #process-drawer[open]').waitFor({state: 'hidden'});
    await firstRow.locator('[data-structure-menu]').click();
    await page.locator('.action-menu [data-favorite]').click();
    assert.equal(await page.locator(`[data-structure-record="${pathId}"]`).first().locator('.favorite-heart').count(), 1);
    await reload(page, () => page.locator('#favorites').click());
    assert.equal(number(await page.locator('#structure-path-count').innerText()), 1, 'Favorite paths filter uses path IDs');
    const favoriteCsv = parseCsv(await csvDownload(page));
    assert.equal(favoriteCsv.length, 2, 'Filtered export contains only the favorite path');
    assert.equal(favoriteCsv[1][0], 'Клиентский путь');
    assert.equal(favoriteCsv[1][2], sourcePath.title);
    await reload(page, () => page.locator('#favorites').click());
    const pathCsv = parseCsv(await csvDownload(page));
    assert.equal(pathCsv.length, 199, 'All 198 unique paths export once');
    assert.ok(pathCsv.slice(1).every(row => row[0] === 'Клиентский путь'));
    assert.equal(new Set(pathCsv.slice(1).map(row => row[2])).size, 198);
    await counters(page);
    report('path rows, linked processes and preserved expansion, matching detail, favorites and CSV export');

    await entity(page, 'processes');
    assert.equal(await page.locator('.structure-heading[aria-expanded="true"]').count(), 0, 'Changing entity resets expanded branches');
    const fixture = await productFixture(page, 'BPM_STRUCTURE', true);
    assert.ok(fixture, 'A filtered process table has multiple rows');
    await reload(page, () => page.locator('#structure-search').fill(fixture.name));
    await page.locator('#structure-owner-input').fill(fixture.owner);
    await reload(page, () => page.locator('#structure-owner-list [role="option"]').filter({hasText: fixture.owner}).click());
    await page.keyboard.press('Escape');
    const filteredTotal = number(await page.locator('#structure-process-count').innerText());
    assert.ok(filteredTotal > 5 && filteredTotal < 913, `Query and owner narrow the process data: ${filteredTotal}`);
    assert.ok(await page.locator('#structure-selected').isVisible());
    await expand(page, fixture.chain);
    const processProduct = page.locator(`[data-node="${fixture.id}"]`);
    await processProduct.locator('[data-structure-sort][data-column="id"]').click();
    assert.equal(await processProduct.locator('.structure-pagination').count(), 0, 'A filtered list below the 50-record threshold has no pagination');
    const snapshot = await page.evaluate(id => {
      const product = document.querySelector(`[data-node="${id}"]`);
      window.__structureModeTestTable = product.querySelector('.structure-table');
      return {
        opened: [...document.querySelectorAll('.structure-heading[aria-expanded="true"]')].map(heading => heading.dataset.expand),
        filters: document.querySelector('#structure-chips').textContent,
        rows: [...product.querySelectorAll('tr[data-structure-record]')].map(row => row.dataset.structureRecord),
        paginationCount: product.querySelectorAll('.structure-pagination').length,
        sort: product.querySelector('th[aria-sort]').getAttribute('aria-sort')
      };
    }, fixture.id);
    assert.equal(snapshot.sort, 'descending');
    for (const type of [2, 1, 2]) {
      await chartType(page, type, type === 1);
      assert.equal(await page.locator('#structure-list').getAttribute('aria-busy'), 'false', 'Chart changes do not restart the loader');
      const after = await page.evaluate(id => {
        const product = document.querySelector(`[data-node="${id}"]`);
        return {
          sameTable: product.querySelector('.structure-table') === window.__structureModeTestTable,
          opened: [...document.querySelectorAll('.structure-heading[aria-expanded="true"]')].map(heading => heading.dataset.expand),
          filters: document.querySelector('#structure-chips').textContent,
          rows: [...product.querySelectorAll('tr[data-structure-record]')].map(row => row.dataset.structureRecord),
          paginationCount: product.querySelectorAll('.structure-pagination').length,
          sort: product.querySelector('th[aria-sort]').getAttribute('aria-sort')
        };
      }, fixture.id);
      assert.ok(after.sameTable, 'Chart switch preserves the existing table DOM');
      delete after.sameTable;
      assert.deepEqual(after, snapshot, 'Chart switches preserve filters, open nodes, row sorting and pagination');
    }
    await finalCounters(page);
    normalized(await metrics(processProduct.locator(':scope > .structure-heading .structure-chart')));
    await reload(page, () => page.locator('#structure-reset').click());
    await counters(page);
    assert.equal(await page.locator('#structure-chart-toggle').isChecked(), false, 'Filter reset retains chart selection');
    report('combined query and owner filter, keyboard chart switch, unpaginated table DOM/sort and expanded-state preservation');

    await reload(page, () => page.locator('#structure-search').fill('Сбер'));
    await page.locator('#structure-processes-tab').click();
    await page.locator('#structure-paths-tab').click();
    assert.equal(await page.locator('#structure-list').getAttribute('aria-busy'), 'true');
    await chartType(page, 1);
    await page.locator('#structure-processes-tab').click();
    await chartType(page, 2, true);
    await page.locator('#structure-paths-tab').click();
    await ready(page);
    assert.equal(await page.locator('#structure-paths-tab').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#structure-search').inputValue(), 'Сбер');
    assert.equal(await page.locator('.structure-heading[aria-expanded="true"]').count(), 0);
    assert.ok(await page.locator('.structure-chart[data-chart-type="2"]').count() > 0);
    await reload(page, () => page.locator('#structure-reset').click());
    await counters(page);
    report('rapid entity and keyboard chart changes during loading settle to the final selection');

    await page.emulateMedia({reducedMotion: 'reduce'});
    for (const width of [1920, 1440, 1024, 788, 390, 320]) {
      await page.setViewportSize({width, height: 1080});
      assert.equal(await page.locator('#global-search').count(), 0, `No redundant header search at ${width}px`);
      for (const name of ['paths', 'processes']) {
        await entity(page, name);
        const fixture = await productFixture(page, name === 'paths' ? 'BPM_STRUCTURE_PATHS' : 'BPM_STRUCTURE');
        await expand(page, fixture.chain);
        for (const type of [1, 2]) {
          await chartType(page, type);
          await noOverflow(page, `${width}px ${name}, chart ${type}, expanded`);
          const heading = page.locator(`[data-expand="${fixture.id}"]`);
          await heading.scrollIntoViewIfNeeded();
          await finalCounters(page, `[data-node="${fixture.id}"] > .structure-heading .structure-chart`);
          if (type === 2) normalized(await metrics(heading.locator('.structure-chart')));
        }
      }
    }
    await page.setViewportSize({width: 1920, height: 1080});
    await page.locator('#structure-toggle').click();
    await page.locator('.registry-table [data-record]').first().waitFor();
    assert.equal(await page.locator(`#${regularEntity}`).getAttribute('aria-pressed'), 'true', 'Returning preserves the regular registry entity');
    assert.equal(await page.locator('#table-view').getAttribute('aria-pressed'), 'true', 'Returning preserves table view');
    assert.equal(await page.locator('.view-switch').isVisible(), true, 'Cards/table switch returns on leaving structure');
    assert.deepEqual(errors, [], 'No uncaught browser exceptions');
    report('1920/1440/1024/788/390/320px responsive controls and expanded layouts, no header search, reduced motion, and return to regular table');
  } finally { await context.close(); }
}

async function edgeCases(browser) {
  const context = await browser.newContext({viewport: {width: 1920, height: 1200}, reducedMotion: 'reduce'});
  await context.addInitScript(() => {
    let original;
    Object.defineProperty(window, 'BpmStructure', {
      configurable: true,
      get() { return original; },
      set(api) {
        original = {...api, create(options) {
          for (const name of ['BPM_STRUCTURE', 'BPM_STRUCTURE_PATHS']) {
            const source = window[name], entity = name.endsWith('_PATHS') ? 'paths' : 'processes';
            const records = [], nodes = [], roots = [];
            [[0, 0, 0, 0, 0], [1, 0, 0, 0, 0], [1, 999, 0, 0, 0]].forEach((counts, index) => {
              const rows = [];
              counts.forEach((count, bucket) => {
                for (let i = 0; i < count; i++) rows.push({...source.records[0], id: `fixture-${entity}-${index}-${bucket}-${i}`, entity, number: rows.length + 1, title: `Fixture record ${index}-${bucket}-${i}`, bucket});
              });
              const make = kind => ({...source.nodes.find(node => node.kind === kind), id: `fixture-${entity}-${index}-${kind}`, name: `Fixture ${index}: ${kind}`, records: rows, total: rows.length, buckets: counts.slice(), children: []});
              const root = make('block'), division = make('division'), product = make('product');
              root.children = [division]; division.children = [product];
              roots.push(root); nodes.push(root, division, product); records.push(...rows);
            });
            window[name] = {...source, roots, nodes, records, total: records.length, maxima: [1, 999, 0, 0, 0], pathCount: records.length};
          }
          return api.create(options);
        }};
      }
    });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    await page.locator('#structure-toggle').click();
    await ready(page);
    await initialChartType(page);
    for (const name of ['processes', 'paths']) {
      await entity(page, name);
      await chartType(page, 2);
      assert.equal(await page.locator('#structure-list > .structure-node').count(), 3, 'Empty hierarchy nodes are retained');
      const charts = page.locator('#structure-list > .structure-node > .structure-heading .structure-chart');
      await finalCounters(page, '#structure-list > .structure-node > .structure-heading .structure-chart');
      for (let index = 0; index < await charts.count(); index++) {
        const measured = await metrics(charts.nth(index));
        normalized(measured);
        if (measured.total === 1000) assert.ok(measured.segments.find(segment => segment.count === 1).width < 1, 'Tiny positive values preserve their proportion without minimum-width distortion');
        if (measured.total === 1) close(measured.segments.find(segment => segment.count === 1).width, 364, 'A sole positive segment fills all available width');
        if (measured.total === 0) assert.ok(measured.segments.every(segment => segment.fill === 0), 'Zero total has no colored fill');
      }
      await chartType(page, 1);
      const quantity = await metrics(charts.first());
      assert.ok(quantity.segments.every(segment => Number.isFinite(segment.fillScale) && Number.isFinite(segment.width)), 'Zero maxima never produce NaN or Infinity');
    }
    assert.deepEqual(errors, []);
    report('zero totals, absent buckets, one positive bucket and subpixel proportions for both entity models');
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try { await Promise.all([mainFlow(browser), edgeCases(browser)]); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

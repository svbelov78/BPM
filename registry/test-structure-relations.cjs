/* Reciprocal process ↔ client-path disclosure using the real Excel projection,
 * then synthetic >50 lists to exercise the shared Table/Pagination contract.
 * Run with the bundled Node runtime, optionally set BPM_PLAYWRIGHT.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
const report = message => console.log(`PASS — ${message}`);

function instrument({synthetic}) {
  window.__relationCopies = [];
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async text => {window.__relationCopies.push(text);}}});
  let original;
  Object.defineProperty(window, 'BpmStructure', {
    configurable: true,
    get() {return original;},
    set(api) {
      original = {...api, create(options) {
        if (synthetic) {
          const processModel = window.BPM_STRUCTURE, pathModel = window.BPM_STRUCTURE_PATHS;
          const processes = Array.from({length: 60}, (_, index) => ({
            ...processModel.records[0], id: `relations-process-${String(index + 1).padStart(3, '0')}`,
            number: index + 1, code: `П${index + 1}`, entity: 'processes', title: `Тестовый процесс ${index + 1}`,
            owner: 'Владелец процесса', owners: ['Владелец процесса'], type: '', tags: [], count: 0,
            efficiency: 91, bucket: 0, delta: 0, products: ['Связи более 50'], productLinks: []
          }));
          const paths = Array.from({length: 60}, (_, index) => {
            const linked = index ? [processes[0]] : processes.slice();
            return {...pathModel.records[0], id: `relations-path-${String(index + 1).padStart(3, '0')}`,
              number: index + 1, numberSimulated: true, code: `КП-ДЕМО-${String(index + 1).padStart(4, '0')}`, entity: 'paths',
              title: `Тестовый клиентский путь ${index + 1}`, owner: 'Владелец клиентского пути', owners: ['Владелец клиентского пути'],
              type: '', tags: [], efficiency: 76, bucket: 1, delta: 0, products: ['Связи более 50'], productLinks: [],
              linkedProcesses: linked, linkedProcessIds: linked.map(row => row.id), linkedProcessCodes: linked.map(row => row.code),
              processCount: linked.length, count: linked.length};
          });
          for (const [name, source, records] of [['BPM_STRUCTURE', processModel, processes], ['BPM_STRUCTURE_PATHS', pathModel, paths]]) {
            const make = kind => ({...source.nodes.find(node => node.kind === kind), id: `relations-${kind}`, kind,
              name: `Связи более 50: ${kind}`, records, total: records.length, buckets: [60, 0, 0, 0, 0], children: []});
            const root = make('block'), division = make('division'), product = make('product');
            root.children = [division]; division.children = [product];
            window[name] = {...source, roots: [root], nodes: [root, division, product], records, total: records.length,
              maxima: [60, 60, 0, 0, 0], sourceIssues: [], productCount: 1, placeholderCount: 0};
          }
        }
        window.__relationsBaseline = Object.fromEntries(['BPM_STRUCTURE_SOURCE', 'BPM_STRUCTURE', 'BPM_STRUCTURE_PATHS'].map(name => [name, JSON.stringify(window[name])]));
        return api.create(options);
      }};
    }
  });
}

async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#structure-list')?.getAttribute('aria-busy') === 'false');
}
async function entity(page, name) {
  const tab = page.locator(`#structure-${name}-tab`);
  if (await tab.getAttribute('aria-pressed') !== 'true') {await tab.click(); await ready(page);}
}
async function expandProduct(page, chain) {
  for (const id of chain) {
    const heading = page.locator(`[data-expand="${id}"]`);
    if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
  }
  const tables = await page.locator('.structure-table').evaluateAll(elements => elements.map(table => ({
    entity: table.dataset.tableEntity,
    headings: [...table.tHead.rows[0].cells].map(cell => cell.textContent.trim().replace(/\u00ad/g, '')),
    columns: table.querySelectorAll(':scope > colgroup > col').length,
    rowCells: [...table.tBodies[0].rows].filter(row => row.hasAttribute('data-structure-record')).map(row => row.cells.length),
    linkedSpans: [...table.tBodies[0].rows].filter(row => row.classList.contains('structure-linked-row')).map(row => row.cells[0].colSpan),
    removedSorts: table.querySelectorAll('[data-column="status"], [data-column="tags"]').length,
    removedContent: [...table.tBodies[0].rows].filter(row => row.hasAttribute('data-structure-record')).reduce((sum,row) => sum + row.querySelectorAll('.status, .table-tags, time').length,0)
  })));
  assert.ok(tables.length > 0, 'Expanded products expose their entity tables');
  for (const table of tables) {
    assert.deepEqual(table.headings,[table.entity === 'paths' ? 'ID, КП' : 'ID, процесс','Владелец процесса','Эффективность'],'Only the three requested registry columns remain');
    assert.equal(table.columns,3,'Colgroup has no hidden status/date or marks columns');
    assert.ok(table.rowCells.every(count => count === 3),'Every outer entity row has exactly three cells');
    assert.ok(table.linkedSpans.every(count => count === 3),'Every reciprocal disclosure spans exactly three columns');
    assert.equal(table.removedSorts,0,'Removed columns have no hidden sorting controls');
    assert.equal(table.removedContent,0,'Status/date and marks data cells are removed, not merely hidden');
  }
  return page.locator(`[id="panel-${chain.at(-1)}"]`);
}
function topRows(panel) {return panel.locator(':scope > .structure-table-scroll > .structure-table > tbody > tr[data-structure-record]');}
function childRows(panel) {return panel.locator(':scope > .structure-incoming > .structure-incoming-scroll > .structure-incoming-table > tbody > tr[data-structure-record]');}
function pager(panel) {return panel.locator(':scope > .structure-incoming > .structure-pagination');}
async function related(page, product, id, sourceEntity) {
  const row = topRows(product).filter({has: page.locator(`[data-structure-related="${id}"]`)});
  const button = row.locator('[data-structure-related]');
  assert.equal(await button.count(), 1, 'One disclosure per main entity row');
  assert.equal(await button.getAttribute(`data-structure-${sourceEntity === 'paths' ? 'path' : 'process'}`), id, 'Entity-specific hooks remain available');
  assert.equal(await button.getAttribute('aria-expanded'), 'false');
  const controls = await button.getAttribute('aria-controls');
  assert.ok(controls, 'Disclosure references its own unique panel');
  const panel = page.locator(`[id="${controls}"]`);
  assert.equal(await panel.isVisible(), false, 'Related list starts closed');
  await button.click();
  assert.equal(await button.getAttribute('aria-expanded'), 'true');
  assert.equal(await row.getAttribute('data-expanded'), 'true');
  assert.equal(await panel.isVisible(), true);
  assert.equal(await panel.locator('[data-structure-related], [data-structure-path], [data-structure-process]').count(), 0, 'Related rows are terminal, not recursive accordions');
  return {row, button, panel};
}
async function rowIds(panel) {return childRows(panel).evaluateAll(rows => rows.map(row => row.dataset.structureRecord));}
async function togglePersistence(page, disclosure) {
  const before = await rowIds(disclosure.panel);
  await disclosure.button.focus(); await page.keyboard.press('Space');
  assert.equal(await disclosure.button.getAttribute('aria-expanded'), 'false');
  assert.equal(await disclosure.row.getAttribute('data-expanded'), 'false');
  assert.equal(await disclosure.panel.isVisible(), false);
  await disclosure.button.focus(); await page.keyboard.press('Enter');
  assert.equal(await disclosure.button.getAttribute('aria-expanded'), 'true');
  assert.equal(await disclosure.panel.isVisible(), true);
  assert.deepEqual(await rowIds(disclosure.panel), before, 'Collapse/reopen retains the same related list');
}
async function detailAndCopy(page, panel, expectedEntity) {
  const row = childRows(panel).first(), id = await row.getAttribute('data-structure-record');
  const source = await page.evaluate(id => [...window.BPM_STRUCTURE.records, ...window.BPM_STRUCTURE_PATHS.records].find(record => record.id === id), id);
  assert.equal(await row.getAttribute('data-record-entity'), expectedEntity);
  await row.locator('[data-structure-copy]').click();
  const code = source.numberSimulated ? source.code : `${expectedEntity === 'paths' ? 'КП' : 'П'} ${source.number}`;
  await page.waitForFunction(code => window.__relationCopies.at(-1) === code, code);
  await row.locator('[data-structure-detail]').click();
  const drawer = page.locator('#process-drawer');
  await drawer.waitFor({state: 'visible'});
  await page.waitForFunction(() => {
    const drawer = document.querySelector('#process-drawer');
    return drawer?.open && !drawer.classList.contains('pd-is-loading') && !drawer.querySelector('.pd-main')?.inert;
  });
  assert.equal(await drawer.getAttribute('data-pd-entity'), expectedEntity, 'The shared drawer uses the related record entity');
  assert.equal(await drawer.locator('#pd-title').innerText(), source.title);
  await page.keyboard.press('Escape');
  await drawer.waitFor({state: 'hidden'});
  assert.equal(await panel.isVisible(), true, 'Drawer closure preserves the related list');
}
async function assertUnchanged(page) {
  const unchanged = await page.evaluate(() => Object.fromEntries(Object.entries(window.__relationsBaseline).map(([name, snapshot]) => [name, JSON.stringify(window[name]) === snapshot])));
  assert.deepEqual(unchanged, {BPM_STRUCTURE_SOURCE: true, BPM_STRUCTURE: true, BPM_STRUCTURE_PATHS: true}, 'Reciprocal links and demo-role overlays do not mutate source or canonical models');
}
async function participation(panel, expectedIds) {
  const actual = await childRows(panel).evaluateAll(rows => rows.map(row => ({
    id: row.dataset.structureRecord,
    labels: [...row.querySelectorAll('.structure-incoming-relationship')].map(tag => ({text: tag.textContent, title: tag.title}))
  })));
  // Caller supplies canonical numeric-ID order, independent of current UI sort.
  const order = expectedIds;
  for (const row of actual) {
    assert.deepEqual(row.labels, [{text: order.indexOf(row.id) % 4 === 3 ? 'Дополнительный' : 'Основной', title: 'Демонстрационный тип участия процесса в КП'}], `${row.id}: role is stable for this edge, not assigned from current display order`);
  }
}

async function realRelations(browser) {
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
  await context.addInitScript(instrument, {synthetic: false});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url); await page.locator('#structure-toggle').click(); await ready(page);
    const fixture = await page.evaluate(() => {
      const path = window.BPM_STRUCTURE_PATHS.records.find(row => row.code === 'КП-ДЕМО-0027');
      const productId = path.productLinks[0].id;
      let chain;
      for (const root of window.BPM_STRUCTURE.roots) for (const division of root.children) if (division.children.some(product => product.id === productId)) chain = [root.id, division.id, productId];
      const processId = 'structure-p433';
      const related = window.BPM_STRUCTURE_PATHS.records.filter(row => row.linkedProcessIds.includes(processId));
      return {chain, processId, pathId: path.id, expectedPaths: related.sort((a, b) => a.number - b.number).map(row => row.id),
        expectedProcesses: [...path.linkedProcesses].sort((a, b) => a.number - b.number).map(row => row.id),
        localPaths: related.filter(row => row.sourceLinks.some(link => link.productId === productId && link.processId === processId)).length};
    });
    assert.equal(fixture.expectedPaths.length, 6);
    assert.ok(fixture.localPaths < fixture.expectedPaths.length, 'Fixture distinguishes global relationships from accidental product-scoped filtering');
    let product = await expandProduct(page, fixture.chain);
    const reverse = await related(page, product, fixture.processId, 'processes');
    assert.match(await reverse.button.innerText(), /^6 клиентских путей/);
    assert.deepEqual(await rowIds(reverse.panel), fixture.expectedPaths, 'Process exposes all canonical KP relationships across product memberships');
    assert.equal(await pager(reverse.panel).count(), 0, 'Six related KPs have no pagination');
    assert.equal(await reverse.panel.locator('.structure-incoming-relationship').count(), 0, 'Process participation labels never appear on KP rows');
    assert.equal(await reverse.panel.locator('[data-record-entity="paths"]').count(), 6);
    await togglePersistence(page, reverse);
    await detailAndCopy(page, reverse.panel, 'paths');
    report('Process → all 6 related KPs, global membership, terminal rows, correct copy/KP drawer, keyboard disclosure and no small-list pagination');

    await entity(page, 'paths'); product = await expandProduct(page, fixture.chain);
    const forward = await related(page, product, fixture.pathId, 'paths');
    assert.match(await forward.button.innerText(), /^4 процесса/);
    assert.deepEqual(await rowIds(forward.panel), fixture.expectedProcesses);
    assert.equal(await pager(forward.panel).count(), 0);
    await participation(forward.panel, fixture.expectedProcesses);
    await togglePersistence(page, forward);
    await participation(forward.panel, fixture.expectedProcesses);
    await product.locator(':scope > .structure-table-scroll > .structure-table > thead [data-column="id"]').click();
    assert.deepEqual(await rowIds(forward.panel), fixture.expectedProcesses.slice().reverse(), 'Parent reverse sort applies to related process rows');
    await participation(forward.panel, fixture.expectedProcesses);
    await detailAndCopy(page, forward.panel, 'processes');
    await assertUnchanged(page);
    assert.deepEqual(errors, []);
    report('KP → all 4 processes, both Figma participation tags, stable role after sorting/reopening, correct process copy/drawer, unchanged Excel models');
  } finally {await context.close();}
}

async function syntheticRelations(browser) {
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
  await context.addInitScript(instrument, {synthetic: true});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url); await page.locator('#structure-toggle').click(); await ready(page);
    const chain = ['relations-block', 'relations-division', 'relations-product'];
    for (const sourceEntity of ['processes', 'paths']) {
      await entity(page, sourceEntity);
      const product = await expandProduct(page, chain);
      const target = sourceEntity === 'processes' ? 'relations-process-001' : 'relations-path-001';
      const childEntity = sourceEntity === 'processes' ? 'paths' : 'processes';
      const disclosure = await related(page, product, target, sourceEntity);
      const pagination = pager(disclosure.panel);
      assert.equal(await childRows(disclosure.panel).count(), 50);
      assert.equal(await pagination.count(), 1);
      assert.equal(await pagination.getAttribute('data-total'), '60');
      assert.equal(await pagination.locator('[role="combobox"]').inputValue(), '50');
      assert.equal(await pagination.locator('[aria-current="page"]').innerText(), '1');
      assert.equal(await disclosure.panel.locator('.structure-table-footer').count(), 0);
      const firstPage = await rowIds(disclosure.panel);
      await pagination.locator('[data-direction="next"]').click();
      assert.equal(await childRows(disclosure.panel).count(), 10);
      assert.equal(await pager(disclosure.panel).locator('[aria-current="page"]').innerText(), '2');
      const secondPage = await rowIds(disclosure.panel);
      assert.equal(new Set([...firstPage, ...secondPage]).size, 60, 'Both pages cover every related entity exactly once');
      assert.equal(await disclosure.panel.locator(`[data-record-entity="${childEntity}"]`).count(), 10);
      await togglePersistence(page, disclosure);
      assert.deepEqual(await rowIds(disclosure.panel), secondPage, 'Closing a related list retains its own page');
      const input = pager(disclosure.panel).locator('[role="combobox"]');
      await input.click();
      const popup = page.locator(`[id="${await input.getAttribute('aria-controls')}"]`);
      await popup.locator('[data-option="100"]').click(); await page.keyboard.press('Escape');
      assert.equal(await childRows(disclosure.panel).count(), 60);
      assert.equal(await pager(disclosure.panel).locator('[data-structure-page]').count(), 0, 'One page removes numbered navigation but retains the >50 page-size control');
      if (childEntity === 'processes') await participation(disclosure.panel, [...firstPage, ...secondPage]);
      else assert.equal(await disclosure.panel.locator('.structure-incoming-relationship').count(), 0);
      assert.equal(await topRows(product).count(), 50, 'Child pagination does not change the parent product pagination');
    }
    await assertUnchanged(page);
    assert.deepEqual(errors, []);
    report('Synthetic 60-related-entity lists in both directions use independent standard 50-row pagination and preserve complete links/source objects');
  } finally {await context.close();}
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {await realRelations(browser); await syntheticRelations(browser);}
  finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

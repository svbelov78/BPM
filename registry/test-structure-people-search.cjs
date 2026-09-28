/* People search regression against real workbook identities and occurrences.
 * BPM_PEOPLE_SEARCH_FILE=/path/to/standalone.html tests an isolated relocated
 * standalone copy offline. Never writes production data or browser storage.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-people-search-'));
const standalone = process.env.BPM_PEOPLE_SEARCH_FILE;
let file = path.join(__dirname, 'index.html');
if (standalone) {
  file = path.join(output, 'relocated-offline.html');
  fs.copyFileSync(path.resolve(standalone), file);
}
const url = `${pathToFileURL(file).href}#main`;
const kinds = {divisionLeader: 'Руководители подразделений', processOwner: 'Владельцы процессов', pathOwner: 'Владельцы клиентских путей'};
const report = message => console.log(`PASS — ${message}`);
const ready = page => page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
const input = page => page.locator('#structure-search');
const popup = page => page.locator('#structure-search-suggestions');
const option = (page, kind, id) => popup(page).locator(`[data-search-kind="${kind}"][data-search-id="${id}"]`);
const chip = (page, kind, id) => page.locator(`#structure-chips [data-structure-filter="${kind}"][data-value="${id}"]`);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1.5, `${label}: ${actual} vs ${expected}`);

async function search(page, query) {
  await input(page).fill(query);
  await popup(page).waitFor({state: 'visible'});
}
async function select(page, entry, query) {
  await search(page, query || entry.title);
  const row = option(page, entry.kind, entry.id);
  await row.waitFor({state: 'visible'});
  if (kinds[entry.kind]) {
    assert.equal(await popup(page).getByRole('group', {name: kinds[entry.kind], exact: true}).count(), 1);
    assert.equal(await row.locator('.structure-search-id,[data-search-copy],button,.badge,.tag,.id-badge').count(), 0, 'People suggestions have no ID, code badge or copy button');
    assert.equal((await row.innerText()).trim(), entry.title, 'People suggestion contains only the complete name');
  }
  await row.click();
  await chip(page, entry.kind, entry.id).waitFor({state: 'visible'});
  assert.equal(await input(page).inputValue(), '', 'Choosing a person clears draft query');
  await popup(page).waitFor({state: 'hidden'});
  await ready(page);
  assert.equal(await page.locator('#structure-chips [data-structure-filter="query"]').count(), 0, 'No duplicate draft-query chip');
  if (kinds[entry.kind]) assert.equal((await chip(page, entry.kind, entry.id).locator('..').locator('.chip-text').innerText()).trim(), entry.title, 'Person chip has name only, not an ID');
}
async function reset(page) {
  if (await page.locator('#structure-reset').isVisible()) await page.locator('#structure-reset').click();
  else if (await input(page).inputValue()) await page.locator('#structure-clear-search').click();
  await ready(page);
  assert.equal(await page.locator('#structure-chips [data-structure-filter]').count(), 0);
  assert.equal(await input(page).inputValue(), '');
}
async function entity(page, target) {
  const tab = page.locator(`#structure-${target}-tab`);
  if (await tab.getAttribute('aria-pressed') !== 'true') {await tab.click(); await ready(page);}
}

// Oracle uses raw owners and workbook links, never catalog.matches. Catalog.get
// merely resolves opaque chip identities to names, preserving ё/case folding.
async function assertFiltered(page, filters, target, label) {
  const result = await page.evaluate(({filters, target}) => {
    const models = {processes: window.BPM_STRUCTURE, paths: window.BPM_STRUCTURE_PATHS};
    const catalog = window.BPMStructureSearchModel.create(models);
    const fold = value => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    const names = kind => (filters[kind] || []).map(id => fold(catalog.get(kind, id)?.title));
    const leaderNames = names('divisionLeader'), processNames = names('processOwner'), pathNames = names('pathOwner');
    const owners = row => [...new Set([...(row.owners || []), row.owner].filter(Boolean).map(fold))];
    const processes = new Map(models.processes.records.map(row => [row.id, row]));
    const paths = models.paths.records;
    const parents = new Map();
    const visit = (nodes, leaders = []) => nodes.forEach(node => {
      const next = node.kind === 'division' ? [...leaders, ...owners(node)] : leaders;
      if (node.kind === 'product') parents.set(node.id, next);
      visit(node.children || [], next);
    });
    visit(models.processes.roots);
    const valid = link => link.processId && link.validProcessCode !== false;
    function matches(row, productId) {
      if (filters.product?.length && !filters.product.includes(productId)) return false;
      if (leaderNames.length && !parents.get(productId)?.some(name => leaderNames.includes(name))) return false;
      if (target === 'processes') {
        if (filters.processes?.length && !filters.processes.includes(row.id)) return false;
        if (processNames.length && !owners(row).some(name => processNames.includes(name))) return false;
        if (filters.paths?.length && !paths.some(kp => filters.paths.includes(kp.id) && kp.sourceLinks.some(link => valid(link) && link.productId === productId && link.processId === row.id))) return false;
        if (pathNames.length && !paths.some(kp => kp.sourceLinks.some(link => valid(link) && link.productId === productId && link.processId === row.id && pathNames.includes(fold(link.owner))))) return false;
      } else {
        const links = row.sourceLinks.filter(link => link.productId === productId);
        if (filters.paths?.length && !filters.paths.includes(row.id)) return false;
        if (pathNames.length && !links.some(link => pathNames.includes(fold(link.owner)))) return false;
        if (filters.processes?.length && !links.some(link => valid(link) && filters.processes.includes(link.processId))) return false;
        if (processNames.length && !links.some(link => valid(link) && owners(processes.get(link.processId) || {}).some(name => processNames.includes(name)))) return false;
      }
      return true;
    }
    const expected = {}, expectedBuckets = {};
    for (const product of models[target].nodes.filter(node => node.kind === 'product')) {
      const rows = product.records.filter(row => matches(row, product.id)).sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
      if (!rows.length) continue;
      expected[product.id] = rows.map(row => row.id);
      const buckets = [0, 0, 0, 0, 0]; rows.forEach(row => buckets[row.bucket]++); expectedBuckets[product.id] = buckets;
    }
    const actual = {};
    for (const product of document.querySelectorAll('#structure-list [data-kind="product"]')) {
      const chart = product.querySelector(':scope > .structure-heading [data-chart]');
      const buckets = [0, 0, 0, 0, 0];
      chart?.querySelectorAll('.structure-segment').forEach(segment => {buckets[Number(segment.dataset.bucket)] = Number(segment.dataset.count);});
      let open = true, ancestor = product;
      while (ancestor?.matches('.structure-node')) {open &&= ancestor.querySelector(':scope > .structure-heading')?.getAttribute('aria-expanded') === 'true'; ancestor = ancestor.parentElement?.closest('.structure-node');}
      actual[product.dataset.node] = {
        rows: [...product.querySelectorAll(':scope > .structure-children > .structure-table-scroll > .structure-table > tbody > tr[data-structure-record]')].map(row => row.dataset.structureRecord),
        total: Number(chart?.querySelector('[data-structure-number]')?.dataset.structureNumber), buckets, open
      };
    }
    return {expected, actual, expectedBuckets, count: Number(document.getElementById(`structure-${target === 'paths' ? 'path' : 'process'}-count`).textContent.replace(/\D/g, ''))};
  }, {filters, target});
  assert.ok(Object.keys(result.expected).length, `${label}: fixture has real matches`);
  assert.deepEqual(Object.keys(result.actual).sort(), Object.keys(result.expected).sort(), `${label}: exact product occurrences`);
  for (const [id, rows] of Object.entries(result.expected)) {
    assert.equal(result.actual[id].open, true, `${label}: matching ancestors automatically open`);
    assert.deepEqual(result.actual[id].rows, rows.slice(0, 50), `${label}: exact records in ${id}`);
    assert.equal(result.actual[id].total, rows.length, `${label}: graph totals count filtered records`);
    assert.deepEqual(result.actual[id].buckets, result.expectedBuckets[id], `${label}: graph distribution matches records`);
  }
  assert.equal(result.count, new Set(Object.values(result.expected).flat()).size, `${label}: tab count deduplicates matches`);
}

async function geometry(page, width, entry) {
  await page.setViewportSize({width, height: 1080});
  await search(page, entry.title);
  await option(page, entry.kind, entry.id).waitFor({state: 'visible'});
  const metrics = await popup(page).evaluate(popup => {
    const r = popup.getBoundingClientRect();
    return {x: r.x, right: r.right, width: innerWidth, scroll: document.documentElement.scrollWidth,
      avatars: [...popup.querySelectorAll('.structure-search-person-avatar')].map(avatar => {const a = avatar.getBoundingClientRect(); return {w: a.width, h: a.height, content: avatar.textContent, children: avatar.childElementCount};}),
      broken: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src)};
  });
  assert.ok(metrics.avatars.length, `${width}: person has an avatar`);
  metrics.avatars.forEach(avatar => {near(avatar.w, 32, 'Avatar width'); near(avatar.h, 32, 'Avatar height'); assert.equal(avatar.content.trim(), ''); assert.equal(avatar.children, 0, 'Blank avatar has no person icon, photo or initials');});
  assert.ok(metrics.x >= -1 && metrics.right <= width + 1, `${width}: suggestions fit viewport`);
  assert.ok(metrics.scroll <= width + 1, `${width}: no horizontal page overflow`);
  assert.deepEqual(metrics.broken, [], `${width}: assets loaded`);
  await page.screenshot({path: path.join(output, `people-search-${width}.png`)});
  await input(page).press('Escape'); await popup(page).waitFor({state: 'hidden'});
  await page.locator('#structure-clear-search').click(); await ready(page);
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const context = await browser.newContext({offline: true, viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
    const page = await context.newPage(), errors = [], failed = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('request', request => {if (/^https?:/i.test(request.url())) external.push(request.url());});
    await page.goto(url); await page.locator('#structure-toggle').click(); await ready(page);
    const baseline = await page.evaluate(() => JSON.stringify([window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS]));
    const examples = await page.evaluate(() => {
      const models = {processes: window.BPM_STRUCTURE, paths: window.BPM_STRUCTURE_PATHS};
      const catalog = window.BPMStructureSearchModel.create(models);
      const fold = value => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
      const person = (kind, name) => catalog.entries.find(entry => entry.kind === kind && fold(entry.title) === fold(name));
      const kp = models.paths.records.find(row => row.sourceLinks.some(link => link.processId && person('processOwner', models.processes.records.find(p => p.id === link.processId)?.owner)));
      if (!kp) throw new Error('Expected КП with a valid owned-process fixture');
      const link = kp.sourceLinks.find(link => link.processId && person('processOwner', models.processes.records.find(p => p.id === link.processId)?.owner));
      const product = models.processes.nodes.find(node => node.id === link.productId);
      const division = models.processes.nodes.find(node => node.kind === 'division' && node.children.some(child => child.id === product.id));
      const process = models.processes.records.find(row => row.id === link.processId);
      const owner1 = person('pathOwner', link.owner), owner2 = catalog.entries.find(entry => entry.kind === 'pathOwner' && entry.id !== owner1?.id);
      return {leader: person('divisionLeader', division.owner), processOwner: person('processOwner', process.owner), pathOwner: owner1, secondPathOwner: owner2,
        product: catalog.get('product', product.id), path: catalog.get('paths', kp.id), process: catalog.get('processes', process.id),
        accent: catalog.entries.find(entry => ['divisionLeader', 'processOwner', 'pathOwner'].includes(entry.kind) && /[её]/i.test(entry.title))};
    });
    for (const [name, entry] of Object.entries(examples)) assert.ok(entry?.id, `Fixture ${name} exists`);

    for (const kind of Object.keys(kinds)) {
      const entry = kind === 'divisionLeader' ? examples.leader : examples[kind];
      await entity(page, 'processes'); await select(page, entry);
      await assertFiltered(page, {[kind]: [entry.id]}, 'processes', `${kind} in Processes`);
      await entity(page, 'paths'); await assertFiltered(page, {[kind]: [entry.id]}, 'paths', `${kind} in Client paths`);
      await search(page, entry.title);
      assert.equal(await option(page, kind, entry.id).count(), 0, 'Already-selected person is excluded from suggestions');
      await input(page).press('Escape'); await page.locator('#structure-clear-search').click(); await ready(page);
      assert.equal(await chip(page, kind, entry.id).count(), 1, 'Exactly one selected-person chip');
      await chip(page, kind, entry.id).click(); await ready(page);
      assert.equal(await chip(page, kind, entry.id).count(), 0, 'A person chip can be removed');
      await reset(page);
    }
    report('all three people groups: names only, no IDs/copy actions; exact raw-source filtering and reciprocal links in both tabs; duplicate prevention and removal');

    await select(page, examples.pathOwner); await select(page, examples.secondPathOwner);
    const eitherOwner = {pathOwner: [examples.pathOwner.id, examples.secondPathOwner.id]};
    await assertFiltered(page, eitherOwner, 'paths', 'Two КП owners use OR');
    await entity(page, 'processes'); await assertFiltered(page, eitherOwner, 'processes', 'Two КП owners preserve workbook product occurrences');
    await reset(page);

    await select(page, examples.leader); await select(page, examples.processOwner); await select(page, examples.pathOwner);
    await select(page, examples.product);
    const combined = {divisionLeader: [examples.leader.id], processOwner: [examples.processOwner.id], pathOwner: [examples.pathOwner.id], product: [examples.product.id]};
    await assertFiltered(page, combined, 'processes', 'Product AND leader AND process owner AND КП owner');
    await entity(page, 'paths'); await assertFiltered(page, combined, 'paths', 'All role filters together in КП tab');
    await reset(page);
    report('OR within people kind, AND across roles/product, occurrence-specific КП owner selection and reset');

    const entry = examples.accent, query = entry.title.toUpperCase().replace(/Е/g, 'Ё');
    await search(page, query);
    const highlighted = option(page, entry.kind, entry.id); await highlighted.waitFor({state: 'visible'});
    assert.equal((await highlighted.innerText()).trim(), entry.title);
    assert.ok(await highlighted.locator('mark').count() >= 2, 'All full-name query words highlighted with ё/е and case folding');
    await input(page).press('Escape'); await popup(page).waitFor({state: 'hidden'});
    assert.equal(await input(page).inputValue(), query, 'Escape preserves draft');
    await input(page).press('ArrowDown');
    const activeId = await input(page).getAttribute('aria-activedescendant'); assert.ok(activeId, 'Keyboard active suggestion set');
    const active = page.locator(`[id="${activeId}"]`), selected = {kind: await active.getAttribute('data-search-kind'), id: await active.getAttribute('data-search-id')};
    assert.ok(kinds[selected.kind], 'Keyboard selection targets a person');
    await input(page).press('Enter'); await chip(page, selected.kind, selected.id).waitFor({state: 'visible'}); await ready(page);
    assert.equal(await input(page).inputValue(), ''); await reset(page);
    await search(page, 'ТакойФамилииНеСуществует123456');
    assert.equal(await popup(page).locator('[role="option"]').count(), 0, 'No stale person options for empty results');
    await page.locator('#structure-clear-search').click(); await ready(page);
    report('full-FIO multiword highlighting, ё/е and uppercase normalization, keyboard selection, Escape and empty results');

    for (const width of [1920, 390, 320]) await geometry(page, width, examples.processOwner);
    assert.equal(await page.evaluate(() => JSON.stringify([window.BPM_STRUCTURE, window.BPM_STRUCTURE_PATHS])), baseline, 'Source records and graph values unchanged');
    assert.deepEqual(errors, [], 'No runtime errors'); assert.deepEqual(failed, [], 'No failed assets'); assert.deepEqual(external, [], 'No external requests');
    report(`1920/390/320px names and blank 32px avatars fit; source immutable and no network/runtime failures; ${standalone ? 'relocated standalone' : 'source'}; screenshots: ${output}`);
    await context.close();
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

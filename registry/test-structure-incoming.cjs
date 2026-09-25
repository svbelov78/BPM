/* Structure incoming-process insertion: pure renderer contracts and an isolated
 * browser fixture using production CSS/assets, without loading or changing app.js.
 * Run with Node and BPM_PLAYWRIGHT, or use --data-only for renderer checks only.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const source = fs.readFileSync(path.join(root, 'structure-incoming.js'), 'utf8');
const report = message => console.log(`PASS — ${message}`);
const near = (actual, expected, label, tolerance = 0.6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const plain = value => JSON.parse(JSON.stringify(value));
const fixture = index => ({
  id: `incoming-process-${index}`, entity: 'processes', number: index + 1,
  code: `П${index + 1}`, title: `Процесс ${index + 1}`, type: 'Типовой',
  owner: 'Иванов Иван Иванович', owners: ['Иванов Иван Иванович'],
  ownerRole: 'Владелец процесса', efficiency: [91, 75.5, 31, null][index % 4],
  delta: 12, bucket: index % 5, tags: [], status: 'Исполняется', date: '2026-09-23'
});
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}
function ids(html) {
  return [...html.matchAll(/\bdata-structure-record="([^"]*)"/g)].map(match => match[1]);
}

function rendererContracts() {
  const calls = [];
  const context = {window: {BpmCardVisuals: {efficiency(row, table) {
    calls.push({row, snapshot: plain(row), table});
    return '<span class="fixture-efficiency"></span>';
  }}}};
  vm.runInNewContext(source, context, {filename: 'structure-incoming.js'});
  const api = context.window.BPMStructureIncoming;
  assert.equal(typeof api?.render, 'function', 'Stateless renderer API is available without a DOM');
  const records = freeze(Array.from({length: 73}, (_, index) => fixture(index)));
  const node = freeze({id: 'incoming-node', name: 'Входящие процессы', records});
  const before = JSON.stringify(node);
  let html = api.render(node);
  assert.equal((html.match(/<span class="avatar" aria-hidden="true"><\/span>/g) || []).length, records.length, 'Each incoming process keeps a decorative blank avatar');
  assert.doesNotMatch(html, /assets\/person\.svg/, 'Incoming processes do not render a person glyph');
  assert.deepEqual(ids(html), records.map(row => row.id), 'Default render retains all rows; paging belongs to its caller');
  assert.equal(calls.length, records.length, 'Every row uses the shared efficiency renderer');
  calls.forEach((call, index) => {
    assert.equal(call.table, false, 'Incoming efficiency uses Card 24, not the table pill');
    assert.equal(call.snapshot.efficiency, records[index].efficiency, 'Original efficiency including null is preserved');
    assert.equal(Number(call.snapshot.delta || 0), 0, 'Incoming values do not invent or display a trend');
    assert.notEqual(call.row, records[index], 'Suppressing trend does not write into source records');
  });
  assert.equal(JSON.stringify(node), before, 'Frozen source records and node remain unchanged');

  const ordered = freeze([records[70], records[1], records[70], records[0]]);
  const pagination = '<nav data-incoming-test-pagination="kept"><button type="button" data-structure-page="incoming-node" data-page="2">2</button></nav>';
  html = api.render(node, {rows: ordered, pagination, isFavorite: row => row.id === records[1].id});
  assert.deepEqual(ids(html), ordered.map(row => row.id), 'Explicit rows preserve caller order and repeated memberships');
  assert.equal(html.split(pagination).length - 1, 1, 'Caller pagination markup is retained exactly once');
  assert.equal((html.match(/aria-label="В избранном"/g) || []).length, 1, 'Favorite callback marks only the matching supplied row');
  const pageRows = freeze(records.slice().sort((a, b) => b.number - a.number).slice(25, 50));
  html = api.render(node, {rows: pageRows, pagination});
  assert.deepEqual(ids(html), pageRows.map(row => row.id), 'Already sorted page slice is not sorted, deduplicated or sliced again');
  assert.equal(JSON.stringify(node), before);
  assert.deepEqual(ids(api.render(node, {rows: []})), [], 'Explicit empty rows do not fall back to node.records');
  assert.deepEqual(ids(api.render({id: 'empty', records: []})), [], 'Empty node does not invent data');
  const sparse = freeze({id: 'sparse', entity: 'processes', title: 'Без дополнительных данных', efficiency: null});
  html = api.render({id: 'sparse-node', records: [sparse]});
  assert.deepEqual(ids(html), ['sparse']);
  assert.doesNotMatch(html.slice(html.indexOf('<tbody>')), /\bundefined\b|\bNaN\b|Владелец процесса|Типовой/, 'Missing metadata does not become invented values');
  assert.doesNotMatch(html, /structure-incoming-relationship/, 'A missing participation role does not become a made-up tag');
  assert.match(html, /data-table-entity="processes"/, 'The default related entity remains processes');
  assert.match(html, /data-record-entity="processes"/);
  assert.match(api.render({id: 'empty', records: []}), /Нет связанных процессов/);

  const typed = freeze([
    {...fixture(0), relationshipType: 'Основной', relationshipSimulated: true},
    {...fixture(1), type: 'Основной', relationshipType: 'Дополнительный'},
    {...fixture(2), type: 'Основной'},
    {...fixture(3), type: '', relationshipType: ''}
  ]);
  const typedNode = freeze({id: 'participation-roles', recordEntity: 'processes', records: typed});
  const typedBefore = JSON.stringify(typedNode);
  html = api.render(typedNode);
  assert.equal((html.match(/structure-incoming-relationship/g) || []).length, 3, 'Explicit relationship role and legacy type render without filling missing values');
  assert.equal((html.match(/structure-incoming-relationship is-primary/g) || []).length, 2, 'Only primary role uses the primary appearance');
  assert.equal((html.match(/>Дополнительный<\/span>/g) || []).length, 1, 'A relationship-specific role takes precedence over the record type');
  assert.equal((html.match(/title="Демонстрационный тип участия процесса в КП"/g) || []).length, 1, 'Only explicitly simulated participation receives the demo tooltip');
  assert.doesNotMatch(html, /data-structure-path=|data-expand=/, 'Participation tags do not introduce another expansion level');
  assert.equal(JSON.stringify(typedNode), typedBefore, 'Relationship roles render without mutating the record or source type');

  const pathRows = freeze([
    {...fixture(0), id: 'related-path-demo', entity: 'paths', number: 27, code: 'КП-ДЕМО-0027', numberSimulated: true,
      title: 'Закрытие специальных избирательных счетов', type: 'Основной', relationshipType: 'Дополнительный', relationshipSimulated: true, ownerRole: ''},
    {...fixture(1), id: 'related-path-numbered', entity: 'paths', number: 123, code: 'КП123', type: '', ownerRole: ''},
    {id: 'related-path-sparse', entity: 'paths', title: 'Без метаданных', efficiency: null},
    {id: 'related-path-code', entity: 'paths', code: 'КП-001-А', title: 'Код без номера', efficiency: null}
  ]);
  const pathNode = freeze({id: 'related-paths', name: 'Процесс с названием', recordEntity: 'paths', records: pathRows});
  const pathBefore = JSON.stringify(pathNode);
  html = api.render(pathNode, {pagination, isFavorite: row => row.id === pathRows[0].id});
  assert.equal((html.match(/<span class="avatar" aria-hidden="true"><\/span>/g) || []).length, pathRows.length, 'Each related client path also keeps a decorative blank avatar');
  assert.doesNotMatch(html, /assets\/person\.svg/, 'Related client paths do not render a person glyph');
  assert.deepEqual(ids(html), pathRows.map(row => row.id), 'Reverse relationships retain the caller-provided KP records and order');
  assert.match(html, /data-table-entity="paths"/);
  assert.equal((html.match(/data-record-entity="paths"/g) || []).length, pathRows.length);
  assert.doesNotMatch(html, /data-record-entity="processes"/);
  assert.match(html, /Клиентские пути процесса «Процесс с названием»/);
  assert.match(html, /<th scope="col">ID, КП, описание<\/th>/);
  assert.match(html, /<th scope="col">Владелец клиентского пути<\/th>/);
  assert.match(html, /aria-label="Скопировать КП-ДЕМО-0027"/, 'Existing demo display code is retained for copying');
  assert.match(html, /aria-label="Скопировать КП 123"/, 'Numeric client-path IDs use the KP prefix');
  assert.match(html, /aria-label="Скопировать КП-001-А"/, 'A source code without a numeric display ID remains available');
  assert.match(html, /aria-label="Скопировать ID не указан"/, 'Missing IDs are not invented');
  assert.doesNotMatch(html, /structure-incoming-relationship|structure-incoming-owner-role/, 'Process participation and unprovided owner roles are not applied to client paths');
  assert.doesNotMatch(html, /data-structure-path=|data-expand=/, 'Related KP rows do not recursively expand their processes');
  assert.equal(html.split(pagination).length - 1, 1, 'Reverse list preserves existing paginator markup');
  assert.equal((html.match(/aria-label="В избранном"/g) || []).length, 1);
  assert.equal(JSON.stringify(pathNode), pathBefore, 'Reverse relationships do not mutate the caller data');
  assert.match(api.render({...pathNode, records: []}), /Нет связанных клиентских путей/);
  assert.match(api.render({...pathNode, name: '', records: []}), /<caption class="sr-only">Клиентские пути<\/caption>/);
  const escapedRole = freeze({...fixture(0), relationshipType: '<Роль & "тест">', relationshipSimulated: true});
  html = api.render({id: 'escaped-role', records: [escapedRole]});
  assert.match(html, /&lt;Роль &amp; &quot;тест&quot;&gt;/, 'Relationship-specific role text is escaped');
  assert.doesNotMatch(html, /<Роль/);
  const hostile = freeze({...fixture(0), id: 'escaped-"<&', title: '<img src=x onerror="alert(1)">', owner: '<script>alert(2)</script>', ownerRole: 'Роль & "роль"', type: '<Тип>'});
  html = api.render({id: 'escaped', records: [hostile]});
  assert.doesNotMatch(html, /<img src=x|<script>|<Тип>/, 'User fields are escaped before interpolation');
  report('DOM-free reciprocal renderer, both entity identities/labels, explicit participation roles, immutable records, >50 rows, caller sort/page/order/duplicates, pagination and missing/escaped data');
}

const cssFiles = ['styles.css', 'efficiency-palette.css', 'card-visuals.css', 'structure.css', 'structure-incoming.css'];
const harness = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${cssFiles.map(file => `<link rel="stylesheet" href="/${file}">`).join('\n')}
<style>body{margin:0}#incoming-test-host{width:1551px;max-width:100%;margin:0}#incoming-test-heading{display:block}#incoming-test-panel{min-width:0}#incoming-test-shell{min-width:0;width:100%}#incoming-test-shell>tbody>tr>td{padding:0;height:auto;border:0}</style>
<script src="/card-visuals.js" defer></script><script src="/structure-incoming.js" defer></script>
</head><body><section id="incoming-test-host"><button type="button" id="incoming-test-heading" data-expand="incoming-test" aria-expanded="true" aria-controls="incoming-test-panel">Входящие процессы</button><table id="incoming-test-shell" class="structure-table"><tbody><tr><td><div id="incoming-test-panel"></div></td></tr></tbody></table></section></body></html>`;

async function serve() {
  const mime = {'.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2'};
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') {response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); response.end(harness); return;}
    if (pathname === '/favicon.ico') {response.writeHead(204); response.end(); return;}
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) {response.writeHead(403); response.end(); return;}
    fs.readFile(file, (error, content) => {
      response.writeHead(error ? 404 : 200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream'});
      response.end(error ? 'Not found' : content);
    });
  });
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  return {server, url: `http://127.0.0.1:${server.address().port}/`};
}

async function render(page, rows, pagination = '', entity = 'processes') {
  await page.evaluate(({rows, pagination, entity}) => {
    const node = {id: 'incoming-test', name: 'Входящие процессы', recordEntity: entity, records: rows};
    const before = JSON.stringify(node);
    document.querySelector('#incoming-test-panel').innerHTML = window.BPMStructureIncoming.render(node, {rows, pagination, isFavorite: () => false});
    if (JSON.stringify(node) !== before) throw new Error('Renderer mutated its input');
  }, {rows, pagination, entity});
  await page.evaluate(() => document.fonts.ready);
}

async function semanticsAndGeometry(page) {
  const rows = Array.from({length: 4}, (_, index) => fixture(index));
  await render(page, rows);
  const table = page.locator('.structure-incoming-table');
  assert.equal(await table.evaluate(element => element.tagName), 'TABLE', 'Preserve native table semantics');
  assert.equal(await table.locator('tbody > tr[data-structure-record]').count(), 4);
  assert.equal(await table.locator('tbody > tr > td').count(), 12, 'Exactly three cells per row');
  assert.equal(await table.locator('thead button, [data-structure-sort]').count(), 0, 'No new visible sorting controls');
  const header = await table.locator('thead').evaluate(element => {
    const style = getComputedStyle(element), box = element.getBoundingClientRect();
    return {position: style.position, clip: style.clip, width: box.width, height: box.height};
  });
  assert.equal(header.position, 'absolute', 'Semantic header does not create a visible table row');
  assert.ok(header.width <= 1 && header.height <= 1 && header.clip !== 'auto', 'Semantic header is visually clipped');
  assert.equal(await page.locator('.structure-incoming [data-expand], .structure-incoming [data-structure-path]').count(), 0, 'Insertion has no competing expand/collapse controls');
  assert.equal(await table.locator('.table-efficiency, .trend').count(), 0, 'No efficiency pill or delta');
  const measured = await table.evaluate(element => {
    const wrapper = element.closest('.structure-incoming'), box = wrapper.getBoundingClientRect(), style = getComputedStyle(wrapper);
    const tableBox = element.getBoundingClientRect();
    return {width: box.width, height: box.height, tableWidth: tableBox.width, tableHeight: tableBox.height,
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft], background: style.backgroundColor,
      rows: [...element.tBodies[0].rows].map(row => {
        const title = row.querySelector('[data-structure-detail]'), titleStyle = getComputedStyle(title);
        const efficiency = row.querySelector('.bpm-efficiency-glyph'), glyph = efficiency.getBoundingClientRect();
        const metadata = row.querySelector('.structure-incoming-meta').getBoundingClientRect();
        const process = row.querySelector('.structure-incoming-process'), processStyle = getComputedStyle(process);
        const ownerName = getComputedStyle(row.querySelector('.structure-incoming-owner-name'));
        const ownerRole = getComputedStyle(row.querySelector('.structure-incoming-owner-role'));
        const avatarElement = row.querySelector('.structure-incoming-owner .avatar'), avatar = avatarElement.getBoundingClientRect();
        const efficiencyStyle = getComputedStyle(row.querySelector('.structure-incoming-efficiency > .efficiency'));
        return {id: row.dataset.structureRecord, entity: row.dataset.recordEntity, height: row.getBoundingClientRect().height,
          columns: [...row.cells].map(cell => cell.getBoundingClientRect().width),
          title: {size: titleStyle.fontSize, line: titleStyle.lineHeight, weight: titleStyle.fontWeight, tracking: titleStyle.letterSpacing},
          metadata: {height: metadata.height, gap: processStyle.rowGap},
          owner: {nameSize: ownerName.fontSize, nameLine: ownerName.lineHeight, nameWeight: ownerName.fontWeight, nameTracking: ownerName.letterSpacing, roleSize: ownerRole.fontSize, roleLine: ownerRole.lineHeight, avatarWidth: avatar.width, avatarHeight: avatar.height, avatarChildren: avatarElement.childElementCount, avatarHidden: avatarElement.getAttribute('aria-hidden')},
          efficiency: {background: efficiencyStyle.backgroundColor, radius: efficiencyStyle.borderRadius, leftPadding: getComputedStyle(row.querySelector('.structure-incoming-efficiency')).paddingLeft},
          glyph: {width: glyph.width, height: glyph.height},
          buttons: [...row.querySelectorAll('[data-structure-detail],[data-structure-copy]')].map(button => ({tag: button.tagName, type: button.getAttribute('type')}))};
      })};
  });
  near(measured.width, 1551, 'Figma insertion width');
  near(measured.height, 387, 'Four-row Figma insertion height');
  near(measured.tableWidth, 1519, 'Figma inner table width');
  near(measured.tableHeight, 363, 'Four rows plus three dividers');
  assert.deepEqual(measured.padding, ['0px', '16px', '24px', '16px']);
  assert.equal(measured.background, 'rgb(242, 244, 248)', 'Nordic background token');
  measured.rows.forEach((row, index) => {
    assert.equal(row.id, rows[index].id);
    assert.equal(row.entity, 'processes');
    near(row.height, index === 3 ? 90 : 91, `Row ${index + 1} content and divider height`);
    [651, 684, 184].forEach((width, column) => near(row.columns[column], width, `Row ${index + 1} column ${column + 1}`));
    assert.deepEqual(row.title, {size: '17px', line: '24px', weight: '590', tracking: '-0.51px'});
    assert.deepEqual(row.metadata, {height: 24, gap: '4px'}, 'Metadata and title use the Figma rhythm');
    assert.deepEqual(row.owner, {nameSize: '13px', nameLine: '18px', nameWeight: '400', nameTracking: '-0.039px', roleSize: '13px', roleLine: '18px', avatarWidth: 32, avatarHeight: 32, avatarChildren: 0, avatarHidden: 'true'});
    assert.deepEqual(row.efficiency, {background: 'rgba(0, 0, 0, 0)', radius: '0px', leftPadding: '40px'}, 'Card efficiency has no pill background or rounding and matches the Figma inset');
    near(row.glyph.width, 24, 'Card efficiency glyph width'); near(row.glyph.height, 24, 'Card efficiency glyph height');
    row.buttons.forEach(button => assert.deepEqual(button, {tag: 'BUTTON', type: 'button'}, 'Actions retain native keyboard activation without form submission'));
  });
  report('Figma 1551/1519px geometry, three columns, four 90px rows/dividers, Nordic padding, title and Card24 efficiency');
}

async function reciprocalOwnerAppearance(page) {
  for (const entity of ['processes', 'paths']) {
    await render(page, [{...fixture(0), entity, ownerRole: ''}], '', entity);
    const appearance = await page.locator('.structure-incoming-owner').evaluate(owner => {
      const name = owner.querySelector('.structure-incoming-owner-name'), style = getComputedStyle(name);
      const avatar = owner.querySelector('.avatar'), circle = avatar.getBoundingClientRect(), text = name.getBoundingClientRect();
      return {font: [style.fontSize, style.lineHeight, style.fontWeight, style.letterSpacing], width: circle.width, height: circle.height,
        blank: avatar.childNodes.length === 0, hidden: avatar.getAttribute('aria-hidden'), circleCenter: circle.y + circle.height / 2, textCenter: text.y + text.height / 2};
    });
    assert.deepEqual(appearance.font, ['13px', '18px', '400', '-0.039px'], `${entity}: Additional/R owner typography matches the rest of the structure`);
    assert.deepEqual([appearance.width, appearance.height, appearance.blank, appearance.hidden], [32, 32, true, 'true'], `${entity}: retain the blank 32px decorative circle`);
    near(appearance.circleCenter, appearance.textCenter, `${entity}: one-line owner remains centered on the circle`);
  }
  report('Both related directions use Additional/R 13/18, blank 32px circles and centered one-line owner names');
}

async function delegatedActions(page) {
  await page.evaluate(() => {
    window.incomingTestActions = [];
    document.querySelector('#incoming-test-host').addEventListener('click', event => {
      const action = event.target.closest('[data-structure-detail],[data-structure-copy]');
      if (action) {
        window.incomingTestActions.push({kind: action.hasAttribute('data-structure-copy') ? 'copy' : 'detail', id: action.dataset.structureCopy || action.dataset.structureDetail});
        return;
      }
      const expand = event.target.closest('[data-expand]');
      if (expand) {
        expand.setAttribute('aria-expanded', String(expand.getAttribute('aria-expanded') !== 'true'));
        document.querySelector('#incoming-test-panel').hidden = expand.getAttribute('aria-expanded') !== 'true';
      }
    });
  });
  const row = page.locator('.structure-incoming-table tbody > tr').first();
  const detail = row.locator('[data-structure-detail]').first(), copy = row.locator('[data-structure-copy]').first();
  for (const target of [detail, copy]) {
    await target.click();
    await target.focus(); await page.keyboard.press('Enter');
    await target.focus(); await page.keyboard.press('Space');
  }
  assert.deepEqual(await page.evaluate(() => window.incomingTestActions), ['detail', 'detail', 'detail', 'copy', 'copy', 'copy'].map(kind => ({kind, id: fixture(0).id})));
  assert.equal(await page.locator('#incoming-test-heading').getAttribute('aria-expanded'), 'true', 'Detail/copy hooks do not activate parent expansion');
  assert.equal(await page.locator('#incoming-test-panel').isVisible(), true);
  await page.locator('#incoming-test-heading').click();
  assert.equal(await page.locator('#incoming-test-panel').isVisible(), false, 'Parent disclosure remains independently operable');
  await page.locator('#incoming-test-heading').click();
  report('Separate detail/copy delegated hooks, Enter/Space native activation and independent parent disclosure');
}

async function pagingAndEdgeCases(page) {
  const records = Array.from({length: 103}, (_, index) => fixture(index));
  const pageRows = records.slice().sort((a, b) => b.number - a.number).slice(50, 75);
  await render(page, pageRows, '<nav aria-label="Fixture pages" data-test-pagination><button type="button" data-structure-page="incoming-test" data-page="3">3</button></nav>');
  assert.deepEqual(await page.locator('.structure-incoming-table tbody tr').evaluateAll(rows => rows.map(row => row.dataset.structureRecord)), pageRows.map(row => row.id));
  assert.equal(await page.locator('[data-test-pagination]').count(), 1);
  await render(page, [records[4], records[2], records[4]]);
  assert.deepEqual(await page.locator('.structure-incoming-table tbody tr').evaluateAll(rows => rows.map(row => row.dataset.structureRecord)), [records[4].id, records[2].id, records[4].id]);
  const escaped = {...fixture(0), id: 'escaped-"<&', code: 'П<&"', title: '<img src=x onerror="alert(1)">', owner: '<script>alert(2)</script>', ownerRole: 'Роль & "роль"', type: '<Тип>'};
  await render(page, [escaped]);
  assert.equal(await page.locator('.structure-incoming [data-structure-detail]').first().textContent(), escaped.title);
  assert.equal(await page.locator('.structure-incoming [data-structure-copy]').first().getAttribute('data-structure-copy'), escaped.id);
  assert.equal(await page.locator('.structure-incoming script, .structure-incoming img[src="x"]').count(), 0);
  const sparse = {id: 'sparse', entity: 'processes', title: 'Без дополнительных данных', efficiency: null};
  await render(page, [sparse]);
  const text = await page.locator('.structure-incoming-table tbody').innerText();
  assert.doesNotMatch(text, /undefined|null|NaN|Владелец процесса|Типовой/);
  assert.equal(await page.locator('.structure-incoming .efficiency').getAttribute('aria-label'), 'Эффективность не оценивалась');
  await render(page, []);
  assert.equal(await page.locator('.structure-incoming [data-structure-record]').count(), 0);
  report('Parent-sorted page slices, repeated IDs, pagination passthrough, escaped fields and empty/unrated metadata');

  const long = {...fixture(1), title: 'ОченьДлинноеНазваниеПроцесса'.repeat(18), owner: 'ОченьДлинноеИмяВладельца'.repeat(12), ownerRole: 'Роль '.repeat(35), type: 'ОченьДлинныйТип'.repeat(12), tags: ['ДлинныйТег'.repeat(12)]};
  for (const width of [320, 390, 1440, 1920]) {
    await page.setViewportSize({width, height: 1080});
    await render(page, [long, sparse, fixture(2), fixture(3)]);
    const dimensions = await page.locator('.structure-incoming').evaluate(element => {
      const box = element.getBoundingClientRect();
      const scrolls = [element, ...element.querySelectorAll('*')].filter(node => ['auto', 'scroll'].includes(getComputedStyle(node).overflowX) && node.scrollWidth > node.clientWidth + 1);
      return {viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth, left: box.left, right: box.right,
        scrolls: scrolls.map(node => {node.scrollLeft = node.scrollWidth; const result = {client: node.clientWidth, scroll: node.scrollWidth, left: node.scrollLeft}; node.scrollLeft = 0; return result;})};
    });
    assert.ok(dimensions.html <= width + 1 && dimensions.body <= width + 1, `${width}px no page overflow: ${JSON.stringify(dimensions)}`);
    assert.ok(dimensions.left >= -1 && dimensions.right <= width + 1, `${width}px insertion remains in viewport`);
    if (width < 1100) assert.ok(dimensions.scrolls.some(scroll => scroll.left > 0), `${width}px wide table scrolls locally`);
    assert.equal(await page.locator('.structure-incoming-table tbody tr').count(), 4);
  }
  report('Long and missing data at 320/390/1440/1920px without viewport overflow; local mobile horizontal scroll');
}

async function referenceScreenshot(page) {
  const rows = [
    {number: 1432, title: 'Приём и регистрация заявки — расчётной карты «Альта»', type: 'Основной', tags: ['ТОП 200'], efficiency: 86.1},
    {number: 1233, title: 'Проверка параметров клиента — расчётной карты «Альта»', type: 'Основной', tags: [], efficiency: 72.1},
    {number: 1232, title: 'Формирование условий — расчётной карты «Альта»', type: 'Основной', tags: [], efficiency: 61.1},
    {number: 1232, title: 'Подписание документов — расчётной карты «Альта»', type: 'Дополнительный', tags: [], efficiency: 10.5}
  ].map((row, index) => ({...fixture(index), ...row, code: `П ${row.number}`, ownerRole: 'Руководитель направления'}));
  await page.setViewportSize({width: 1920, height: 1080});
  await render(page, rows);
  const target = '/private/tmp/bpm-structure-incoming-reference.png';
  await page.locator('.structure-incoming').screenshot({path: target});
  report(`Figma reference fixture screenshot: ${target}`);
}

async function browserContracts() {
  const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const {server, url} = await serve();
  let browser;
  try {
    browser = await chromium.launch({headless: true, channel: 'chrome'});
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => {if (response.status() >= 400) errors.push(`${response.url()}: ${response.status()}`);});
    await page.goto(url);
    await page.waitForFunction(() => typeof window.BPMStructureIncoming?.render === 'function');
    await semanticsAndGeometry(page);
    await delegatedActions(page);
    await reciprocalOwnerAppearance(page);
    await pagingAndEdgeCases(page);
    if (process.argv.includes('--screenshot')) await referenceScreenshot(page);
    assert.deepEqual(errors, [], 'No uncaught exceptions or failed production assets');
    report('Incoming-process isolated browser regression complete');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  rendererContracts();
  if (!process.argv.includes('--data-only')) await browserContracts();
})().catch(error => {console.error(error); process.exitCode = 1;});

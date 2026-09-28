/* Pure-model checks; no browser or external services required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {window: {}};
for (const file of ['structure-source.js', 'structure-data.js', 'structure-search-model.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, {filename: file});
}
const models = {processes: context.window.BPM_STRUCTURE, paths: context.window.BPM_STRUCTURE_PATHS};
const before = JSON.stringify(models);
const api = context.window.BPMStructureSearchModel.create(models);
const products = models.processes.nodes.filter(node => node.kind === 'product');
const empty = {product: [], paths: [], processes: []};

assert.equal(api.entries.filter(entry => entry.kind === 'product').length, 87);
assert.equal(api.entries.filter(entry => entry.kind === 'paths').length, 198);
assert.equal(api.entries.filter(entry => entry.kind === 'processes').length, 913);
assert.equal(new Set(api.entries.map(entry => `${entry.kind}:${entry.id}`)).size, api.entries.length);
assert.equal(api.search('').length, 0);
assert.equal(api.search('  ').length, 0);
assert.equal(api.search('<script>alert(1)</script>').length, 0);
assert.equal(api.search('[').length, 0, 'Query punctuation is not interpreted as regex');

for (const query of ['П114', 'П 114', 'п 1 14']) {
  assert(api.search(query).some(entry => entry.id === 'structure-p114'), query);
}
const knownPath = models.paths.records.find(row => row.code === 'КП-ДЕМО-0027');
for (const query of ['КП-ДЕМО-0027', 'кп демо 0027', 'КП – ДЕМО – 0027']) {
  assert(api.search(query).some(entry => entry.id === knownPath.id), query);
}
const cards = api.search('дебетовые карты').filter(entry => entry.kind === 'product' && entry.title === 'Дебетовые карты');
assert.equal(cards.length, 5, 'Same-name product entities must not collapse');
assert.equal(new Set(cards.map(entry => entry.id)).size, 5);
assert.equal(new Set(cards.map(entry => entry.code)).size, 5);
assert(api.search('Пр 2 3 0 3').some(entry => entry.kind === 'product' && entry.code === 'Пр 2303'));
assert.equal(api.search('расчет').map(entry => entry.id).join(), api.search('РАСЧЁТ').map(entry => entry.id).join());
assert(api.search('банковских закрытие').length > 0, 'All words may be entered in any order');
const groupOrder = {product: 0, paths: 1, processes: 2, divisionLeader: 3, processOwner: 4, pathOwner: 5};
const broad = api.search('счет');
assert(broad.every((entry, index) => !index || groupOrder[broad[index - 1].kind] <= groupOrder[entry.kind]));
for (const placeholder of products.filter(node => node.isPlaceholder)) assert.equal(api.get('product', placeholder.id), undefined);

// Verify every real occurrence in both directions, including absent links.
for (const pathRow of models.paths.records) {
  const byProduct = new Map();
  for (const link of pathRow.sourceLinks) {
    if (!link.processId || link.validProcessCode === false) continue;
    if (!byProduct.has(link.productId)) byProduct.set(link.productId, new Set());
    byProduct.get(link.productId).add(link.processId);
  }
  for (const product of products) {
    for (const process of product.records) {
      const expected = Boolean(byProduct.get(product.id)?.has(process.id));
      assert.equal(api.matches(product, process, 'processes', {...empty, paths: [pathRow.id]}), expected);
      assert.equal(api.matches(product, pathRow, 'paths', {...empty, processes: [process.id]}), expected);
    }
  }
}
const first = products.find(node => node.records.length > 1);
assert(api.matches(first, first.records[0], 'processes', {...empty, processes: [first.records[0].id, first.records[1].id]}));
assert(!api.matches(first, first.records[0], 'processes', {...empty, product: ['different-product']}));
assert(api.matches(first, null, 'processes', empty));
assert(api.matches(first, null, 'processes', {...empty, product: [first.id]}));
assert(!api.matches(first, null, 'processes', {...empty, paths: [knownPath.id]}));
const unlinked = models.paths.records.find(row => !row.linkedProcessIds.length);
assert(api.get('paths', unlinked.id), 'A КП without valid processes remains searchable');
assert(products.every(product => product.records.every(row => !api.matches(product, row, 'processes', {...empty, paths: [unlinked.id]}))));
assert.equal(JSON.stringify(models), before, 'Source records and hierarchy are not mutated');

// A shared process may belong to both products, while its link to one КП is
// present in only one of them. A global linkedProcessIds test is incorrect.
const sharedProcess = {id: 'p', code: 'П99', title: 'Расчёт', entity: 'processes', titleAliases: ['Альтернативное имя']};
const otherProcess = {id: 'q', code: 'П98', title: 'Второй', entity: 'processes'};
const a = {id: 'a', kind: 'product', name: 'Продукт А', productIds: ['1'], records: [sharedProcess, otherProcess], children: []};
const b = {id: 'b', kind: 'product', name: 'Продукт Б', productIds: ['2'], records: [sharedProcess], children: []};
const crossPath = {id: 'kp', code: 'КП-ДЕМО-1', title: 'Маршрут', linkedProcessIds: ['p'], productLinks: [{id: 'a'}, {id: 'b'}], sourceLinks: [{productId: 'a', processId: 'p', validProcessCode: true}]};
const synthetic = context.window.BPMStructureSearchModel.create({processes: {nodes: [a, b], roots: [a, b], records: [sharedProcess, otherProcess]}, paths: {records: [crossPath]}});
assert(synthetic.matches(a, sharedProcess, 'processes', {...empty, paths: ['kp']}));
assert(!synthetic.matches(b, sharedProcess, 'processes', {...empty, paths: ['kp']}));
assert(synthetic.matches(a, crossPath, 'paths', {...empty, processes: ['p']}));
assert(!synthetic.matches(b, crossPath, 'paths', {...empty, processes: ['p']}));
assert(!synthetic.matches(a, otherProcess, 'processes', {...empty, paths: ['kp'], processes: ['q']}));
assert(synthetic.matches(a, sharedProcess, 'processes', {...empty, paths: ['kp'], processes: ['q', 'p']}));
assert(synthetic.search('альтернативное').some(entry => entry.id === 'p'));
assert(synthetic.search('расчет').some(entry => entry.id === 'p'));

// People retain full-name identities inside each role, without fabricated IDs
// in the display contract. The actual workbook stays unchanged.
const normalizeName = value => String(value).toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const personKey = name => `person-${encodeURIComponent(normalizeName(name))}`;
const peopleKinds = ['divisionLeader', 'processOwner', 'pathOwner'];
const people = api.entries.filter(entry => peopleKinds.includes(entry.kind));
for (const kind of peopleKinds) assert(people.some(entry => entry.kind === kind), kind);
for (const person of people) {
  assert.equal(person.person, true);
  assert.equal(person.code, '', 'People have no visible employee/entity code');
  assert.equal(person.id, personKey(person.title));
  assert.equal(person.aliases.length, 0);
  assert(person.sources.length > 0);
  assert(api.search(person.title).some(entry => entry.kind === person.kind && entry.id === person.id));
  assert(!/^\d+ владельц/.test(person.title), 'Combined owner-count labels are not people');
}
const expectedDivisions = new Map();
function visitReal(nodes, names = []) {
  for (const node of nodes) {
    const active = node.kind === 'division' ? [node.owner] : names;
    if (node.kind === 'product') expectedDivisions.set(node.id, active);
    visitReal(node.children || [], active);
  }
}
visitReal(models.processes.roots);
for (const product of products) {
  for (const name of expectedDivisions.get(product.id) || []) {
    const id = personKey(name);
    assert(api.get('divisionLeader', id)?.simulated, 'Existing demonstration-leader provenance is retained');
    assert(api.matches(product, null, 'paths', {divisionLeader: [id]}));
  }
  for (const row of product.records) {
    const owner = personKey(row.owner);
    assert(api.get('processOwner', owner));
    assert(api.matches(product, row, 'processes', {processOwner: [owner]}));
    assert(!api.matches(product, row, 'processes', {processOwner: ['missing-person']}));
  }
}
for (const row of models.paths.records) {
  for (const link of row.sourceLinks) {
    const product = products.find(item => item.id === link.productId);
    const owner = personKey(link.owner);
    if (!api.get('pathOwner', owner)) continue; // Empty/missing source owner is not a person.
    assert(api.matches(product, row, 'paths', {pathOwner: [owner]}));
    if (link.processId && link.validProcessCode !== false) {
      const process = models.processes.records.find(item => item.id === link.processId);
      assert(api.matches(product, process, 'processes', {pathOwner: [owner]}));
      assert(api.matches(product, row, 'paths', {processOwner: [personKey(process.owner)]}));
    }
  }
}
assert.equal(JSON.stringify(models), before, 'People search does not rewrite source owner fields');

// Counterexamples: role OR/AND, array owners, local КП ownership, real ancestry,
// ownerless branches and an identical full name used in more than one role.
const nameI = 'Иванов Иван Иванович', nameI2 = 'Иванов Иван Петрович';
const nameP = 'Петров Пётр Петрович', nameS = 'Сидорова Анна Ивановна';
const nameA = 'Андреев Андрей Андреевич', nameL = 'Лебедева Елена Николаевна';
const ownP = {id: 'p', title: 'Первый процесс', owners: [nameI, nameA, '  ИВАНОВ  ИВАН ИВАНОВИЧ  ', '—'], owner: '3 владельца процесса'};
const ownQ = {id: 'q', title: 'Второй процесс', owners: ['Не указан', null], owner: nameI2};
const noOwner = {id: 'none', title: 'Без владельца', owner: 'Владелец не указан', owners: ['Нет данных', 'Н/Д', '-', 'Руководитель не указан']};
const prodA = {id: 'a', kind: 'product', name: 'А', productIds: ['1'], records: [ownP, ownQ, noOwner], children: []};
const prodB = {id: 'b', kind: 'product', name: 'Б', productIds: ['2'], records: [ownP, ownQ], children: []};
const prodEmpty = {id: 'empty', kind: 'product', name: 'Пустой', productIds: ['3'], records: [], children: []};
const divA = {id: 'da', kind: 'division', name: 'Отдел А', owner: '2 руководителя', owners: [nameS, nameI], ownerSimulated: true, children: [prodA, prodEmpty]};
const divB = {id: 'db', kind: 'division', name: 'Отдел Б', owner: nameL, children: [prodB]};
const block = {id: 'root', kind: 'block', name: 'Блок', owner: 'Блочный Руководитель Один', children: [divA, divB]};
const ownPath = {
  id: 'kp', code: 'КП1', title: 'Общий КП', owners: [nameP, nameA], owner: '2 владельцев КП',
  productLinks: [{id: 'a'}, {id: 'b'}], linkedProcessIds: ['p', 'q'], sourceLinks: [
    {productId: 'a', processId: 'p', owner: nameP},
    {productId: 'a', processId: 'q', owner: '2 владельцев КП', owners: [nameA]},
    {productId: 'b', processId: 'p', owner: nameA},
    {productId: 'b', processId: 'q', owner: 'Не указан'}
  ]
};
const otherPath = {id: 'other', code: 'КП2', title: 'Другой КП', owner: nameP, sourceLinks: [{productId: 'b', processId: 'q', owner: nameP}]};
const emptyPath = {id: 'empty-path', code: 'КП3', title: 'Без процессов', owner: nameP, sourceLinks: [{productId: 'a', processId: null, validProcessCode: false, owner: nameP}]};
const fallbackPath = {id: 'fallback', code: 'КП4', title: 'Без исходных связей', owner: nameI, sourceLinks: [], productLinks: [{id: 'a'}]};
const fixture = {processes: {nodes: [block, divA, divB, prodA, prodB, prodEmpty], roots: [block], records: [ownP, ownQ, noOwner]}, paths: {records: [ownPath, otherPath, emptyPath, fallbackPath]}};
const fixtureBefore = JSON.stringify(fixture);
const personApi = context.window.BPMStructureSearchModel.create(fixture);
const id = personKey;
assert.equal(personApi.entries.filter(entry => entry.kind === 'processOwner').length, 3);
assert.equal(personApi.entries.filter(entry => entry.kind === 'divisionLeader').length, 3);
assert.equal(personApi.entries.filter(entry => entry.kind === 'pathOwner').length, 3);
assert(!personApi.entries.some(entry => entry.title === block.owner), 'Block leaders were not requested');
assert(!personApi.entries.some(entry => entry.person && /не указан|нет данных|владельц|руководител/i.test(entry.title)));
assert(personApi.get('processOwner', id(nameI)) && personApi.get('processOwner', id(nameI2)), 'Different full names are never merged');
assert.equal(personApi.get('pathOwner', id(nameP)).sources.length, 3, 'Repeat owner across КП has one role identity');
assert(personApi.search('иванов').every((entry, index, found) => !index || groupOrder[found[index - 1].kind] <= groupOrder[entry.kind]));
assert(personApi.search('петров петр').some(entry => entry.kind === 'pathOwner' && entry.title === nameP));
assert.equal(personApi.search(id(nameP)).length, 0, 'Internal people keys are not searchable employee IDs');
assert(personApi.matches(prodEmpty, null, 'paths', {divisionLeader: [id(nameS)]}), 'Empty product survives an ancestor leader filter');
assert(!personApi.matches(prodEmpty, null, 'paths', {divisionLeader: [id(nameL)]}));
assert(personApi.matches(prodB, ownP, 'processes', {divisionLeader: [id(nameS), id(nameL)]}), 'OR within leader group');
assert(!personApi.matches(prodB, ownP, 'processes', {divisionLeader: [id(nameS)], processOwner: [id(nameI)]}), 'AND between leader and owner');
assert(personApi.matches(prodA, ownP, 'processes', {divisionLeader: [id(nameS)], processOwner: [id(nameI)]}));
assert(personApi.matches(prodA, ownQ, 'processes', {processOwner: [id(nameI), id(nameI2)]}), 'OR within process owners');
assert(!personApi.matches(prodA, ownQ, 'processes', {processOwner: [id(nameI)]}));
assert(personApi.matches(prodA, ownPath, 'paths', {processOwner: [id(nameI)]}), 'Inactive process-owner group filters linked processes in КП tab');
assert(!personApi.matches(prodA, emptyPath, 'paths', {processOwner: [id(nameI)]}));
assert(!personApi.matches(prodB, otherPath, 'paths', {processOwner: [id(nameI)]}));
assert(!personApi.matches(prodA, ownPath, 'paths', {processes: ['p'], processOwner: [id(nameI2)]}), 'Selected process and process-owner must match the same linked process');
assert(personApi.matches(prodA, ownPath, 'paths', {processes: ['q', 'p'], processOwner: [id(nameI2)]}));
assert(personApi.matches(prodA, ownPath, 'paths', {pathOwner: [id(nameP)]}));
assert(!personApi.matches(prodB, ownPath, 'paths', {pathOwner: [id(nameP)]}), 'Global КП owner must not leak into another product');
assert(personApi.matches(prodB, ownPath, 'paths', {pathOwner: [id(nameP), id(nameA)]}), 'OR within КП owners');
assert(personApi.matches(prodA, emptyPath, 'paths', {pathOwner: [id(nameP)]}), 'Invalid/missing process does not erase valid КП ownership');
assert(personApi.matches(prodA, fallbackPath, 'paths', {pathOwner: [id(nameI)]}), 'Record owner fallback without local source links');
assert(personApi.matches(prodA, ownP, 'processes', {pathOwner: [id(nameP)]}));
assert(!personApi.matches(prodA, ownP, 'processes', {pathOwner: [id(nameA)]}), 'Ownership of another process occurrence of the same КП must not leak');
assert(!personApi.matches(prodB, ownP, 'processes', {pathOwner: [id(nameP)]}), 'Inactive КП-owner filter is local to product and process');
assert(personApi.matches(prodB, ownQ, 'processes', {pathOwner: [id(nameP)]}));
assert(!personApi.matches(prodB, ownQ, 'processes', {paths: ['kp'], pathOwner: [id(nameP)]}), 'Selected КП and КП-owner must match the same source occurrence');
assert(personApi.matches(prodB, ownQ, 'processes', {paths: ['kp', 'other'], pathOwner: [id(nameP)]}));
assert(personApi.matches(prodA, ownP, 'processes', {processOwner: [id(nameI)], pathOwner: [id(nameP)], product: ['a'], paths: ['kp'], processes: ['p']}));
assert(!personApi.matches(prodA, ownP, 'processes', {processOwner: [id(nameI2)], pathOwner: [id(nameP)]}));
for (const kind of ['processOwner', 'pathOwner']) assert(!personApi.matches(prodEmpty, null, 'paths', {[kind]: [id(nameI)]}));
assert.equal(JSON.stringify(fixture), fixtureBefore, 'Owner arrays, records and ancestry remain immutable');
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'structure-search.js'), 'utf8'), context);
const highlight = context.window.BPMStructureSearch.highlight;
assert.equal(highlight('КП-ДЕМО-0027', 'КП ДЕМО 0027', true), '<mark>КП-ДЕМО-0027</mark>');
assert.equal(highlight('КП-ДЕМО-0027', 'КП – ДЕМО – 0027', true), '<mark>КП-ДЕМО-0027</mark>');
assert.equal(highlight('П 114', 'П114', true), '<mark>П 114</mark>');
assert.equal(highlight('Расчёт и РАСЧЁТ', 'расчет'), '<mark>Расчёт</mark> и <mark>РАСЧЁТ</mark>');
assert.equal(highlight('<img>', '<img>'), '<mark>&lt;img&gt;</mark>');
console.log(`PASS: 1,198 entity entries and ${people.length} role-specific people; normalized search, local cross-tab ownership, role OR/AND, empty branches, immutable source.`);

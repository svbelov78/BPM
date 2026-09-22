/* Data-only regression checks; run with Node, no browser dependencies. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const sourceScript = fs.readFileSync(path.join(__dirname, 'structure-source.js'), 'utf8');
const dataScript = fs.readFileSync(path.join(__dirname, 'structure-data.js'), 'utf8');
function load(transformSource) {
  const context = { window: {} };
  vm.runInNewContext(sourceScript, context);
  if (transformSource) transformSource(context.window.BPM_STRUCTURE_SOURCE);
  const before = JSON.stringify(context.window.BPM_STRUCTURE_SOURCE);
  vm.runInNewContext(dataScript, context);
  assert.equal(JSON.stringify(context.window.BPM_STRUCTURE_SOURCE), before, 'Source snapshot is not mutated');
  return context.window;
}
const plain = value => JSON.parse(JSON.stringify(value));
const sorted = values => Array.from(new Set(values)).sort();
const loaded = load();
const source = loaded.BPM_STRUCTURE_SOURCE;
const processes = loaded.BPM_STRUCTURE;
const model = loaded.BPM_STRUCTURE_PATHS;
const rows = source.rows.map(indices => indices.map(index => index < 0 ? null : source.strings[index].trim()));
const bucketFor = value => value === null ? 4 : value > 85 ? 0 : value > 65 ? 1 : value > 45 ? 2 : 3;

// Exact pre-extension process output: records, hierarchy, owners, IDs and scales.
assert.equal(crypto.createHash('sha256').update(JSON.stringify(processes)).digest('hex'),
  '2c377056d152fb22902e66d9e08e966c2d5ac431c66d140d69d0a12cb81395b0',
  'The full process model remains unchanged');
assert.equal(processes.total, 913);
assert.deepEqual(plain(processes.maxima), [120, 60, 126, 77, 35]);
assert.equal(new Set(source.rows.map(row => source.strings[row[6]])).size, 199);
assert.equal(new Set(rows.map(row => row[6])).size, 198);
assert.equal(model.total, 198);
assert.equal(model.records.length, 198);
assert.equal(new Set(model.records.map(record => record.id)).size, 198);
assert.equal(new Set(model.records.map(record => record.number)).size, 198);
assert.deepEqual(sorted(model.records.map(record => record.title)), sorted(rows.map(row => row[6])));
assert.equal(model.roots.length, 9);
assert.equal(model.nodes.filter(node => node.kind === 'division').length, 38);
assert.equal(model.productCount, 87);
assert.equal(model.productNodeCount, 98);
assert.equal(model.placeholderCount, 11);
assert.deepEqual(plain(model.maxima), [33, 25, 15, 9, 10]);
assert.equal(model.relationCount, 212);
assert.equal(model.processRelationCount, 2169);
assert.equal(model.pathRelationCount, 2171);
assert.equal(model.provenance.invalidRows, 0);
assert.equal(model.provenance.invalidProcessRows, 7);
assert.equal(model.sourceIssues.length, 7);
assert.ok(model.sourceIssues.every(issue => issue.excludedFromPathCount === false));
assert.equal(model.records.reduce((sum, record) => sum + record.sourceRows.length, 0), 2277);
assert.equal(model.records.reduce((sum, record) => sum + record.sourceLinks.length, 0), 2277);
assert.equal(model.provenance.sourceNumberAvailable, false);
assert.equal(model.provenance.numbersSimulated, true);
assert.equal(model.sourceFile, source.file);
assert.equal(model.sourceSheet, source.sheet);
assert.equal(model.sourceDate, source.date);
assert.equal(model.sourceRowCount, source.rows.length);

const pathById = new Map(model.records.map(record => [record.id, record]));
const processById = new Map(processes.records.map(record => [record.id, record]));
const processNodeById = new Map(processes.nodes.map(node => [node.id, node]));
function expectedTitles(node) {
  if (node.kind === 'product') return sorted(processNodeById.get(node.id).sourceRows.map(row => rows[row - 2][6]));
  return sorted(node.children.flatMap(expectedTitles));
}
for (const node of model.nodes) {
  const original = processNodeById.get(node.id);
  assert.ok(original);
  assert.notEqual(node, original, 'Path nodes are separate objects');
  for (const key of ['name', 'kind', 'owner', 'ownerRole', 'ownerSimulated', 'source']) {
    assert.equal(node[key], original[key], `${node.name}: preserved ${key}`);
  }
  assert.deepEqual(plain(node.owners), plain(original.owners));
  assert.deepEqual(plain(node.children.map(child => child.id)), plain(original.children.map(child => child.id)));
  const expected = expectedTitles(node);
  assert.equal(node.total, expected.length, node.name);
  assert.equal(node.total, new Set(node.records.map(record => record.id)).size);
  assert.deepEqual(sorted(node.records.map(record => record.title)), expected);
  assert.ok(node.records.every(record => pathById.get(record.id) === record));
  assert.equal(node.buckets.reduce((sum, count) => sum + count, 0), node.total);
  node.buckets.forEach((count, bucket) => {
    assert.equal(count, node.records.filter(record => bucketFor(record.efficiency) === bucket).length);
    assert.ok(count <= model.maxima[bucket]);
  });
  if (node.kind === 'product') {
    assert.deepEqual(plain(node.clientPaths.map(record => record.id)), plain(node.records.map(record => record.id)));
    for (const record of node.records) assert.ok(record.productLinks.some(product => product.id === node.id));
  }
}
assert.equal(new Set(model.roots.flatMap(node => node.records.map(record => record.id))).size, 198);
assert.equal(model.nodes.filter(node => node.kind === 'product').reduce((sum, node) => sum + node.total, 0), 212);
assert.deepEqual(plain(model.maxima), Array.from(model.colors, (_, bucket) => Math.max(...model.roots.map(root => root.buckets[bucket]))));

for (const record of model.records) {
  assert.match(record.id, /^structure-kp-[a-z0-9]+$/);
  assert.equal(record.entity, 'paths');
  assert.equal(record.title, record.name);
  assert.equal(record.source, 'xlsx');
  assert.equal(record.numberSimulated, true);
  assert.equal(record.sourceNumber, null);
  assert.match(record.code, /^КП-ДЕМО-\d{4}$/);
  assert.equal(record.bucket, bucketFor(record.efficiency));
  assert.equal(record.efficiencySimulated, true);
  assert.equal(record.sourceEfficiency, null);
  assert.equal(record.provenance.sourceFile, source.file);
  assert.equal(record.provenance.sourceSheet, source.sheet);
  assert.equal(record.provenance.nameColumn, 'G');
  assert.equal(record.provenance.ownerColumn, 'F');
  assert.equal(record.provenance.processCodeColumn, 'K');
  const relatedRows = record.sourceRows.map(row => rows[row - 2]);
  assert.ok(relatedRows.every(row => row[6] === record.title));
  assert.deepEqual(sorted(record.owners), sorted(relatedRows.map(row => row[5])));
  assert.equal(record.owner, relatedRows[0][5]);
  assert.deepEqual(sorted(record.blocks), sorted(relatedRows.map(row => row[0])));
  assert.deepEqual(sorted(record.divisions), sorted(relatedRows.map(row => row[1])));
  const codes = sorted(relatedRows.map(row => String(row[10] || '').replace(/\s+/g, '').toUpperCase()).filter(code => /^П\d+$/.test(code)));
  assert.deepEqual(sorted(record.linkedProcessCodes), codes);
  assert.deepEqual(sorted(record.linkedProcessIds), sorted(codes.map(code => 'structure-p' + code.slice(1))));
  assert.equal(record.processCount, codes.length);
  assert.equal(record.count, codes.length);
  assert.ok(record.linkedProcesses.every(process => processById.get(process.id) === process));
  assert.equal(record.linkedProcesses.length, codes.length);
  assert.equal(record.sourceLinks.length, record.sourceRows.length);
  for (const link of record.sourceLinks) {
    const row = rows[link.row - 2];
    assert.equal(link.pathName, row[6]);
    assert.equal(link.owner, row[5]);
    assert.equal(link.productBlock, row[0]);
    assert.equal(link.productDivision, row[1]);
    assert.equal(link.sourceProductId, row[2]);
    assert.equal(link.sourceProductUid, row[3]);
    assert.equal(link.processCode, row[10]);
    assert.equal(link.processTitle, row[11]);
    assert.ok(record.productLinks.some(product => product.id === link.productId));
    if (link.validProcessCode) assert.ok(record.linkedProcessIds.includes(link.processId));
    else assert.equal(link.processId, null);
  }
}
assert.deepEqual(sorted(model.records.filter(record => !record.processCount).map(record => record.title)),
  ['Урегулирование проблемной задолженности ФЛ', 'Урегулирование проблемной задолженности ЮЛ']);
assert.equal(model.records.flatMap(record => record.sourceLinks).filter(link => !link.validProcessCode).length, 7);

// Identity, demo display numbering and evaluation are invariant to row ordering.
const stableProjection = value => plain(value.records.map(record => ({
  id: record.id, number: record.number, code: record.code, title: record.title,
  owner: record.owner, efficiency: record.efficiency, bucket: record.bucket,
  processCount: record.processCount, linkedProcessIds: sorted(record.linkedProcessIds)
})).sort((a, b) => a.id.localeCompare(b.id)));
assert.deepEqual(stableProjection(load().BPM_STRUCTURE_PATHS), stableProjection(model));
assert.deepEqual(stableProjection(load(snapshot => snapshot.rows.reverse()).BPM_STRUCTURE_PATHS), stableProjection(model));
assert.deepEqual(stableProjection(load(snapshot => snapshot.rows.push(snapshot.rows[0].slice())).BPM_STRUCTURE_PATHS), stableProjection(model));
console.log('Client-path data: PASS — 198 source paths, 212 product memberships, 2,169 process links, retained invalid rows, stable demo data and unchanged 913-process model.');

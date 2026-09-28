/* Pure projection checks: node visibility must never change filtered records. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {window: {}};
for (const file of ['structure-source.js', 'structure-data.js', 'structure-levels.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, {filename: file});
}
const {project} = context.window.BPMStructureLevels;
const kinds = ['block', 'division', 'product'];
const ids = records => Array.from(records, record => record.id).sort();
const freeze = object => {
  if (!object || typeof object !== 'object' || Object.isFrozen(object)) return object;
  Object.freeze(object);
  Object.values(object).forEach(freeze);
  return object;
};
const nameOrder = (a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id);
const flatten = nodes => nodes.flatMap(node => [node, ...flatten(node.children)]);

for (const key of ['BPM_STRUCTURE', 'BPM_STRUCTURE_PATHS']) {
  const model = context.window[key];
  const before = JSON.stringify(model);
  freeze(model);
  for (let mask = 0; mask < 8; mask += 1) {
    const hidden = kinds.filter((kind, index) => mask & (1 << index));
    const result = project(model.roots, {hidden: mask % 2 ? new Set(hidden) : hidden,
      compare: nameOrder, flatId: `flat-${key}`});
    assert.equal(result.total, model.total, `${key}/${mask}: counts remain unchanged`);
    assert.deepEqual(ids(result.records), ids(model.records));
    assert.deepEqual(ids(result.roots.flatMap(node => node.records)).filter((id, index, values) => index === 0 || id !== values[index - 1]), ids(model.records));
    assert.equal(result.flat, mask === 7);
    assert.equal(result.nodes.length, result.byId.size);
    assert.equal(result.maxDepth, mask === 7 ? 0 : 2 - hidden.length);
    for (const node of result.nodes) {
      assert.strictEqual(result.byId.get(node.id), node);
      assert.equal(node.maxDepth, result.maxDepth);
      assert.equal(new Set(node.records.map(record => record.id)).size, node.records.length);
      node.children.forEach((child, index) => {
        assert.equal(child.depth, node.depth + 1);
        if (index) assert(nameOrder(node.children[index - 1], child) <= 0);
      });
      if (!node.synthetic) {
        const original = model.nodes.find(source => source.id === node.id);
        assert(original);
        assert(!hidden.includes(node.kind));
        assert.notStrictEqual(node, original);
        assert.deepEqual(ids(node.records), ids(original.records));
        assert.equal(node.total, original.total);
        assert.deepEqual(Array.from(node.buckets), Array.from(original.buckets));
        assert.equal(node.averageEfficiency, original.averageEfficiency);
        assert.notStrictEqual(node.children, original.children);
      }
    }
    result.roots.forEach((node, index) => {
      assert.equal(node.depth, 0);
      if (index) assert(nameOrder(result.roots[index - 1], node) <= 0);
    });
    if (mask === 7) {
      const root = result.roots[0];
      assert.equal(root.id, `flat-${key}`);
      assert.equal(root.kind, 'flat');
      assert.equal(root.synthetic, true);
      assert.equal(root.name, root.ariaLabel);
      assert.equal(root.recordEntity, undefined, 'A flat table is not an incoming relationship table');
      assert.equal(root.buckets.reduce((sum, count) => sum + count, 0), model.total);
    }
  }
  assert.equal(JSON.stringify(model), before, `${key}: projection leaves the source model untouched`);
}

const row = (id, efficiency = 50, bucket = 2) => ({id, efficiency, bucket});
const shared = row('shared', 0, 3), a = row('a', 100, 0), b = row('b', null, 4);
function group(id, kind, name, children = [], rows) {
  const records = rows || [...new Map(children.flatMap(node => node.records).map(record => [record.id, record])).values()];
  const buckets = [0, 0, 0, 0, 0];
  records.forEach(record => buckets[record.bucket]++);
  return {id, kind, name, children, records, total: records.length, buckets, averageEfficiency: 47.125};
}
const emptyProduct = group('empty', 'product', 'Пустой продукт', [], []);
const productA = group('prod-a', 'product', 'А', [], [shared, a]);
const productB = group('prod-b', 'product', 'Б', [], [shared, b]);
const productZ = group('prod-z', 'product', 'Я', [], [shared]);
const source = freeze([
  group('block-a', 'block', 'А', [group('division-a', 'division', 'А', [productZ, productA])]),
  group('block-b', 'block', 'Б', [group('division-b', 'division', 'Б', [productB, emptyProduct])])
]);
const sourceBefore = JSON.stringify(source);

// Flattening already-sorted parent branches must still sort the merged siblings.
const promoted = project(source, {hidden: ['block', 'division'], compare: nameOrder});
assert.deepEqual(Array.from(promoted.roots, node => node.id), ['prod-a', 'prod-b', 'empty', 'prod-z']);
assert.equal(promoted.byId.get('empty').total, 0, 'An empty product stays visible when its level is enabled');
const countOrder = (a, b) => b.total - a.total || nameOrder(a, b);
const byCount = project(source, {hidden: ['block', 'division'], compare: countOrder});
assert.deepEqual(Array.from(byCount.roots, node => node.id), ['prod-a', 'prod-b', 'prod-z', 'empty']);

const blocks = project(source, {hidden: ['division', 'product']});
assert.equal(blocks.roots.length, 2);
assert(blocks.roots.every(node => node.children.length === 0 && node.depth === 0));
assert.deepEqual(ids(blocks.roots[0].records), ['a', 'shared']);
assert.equal(blocks.roots[0].averageEfficiency, 47.125, 'Retained aggregate values are copied without recalculation');
assert.equal(blocks.total, 3, 'Shared records count once in the entire result');

const flat = project(source, {hidden: new Set(kinds), flatId: 'all-processes'});
assert.deepEqual(ids(flat.roots[0].records), ['a', 'b', 'shared']);
assert.equal(flat.roots[0].averageEfficiency, 50, 'The flat average counts zero and shared entities once, and excludes missing values');
assert.deepEqual(Array.from(flat.roots[0].buckets), [1, 0, 0, 1, 1]);
assert.equal(flat.roots[0].id, 'all-processes');
assert.equal(JSON.stringify(source), sourceBefore);

// A filtered-out forest is distinct from an existing branch with no records.
const none = project([], {hidden: kinds});
assert.equal(none.roots.length, 0);
assert.equal(none.nodes.length, 0);
assert.equal(none.byId.size, 0);
assert.equal(none.total, 0);
assert.equal(none.flat, false);
assert.equal(none.maxDepth, -1);
const emptyBranch = freeze([group('empty-block', 'block', 'Пустой блок', [group('empty-division', 'division', 'Пустое подразделение', [emptyProduct])])]);
const emptyFlat = project(emptyBranch, {hidden: kinds});
assert.equal(emptyFlat.flat, true);
assert.equal(emptyFlat.roots.length, 1);
assert.equal(emptyFlat.roots[0].total, 0);
assert.equal(emptyFlat.roots[0].averageEfficiency, null);
assert.equal(emptyFlat.roots[0].id, 'structure-flat');

// Turning levels back on restores the same original keys used by UI state maps.
const restored = project(source);
assert.deepEqual(Array.from(flatten(restored.roots), node => node.id), Array.from(flatten(source), node => node.id));
assert.equal(restored.maxDepth, 2);
assert.equal(JSON.stringify(source), sourceBefore);
console.log('PASS — level combinations in both models, stable identities, promotion sorting, unique aggregates, rendered depths, empty products and source immutability');

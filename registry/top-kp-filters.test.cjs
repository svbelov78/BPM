/* Pure ТОП-КП filtering: immutable Excel source, deterministic demo metadata,
 * exact status boundaries, canonical SSP ancestors, and AND composition.
 * Run: node top-kp-filters.test.cjs
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const context = {window:{}};
  for (const file of ['top-kp-data.js', 'top-kp.js', 'top-kp-filters.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, {filename:file});
  }
  return context.window;
}
const app = load(), filters = app.BpmTopKpFilters, records = app.BPM_TOP_KP.records;
const snapshot = JSON.stringify(app.BPM_TOP_KP);
function freeze(value) {
  if (value && typeof value === 'object') {Object.freeze(value);Object.values(value).forEach(freeze);}
}
freeze(app.BPM_TOP_KP);
const plain = value => JSON.parse(JSON.stringify(value));
const score = record => app.BpmTopKp.score(record);
const selected = (key, value) => records.filter(record => filters.matches(record, {[key]:value}, score(record)));

assert.deepEqual(plain(filters.fields.map(field => field.key)), ['block','ssp','efficiency','csat','techErrors','appeals','variability','pm','benchmarking','gemba']);
assert.deepEqual(plain(filters.fields.map(field => field.group)), ['structure','structure','efficiency','internal','internal','internal','internal','maturity','maturity','maturity']);
assert.equal(filters.fields.find(field => field.key === 'block').options.length, 20);
assert.equal(filters.fields.find(field => field.key === 'ssp').options.length, 27);
for (const field of filters.fields) {
  assert.equal(new Set(field.options.map(option => option.value)).size, field.options.length);
  assert.ok(field.options.every(option => option.value !== '' && option.label !== 'Все'));
  assert.ok(Object.isFrozen(field) && Object.isFrozen(field.options));
  assert.ok(field.options.every(Object.isFrozen));
}
assert.ok(Object.isFrozen(filters) && Object.isFrozen(filters.fields));

for (const [value, expected] of [
  [null,'no-data'], [undefined,'no-data'], [NaN,'no-data'], [Infinity,'no-data'],
  ['', 'no-data'], [' ', 'no-data'], [false,'no-data'],
  [0,'critical'], [44.999,'critical'], [45,'lagging'], [64.999,'lagging'],
  [65,'on-track'], [84.999,'on-track'], [85,'leader'], [100,'leader'], ['85','leader']
]) assert.equal(filters.statusFor(value), expected, `status boundary ${value}`);

assert.equal(records.filter(record => filters.matches(record, {}, score(record))).length, 136);
assert.equal(records.filter(record => filters.matches(record, {ssp:'',pm:'',csat:null}, score(record))).length, 136);
assert.equal(filters.matches(null, {}), false);
assert.equal(filters.matches(records[0], {block:'not-a-menu-value'}, score(records[0])), false);
assert.equal(filters.matches(records[0], {efficiency:'no-data'}, null), true);
assert.equal(filters.matches(records[0], {efficiency:'no-data'}, score(records[0])), false);
assert.equal(filters.matches(records[0], {efficiency:'no-data'}), true, 'No implicit replacement of source efficiency');

const fromCell = cell => records.find(record => record.sourceCell === cell);
for (const [cell, ssp] of [
  ['A12','Банковские счета'], ['A12','Розничный бизнес'],
  ['A23','Банковские счета'], ['B3','Контакт-центр'],
  ['D3','Физические каналы'], ['G12','Проблемные активы'],
  ['G23','ЮЛ']
]) assert.equal(filters.matches(fromCell(cell), {ssp}, score(fromCell(cell))), true, `${cell} belongs to SSP ${ssp}`);
assert.equal(filters.matches(fromCell('A12'), {ssp:'Технологии'}, score(fromCell('A12'))), false);
const wealth = records.filter(record => record.division === 'Управление багосостоянием');
assert.ok(wealth.length > 0);
assert.ok(wealth.every(record => filters.matches(record, {ssp:'Управление благосостоянием'}, score(record))));
const attracted = records.filter(record => record.group === 'Превлечение денежных средств');
assert.ok(attracted.length > 0);
assert.ok(attracted.every(record => filters.matches(record, {ssp:'Привлечение денежных средств'}, score(record))));

const distributions = {};
for (const field of filters.fields) {
  distributions[field.key] = Object.fromEntries(field.options.map(option => [option.value, selected(field.key, option.value).length]));
  if (field.key !== 'efficiency') assert.ok(Object.values(distributions[field.key]).every(count => count > 0), `${field.key}: every menu value has an example`);
  if (field.key !== 'ssp') assert.equal(Object.values(distributions[field.key]).reduce((sum,count) => sum+count, 0), 136, `${field.key}: one classification per record`);
}
for (const record of records) {
  const meta = filters.metadata(record);
  assert.ok(meta.synthetic);
  assert.ok(Object.isFrozen(meta) && Object.isFrozen(meta.ssp));
  assert.equal(filters.metadata(record), meta, 'Metadata cache is read-only');
  assert.deepEqual(plain(filters.metadata({...record})), plain(meta), 'Cloning/reordering does not change demo assignment');
  const state = Object.fromEntries(filters.fields.map(field => [field.key,
    field.key === 'ssp' ? meta.ssp.find(value => field.options.some(option => option.value === value)) || '' :
    field.key === 'efficiency' ? filters.statusFor(score(record)) :
    field.group === 'internal' ? filters.statusFor(meta[field.key]) : meta[field.key]
  ]));
  assert.equal(filters.matches(record, state, score(record)), true, 'All selected properties match together');
  assert.equal(filters.matches(record, {...state,pm:meta.pm === 'yes' ? 'no' : 'yes'}, score(record)), false, 'One contradictory field rejects the AND combination');
}
const reloaded = load();
for (const record of [...records].reverse()) {
  const twin = reloaded.BPM_TOP_KP.records.find(item => item.id === record.id);
  assert.deepEqual(plain(reloaded.BpmTopKpFilters.metadata(twin)), plain(filters.metadata(record)), 'Reload retains metadata independent of traversal order');
}
assert.equal(JSON.stringify(app.BPM_TOP_KP), snapshot, 'Filtering never mutates any Excel source field');
console.log(JSON.stringify({status:'PASS',records:records.length,fields:filters.fields.length,distributions}, null, 2));

/* Run: node top-kp-identifiers.test.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modelSource = fs.readFileSync(path.join(__dirname, 'top-kp-identifiers.js'), 'utf8');
const dataContext = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'top-kp-data.js'), 'utf8'), dataContext);
const records = dataContext.window.BPM_TOP_KP.records;
const snapshot = JSON.stringify(dataContext.window.BPM_TOP_KP);

function freeze(value) {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
freeze(dataContext.window.BPM_TOP_KP);
function load(items = records) {
  const context = {window:{BPM_TOP_KP:{records:items}}};
  vm.runInNewContext(modelSource, context, {filename:'top-kp-identifiers.js'});
  return context.window.BpmTopKpIdentifiers;
}
const model = load();
const codes = records.map(record => model.codeFor(record));
assert.equal(records.length, 136);
assert.equal(new Set(codes).size, 136, 'Every source КП gets a unique demo ID');
assert.ok(codes.every(code => /^КП\d{4}$/.test(code) && +code.slice(2) >= 1000 && +code.slice(2) <= 9999));
assert.ok(Object.isFrozen(model));

const reloaded = load([...records].reverse());
for (const record of records) {
  assert.equal(model.codeFor({...record}), model.codeFor(record), 'Cloned records retain their assigned ID');
  assert.equal(reloaded.codeFor(record), model.codeFor(record), 'Reload and reordered source retain assigned IDs');
  assert.equal(model.codeFor({sourceCell:record.sourceCell}), model.codeFor(record), 'Source-cell lookup supports the same record');
  assert.equal(model.codeFor({...record,title:'Renamed title'}), model.codeFor(record), 'Titles do not affect IDs');
}
assert.equal(model.codeFor({...records[0],code:'КП1093'}), 'КП1093', 'Explicit record code wins after allocation');
assert.equal(model.codeFor({code:' КП1093 '}), 'КП1093');
assert.equal(model.codeFor({code:'ACTUAL-CODE'}), 'ACTUAL-CODE', 'Actual IDs are not limited to the demo pattern');
assert.equal(model.codeFor({code:1093}), '1093');
for (const record of [null,undefined,{},'unknown',{id:'unknown'},{sourceCell:'ZZ999'}]) assert.equal(model.codeFor(record), '');

// Reserve an explicit code that would otherwise be assigned to a demo record.
const reserved = codes[0];
const withActual = load([...records,{id:'actual',code:reserved,sourceCell:'ZZ1'}]);
assert.equal(withActual.codeFor({id:'actual'}), reserved);
assert.notEqual(withActual.codeFor(records[0]), reserved);
assert.equal(new Set([...records.map(record => withActual.codeFor(record)),reserved]).size, 137);

const cellOnly = freeze([{sourceCell:'A3'},{sourceCell:'B3'}]);
const cellModel = load(cellOnly), reversedCells = load([...cellOnly].reverse());
assert.notEqual(cellModel.codeFor(cellOnly[0]),cellModel.codeFor(cellOnly[1]));
assert.equal(cellModel.codeFor(cellOnly[0]),reversedCells.codeFor(cellOnly[0]));

// Find a deterministic collision in the initial candidates, then verify that
// batch allocation resolves it consistently without depending on input order.
const candidates = new Map();
let collision;
for (let index = 0; index < 9001 && !collision; index++) {
  const record = {id:`collision-${index}`};
  const code = load([record]).codeFor(record);
  if (candidates.has(code)) collision = [candidates.get(code),record];
  else candidates.set(code,record);
}
assert.ok(collision, 'Finite code range has an initial hash collision');
const collisionModel = load(collision), reverseCollision = load([...collision].reverse());
assert.notEqual(collisionModel.codeFor(collision[0]),collisionModel.codeFor(collision[1]), 'Collision is resolved');
for (const record of collision) assert.equal(collisionModel.codeFor(record),reverseCollision.codeFor(record));

assert.equal(load([]).codeFor({id:'unknown'}), '');
assert.equal(JSON.stringify(dataContext.window.BPM_TOP_KP),snapshot, 'Original Excel data is never mutated');
console.log(JSON.stringify({status:'PASS',records:records.length,uniqueCodes:new Set(codes).size,examples:codes.slice(0,8),collisionResolved:collision.map(record => collisionModel.codeFor(record))},null,2));

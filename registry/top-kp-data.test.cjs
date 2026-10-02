const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'top-kp-data.js'), 'utf8'), context);
const data = JSON.parse(JSON.stringify(context.window.BPM_TOP_KP));

assert.equal(data.sourceFile, 'Эксель доска 21.09.2026_v1.xlsx');
assert.equal(data.sourceSheet, 'Лист1');
assert.equal(data.blocks.length, 5);
assert.equal(data.blocks.reduce((n, block) => n + block.departments.length, 0), 23);
assert.equal(data.records.length, 136);
assert.equal(new Set(data.records.map(record => record.id)).size, 136);
assert.equal(new Set(data.records.map(record => record.sourceCell)).size, 136);

const flat = new Map(data.records.map(record => [record.id, record]));
const expectedBlockCounts = [18, 8, 12, 54, 44];
const hierarchicalCards = [];
const namedGroups = [];
for (const [blockIndex, block] of data.blocks.entries()) {
  assert.match(block.key, /^sheet1-[a-s]\d+$/);
  assert.ok(block.sourceCell);
  assert.equal(block.name, block.sourceName.replace(/\s+/g, ' ').trim());
  let count = 0;
  for (const division of block.departments) {
    assert.ok(division.sourceCell);
    assert.equal(division.name, division.sourceName.replace(/\s+/g, ' ').trim());
    for (const group of division.groups) {
      if (group.name !== null) {
        namedGroups.push(group);
        assert.ok(group.sourceCell);
        assert.equal(group.name, group.sourceName.replace(/\s+/g, ' ').trim());
      }
      for (const card of group.cards) {
        count++;
        hierarchicalCards.push(card);
        assert.deepEqual(Object.keys(card).sort(), ['id', 'sourceCell', 'sourceName', 'title']);
        assert.equal(card.id, `top-kp-sheet1-${card.sourceCell.toLowerCase()}`);
        assert.equal(card.title, card.sourceName.replace(/\s+/g, ' ').trim());
        assert.deepEqual(flat.get(card.id), {
          id: card.id,
          entity: 'paths',
          source: 'top-kp',
          title: card.title,
          block: block.name,
          division: division.name,
          group: group.name,
          sourceCell: card.sourceCell,
          sourceName: card.sourceName,
          efficiency: null,
          owner: null,
          linkedProcesses: []
        });
      }
    }
  }
  assert.equal(count, expectedBlockCounts[blockIndex]);
}
assert.equal(namedGroups.length, 15);
assert.equal(hierarchicalCards.length, 136);
assert.deepEqual(hierarchicalCards.map(card => card.id), data.records.map(record => record.id));

// Independent extraction fingerprint preserves every original cell value and its
// whitespace-normalized title. It does not depend on the user's local XLSX path.
const sourceNames = hierarchicalCards.map(card => [card.sourceCell, card.sourceName, card.title]);
const fingerprint = crypto.createHash('sha256').update(JSON.stringify(sourceNames)).digest('hex');
assert.equal(fingerprint, '85823e8070ddd51fe0c43a51499a3f51a9ff434625a14d8990db53975b4fad91');

assert.equal(data.records.some(record => record.sourceCell === 'K6'), false, 'Инновации is a heading');
assert.equal(data.records.some(record => record.sourceCell === 'E18'), false, 'Государственные сервисы is a heading');
assert.equal(data.records.find(record => record.sourceCell === 'K7').division, 'Инновации');
assert.equal(data.records.find(record => record.sourceCell === 'E19').group, 'Государственные сервисы');
assert.equal(data.records.find(record => record.sourceCell === 'G23').division, 'Корпоративный бизнес');
assert.equal(data.records.find(record => record.sourceCell === 'G12').division, 'Проблемные активы');
assert.equal(data.records.find(record => record.sourceCell === 'A23').group, 'Банковские счета');
assert.equal(data.records.find(record => record.sourceCell === 'A12').group, 'Банковские счета');
assert.notEqual(data.records.find(record => record.sourceCell === 'A23').division, data.records.find(record => record.sourceCell === 'A12').division);

console.log('ТОП-КП data: 136 cards, 5 blocks, 23 divisions, source names and missing values verified.');

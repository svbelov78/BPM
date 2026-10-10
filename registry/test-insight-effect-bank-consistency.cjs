/* Every responding bank assesses all authored effects in the opinion demos.
 * Offline regression coverage for source data, the shared table projection and
 * conservative repair of unchanged legacy demo responses. No user browser is
 * opened and snapshot reads never write or reset stored data.
 * Run: node registry/test-insight-effect-bank-consistency.cjs
 * Optional DOM/layout checks: node registry/test-insight-effect-bank-consistency.cjs --browser [index.html | standalone.html] */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KEY = 'bpm-insight-store:v1';
const ids = ['INS-000056','INS-000055','INS-000054','INS-000052','INS-000051'];
const qualityAnswer = {id:'quality',applicable:true,comment:'Ожидаемый эффект для нашего банка подтверждаем.'};
const json = value => JSON.parse(JSON.stringify(value));
const snapshot = rows => JSON.stringify({version:1,rows});
const sources = ['insight-workflow.js','insight-data.js','insight-store.js','insight-detail.js']
  .map(name => ({name,source:fs.readFileSync(path.join(__dirname,name),'utf8')}));
const tests = [];
const test = (name,run) => tests.push({name,run});
function environment(saved) {
  const storage = new Map(saved === undefined ? [] : [[KEY,saved]]), writes = [], events = new Map();
  const localStorage = {
    getItem:key => storage.get(key) ?? null,
    setItem(key,value) {storage.set(key,value); writes.push({key,value});}
  };
  const context = vm.createContext({localStorage,addEventListener:(type,handler) => events.set(type,handler)});
  vm.runInContext(`window=globalThis;
    BPM_DATA=[{entity:'processes',id:'p1',number:1,title:'Проверка документов'},{entity:'paths',id:'cp1',title:'Обслуживание клиента'}];
    BpmTaskStore={currentUser:'Тестовый Автор'};`,context);
  sources.forEach(file => vm.runInContext(file.source,context,{filename:file.name}));
  const run = code => vm.runInContext(code,context);
  const get = id => json(run(`BpmInsightStore.get(${JSON.stringify(id)})`));
  const list = () => json(run('BpmInsightStore.list()'));
  const tables = id => json(run(`(() => {
    const row=BpmInsightStore.get(${JSON.stringify(id)});
    return row.detail.effects.map((effect,index) => BpmInsightDetail.effectTableModel(row,effect,index));
  })()`));
  return {storage,writes,run,get,list,tables,
    seed:() => json(run('BPM_INSIGHT_DATA')),
    emit(value) {events.get('storage')({key:KEY,newValue:value,storageArea:localStorage});}};
}
function legacyRows() {
  const rows = environment().seed();
  rows.forEach(row => {
    if (!ids.includes(row.id)) return;
    row.detail.workflow.opinions.responses.forEach(response => {
      response.effects = response.effects.filter(effect => effect.id === 'time');
    });
  });
  return rows;
}
function responses(row) {return row.detail.workflow.opinions.responses;}
function assertRoster(env,id) {
  const row = env.get(id), expected = [row.bank,...responses(row).map(response => response.bank)];
  for (const [index,table] of env.tables(id).entries()) {
    assert.deepEqual(table.rows.map(item => item.bank),expected,`${id}: effect ${index + 1} includes author and the same respondent banks`);
    assert.equal(new Set(table.rows.map(item => item.bank)).size,expected.length,`${id}: no duplicate banks`);
    assert.equal(table.rows[0].isAuthor,true,`${id}: author stays first`);
    assert.equal(table.active,expected.length,`${id}: applicability count agrees with its complete roster`);
    assert.equal(table.inactive,0,`${id}: no invented negative answers`);
  }
}

test('all five mixed-effect seeds contain one quantitative and one qualitative answer per respondent',() => {
  const env = environment(), before = env.seed();
  for (const id of ids) {
    const row = env.get(id);
    assert.deepEqual(row.detail.effects.map(effect => effect.id),['time','quality']);
    assert.equal(responses(row).length,id === 'INS-000052' ? 2 : 3);
    responses(row).forEach((response,index) => {
      assert.deepEqual(response.effects.map(effect => effect.id),['time','quality'],`${id}: ${response.bank} assesses both authored effects`);
      assert.deepEqual(response.effects[1],qualityAnswer,`${id}: qualitative assessment has only applicability and comment`);
      assert.equal(response.effects[0].current,String(90 + 15 * index),`${id}: seeded quantitative value retained`);
      assert.equal(response.effects[0].target,'30');
      assert.equal(response.effects[0].unit,'мин.');
    });
  }
  assert.deepEqual(env.seed(),before,'Projection and reads never alter frozen seeds');
  assert.equal(env.writes.length,0);
});

test('every shared effect-table projection shows the same author-plus-respondent roster',() => {
  const env = environment();
  ids.forEach(id => assertRoster(env,id));
  assert.equal(env.tables('INS-000054')[1].rows.length,4,'The reported qualitative effect contains the same four banks');
});

test('exact old demo responses migrate on read without writing or resetting their stored snapshot',() => {
  const rows = legacyRows(), saved = snapshot(rows), env = environment(saved), expected = environment().list();
  assert.deepEqual(env.list(),expected,'Only missing seeded qualitative responses are repaired');
  assert.equal(env.storage.get(KEY),saved,'The original snapshot is preserved byte-for-byte until a user change');
  assert.equal(env.writes.length,0,'Loading a snapshot is read-only');
  for (const id of ids) {
    const original = rows.find(row => row.id === id), restored = env.get(id);
    assert.deepEqual(restored.detail.effects,original.detail.effects,'Author questions and baseline values are unchanged');
    assert.deepEqual(restored.detail.history,original.detail.history,'Migration adds no fabricated history entries');
    assert.deepEqual(responses(restored).map(response => ({...response,effects:response.effects.filter(effect => effect.id === 'time')})),responses(original),'Existing response text, identity, dates and metrics are unchanged');
    assertRoster(env,id);
  }
});

test('unrelated user edits survive while unchanged legacy demo assessments are repaired',() => {
  const rows = legacyRows(), row = rows.find(item => item.id === 'INS-000054');
  Object.assign(row,{title:'Мой уточнённый заголовок',rating:2.5,updatedAt:'2026-10-10T12:34:56.000Z'});
  row.detail.comments.push({author:'Пользователь',date:'10.10.2026',text:'Сохранить пользовательский комментарий'});
  row.comments = row.detail.comments.length;
  row.detail.history.unshift({date:'10.10.2026',text:'Пользовательское уточнение'});
  row.detail.taskIds.push('Пользовательская связанная задача');
  row.detail.userRating = 2;
  const expected = json(row);
  responses(expected).forEach(response => response.effects.push(json(qualityAnswer)));
  const saved = snapshot(rows), env = environment(saved);
  assert.deepEqual(env.get(row.id),expected,'The targeted response repair preserves all unrelated user data');
  assert.equal(env.storage.get(KEY),saved);
  assert.equal(env.writes.length,0);
});

test('any changed response identity, text, date, applicability or metric prevents seed repair of that response only',() => {
  const changes = [
    ['bank',response => {response.bank = 'Пользовательский банк';}],
    ['person',response => {response.person = 'Пользовательский представитель';}],
    ['actorId',response => {response.actorId = 'user-actor';}],
    ['reproduction',response => {response.reproduction = 'Не воспроизводится';}],
    ['comment',response => {response.comment = 'Пользовательское мнение';}],
    ['createdAt',response => {response.createdAt = '2026-10-01';}],
    ['updatedAt',response => {response.updatedAt = '2026-10-10';}],
    ['current',response => {response.effects[0].current = '777';}],
    ['target',response => {response.effects[0].target = '22';}],
    ['unit',response => {response.effects[0].unit = 'сек.';}],
    ['applicable',response => {response.effects[0].applicable = false;}],
    ['effect comment',response => {response.effects[0].comment = 'Пользовательский расчёт';}],
    ['extra response field',response => {response.userMarker = 'Не трогать';}],
    ['extra effect field',response => {response.effects[0].userMarker = 'Не трогать';}],
    ['missing answer',response => {response.effects = [];}],
    ['absent effects',response => {delete response.effects;}]
  ];
  for (const [label,change] of changes) {
    const rows = legacyRows(), row = rows.find(item => item.id === 'INS-000054');
    change(responses(row)[0]);
    const before = json(responses(row)[0]), saved = snapshot(rows), env = environment(saved), after = responses(env.get(row.id));
    assert.deepEqual(after[0],before,`${label}: a user response is not completed from demonstration answers`);
    after.slice(1).forEach(response => assert.deepEqual(response.effects[1],qualityAnswer,`${label}: untouched peer response is still repaired`));
    assert.equal(env.storage.get(KEY),saved,`${label}: storage remains untouched`);
    assert.equal(env.writes.length,0);
  }
});

test('already supplied qualitative answers retain their actual values and comments',() => {
  const rows = legacyRows(), row = rows.find(item => item.id === 'INS-000054');
  const custom = {id:'quality',applicable:false,comment:'Пользовательский ответ: эффект не актуален.'};
  responses(row)[0].effects.push(custom);
  responses(row)[1].effects.push({id:'quality',applicable:true,comment:'Сохранённый пользовательский ответ.'});
  const before = json(responses(row).slice(0,2)), env = environment(snapshot(rows)), after = responses(env.get(row.id));
  assert.deepEqual(after.slice(0,2),before,'Existing complete responses are never rewritten');
  assert.deepEqual(after[2].effects[1],qualityAnswer,'The remaining exact old response alone is repaired');
  assert.equal(env.writes.length,0);
});

test('changed author questions, metrics, order or effect set block demonstration completion',() => {
  const changes = [
    ['title',effects => {effects[1].title = 'Другая качественная оценка';}],
    ['description',effects => {effects[1].description = 'Изменённый смысл эффекта';}],
    ['type',effects => {effects[1].type = 'Количественный';}],
    ['id',effects => {effects[1].id = 'user-quality';}],
    ['current',effects => {effects[0].current = '999';}],
    ['target',effects => {effects[0].target = '77';}],
    ['unit',effects => {effects[0].unit = 'сек.';}],
    ['baseline',effects => {effects[0].baselineCurrent = '555';}],
    ['comment',effects => {effects[1].comment = 'Пользовательское пояснение';}],
    ['applicability',effects => {effects[1].applicable = true;}],
    ['order',effects => {effects.reverse();}],
    ['removed effect',effects => {effects.splice(1,1);}],
    ['additional effect',effects => {effects.push({id:'user-effect',type:'Качественный',title:'Новый вопрос',applicable:true});}]
  ];
  for (const [label,change] of changes) {
    const rows = legacyRows(), row = rows.find(item => item.id === 'INS-000054');
    change(row.detail.effects);
    const before = json(row), saved = snapshot(rows), env = environment(saved);
    assert.deepEqual(env.get(row.id),before,`${label}: no demo assessment is invented for modified author effects`);
    assert.equal(env.storage.get(KEY),saved);
    assert.equal(env.writes.length,0);
  }
});

test('changed source or author bank and normalized author effects retain their saved responses conservatively',() => {
  const changes = [
    ['author bank',row => {row.bank = 'Пользовательский банк автора';}],
    ['source',row => {row.source = 'SberBPM ЦА';}],
    ['normalized author effects',row => {
      const env = environment();
      row.detail.effects = json(env.run(`BpmInsightDetail.initialDetail(${JSON.stringify(row)}).effects`));
    }]
  ];
  for (const [label,change] of changes) {
    const rows = legacyRows(), row = rows.find(item => item.id === 'INS-000054');
    change(row);
    const before = json(row), saved = snapshot(rows), env = environment(saved), after = env.get(row.id);
    assert.deepEqual(after.detail.effects,before.detail.effects,`${label}: author fields are preserved`);
    assert.deepEqual(responses(after),responses(before),`${label}: exact authored-model guards prevent demo completion`);
    assert.equal(after.bank,before.bank);
    assert.equal(after.source,before.source);
    assert.equal(env.storage.get(KEY),saved);
    assert.equal(env.writes.length,0);
  }
});

test('local records including seed ID collisions never receive demonstration assessments',() => {
  const rows = legacyRows(), collision = rows.find(item => item.id === 'INS-000054');
  collision.local = true;
  collision.title = 'Локальная запись с совпавшим демонстрационным ID';
  const local = {...json(collision),id:'INS-000079',code:'INS-000079',title:'Самостоятельный пользовательский инсайт'};
  rows.push(local);
  const saved = snapshot(rows), env = environment(saved);
  assert.deepEqual(env.get(collision.id),collision,'A local collision keeps user data');
  assert.deepEqual(env.get(local.id),local,'A genuinely local insight keeps user data');
  assert.equal(env.storage.get(KEY),saved);
  assert.equal(env.writes.length,0);
});

test('repair is idempotent on repeated storage events and corrected snapshot reloads',() => {
  const saved = snapshot(legacyRows()), env = environment(saved), corrected = env.list();
  env.emit(saved); env.emit(saved);
  assert.deepEqual(env.list(),corrected,'Repeated old-snapshot events produce the same repaired session');
  assert.equal(env.writes.length,0,'Cross-tab snapshot reads do not persist migrations');
  const correctedSnapshot = snapshot(corrected), reloaded = environment(correctedSnapshot);
  assert.deepEqual(reloaded.list(),corrected,'Corrected snapshots neither duplicate nor change assessments');
  assert.equal(reloaded.storage.get(KEY),correctedSnapshot);
  assert.equal(reloaded.writes.length,0);
  ids.forEach(id => assertRoster(reloaded,id));
});

test('a subsequent explicit user update persists the repaired responses once and reloads without further changes',() => {
  const env = environment(snapshot(legacyRows()));
  env.run(`BpmInsightStore.update('INS-000054',{title:'Явное пользовательское изменение после загрузки'})`);
  assert.equal(env.writes.length,1,'The explicit user update is the sole snapshot write');
  const saved = env.storage.get(KEY), reloaded = environment(saved);
  assert.deepEqual(reloaded.list(),env.list(),'The explicit update persists the repaired snapshot coherently');
  assert.equal(reloaded.get('INS-000054').title,'Явное пользовательское изменение после загрузки');
  ids.forEach(id => assertRoster(reloaded,id));
  assert.equal(reloaded.writes.length,0);
});

let failures = 0;
for (const {name,run} of tests) {
  try {run(); console.log(`✓ ${name}`);}
  catch (error) {failures++; console.error(`✗ ${name}\n${error.stack}`);}
}
console.log(`\n${tests.length - failures}/${tests.length} passed`);
if (failures) process.exitCode = 1;

async function browserCheck() {
  const os = require('node:os');
  const {pathToFileURL} = require('node:url');
  const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const args = process.argv.slice(2), output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-effect-bank-consistency-'));
  let source = path.resolve(args.find(arg => !arg.startsWith('--')) || path.join(__dirname,'index.html'));
  const standalone = path.basename(source) !== 'index.html';
  // Standalone files use file-origin storage. Rename into a disposable folder
  // so this regression never touches the actual prototype's persisted data.
  if (standalone) {const copy = path.join(output,'isolated-prototype.html'); fs.copyFileSync(source,copy); source = copy;}
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1440,height:1400},offline:true,reducedMotion:'reduce'});
  const page = await context.newPage(), errors = [], failed = [];
  const host = '#insights-detail-view';
  page.setDefaultTimeout(15000);
  page.on('pageerror',error => errors.push(error.message));
  page.on('requestfailed',request => failed.push(request.url()));
  const ready = () => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
  const paint = () => page.evaluate(async () => {await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));});
  async function open() {
    await page.locator('#insights-results [data-insight-open="INS-000054"]').click();
    await page.locator(`${host}[data-insight-id="INS-000054"]`).waitFor();
    await paint();
  }
  async function checkTables(label) {
    const shapes = await page.locator(`${host} .id-detail-effect`).evaluateAll(nodes => nodes.map(section => ({
      headings:[...section.querySelectorAll('thead th')].map(node => node.textContent.trim()),
      counts:section.querySelector('[data-id-effect-counts]').textContent.trim(),
      rows:[...section.querySelectorAll('tbody tr')].map(row => ({bank:row.cells[0].querySelector('strong').textContent.trim(),person:row.cells[0].querySelector('small').textContent.trim(),applicable:row.cells[1].textContent.trim(),cells:row.cells.length,author:row.hasAttribute('data-id-effect-author')})),
      metrics:section.querySelectorAll('[data-id-field$=":current"],[data-id-field$=":target"],.id-detail-unit').length,
      metadata:[...section.querySelectorAll('.id-detail-effect-values .internal-label')].map(node => node.textContent.trim()),
      choices:section.querySelectorAll('[data-id-applicable]').length
    })));
    assert.equal(shapes.length,2,`${label}: the actual insight has both effects`);
    const expected = ['Байкальский банк','Уральский банк','Сибирский банк','Среднерусский банк'];
    for (const [index,shape] of shapes.entries()) {
      assert.equal(shape.rows.length,4,`${label}: effect ${index + 1} has four actual rows`);
      assert.deepEqual(shape.rows.map(row => row.bank),expected,`${label}: effect ${index + 1} contains the complete responding roster`);
      assert.equal(shape.rows[0].author,true);
      assert.equal(shape.rows[0].person,'Автор инсайта');
      assert.equal(shape.counts,'(Актуальных 4, Неактуальных 0)',`${label}: counters match actual answers`);
      assert.ok(shape.rows.every(row => row.applicable === 'Да'));
      assert.ok(shape.rows.every(row => row.cells === (index === 0 ? 6 : 3)));
      assert.equal(shape.choices,0,`${label}: process-owner review has no assessment controls`);
    }
    assert.deepEqual(shapes[0].rows.map(({bank,person}) => ({bank,person})),shapes[1].rows.map(({bank,person}) => ({bank,person})),`${label}: banks and representatives match between effect tables`);
    assert.deepEqual(shapes[1].headings,['Территориальный банк','Актуальность','Комментарий']);
    assert.deepEqual(shapes[1].metadata,['Тип эффекта']);
    assert.equal(shapes[1].metrics,0,`${label}: qualitative rows have no numeric fields or units`);
  }
  try {
    await page.goto(pathToFileURL(source).href+'#insights'); await ready(); await open();
    for (const width of [390,1440,3268]) {
      await page.setViewportSize({width,height:width === 3268 ? 2018 : 1400}); await paint();
      await checkTables(`fresh/${width}px`);
      const overflow = await page.locator(`${host} .id-detail-scroll`).evaluate(node => ({page:document.documentElement.scrollWidth,viewport:innerWidth,detail:node.scrollWidth,client:node.clientWidth}));
      assert.ok(overflow.page <= overflow.viewport + 1 && overflow.detail <= overflow.client + 1,`${width}px: table overflow stays local ${JSON.stringify(overflow)}`);
      await page.locator(`${host} .id-detail-effects`).scrollIntoViewIfNeeded(); await paint();
      if (width === 3268) await page.locator(`${host} .id-detail-effects`).screenshot({path:path.join(output,'INS-000054-four-banks-effects.png'),animations:'disabled'});
      else await page.screenshot({path:path.join(output,`INS-000054-${width}.png`),animations:'disabled'});
    }
    // Exercise real saved prototype data rather than substituting a display
    // fixture: only recreate the old seed omission in this isolated context.
    const before = await page.evaluate(() => BpmInsightStore.list());
    const legacy = json(before);
    legacy.forEach(row => {
      if (!ids.includes(row.id)) return;
      responses(row).forEach(response => {response.effects = response.effects.filter(effect => effect.id !== 'quality');});
    });
    const saved = snapshot(legacy);
    await page.evaluate(({key,value}) => localStorage.setItem(key,value),{key:KEY,value:saved});
    await page.reload(); await ready(); await open();
    assert.deepEqual(await page.evaluate(() => BpmInsightStore.list()),before,'Actual browser reload repairs exact old demos coherently');
    assert.equal(await page.evaluate(key => localStorage.getItem(key),KEY),saved,'Actual browser load leaves the old snapshot unchanged');
    await checkTables('legacy snapshot reload');
    await page.locator(`${host} .id-detail-effects`).scrollIntoViewIfNeeded(); await paint();
    await page.locator(`${host} .id-detail-effects`).screenshot({path:path.join(output,'INS-000054-migrated-four-banks-effects.png'),animations:'disabled'});
    assert.deepEqual(errors,[],'No browser runtime errors');
    assert.deepEqual(failed,[],'The actual prototype and its assets work offline');
    console.log(`PASS — actual INS-000054: four matching banks/people in both effects, qualitative three-column shape, exact legacy reload, 390–3268px local overflow. Screenshots: ${output}`);
    console.log(JSON.stringify({source,standalone,output}));
  } catch (error) {
    await page.screenshot({path:path.join(output,'failure.png')}).catch(() => {});
    console.error(`Screenshots: ${output}`);
    throw error;
  } finally {await context.close(); await browser.close();}
}
if (process.argv.includes('--browser') && !failures) browserCheck().catch(error => {console.error(error); process.exitCode = 1;});

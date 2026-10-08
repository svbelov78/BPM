/* Offline BRD-007 business-rule and persistence tests. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KEY = 'bpm-insight-store:v1';
const files = ['insight-workflow.js','insight-data.js','insight-store.js'].map(name => ({name,source:fs.readFileSync(path.join(__dirname,name),'utf8')}));
const json = value => JSON.parse(JSON.stringify(value));
function environment(saved) {
  const storage = new Map(saved ? [[KEY,saved]] : []), writes = [];
  const context = vm.createContext({localStorage:{getItem:key => storage.get(key) || null,setItem:(key,value) => {storage.set(key,value);writes.push(value);}},addEventListener:() => {}});
  vm.runInContext(`window=globalThis; BPM_DATA=[{entity:'processes',id:'p1',number:1,title:'Проверка документов'},{entity:'paths',id:'cp1',title:'Обслуживание клиента'}]; BpmTaskStore={currentUser:'Тестовый Автор'};`,context);
  files.forEach(file => vm.runInContext(file.source,context,{filename:file.name}));
  return {context,storage,writes,run:code => vm.runInContext(code,context),get:id => json(vm.runInContext(`BpmInsightStore.get(${JSON.stringify(id)})`,context))};
}
const tests = [], test = (name,run) => tests.push({name,run});
const decide = (env,id,options) => json(env.run(`BpmInsightStore.update(${JSON.stringify(id)},BpmInsightWorkflow.decide(BpmInsightStore.get(${JSON.stringify(id)}),${JSON.stringify(options)}))`));
const team = (env,id,options) => json(env.run(`BpmInsightStore.update(${JSON.stringify(id)},BpmInsightWorkflow.decideTeam(BpmInsightStore.get(${JSON.stringify(id)}),${JSON.stringify(options)}))`));
const opinion = (env,id,options) => json(env.run(`BpmInsightStore.update(${JSON.stringify(id)},BpmInsightWorkflow.saveOpinion(BpmInsightStore.get(${JSON.stringify(id)}),${JSON.stringify(options)}))`));

test('six exact canonical statuses and metadata tones',() => {
  const env = environment();
  assert.deepEqual(json(env.run('BpmInsightWorkflow.statuses')),['Новый','Согласовано','Мнения собраны','Отклонено','В работе','Реализовано']);
  assert.deepEqual(json(env.run('BpmInsightWorkflow.statuses.map(s=>BpmInsightWorkflow.statusMetadata[s].tone)')),['blue','indigo','indigo','red','indigo','green']);
  assert.deepEqual(json(env.run(`['Выполняется','Выполнено','Отклонён'].map(BpmInsightWorkflow.canonicalize)`)),['В работе','Реализовано','Отклонено']);
});
test('demo covers all routes and statuses while preserving original IDs',() => {
  const env = environment(), rows = json(env.run('BpmInsightStore.list()'));
  assert.equal(rows.length,16);
  ['INS-000078','INS-000067','INS-000044','INS-000042','INS-000016','INS-000009'].forEach(id => assert.ok(rows.some(row => row.id === id)));
  assert.equal(new Set(rows.map(row => row.status)).size,6);
  assert.equal(env.get('INS-000057').detail.workflow.route,'one-stage');
  assert.equal(env.get('INS-000056').detail.workflow.route,'auto');
  rows.filter(row => row.source === 'ТБ').forEach(row => assert.ok(row.bank));
  assert.ok(rows.every(row => row.source !== 'Голос территорий'));
});
test('first director rejection keeps New and original deadline, removes only own right',() => {
  const env = environment(), before = env.get('INS-000060');
  const row = decide(env,before.id,{decision:'reject',comment:'Нужны данные о количестве обращений.',now:'2026-10-08'});
  assert.equal(row.status,'Новый');
  assert.equal(row.detail.workflow.stage,'directors');
  assert.equal(row.detail.workflow.stages[0].status,'current');
  assert.equal(row.detail.workflow.stages[0].dueDate,before.detail.workflow.stages[0].dueDate);
  assert.equal(row.needsApproval,false);
  assert.equal(env.run(`BpmInsightWorkflow.canApprove(BpmInsightStore.get('${row.id}'),BpmInsightStore.get('${row.id}').detail.workflow.stages[0].actors[1])`),true);
  assert.throws(() => decide(env,row.id,{decision:'approve'}),/недоступно/);
  assert.equal(row.comments,before.comments + 1);
  assert.equal(row.detail.comments.at(-1).text,'Нужны данные о количестве обращений.');
});
test('second director approval after rejection opens chair stage and seven-day deadline',() => {
  const env = environment(), row = decide(env,'INS-000059',{decision:'approve',now:'2026-10-08'});
  assert.equal(row.status,'Новый');
  assert.equal(row.detail.workflow.stage,'chair');
  assert.equal(row.detail.workflow.stages[0].status,'approved');
  assert.equal(row.detail.workflow.stages[0].decisions.length,2);
  assert.equal(row.detail.workflow.stages[1].dueDate,'2026-10-15');
  assert.equal(row.needsApproval,false);
});
test('two director rejections close the insight',() => {
  const env = environment(), row = decide(env,'INS-000059',{decision:'reject',comment:'Данные пока недостаточны.',now:'2026-10-08'});
  assert.equal(row.status,'Отклонено');
  assert.equal(row.detail.workflow.stage,'complete');
  assert.equal(row.rejection,'Данные пока недостаточны.');
  assert.equal(row.needsApproval,false);
});
test('one director approval is sufficient and no other director can decide afterward',() => {
  const env = environment(), row = decide(env,'INS-000060',{decision:'approve',now:'2026-10-08'});
  assert.equal(row.status,'Новый');
  assert.equal(row.detail.workflow.stages[0].decisions.length,1);
  assert.equal(env.run(`BpmInsightWorkflow.canApprove(BpmInsightStore.get('${row.id}'),BpmInsightStore.get('${row.id}').detail.workflow.stages[0].actors[1])`),false);
});
test('final approval immediately starts opinion stage and first final decision closes both alternatives',() => {
  const env = environment(), row = decide(env,'INS-000058',{decision:'approve',now:'2026-10-08'});
  assert.equal(row.status,'Согласовано');
  assert.equal(row.detail.workflow.opinions.dueDate,'2026-10-15');
  assert.equal(row.detail.workflow.stage,'complete');
  assert.equal(row.detail.workflow.stages[1].decisions.length,1);
  assert.throws(() => decide(env,row.id,{decision:'reject',comment:'Поздно',actor:row.detail.workflow.stages[1].actors[1]}),/уже принято/);
});
test('final rejection immediately rejects the one-stage route',() => {
  const env = environment(), row = decide(env,'INS-000057',{decision:'reject',comment:'Нужна другая маршрутизация.',now:'2026-10-08'});
  assert.equal(row.status,'Отклонено');
  assert.equal(row.detail.workflow.stages.length,1);
  assert.equal(row.detail.workflow.stages[0].status,'rejected');
});
test('rejection requires a nonblank comment and invalid decisions never mutate the store',() => {
  const env = environment(), before = env.get('INS-000060');
  for (const comment of ['', '  ',null]) assert.throws(() => decide(env,before.id,{decision:'reject',comment}),/Комментарий обязателен/);
  assert.throws(() => decide(env,before.id,{decision:'maybe'}),/Выберите решение/);
  assert.deepEqual(env.get(before.id),before);
  assert.equal(env.writes.length,0);
});
test('approval checks bank, assigned actor, current stage, and does not auto-expire overdue stages',() => {
  const env = environment(), row = env.get('INS-000060'), actor = row.detail.workflow.currentActor;
  assert.equal(env.run(`BpmInsightWorkflow.canApprove(BpmInsightStore.get('${row.id}'),${JSON.stringify({...actor,bank:'Чужой банк'})})`),false);
  assert.equal(env.run(`BpmInsightWorkflow.canApprove(BpmInsightStore.get('${row.id}'),${JSON.stringify({...actor,id:'unassigned'})})`),false);
  assert.equal(decide(env,row.id,{decision:'approve',now:'2027-01-10'}).status,'Новый');
});
test('team decision is limited to collected TB opinions or new non-TB and locks later opinions',() => {
  const env = environment();
  assert.equal(env.run(`BpmInsightWorkflow.canDecideTeam(BpmInsightStore.get('INS-000054'))`),true);
  assert.equal(env.run(`BpmInsightWorkflow.canDecideTeam(BpmInsightStore.get('INS-000009'))`),true);
  assert.equal(env.run(`BpmInsightWorkflow.canDecideTeam(BpmInsightStore.get('INS-000060'))`),false);
  const row = team(env,'INS-000054',{decision:'accept',now:'2026-10-08'});
  assert.equal(row.status,'В работе');
  assert.equal(env.run(`BpmInsightWorkflow.isOpinionOpen(BpmInsightStore.get('${row.id}'))`),false);
  assert.throws(() => team(env,row.id,{decision:'accept'}),/уже принято/);
  assert.equal(team(env,'INS-000009',{decision:'reject',comment:'Предложение дублирует активную задачу.'}).status,'Отклонено');
});
test('author editing ends after any approval decision, even a first rejection',() => {
  const env = environment(), row = env.get('INS-000060');
  const actor = {id:'author',name:row.author,bank:row.bank,role:'Сотрудник ПСС ТБ'};
  assert.equal(env.run(`BpmInsightWorkflow.canEditAuthor(BpmInsightStore.get('${row.id}'),${JSON.stringify(actor)})`),true);
  decide(env,row.id,{decision:'reject',comment:'Нужны расчёты.'});
  assert.equal(env.run(`BpmInsightWorkflow.canEditAuthor(BpmInsightStore.get('${row.id}'),${JSON.stringify(actor)})`),false);
});
test('opinions use one response per bank, remain editable after collection, and retain author values',() => {
  const env = environment(), before = env.get('INS-000055');
  const sent = opinion(env,before.id,{reproduction:'Воспроизводится',comment:'Подтверждаем.',effects:[{id:'time',applicable:true,current:'60',target:'30',unit:'мин.'}],now:'2026-10-08'});
  assert.equal(sent.detail.workflow.opinions.responses.length,4);
  assert.equal(sent.needsOpinion,false);
  assert.deepEqual(sent.detail.effects,before.detail.effects);
  const updated = opinion(env,before.id,{reproduction:'Частично',comment:'Уточнено.',effects:[],now:'2026-10-13'});
  assert.equal(updated.status,'Мнения собраны');
  assert.equal(updated.detail.workflow.opinions.responses.length,4);
  assert.equal(updated.detail.workflow.opinions.responses.at(-1).comment,'Уточнено.');
  assert.equal(env.run(`BpmInsightWorkflow.canEditOpinion(BpmInsightStore.get('${before.id}'))`),true);
});
test('opinion validation checks equal metrics, missing units and clears own effects for nonreproduction',() => {
  const env = environment(), before = env.get('INS-000055');
  for (const effects of [[{id:'time',applicable:true,current:'60',target:'60',unit:'мин.'}],[{id:'time',applicable:true,current:'60',target:'30',unit:''}],[{id:'time',applicable:true,current:'oops',target:'30',unit:'мин.'}]]) {
    assert.throws(() => opinion(env,before.id,{reproduction:'Воспроизводится',effects}));
  }
  assert.deepEqual(env.get(before.id),before);
  const row = opinion(env,before.id,{reproduction:'Не воспроизводится',effects:[{id:'time',current:'50'}]});
  assert.deepEqual(row.detail.workflow.opinions.responses.at(-1).effects,[]);
  assert.deepEqual(row.detail.workflow.opinions.responses[0],before.detail.workflow.opinions.responses[0]);
});
test('creation chooses route by author role and chair author is autoapproved',() => {
  const env = environment();
  const employee = json(env.run(`BpmInsightStore.create({title:'Создан сотрудником',source:'ТБ',bank:'Уральский банк'})`));
  assert.equal(employee.detail.workflow.route,'two-stage');
  assert.equal(employee.status,'Новый');
  assert.equal(employee.detail.workflow.currentActor.name,'Тестовый Автор');
  const director = json(env.run(`BpmInsightStore.create({title:'Создан директором',source:'ТБ',bank:'Уральский банк',detail:{workflow:{authorRole:'Директор ПСС ТБ',stages:[]}}})`));
  assert.equal(director.detail.workflow.route,'one-stage');
  const chair = json(env.run(`BpmInsightStore.create({title:'Создан председателем',source:'ТБ',bank:'Уральский банк',detail:{workflow:{authorRole:'Председатель ТБ',stages:[]}}})`));
  assert.equal(chair.status,'Согласовано');
  assert.equal(chair.detail.workflow.stages.length,0);
});
test('legacy persisted rows migrate without overwrite and new demo rows merge by ID',() => {
  const base = environment(), legacy = json(base.run('BpmInsightStore.list()')).filter(row => ['INS-000078','INS-000067','INS-000044','INS-000042','INS-000016','INS-000009'].includes(row.id));
  legacy.forEach(row => {delete row.detail.workflow;});
  legacy[0].title = 'Мой сохранённый заголовок'; legacy[0].detail.comments = [{author:'Вы',date:'01.10.2026',text:'Сохранить'}];
  legacy[1].status = 'Выполняется'; legacy[2].source = 'Голос территорий'; legacy[3].status = 'Выполнено';
  const local = {...legacy[0],id:'INS-000079',code:'INS-000079',local:true,title:'Мой локальный инсайт'};
  const snapshot = JSON.stringify({version:1,rows:[...legacy,local]}), env = environment(snapshot);
  assert.equal(env.run('BpmInsightStore.list().length'),17);
  assert.equal(env.get('INS-000078').title,'Мой сохранённый заголовок');
  assert.deepEqual(env.get('INS-000078').detail.comments,legacy[0].detail.comments);
  assert.equal(env.get('INS-000067').status,'В работе');
  assert.equal(env.get('INS-000044').source,'ТБ');
  assert.equal(env.get('INS-000042').status,'Реализовано');
  assert.equal(env.get(local.id).title,local.title);
  assert.equal(env.storage.get(KEY),snapshot);
  assert.equal(env.writes.length,0);
});
test('decisions survive reload and model output is an isolated copy',() => {
  const env = environment(), row = decide(env,'INS-000059',{decision:'approve',comment:'Подтверждаю.'});
  const restored = environment(env.storage.get(KEY));
  assert.deepEqual(restored.get(row.id),row);
  restored.run(`copy=BpmInsightWorkflow.getWorkflow(BpmInsightStore.get('${row.id}')); copy.stages[0].decisions=[];`);
  assert.equal(restored.get(row.id).detail.workflow.stages[0].decisions.length,2);
});
let failures = 0;
for (const {name,run} of tests) {try {run();console.log(`✓ ${name}`);} catch(error) {failures++;console.error(`✗ ${name}\n${error.stack}`);}}
console.log(`\n${tests.length - failures}/${tests.length} passed`);
if (failures) process.exitCode = 1;

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
const effectAnswers = (row, overrides = {}) => row.detail.effects.map((effect,index) => {
  const id = String(effect.id ?? `effect-${index}`);
  return {id,applicable:false,...overrides[id]};
});

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
test('accepting through a created task persists the decision and task linkage without duplicate IDs',() => {
  const env = environment(), before = env.get('INS-000009');
  env.run(`BpmInsightStore.update('${before.id}',{detail:{taskIds:['existing-task','ТЗ-2026-000101']}})`);
  const row = team(env,before.id,{decision:'accept',taskId:'ТЗ-2026-000101',now:'2026-10-09'});
  assert.equal(row.status,'В работе');
  assert.equal(row.detail.workflow.teamDecision.taskId,'ТЗ-2026-000101');
  assert.deepEqual(row.detail.taskIds,['existing-task','ТЗ-2026-000101']);
  assert.match(row.detail.history[0].text,/Создана задача: ТЗ-2026-000101/);
  assert.deepEqual(row.detail.effects,before.detail.effects);
  const restored = environment(env.storage.get(KEY)).get(row.id);
  assert.equal(restored.detail.workflow.teamDecision.taskId,'ТЗ-2026-000101');
  assert.deepEqual(restored.detail.taskIds,row.detail.taskIds);
  assert.throws(() => team(env,row.id,{decision:'accept',taskId:'another-task'}),/уже принято/);
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
  const sent = opinion(env,before.id,{reproduction:'Воспроизводится',comment:'Подтверждаем.',effects:effectAnswers(before,{time:{applicable:true,current:'60',target:'30',unit:'мин.'}}),now:'2026-10-08'});
  assert.equal(sent.detail.workflow.opinions.responses.length,4);
  assert.equal(sent.needsOpinion,false);
  assert.deepEqual(sent.detail.effects,before.detail.effects);
  const updated = opinion(env,before.id,{reproduction:'Частично',comment:'Уточнено.',effects:effectAnswers(before),now:'2026-10-13'});
  assert.equal(updated.status,'Мнения собраны');
  assert.equal(updated.detail.workflow.opinions.responses.length,4);
  assert.equal(updated.detail.workflow.opinions.responses.at(-1).comment,'Уточнено.');
  assert.equal(env.run(`BpmInsightWorkflow.canEditOpinion(BpmInsightStore.get('${before.id}'))`),true);
});
test('opinion validation checks equal metrics, missing units and clears own effects for nonreproduction',() => {
  const env = environment(), before = env.get('INS-000055');
  for (const effect of [{applicable:true,current:'60',target:'60',unit:'мин.'},{applicable:true,current:'60',target:'30',unit:''},{applicable:true,current:'oops',target:'30',unit:'мин.'}]) {
    assert.throws(() => opinion(env,before.id,{reproduction:'Воспроизводится',effects:effectAnswers(before,{time:effect})}));
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
test('participants include only recorded approvals, deduplicate actors and never mutate history',() => {
  const env = environment();
  const participants = id => json(env.run(`BpmInsightWorkflow.getParticipants(BpmInsightStore.get(${JSON.stringify(id)}))`));
  assert.equal(participants('INS-000060').length,2,'Pending approvers are not participants');
  decide(env,'INS-000060',{decision:'reject',comment:'Нужен расчёт.'});
  assert.equal(participants('INS-000060').length,2,'Rejecting is not approval');
  const row = decide(env,'INS-000058',{decision:'approve',now:'2026-10-09'});
  const approvals = row.detail.workflow.stages.flatMap(stage => stage.decisions).filter(item => item.decision === 'approve');
  assert.deepEqual(participants(row.id).slice(2),approvals.map(item => ({name:item.actorName,role:`Согласующий · ${item.role}`})));
  assert.deepEqual(env.get(row.id),row,'Reading participants leaves decisions and history unchanged');
  const restored = environment(env.storage.get(KEY));
  assert.deepEqual(json(restored.run(`BpmInsightWorkflow.getParticipants(BpmInsightStore.get('${row.id}'))`)),participants(row.id));
  const repeated = json(row);
  repeated.detail.workflow.stages[1].decisions.push(approvals[0]);
  const legacy = {decision:'approve',actorName:'Согласующий без ID'};
  repeated.detail.workflow.stages[1].decisions.push(legacy,{...legacy}, {decision:'approve',actorName:''});
  const result = json(env.run(`BpmInsightWorkflow.getParticipants(${JSON.stringify(repeated)})`));
  assert.equal(result.length,approvals.length+3,'Repeated IDs, legacy names and nameless approvals are handled');
  assert.deepEqual(result.at(-1),{name:legacy.actorName,role:'Согласующий'});
});
test('qualitative bank effects persist only applicability and comment; quantitative rules remain',() => {
  const env = environment(), before = env.get('INS-000055');
  const quality = before.detail.effects.find(effect => effect.type === 'Качественный');
  const quantity = before.detail.effects.find(effect => effect.type === 'Количественный');
  assert.ok(quality && quantity,'Mixed effect fixture exists');
  const row = opinion(env,before.id,{reproduction:'Воспроизводится',effects:[
    {id:quality.id,applicable:true,comment:'Актуален для нашего банка',current:'invalid legacy number',target:'invalid',unit:'x'.repeat(100),frequency:'obsolete',period:'obsolete'},
    {id:quantity.id,applicable:true,comment:'Количественный расчёт',current:'90',target:'30',unit:'мин.'}
  ]});
  const response = row.detail.workflow.opinions.responses.at(-1);
  assert.deepEqual(response.effects[0],{id:quality.id,applicable:true,comment:'Актуален для нашего банка'});
  assert.deepEqual(response.effects[1],{id:quantity.id,applicable:true,comment:'Количественный расчёт',current:'90',target:'30',unit:'мин.'});
  assert.deepEqual(row.detail.effects,before.detail.effects,'Submitting a bank response never changes the author\'s effect');
  assert.deepEqual(row.detail.workflow.opinions.responses[0],before.detail.workflow.opinions.responses[0],'Other banks remain unchanged');
  const reloaded = environment(env.storage.get(KEY));
  assert.deepEqual(reloaded.get(before.id),row,'Qualitative response survives reload without numeric/time keys');
  const disabled = opinion(env,before.id,{reproduction:'Частично',effects:[{id:quality.id,applicable:false,comment:'Не актуален',current:'100',target:'100',unit:'мин.'},{id:quantity.id,applicable:false,comment:'Данные по нашему банку не применимы'}]});
  assert.deepEqual(disabled.detail.workflow.opinions.responses.at(-1).effects,[{id:quality.id,applicable:false,comment:'Не актуален'},{id:quantity.id,applicable:false,comment:'Данные по нашему банку не применимы',current:'',target:'',unit:''}]);
  for (const effect of [
    {id:quantity.id,type:'Качественный',applicable:true,current:'60',target:'60',unit:'мин.'},
    {id:quantity.id,type:'Качественный',applicable:true,current:'60',target:'30',unit:''},
    {id:quantity.id,type:'Качественный',applicable:true,current:'not numeric',target:'30',unit:'мин.'}
  ]) assert.throws(() => opinion(env,before.id,{reproduction:'Воспроизводится',effects:[effect,{id:quality.id,applicable:false}]}),'Submitted type cannot bypass quantitative validation');
  assert.throws(() => opinion(env,before.id,{reproduction:'Воспроизводится',effects:[{id:quality.id,applicable:true,comment:'x'.repeat(1001)},{id:quantity.id,applicable:false}]}),/1000/,'Qualitative comment limit stays enforced');
});

test('every effect requires an explicit boolean answer for reproducing and partial opinions',() => {
  const env = environment(), before = env.get('INS-000055'), unanswered = /Оцените актуальность каждого эффекта/;
  for (const reproduction of ['Воспроизводится','Частично']) {
    for (const effects of [undefined,[],effectAnswers(before).slice(0,1)]) {
      assert.throws(() => opinion(env,before.id,{reproduction,effects}),unanswered,'Omitted effects cannot bypass mandatory questions');
    }
    for (const value of [undefined,null,'true','false','',0,1,{},[]]) {
      for (let index = 0; index < before.detail.effects.length; index++) {
        const effects = effectAnswers(before); effects[index].applicable = value;
        assert.throws(() => opinion(env,before.id,{reproduction,effects}),unanswered,'Only actual booleans are answered questions');
      }
    }
  }
  assert.deepEqual(env.get(before.id),before,'Unanswered opinions never mutate author effects, workflow or history');
  assert.equal(env.writes.length,0);
  const sent = opinion(env,before.id,{reproduction:'Воспроизводится',effects:effectAnswers(before)});
  assert.deepEqual(sent.detail.workflow.opinions.responses.at(-1).effects.map(effect => effect.applicable),[false,false],'No is a valid explicit answer');
  const deselected = effectAnswers(before); deselected[0].applicable = null;
  const writesBefore = env.writes.length;
  assert.throws(() => opinion(env,before.id,{reproduction:'Частично',effects:deselected}),unanswered,'Clicking a selected answer off makes it unanswered again');
  assert.deepEqual(env.get(before.id),sent,'Failed deselection save retains the previously submitted boolean opinion');
  assert.equal(env.writes.length,writesBefore);
});

test('foreign, repeated and missing effects cannot substitute another author effect',() => {
  const env = environment(), before = env.get('INS-000055'), answers = effectAnswers(before);
  for (const effects of [
    [answers[0],answers[0]],
    [answers[1],answers[1]],
    [answers[0],{...answers[1],id:'foreign-effect'}],
    [answers[0],{...answers[1],id:'effect-1'}],
    [answers[0],{...answers[1],id:''}],
    [answers[0],{applicable:false}],
    [...answers,{id:'foreign-effect',applicable:false}],
    [...answers,answers[0]],
    [null,answers[1]],
    'not an array',{}
  ]) assert.throws(() => opinion(env,before.id,{reproduction:'Воспроизводится',effects}));
  assert.throws(() => opinion(env,before.id,{reproduction:'Воспроизводится',effects:[answers[0],answers[0]]}),/несколько раз/);
  assert.throws(() => opinion(env,before.id,{reproduction:'Воспроизводится',effects:[answers[0],{id:'foreign-effect',applicable:false}]}),/неизвестному эффекту/);
  assert.throws(() => env.run(`BpmInsightWorkflow.saveOpinion(BpmInsightStore.get('${before.id}'),{reproduction:'Воспроизводится',effects:[...BpmInsightStore.get('${before.id}').detail.effects.map(effect=>({id:effect.id,applicable:false})),,]})`),/Оцените актуальность/,'Sparse arrays cannot conceal absent entries');
  assert.deepEqual(env.get(before.id),before);
  assert.equal(env.writes.length,0);
  const reversed = opinion(env,before.id,{reproduction:'Частично',effects:[...answers].reverse()});
  assert.deepEqual(reversed.detail.workflow.opinions.responses.at(-1).effects.map(effect => effect.id),answers.map(effect => effect.id).reverse(),'Stable IDs may be submitted in a different order');
});

test('nonreproduction needs no effect answers and clears only the current bank effect response',() => {
  const env = environment(), before = env.get('INS-000055');
  const row = opinion(env,before.id,{reproduction:'Не воспроизводится',effects:[{id:'foreign',applicable:null,current:'not a number'}]});
  assert.deepEqual(row.detail.workflow.opinions.responses.at(-1).effects,[]);
  assert.deepEqual(row.detail.effects,before.detail.effects);
  assert.deepEqual(row.detail.workflow.opinions.responses.slice(0,-1),before.detail.workflow.opinions.responses);
  const missing = opinion(env,before.id,{reproduction:'Не воспроизводится'});
  assert.deepEqual(missing.detail.workflow.opinions.responses.at(-1).effects,[]);
});

test('No retains comments but discards metrics; Yes applies author type and quantitative validation',() => {
  const env = environment(), before = env.get('INS-000055');
  const effects = effectAnswers(before,{
    time:{applicable:false,comment:'  Не актуален для нашего банка.  ',current:'invalid',target:'invalid',unit:'x'.repeat(100)},
    quality:{applicable:true,comment:'  Подтверждаем качественный эффект.  ',current:'invalid',target:'invalid',unit:'x'.repeat(100),period:'obsolete'}
  });
  const row = opinion(env,before.id,{reproduction:'Частично',effects});
  assert.deepEqual(row.detail.workflow.opinions.responses.at(-1).effects,[
    {id:'time',applicable:false,comment:'Не актуален для нашего банка.',current:'',target:'',unit:''},
    {id:'quality',applicable:true,comment:'Подтверждаем качественный эффект.'}
  ]);
  assert.throws(() => opinion(env,before.id,{reproduction:'Воспроизводится',effects:effectAnswers(before,{time:{applicable:true,current:'oops',target:'30',unit:'мин.'}})}),/числовое/);
  assert.throws(() => opinion(env,before.id,{reproduction:'Воспроизводится',effects:effectAnswers(before,{time:{applicable:true,current:'90',target:'30',unit:''}})}),/единицу/);
  assert.throws(() => opinion(env,before.id,{reproduction:'Воспроизводится',effects:effectAnswers(before,{time:{applicable:true,current:'30',target:'30',unit:'мин.'}})}),/совпадает/);
});

test('legacy effects without IDs retain exact positional mapping and boolean opinions without migration',() => {
  const env = environment(), legacy = env.get('INS-000055');
  legacy.detail.effects.forEach(effect => {delete effect.id;});
  const before = json(legacy), save = effects => json(env.run(`BpmInsightWorkflow.saveOpinion(${JSON.stringify(legacy)},{reproduction:'Частично',effects:${JSON.stringify(effects)}})`));
  const blank = save([{applicable:false,comment:'Нет'},{applicable:true,comment:'Да'}]);
  assert.deepEqual(blank.detail.workflow.opinions.responses.at(-1).effects,[
    {id:'',applicable:false,comment:'Нет',current:'',target:'',unit:''},
    {id:'',applicable:true,comment:'Да'}
  ]);
  const synthetic = save([{id:'effect-0',applicable:true,current:'90',target:'30',unit:'мин.'},{id:'effect-1',applicable:false}]);
  assert.deepEqual(synthetic.detail.workflow.opinions.responses.at(-1).effects.map(effect => effect.id),['effect-0','effect-1']);
  for (const effects of [
    [{id:'foreign-effect',applicable:false},{id:'effect-1',applicable:false}],
    [{id:'effect-1',applicable:false},{id:'effect-0',applicable:false}],
    [{id:'effect-0',applicable:false}],
    [{id:'effect-0',applicable:false},{id:'effect-0',applicable:false}]
  ]) assert.throws(() => save(effects),'Legacy fallback is positional, not a bypass for arbitrary IDs');
  assert.deepEqual(legacy,before,'Legacy author fields and IDs are not rewritten');
  assert.deepEqual(synthetic.detail.effects,before.detail.effects);
  assert.deepEqual(synthetic.detail.workflow.opinions.responses.slice(0,-1),before.detail.workflow.opinions.responses,'Saved old boolean opinions remain untouched');
  assert.equal(env.writes.length,0,'Calculating a workflow patch does not perform migration writes');
  const mixed = json(legacy); mixed.detail.effects[1].id = 'quality';
  const mixedPatch = json(env.run(`BpmInsightWorkflow.saveOpinion(${JSON.stringify(mixed)},{reproduction:'Воспроизводится',effects:[{id:'effect-0',applicable:false},{id:'quality',applicable:true}]})`));
  assert.deepEqual(mixedPatch.detail.workflow.opinions.responses.at(-1).effects.map(effect => effect.id),['effect-0','quality']);
  for (const duplicateIds of [['time','time'],[undefined,'effect-0']]) {
    const ambiguous = json(legacy);
    ambiguous.detail.effects.forEach((effect,index) => {if (duplicateIds[index] === undefined) delete effect.id; else effect.id = duplicateIds[index];});
    assert.throws(() => env.run(`BpmInsightWorkflow.saveOpinion(${JSON.stringify(ambiguous)},{reproduction:'Частично',effects:[{id:'effect-0',applicable:false},{id:'effect-0',applicable:false}]})`),/Некорректный список эффектов/,'Ambiguous author IDs cannot assign the same saved ID to two different questions');
  }
});

test('effect-answer requirement does not change opinion permissions or invent a minimum for no author effects',() => {
  const env = environment();
  for (const [id,expected] of [['INS-000055',true],['INS-000056',true],['INS-000060',false],['INS-000009',false],['INS-000078',false]]) {
    assert.equal(env.run(`BpmInsightWorkflow.canGiveOpinion(BpmInsightStore.get('${id}'))`),expected);
  }
  const row = env.get('INS-000055'); row.detail.effects = [];
  const patch = json(env.run(`BpmInsightWorkflow.saveOpinion(${JSON.stringify(row)},{reproduction:'Воспроизводится'})`));
  assert.deepEqual(patch.detail.workflow.opinions.responses.at(-1).effects,[]);
});

let failures = 0;
for (const {name,run} of tests) {try {run();console.log(`✓ ${name}`);} catch(error) {failures++;console.error(`✗ ${name}\n${error.stack}`);}}
console.log(`\n${tests.length - failures}/${tests.length} passed`);
if (failures) process.exitCode = 1;

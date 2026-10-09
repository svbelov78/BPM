/* Focused owner-decision task definition; no browser or live data required. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'task-types-b.js'),'utf8'),sandbox);
const json=value=>JSON.parse(JSON.stringify(value));
const type=sandbox.window.BpmTaskTypes['insight-work'];
const ctx={currentUser:'Владелец Процесса',people:['Первый Исполнитель','Второй Исполнитель'],
  insights:[{id:'ins-1',code:'INS-000001',title:'Повторный запрос документов',processId:'process-1',resultVariant:'Офис'}],
  processes:[{id:'process-1',code:'П 0987',title:'Связанный процесс',block:'Блок',division:'Подразделение'}]};
const valid={...type.initial(ctx),title:'  Решить проблему  ',description:'  Описание работы  ',
  insightId:'ins-1',assignees:[...ctx.people]};
assert.equal(type.label,'Работа над инсайтом');
assert.equal(type.formTitle(valid),'Создать задачу');
assert.equal(type.createLabel,'Создать задачу');
assert.equal(type.hideTypeBack,true);
assert.equal(type.hideReset,true);
assert.deepEqual(json(type.fields(valid,ctx).map(field=>({key:field.key,label:field.label,required:!!field.required}))),[
  {key:'title',label:'Название задачи',required:true},
  {key:'description',label:'Описание задачи',required:true},
  {key:'deadline',label:'Срок задачи',required:false},
  {key:'assignees',label:'Ответственные',required:true}
]);
const assignmentField=type.fields(valid,ctx).find(field=>field.key==='assignees');
assert.equal(assignmentField.kind,'people','Reuse the standard multi-person field and avatar group');
assert.equal(assignmentField.placeholder,'Выберите');
assert.equal(type.fields(valid,ctx).find(field=>field.key==='deadline').hideCountdown,undefined,'Reuse the standard clock/countdown beside the optional date');
assert.deepEqual(json(type.validate(valid,ctx)),{});
assert.equal(type.validate({...valid,title:' \n\t '},ctx).title,'Введите название задачи.');
assert.equal(type.validate({...valid,description:' \n\t '},ctx).description,'Введите описание задачи.');
assert.ok(type.validate({...valid,assignees:[]},ctx).assignees);
assert.ok(type.validate({...valid,assignees:[' \n\t ']},ctx).assignees);
assert.ok(type.validate({...valid,assignees:[ctx.people[0],'Несуществующий Исполнитель']},ctx).assignees);
assert.ok(type.validate({...valid,deadline:'2026-02-30'},ctx).deadline);
assert.ok(type.validate({...valid,deadline:'20.10.2026'},ctx).deadline);
assert.deepEqual(json(type.validate({...valid,deadline:'2026-10-20'},ctx)),{});
assert.ok(type.validate({...valid,insightId:'missing'},ctx).insightId);
const patch=json(type.onCreate(valid,ctx));
assert.deepEqual(patch.assignees,ctx.people,'All selected assignees are saved');
assert.equal(patch.executor,undefined,'Do not arbitrarily mark the first assignee as completion executor');
assert.deepEqual(json(type.onCreate({...valid,assignees:[...ctx.people,ctx.people[0]]},ctx)).assignees,ctx.people,'Saved assignments are unique, in selection order');
assert.equal(patch.insightId,'ins-1');
assert.equal(patch.insightCode,'INS-000001');
assert.equal(patch.insightTitle,ctx.insights[0].title);
assert.equal(patch.processId,'process-1');
assert.equal(patch.processCode,'П 0987');
assert.equal(patch.resultVariant,'Офис');
assert.equal(sandbox.window.BpmTaskTypes.insight.label,'Задача к инсайту');
assert.ok(type.viewFields({...valid,...patch},{...ctx,task:{...valid,...patch}}).some(field=>field.key==='insightLabel'));
assert.deepEqual(json(type.viewFields(valid,ctx).find(field=>field.key==='assignees').value),ctx.people,'Viewing retains all selected assignees');
const work={...valid,status:'Создана',outgoing:true,incoming:false,initiator:ctx.currentUser};
assert.deepEqual(json(type.actions(work,ctx).map(action=>action.id)),['withdraw'],'The unassigned initiating owner keeps the existing withdraw lifecycle');
for (const name of ctx.people) assert.deepEqual(json(type.actions(work,{...ctx,currentUser:name}).map(action=>action.id)),['reject','complete'],`${name}: every selected responsible can act`);
assert.deepEqual(json(type.actions({...work,status:'Завершено'},ctx)),[],'Terminal work tasks have no business actions');
const legacy={...work,assignees:[],executor:ctx.people[0]};
const legacyBefore=json(legacy),adapted=type.normalizeDraft(legacy,ctx);
assert.deepEqual(json(adapted.assignees),[ctx.people[0]],'Executor-only legacy task gets an assignment view/edit fallback');
assert.equal(adapted.executor,ctx.people[0],'Legacy executor is retained');
assert.deepEqual(json(legacy),legacyBefore,'Opening adaptation never mutates the old source task');
assert.deepEqual(json(type.validate(adapted,ctx)),{});
assert.ok(type.validate({...adapted,assignees:[]},ctx).assignees,'Clearing assignments during edit remains invalid even with a legacy executor');
assert.deepEqual(json(type.actions(legacy,{...ctx,currentUser:ctx.people[0]}).map(action=>action.id)),['reject','complete'],'Legacy executor can still act');
assert.deepEqual(json(type.normalizeDraft({...work,executor:ctx.people[0]},ctx).assignees),ctx.people,'Legacy executor cannot truncate a nonempty multiple-assignee list');
assert.deepEqual(json(sandbox.window.BpmTaskTypes.insight.actions(work,ctx).map(action=>action.id)),['withdraw'],'Generic insight task lifecycle remains unchanged');
console.log('PASS — four-field multi-assignee task, standard deadline tracker, validation/all-assignee persistence, automatic links, every responsible lifecycle and executor-only legacy adaptation');

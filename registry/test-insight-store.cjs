/* Isolated, offline regression tests for the local insight store.
 * Run: node registry/test-insight-store.cjs. No browser or third-party packages. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {performance} = require('node:perf_hooks');
const source = fs.readFileSync(path.join(__dirname,'insight-store.js'),'utf8');
const dataSource = fs.readFileSync(path.join(__dirname,'insight-data.js'),'utf8');
const workflowSource = fs.readFileSync(path.join(__dirname,'insight-workflow.js'),'utf8');
const KEY = 'bpm-insight-store:v1', NOW = '2026-10-08T09:30:00.000Z';
const json = value => JSON.parse(JSON.stringify(value));
const tests = [];
function test(name,run) {tests.push({name,run});}
function environment(options = {}) {
  const storage = new Map(options.saved === undefined ? [] : [[KEY,options.saved]]);
  const events = new Map(), writes = [];
  const failure = {read:!!options.readFailure,write:!!options.writeFailure};
  const localStorage = {
    getItem(key) {if (failure.read) throw new Error('Storage blocked'); return storage.get(key) ?? null;},
    setItem(key,value) {if (failure.write) throw new Error('Storage quota exceeded'); storage.set(key,value); writes.push({key,value});}
  };
  const context = vm.createContext({localStorage,addEventListener:(type,handler) => events.set(type,handler)});
  vm.runInContext(`
    window = globalThis;
    Date = class extends Date {
      constructor(...args) {super(...(args.length ? args : [${JSON.stringify(NOW)}]));}
      static now() {return new Date().getTime();}
    };
    BPM_DATA = [
      {entity:'processes',id:'p123',number:123,title:'Процесс А',block:'Блок А',division:'Подразделение А'},
      {entity:'processes',id:'p456',number:456,title:'Процесс Б',block:'Блок Б',division:'Подразделение Б'},
      {entity:'paths',id:'cp1',title:'Путь А'}
    ];
    BpmTaskStore = {currentUser:'Тестовый Пользователь'};
  `,context);
  vm.runInContext(workflowSource,context,{filename:'insight-workflow.js'});
  vm.runInContext(dataSource,context,{filename:'insight-data.js'});
  if (options.seed !== undefined) vm.runInContext(`BPM_INSIGHT_DATA = ${JSON.stringify(options.seed)}`,context);
  const originalSeed = vm.runInContext('JSON.stringify(BPM_INSIGHT_DATA)',context);
  vm.runInContext(source,context,{filename:'insight-store.js'});
  const evaluate = code => vm.runInContext(code,context);
  const call = (method,...args) => evaluate(`BpmInsightStore.${method}(${args.map(value => JSON.stringify(value)).join(',')})`);
  return {context,evaluate,call,storage,events,writes,failure,originalSeed,localStorage,
    emit(value,key = KEY,area = localStorage) {events.get('storage')({key,newValue:value,storageArea:area});}};
}
const snapshot = rows => JSON.stringify({version:1,rows});
function throwsAtomic(env,code) {
  const before = json(env.call('list')), writes = env.writes.length;
  assert.throws(() => env.evaluate(code));
  assert.deepEqual(json(env.call('list')),before,'invalid operation changed rows');
  assert.equal(env.writes.length,writes,'invalid operation changed storage');
}

test('real demo seeds retain all registry fields and remain deeply unchanged',() => {
  const env = environment(), rows = json(env.call('list'));
  assert.equal(rows.length,16);
  assert.deepEqual(rows,JSON.parse(env.originalSeed));
  assert.equal(env.writes.length,0);
  assert.equal(env.call('persistenceAvailable'),true);
  env.evaluate(`BpmInsightStore.list()[0].related[0].variants.push('changed'); BpmInsightStore.get('INS-000078').title = 'changed';`);
  assert.deepEqual(json(env.call('list')),rows);
  assert.equal(env.evaluate('JSON.stringify(BPM_INSIGHT_DATA)'),env.originalSeed);
  assert.equal(env.evaluate('Object.isFrozen(BpmInsightStore)'),true);
});

test('creation assigns sequential identity, local date, timestamps and new status',() => {
  const env = environment();
  const row = json(env.call('create',{title:'Новый инсайт',status:'Выполнено',id:'INS-999999',code:'wrong',created:'1900-01-01',local:false}));
  assert.equal(row.id,'INS-000079');
  assert.equal(row.code,row.id);
  assert.equal(row.kind,'insights');
  assert.equal(row.status,'Новый');
  assert.equal(row.created,'2026-10-08');
  assert.equal(row.createdAt,NOW);
  assert.equal(row.updatedAt,NOW);
  assert.equal(row.local,true);
  assert.equal(row.author,'Тестовый Пользователь');
  assert.equal(row.comments,0);
  assert.equal(row.rating,0);
  assert.deepEqual(row.detail.comments,[]);
  assert.deepEqual(row.detail.effects,[]);
  assert.equal(row.detail.history[0].text,'Инсайт создан');
  assert.equal(env.call('create',{title:'Следующий инсайт'}).id,'INS-000080');
  assert.equal(env.call('list')[0].id,'INS-000080');
});

test('creation preserves the complete drawer schema and only file metadata',() => {
  const env = environment();
  const input = {title:'Заголовок',description:'Наблюдение',solution:'Решение',rootCauses:'Причины',commentsDraft:[{id:'comment1',author:'Автор',text:'Комментарий'}],source:'Гемба',bank:'Банк',path:'Путь',owner:'Владелец',author:'Автор',block:'Блок',division:'Подразделение',product:'Продукт',products:['Продукт'],
    related:[{id:'p1',code:'П123',title:'Процесс',variants:['Вариант']}],
    effects:[{id:'effect1',name:'Экономия времени',type:'Количественный',description:'Описание',current:'100',target:'50',unit:'мин',frequency:'Год',period:'Год'}],
    attachments:[{id:'f1',name:'example.pdf',size:123,type:'application/pdf',lastModified:1234,dataUrl:'data:application/pdf;base64,' + 'x'.repeat(100000)}]};
  const row = json(env.call('create',input));
  for (const key of Object.keys(input).filter(key => key !== 'attachments')) assert.deepEqual(row[key],input[key],key);
  assert.deepEqual(row.process,['Процесс']);
  assert.deepEqual(row.detail.effects,input.effects);
  assert.deepEqual(row.detail.comments,[{id:'comment1',author:'Автор',text:'Комментарий',date:'08.10.2026'}]);
  assert.equal(row.comments,1);
  assert.deepEqual(row.attachments,[{id:'f1',name:'example.pdf',size:123,type:'application/pdf',lastModified:1234}]);
  assert.equal(env.storage.get(KEY).includes('data:application'),false);
  assert.equal(env.storage.get(KEY).includes('dataUrl'),false);
});

test('legacy text comments initialize detail and explicit detail comments take precedence',() => {
  const env = environment();
  const legacy = json(env.call('create',{title:'Legacy',commentsDraft:'Комментарий'}));
  assert.equal(legacy.comments,1);
  assert.deepEqual(legacy.detail.comments,[{author:'Тестовый Пользователь',text:'Комментарий',date:'08.10.2026'}]);
  const explicit = json(env.call('create',{title:'Explicit',commentsDraft:[{id:'c1',author:'Автор',text:'Черновик'}],detail:{comments:[]}}));
  assert.equal(explicit.comments,0);
  assert.deepEqual(explicit.detail.comments,[]);
});

test('all input, return-value and snapshot objects are isolated copies',() => {
  const env = environment();
  env.evaluate(`
    input = {title:'Stable',related:[{id:'p1',code:'П1',title:'Process',variants:['A']}],effects:[{id:'e1',name:'Effect'}]};
    created = BpmInsightStore.create(input);
    input.related[0].variants[0] = 'MUTATION'; input.effects[0].name = 'MUTATION';
    created.title = 'MUTATION'; created.detail.effects[0].name = 'MUTATION';
    patch = {detail:{history:[{text:'Stable',date:'today'}]}};
    updated = BpmInsightStore.update('INS-000079',patch);
    patch.detail.history[0].text = 'MUTATION'; updated.detail.history[0].text = 'MUTATION';
  `);
  assert.equal(JSON.stringify(env.call('get','INS-000079')).includes('MUTATION'),false);
  assert.equal(env.storage.get(KEY).includes('MUTATION'),false);
  assert.equal(env.evaluate('JSON.stringify(BPM_INSIGHT_DATA)'),env.originalSeed);
});

test('detail patches merge top-level fields and replace arrays without losing siblings',() => {
  const env = environment();
  env.call('update','INS-000078',{detail:{reproduction:'Частично',reproductionComment:'Проверено',effects:[{id:'e1',applicable:true,current:'10',target:'5',unit:'мин',comment:'Тест'}],comments:[{author:'Вы',date:'08.10.2026',text:'Комментарий'}],history:[{date:'08.10.2026',text:'Изменено'}]},comments:3});
  const before = json(env.call('get','INS-000078'));
  const after = json(env.call('update','INS-000078',{detail:{userRating:4,averageRating:4.2},rating:4.2,status:'Выполняется'}));
  for (const key of ['effects','comments','history','reproduction','reproductionComment']) assert.deepEqual(after.detail[key],before.detail[key]);
  assert.equal(after.detail.userRating,4);
  assert.equal(after.comments,3);
  assert.equal(after.rating,4.2);
  assert.equal(after.status,'В работе');
  assert.equal(after.created,'2026-04-09');
  assert.equal(after.updatedAt,NOW);
  assert.deepEqual(json(env.call('update','INS-000078',{detail:{effects:[]}})).detail.effects,[]);
});

test('related changes keep process filter names current; explicit names are respected',() => {
  const env = environment();
  assert.deepEqual(json(env.call('update','INS-000078',{related:[{id:'p9',code:'П9',title:'Новый процесс',variants:[]}]})).process,['Новый процесс']);
  assert.deepEqual(json(env.call('update','INS-000078',{related:[],process:['Явное название']})).process,['Явное название']);
});

test('identity/date/local metadata cannot be altered by form patches',() => {
  const env = environment(), before = json(env.call('get','INS-000078'));
  const row = json(env.call('update','INS-000078',{id:'INS-000001',code:'INS-000001',kind:'tasks',created:'1900-01-01',createdAt:'invalid',updatedAt:'invalid',local:true}));
  for (const key of ['id','code','kind','created','createdAt','local']) assert.equal(row[key],before[key],key);
  assert.equal(row.updatedAt,NOW);
  assert.equal(env.call('get','missing'),null);
  assert.equal(env.call('update','missing',{title:'ignored'}),null);
});

test('saved creation and detail changes restore on reload',() => {
  const env = environment();
  env.call('create',{title:'Сохранённый инсайт',attachments:[{name:'report.csv',size:20,type:'text/csv',dataUrl:'data:text/csv,content'}]});
  env.call('update','INS-000067',{detail:{userRating:5,comments:[{author:'Вы',date:'08.10.2026',text:'Сохранённый комментарий'}]},comments:6});
  const restored = environment({saved:env.storage.get(KEY)});
  assert.deepEqual(json(restored.call('list')),json(env.call('list')));
  assert.equal(restored.call('create',{title:'После перезагрузки'}).id,'INS-000080');
});

test('corrupt, unsupported, duplicate and invalid-date snapshots fall back without overwrite',() => {
  const baseline = environment(), seed = json(baseline.call('list'));
  const invalidDates = ['2026-02-30','2025-02-29','2026-13-01','2026-04-09T12:00:00Z'];
  const corrupt = ['{',JSON.stringify({version:2,rows:seed}),snapshot([...seed,seed[0]]),JSON.stringify({version:1,rows:seed,extra:true}),
    ...invalidDates.map(created => snapshot([{...seed[0],created}])),snapshot([{...seed[0],code:'INS-000001'}]),snapshot([{...seed[0],createdAt:'2026-02-30T00:00:00.000Z'}])];
  for (const saved of corrupt) {
    const env = environment({saved});
    assert.deepEqual(json(env.call('list')),seed);
    assert.equal(env.storage.get(KEY),saved);
    assert.equal(env.writes.length,0);
  }
  const leap = environment({saved:snapshot([{...seed[0],created:'2024-02-29'}])});
  assert.equal(leap.call('list').length,16);
  assert.equal(leap.call('get','INS-000078').created,'2024-02-29');
});

test('blocked reads and failed writes preserve session changes; later writes recover persistence',() => {
  const blocked = environment({readFailure:true,writeFailure:true});
  assert.equal(blocked.call('persistenceAvailable'),false);
  assert.equal(blocked.call('isPersistent'),false);
  const created = blocked.call('create',{title:'Работает без хранилища'});
  assert.equal(blocked.call('get',created.id).title,created.title);
  assert.equal(blocked.call('persistenceAvailable'),false);
  blocked.failure.write = false;
  blocked.call('update',created.id,{solution:'Сохранить позже'});
  assert.equal(blocked.call('persistenceAvailable'),true);
  assert.equal(JSON.parse(blocked.storage.get(KEY)).rows.length,17);
});

test('subscriptions are independent, error-isolated and removable',() => {
  const env = environment();
  env.evaluate(`
    received = [];
    BpmInsightStore.subscribe((rows,event) => {rows[0].title='MUTATION';event.type='MUTATION';throw Error('listener');});
    unsubscribe = BpmInsightStore.subscribe((rows,event) => received.push({title:rows[0].title,event}));
    BpmInsightStore.create({title:'Событие'});
  `);
  assert.deepEqual(json(env.evaluate('received')),[{title:'Событие',event:{type:'create',id:'INS-000079'}}]);
  env.evaluate('unsubscribe(); BpmInsightStore.update("INS-000079",{title:"После отписки"});');
  assert.equal(env.evaluate('received.length'),1);
  assert.throws(() => env.call('subscribe',123));
});

test('valid storage events sync; malformed or foreign events cannot replace local rows',() => {
  const env = environment(), remote = environment();
  remote.call('create',{title:'Из соседней вкладки'});
  env.evaluate('syncEvents=[]; BpmInsightStore.subscribe((rows,event)=>syncEvents.push(event));');
  env.emit(remote.storage.get(KEY));
  assert.equal(env.call('list')[0].title,'Из соседней вкладки');
  assert.deepEqual(json(env.evaluate('syncEvents')),[{type:'sync',id:null}]);
  const current = json(env.call('list'));
  env.emit('{'); env.emit(null,'another-key'); env.emit(null,KEY,{});
  assert.deepEqual(json(env.call('list')),current);
  assert.equal(env.writes.length,0);
  env.emit(null);
  assert.deepEqual(json(env.call('list')),JSON.parse(env.originalSeed));
  env.emit(remote.storage.get(KEY));
  env.emit(null,null);
  assert.deepEqual(json(env.call('list')),JSON.parse(env.originalSeed));
});

test('unknown fields, bad primitive types, invalid counts and ratings fail atomically',() => {
  const env = environment();
  for (const patch of [
    {title:''},{title:'  '},{title:12},{description:null},{status:''},{status:1},{comments:[]},{comments:-1},{comments:1.5},
    {rating:6},{rating:-1},{previousRating:'4'},{needsOpinion:1},{process:'Process'},{unknown:'value'},
    {related:[{id:'p1',code:'П1',title:'Title',variants:[4]}]}, {detail:{effects:{}}},{detail:{comments:[{}]}},{detail:{history:[{}]}},
    {detail:{effects:[{applicable:'yes'}]}},{detail:{userRating:6}},{detail:{averageRating:-1}},{products:'Product'},
    {commentsDraft:123},{commentsDraft:[{text:'missing author'}]},{commentsDraft:[{author:'Автор',text:123}]}
  ]) throwsAtomic(env,`BpmInsightStore.update('INS-000078',${JSON.stringify(patch)})`);
  for (const value of ['undefined','null','[]','true']) throwsAtomic(env,`BpmInsightStore.create(${value})`);
  throwsAtomic(env,`BpmInsightStore.create({description:'no title'})`);
  throwsAtomic(env,`BpmInsightStore.update('INS-000078',{rating:NaN})`);
  throwsAtomic(env,`BpmInsightStore.update('INS-000078',{detail:{value:Infinity}})`);
});

test('prototype pollution, accessors, custom objects and cycles are rejected without execution',() => {
  const env = environment();
  for (const key of ['__proto__','constructor','prototype']) {
    for (const patch of [{[key]:{polluted:true}},{detail:{[key]:{polluted:true}}},{attachments:[{name:'file',[key]:{polluted:true}}]}]) {
      throwsAtomic(env,`BpmInsightStore.update('INS-000078',JSON.parse(${JSON.stringify(JSON.stringify(patch))}))`);
    }
  }
  env.evaluate('getterCalls=0;');
  for (const code of [
    `({get title(){getterCalls++;return 'x';}})`,
    `({detail:{get value(){getterCalls++;return 'x';}}})`,
    `({attachments:[{name:'file',get dataUrl(){getterCalls++;return 'data:text/plain,secret';}}]})`,
    `Object.create({title:'inherited'})`,
    `({detail:{value:new Date()}})`, `({detail:{value:()=>1}})`, `({detail:{value:undefined}})`,
    `({detail:{value:1n}})`, `({detail:{[Symbol('key')]:1}})`,
    `(()=>{const detail={};detail.self=detail;return {detail};})()`,
    `(()=>{const effects=[];effects[0]=effects;return {effects};})()`,
    `(()=>{const effects=[];Object.defineProperty(effects,'0',{get(){getterCalls++;return {};}});return {effects};})()`
  ]) throwsAtomic(env,`BpmInsightStore.update('INS-000078',${code})`);
  assert.equal(env.evaluate('getterCalls'),0);
  assert.equal(env.evaluate('({}).polluted'),undefined);
});

test('attachment metadata validation rejects blobs, URLs, unsafe sizes and missing names',() => {
  const env = environment();
  for (const attachment of [{name:'',size:1},{name:'file',size:-1},{name:'file',size:1.5},{name:'file',dataUrl:{}},{name:'file',blob:{}},{name:'file',url:'https://example.test/file'}]) {
    throwsAtomic(env,`BpmInsightStore.create(${JSON.stringify({title:'File test',attachments:[attachment]})})`);
  }
  throwsAtomic(env,`BpmInsightStore.create({title:'Too many files',attachments:Array.from({length:51},()=>({name:'file'}))})`);
});

test('bounded text, arrays, object size, depth and record size reject oversized input atomically',() => {
  const env = environment();
  for (const patch of [
    `{title:'x'.repeat(501)}`, `{description:'x'.repeat(20001)}`, `{detail:{items:Array(1001).fill(1)}}`,
    `{detail:Object.fromEntries(Array.from({length:101},(_,i)=>['key'+i,'value']))}`,
    `(()=>{let value={};for(let i=0;i<10;i++)value={value};return {detail:value};})()`,
    `{detail:Object.fromEntries(Array.from({length:20},(_,i)=>['key'+i,'x'.repeat(20000)]))}`,
    `{effects:new Array(2)}`, `(()=>{const effects=[];effects.extra='x';return {effects};})()`
  ]) throwsAtomic(env,`BpmInsightStore.update('INS-000078',${patch})`);
});

test('maximum snapshot size is enforced before mutation',() => {
  const env = environment();
  env.evaluate(`largeDetail=Object.fromEntries(Array.from({length:10},(_,i)=>['key'+i,'x'.repeat(20000)]));`);
  for (let i = 0; i < 19; i++) env.evaluate(`BpmInsightStore.create({title:'Large ${i}',detail:largeDetail})`);
  throwsAtomic(env,`BpmInsightStore.create({title:'Too large',detail:largeDetail})`);
  const oversized = environment({saved:'x'.repeat(4000001)});
  assert.equal(oversized.call('list').length,16);
});

test('ID exhaustion, empty seed and user fallback are predictable',() => {
  const baseline = environment(), one = json(baseline.call('list'))[0];
  const full = environment({seed:[{...one,id:'INS-999999',code:'INS-999999'}]});
  throwsAtomic(full,`BpmInsightStore.create({title:'Exhausted'})`);
  const empty = environment({seed:[]});
  assert.equal(empty.call('create',{title:'First'}).id,'INS-000001');
  empty.evaluate(`delete BpmTaskStore;`);
  vm.runInContext(source,empty.context);
  assert.equal(empty.evaluate('BpmInsightStore.currentUser'),'Иванов Иван Васильевич');
});

test('literal markup is retained as inert text rather than executed or double-escaped',() => {
  const env = environment(), title = '<img src=x onerror="alert(1)"> & "Текст"';
  const row = env.call('create',{title,description:'<script>window.unwanted=true</script>'});
  assert.equal(row.title,title);
  assert.equal(env.evaluate('typeof unwanted'),'undefined');
  assert.equal(environment({saved:env.storage.get(KEY)}).call('get',row.id).title,title);
});

test('explicit demo replay restores complete seed scenarios and preserves local records',() => {
  const env = environment(), baseline = json(env.call('list'));
  const created = json(env.call('create',{title:'Мой инсайт',description:'Оставить этот текст',source:'ТБ',bank:'Мой банк',attachments:[{name:'my.pdf',size:20,type:'application/pdf'}]}));
  env.call('update',created.id,{status:'В работе',detail:{userRating:5,comments:[{author:'Вы',text:'Мой комментарий'}],taskIds:['my-task']}});
  const local = json(env.call('get',created.id));
  env.evaluate(`for (const row of BpmInsightStore.list().filter(row => !row.local)) BpmInsightStore.update(row.id,{status:'Отклонено',needsApproval:false,needsOpinion:false,rejection:'Завершено в демонстрации',detail:{workflow:{stages:[],stage:'complete',opinions:{responses:[]},teamDecision:{decision:'reject'}},reproduction:'Воспроизводится',reproductionComment:'Оценено'}});`);
  env.evaluate(`eventsSeen = []; BpmInsightStore.subscribe((rows,event) => eventsSeen.push(event));`);
  const beforeWrites = env.writes.length, restored = json(env.call('resetDemo'));
  assert.deepEqual(restored.sort(),baseline.map(row => row.id).sort());
  assert.equal(env.writes.length,beforeWrites + 1,'Replay is one atomic snapshot write');
  assert.deepEqual(json(env.call('list')).filter(row => !row.local),baseline);
  assert.deepEqual(json(env.call('get',created.id)),local,'Locally created insight remains byte-equivalent');
  assert.deepEqual(json(env.evaluate('eventsSeen')),[{type:'reset-demo',id:null}]);
  assert.equal(env.evaluate('JSON.stringify(BPM_INSIGHT_DATA)'),env.originalSeed,'Immutable seeds stay untouched');
  const reloaded = environment({saved:env.storage.get(KEY)});
  assert.deepEqual(json(reloaded.call('list')),json(env.call('list')),'Replay and user records survive reload');
  assert.equal(reloaded.call('create',{title:'После сброса'}).id,'INS-000080','Replay never reuses a local record ID');
});

test('demo replay preserves legacy local-ID collisions and works with unavailable storage',() => {
  const baseline = environment(), rows = json(baseline.call('list'));
  rows[0] = {...rows[0],local:true,title:'Пользовательская запись с прежним ID',status:'В работе'};
  const collision = environment({saved:snapshot(rows)}), before = json(collision.call('get',rows[0].id));
  assert.equal(json(collision.call('resetDemo')).includes(rows[0].id),false);
  assert.deepEqual(json(collision.call('get',rows[0].id)),before);
  const blocked = environment({readFailure:true,writeFailure:true}), seed = json(blocked.call('list'));
  blocked.call('update',seed[0].id,{status:'В работе'});
  assert.equal(blocked.call('resetDemo').length,seed.length);
  assert.deepEqual(json(blocked.call('list')),seed);
  assert.equal(blocked.call('persistenceAvailable'),false,'Session replay does not claim persistent storage');
});

const started = performance.now();
let failures = 0;
for (const {name,run} of tests) {
  try {run(); console.log(`✓ ${name}`);}
  catch (error) {failures++; console.error(`✗ ${name}\n${error.stack}`);}
}
console.log(`\n${tests.length - failures}/${tests.length} passed in ${((performance.now() - started) / 1000).toFixed(2)}s`);
if (failures) process.exitCode = 1;

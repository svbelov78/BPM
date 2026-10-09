/* Shared local fictional portrait atlas across the prototype.
 * node registry/test-avatars.cjs [registry/index.html | --standalone [file]]
 * node registry/test-avatars.cjs --unit-only
 * Uses an isolated offline browser, never a live user profile.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BPM_PLAYWRIGHT||'/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const args=process.argv.slice(2),unitOnly=args.includes('--unit-only');
const explicit=args.find(arg=>!arg.startsWith('--'));
let source=path.resolve(explicit||(args.includes('--standalone')?path.join(__dirname,'..','Sber-BPM-Registry-Standalone.html'):path.join(__dirname,'index.html')));
const standalone=args.includes('--standalone')||path.basename(source)!=='index.html';
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-avatars-'));
const report=text=>console.log(`PASS — ${text}`);
const men=['Иванов Иван Иванович','Петров Игорь Иванович','Белов Иван Сергеевич','Ковалевский Артём Андреевич','Фролов Артём Николаевич','Шестипалый Афанасий Иванович','Константинопольский Константин Константинович','Лебедев Алексей Сергеевич'];
const women=['Котова Ирина Петровна','Миронова Елена Павловна','Горбачёва Нина Александровна','Кузнецова Ольга Андреевна','Иванова Мария Сергеевна','Петрова Анна Николаевна','Соколова Марина Игоревна','Воронова Екатерина Дмитриевна'];
function unit(){
  const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'avatars.js'),'utf8'),sandbox,{filename:'avatars.js'});
  const api=sandbox.window.BpmAvatars;assert.ok(Object.isFrozen(api));assert.equal(typeof api.displayName,'function');assert.equal(typeof api.isMissing,'function');
  for(const name of [...men,...women]){
    const normalized=api.normalize(name),index=api.portraitIndex(name);
    assert.equal(api.portraitIndex(`  ${name.toLocaleUpperCase('ru').replace(/ /g,'  ')}  `),index,`${name}: whitespace/case stable`);
    assert.equal(api.portraitIndex({name}),index,`${name}: name-object stable`);
    assert.equal(api.portraitIndex({label:name}),index,`${name}: label-object stable`);
    assert.equal(api.normalize(normalized),normalized,`${name}: normalization idempotent`);
    assert.equal(api.displayName(`  ${name}  `),name,`${name}: known names stay intact`);
    assert.equal(api.isMissing(name),false,`${name}: actual names are not treated as unassigned`);
    assert.ok(index>=0&&index<16&&Number.isInteger(index),`${name}: valid atlas tile`);
    assert.match(api.portrait(name),new RegExp(`data-bpm-portrait="${index}"`));
  }
  for(const name of men)assert.ok(api.portraitIndex(name)<8,`${name}: first two atlas rows are male`);
  for(const name of women)assert.ok(api.portraitIndex(name)>=8,`${name}: last two atlas rows are female`);
  assert.equal(api.portraitIndex('Горбачёва Нина Александровна'),api.portraitIndex('горбачева нина александровна'),'Ё/Е variants share the same portrait');
  const unknowns=['','—','---','Не указан','Не указана','Не назначен','Не назначена','Не назначены','Руководитель не указан'];
  const fallback=api.portraitIndex('', 'QA: unknown owner'),fallbackName=api.displayName('', 'QA: unknown owner');
  assert.match(fallbackName,/^[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+$/u,'Missing people receive a full fictional Russian FIO');
  for(const value of unknowns){
    assert.equal(api.isMissing(value),true,`${value}: missing-person alias is recognized`);
    assert.equal(api.displayName(value,'  qa:   unknown owner '),fallbackName,`${value}: display names use normalized stable fallback keys`);
    assert.equal(api.portraitIndex(value,'  qa:   unknown owner '),fallback,`${value}: unknown aliases use a normalized fallback`);
    assert.equal(api.portrait(value,'QA: unknown owner'),api.portrait(fallbackName),`${value}: displayed FIO and portrait identity agree`);
  }
  const missingObject={name:'Не назначены',assignment:null},missingCopy=JSON.stringify(missingObject);
  assert.equal(api.displayName(missingObject,'QA: unknown owner'),fallbackName,'Object names get the same presentation-only fallback');
  api.portrait(missingObject,'QA: unknown owner');assert.equal(JSON.stringify(missingObject),missingCopy,'Presentation does not mutate person records or assignments');
  assert.equal(api.displayName('Система'),'Система','System identity remains literal');
  assert.equal(api.displayName('constructor'),'constructor','Inherited object keys cannot act as person aliases');
  const legacyActor={id:'owner:legacy',name:'Гослинг Райан Томас',role:'Владелец процесса'},legacyCopy=JSON.stringify(legacyActor);
  assert.equal(api.displayName(legacyActor),'Громов Роман Тимофеевич','Legacy joke name gets a presentation-only Russian FIO alias');
  assert.equal(api.displayName('  ГОСЛИНГ  РАЙАН  ТОМАС  '),'Громов Роман Тимофеевич','Alias lookup is whitespace/case stable');
  assert.equal(api.portrait(legacyActor),api.portrait('Громов Роман Тимофеевич'),'Alias label and portrait identity match');
  assert.equal(api.normalize(legacyActor),'гослинг райан томас','Stored-identity normalization remains independent from the display alias');
  assert.equal(JSON.stringify(legacyActor),legacyCopy,'Alias does not mutate the actor ID, name or workflow role');
  assert.equal(api.displayName('Гослинг Райан Томас'),'Громов Роман Тимофеевич','Old celebrity joke has a fictional Russian display name');
  assert.equal(api.portrait('Гослинг Райан Томас'),api.portrait('Громов Роман Тимофеевич'),'Display alias and portrait retain the same identity');
  const distinctUnknowns=new Set(Array.from({length:32},(_,i)=>api.portraitIndex('',`unknown:${i}`)));
  assert.ok(distinctUnknowns.size>=8,'Independent unknown people are not all assigned the same tile');
  const unsafe=api.portrait('<img src="x" onerror="throw 1"> & \'quoted\'');
  assert.ok(unsafe.includes('&lt;img')&&unsafe.includes('&quot;')&&unsafe.includes('&amp;')&&unsafe.includes('&#39;'),'Person metadata is HTML-escaped');
  assert.equal((unsafe.match(/<span\b/g)||[]).length,1,'Only the trusted portrait span can be created');
  assert.ok(!unsafe.includes('<img')&&!unsafe.includes('<script'),'Untrusted names cannot inject markup');
  const diversity=new Set([...men,...women].map(name=>api.portraitIndex(name)));
  assert.ok(diversity.size>=8,`Business people have varied portrait tiles (${diversity.size})`);
  report('Stable normalized FIO/portrait mapping, gender rows, presentation-only unknown fallbacks, diverse tiles and HTML escaping');
}
const cabinetReady=page=>page.waitForFunction(()=>!document.querySelector('#cabinet-panel')?.hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
const insightReady=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const taskReady=page=>page.waitForFunction(()=>document.querySelector('#tasks-results')?.getAttribute('aria-busy')==='false');
async function paint(page){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});}
async function choose(page,id,value){
  await page.locator(`#${id}-input`).click();
  const options=page.locator(`#${id}-list [data-option]:not([data-option=""])`),option=value?options.filter({hasText:value}).first():options.first();
  await option.click();await paint(page);
  if(await page.locator(`#${id}-list`).count())await page.keyboard.press('Escape');
}
const observations=new Map();
const recordPeople=new Map();
const dataSnapshot=page=>page.evaluate(()=>JSON.stringify({insights:BpmInsightStore.list(),tasks:BpmTaskStore.list(),entities:window.BPM_DATA,structure:window.BPM_STRUCTURE}));
async function portraits(page,selector,label,{minimum=1}={}){
  await paint(page);
  const state=await page.locator(selector).evaluate(root=>{
    const visible=node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden';
    const nameSelector='.owner-name,.task-owner-name,.insights-owner-name,.id-detail-participant p,.ic-person > div > span:not(#ic-owner-name),.tf-person .tf-value,.pd-person-name,.jd-person-name > span,.pd-data-person > span:last-child';
    const missingLabels=[...root.querySelectorAll(`${nameSelector},.task-unassigned`)].filter(visible).map(node=>node.textContent.trim()).filter(name=>BpmAvatars.isMissing(name));
    const list=[...root.querySelectorAll('.bpm-avatar-portrait')].filter(visible).map(node=>{
      const parent=node.parentElement,a=node.getBoundingClientRect(),b=parent.getBoundingClientRect(),style=getComputedStyle(node),p=getComputedStyle(parent);
      const borderX=parseFloat(p.borderLeftWidth)+parseFloat(p.borderRightWidth),borderY=parseFloat(p.borderTopWidth)+parseFloat(p.borderBottomWidth);
      const person=node.closest('.owner,.task-owner,.insights-owner,.id-detail-participant,.ic-person,.tf-person,.pd-person,.jd-person,.pd-data-person'),nameLabel=person?.querySelector(nameSelector),labelName=nameLabel?.textContent.trim()||'';
      const record=node.closest('[data-record],[data-insight-id],article[data-cabinet-open],article[data-task-id],tr[data-task-id]'),recordId=record?.dataset.record||record?.dataset.insightId||record?.dataset.cabinetOpen||record?.dataset.taskId;
      // Cabinet demonstration tasks have separate historical fixtures that
      // reuse catalog IDs; only local tasks share the actual task-store row.
      const recordNamespace=record?.dataset.cabinetKind==='tasks'&&!BpmTaskStore.get(recordId)?.local?'cabinet-seed:':'';
      const participantRole=person?.querySelector('small')?.textContent.trim(),route=parent.closest('.task-participant-route');
      const role=person?.matches('.owner,.insights-owner')||participantRole==='Владелец процесса'?'owner':person?.matches('.task-owner')||(route&&route.firstElementChild===parent)?'initiator':participantRole==='Автор'?'author':'';
      return {name:node.dataset.bpmPerson,index:Number(node.dataset.bpmPortrait),width:a.width,height:a.height,parentWidth:b.width-borderX,parentHeight:b.height-borderY,
        radius:style.borderRadius,parentRadius:p.borderRadius,image:style.backgroundImage,size:style.backgroundSize,position:style.backgroundPosition,
        imageChildren:parent.querySelectorAll('img').length,text:parent.textContent.trim(),expected:BpmAvatars.portraitIndex(node.dataset.bpmPerson),missing:BpmAvatars.isMissing(node.dataset.bpmPerson),labelName:labelName?BpmAvatars.normalize(labelName):'',titleName:parent.title?BpmAvatars.normalize(parent.title):'',recordKey:recordId&&role?`${recordNamespace}${recordId}:${role}`:''};
    });
    const allowed=node=>node.classList.contains('task-avatar-overflow')||/^(?:\+\d+|SYS|Система)$/.test(node.textContent.trim())||node.closest('.skeleton-shape,[aria-hidden="true"].task-skeleton-card,[aria-hidden="true"].cabinet-skeleton');
    const legacy=[...root.querySelectorAll('.avatar,.task-avatar,.tf-avatar,.ic-avatar,.pd-avatar')].filter(visible).filter(node=>!allowed(node)&&!node.querySelector('.bpm-avatar-portrait')).map(node=>({classes:node.className,text:node.textContent.trim(),html:node.innerHTML.slice(0,150)}));
    return {list,legacy,missingLabels,nonPeoplePortraits:root.querySelectorAll('.bpm-efficiency-glyph .bpm-avatar-portrait,.efficiency-sphere .bpm-avatar-portrait,.task-deadline .bpm-avatar-portrait,.skeleton-shape .bpm-avatar-portrait').length};
  });
  assert.ok(state.list.length>=minimum,`${label}: ${minimum}+ visible portraits, got ${state.list.length}`);
  assert.deepEqual(state.legacy,[],`${label}: no legacy human icon/initials in person circles`);
  assert.deepEqual(state.missingLabels,[],`${label}: existing person labels are FIO rather than unassigned placeholders`);
  assert.equal(state.nonPeoplePortraits,0,`${label}: efficiency spheres, deadline rings and skeletons are not converted to portraits`);
  for(const item of state.list){
    assert.ok(Math.abs(item.width-item.parentWidth)<=1.1&&Math.abs(item.height-item.parentHeight)<=1.1,`${label}/${item.name}: portrait fills its existing wrapper (${JSON.stringify(item)})`);
    assert.equal(item.radius,item.parentRadius,`${label}/${item.name}: inherited circular clipping`);
    assert.equal(item.imageChildren,0,`${label}/${item.name}: no legacy human icon remains`);
    assert.equal(item.text,'',`${label}/${item.name}: initials are replaced, not overlaid`);
    assert.equal(item.size,'400% 400%',`${label}/${item.name}: 4×4 atlas scales correctly`);
    assert.ok(item.image.startsWith('url('),`${label}: atlas background present`);
    assert.ok(item.index>=0&&item.index<16,`${label}: tile in atlas`);
    assert.equal(item.missing,false,`${label}: portrait metadata has a displayed person name, not a missing-person token`);
    if(item.labelName)assert.equal(item.name,item.labelName,`${label}: visible FIO and photo metadata match`);
    if(item.titleName)assert.equal(item.name,item.titleName,`${label}: photo tooltip and identity match`);
    assert.equal(item.index,item.expected,`${label}/${item.name}: helper determines portrait`);
    if(observations.has(item.name))assert.equal(item.index,observations.get(item.name),`${label}/${item.name}: same portrait across views/reload`);
    observations.set(item.name,item.index);
    if(item.recordKey){
      const identity={name:item.name,index:item.index};
      if(recordPeople.has(item.recordKey))assert.deepEqual(identity,recordPeople.get(item.recordKey),`${label}/${item.recordKey}: same record has the same FIO and portrait across surfaces/reload`);
      recordPeople.set(item.recordKey,identity);
    }
    if(standalone)assert.match(item.image,/^url\("(?:data:|blob:)/,`${label}: standalone portrait asset embedded`);
  }
  const atlas=await page.evaluate(async selector=>{
    const images=[...new Set([...document.querySelector(selector).querySelectorAll('.bpm-avatar-portrait')].map(node=>getComputedStyle(node).backgroundImage).filter(value=>value.startsWith('url(')))];
    return Promise.all(images.map(async css=>{
      const url=css.slice(4,-1).replace(/^"|"$/g,''),image=new Image();image.src=url;
      try{await image.decode();return {loaded:true,width:image.naturalWidth,height:image.naturalHeight};}catch{return {loaded:false,width:0,height:0};}
    }));
  },selector);
  assert.ok(atlas.length>0,`${label}: local atlas used`);
  atlas.forEach(image=>assert.ok(image.loaded&&image.width===image.height&&image.width>=512,`${label}: square atlas loads offline: ${JSON.stringify(image)}`));
  return state.list;
}
async function snapshot(page,label){await page.screenshot({path:path.join(output,`${label}.png`),animations:'disabled'});}
async function main(){
  unit();if(unitOnly)return;
  if(standalone){const isolated=path.join(output,'isolated-prototype.html');fs.copyFileSync(source,isolated);source=isolated;}
  const base=pathToFileURL(source).href,browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',offline:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
  try{
    await page.goto(base);
    await page.locator('#cabinet-feed-insights[aria-busy="true"]').waitFor();
    assert.equal(await page.locator('.cabinet-skeleton .bpm-avatar-portrait').count(),0,'Loading skeletons are not replaced with people');
    await cabinetReady(page);
    const originalData=await dataSnapshot(page);
    await portraits(page,'#cabinet-panel','Cabinet cards',{minimum:10});
    await portraits(page,'.header-actions','Header profile');await snapshot(page,'cabinet-portraits-1440');
    const originalProfile=await page.locator('#profile .bpm-avatar-portrait').getAttribute('data-bpm-portrait');
    report('Cabinet cards and profile use local portraits; loader/skeleton content untouched');

    await page.goto(`${base}#main`);await page.locator('#results .entity-card:not(.skeleton-card)').first().waitFor();
    await portraits(page,'#results','Registry cards',{minimum:2});
    await page.locator('#table-view').click();await page.locator('#results .registry-table tr[data-record]').first().waitFor();
    await portraits(page,'#results','Registry table',{minimum:2});await snapshot(page,'registry-table-portraits-1440');
    report('Entity registry cards/table preserve person identity and circle geometry');

    await page.goto(`${base}#insights`);await insightReady(page);
    await portraits(page,'#insights-results','Insight cards',{minimum:2});
    await page.locator('#insights-table').click();await insightReady(page);await portraits(page,'#insights-results','Insight table',{minimum:2});
    await page.locator('[data-insight-open="INS-000055"]').click();await page.locator('#insight-detail-title').waitFor();
    await page.locator('#insights-detail-view .id-detail-participants').scrollIntoViewIfNeeded();
    await portraits(page,'#insights-detail-view','Insight participants',{minimum:2});await snapshot(page,'insight-participants-portraits-1440');
    await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await insightReady(page);
    const missingOwner=await page.evaluate(()=>BpmInsightStore.list().find(row=>BpmAvatars.isMissing(row.owner))?.id);assert.ok(missingOwner,'Seed data includes an existing insight with an unassigned owner');
    await page.locator(`[data-insight-open="${missingOwner}"]`).click();await page.locator('#insight-detail-title').waitFor();
    await page.locator('#insights-detail-view .id-detail-participants').scrollIntoViewIfNeeded();
    await portraits(page,'#insights-detail-view','Existing insight fictional owner',{minimum:2});
    await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await insightReady(page);
    await page.locator('#insights-create').click();await page.locator('#insight-create-drawer[open]').waitFor();
    await page.locator('#insight-create-drawer .ic-participants').scrollIntoViewIfNeeded();await portraits(page,'#insight-create-drawer','Insight creation participants',{minimum:2});
    assert.equal(await page.locator('#ic-process-input').inputValue(),'','Portrait fallback does not auto-select a process in a new insight');
    const authorBefore=await page.locator('#insight-create-drawer .ic-person').last().locator('.bpm-avatar-portrait').getAttribute('data-bpm-portrait');
    await choose(page,'ic-process');await page.locator('#insight-create-drawer .ic-participants').scrollIntoViewIfNeeded();
    await portraits(page,'#insight-create-drawer','Insight creation selected process participants',{minimum:2});
    const selectedOwner=await page.locator('#ic-owner-name').textContent();
    assert.equal(await page.evaluate(name=>BpmAvatars.isMissing(name),selectedOwner),false,'Selected process shows its read-only owner FIO');
    assert.equal(await page.locator('#ic-owner-avatar .bpm-avatar-portrait').getAttribute('data-bpm-person'),await page.evaluate(name=>BpmAvatars.normalize(name),selectedOwner),'Selected process owner label agrees with its portrait');
    assert.equal(await page.locator('#insight-create-drawer .ic-person').last().locator('.bpm-avatar-portrait').getAttribute('data-bpm-portrait'),authorBefore,'Changing selected process preserves author identity');
    await page.keyboard.press('Escape');
    if(await page.locator('dialog[open] [data-discard]').count())await page.locator('dialog[open] [data-discard]').click();
    await page.locator('#insight-create-drawer[open]').waitFor({state:'hidden'});
    report('Insight cards/table/detail/create share portraits; selecting process updates owner without changing author');

    await page.goto(`${base}#tasks`);await taskReady(page);await page.locator('[data-task-tab="all"]').click();await taskReady(page);
    await portraits(page,'#tasks-results','Task table',{minimum:4});
    assert.equal(await page.locator('#tasks-results .task-avatar-overflow .bpm-avatar-portrait').count(),0,'+N counters remain counters');
    await page.locator('#tasks-cards').click();await taskReady(page);await portraits(page,'#tasks-results','Task cards',{minimum:2});
    const typical=await page.evaluate(()=>BpmTaskStore.list().find(task=>!task.flowType));assert.ok(typical);
    await page.evaluate(id=>BpmTaskFlow.open({mode:'view',taskId:id}),typical.id);await page.locator('#task-flow[open]').waitFor();
    await page.locator('#task-flow .tf-content').evaluate(node=>node.scrollTop=node.scrollHeight);await portraits(page,'#task-flow','Typical task participants',{minimum:2});
    await page.evaluate(()=>BpmTaskFlow.close({immediate:true,restoreFocus:false}));await page.locator('#task-flow[open]').waitFor({state:'hidden'});
    await page.evaluate(()=>BpmTaskFlow.open({mode:'create'}));await page.locator('#task-flow[open]').waitFor();
    assert.equal(await page.locator('#tf-assignees-input').inputValue(),'','Typical task required assignees stay unselected in a new form');
    await choose(page,'tf-assignees');await page.locator('#tf-assignee-avatars').scrollIntoViewIfNeeded();await portraits(page,'#task-flow','Typical task selected assignees');
    await page.evaluate(()=>BpmTaskFlow.close({immediate:true,restoreFocus:false}));await page.locator('#task-flow[open]').waitFor({state:'hidden'});
    await page.evaluate(()=>BpmSpecialTaskFlow.open({typeId:'insight',mode:'create',insightId:'INS-000067'}));await page.locator('#special-task-flow[open]').waitFor();
    assert.equal(await page.locator('#stf-assignees-input').inputValue(),'','Special task required assignees stay unselected in a new form');
    await choose(page,'stf-assignees');await page.locator('#stf-assignees-avatars').scrollIntoViewIfNeeded();await portraits(page,'#special-task-flow','Special task selected assignees');
    await page.evaluate(()=>BpmSpecialTaskFlow.close({immediate:true,restoreFocus:false}));await page.locator('#special-task-flow[open]').waitFor({state:'hidden'});
    await page.evaluate(()=>BpmSpecialTaskFlow.open({typeId:'insight-work',mode:'create',insightId:'INS-000067'}));await page.locator('#special-task-flow[open]').waitFor();
    assert.equal(await page.locator('#stf-executor-input').count(),0,'Compact insight work task does not use a single executor selector');
    assert.equal(await page.locator('#stf-assignees-input').inputValue(),'','Compact required responsibilities are not automatically assigned');
    assert.equal(await page.locator('#stf-assignees-avatars .bpm-avatar-portrait').count(),0,'Unselected compact responsibilities do not display fictional assigned faces');
    assert.equal(await page.locator('#stf-deadline-note img').count(),1,'Compact optional date retains the trackerclock');
    await page.locator('#stf-assignees-input').click();
    assert.equal(await page.locator('#stf-assignees-list').getAttribute('aria-multiselectable'),'true','Compact responsibilities support multiple people');
    const compactPeople=await page.locator('#stf-assignees-list [data-option]:not([data-option=""])').evaluateAll(nodes=>nodes.slice(0,2).map(node=>node.dataset.option));
    assert.equal(compactPeople.length,2);await page.keyboard.press('Escape');
    for(const name of compactPeople)await choose(page,'stf-assignees',name);
    assert.equal(await page.locator('#stf-assignees-input').inputValue(),'Выбрано 2');
    await page.locator('#stf-assignees-avatars').scrollIntoViewIfNeeded();
    await portraits(page,'#stf-assignees-avatars','Compact two responsible portraits',{minimum:2});
    assert.deepEqual(await page.locator('#stf-assignees-avatars .bpm-avatar-portrait').evaluateAll(nodes=>nodes.map(node=>node.dataset.bpmPerson)),await page.evaluate(names=>names.map(name=>BpmAvatars.normalize(BpmAvatars.displayName(name))),compactPeople),'Compact avatar names match both selected responsibilities');
    const compactGeometry=await page.locator('#stf-assignees-avatars').evaluate(node=>({top:node.getBoundingClientRect().top,inputBottom:document.querySelector('#stf-assignees-input').getBoundingClientRect().bottom}));
    assert.ok(compactGeometry.top>=compactGeometry.inputBottom-1,'Compact avatars sit below their multiple selector');
    await choose(page,'stf-assignees',compactPeople[0]);
    assert.equal(await page.locator('#stf-assignees-avatars .bpm-avatar-portrait').count(),1,'Deselecting one responsibility removes only their portrait');
    await page.locator('#stf-assignees .select-toggle.is-clear').click();await paint(page);
    assert.equal(await page.locator('#stf-assignees-input').inputValue(),'');assert.equal(await page.locator('#stf-assignees-avatars .bpm-avatar-portrait').count(),0,'Clearing responsibilities removes the avatar group');
    await page.evaluate(()=>BpmSpecialTaskFlow.close({immediate:true,restoreFocus:false}));await page.locator('#special-task-flow[open]').waitFor({state:'hidden'});
    assert.equal(await dataSnapshot(page),originalData,'Viewing registries/details and cancelling creation forms does not change store data or assign fictional people');
    const systemTask=await page.evaluate(()=>BpmTaskStore.create({flowType:'insight',title:'Проверка системного инициатора QA',initiator:'Система',insightId:'INS-000067',assignees:[BpmTaskStore.currentUser]}));
    await page.evaluate(id=>BpmSpecialTaskFlow.open({mode:'view',taskId:id}),systemTask.id);await page.locator('#special-task-flow[open]').waitFor();
    await page.locator('#special-task-flow .tf-content').evaluate(node=>node.scrollTop=node.scrollHeight);
    const sys=page.locator('#special-task-flow .tf-avatar').filter({hasText:'SYS'});assert.equal(await sys.count(),1,'System initiator retains SYS marker');
    assert.equal(await sys.locator('.bpm-avatar-portrait').count(),0,'System marker is not a fictional person');
    await portraits(page,'#special-task-flow','Special task detail');await snapshot(page,'task-detail-portraits-1440');
    await page.evaluate(()=>BpmSpecialTaskFlow.close({immediate:true,restoreFocus:false}));await page.locator('#special-task-flow[open]').waitFor({state:'hidden'});
    report('Task table/cards/details/create portraits fill wrappers; +N and SYS system markers stay untouched');

    await page.reload();await taskReady(page);await portraits(page,'#tasks-results','Task table after reload',{minimum:2});
    const systemAvatar=page.locator(`#tasks-results [data-task-id="${systemTask.id}"]`).locator('xpath=ancestor::tr').locator('.task-table-initiator .task-avatar');
    assert.equal(await systemAvatar.textContent(),'SYS','System marker stays SYS in the task registry after reload');
    assert.equal(await systemAvatar.locator('.bpm-avatar-portrait').count(),0,'Registry system marker remains non-human');
    assert.equal(await page.locator('#profile .bpm-avatar-portrait').getAttribute('data-bpm-portrait'),originalProfile,'Profile portrait is stable after reload');
    await page.goto(base);await cabinetReady(page);await portraits(page,'#cabinet-panel','Cabinet after reload',{minimum:10});
    const tiles=new Set(observations.values());assert.ok(observations.size>=12&&tiles.size>=8,`Real prototype names have diverse stable portraits (${observations.size} names / ${tiles.size} tiles)`);
    await page.setViewportSize({width:390,height:844});await paint(page);await portraits(page,'#cabinet-panel','Mobile Cabinet',{minimum:2});
    assert.equal(await page.locator('#profile .bpm-avatar-portrait').getAttribute('data-bpm-portrait'),originalProfile,'Responsive profile hiding does not change its portrait');
    if(await page.locator('#profile').isVisible())await portraits(page,'.header-actions','Mobile profile');
    await snapshot(page,'cabinet-portraits-390');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Portrait substitution does not cause mobile page overflow');
    assert.deepEqual(errors,[],'No browser runtime errors');
    report('Portrait consistency survives view changes and reload, with mobile geometry and offline assets intact');
    console.log(JSON.stringify({source,standalone,output,names:observations.size,tiles:tiles.size}));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

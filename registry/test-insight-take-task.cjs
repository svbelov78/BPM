/* Insight owner decision → compact work task → same insight detail.
 * node registry/test-insight-take-task.cjs [registry/index.html | standalone.html]
 * Isolated, offline browser; no live profile or backend writes.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-take-task-'));
let source = path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
const standalone = path.basename(source)!=='index.html';
if(standalone){const isolated=path.join(output,'isolated-prototype.html');fs.copyFileSync(source,isolated);source=isolated;}
const base = pathToFileURL(source).href;
const detail = '#insights-detail-view';
const form = '#special-task-flow';
const save = `${form} .tf-footer [data-stf-action="save"]`;
const read = (page,id) => page.evaluate(id=>BpmInsightStore.get(id),id);
const tasks = page => page.evaluate(()=>BpmTaskStore.list());
const linked = (page,id) => page.evaluate(id=>BpmTaskStore.list().filter(task=>task.insightId===id||task.sourceInsightId===id),id);
const ready = page => page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const cabinetReady = page => page.waitForFunction(()=>!document.querySelector('#cabinet-panel')?.hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
const report = text => console.log(`PASS — ${text}`);
async function paint(page){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});}
async function review(page,selector=`${form} .tf-content`){await page.locator(selector).evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});await paint(page);}
async function choose(page,key,value){
  await page.locator(`#stf-${key}-input`).click();
  const options=page.locator(`#stf-${key}-list [data-option]:not([data-option=""])`);
  const option=value?options.filter({hasText:value}).first():options.first();
  const chosen=await option.getAttribute('data-option');await option.click();await paint(page);
  if(await page.locator(`#stf-${key}-list`).count())await page.keyboard.press('Escape');
  if(key==='assignees')assert.equal(await page.locator('#stf-assignees-input').evaluate(node=>getComputedStyle(node).color),'rgb(26, 26, 26)','Selected responsible summary keeps the normal text color');
  return chosen;
}
async function assigneeOptions(page){
  await page.locator('#stf-assignees-input').click();
  assert.equal(await page.locator('#stf-assignees-list').getAttribute('aria-multiselectable'),'true','Responsible selector is multiple');
  const values=await page.locator('#stf-assignees-list [data-option]:not([data-option=""])').evaluateAll(nodes=>nodes.map(node=>node.dataset.option));
  await page.keyboard.press('Escape');assert.ok(values.length>=2,'At least two catalog people are available');return values;
}
async function responsibleAvatars(page,names,{view=false}={}){
  const selector=view?`${form} .tf-assignees .tf-avatar-group`:'#stf-assignees-avatars';
  const state=await page.locator(selector).evaluate(node=>{
    const r=node.getBoundingClientRect(),input=document.querySelector('#stf-assignees-input');
    return {names:[...node.querySelectorAll('.bpm-avatar-portrait')].map(p=>p.dataset.bpmPerson),legacy:node.querySelectorAll('img').length,top:r.top,inputBottom:input?.getBoundingClientRect().bottom,
      portraits:[...node.querySelectorAll('.bpm-avatar-portrait')].map(p=>{const a=p.getBoundingClientRect(),b=p.parentElement.getBoundingClientRect();return {width:a.width,height:a.height,parentWidth:b.width,parentHeight:b.height,index:Number(p.dataset.bpmPortrait),expected:BpmAvatars.portraitIndex(p.dataset.bpmPerson)};})};
  });
  const expected=await page.evaluate(names=>names.map(name=>BpmAvatars.normalize(BpmAvatars.displayName(name))),names);
  assert.deepEqual(state.names,expected,'Each chosen responsible has their own stable portrait');
  assert.equal(state.legacy,0,'Responsible avatars are portraits rather than generic icons');
  if(!view&&names.length)assert.ok(state.top>=state.inputBottom-1,'Portrait group sits below the responsible selector');
  state.portraits.forEach(p=>{assert.ok(Math.abs(p.width-p.parentWidth)<1&&Math.abs(p.height-p.parentHeight)<1,'Portrait fills the existing circular avatar');assert.equal(p.index,p.expected,'Portrait identity matches the selected FIO');});
}
async function trackerClock(page,{value=false}={}){
  const clock=page.locator('#stf-deadline-note');assert.equal(await clock.count(),1,'Compact deadline uses the existing trackerclock');
  assert.equal(await clock.locator('img').count(),1,'Trackerclock has one clock icon');
  assert.match(await clock.innerText(),value?/Срок:|Срок — сегодня/:/количество дней/,'Trackerclock reflects whether the optional deadline is filled');
}
async function open(page,id){
  if(await page.locator('#insights-panel.is-insight-detail').count())await page.locator('.insights-view-controls button[aria-pressed="true"]').click();
  await ready(page);await page.locator(`[data-insight-open="${id}"]`).click();
  await page.locator(`${detail}[data-insight-id="${id}"]`).waitFor();await paint(page);
}
async function take(page,id){
  await review(page,`${detail} .id-detail-scroll`);
  const before=await read(page,id),taskCount=(await tasks(page)).length;
  await page.locator(`${detail} [data-id-take]`).click();
  await page.locator(`${form}[open][data-type="insight-work"][data-mode="create"]`).waitFor();await paint(page);
  assert.equal((await read(page,id)).status,before.status,'Opening Take preserves the original business status');
  assert.equal((await tasks(page)).length,taskCount,'Opening Take does not create a task');
  return before;
}
async function compact(page,id){
  assert.equal(await page.locator('#stf-heading').textContent(),'Создать задачу','New form uses the requested heading');
  assert.equal(await page.locator('#stf-title').inputValue(),(await read(page,id)).title,'Title is prefilled from this insight');
  assert.equal(await page.locator(`${form} .tf-footer [data-stf-action="save"] .tf-button-label`).textContent(),'Создать задачу');
  assert.deepEqual(await page.locator(`${form} #stf-form [data-stf-key]`).evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.stfKey))].sort()),['deadline','description','title'],'Text/date controls match the compact screenshot');
  assert.equal(await page.locator('#stf-assignees-input').count(),1,'Exactly one responsible selector');
  assert.match(await page.locator('#stf-assignees .internal-label').textContent(),/^Ответственные/);
  const placeholder=await page.locator('#stf-assignees-input').evaluate(node=>({value:node.value,placeholder:node.placeholder,color:getComputedStyle(node,'::placeholder').color}));
  assert.equal(placeholder.value,'','New task does not auto-select responsible people');
  assert.equal(placeholder.placeholder,'Выберите');
  assert.equal(placeholder.color,'rgb(196, 196, 196)','Responsible placeholder has the design-system placeholder color');
  await responsibleAvatars(page,[]);await trackerClock(page);
  assert.equal(await page.locator('#stf-executor-input,#stf-processId-input,#stf-insightId-input').count(),0,'No single executor, process or insight selector is added');
  assert.match(await page.locator(form).innerText(),/Задача будет создана в Sber BPM и передана в SberTrack\./);
  assert.equal(await page.locator(`${form} [data-stf-action="back"]`).count(),0,'Task form does not route away to the type chooser');
}
async function geometry(page,width,label){
  await page.setViewportSize({width,height:width===3840?2160:920});await paint(page);
  const box=await page.locator(form).evaluate(node=>{const r=node.getBoundingClientRect(),content=node.querySelector('.tf-content'),footer=node.querySelector('.tf-footer');return {width:r.width,left:r.left,right:r.right,scroll:content.scrollWidth,client:content.clientWidth,footerBottom:footer.getBoundingClientRect().bottom,viewport:innerWidth,page:document.documentElement.scrollWidth,bottom:r.bottom};});
  const expected=width<=767?width:(width-328)*5/12+96;
  assert.ok(Math.abs(box.width-expected)<2,`${label}: five-column drawer geometry at ${width}: ${JSON.stringify(box)}`);
  assert.ok(box.left>=-1&&box.right<=width+1&&box.page<=width+1&&box.scroll<=box.client+1,`${label}: no page/form horizontal overflow`);
  assert.ok(box.footerBottom<=box.bottom+1,`${label}: footer stays within drawer`);
  const broken=await page.locator(`${form} img:visible`).evaluateAll(async images=>{await Promise.all(images.map(image=>image.decode().catch(()=>{})));return images.filter(image=>!image.complete||!image.naturalWidth).map(image=>image.src.slice(0,100));});
  assert.deepEqual(broken,[],`${label}: visible icons load`);
  await page.screenshot({path:path.join(output,`${label}-${width}.png`),animations:'disabled'});
}
async function validationWidths(page,width){
  await page.setViewportSize({width,height:width===390?844:920});await paint(page);
  return page.evaluate(()=>Object.fromEntries(['title','description','assignees'].map(key=>{
    const host=document.getElementById(`stf-${key}`),input=host.matches('input,textarea')?host:host.querySelector('input');
    return [key,input.closest('.field').getBoundingClientRect().width];
  })));
}
async function validationGeometry(page,width,baseline){
  await page.setViewportSize({width,height:width===390?844:920});await paint(page);
  const state=await page.locator(form).evaluate(node=>{
    const content=node.querySelector('.tf-content'),red=getComputedStyle(node).getPropertyValue('--red').trim();
    const probe=document.createElement('span');probe.style.color=red;node.append(probe);const redColor=getComputedStyle(probe).color;probe.remove();
    return {scroll:content.scrollWidth,client:content.clientWidth,page:document.documentElement.scrollWidth,
      fields:['title','description','assignees'].map(key=>{
        const host=document.getElementById(`stf-${key}`),input=host.matches('input,textarea')?host:host.querySelector('input'),control=input.closest('.field');
        const error=document.getElementById(`stf-${key}-error`),fieldBox=control.getBoundingClientRect(),errorBox=error.getBoundingClientRect(),fieldStyle=getComputedStyle(control),errorStyle=getComputedStyle(error);
        return {key,gap:errorBox.top-fieldBox.bottom,width:fieldBox.width,left:errorBox.left,right:errorBox.right,visible:!error.hidden&&errorBox.height>0,
          fontSize:errorStyle.fontSize,lineHeight:errorStyle.lineHeight,borderColor:fieldStyle.borderColor,shadow:fieldStyle.boxShadow,redColor};
      })};
  });
  assert.ok(state.scroll<=state.client+1&&state.page<=width+1,`Validation at ${width}: no form or page horizontal overflow`);
  for(const field of state.fields){
    assert.ok(field.visible,`${field.key}/${width}: required error remains visible`);
    assert.ok(Math.abs(field.gap-4)<.1,`${field.key}/${width}: error sits 4 CSS px below the control, actual ${field.gap}`);
    assert.ok(Math.abs(field.width-baseline[field.key])<.1,`${field.key}/${width}: showing an error preserves control width`);
    assert.ok(field.left>=-1&&field.right<=width+1,`${field.key}/${width}: error stays within the viewport`);
    assert.equal(field.fontSize,'13px',`${field.key}/${width}: error uses the component font size`);
    assert.equal(field.lineHeight,'18px',`${field.key}/${width}: error uses the component line height`);
    assert.ok([field.redColor,'rgb(255, 59, 48)'].includes(field.borderColor),`${field.key}/${width}: invalid control has a red border`);
    assert.ok(field.shadow.includes(field.redColor)&&field.shadow.includes('inset'),`${field.key}/${width}: invalid control retains its inset red frame`);
  }
  await page.locator('#stf-description-error').scrollIntoViewIfNeeded();await paint(page);
  const clip=await page.locator('#stf-description').evaluate(input=>{
    const box=input.closest('.stf-input-field').getBoundingClientRect(),x=Math.max(0,box.left-12),y=Math.max(0,box.top-12);
    return {x,y,width:Math.min(innerWidth-x,box.right+12-x),height:Math.min(innerHeight-y,box.bottom+12-y)};
  });
  await page.screenshot({path:path.join(output,`description-error-${width}.png`),clip,animations:'disabled'});
}
async function fill(page,{title,description='Выполнить изменения и проверить результат.',deadline,assignees}={}){
  if(title!==undefined)await page.locator('#stf-title').fill(title);
  await page.locator('#stf-description').fill(description);
  if(deadline!==undefined)await page.locator('#stf-deadline').fill(deadline);
  const selected=[];
  for(const name of assignees||(await assigneeOptions(page)).slice(0,2))selected.push(await choose(page,'assignees',name));
  await responsibleAvatars(page,selected);await trackerClock(page,{value:!!deadline});await review(page);
  return selected;
}
async function submit(page,id,{assignees,expected=1}={}){
  const count=(await tasks(page)).length,hash=new URL(page.url()).hash;
  if(id==='INS-000009'&&expected===1)await page.emulateMedia({reducedMotion:'no-preference'});
  await review(page);await page.locator(save).click();
  await page.locator(`${form}[open]`).waitFor({state:'hidden'});
  await page.locator(`${detail} .id-detail-tasks--loading[aria-busy="true"]`).waitFor();
  if(id==='INS-000009'&&expected===1){
    await paint(page);
    assert.equal(await page.locator(`${detail} .id-detail-task-loader`).evaluate(node=>getComputedStyle(node).animationName),'id-detail-task-loading','Loading spinner animates');
    assert.equal(await page.locator(`${detail} .id-detail-task-skeleton .skeleton-shape`).first().evaluate(node=>getComputedStyle(node,'::after').animationName),'bpm-shimmer','Loading skeleton uses the shared shimmer');
    const loadingGeometry=await page.locator(`${detail} .id-detail-footer`).evaluate(node=>({top:node.getBoundingClientRect().top,bottom:node.getBoundingClientRect().bottom,height:innerHeight,scrollY}));
    assert.ok(loadingGeometry.top>=0&&loadingGeometry.bottom<=loadingGeometry.height+1,`Loading keeps the insight footer on-screen: ${JSON.stringify(loadingGeometry)}`);
    const loaderGeometry=await page.locator(`${detail} .id-detail-task-loading`).evaluate(node=>{
      const loader=node.getBoundingClientRect(),scroll=node.closest('.id-detail-scroll').getBoundingClientRect();
      return {top:loader.top,bottom:loader.bottom,scrollTop:scroll.top,scrollBottom:scroll.bottom};
    });
    assert.ok(loaderGeometry.top>=loaderGeometry.scrollTop-1&&loaderGeometry.bottom<=loaderGeometry.scrollBottom+1,`Loading message is visibly inside the insight viewport: ${JSON.stringify(loaderGeometry)}`);
    await page.screenshot({path:path.join(output,'in-work-task-loading-1440.png'),animations:'allow'});
    await page.waitForTimeout(1000);
    assert.equal(await page.locator(`${detail} .id-detail-tasks--loading[aria-busy="true"]`).count(),1,'Task shimmer remains noticeable after one second');
    await page.emulateMedia({reducedMotion:'reduce'});
  }
  assert.ok(await page.locator(`${detail} .id-detail-task-skeleton`).count()>0,'Loading accordion exposes task skeletons');
  assert.equal(await page.locator(`${detail} .id-detail-task-loader`).count(),1,'Task loading has one loader');
  assert.match(await page.locator(`${detail} [data-id-accordion="tasks"]`).first().textContent(),new RegExp(`Задачи ${expected}`));
  assert.equal(await page.locator(`${detail} [data-id-accordion="tasks"]`).first().getAttribute('aria-expanded'),'true','Tasks are expanded immediately after creation');
  assert.equal(await page.locator(`${detail} .id-detail-footer--in-work .id-detail-work-note`).textContent(),'Работа над инсайтом производится в задаче');
  assert.equal(await page.locator(`${detail} .id-detail-footer [data-id-close]`).textContent(),'Закрыть');
  assert.equal(await page.locator(`${detail} .id-detail-footer [data-id-take],${detail} .id-detail-footer [data-id-reject]`).count(),0,'Owner decision actions are replaced');
  assert.match(await page.locator(`${detail} .id-detail-meta`).innerText(),/В работе/);
  assert.match(await page.locator(`${detail} .id-detail-footer .id-detail-status`).innerText(),/В работе/);
  assert.equal(new URL(page.url()).hash,hash,'Creation does not navigate away');
  await page.locator(`${detail} .id-detail-tasks[aria-busy="false"]`).waitFor();
  assert.equal(await page.locator(`${detail} .id-detail-task`).count(),expected,'Loading resolves to real linked task cards');
  const saved=await linked(page,id),insight=await read(page,id);
  assert.equal((await tasks(page)).length,count+1,'One submit creates exactly one task');
  assert.equal(saved.length,expected,'Only this insight’s tasks are listed');
  assert.equal(insight.status,'В работе');
  const newest=saved.find(task=>task.number===Math.max(...saved.map(item=>item.number)));
  assert.equal(newest.flowType,'insight-work');assert.equal(newest.type,'Работа над инсайтом');
  assert.equal(newest.insightId,id);assert.equal(newest.insightTitle,insight.title);
  assert.equal(newest.processId,insight.related[0].id);
  if(assignees){assert.deepEqual(newest.assignees,assignees,'All selected responsible people are persisted');assert.equal(newest.executor||'','','New task does not prematurely assign a completion actor');}
  assert.ok(insight.detail.taskIds.includes(newest.id),'Insight stores the linked task ID explicitly');
  return newest;
}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:920},reducedMotion:'reduce',offline:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
  try{
    await page.goto(`${base}#insights`);await ready(page);
    const id='INS-000009';await open(page,id);
    const before=await take(page,id);await compact(page,id);
    for(const width of [1440,390,3840])await geometry(page,width,'take-create');
    await page.setViewportSize({width:1440,height:920});await paint(page);
    await page.locator('#stf-description').fill('Отменённая задача не должна существовать.');
    await page.locator(`${form} .tf-footer [data-stf-action="cancel"]`).click();
    await page.locator(`${form}[open]`).waitFor({state:'hidden'});
    assert.deepEqual(await read(page,id),before,'Cancel preserves insight data/status');assert.equal((await linked(page,id)).length,0);
    assert.equal(await page.locator(`${detail} [data-id-take]`).evaluate(node=>node===document.activeElement),true,'Cancel restores Take focus');
    await take(page,id);await compact(page,id);await page.keyboard.press('Escape');
    await page.locator(`${form}[open]`).waitFor({state:'hidden'});
    assert.deepEqual(await read(page,id),before,'Escape preserves insight data/status');assert.equal((await linked(page,id)).length,0);
    await page.setViewportSize({width:390,height:520});await take(page,id);
    const shortProgress=await page.locator(save).evaluate(node=>{
      const scroll=node.closest('dialog').querySelector('.tf-content');
      return {pending:node.dataset.scrollPending,progress:Number(node.dataset.scrollProgress),fraction:(scroll.scrollTop+scroll.clientHeight)/scroll.scrollHeight,remaining:scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop};
    });
    assert.ok(shortProgress.remaining>0&&shortProgress.remaining<400,`Small form has a short scroll distance: ${JSON.stringify(shortProgress)}`);
    assert.equal(shortProgress.pending,'true','Short form still waits for its remaining content');
    assert.ok(Math.abs(shortProgress.progress-shortProgress.fraction)<0.0002,'Ring progress includes the already visible portion of the short form');
    await review(page);
    assert.notEqual(await page.locator(save).getAttribute('data-scroll-pending'),'true','Short remaining scroll completes the review ring');
    await page.keyboard.press('Escape');await page.locator(`${form}[open]`).waitFor({state:'hidden'});
    await page.setViewportSize({width:1440,height:920});await paint(page);
    report('Take opens compact five-column form; cancel/Escape preserve business state and tasks');

    await take(page,id);
    const validationBaselines={};
    for(const width of [1440,390])validationBaselines[width]=await validationWidths(page,width);
    await page.setViewportSize({width:1440,height:920});await paint(page);
    await page.locator('#stf-title').fill('');await review(page);await page.locator(save).click();
    assert.equal(await page.locator('#stf-title').getAttribute('aria-invalid'),'true');
    assert.equal(await page.locator('#stf-description').getAttribute('aria-invalid'),'true');
    assert.equal(await page.locator('#stf-assignees-input').getAttribute('aria-invalid'),'true');
    assert.equal(await page.locator('#stf-deadline').getAttribute('aria-invalid'),null,'Deadline is optional');
    assert.equal((await linked(page,id)).length,0,'Invalid submit creates nothing');
    for(const width of [1440,390])await validationGeometry(page,width,validationBaselines[width]);
    await page.setViewportSize({width:1440,height:920});await paint(page);
    const title=before.title+' — QA',assignees=await fill(page,{title,deadline:''});
    for(const key of ['title','description','assignees'])assert.equal(await page.locator(`#stf-${key}-error`).isHidden(),true,`${key}: filling the required control clears its error`);
    report('Required title, description and responsible errors sit 4px below controls at desktop/mobile; widths, typography, red frame and error clearing are preserved');
    assert.equal(await page.locator('#stf-assignees-input').inputValue(),'Выбрано 2','Two catalog people remain selected together');
    await choose(page,'assignees',assignees[0]);
    assert.equal(await page.locator('#stf-assignees-input').inputValue(),'Выбрано 1','Clicking a selected person deselects only that person');
    await responsibleAvatars(page,[assignees[1]]);
    await page.locator('#stf-assignees .select-toggle.is-clear').click();await paint(page);
    assert.equal(await page.locator('#stf-assignees-input').inputValue(),'','Clear removes the entire responsible selection');
    await responsibleAvatars(page,[]);await review(page);await page.locator(save).click();
    assert.equal(await page.locator('#stf-assignees-input').getAttribute('aria-invalid'),'true','At least one responsible is required after clearing');
    assert.equal((await linked(page,id)).length,0,'Cleared required responsibilities cannot create a task');
    assert.equal((await read(page,id)).status,before.status,'Invalid responsible selection does not take the insight in work');
    for(const name of assignees)await choose(page,'assignees',name);
    await responsibleAvatars(page,assignees);
    const first=await submit(page,id,{assignees});assert.equal(first.title,title);assert.equal(first.deadline,'','Optional deadline remains empty');
    await page.screenshot({path:path.join(output,'in-work-first-task-1440.png'),animations:'disabled'});
    await page.locator(`${detail} [data-id-task="${first.id}"]`).filter({hasText:title}).click();
    await page.locator(`${form}[open][data-mode="view"][data-type="insight-work"]`).waitFor();
    assert.equal(await page.locator(`${form} .tf-task-title`).textContent(),title,'Task card opens the new task detail');
    await responsibleAvatars(page,assignees,{view:true});
    assert.match(await page.locator(`${form} .tf-assignees`).innerText(),/Выбрано 2/,'View renders both saved responsible people');
    await page.locator(`${form} .tf-edit-title[data-stf-action="edit"]`).click();
    await page.locator(`${form}[data-mode="edit"]`).waitFor();
    assert.equal(await page.locator('#stf-assignees-input').inputValue(),'Выбрано 2','Editing restores both selected people');
    await responsibleAvatars(page,assignees);await trackerClock(page);
    await page.locator('#stf-description').fill('Два ответственных сохранены при редактировании.');
    await review(page);await page.locator(save).click();await page.locator(`${form}[data-mode="view"]`).waitFor();
    assert.deepEqual(await page.evaluate(id=>BpmTaskStore.get(id).assignees,first.id),assignees,'Editing persists both responsible people without replacing them with one executor');
    await responsibleAvatars(page,assignees,{view:true});
    await page.locator(`${form} [data-stf-action="close"]`).first().click();await page.locator(`${form}[open]`).waitFor({state:'hidden'});
    assert.equal(await page.locator(`${detail}[data-insight-id="${id}"]`).count(),1,'Closing linked task returns to the same insight');
    await page.locator(`${detail} [data-id-create-task]`).click();await page.locator(`${form}[open]`).waitFor();await compact(page,id);
    const secondAssignees=await fill(page,{description:'Вторая задача по этому инсайту.',deadline:'20.10.2030'});
    const second=await submit(page,id,{assignees:secondAssignees,expected:2});assert.equal(second.deadline,'2030-10-20');
    report('Multi-responsible choose/deselect/clear/minimum-one validation, portraits, trackerclock, view/edit, shimmer/loading and second task creation');

    await page.reload();await ready(page);await open(page,id);
    assert.equal((await linked(page,id)).length,2);assert.equal((await read(page,id)).status,'В работе');
    assert.equal(await page.locator(`${detail} .id-detail-task`).count(),2,'Reload renders the two actual linked tasks');
    assert.equal(await page.locator(`${detail} .id-detail-tasks--loading`).count(),0,'Reload does not replay creation loading');
    assert.deepEqual(await page.evaluate(id=>BpmTaskStore.get(id).assignees,first.id),assignees,'Both first task responsible people survive reload');
    assert.deepEqual(await page.evaluate(id=>BpmTaskStore.get(id).assignees,second.id),secondAssignees,'Both second task responsible people survive reload');
    await page.locator(`${detail} [data-id-task="${first.id}"]`).filter({hasText:title}).click();await page.locator(`${form}[open][data-mode="view"]`).waitFor();
    await responsibleAvatars(page,assignees,{view:true});
    await page.locator(`${form} [data-stf-action="close"]`).first().click();await page.locator(`${form}[open]`).waitFor({state:'hidden'});
    for(const width of [1440,390,3840]){
      await page.setViewportSize({width,height:width===3840?2160:920});await paint(page);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`In-work detail no page overflow at ${width}`);
      await page.screenshot({path:path.join(output,`in-work-detail-${width}.png`),animations:'disabled'});
    }
    await page.setViewportSize({width:1440,height:920});await page.locator(`${detail} [data-id-close]`).click();await ready(page);
    assert.equal(await page.locator(`[data-insight-tab="${id}"]`).count(),0,'Close actually removes the accepted insight tab');
    assert.equal((await linked(page,id)).length,2,'Closing does not delete linked tasks');
    report('Reload persistence, real tab Close and in-work layout at 390/1440/3840px');

    // Single-executor legacy records remain readable without rewriting their
    // assignments merely by opening a drawer or cancelling edit.
    const legacy=await page.evaluate(executor=>BpmTaskStore.create({flowType:'insight-work',title:'QA legacy исполнителя',description:'Старая задача с executor и пустыми assignees.',insightId:'INS-000067',executor,assignees:[]}),assignees[0]);
    await page.evaluate(id=>BpmSpecialTaskFlow.open({mode:'view',taskId:id}),legacy.id);await page.locator(`${form}[open][data-mode="view"]`).waitFor();
    await responsibleAvatars(page,[assignees[0]],{view:true});
    assert.deepEqual(await page.evaluate(id=>BpmTaskStore.get(id).assignees,legacy.id),[],'Legacy view fallback is presentation-only');
    await page.locator(`${form} .tf-edit-title[data-stf-action="edit"]`).click();await page.locator(`${form}[data-mode="edit"]`).waitFor();
    assert.equal(await page.locator('#stf-assignees-input').inputValue(),'Выбрано 1','Legacy executor initializes the editable responsible selection');
    await responsibleAvatars(page,[assignees[0]]);
    await page.locator(`${form} .tf-footer [data-stf-action="cancel"]`).click();await page.locator(`${form}[data-mode="view"]`).waitFor();
    assert.deepEqual(await page.evaluate(id=>BpmTaskStore.get(id),legacy.id),legacy,'Cancelling legacy edit does not alter the stored executor/assignees record');
    await page.locator(`${form} [data-stf-action="close"]`).first().click();await page.locator(`${form}[open]`).waitFor({state:'hidden'});
    report('Legacy single-executor view/edit fallback is compatible and does not silently mutate saved assignments');

    // Stale owner decision is rechecked at submit, not merely at form opening.
    const staleId='INS-000054';await open(page,staleId);const staleBefore=await take(page,staleId);
    await compact(page,staleId);const staleAssignees=await fill(page,{description:'Это решение стало недоступным.'});assert.equal(staleAssignees.length,2);
    const beforeStaleTasks=(await tasks(page)).length;
    await page.evaluate(id=>BpmInsightStore.update(id,{status:'Отклонено'}),staleId);
    await review(page);await page.locator(save).click();
    assert.equal((await tasks(page)).length,beforeStaleTasks,'Stale rejected insight cannot create a task');
    assert.equal((await read(page,staleId)).status,'Отклонено','Stale submit cannot overwrite a newer status');
    if(await page.locator(`${form}[open]`).count())await page.locator(`${form} [data-stf-action="cancel"]`).click();
    await page.locator(`${form}[open]`).waitFor({state:'hidden'});
    await page.evaluate(row=>BpmInsightStore.update(row.id,{status:row.status,detail:row.detail}),staleBefore);
    report('Stale decision is denied without an orphan task or status overwrite');

    await page.locator('#cabinet-nav').click();await cabinetReady(page);
    await page.locator(`#cabinet-feed-insights [data-cabinet-open="${staleId}"] .card-title`).click();
    await page.locator(`#cabinet-insight-drawer[open] ${detail}[data-insight-id="${staleId}"]`).waitFor();
    await take(page,staleId);await compact(page,staleId);
    assert.equal(await page.locator('dialog[open]').count(),2,'Work form stacks above Cabinet insight drawer');
    assert.equal(await page.locator('#cabinet-panel').isVisible(),true,'Cabinet stays visible');
    const cabinetAssignees=await fill(page,{description:'Работа по инсайту из кабинета.',deadline:''});
    await submit(page,staleId,{assignees:cabinetAssignees});
    assert.equal(await page.locator('#cabinet-insight-drawer[open]').count(),1,'Creation closes only the task drawer');
    assert.equal(await page.locator('#cabinet-panel').isVisible(),true,'Global task callback does not navigate Cabinet away');
    await page.locator(`${detail} [data-id-close]`).click();await page.locator('#cabinet-insight-drawer[open]').waitFor({state:'hidden'});
    assert.equal(await page.locator(`[data-insight-tab="${staleId}"]`).count(),0,'Cabinet Close removes the associated internal tab');
    assert.equal(await page.locator('#cabinet-panel').isVisible(),true);
    report('Nested Cabinet flow stays in place and Close returns to Cabinet while removing its tab');

    // Compact per-open callbacks must not replace the generic global callback.
    await page.evaluate(()=>BpmSpecialTaskFlow.open({typeId:'insight',mode:'create',insightId:'INS-000067',processId:BpmInsightStore.get('INS-000067').related[0].id}));
    await page.locator(`${form}[open][data-type="insight"]`).waitFor();
    await page.locator('#stf-title').fill('QA обычного типа задачи к инсайту');
    await page.locator('#stf-deadline').fill('20.10.2030');await choose(page,'assignees');await review(page);
    const genericCount=(await tasks(page)).length;await page.locator(save).click();await page.locator(`${form}[open]`).waitFor({state:'hidden'});
    await page.waitForFunction(()=>!document.querySelector('#tasks-panel')?.hidden&&document.querySelector('#tasks-results')?.getAttribute('aria-busy')==='false');
    assert.equal((await tasks(page)).length,genericCount+1);assert.equal(new URL(page.url()).hash,'#tasks','Generic onCreated still navigates to Tasks');
    const generic=(await tasks(page)).find(task=>task.title==='QA обычного типа задачи к инсайту');assert.equal(generic.flowType,'insight');
    assert.deepEqual(errors,[],'No browser runtime errors');
    report('Existing generic task callback and old insight task type remain independent; offline runtime is clean');
    console.log(JSON.stringify({source,standalone,output}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

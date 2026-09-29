/* Eight PDF-derived task flows. Isolated browser context; never uses a live profile.
 * node test-special-task-flow.cjs [group ...]
 * BPM_SPECIAL_TASK_FILE=../Sber-BPM-Registry-Standalone.html node test-special-task-flow.cjs
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source = process.env.BPM_SPECIAL_TASK_FILE || process.env.BPM_TASK_FLOW_FILE;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-special-task-qa-'));
let base = process.env.BPM_SPECIAL_TASK_URL || process.env.BPM_TASKS_URL || pathToFileURL(path.join(__dirname, 'index.html')).href;
if (source) {
  const target = path.join(output, 'renamed-special-task-prototype.html');
  fs.copyFileSync(path.resolve(source), target);
  base = pathToFileURL(target).href;
}
const types = [
  'extended-access', 'role-management', 'process-result-approval',
  'business-description-checklist', 'metric-inapplicability',
  'bulk-metric-inapplicability', 'business-description-update', 'insight'
];
const report = message => console.log(`PASS — ${message}`);
const action = (page, name) => page.locator(`#special-task-flow [data-stf-action="${name}"]`);
const footer = (page, name) => page.locator(`#special-task-flow .tf-footer [data-stf-action="${name}"]`);
const ready = page => page.waitForFunction(() => document.querySelector('#tasks-results')?.getAttribute('aria-busy') === 'false');
async function draftProbe(page) {
  return await page.locator('#stf-title').count() ? page.locator('#stf-title') : page.locator('#stf-description');
}
async function mode(page, value) {
  await page.waitForFunction(value => {
    const node = document.getElementById('special-task-flow');
    return node?.open && !node.inert && node.dataset.mode === value;
  }, value);
}
async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function fresh(page) {
  await page.setViewportSize({width:1920, height:1080});
  await page.goto(`${base.split('#')[0]}#tasks`);
  await page.evaluate(() => localStorage.removeItem('bpm-task-store:v1'));
  await page.reload();
  await ready(page);
}
async function viewport(page, width) {
  await page.setViewportSize({width, height:1080});
  await paint(page);
  if (width < 768 && await page.locator('body').evaluate(node => node.classList.contains('mobile-menu-open'))) {
    await page.locator('#collapse-menu').click();
  }
  await page.waitForFunction(() => !document.body.classList.contains('mobile-menu-open'));
}
async function create(page, type) {
  await page.locator('#tasks-create').click();
  await page.locator('#task-drawer[open]').waitFor();
  await page.locator(`#task-drawer [data-task-type="${type}"]`).click();
  await mode(page, 'create');
  assert.equal(await page.locator('#task-drawer').evaluate(node => node.open), false, `${type}: chooser closes`);
  assert.equal(await page.locator('#task-flow[open]').count(), 0, `${type}: typical flow is not opened`);
}
async function close(page, method = 'escape', trigger = '#tasks-create') {
  if (method === 'button') await action(page, 'close').first().click();
  else if (method === 'cancel') await footer(page, 'cancel').click();
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('special-task-flow')?.open && !document.body.classList.contains('task-drawer-open'));
  assert.equal(await page.locator('body').evaluate(node => node.classList.contains('task-drawer-open')), false, 'Closing restores page scroll');
  if (trigger) assert.ok(await page.locator(trigger).evaluate(node => node === document.activeElement), 'Closing restores usable focus');
}
async function choose(page, key, value, prefix='stf') {
  const input = page.locator(`#${prefix}-${key}-input`);
  await input.click();
  const candidates = page.locator(`#${prefix}-${key}-list [data-option]:not([data-option=""])`);
  const option = value ? candidates.filter({hasText:value}).first() : candidates.first();
  await option.click();
  if (await page.locator(`#${prefix}-${key}-list`).count()) await page.keyboard.press('Escape');
  await paint(page);
  assert.ok(await page.locator('#special-task-flow').evaluate(node => node.open), `${key}: closing popup preserves form`);
}
const record = (page,id) => page.evaluate(id=>window.BpmTaskStore.get(id),id);
const lifecycle = (page,id) => action(page,`lifecycle:${id}`);
async function choice(page,key,value,prefix='stf') {
  const input=page.locator(`#special-task-flow input[name="${prefix}-${key}"][value="${value}"]`);
  if(!await input.isChecked())await input.locator('..').click();
  await paint(page);
  assert.equal(await input.isChecked(),true,`${prefix}/${key}/${value}: visible choice changes native checked state`);
}
async function prepare(page,type,{operation='create',title=`QA ${type} <не HTML>`}={}) {
  if (await page.locator('#stf-title').count()) await page.locator('#stf-title').fill(title);
  if (await page.locator('#stf-deadline').count()) await page.locator('#stf-deadline').fill('20.10.2026');
  if (type==='process-result-approval' && operation!=='create') await choice(page,'operation',operation);
  if (await page.locator('#stf-processId-input').count()) await choose(page,'processId');
  if (await page.locator('#stf-description').count()) await page.locator('#stf-description').fill('Обоснование QA & проверка <экранирования>');
  const user=await page.evaluate(()=>window.BpmTaskStore.currentUser);
  if (await page.locator('#stf-assignees-input').count()) await choose(page,'assignees',user);
  if (type==='role-management') {
    await choose(page,'resultVariant');await choose(page,'role');await choose(page,'candidate',user);
  } else if (type==='insight') {
    await choose(page,'insightId');
  } else if (type==='business-description-checklist'||type==='business-description-update') {
    await choose(page,'businessDescriptionId');
  } else if (type==='bulk-metric-inapplicability') {
    await choose(page,'channels','ВСП');await choose(page,'metricIds','Длительность');
    await choice(page,'indefinite','true');
    await page.locator('#stf-reason').fill('Демонстрационный период неприменимости');
  } else if (type==='metric-inapplicability') {
    await addItem(page,'metrics');
  } else if (type==='process-result-approval') {
    if (operation==='create') await addItem(page,'proposedVariants');
    else {
      await choose(page,'selectedVariantId');
      if (operation==='change') {
        await page.locator('#stf-newTitle').fill('Обновлённое название результата QA');
        for(const key of ['newService','newSegment','newChannel','newBusinessDescription'])await choose(page,key);
      } else await page.locator('#stf-description').fill('Вариант больше не используется — демонстрационное обоснование');
    }
  }
}
async function addItem(page,key,title='Новый вариант результата QA') {
  await page.locator(`#special-task-flow [data-stf-action="item-add"][data-field="${key}"]`).click();
  await page.locator('#special-task-flow .tf-sheet').waitFor();
  if(key==='metrics') {
    await choose(page,'value',undefined,'sts');
    await page.locator('#sts-reason').fill('Метрика неприменима для данного варианта процесса');
  } else {
    await page.locator('#sts-title').fill(title);
    for(const name of ['channel','service','segment','businessDescription'])await choose(page,name,undefined,'sts');
  }
  await action(page,'sheet-save').click();
  await page.waitForFunction(()=>!document.querySelector('#special-task-flow .tf-sheet'));
}
async function finish(page,id,{comment='Комментарий независимой QA',required=false,double=false}={}) {
  await lifecycle(page,id).click();
  if(await page.locator('#special-task-flow .tf-sheet').count()) {
    if(required) {
      await action(page,'sheet-save').click();
      assert.equal(await page.locator('#sts-comment').getAttribute('aria-invalid'),'true',`${id}: comment is required`);
    }
    await page.locator('#sts-comment').fill(comment);
    if(double)await action(page,'sheet-save').evaluate(button=>{button.click();button.click();});
    else await action(page,'sheet-save').click();
    await page.waitForFunction(()=>!document.querySelector('#special-task-flow .tf-sheet'));
  }
  await mode(page,'view');
}

async function creationPersistence(page) {
  await fresh(page);
  const created=[];
  for(const type of types) {
    await create(page,type);await prepare(page,type);
    const added=await submitCreated(page,type,true);created.push(added);
    await openRecord(page,added.id);
    assert.equal(await page.locator('#special-task-flow').getAttribute('data-type'),type,`${type}: registry routes to its own detail`);
    assert.equal(await page.locator('#special-task-flow .tf-task-title').textContent(),added.title,`${type}: literal task title`);
    assert.equal(await page.locator('#special-task-flow script, #special-task-flow [onerror]').count(),0,'User text cannot become executable markup');
    await geometry(page,`${type}/view`);
    await close(page,'button',`#tasks-results button[data-task-id="${added.id}"]`);
  }
  await page.reload();await ready(page);
  for(const added of created) {
    const saved=await record(page,added.id);
    assert.deepEqual(saved,added,`${added.flowType}: all base/type-specific data survive reload`);
  }
  assert.equal(await page.evaluate(()=>window.BpmTaskStore.list().length),22,'New flows preserve all 14 seed tasks');
  report('eight real UI creations, duplicate-submit guard, registry routing, escaped text and reload persistence');
}
async function approvalAndRoleDecisions(page) {
  await fresh(page);
  for(const type of ['extended-access','process-result-approval','metric-inapplicability']) {
    await create(page,type);await prepare(page,type);
    const item=await submitCreated(page,type);await openRecord(page,item.id);
    await finish(page,'rework',{required:true});
    assert.equal((await record(page,item.id)).status,'На доработке');
    await finish(page,'resubmit');
    assert.equal((await record(page,item.id)).status,'Создана');
    await finish(page,'approve',{double:true});
    const done=await record(page,item.id);
    assert.equal(done.status,'Завершено');
    assert.equal(done.comments.length,2,`${type}: one rework and one approval comment, no duplicate submit`);
    if(type==='process-result-approval')assert.equal(done.flowData.variantDecision,'approved');
    if(type==='metric-inapplicability')assert.equal(done.flowData.metrics[0].approved,true);
    assert.equal(await page.locator('#special-task-flow [data-stf-action^="lifecycle:"]').count(),0,`${type}: no terminal actions`);
    await close(page,'button',`#tasks-results button[data-task-id="${item.id}"]`);
  }
  for(const rejected of [false,true]) {
    await create(page,'role-management');await prepare(page,'role-management');
    const item=await submitCreated(page,'role-management');await openRecord(page,item.id);
    assert.equal(await lifecycle(page,'accept-role').isDisabled(),true,'Role acceptance needs explicit acknowledgement');
    if(rejected)await finish(page,'reject-role',{required:true});
    else {await choice(page,'acknowledged','true');await finish(page,'accept-role');}
    const done=await record(page,item.id);
    assert.equal(done.status,'Завершено');
    assert.equal(done.flowData.roleDecision,rejected?'rejected':'accepted');
    assert.equal(done.flowData.acknowledged,!rejected);
    assert.equal(await page.locator('#special-task-flow [data-stf-action^="lifecycle:"]').count(),0);
    await close(page,'button',`#tasks-results button[data-task-id="${item.id}"]`);
  }
  report('access/variant/metric rework → resubmit → approval, mandatory comments, role acceptance and rejection');
}
async function businessAndChecklist(page) {
  await fresh(page);
  for(const negative of [false,true]) {
    await create(page,'business-description-update');await prepare(page,'business-description-update');
    const item=await submitCreated(page,'business-description-update');await openRecord(page,item.id);
    if(negative)await choice(page,'businessOutcome','not-updated');
    else {
      await lifecycle(page,'submit').click();
      assert.equal(await page.locator('#stf-registrationNumber').getAttribute('aria-invalid'),'true','Positive outcome requires SberDocs registration');
      assert.equal(await page.locator('#special-task-flow .tf-sheet').count(),0);
      await page.locator('#stf-registrationNumber').fill('SBERDOCS-QA-2026');
    }
    await finish(page,'submit');
    assert.equal((await record(page,item.id)).status,'Выполнена');
    await finish(page,'rework',{required:true});
    assert.equal((await record(page,item.id)).status,'На доработке');
    await finish(page,'submit');await finish(page,'approve');
    const done=await record(page,item.id);
    assert.equal(done.status,'Завершено');
    assert.equal(done.flowData.businessOutcome,negative?'not-updated':'updated');
    assert.equal(done.flowData.registrationNumber,negative?'':'SBERDOCS-QA-2026');
    await close(page,'button',`#tasks-results button[data-task-id="${item.id}"]`);
  }
  for(const decision of ['not-required','required']) {
    await create(page,'business-description-checklist');await prepare(page,'business-description-checklist');
    const item=await submitCreated(page,'business-description-checklist');await openRecord(page,item.id);
    assert.equal(await page.locator('#stf-answers input[type="checkbox"]').count(),8,'Checklist includes all eight PDF questions');
    await lifecycle(page,'complete-checklist').click();
    assert.equal(await page.locator('#special-task-flow .tf-sheet').count(),0,'Checklist needs explicit decision');
    await choice(page,'answers','1');await choice(page,'decision',decision);
    const count=await page.evaluate(()=>window.BpmTaskStore.list().length);
    await finish(page,'complete-checklist',{required:true,double:true});
    const done=await record(page,item.id);
    assert.equal(done.status,'Завершено');assert.equal(done.flowData.decision,decision);
    assert.deepEqual(done.flowData.answers,['1']);
    assert.equal(await page.evaluate(()=>window.BpmTaskStore.list().length),count+(decision==='required'?1:0),'Checklist creates exactly one follow-up only when required');
    if(decision==='required') {
      const follow=await record(page,done.flowData.followUpTaskId);
      assert.equal(follow.flowType,'business-description-update');assert.equal(follow.processId,item.processId);
      assert.equal(follow.flowData.sourceChecklistId,item.id);
    }
    await close(page,'button',`#tasks-results button[data-task-id="${item.id}"]`);
  }
  report('BO positive/negative results, registration validation, rework and checklist follow-up/no-follow-up branches');
}
async function variantOperationsAndBulk(page) {
  await fresh(page);
  for(const operation of ['change','delete']) {
    await create(page,'process-result-approval');await prepare(page,'process-result-approval',{operation});
    const item=await submitCreated(page,'process-result-approval');
    assert.equal(item.flowData.operation,operation);assert.ok(item.flowData.beforeVariant?.title);
    await openRecord(page,item.id);await finish(page,'approve');
    assert.equal((await record(page,item.id)).status,'Завершено');
    await close(page,'button',`#tasks-results button[data-task-id="${item.id}"]`);
  }
  await create(page,'bulk-metric-inapplicability');await prepare(page,'bulk-metric-inapplicability');
  const bulk=await submitCreated(page,'bulk-metric-inapplicability');
  assert.equal(bulk.status,'Завершено');assert.equal(bulk.flowData.applicability,'not-applicable');
  await openRecord(page,bulk.id);await finish(page,'restore',{required:true,double:true});
  const restored=await record(page,bulk.id);
  assert.equal(restored.status,'Отменено');assert.equal(restored.flowData.applicability,'applicable');
  assert.equal(restored.comments.length,1);
  assert.equal(await lifecycle(page,'restore').count(),0,'Restored applicability cannot be restored repeatedly');
  await close(page,'button',`#tasks-results button[data-task-id="${bulk.id}"]`);
  report('change/delete variant operations and one-time bulk applicability restore');
}
async function metricPeriodsAndRejection(page) {
  await fresh(page);await create(page,'metric-inapplicability');
  await choose(page,'processId');await choose(page,'assignees',await page.evaluate(()=>window.BpmTaskStore.currentUser));
  await page.locator('[data-stf-action="item-add"][data-field="metrics"]').click();
  await choose(page,'value',undefined,'sts');await page.locator('#sts-reason').fill('Проверка конечного периода неприменимости');
  const indefinite=page.locator('input[name="sts-indefinite"]');
  if(await indefinite.isChecked())await indefinite.locator('..').click();
  await page.locator('#sts-periodFrom').fill('31.02.2026');await page.locator('#sts-periodTo').fill('01.03.2026');
  await action(page,'sheet-save').click();
  assert.equal(await page.locator('#sts-periodFrom').getAttribute('aria-invalid'),'true','Invalid calendar dates cannot be saved');
  await page.locator('#sts-periodFrom').fill('20.10.2026');await page.locator('#sts-periodTo').fill('19.10.2026');
  await action(page,'sheet-save').click();
  assert.equal(await page.locator('#sts-periodTo').getAttribute('aria-invalid'),'true','End before start cannot be saved');
  await page.locator('#sts-periodTo').fill('21.10.2026');await action(page,'sheet-save').click();
  await page.waitForFunction(()=>!document.querySelector('#special-task-flow .tf-sheet'));
  const item=await submitCreated(page,'metric-inapplicability');
  assert.equal(item.flowData.metrics[0].periodFrom,'2026-10-20');assert.equal(item.flowData.metrics[0].periodTo,'2026-10-21');
  await openRecord(page,item.id);
  const approval=page.locator('#stf-metrics [data-stfc-decision]');await approval.locator('..').click();
  await lifecycle(page,'approve').click();
  assert.equal(await page.locator('#special-task-flow .tf-sheet').count(),0,'Approval with no chosen metrics is blocked');
  assert.equal((await record(page,item.id)).status,'Создана');
  await finish(page,'reject',{required:true,double:true});
  const rejected=await record(page,item.id);
  assert.equal(rejected.status,'Отклонена');assert.equal(rejected.flowData.metrics[0].approved,false);
  await close(page,'button',`#tasks-results button[data-task-id="${item.id}"]`);
  await create(page,'process-result-approval');await prepare(page,'process-result-approval');
  const variant=await submitCreated(page,'process-result-approval');await openRecord(page,variant.id);
  await finish(page,'reject',{required:true});
  const no=await record(page,variant.id);
  assert.equal(no.status,'Отклонена');assert.equal(no.flowData.variantDecision,'rejected');
  assert.ok(no.flowData.proposedVariants.every(v=>v.approved===false&&v.decision==='rejected'));
  await close(page,'button',`#tasks-results button[data-task-id="${variant.id}"]`);
  report('real date/range validation, persisted metric periods, empty-selection approval guard and rejected metric/variant outcomes');
}
async function insightAndSheetEscape(page) {
  await fresh(page);
  for(const decision of ['complete','reject']) {
    await create(page,'insight');await prepare(page,'insight');
    const item=await submitCreated(page,'insight');await openRecord(page,item.id);
    await lifecycle(page,decision).click();await page.locator('#special-task-flow .tf-sheet').waitFor();
    const before=await record(page,item.id);
    assert.equal(await page.locator('#special-task-flow .tf-shell').evaluate(node=>node.inert),true,'Underlying task is inert while sheet is open');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#special-task-flow .tf-sheet').count(),0);
    assert.deepEqual(await record(page,item.id),before,'Sheet Escape does not save a decision');
    assert.equal(await lifecycle(page,decision).evaluate(node=>node===document.activeElement),true,'Sheet restores action focus');
    await finish(page,decision,{required:decision==='reject',comment:decision==='complete'?'':'Обоснование отказа'});
    assert.equal((await record(page,item.id)).status,decision==='complete'?'Завершено':'Отклонена');
    assert.equal(await page.locator('#special-task-flow [data-stf-action^="lifecycle:"]').count(),0);
    await close(page,'button',`#tasks-results button[data-task-id="${item.id}"]`);
  }
  await create(page,'insight');await prepare(page,'insight');
  const user=await page.evaluate(()=>window.BpmTaskStore.currentUser);
  await choose(page,'assignees',user); // remove current assignee through the multiselect
  await choose(page,'assignees','Петрова Мария Игоревна');
  const outgoing=await submitCreated(page,'insight');await openRecord(page,outgoing.id);
  assert.equal(await lifecycle(page,'complete').count(),0,'An unassigned initiator cannot execute an insight task');
  await finish(page,'withdraw');assert.equal((await record(page,outgoing.id)).status,'Отозвана');
  await close(page,'button',`#tasks-results button[data-task-id="${outgoing.id}"]`);
  report('insight complete/reject/withdraw branches, optional/mandatory comments and nested-sheet Escape/focus');
}
async function concurrentDecision(page) {
  await fresh(page);await create(page,'extended-access');await prepare(page,'extended-access');
  const item=await submitCreated(page,'extended-access');await openRecord(page,item.id);
  await lifecycle(page,'approve').click();await page.locator('#sts-comment').fill('Устаревшее решение');
  const other=await page.context().newPage();
  try {
    await other.goto(`${base.split('#')[0]}#tasks`);await ready(other);
    await other.evaluate(id=>{
      const store=window.BpmTaskStore,now=new Date().toISOString();
      store.update(id,{status:'Отозвана',withdrawnAt:now,comments:[{author:store.currentUser,text:'Отозвана в другой вкладке',created:now,kind:'withdraw'}]});
    },item.id);
    await page.waitForFunction(id=>window.BpmTaskStore.get(id)?.status==='Отозвана',item.id);
    await action(page,'sheet-save').click();
    await page.waitForFunction(()=>!document.querySelector('#special-task-flow .tf-sheet'));
    const latest=await record(page,item.id);
    assert.equal(latest.status,'Отозвана');assert.equal(latest.comments.length,1);
    assert.equal(latest.comments[0].text,'Отозвана в другой вкладке');
    assert.equal(await page.locator('#special-task-flow [data-stf-action^="lifecycle:"]').count(),0);
    await close(page,'button',`#tasks-results button[data-task-id="${item.id}"]`);
  } finally {await other.close();}
  report('an open stale approval cannot overwrite another tab’s withdrawal or comments');
}
async function typeTags(page) {
  await fresh(page);
  const tags=await page.evaluate(() => {
    const host=document.createElement('div');
    const rows=Object.values(window.BpmTaskTypes);
    host.innerHTML=rows.map(type=>`<div data-type="${type.id}">${window.BpmTaskVisuals.typeTag(type.label)}<div class="cabinet-card">${window.BpmTaskVisuals.typeTag(type.label)}</div></div>`).join('');
    document.body.append(host);
    const result=[...host.children].map(row=>({id:row.dataset.type,tags:[...row.querySelectorAll('.task-type-tag')].map(tag=>{const s=getComputedStyle(tag);return {text:tag.textContent,color:s.color,bg:s.backgroundColor,border:s.borderTopColor};})}));
    host.remove();return result;
  });
  for(const row of tags)assert.deepEqual(row.tags[0],row.tags[1],`${row.id}: cabinet and registry share tag palette`);
  const byId=Object.fromEntries(tags.map(row=>[row.id,row.tags[0]]));
  assert.equal(byId['role-management'].text,'Роли');
  assert.equal(byId['role-management'].color,'rgb(97, 85, 245)');
  assert.equal(byId['extended-access'].text,'Доступы');
  assert.equal(byId['process-result-approval'].text,'Варианты');
  assert.equal(byId['metric-inapplicability'].border,'rgba(0, 0, 0, 0)');
  assert.equal(byId['bulk-metric-inapplicability'].text,'Массовая неприменимость');
  assert.equal(byId['business-description-checklist'].text,'Чек-лист');
  assert.equal(byId['business-description-update'].text,'Бизнес-описание');
  assert.equal(byId.insight.text,'Задача к инсайту');
  report('Figma type labels and palettes match in registry, drawer and cabinet');
}

async function collectionEditors(page) {
  await fresh(page);await create(page,'process-result-approval');await prepare(page,'process-result-approval');
  const menu=()=>page.locator('#stf-proposedVariants .stf-item-menu').first();
  await menu().locator('summary').click();assert.equal(await menu().getAttribute('open'),'');
  await page.keyboard.press('Escape');assert.equal(await menu().getAttribute('open'),null);
  assert.equal(await page.locator('#special-task-flow').evaluate(node=>node.open),true,'Menu Escape does not close form');
  await menu().locator('summary').click();await menu().locator('[data-stf-action="item-edit"]').click();
  await page.locator('#sts-title').fill('Не сохранять');await action(page,'sheet-cancel').first().click();
  assert.equal(await page.locator('#stf-proposedVariants .stf-variant h3').first().textContent(),'Новый вариант результата QA');
  await menu().locator('summary').click();await menu().locator('[data-stf-action="item-edit"]').click();
  await page.locator('#sts-title').fill('Отредактированный вариант');await action(page,'sheet-save').click();
  assert.equal(await page.locator('#stf-proposedVariants .stf-variant h3').first().textContent(),'Отредактированный вариант');
  await addItem(page,'proposedVariants','Второй вариант');
  await menu().locator('summary').click();await menu().locator('[data-stfc-delete]').click();
  assert.equal(await page.locator('#stf-proposedVariants .stf-variant').count(),1);
  assert.equal(await page.locator('#stf-proposedVariants .stf-variant h3').textContent(),'Второй вариант');
  const variant=await submitCreated(page,'process-result-approval');assert.equal(variant.flowData.proposedVariants[0].title,'Второй вариант');
  await create(page,'metric-inapplicability');await prepare(page,'metric-inapplicability');
  await page.locator('#metric-0-reason').fill('Первое отредактированное обоснование');
  await addItem(page,'metrics');
  await page.locator('#metric-1-reason').fill('Второе сохранённое обоснование');
  await page.locator('#stf-metrics [data-stfc-delete="0"]').click();
  assert.equal(await page.locator('#stf-metrics .stf-metric').count(),1);
  assert.equal(await page.locator('#metric-0-reason').inputValue(),'Второе сохранённое обоснование','Deleting a card preserves and reindexes remaining fields');
  const metric=await submitCreated(page,'metric-inapplicability');
  assert.equal(metric.flowData.metrics.length,1);assert.equal(metric.flowData.metrics[0].reason,'Второе сохранённое обоснование');
  await openRecord(page,metric.id);await finish(page,'approve');
  assert.equal(await page.locator('#stf-metrics .stf-metric.is-approved').count(),1,'Approved result uses the decision card state');
  await close(page,'button',`#tasks-results button[data-task-id="${metric.id}"]`);
  report('variant menu/edit/cancel/delete, metric inline editing/deletion/reindex and approved card state');
}
async function cabinetIntegration(page) {
  await fresh(page);await page.locator('#cabinet-nav').click();
  await page.waitForFunction(()=>!document.getElementById('cabinet-panel').hidden&&document.getElementById('cabinet-feed-tasks')?.getAttribute('aria-busy')==='false');
  await page.locator('#cabinet-create-tasks').click();
  await page.locator('#task-drawer [data-task-type="insight"]').click();await mode(page,'create');
  await prepare(page,'insight',{title:'Специализированная задача из кабинета'});
  const item=await submitCreated(page,'insight');
  await page.locator('#cabinet-nav').click();
  await page.waitForFunction(()=>!document.getElementById('cabinet-panel').hidden&&document.getElementById('cabinet-feed-tasks')?.getAttribute('aria-busy')==='false');
  const trigger=`#cabinet-panel button[data-cabinet-open="${item.id}"]`;
  await page.locator(trigger).click();await mode(page,'view');
  assert.equal(new URL(page.url()).hash,'#cabinet');
  assert.equal(await page.locator('#special-task-flow').getAttribute('data-type'),'insight');
  assert.equal(await page.locator('#task-flow[open]').count(),0,'Cabinet routes special tasks to the correct controller');
  await action(page,'edit').click();await mode(page,'edit');
  assert.equal(await footer(page,'save').isDisabled(),true,'An unchanged specialised edit cannot save');
  await page.locator('#stf-title').fill('Обновлённая специализированная задача из кабинета');
  await footer(page,'save').click();await mode(page,'view');
  const updated=await record(page,item.id);
  assert.equal(updated.title,'Обновлённая специализированная задача из кабинета');
  assert.equal(updated.insightId,item.insightId);assert.deepEqual(updated.flowData,item.flowData);
  await close(page,'button',trigger);
  report('special task creation from Cabinet, registry hand-off, edit and replaced-card focus restoration');
}
async function geometry(page, label) {
  await paint(page);
  const width = page.viewportSize().width;
  const sizes = await page.locator('#special-task-flow').evaluate(node => {
    const b = node.getBoundingClientRect();
    return {left:b.left,right:b.right,width:b.width,scroll:node.scrollWidth,client:node.clientWidth,
      page:document.documentElement.scrollWidth,
      parts:[...node.querySelectorAll('.tf-content,.tf-sheet,.tf-footer,.tf-sheet-actions')].map(p => ({name:p.className,scroll:p.scrollWidth,client:p.clientWidth}))};
  });
  assert.ok(sizes.left >= -1 && sizes.right <= width + 1, `${label}: drawer inside viewport ${JSON.stringify(sizes)}`);
  assert.ok(sizes.scroll <= sizes.client + 1 && sizes.page <= width + 1, `${label}: no horizontal overflow ${JSON.stringify(sizes)}`);
  for (const part of sizes.parts) assert.ok(part.scroll <= part.client + 1, `${label}: ${part.name} fits`);
  const expected = width < 768 ? width : (width - 328) * 5 / 12 + 96;
  assert.ok(Math.abs(sizes.width - expected) < 1, `${label}: five-column drawer width`);
  const broken = await page.locator('#special-task-flow').evaluate(async node => {
    const images = [...node.querySelectorAll('img')];
    await Promise.all(images.map(image => image.decode().catch(() => {})));
    return images.filter(image => !image.naturalWidth).map(image => image.src);
  });
  assert.deepEqual(broken, [], `${label}: all icons load`);
}
async function openRecord(page, id) {
  await page.locator('[data-task-tab="all"]').click();
  await ready(page);
  await page.locator('#tasks-search').fill(id);
  await ready(page);
  await page.locator(`#tasks-results button[data-task-id="${id}"]`).click();
  await mode(page, 'view');
}
async function submitCreated(page, type, duplicate = false) {
  const previous = await page.evaluate(() => window.BpmTaskStore.list().map(record => record.id));
  assert.equal((await footer(page, 'save').textContent()).trim(), 'Создать', `${type}: short Create label`);
  if (duplicate) await footer(page, 'save').evaluate(button => {button.click();button.click();});
  else await footer(page, 'save').click();
  await page.waitForFunction(() => !document.getElementById('special-task-flow')?.open && !document.body.classList.contains('task-drawer-open'));
  await ready(page);
  const added = await page.evaluate(previous => window.BpmTaskStore.list().filter(record => !previous.includes(record.id)), previous);
  assert.equal(added.length, 1, `${type}: creates exactly one record`);
  const record = added[0];
  assert.equal(record.flowType, type);
  assert.ok(record.flowData && typeof record.flowData === 'object' && !Array.isArray(record.flowData), `${type}: typed data stored`);
  assert.notEqual(record.type, 'Типовая', `${type}: correct human task type`);
  assert.equal(new URL(page.url()).hash, '#tasks');
  assert.equal(await page.locator('[data-task-tab="outgoing"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#tasks-results article[data-task-id], #tasks-results tbody tr[data-task-id]').first().getAttribute('data-task-id'), record.id);
  assert.equal(await page.locator('#tasks-search').inputValue(), '');
  assert.equal((await page.locator('#toast').textContent()).trim(), 'Задача создана');
  assert.ok(await page.locator('#toast').evaluate(node => node.classList.contains('is-success')));
  assert.equal(await page.locator('dialog[open]').count(), 0, `${type}: no automatic detail drawer`);
  return record;
}

async function chooserAndDrafts(page) {
  await fresh(page);
  await page.locator('#tasks-create').click();
  const choices = await page.locator('#task-drawer [data-task-type]').evaluateAll(nodes => nodes.map(node => node.dataset.taskType));
  assert.deepEqual(choices.slice().sort(), ['standard', ...types].sort(), 'All eight PDF types and the existing typical task are discoverable');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('task-drawer')?.open);
  for (const type of types) {
    await create(page, type);
    assert.equal(await (await draftProbe(page)).count(), 1, `${type}: form is rendered`);
    const before = await page.evaluate(() => window.BpmTaskStore.list().length);
    await footer(page, 'save').click();
    assert.equal(await page.evaluate(() => window.BpmTaskStore.list().length), before, `${type}: incomplete form cannot save`);
    assert.ok(await page.locator('#special-task-flow').evaluate(node => node.open), `${type}: validation keeps form open`);
    await (await draftProbe(page)).fill(`Черновик ${type} <без HTML>`);
    await close(page);
  }
  for (const type of types) {
    await create(page, type);
    assert.equal(await (await draftProbe(page)).inputValue(), `Черновик ${type} <без HTML>`, `${type}: isolated in-memory draft`);
    await action(page, 'back').click();
    await page.locator('#task-drawer[open]').waitFor();
    await page.locator(`#task-drawer [data-task-type="${type}"]`).click();
    await mode(page, 'create');
    assert.equal(await (await draftProbe(page)).inputValue(), `Черновик ${type} <без HTML>`, `${type}: back-to-types retains draft`);
    await close(page, 'cancel');
    await create(page, type);
    assert.notEqual(await (await draftProbe(page)).inputValue(), `Черновик ${type} <без HTML>`, `${type}: Cancel discards only this draft`);
    await close(page, 'cancel');
  }
  report('nine-type chooser, required validation, per-type draft isolation, back/cancel and focus');
}
async function responsive(page) {
  await fresh(page);
  for (const width of [1920,1024,390,320]) {
    await viewport(page, width);
    for (const type of types) {
      await create(page, type);
      await geometry(page, `${width}/${type}/create`);
      await (await draftProbe(page)).fill(`Мобильная проверка ${type}`);
      const buttons = await page.locator('#special-task-flow .tf-footer').evaluate(node => {
        const b = node.getBoundingClientRect();
        return {height:b.height,children:[...node.querySelectorAll('button')].filter(button => button.getClientRects().length).map(button => {
          const c = button.getBoundingClientRect();return {action:button.dataset.stfAction,x:c.x-b.x,y:c.y-b.y,width:c.width,height:c.height,parent:b.width};
        })};
      });
      assert.equal(Math.round(buttons.height), 50, `${type}/${width}: footer stays one 50px row`);
      for (const b of buttons.children) assert.ok(b.x >= -1 && b.x+b.width <= b.parent+1 && Math.abs(b.y) < 1, `${type}/${width}: ${b.action} stays inside footer`);
      if (width === 320) await page.screenshot({path:path.join(output, `${type}-${width}.png`)});
      await close(page, 'cancel');
    }
  }
  report('all eight forms at 1920/1024/390/320px: no overflow, one-row footer, DS icons');
}
async function nestedProcess(page) {
  await fresh(page);
  for (const width of [1920,390]) {
    await viewport(page,width);
    await page.goto(`${base.split('#')[0]}#main`);
    await page.locator('#processes-tab').click();
    const entry = page.locator('.entity-card:not(.skeleton-card) [data-detail]').first();
    await entry.waitFor();
    await entry.click();
    await page.waitForFunction(() => {
      const node = document.getElementById('process-drawer');
      return node?.open && !node.classList.contains('pd-is-loading') && !node.querySelector('.pd-main').inert;
    });
    await page.locator('#process-drawer .pd-anchors [data-pd-anchor="tasks"]').click();
    const trigger = '#process-drawer [data-pd-action="create-task"]';
    await page.locator(trigger).scrollIntoViewIfNeeded();
    await paint(page);
    await page.evaluate(() => {
      const main = document.querySelector('#process-drawer .pd-main');
      window.__specialParent = {main,scroll:main.scrollTop,title:document.getElementById('pd-title').textContent};
    });
    for (const type of types) {
      await page.locator(trigger).click();
      await page.locator('#task-drawer[open]').waitFor();
      await page.locator(`#task-drawer [data-task-type="${type}"]`).click();
      await mode(page,'create');
      assert.deepEqual(await page.locator('dialog:modal').evaluateAll(nodes => nodes.map(n => n.id).sort()), ['process-drawer','special-task-flow'], `${type}: special form above process`);
      await geometry(page,`${width}/${type}/above-process`);
      assert.equal(await page.locator('#special-task-flow').evaluate(node => getComputedStyle(node,'::backdrop').backgroundColor), 'rgba(0, 36, 68, 0.2)', `${type}: own dim layer`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('special-task-flow')?.open);
      const parent = await page.evaluate(() => {
        const saved = window.__specialParent, node = document.getElementById('process-drawer');
        return {open:node.open,main:node.querySelector('.pd-main') === saved.main,scroll:saved.main.scrollTop,prior:saved.scroll,
          title:document.getElementById('pd-title').textContent,priorTitle:saved.title,
          locked:getComputedStyle(document.body).overflowY,focus:document.activeElement === node.querySelector('[data-pd-action="create-task"]')};
      });
      assert.ok(parent.open && parent.main && parent.focus, `${type}: parent DOM and focus restored`);
      assert.equal(parent.title,parent.priorTitle);
      assert.ok(Math.abs(parent.scroll-parent.prior)<2, `${type}: parent scroll retained`);
      assert.equal(parent.locked,'hidden', `${type}: parent keeps page locked`);
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('process-drawer')?.open);
    assert.equal(await page.locator('dialog[open]').count(),0);
  }
  report('eight specialised forms above a process: independent backdrop, Escape, parent DOM/scroll/focus at desktop and mobile');
}

(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1920,height:1080}, reducedMotion:'reduce', offline:base.startsWith('file:')});
  await context.addInitScript(() => localStorage.setItem('bpm-registry-menu','expanded'));
  const page = await context.newPage(), errors = [], missing = [], external = [], failures = [];
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('response', response => {if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);});
  page.on('requestfailed', request => missing.push(`${request.url()}: ${request.failure()?.errorText}`));
  if (source) page.on('request', request => {if (!/^(data:|blob:)/.test(request.url()) && request.url().split(/[?#]/)[0] !== base) external.push(request.url());});
  try {
    const tests = [chooserAndDrafts,responsive,nestedProcess,creationPersistence,approvalAndRoleDecisions,businessAndChecklist,variantOperationsAndBulk,metricPeriodsAndRejection,insightAndSheetEscape,concurrentDecision,collectionEditors,cabinetIntegration,typeTags], requested = process.argv.slice(2);
    assert.ok(requested.every(name => tests.some(test => test.name === name)), 'Requested test group exists');
    for (const test of tests.filter(test => !requested.length || requested.includes(test.name))) {
      try {await test(page);} catch (error) {
        failures.push(`${test.name}: ${error.stack || error}`);
        console.error(`FAIL — ${test.name}: ${error.message}`);
        await page.screenshot({path:path.join(output, `${test.name}-failure.png`)});
      }
    }
    assert.deepEqual(errors, [], 'No browser runtime errors');
    assert.deepEqual(missing, [], 'No missing assets or scripts');
    assert.deepEqual(external, [], 'Renamed standalone is fully offline');
    if (failures.length) throw new Error(failures.join('\n\n'));
    report('special-task regression completed');
  } finally {
    console.log(`Screenshots: ${output}`);
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode = 1;});

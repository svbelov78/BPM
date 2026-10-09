'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=path.resolve(process.argv[2]||path.join(__dirname,'index.html'));
const ready=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
async function trackerGeometry(scope, expectedStates=[]) {
 const geometry=await scope.locator('.ia-stage').evaluateAll(stages=>stages.map(stage=>{
  const rail=stage.querySelector('.ia-stage-rail').getBoundingClientRect(), marker=stage.querySelector('.ia-stage-rail').firstElementChild.getBoundingClientRect(), copy=stage.querySelector('.ia-stage-copy').getBoundingClientRect();
  return {state:stage.dataset.stageState,width:marker.width,height:marker.height,slot:rail.width,alignment:(marker.left+marker.width/2)-(rail.left+rail.width/2),gap:copy.left-marker.right};
 }));
 assert.ok(geometry.length,'The tracker contains stage markers');
 for(const item of geometry){
  const size=item.state==='pending'?23:24;
  assert.ok(Math.abs(item.width-size)<.1&&Math.abs(item.height-size)<.1,`Every DS stage marker keeps its original ${size}×${size} size: ${JSON.stringify(item)}`);
  assert.ok(Math.abs(item.slot-24)<.1&&Math.abs(item.alignment)<.1,`Every marker is centered in the same 24px rail: ${JSON.stringify(item)}`);
  assert.ok(item.gap>=7.5,`The marker does not overlap the copy and preserves the 8px gap: ${JSON.stringify(item)}`);
 }
 for(const state of expectedStates)assert.ok(geometry.some(item=>item.state===state),`The ${state} state is covered`);
}
async function trackerVisibility(scope,row,label) {
 const model=row.detail?.workflow,ownId=model?.currentActor?.id;
 const ownApproval=!!ownId&&model.stages?.some(stage=>stage.decisions?.some(decision=>decision.actorId===ownId&&decision.decision==='approve'));
 const expected=row.source==='ТБ'&&(row.status==='Новый'||ownApproval);
 assert.equal(await scope.locator('.ia-tracker').count(),expected?1:0,`${label}: approval tracker shows an active route or our saved approval`);
 if(expected)assert.equal(await scope.locator('.ia-tracker h3').textContent(),'Ход согласования',`${label}: active route has the correct heading`);
 else assert.equal(await scope.getByText(/^(Ход согласования|История согласования)$/).count(),0,`${label}: neither approval heading remains after hiding the block`);
}
async function approvingParticipants(scope,row,label) {
 const expected=[{role:'Владелец процесса',name:row.owner||'Не назначен'},{role:'Автор',name:row.author||'Не указан'}],seen=new Set();
 for(const stage of row.detail.workflow.stages||[])for(const decision of stage.decisions||[]){
  const name=String(decision.actorName||'').trim();if(decision.decision!=='approve'||!name)continue;
  const actorId=String(decision.actorId||'').trim(),key=actorId?`id:${actorId}`:`name:${name.toLocaleLowerCase('ru-RU').replace(/\s+/g,' ')}`;
  if(seen.has(key))continue;seen.add(key);
  expected.push({name,role:decision.role?.trim()?`Согласующий · ${decision.role.trim()}`:'Согласующий'});
 }
 const actual=await scope.locator('.id-detail-participants .id-detail-participant, .ia-participants .ia-person').evaluateAll(nodes=>nodes.map(node=>({role:node.querySelector('small,.internal-label').textContent.trim(),name:node.querySelector('p').textContent.trim()})));
 assert.deepEqual(actual,expected,`${label}: only approved actors appear as deduplicated agreeing participants`);
}
async function approvalCopy(scope) {
 assert.equal(await scope.locator('h2').textContent(),'Согласование инсайта','Approval confirmation uses the updated title');
 assert.equal(await scope.locator('form > p').first().textContent(),'В случае принятия решения «согласовать» введение комментария не обязательно.','Approval confirmation explains that a comment is optional');
 assert.equal(await scope.locator('textarea').getAttribute('required'),null,'Approval never makes the comment mandatory');
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce',offline:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try {
  await page.goto(pathToFileURL(source).href+'#insights');await ready(page);
  const count=await page.evaluate(()=>BpmInsightStore.list().length);assert.equal(count,16);
  assert.deepEqual(await page.evaluate(()=>[...new Set(BpmInsightStore.list().map(row=>row.status))].sort()),['Новый','Согласовано','Мнения собраны','Отклонено','В работе','Реализовано'].sort());
  const colors=await page.locator('.insights-card .insight-status').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.dataset.insightStatus,getComputedStyle(node.querySelector('.insight-status-dot')).backgroundColor])));
  assert.deepEqual(colors,{'Отклонено':'rgb(255, 56, 60)','В работе':'rgb(97, 85, 245)','Новый':'rgb(0, 136, 255)','Согласовано':'rgb(97, 85, 245)','Мнения собраны':'rgb(97, 85, 245)','Реализовано':'rgb(52, 199, 89)'});
  assert.equal(await page.locator('#insights-bank').isVisible(),false);
  await page.locator('[data-insight-open="INS-000060"]').click();
  const detail=page.locator('#insights-detail-view');await detail.waitFor({state:'visible'});
  assert.equal(await page.locator('dialog[open]').count(),0,'Approval opens in an internal tab');
  assert.equal(await detail.locator('[data-ia-back]').count(),0,'Matches backlink appears only in duplicate previews');
  assert.ok(await detail.locator('.ia-stage-loader').count());
  await trackerGeometry(detail,['current','pending']);
  const disk=detail.locator('.ia-stage-current');
  assert.deepEqual(await disk.evaluate(node=>({color:getComputedStyle(node).backgroundColor,transform:getComputedStyle(node).transform,width:node.offsetWidth,height:node.offsetHeight})),{color:'rgb(97, 85, 245)',transform:'none',width:24,height:24},'The indigo disk is stationary and separate from the white loader');
  assert.ok(await disk.locator('img.ia-stage-loader').evaluate(node=>node.complete&&node.naturalWidth===24&&node.naturalHeight===24),'The original DS loading arc is visible above the disk');
  const motion=await detail.locator('.ia-stage-loader').evaluate(node=>({name:getComputedStyle(node).animationName,count:getComputedStyle(node).animationIterationCount}));assert.equal(motion.name,'ia-loading');assert.equal(motion.count,'infinite');
  const rotationBefore=await detail.locator('.ia-stage-loader').evaluate(node=>getComputedStyle(node).transform);
  await page.waitForTimeout(150);
  assert.notEqual(await detail.locator('.ia-stage-loader').evaluate(node=>getComputedStyle(node).transform),rotationBefore,'Active loader must actually rotate');
  const geometry=async()=>detail.evaluate(node=>({tabs:document.querySelector('#insights-tabs').getBoundingClientRect().top,footer:node.querySelector('.id-detail-footer').getBoundingClientRect().top}));
  const before=await geometry();await detail.locator('.id-detail-scroll').evaluate(node=>node.scrollTop=node.scrollHeight);assert.deepEqual(await geometry(),before);
  await detail.locator('.id-detail-scroll').evaluate(node=>node.scrollTop=0);await page.screenshot({path:'/tmp/insight-approval-1920.png'});
  const beforePartial=await page.evaluate(()=>BpmInsightStore.get('INS-000060'));
  await approvingParticipants(detail,beforePartial,'Before first approval');
  await detail.locator('.id-detail-scroll').evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});
  await detail.locator('[data-id-approval="approve"]').click();
  await approvalCopy(page.locator('#insight-detail-approval-confirm'));
  await page.locator('#insight-detail-approval-confirm [type=submit]').click();
  const partial=await page.evaluate(()=>BpmInsightStore.get('INS-000060'));
  assert.equal(partial.status,'Новый','A director approval does not prematurely finish the route');
  await approvingParticipants(detail,partial,'Immediately after director approval');
  assert.equal(await detail.locator('.id-detail-participant small').filter({hasText:/^Согласующий/}).count(),1,'The newly agreeing director appears immediately');
  assert.deepEqual(await page.evaluate(()=>BpmInsightStore.get('INS-000060')),partial,'Rendering participants does not alter stored decisions or history');
  await page.evaluate(row=>BpmInsightStore.update(row.id,{status:row.status,detail:row.detail,comments:row.comments,needsApproval:row.needsApproval,needsOpinion:row.needsOpinion}),beforePartial);
  await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);await page.locator('[data-insight-open="INS-000060"]').click();
  await detail.locator('[data-id-approval="reject"]').click();
  const confirm=page.locator('#insight-detail-approval-confirm');assert.equal(await confirm.locator('h2').textContent(),'Отклонить инсайт?');assert.equal(await confirm.locator('form > p').first().textContent(),'Внесите комментарий для обоснования отклонения.');await confirm.locator('[type=submit]').click();assert.ok(await confirm.isVisible());assert.equal(await page.evaluate(()=>BpmInsightStore.get('INS-000060').status),'Новый');
  await confirm.locator('textarea').fill('Нужно уточнить расчёт ожидаемого эффекта.');await confirm.locator('[type=submit]').click();assert.equal(await page.evaluate(()=>BpmInsightStore.get('INS-000060').status),'Новый');assert.equal(await detail.locator('[data-id-approval]').count(),0);
  await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);
  await page.locator('[data-insight-open="INS-000058"]').click();await trackerGeometry(detail,['approved','current']);await detail.locator('.id-detail-scroll').evaluate(node=>node.scrollTop=node.scrollHeight);await detail.locator('[data-id-approval="approve"]').click();await approvalCopy(confirm);await confirm.locator('[type=submit]').click();assert.equal(await page.evaluate(()=>BpmInsightStore.get('INS-000058').status),'Согласовано');await trackerVisibility(detail,await page.evaluate(()=>BpmInsightStore.get('INS-000058')),'After final approval');
  const approved=await page.evaluate(()=>BpmInsightStore.get('INS-000058'));
  await approvingParticipants(detail,approved,'Immediately after final approval');
  assert.ok(approved.detail.workflow.stages.some(stage=>stage.decisions?.some(decision=>decision.decision==='approve')),'Approval decisions remain stored while our completed tracker stays visible');
  assert.equal(await detail.locator('[data-ia-own-stage][data-stage-state="approved"] .ia-stage-own').textContent(),'Ваше согласование');
  await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);
  await page.locator('[data-insight-open="INS-000059"]').click();await trackerGeometry(detail,['rejected','current','pending']);await detail.locator('[data-id-approval="reject"]').click();await confirm.locator('textarea').fill('Подтверждаю отказ: эффект не обоснован.');await confirm.locator('[type=submit]').click();assert.equal(await page.evaluate(()=>BpmInsightStore.get('INS-000059').status),'Отклонено');await trackerVisibility(detail,{source:'ТБ',status:'Отклонено'},'After final rejection');
  const rejected=await page.evaluate(()=>BpmInsightStore.get('INS-000059'));
  await approvingParticipants(detail,rejected,'Rejected actors are not approving participants');
  assert.ok(rejected.detail.workflow.stages.some(stage=>stage.decisions?.some(decision=>decision.comment==='Подтверждаю отказ: эффект не обоснован.')),'Rejection comments remain stored after the tracker disappears');
  await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);
  for(const width of [1440,768,390,320,3840]){
   await page.setViewportSize({width,height:width===3840?2160:920});await page.locator('[data-insight-open="INS-000057"]').click();
   await page.waitForFunction(()=>[...document.querySelectorAll('#insights-detail-view img')].every(node=>node.complete));
   const box=await detail.evaluate(node=>({outer:node.getBoundingClientRect().width,scroll:node.querySelector('.id-detail-scroll').scrollWidth,client:node.querySelector('.id-detail-scroll').clientWidth,header:document.querySelector('#insights-tabs').getBoundingClientRect().bottom,footer:node.querySelector('.id-detail-footer').getBoundingClientRect().top}));
   assert.ok(box.outer<=width+1&&box.scroll<=box.client+1&&box.header<box.footer,JSON.stringify({width,...box}));
   const broken=await detail.locator('img:visible').evaluateAll(nodes=>nodes.filter(n=>!n.complete||!n.naturalWidth).map(n=>n.src));assert.deepEqual(broken,[]);
   await trackerGeometry(detail,['current']);
   if(width===390)await page.screenshot({path:'/tmp/insight-approval-390.png'});
   await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);
   await page.locator('[data-insight-open="INS-000060"]').click();await trackerGeometry(detail,['rejected','current','pending']);await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);
   await page.locator('[data-insight-open="INS-000058"]').click();await trackerVisibility(detail,approved,`${width}px approved detail`);await trackerGeometry(detail,['approved']);await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);
  }
  await page.reload();await ready(page);
  for(const [id,snapshot] of [['INS-000058',approved],['INS-000059',rejected]]){
   assert.deepEqual(await page.evaluate(id=>BpmInsightStore.get(id),id),snapshot,'Hiding the tracker never alters persisted approval results');
   await page.locator(`[data-insight-open="${id}"]`).click();await trackerVisibility(detail,snapshot,`${id} after reload`);await approvingParticipants(detail,snapshot,`${id} participants after reload`);await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);
  }
  const fixture=await page.evaluate(()=>BpmInsightStore.get('INS-000060'));
  await page.setViewportSize({width:1440,height:920});
  for(const source of ['ТБ','SberBPM ЦА','Process Mining'])for(const status of ['Новый','Согласовано','Мнения собраны','В работе','Реализовано','Отклонено']){
   const model={source,status};
   await page.evaluate(({id,source,status,detail})=>BpmInsightStore.update(id,{source,status,detail}),{id:fixture.id,...model,detail:fixture.detail});await ready(page);
   await page.locator(`[data-insight-open="${fixture.id}"]`).click();await trackerVisibility(detail,model,`${source}/${status} tab`);
   await page.evaluate(()=>document.getElementById('cabinet-nav').click());
   await page.waitForFunction(()=>!document.querySelector('#cabinet-panel').hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
   await page.locator(`#cabinet-feed-insights [data-cabinet-open="${fixture.id}"] .card-title`).click();await page.locator('#cabinet-insight-drawer[open]').waitFor();
   await trackerVisibility(detail,model,`${source}/${status} Cabinet drawer`);
   await approvingParticipants(detail,{...fixture,...model},`${source}/${status} Cabinet participants`);
   await page.locator('#cabinet-insight-drawer [data-id-drawer-close]').click();await page.locator('#cabinet-insight-drawer[open]').waitFor({state:'hidden'});
   await page.locator('[data-cabinet-nav="insights"]').click();await ready(page);
   if(await page.locator('#insights-panel.is-insight-detail').count()){await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);}
  }
  await page.evaluate(row=>BpmInsightStore.update(row.id,{source:row.source,status:row.status,detail:row.detail}),fixture);
  assert.deepEqual(errors,[]);console.log('PASS: 16 scenarios, six DS status colors, active loader, fixed shell, reject validation, both rejection routes, our completed approval retained in its tracker after final approval/reload, other trackers remain exclusive to ТБ/Новый across three sources and six statuses in tabs and Cabinet drawers, 24px stage geometry at 320–3840px, assets.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

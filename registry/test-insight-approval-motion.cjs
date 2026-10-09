/* Offline, disposable browser: our approval label, committed flight and history. */
'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=path.resolve(process.argv[2]||path.join(__dirname,'index.html'));
const ready=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const read=(page,id)=>page.evaluate(id=>BpmInsightStore.get(id),id);
const shots=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-approval-motion-'));
async function registry(page){
 if(await page.locator('#cabinet-insight-drawer[open]').count()){await page.locator('[data-id-drawer-close]').click();await page.locator('#cabinet-insight-drawer[open]').waitFor({state:'hidden'});}
 if(await page.locator('#cabinet-panel').isVisible())await page.locator('[data-cabinet-nav="insights"]').click();
 if(await page.locator('#insights-panel.is-insight-detail').count())await page.locator('.insights-view-controls button[aria-pressed="true"]').click();
 await ready(page);
}
async function open(page,id){await registry(page);await page.locator(`[data-insight-open="${id}"]`).click();await page.locator('#insight-detail-title').waitFor();}
async function end(scope){await scope.locator('.id-detail-scroll,.ia-scroll').evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});}
async function confirm(page,scope,separate=false){await end(scope);await scope.locator(separate?'[data-ia-decision="approve"]':'[data-id-approval="approve"]').click();await page.locator(separate?'#insight-approval-confirm[open] [type=submit]':'#insight-detail-approval-confirm[open] [type=submit]').click();}
async function flight(page,scope,shot){
 await scope.locator('.ia-tracker--flight').waitFor();
 await scope.locator('.ia-tracker--flight [data-ia-own-stage][data-stage-state="approved"]').waitFor();
 const geometry=await scope.evaluate(node=>{const card=node.querySelector('.ia-tracker--flight').getBoundingClientRect(),footer=node.querySelector('.id-detail-footer,.ia-footer').getBoundingClientRect(),view=node.getBoundingClientRect();return {card:{left:card.left,right:card.right,top:card.top,bottom:card.bottom},footer:footer.top,view:{left:view.left,right:view.right,top:view.top,bottom:view.bottom}};});
 assert.ok(geometry.card.bottom<=geometry.footer+2,`The floating tracker sits above the footer: ${JSON.stringify(geometry)}`);
 assert.ok(geometry.card.left>=geometry.view.left&&geometry.card.right<=geometry.view.right+1,'The flight stays inside its own panel');
 assert.equal(await scope.locator('.ia-tracker--flight [data-ia-own-stage]').getAttribute('data-stage-state'),'approved');
 assert.equal(await scope.locator('.ia-tracker--flight [data-ia-own-stage] .ia-stage-own').textContent(),'Ваше согласование');
 const shadows=await scope.evaluate(node=>({float:getComputedStyle(node.querySelector('.ia-tracker--flight')).boxShadow,normal:getComputedStyle(node.querySelector('.ia-tracker:not(.ia-tracker--flight)')).boxShadow}));
 assert.notEqual(shadows.float,shadows.normal,'The floating approval has a stronger shadow');
 await scope.screenshot({path:path.join(shots,`${shot}.png`)});
 await scope.locator('.ia-approval-flight-layer').waitFor({state:'detached'});
 assert.equal(await scope.locator('.ia-tracker:not(.ia-tracker--flight)').count(),1,'The completed tracker returns to its real persistent slot');
 assert.equal(await scope.locator('.is-approval-flight-source').count(),0,'No hidden original or ghost remains');
 const returned=await scope.evaluate(node=>{const tracker=node.querySelector('.ia-tracker'),rect=tracker.getBoundingClientRect(),scroll=node.querySelector('.id-detail-scroll,.ia-scroll').getBoundingClientRect();return {top:rect.top,bottom:rect.bottom,viewTop:scroll.top,viewBottom:scroll.bottom,width:node.getBoundingClientRect().width,scrollTop:node.querySelector('.id-detail-scroll,.ia-scroll').scrollTop};});
 assert.ok(returned.top>=returned.viewTop-1&&returned.bottom<=returned.viewBottom+1,`The real returned tracker remains visible, including a narrow stacked layout: ${JSON.stringify(returned)}`);
 assert.ok(returned.scrollTop>=0,'The return scroll remains inside the current insight');
 const ownLine=await scope.locator('.ia-tracker [data-ia-own-stage] .ia-stage-own').evaluate(node=>({label:node.getBoundingClientRect().top,date:node.parentElement.querySelector('small').getBoundingClientRect().top}));
 assert.ok(Math.abs(ownLine.label-ownLine.date)<2,'The completed purple label sits next to its own date');
 await scope.screenshot({path:path.join(shots,`${shot}-returned.png`)});
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1080},offline:true,reducedMotion:'no-preference'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));await page.goto(pathToFileURL(source).href+'#insights');await ready(page);
  const detail=page.locator('#insights-detail-view'),original=await read(page,'INS-000059'),finalOriginal=await read(page,'INS-000057');
  await open(page,'INS-000059');
  assert.equal(await detail.locator('.ia-stage-own').count(),1,'Only our current step is labelled');
  assert.equal(await detail.locator('[data-ia-own-stage]').getAttribute('data-stage-state'),'current');
  assert.equal(await detail.locator('.ia-stage-own').evaluate(node=>getComputedStyle(node).color),'rgb(97, 85, 245)');
  const line=await detail.locator('.ia-stage-own').evaluate(node=>({label:node.getBoundingClientRect(),date:node.parentElement.querySelector('small').getBoundingClientRect()}));
  assert.ok(Math.abs(line.label.top-line.date.top)<2,'Your approval label sits beside its date');
  await end(detail);await detail.locator('[data-id-approval="approve"]').click();await page.locator('[data-id-approval-close]').last().click();
  assert.deepEqual(await read(page,'INS-000059'),original,'Cancelling confirmation cannot commit or paint a green stage');
  assert.equal(await detail.locator('.ia-approval-flight-layer').count(),0);
  await end(detail);await detail.locator('[data-id-approval="approve"]').click();await page.locator('#insight-detail-approval-confirm textarea').fill('Подтверждаю ожидаемый эффект. После проверки полного набора полей заявки информация доступна из профиля компании; повторное заполнение не требуется. Длинный комментарий проверяет, что выросший блок согласования остаётся над кнопкой и не перекрывает нижнюю панель действий.');await page.locator('#insight-detail-approval-confirm [type=submit]').click();assert.equal((await read(page,'INS-000059')).status,'Новый');await flight(page,detail,'director-over-button');
  assert.equal(await detail.locator('[data-ia-own-stage]').getAttribute('data-stage-state'),'approved');
  assert.equal(await detail.locator('[data-id-approval]').count(),0,'A committed actor cannot approve twice');
  await open(page,'INS-000057');await confirm(page,detail);assert.equal((await read(page,'INS-000057')).status,'Согласовано');await flight(page,detail,'completed-over-button');
  await page.reload();await ready(page);await open(page,'INS-000057');
  assert.equal(await detail.locator('.ia-tracker [data-ia-own-stage][data-stage-state="approved"]').count(),1,'Our final approval remains visible after reload');
  assert.equal(await detail.locator('.ia-tracker .ia-stage-own').textContent(),'Ваше согласование');
  assert.equal(await detail.locator('[data-id-approval]').count(),0);
  const final=await read(page,'INS-000057');
  for(const status of ['Мнения собраны','В работе','Реализовано']){await registry(page);await page.evaluate(({id,status})=>BpmInsightStore.update(id,{status}),{id:final.id,status});await open(page,final.id);assert.equal(await detail.locator('.ia-tracker [data-ia-own-stage][data-stage-state="approved"]').count(),1,`${status}: real own approval remains visible`);}
  await registry(page);await page.evaluate(row=>BpmInsightStore.update(row.id,{status:row.status,detail:row.detail,comments:row.comments,needsApproval:row.needsApproval,needsOpinion:row.needsOpinion}),original);
  await page.locator('#cabinet-nav').click();await page.waitForFunction(()=>!document.querySelector('#cabinet-panel').hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
  await page.locator('#cabinet-feed-insights [data-cabinet-open="INS-000059"] .card-title').click();await page.locator('#cabinet-insight-drawer[open]').waitFor();
  await confirm(page,detail);await flight(page,detail,'cabinet-over-button');
  assert.equal(await detail.locator('.ia-tracker [data-ia-own-stage][data-stage-state="approved"]').count(),1);
  await registry(page);await open(page,'INS-000060');await confirm(page,detail);await detail.locator('.ia-tracker--flight').waitFor();
  await page.setViewportSize({width:1500,height:1080});await detail.locator('.ia-approval-flight-layer').waitFor({state:'detached'});assert.equal(await detail.locator('.ia-approval-flight-layer').count(),0,'Resize cancels the flight without undoing its saved approval');
  assert.equal(await detail.locator('.is-approval-flight-source').count(),0);
  await registry(page);await page.evaluate(row=>BpmInsightStore.update(row.id,{status:row.status,detail:row.detail,comments:row.comments,needsApproval:row.needsApproval,needsOpinion:row.needsOpinion}),finalOriginal);
  await open(page,'INS-000057');await confirm(page,detail);await detail.locator('.ia-tracker--flight').waitFor();await registry(page);
  assert.equal(await page.locator('.ia-approval-flight-layer').count(),0,'Leaving the insight mid-flight removes the visual clone');
  await open(page,'INS-000057');assert.equal(await detail.locator('.ia-tracker [data-ia-own-stage][data-stage-state="approved"]').count(),1,'Closing the flight never reverses the saved approval');
  await registry(page);
  await page.evaluate(()=>{window.__approvalMotionTest=BpmInsightApproval.create({getRow:id=>BpmInsightStore.get(id),onChange:(id,patch)=>BpmInsightStore.update(id,patch)});__approvalMotionTest.open('INS-000058');});
  const drawer=page.locator('#insight-approval-drawer').last(),shell=drawer.locator('.ia-shell');await drawer.waitFor({state:'visible'});
  assert.equal(await shell.locator('.ia-stage-own').count(),1);await confirm(page,shell,true);await flight(page,shell,'approval-drawer-over-button');
  await drawer.locator('[data-ia-close]').first().click();await drawer.waitFor({state:'hidden'});
  assert.equal(await page.locator('.ia-approval-flight-layer').count(),0);
  await context.close();
  const mobileMotion=await browser.newContext({viewport:{width:390,height:900},offline:true,reducedMotion:'no-preference'}),moving=await mobileMotion.newPage();moving.on('pageerror',error=>errors.push(error.message));
  await moving.goto(pathToFileURL(source).href+'#insights');await ready(moving);await open(moving,'INS-000057');const movingDetail=moving.locator('#insights-detail-view');await confirm(moving,movingDetail);await flight(moving,movingDetail,'mobile-over-button');
  const movingWidth=await moving.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(movingWidth.page<=movingWidth.viewport+1,'Normal-motion mobile does not overflow');await mobileMotion.close();
  const reduced=await browser.newContext({viewport:{width:390,height:900},offline:true,reducedMotion:'reduce'}),mobile=await reduced.newPage();mobile.on('pageerror',error=>errors.push(error.message));
  await mobile.goto(pathToFileURL(source).href+'#insights');await ready(mobile);await open(mobile,'INS-000057');const small=mobile.locator('#insights-detail-view');await confirm(mobile,small);
  assert.equal(await small.locator('.ia-approval-flight-layer').count(),0,'Reduced motion commits immediately without a flight');
  assert.equal(await small.locator('.ia-tracker [data-ia-own-stage][data-stage-state="approved"]').count(),1);
  await mobile.screenshot({path:path.join(shots,'reduced-mobile-completed.png')});
  const width=await mobile.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(width.page<=width.viewport+1,'Completed approval does not overflow mobile');
  assert.deepEqual(errors,[]);console.log(`PASS: own purple date label; cancellation unchanged; actual green success; stronger-shadow flight above footer; returned persistent tracker; final approval/reload/future statuses; Cabinet/separate drawer; resize/close cleanup; normal/reduced-motion mobile. Screenshots: ${shots}`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

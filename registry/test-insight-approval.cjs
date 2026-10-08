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
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
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
  await detail.locator('[data-id-approval="reject"]').click();
  const confirm=page.locator('#insight-detail-approval-confirm');await confirm.locator('[type=submit]').click();assert.ok(await confirm.isVisible());assert.equal(await page.evaluate(()=>BpmInsightStore.get('INS-000060').status),'Новый');
  await confirm.locator('textarea').fill('Нужно уточнить расчёт ожидаемого эффекта.');await confirm.locator('[type=submit]').click();assert.equal(await page.evaluate(()=>BpmInsightStore.get('INS-000060').status),'Новый');assert.equal(await detail.locator('[data-id-approval]').count(),0);
  await page.locator('#insights-back').click();await ready(page);
  await page.locator('[data-insight-open="INS-000058"]').click();await trackerGeometry(detail,['approved','current']);await detail.locator('.id-detail-scroll').evaluate(node=>node.scrollTop=node.scrollHeight);await detail.locator('[data-id-approval="approve"]').click();await confirm.locator('[type=submit]').click();assert.equal(await page.evaluate(()=>BpmInsightStore.get('INS-000058').status),'Согласовано');await page.locator('#insights-back').click();await ready(page);
  await page.locator('[data-insight-open="INS-000059"]').click();await trackerGeometry(detail,['rejected','current','pending']);await detail.locator('[data-id-approval="reject"]').click();await confirm.locator('textarea').fill('Подтверждаю отказ: эффект не обоснован.');await confirm.locator('[type=submit]').click();assert.equal(await page.evaluate(()=>BpmInsightStore.get('INS-000059').status),'Отклонено');assert.equal(await detail.locator('[data-stage-state="pending"],[data-stage-state="current"]').count(),0,'A rejected route has no upcoming approval stages');await page.locator('#insights-back').click();await ready(page);
  for(const width of [1440,768,390,320,3840]){
   await page.setViewportSize({width,height:width===3840?2160:920});await page.locator('[data-insight-open="INS-000057"]').click();
   await page.waitForFunction(()=>[...document.querySelectorAll('#insights-detail-view img')].every(node=>node.complete));
   const box=await detail.evaluate(node=>({outer:node.getBoundingClientRect().width,scroll:node.querySelector('.id-detail-scroll').scrollWidth,client:node.querySelector('.id-detail-scroll').clientWidth,header:document.querySelector('#insights-tabs').getBoundingClientRect().bottom,footer:node.querySelector('.id-detail-footer').getBoundingClientRect().top}));
   assert.ok(box.outer<=width+1&&box.scroll<=box.client+1&&box.header<box.footer,JSON.stringify({width,...box}));
   const broken=await detail.locator('img:visible').evaluateAll(nodes=>nodes.filter(n=>!n.complete||!n.naturalWidth).map(n=>n.src));assert.deepEqual(broken,[]);
   await trackerGeometry(detail,['current']);
   if(width===390)await page.screenshot({path:'/tmp/insight-approval-390.png'});
   await page.locator('#insights-back').click();await ready(page);
   await page.locator('[data-insight-open="INS-000060"]').click();await trackerGeometry(detail,['rejected','current','pending']);await page.locator('#insights-back').click();await ready(page);
   await page.locator('[data-insight-open="INS-000058"]').click();await trackerGeometry(detail,['approved']);await page.locator('#insights-back').click();await ready(page);
  }
  assert.deepEqual(errors,[]);console.log('PASS: 16 scenarios, six DS status colors, active loader, fixed shell, reject validation, both rejection routes, approval, all DS tracker states centered in a 24px rail without overlap at 320–3840px, assets.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

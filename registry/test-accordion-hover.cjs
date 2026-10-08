/* Accordion headings stay unpainted; only their chevrons respond to hover.
 * Uses isolated headless Chrome, with no changes to the user's browser data.
 * node test-accordion-hover.cjs [index.html | standalone.html]
 */
'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
const url=pathToFileURL(source).href;
const insightReady=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const painted=locator=>locator.evaluate(node=>({background:getComputedStyle(node).backgroundColor,image:getComputedStyle(node).backgroundImage,color:getComputedStyle(node).color,shadow:getComputedStyle(node).boxShadow}));
async function hoverOnlyChevron(page,header,chevron,label){
 await header.scrollIntoViewIfNeeded();await page.mouse.move(0,0);
 const before=await painted(header),iconBefore=await painted(chevron);
 await header.hover({position:{x:20,y:20}});
 assert.deepEqual(await painted(header),before,`${label}: heading background and text stay unchanged`);
 const iconAfter=await painted(chevron);
 assert.notEqual(iconAfter.background,iconBefore.background,`${label}: chevron alone is highlighted`);
 assert.equal(iconAfter.background,'rgb(230, 243, 255)',`${label}: shared DS hover color`);
 await page.mouse.move(0,0);
 assert.deepEqual(await painted(chevron),iconBefore,`${label}: highlight disappears on mouse leave`);
 console.log(`PASS — ${label}: no header fill, chevron-only hover`);
}
async function nativeAccordion(page,selector,label){
 const header=page.locator(selector).first(),chevron=header.locator(':scope > img').last();
 const open=()=>header.evaluate(node=>node.parentElement.open);
 const original=await open();
 await hoverOnlyChevron(page,header,chevron,`${label} ${original?'open':'closed'}`);
 await header.click();assert.equal(await open(),!original,`${label}: full heading remains clickable`);
 await hoverOnlyChevron(page,header,chevron,`${label} ${!original?'open':'closed'}`);
 await header.focus();await page.keyboard.press('Enter');assert.equal(await open(),original,`${label}: keyboard expansion remains functional`);
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce',offline:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try {
  await page.goto(url+'#insights');await insightReady(page);
  await page.locator('#insights-create').click();
  await nativeAccordion(page,'#ic-relations > summary','Insight creation');
  await page.locator('#insight-create-drawer .ic-close').click();
  await page.locator('[data-insight-open="INS-000060"]').click();
  await nativeAccordion(page,'.ia-accordion > summary','Insight approval');
  await page.locator('#insight-approval-drawer [data-ia-close]').first().click();
  await page.locator('[data-insight-open="INS-000055"]').click();
  const detailHeader=page.locator('.id-detail-accordion-header').filter({has:page.locator('[data-id-accordion="tasks"]')});
  await hoverOnlyChevron(page,detailHeader,detailHeader.locator('.icon-button'),'Insight detail tab');
  const detailToggle=detailHeader.locator('[data-id-accordion="tasks"]').first();
  const expanded=await detailToggle.getAttribute('aria-expanded');await detailToggle.click();
  assert.notEqual(await detailToggle.getAttribute('aria-expanded'),expanded,'Detail title still toggles body');

  await page.evaluate(()=>window.BpmProcessDrawer.open(window.BPM_DATA.find(row=>row.entity==='processes')));
  await page.waitForFunction(()=>document.querySelector('#process-drawer')?.open&&!document.querySelector('#process-drawer').classList.contains('pd-is-loading'));
  await nativeAccordion(page,'.pd-section > .pd-section-heading','Process details');
  await page.locator('#process-drawer [data-pd-action="close"]').click();
  await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
  await page.evaluate(()=>window.BpmProcessDrawer.open(window.BPM_DATA.find(row=>row.entity==='paths')));
  await page.waitForFunction(()=>document.querySelector('#process-drawer')?.open&&!document.querySelector('#process-drawer').classList.contains('pd-is-loading'));
  const journeyMore=page.locator('[data-jd-toggle-processes]');
  await hoverOnlyChevron(page,journeyMore,journeyMore.locator('img'),'Journey included processes');
  await page.locator('#process-drawer [data-pd-action="close"]').click();
  await page.locator('#process-drawer[open]').waitFor({state:'hidden'});

  await page.goto(url+'#main');await page.locator('.entity-card:not(.skeleton-card)').first().waitFor();
  for(const id of ['paths-nav','gemba-nav']){
   const group=page.locator(`#${id}`);await hoverOnlyChevron(page,group,group.locator('.nav-chevron'),`Menu group ${id}`);
   const original=await group.getAttribute('aria-expanded');await group.click();assert.notEqual(await group.getAttribute('aria-expanded'),original);await group.click();
  }
  const ordinary=page.locator('[data-service="LeanLab"]');await ordinary.hover();assert.equal((await painted(ordinary)).background,'rgb(230, 243, 255)','Ordinary navigation still highlights');
  await page.locator('#structure-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#structure-list')?.getAttribute('aria-busy')==='false');
  const structureHeader=page.locator('.structure-heading').first();
  for(let depth=0;depth<3;depth++){
   const candidate=depth===0?structureHeader:page.locator(`.structure-node[data-kind="${['block','division','product'][depth]}"] > .structure-heading`).first();
   const header=page.locator(`#${await candidate.getAttribute('id')}`);
   await hoverOnlyChevron(page,header,header.locator('.structure-chevron'),`Structure level ${depth+1}`);
   await header.click();assert.equal(await header.getAttribute('aria-expanded'),'true');
   if(depth===0)await hoverOnlyChevron(page,header,header.locator('.structure-chevron'),'Expanded structure group');
  }
  const linked=page.locator('.structure-row-count[aria-expanded]').first();
  if(await linked.count()){
   await linked.scrollIntoViewIfNeeded();await page.mouse.move(0,0);
   const cell=linked.locator('xpath=ancestor::td[1]'),before=await painted(cell);
   await linked.hover();assert.deepEqual(await painted(cell),before,'Related-process accordion does not paint its table row');
   assert.equal((await painted(linked.locator('img'))).background,'rgb(230, 243, 255)');
  }
  await page.goto(url+'#tasks');await page.waitForFunction(()=>document.querySelector('#tasks-results')?.getAttribute('aria-busy')==='false');
  await page.locator('#tasks-create').click();await page.locator('#task-drawer [data-task-type="insight"]').click();
  await nativeAccordion(page,'.stf-accordion > summary','Task creation');
  await page.keyboard.press('Escape');
  await page.goto(url+'#main');
  if(await page.locator('#structure-toggle').getAttribute('aria-pressed')==='true')await page.locator('#structure-toggle').click();
  await page.setViewportSize({width:390,height:844});
  const mobile=page.locator('#mobile-filters-toggle');await mobile.waitFor();
  await hoverOnlyChevron(page,mobile,mobile.locator('img'),'Mobile filters');
  assert.deepEqual(errors,[]);
  console.log('PASS — All accordion families retain click/keyboard behavior; ordinary navigation and field hover rules are unchanged.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

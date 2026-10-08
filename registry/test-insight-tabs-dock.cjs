/* Sticky registry insight tabs share the existing global header without clones. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-tabs-dock-'));
let source=path.resolve(process.argv[2]||path.join(__dirname,'index.html'));
if(path.basename(source)!=='index.html'){const copy=path.join(output,'prototype.html');fs.copyFileSync(source,copy);source=copy;}
const ready=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const paint=page=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
async function bounds(page) {
 return page.evaluate(()=>{
  const box=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const tabs=document.querySelector('#insights-tabs');
  return {tabs:box(tabs),header:box(document.querySelector('.header')),brand:box(document.querySelector('.header .brand img')),actions:box(document.querySelector('.header-actions')),position:getComputedStyle(tabs).position,mode:document.body.dataset.insightTabsDock,scrollY,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth};
 });
}
function noOverlap(a,b){return a.right<=b.left+1||a.left>=b.right-1||a.bottom<=b.top+1||a.top>=b.bottom-1;}
async function dock(page,width) {
 await page.setViewportSize({width,height:width===3840?2160:920});
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await paint(page);
 assert.notEqual((await bounds(page)).position,'fixed',`${width}: tab strip belongs to registry before scrolling`);
 await page.evaluate(()=>window.scrollTo({top:600,behavior:'instant'}));
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('#insights-tabs')).position==='fixed');
 await paint(page);
 const value=await bounds(page);
 assert.ok(value.scrollY>0,`${width}: page really scrolled`);
 if(value.mode==='below')assert.ok(value.tabs.top>=value.header.bottom-1&&value.tabs.top<=value.header.bottom+12,`${width}: narrow header uses adjacent second row ${JSON.stringify(value)}`);
 else assert.ok(value.tabs.top>=value.header.top-1&&value.tabs.bottom<=value.header.bottom+1,`${width}: tabs dock inside global header ${JSON.stringify(value)}`);
 assert.ok(noOverlap(value.tabs,value.brand),`${width}: tabs avoid brand`);
 assert.ok(noOverlap(value.tabs,value.actions),`${width}: tabs avoid notification/profile buttons`);
 assert.ok(value.tabs.left>=-1&&value.tabs.right<=width+1&&value.pageWidth<=width+1,`${width}: no horizontal page overflow`);
 assert.equal(await page.locator('#insights-tabs').count(),1,'Only the original tab strip exists');
 const duplicateIds=await page.evaluate(()=>{const seen=new Set();return [...document.querySelectorAll('[id]')].map(node=>node.id).filter(id=>seen.has(id)||!seen.add(id));});
 assert.deepEqual(duplicateIds,[],'Docking introduces no duplicate DOM IDs');
 await page.screenshot({path:path.join(output,`dock-${width}.png`)});
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:920},reducedMotion:'reduce',offline:true});
 await context.addInitScript(()=>localStorage.setItem('bpm-registry-menu','collapsed'));
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(12000);
 try {
  await page.goto(pathToFileURL(source).href+'#insights');await ready(page);
  const ids=await page.evaluate(()=>{
   const ids=[];
   for(let index=0;index<60;index++){
    const row=BpmInsightStore.create({title:`Демонстрационный инсайт для проверки вкладок ${index+1}`,description:'Проверка расположения вкладок в общей шапке.',solution:'Сохранить рабочие вкладки.'});
    if(index<20)ids.push(row.id);
   }
   return ids;
  });
  // Reload includes the current creation date in the registry's default period.
  await page.reload();await ready(page);
  await page.locator('[data-insight-open="INS-000060"]').click();await paint(page);
  await page.evaluate(ids=>{
   for(const id of ids){const button=document.createElement('button');button.type='button';button.dataset.insightOpen=id;document.querySelector('#insights-panel').append(button);button.click();button.remove();}
  },ids);
  await page.locator('#insights-back').click();await ready(page);await paint(page);
  assert.equal(await page.locator('#insights-tabs [data-insight-tab]').count(),21,'Real store records populate many open tabs');
  for(const width of [1440,3840,390,320])await dock(page,width);
  await dock(page,1440);
  await page.locator('#insights-create').evaluate(node=>node.click());await page.locator('#insight-create-drawer[open]').waitFor();await paint(page);
  assert.equal(await page.locator('#insights-tabs').evaluate(node=>node.matches(':popover-open')),false,'Dock is removed from top layer while a form drawer is open');
  await page.locator('#insight-create-drawer [data-close]').first().click();await page.locator('#insight-create-drawer[open]').waitFor({state:'hidden'});
  await dock(page,1440);
  await page.setViewportSize({width:1440,height:920});await paint(page);
  const first=ids[0];
  await page.locator(`[data-insight-tab="${first}"]`).click();await paint(page);
  assert.equal(await page.locator(`[data-insight-tab="${first}"]`).getAttribute('aria-selected'),'true','Docked tab click opens its insight');
  assert.equal(await page.locator('dialog[open]').count(),0,'Docked tab never opens a drawer');
  await page.locator(`[data-insight-tab="${first}"]`).focus();await page.keyboard.press('ArrowRight');await paint(page);
  const current=await page.evaluate(()=>document.activeElement?.dataset.insightTab);
  assert.ok(current&&current!==first,'Docked/tab-strip keyboard navigation selects another actual tab');
  await page.locator('#insights-back').click();await ready(page);await dock(page,1440);
  await page.locator(`[data-insight-tab="${current}"]`).hover();await page.locator(`[data-insight-tab-close="${current}"]`).click();await paint(page);
  assert.equal(await page.locator(`[data-insight-tab="${current}"]`).count(),0,'Close removes only its own tab while docked');
  assert.equal(await page.locator('#insights-tabs [data-insight-tab]').count(),20);
  await page.locator('#cabinet-nav').evaluate(node=>node.click());await paint(page);
  assert.ok(await page.locator('#insights-panel').isHidden(),'Leaving hides registry and its docked tabs');
  assert.equal(await page.locator('#insights-tabs').isVisible(),false,'No stale tab strip over another section');
  await page.locator('#insights-nav').evaluate(node=>node.click());await ready(page);await paint(page);
  assert.equal(await page.locator('#insights-tabs [data-insight-tab]').count(),20,'Returning keeps open insights');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await paint(page);
  assert.notEqual((await bounds(page)).position,'fixed','Scrolling back to top returns tabs to registry position');
  await page.emulateMedia({reducedMotion:'no-preference'});
  const entrance=await page.evaluate(async()=>{
   window.scrollTo({top:600,behavior:'instant'});
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   return document.querySelector('#insights-tabs').getAnimations().map(animation=>({name:animation.animationName,frames:animation.effect.getKeyframes().map(frame=>frame.transform)}));
  });
  assert.ok(entrance.some(animation=>animation.name==='insight-tabs-header-enter'&&animation.frames.some(value=>value.includes('-100%'))),'Normal-motion entrance slides the docked tabs down from above the header');
  assert.deepEqual(errors,[],'No runtime errors');
  console.log(`PASS — Global-header dock at1440/4K, many tabs, original DOM/no duplicate IDs, no brand/action overlap, clicks/keyboard/close, leave/return and scrollback. Screenshots: ${output}`);
 } catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(`Screenshots: ${output}`);throw error;}
 finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

/* Linked task withdrawal: visible status → real-card blur/blue mist → collapse
 * → persisted archive. Disposable offline browser, never the user's profile. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BPM_PLAYWRIGHT||'/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-task-withdraw-'));
let source=path.resolve(process.argv[2]||path.join(__dirname,'index.html'));
const standalone=path.basename(source)!=='index.html';
if(standalone){const isolated=path.join(output,'isolated-prototype.html');fs.copyFileSync(source,isolated);source=isolated;}
const base=pathToFileURL(source).href;
const detail='#insights-detail-view';
const card=(page,id)=>page.locator(`${detail} [data-id-task-card="${id}"]`);
const filter=(page,name)=>page.locator(`${detail} [data-id-task-filter="${name}"]`);
const phase=(page,name)=>page.locator(`${detail} [data-id-task-phase="${name}"]`);
const ready=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const paint=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const review=(page,selector)=>page.locator(selector).evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});
async function seed(page){return page.evaluate(()=>{
  const insight=BpmInsightStore.get('INS-000009'), executor='Петрова Мария Игоревна';
  const common={description:'Проверка локальной связи, отзыва и архива.',deadline:'',insightId:insight.id,insightTitle:insight.title,processId:insight.related[0].id,processCode:insight.related[0].code,assignees:[executor]};
  const plain=BpmTaskStore.create({...common,title:'Обычная задача для отзыва'});
  const special=BpmTaskStore.create({...common,title:'Контекстная задача для отзыва',flowType:'insight-work',executor});
  const completed=BpmTaskStore.create({...common,title:'Выполненная связанная задача'});
  const rejected=BpmTaskStore.create({...common,title:'Отклонённая связанная задача'});
  BpmTaskStore.update(completed.id,{status:'Завершено',completedAt:new Date().toISOString()});
  BpmTaskStore.update(rejected.id,{status:'Отклонена'});
  const unrelated=BpmTaskStore.create({title:'Несвязанная задача',assignees:[executor]});
  BpmInsightStore.update(insight.id,{status:'В работе',detail:{...insight.detail,taskIds:[plain.id,special.id,completed.id,rejected.id]}});
  return {insight:insight.id,plain:plain.id,special:special.id,completed:completed.id,rejected:rejected.id,unrelated:unrelated.id};
});}
async function openInsight(page,id,cabinet=false){
  await page.goto(`${base}${cabinet?'#cabinet':'#insights'}`);
  if(cabinet){await page.waitForFunction(()=>document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');await page.locator(`#cabinet-feed-insights button[data-cabinet-open="${id}"]`).click();}
  else{await ready(page);await page.locator(`[data-insight-open="${id}"]`).click();}
  await page.locator(`${detail}[data-insight-id="${id}"]`).waitFor();
  const toggle=page.locator(`${detail} [data-id-accordion="tasks"]`).first();
  if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
  if(await filter(page,'active').count())await filter(page,'active').click();
  await review(page,`${detail} .id-detail-scroll`);await paint(page);
}
async function geometry(page){return page.locator(detail).evaluate(root=>{
  const box=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
  return {section:box(root.querySelector('#id-detail-tasks').closest('.id-detail-accordion')),footer:box(root.querySelector('.id-detail-footer')),scrollY};
});}
async function assertIds(page){assert.deepEqual(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);return ids.filter((id,index)=>ids.indexOf(id)!==index);}),[],'Motion never duplicates live DOM IDs');}
async function withdraw(page,id,{special=false,motion=true}={}){
  await card(page,id).click();
  const modal=special?'#special-task-flow':'#task-flow';
  await page.locator(`${modal}[open]`).waitFor();await review(page,`${modal} .tf-content`);await paint(page);
  const action=special?'[data-stf-action="lifecycle:withdraw"]':'[data-tf-action="withdraw"]';
  await page.locator(`${modal} ${action}`).click();
  assert.equal(await page.evaluate(id=>BpmTaskStore.get(id).status,id),'Отозвана','Withdrawal commits status immediately');
  assert.match(await card(page,id).innerText(),/Отозвана/,'Parent card first exposes withdrawn status');
  assert.equal(await phase(page,'dissolve').count(),0,'Dissolve waits while the child modal covers the insight');
  const before=await geometry(page);
  await page.locator(detail).evaluate(root=>{
    window.__withdrawQaPhases=[];window.__withdrawQaObserver?.disconnect();
    const record=()=>{for(const node of root.querySelectorAll('[data-id-task-phase]')){const value=node.dataset.idTaskPhase;if(!window.__withdrawQaPhases.includes(value))window.__withdrawQaPhases.push(value);}};
    window.__withdrawQaObserver=new MutationObserver(record);window.__withdrawQaObserver.observe(root,{subtree:true,attributes:true,childList:true});record();
  });
  const close=special?'[data-stf-action="close"]':'[data-tf-action="close"]';
  await page.locator(`${modal} .tf-footer ${close}`).click();await page.locator(`${modal}[open]`).waitFor({state:'hidden'});
  if(motion){
    await phase(page,'status').waitFor();assert.match(await card(page,id).innerText(),/Отозвана/);
    await phase(page,'dissolve').waitFor();await paint(page);await assertIds(page);
    const dissolve=await card(page,id).evaluate(node=>{
      const style=getComputedStyle(node),mist=getComputedStyle(node,'::after');
      const animations=node.getAnimations().filter(animation=>animation.effect?.target===node).map(animation=>({duration:animation.effect.getTiming().duration,currentTime:Number(animation.currentTime||0),frames:animation.effect.getKeyframes().map(frame=>({opacity:Number(frame.opacity),filter:frame.filter}))}));
      return {isDissolving:node.classList.contains('is-dissolving'),inert:node.inert,opacity:Number(style.opacity),filter:style.filter,
        mist:{content:mist.content,background:mist.backgroundImage,pointer:mist.pointerEvents,position:mist.position},animations};
    });
    assert.equal(dissolve.isDissolving,true,'The actual linked card enters the dissolve state');
    assert.equal(dissolve.inert,true,'Disappearing task controls cannot be activated');
    const animation=dissolve.animations.find(item=>item.frames.some(frame=>/blur\(/.test(frame.filter||''))&&item.frames.some(frame=>Number.isFinite(frame.opacity)));
    assert.ok(animation,'The actual card is animated, not a decorative replacement or loader');
    assert.ok(animation.duration>=700&&animation.duration<=1000,'Dissolve stays noticeable without delaying the archive');
    assert.deepEqual(animation.frames.map(frame=>frame.opacity),[1,.55,0],'Card opacity fades smoothly to zero');
    assert.deepEqual(animation.frames.map(frame=>Number(/blur\(([\d.]+)px\)/.exec(frame.filter)?.[1])),[0,4,10],'The actual card progressively blurs');
    assert.ok(dissolve.opacity>0&&dissolve.opacity<1,'Card opacity is visibly changing during dissolve');
    assert.ok(Number(/blur\(([\d.]+)px\)/.exec(dissolve.filter)?.[1])>0,'Card blur is visibly changing during dissolve');
    assert.notEqual(dissolve.mist.content,'none','Blue mist is a decorative CSS pseudo-element');
    assert.match(dissolve.mist.background,/radial-gradient/,'Mist uses a soft radial cloud');
    const colors=[...dissolve.mist.background.matchAll(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/g)].map(match=>match.slice(1,4).map(Number));
    assert.ok(colors.some(([red,green,blue])=>blue>red+20&&blue>=green),'Mist has a blue tone');
    assert.equal(dissolve.mist.pointer,'none','Decorative mist cannot intercept clicks');
    assert.equal(dissolve.mist.position,'absolute','Mist stays attached to the disappearing card');
    assert.equal(await page.locator(`${detail} .id-detail-task-pixels,${detail} .id-detail-task-pixel,${detail} .id-detail-task-pixel-source`).count(),0,'Dissolve does not create pixel clones or masks');
    await page.waitForTimeout(Math.max(0,410-animation.currentTime));
    await page.screenshot({path:path.join(output,`dissolve-${special?'special':'plain'}.png`),animations:'allow'});
  }else assert.equal(await phase(page,'dissolve').count(),0,'Reduced motion skips blur/mist animation');
  await card(page,id).waitFor({state:'detached'});
  await phase(page,'collapse').waitFor({state:'detached'});
  if(motion)assert.deepEqual(await page.evaluate(()=>window.__withdrawQaPhases),['status','dissolve','collapse'],'Status, dissolve and collapse happen in the intended order');
  await page.evaluate(()=>window.__withdrawQaObserver.disconnect());
  await filter(page,'withdrawn').waitFor();await paint(page);
  const after=await geometry(page);
  assert.ok(after.section.height<before.section.height-30,'Task block shrinks by the removed card area');
  assert.ok(Math.abs(after.footer.bottom-before.footer.bottom)<2,'Fixed footer does not jump during collapse');
  assert.equal(after.scrollY,before.scrollY,'Nested animation never scrolls the underlying page');
  assert.equal(await page.evaluate(id=>BpmTaskStore.get(id).status,id),'Отозвана','Task remains in the local store');
  return {before,after};
}
async function archive(page,ids,expectedWithdrawn){
  assert.equal(await filter(page,'active').getAttribute('aria-selected'),'true','Current tasks are the default');
  assert.match(await filter(page,'active').innerText(),new RegExp(String(4-expectedWithdrawn)));
  assert.match(await filter(page,'withdrawn').innerText(),new RegExp(String(expectedWithdrawn)));
  assert.equal(await card(page,ids.completed).count(),1,'Completed is not withdrawn');
  assert.equal(await card(page,ids.rejected).count(),1,'Rejected is not withdrawn');
  await filter(page,'active').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await filter(page,'withdrawn').getAttribute('aria-selected'),'true','Keyboard selects the archive');
  assert.equal(await page.locator(`${detail} [data-id-task-card]`).count(),expectedWithdrawn);
  assert.equal(await card(page,ids.plain).count(),1);assert.equal(await phase(page,'dissolve').count(),0,'Archive cards do not replay disappearance');
  await filter(page,'active').click();
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({offline:true,viewport:{width:1440,height:920},reducedMotion:'no-preference'});
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>requests.push(request.url().slice(0,100)));page.setDefaultTimeout(15000);
  try{
    await page.goto(`${base}#insights`);await ready(page);const ids=await seed(page);await openInsight(page,ids.insight);
    assert.equal(await filter(page,'active').count(),0,'No needless tabs until a withdrawal exists');
    assert.equal(await page.locator(`${detail} [data-id-task-card]`).count(),4);
    const count=await page.evaluate(()=>BpmTaskStore.list().length);
    await page.evaluate(id=>BpmTaskStore.update(id,{description:'Изменена несвязанная задача'}),ids.unrelated);
    assert.equal(await page.locator(`${detail} [data-id-task-card]`).count(),4,'Unrelated changes do not disturb the current block');
    await withdraw(page,ids.plain);await archive(page,ids,1);
    await withdraw(page,ids.special,{special:true});await archive(page,ids,2);
    assert.equal(await page.evaluate(()=>BpmTaskStore.list().length),count,'No task records are deleted');
    assert.ok((await page.evaluate(id=>BpmInsightStore.get(id).detail.taskIds,ids.insight)).includes(ids.plain),'Withdrawn links remain intact');
    await page.reload();await ready(page);await openInsight(page,ids.insight);await archive(page,ids,2);await filter(page,'withdrawn').click();
    await card(page,ids.special).click();await page.locator('#special-task-flow[open]').waitFor();
    assert.match(await page.locator('#special-task-flow').innerText(),/Отозвана/);
    assert.equal(await page.locator('#special-task-flow [data-stf-action^="lifecycle:"]').count(),0,'Archived task is read-only');
    await page.locator('#special-task-flow .tf-footer [data-stf-action="close"]').click();await page.locator('#special-task-flow[open]').waitFor({state:'hidden'});
    await page.setViewportSize({width:390,height:844});await filter(page,'withdrawn').scrollIntoViewIfNeeded();await paint(page);await assertIds(page);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Archive fits mobile without page overflow');
    await page.screenshot({path:path.join(output,'archive-390.png'),animations:'disabled'});
    // Cabinet is a parent modal, not a reason to indefinitely defer the sequence.
    await page.setViewportSize({width:1440,height:920});await page.emulateMedia({reducedMotion:'reduce'});
    const extra=await page.evaluate(id=>BpmTaskStore.create({title:'Отзыв из дровера кабинета',insightId:id,assignees:['Петрова Мария Игоревна']}),ids.insight);
    await openInsight(page,ids.insight,true);await withdraw(page,extra.id,{motion:false});
    assert.equal(await page.locator('#cabinet-panel').isVisible(),true,'Cabinet stays underneath the insight drawer');
    await filter(page,'withdrawn').click();assert.equal(await card(page,extra.id).count(),1);
    await page.locator(`${detail} [data-id-drawer-close]`).click();
    await page.locator('#cabinet-insight-drawer[open]').waitFor({state:'hidden'});
    assert.equal(await page.locator(`${detail} [data-id-task-phase]`).count(),0,'Closing removes transient motion state');
    assert.deepEqual(errors,[],'No runtime errors');assert.deepEqual(requests,[],'All assets work offline');
    console.log(`PASS — ${standalone?'standalone':'source'}: plain/special withdrawal, visible status, real-card opacity/blur with decorative blue mist, collapse, tabs/keyboard, persistence, terminal distinctions, Cabinet/reduced-motion/mobile, retained records and fixed footer.`);
    console.log(`Screenshots: ${output}`);
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

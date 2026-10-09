/* Whole linked-task card activation and Figma empty states.
 * node registry/test-insight-task-cards.cjs [--standalone [file.html]]
 * Offline disposable browser, never a live profile or external backend. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const args=process.argv.slice(2),output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-task-cards-'));
let source=path.resolve(args.find(arg=>!arg.startsWith('--'))||(args.includes('--standalone')?path.join(__dirname,'..','Sber-BPM-Registry-Standalone.html'):path.join(__dirname,'index.html')));
const standalone=path.basename(source)!=='index.html';
if(standalone){const copy=path.join(output,'isolated-prototype.html');fs.copyFileSync(source,copy);source=copy;}
const base=pathToFileURL(source).href,insightId='INS-000009',detail='#insights-detail-view';
const iconBytes=fs.readFileSync(path.join(__dirname,'assets/insight-approval/empty.svg'));
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const ready=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const cabinetReady=page=>page.waitForFunction(()=>!document.querySelector('#cabinet-panel')?.hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
const paint=page=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
const card=(page,id)=>page.locator(`${detail} [data-id-task-card="${id}"]`);
const filter=(page,value)=>page.locator(`${detail} [data-id-task-filter="${value}"]`);
const review=(page,selector)=>page.locator(selector).evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});
async function openInsight(page,cabinet=false){
  await page.goto(`${base}${cabinet?'#cabinet':'#insights'}`);
  if(cabinet){await cabinetReady(page);await page.locator(`#cabinet-feed-insights .card-title[data-cabinet-open="${insightId}"]`).click();await page.locator('#cabinet-insight-drawer[open]').waitFor();}
  else{await ready(page);await page.locator(`[data-insight-open="${insightId}"]`).click();}
  await page.locator(`${detail}[data-insight-id="${insightId}"]`).waitFor();
  const accordion=page.locator(`${detail} [data-id-accordion="tasks"]`).first();
  if(await accordion.getAttribute('aria-expanded')!=='true')await accordion.click();
  await page.locator(`${detail} #id-detail-tasks`).scrollIntoViewIfNeeded();await paint(page);
}
async function emptyState(page,{archived=false,label}){
  const empty=page.locator(`${detail} .id-detail-tasks-empty`);await empty.waitFor();
  assert.equal(await empty.locator('p').textContent(),archived?'Нет актуальных задач':'Нет ни одной задачи',`${label}: exact empty title`);
  assert.equal(await empty.locator('small').textContent(),archived?'Все задачи инсайта отозваны':'К данному инсайту не заведено ни одной задачи',`${label}: exact empty subtitle`);
  const icon=empty.locator('img'),src=await icon.getAttribute('src');
  if(standalone){
    assert.match(src,/^data:image\/svg\+xml[;,]/,`${label}: empty-state icon is embedded`);
    const comma=src.indexOf(','),bytes=src.slice(0,comma).includes(';base64')?Buffer.from(src.slice(comma+1),'base64'):Buffer.from(decodeURIComponent(src.slice(comma+1)));
    assert.equal(digest(bytes),digest(iconBytes),`${label}: standalone uses the exact approved Figma icon`);
  }else assert.match(src,/assets\/insight-approval\/empty\.svg$/,`${label}: approved Figma icon path`);
  await icon.evaluate(image=>image.decode());await paint(page);
  const styles=await empty.evaluate(node=>{
    const icon=node.querySelector('img'),title=node.querySelector('p'),subtitle=node.querySelector('small'),rect=node.getBoundingClientRect(),image=icon.getBoundingClientRect();
    const style=getComputedStyle(node),p=getComputedStyle(title),s=getComputedStyle(subtitle),scroll=node.closest('.id-detail-scroll'),view=scroll.getBoundingClientRect();
    return {display:style.display,align:style.alignItems,justify:style.justifyContent,gap:style.gap,opacity:style.opacity,paddingLeft:style.paddingLeft,paddingRight:style.paddingRight,center:(image.left+image.right-rect.left-rect.right)/2,
      iconWidth:image.width,iconHeight:image.height,loaded:icon.complete&&icon.naturalWidth>0,titleSize:p.fontSize,titleLine:p.lineHeight,titleWeight:p.fontWeight,titleColor:p.color,subtitleSize:s.fontSize,subtitleLine:s.lineHeight,subtitleColor:s.color,
      left:rect.left,right:rect.right,viewLeft:view.left,viewRight:view.right,scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth,pageWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  assert.equal(styles.display,'flex');assert.equal(styles.align,'center');assert.equal(styles.justify,'center');assert.equal(styles.gap,'8px');assert.equal(styles.opacity,'0.8');
  assert.equal(styles.paddingLeft,'40px');assert.equal(styles.paddingRight,'40px');
  assert.ok(Math.abs(styles.center)<1,`${label}: icon centered in task empty state`);assert.equal(styles.iconWidth,40);assert.equal(styles.iconHeight,40);assert.equal(styles.loaded,true);
  assert.equal(styles.titleSize,'17px');assert.equal(styles.titleLine,'24px');assert.equal(styles.titleWeight,'590');assert.equal(styles.titleColor,'rgb(26, 26, 26)');
  assert.equal(styles.subtitleSize,'13px');assert.equal(styles.subtitleLine,'18px');assert.equal(styles.subtitleColor,'rgb(127, 127, 127)');
  assert.ok(styles.left>=styles.viewLeft-1&&styles.right<=styles.viewRight+1&&styles.scrollWidth<=styles.clientWidth+1&&styles.pageWidth<=styles.viewport+1,`${label}: empty-state fits its viewport: ${JSON.stringify(styles)}`);
  assert.equal(await page.locator(`${detail} [data-id-task-card]`).count(),0,`${label}: no fake task card in empty state`);
  assert.ok(await page.locator(`${detail} [data-id-create-task]`).isEnabled(),`${label}: create-task link remains available`);
  assert.equal(await page.locator(`${detail} [data-id-accordion="tasks"]`).first().getAttribute('aria-expanded'),'true');
}
async function emptyWidths(page,archived,label){
  for(const width of [320,390,1440,3840]){
    await page.setViewportSize({width,height:width===3840?2160:1000});await paint(page);
    await page.locator(`${detail} #id-detail-tasks`).scrollIntoViewIfNeeded();await paint(page);
    await emptyState(page,{archived,label:`${label}/${width}`});
    await page.screenshot({path:path.join(output,`${label}-${width}.png`),animations:'disabled'});
    if(width===1440)await page.locator(`${detail} #id-detail-tasks`).locator('xpath=..').screenshot({path:path.join(output,`${label}-component-1440.png`),animations:'disabled'});
  }
  await page.setViewportSize({width:1440,height:1000});await paint(page);
}
async function expectTask(page,task,trigger,{special=true,focus=true}={}){
  await trigger();const modal=special?'#special-task-flow':'#task-flow';
  await page.locator(`${modal}[open]`).waitFor();await paint(page);
  assert.ok((await page.locator(modal).innerText()).includes(task.title),'Whole-card action opens the selected task');
  assert.equal(await page.locator('#task-flow[open],#special-task-flow[open]').count(),1,'Exactly one child task drawer opens');
  await page.locator(`${modal} ${special?'[data-stf-action="close"]':'[data-tf-action="close"]'}`).first().click();
  await page.locator(`${modal}[open]`).waitFor({state:'hidden'});await paint(page);
  if(focus)assert.equal(await card(page,task.id).evaluate(node=>node===document.activeElement),true,'Closing the task restores focus to its whole card');
}
async function clipboardStub(page){await page.evaluate(()=>{window.__taskCardCopied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.__taskCardCopied.push(value)}});});}
async function pendingWithdrawal(page,task,special){
  await card(page,task.id).click({position:{x:8,y:8}});const modal=special?'#special-task-flow':'#task-flow';await page.locator(`${modal}[open]`).waitFor();
  await review(page,`${modal} .tf-content`);await paint(page);
  await page.locator(`${modal} ${special?'[data-stf-action="lifecycle:withdraw"]':'[data-tf-action="withdraw"]'}`).click();
  const pending=card(page,task.id);await pending.waitFor();assert.equal(await pending.getAttribute('aria-disabled'),'true','Pending withdrawal card is disabled');
  assert.equal(await pending.getAttribute('tabindex'),'-1','Pending withdrawal card leaves the tab order');
  assert.match(await pending.innerText(),/Отозвана/,'Pending card shows the committed withdrawn status');
  await page.evaluate(({modal,id,detail})=>{
    window.__taskCardReopens=0;window.__taskCardObserver=new MutationObserver(records=>{window.__taskCardReopens+=records.length;});
    window.__taskCardObserver.observe(document.querySelector(modal),{subtree:true,childList:true});
    const card=document.querySelector(`${detail} [data-id-task-card="${id}"]`);card.click();card.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));card.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));
  },{modal,id:task.id,detail});await paint(page);
  assert.equal(await page.evaluate(()=>window.__taskCardReopens),0,'Disabled pending card cannot reopen via click or keyboard');
  await page.evaluate(()=>window.__taskCardObserver.disconnect());
  await page.locator(`${modal} .tf-footer ${special?'[data-stf-action="close"]':'[data-tf-action="close"]'}`).click();await page.locator(`${modal}[open]`).waitFor({state:'hidden'});
  await paint(page);assert.equal(await pending.evaluate(node=>node.inert),true,'Status-phase withdrawn card is inert before disappearing');
  await pending.waitFor({state:'detached'});await paint(page);
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({offline:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],requests=[];
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>requests.push(request.url().slice(0,160)));
  try{
    await page.goto(`${base}#insights`);await ready(page);
    await page.evaluate(id=>{const row=BpmInsightStore.get(id);BpmInsightStore.update(id,{status:'В работе',detail:{...row.detail,taskIds:[]}});},insightId);
    await openInsight(page);
    assert.match(await page.locator(`${detail} [data-id-accordion="tasks"]`).first().innerText(),/Задачи 0/);
    assert.equal(await filter(page,'active').count(),0,'No empty archive tabs before any linked task exists');
    await emptyWidths(page,false,'empty-none');
    const tasks=await page.evaluate(id=>{
      const row=BpmInsightStore.get(id),executor='Петрова Мария Игоревна',common={description:'Проверка клика и ховера по всей карточке.',insightId:id,insightTitle:row.title,processId:row.related[0].id,processCode:row.related[0].code,assignees:[executor],executor};
      const special=BpmTaskStore.create({...common,title:'Первая задача для клика по всей карточке',flowType:'insight-work',deadline:'2026-12-31'}),plain=BpmTaskStore.create({...common,title:'Вторая обычная задача для архива',deadline:''});
      return {special,plain};
    },insightId);await card(page,tasks.special.id).waitFor();await paint(page);
    const first=card(page,tasks.special.id);await first.scrollIntoViewIfNeeded();
    assert.equal(await first.getAttribute('role'),'button');assert.equal(await first.getAttribute('tabindex'),'0');assert.match(await first.getAttribute('aria-label'),new RegExp(tasks.special.id));
    assert.equal(await first.locator('.id-detail-task-title').evaluate(node=>node.tagName),'STRONG','Title is semantic content, not a nested open button');
    assert.equal(await first.locator('[data-id-task]').count(),0,'Only the whole card carries the task-opening action');
    const titleColor=await first.locator('.id-detail-task-title').evaluate(node=>getComputedStyle(node).color);
    await first.hover({position:{x:8,y:8}});await page.waitForTimeout(180);
    const hover=await first.evaluate(node=>{const probe=document.createElement('span');probe.style.color='var(--hover)';document.body.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return {color:getComputedStyle(node).backgroundColor,shadow:getComputedStyle(node).boxShadow,expected};});
    assert.equal(hover.color,hover.expected,'Hover colors the entire card with the DS hover token');assert.notEqual(hover.shadow,'none','Hover raises the entire card');
    assert.equal(await first.locator('.id-detail-task-title').evaluate(node=>getComputedStyle(node).color),titleColor,'Hover does not turn only the title blue');
    await page.screenshot({path:path.join(output,'whole-card-hover-1440.png'),animations:'disabled'});
    await page.locator(`${detail} #id-detail-tasks`).locator('xpath=..').screenshot({path:path.join(output,'whole-card-hover-component-1440.png'),animations:'disabled'});
    await page.setViewportSize({width:390,height:1000});await first.scrollIntoViewIfNeeded();await first.hover({position:{x:8,y:8}});await page.waitForTimeout(180);
    await page.screenshot({path:path.join(output,'whole-card-hover-390.png'),animations:'disabled'});
    await page.setViewportSize({width:1440,height:1000});await paint(page);
    const blank=async()=>{const r=await first.boundingBox();await first.click({position:{x:r.width-8,y:r.height/2}});};
    for(const trigger of [blank,()=>first.locator('.task-status').click(),()=>first.locator('.id-detail-task-title').click(),()=>first.locator('.task-id-badge:not(button)').first().click(),()=>first.locator('.task-deadline').click()])await expectTask(page,tasks.special,trigger);
    for(const key of ['Enter','Space'])await expectTask(page,tasks.special,async()=>{await first.focus();await page.keyboard.press(key);});
    await clipboardStub(page);const copy=first.locator('button[data-id-copy]'),code=await copy.getAttribute('data-id-copy');
    await copy.click();await paint(page);assert.equal(await page.locator('#task-flow[open],#special-task-flow[open]').count(),0,'Copy badge does not open the card');
    await copy.focus();for(const key of ['Enter','Space']){await page.keyboard.press(key);await paint(page);assert.equal(await page.locator('#task-flow[open],#special-task-flow[open]').count(),0,'Nested copy-button keyboard does not open the parent card');}
    assert.deepEqual(await page.evaluate(()=>window.__taskCardCopied),[code,code,code],'Only the copy action runs for nested badge pointer/keyboard activation');
    console.log('PASS — Whole-card hover, blank/status/title/ID/deadline pointer activation, Enter/Space, card focus restoration and independent copy action');

    await pendingWithdrawal(page,tasks.special,true);assert.equal(await filter(page,'active').getAttribute('aria-selected'),'true');
    await filter(page,'withdrawn').click();await expectTask(page,tasks.special,()=>card(page,tasks.special.id).click());
    await filter(page,'active').click();await expectTask(page,tasks.plain,()=>card(page,tasks.plain.id).click(),{special:false});
    await pendingWithdrawal(page,tasks.plain,false);
    assert.equal(await filter(page,'active').locator('span').textContent(),'0');assert.equal(await filter(page,'withdrawn').locator('span').textContent(),'2');
    assert.match(await page.locator(`${detail} [data-id-accordion="tasks"]`).first().innerText(),/Задачи 2/);
    await emptyWidths(page,true,'empty-all-withdrawn');
    await page.reload();await ready(page);await openInsight(page);await emptyState(page,{archived:true,label:'Reloaded active-empty archive'});
    await filter(page,'withdrawn').click();assert.equal(await page.locator(`${detail} [data-id-task-card]`).count(),2,'Archive retains both actual task records');
    await expectTask(page,tasks.plain,()=>card(page,tasks.plain.id).click(),{special:false});
    await openInsight(page,true);assert.equal(await page.locator('#cabinet-panel').isVisible(),true,'Cabinet remains underneath its insight drawer');
    await filter(page,'withdrawn').click();await expectTask(page,tasks.special,()=>card(page,tasks.special.id).locator('.id-detail-task-title').click());
    assert.equal(await page.locator('#cabinet-insight-drawer[open]').count(),1,'Closing nested task preserves the parent Cabinet drawer');
    await filter(page,'active').click();await emptyState(page,{archived:true,label:'Cabinet active-empty archive'});
    console.log('PASS — Active/archive cards, disabled pending-withdrawal guards, retained counters/records, responsive empty states and nested Cabinet task opening');

    await page.locator(`${detail} [data-id-create-task]`).click();await page.locator('#special-task-flow[open][data-type="insight-work"]').waitFor();
    await page.locator('#stf-description').fill('Создать задачу из пустого списка актуальных задач.');
    await page.locator('#stf-assignees-input').click();await page.locator('#stf-assignees-list [data-option]:not([data-option=""])').first().click();
    await page.keyboard.press('Escape');
    await review(page,'#special-task-flow .tf-content');await paint(page);await page.locator('#special-task-flow .tf-footer [data-stf-action="save"]').click();
    await page.locator('#special-task-flow[open]').waitFor({state:'hidden'});await page.locator(`${detail} .id-detail-tasks--loading`).waitFor();
    const skeleton=page.locator(`${detail} .id-detail-task-skeleton`);
    assert.equal(await skeleton.locator('[data-id-task]').count(),0);assert.equal(await skeleton.getAttribute('data-id-task'),null);assert.equal(await skeleton.getAttribute('role'),null);
    await skeleton.evaluate(node=>{node.click();node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));node.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));});await paint(page);
    assert.equal(await page.locator('#task-flow[open],#special-task-flow[open]').count(),0,'Loading skeleton cannot open a task');
    await page.locator(`${detail} .id-detail-tasks[aria-busy="false"]`).waitFor();assert.equal(await page.locator(`${detail} [data-id-task-card]`).count(),1,'Real new card replaces the noninteractive skeleton');
    assert.equal(await filter(page,'withdrawn').locator('span').textContent(),'2','New task does not lose the archive');
    assert.deepEqual(errors,[],'No runtime errors');assert.deepEqual(requests,[],'All assets load offline');
    console.log('PASS — Empty-state create link still creates a real task; loading is noninteractive and archive remains intact');
    console.log(JSON.stringify({source,standalone,output}));
  }catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(`Screenshots: ${output}`);throw error;}
  finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

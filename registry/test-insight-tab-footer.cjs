/* Existing insights always use tabs; fixed footer and per-tab scroll review.
 * node test-insight-tab-footer.cjs [index.html | standalone.html] */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-tab-footer-'));
let source = path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
if (path.basename(source) !== 'index.html') {const copy = path.join(output,'prototype.html');fs.copyFileSync(source,copy);source=copy;}
const detail = '#insights-detail-view', scroll = `${detail} .id-detail-scroll`, footer = `${detail} .id-detail-footer`;
const approve = `${footer} [data-id-approval=approve]`;
const ready = page => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
const paint = page => page.evaluate(async () => {await document.fonts.ready;await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));});
async function open(page,id) {
  // The heading resets the demo; the active view control returns without discarding workflow changes.
  if (await page.locator('#insights-panel.is-insight-detail').count()) {await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);}
  await page.locator(`#insights-results [data-insight-open="${id}"]`).click();await paint(page);
  assert.equal(await page.locator('dialog[open]').count(),0,`${id}: no approval drawer opens from registry`);
  assert.equal(await page.locator(`[data-insight-tab="${id}"]`).getAttribute('aria-selected'),'true',`${id}: own tab selected`);
}
async function scrollTo(page,fraction) {
  await page.locator(scroll).evaluate((node,value) => {node.scrollTop = (node.scrollHeight-node.clientHeight)*value;node.dispatchEvent(new Event('scroll'));},fraction);await paint(page);
}
async function progress(page,selector=approve) {
  return page.locator(selector).evaluate(node => ({disabled:node.disabled,progress:Number(node.dataset.scrollProgress),pending:node.getAttribute('data-scroll-pending'),meters:node.querySelectorAll('.scroll-cta-meter:not([hidden])').length}));
}
async function viewedProgress(page,label) {
  const geometry=await page.locator(scroll).evaluate(node=>({top:node.scrollTop,visible:node.clientHeight,total:node.scrollHeight}));
  const actual=(await progress(page)).progress,expected=Math.min(1,(geometry.top+geometry.visible)/geometry.total);
  assert.ok(Math.abs(actual-expected)<.0001,`${label}: ring reflects the viewed share of the entire form ${JSON.stringify({actual,expected,geometry})}`);
  return actual;
}
function locked(value,label) {assert.equal(value.disabled,true,label);assert.equal(value.pending,'true',label);assert.equal(value.meters,1,label);assert.ok(value.progress<1,label);}
function completed(value,label,disabled=false) {assert.equal(value.progress,1,label);assert.equal(value.pending,null,label);assert.equal(value.meters,0,label);assert.equal(value.disabled,disabled,label);}
async function geometry(page) {
  return page.evaluate(() => {
    const panel=document.querySelector('#insights-detail-view'),scroll=panel.querySelector('.id-detail-scroll'),footer=panel.querySelector('.id-detail-footer'),f=footer.getBoundingClientRect(),s=scroll.getBoundingClientRect(),tabs=document.querySelector('#insights-tabs').getBoundingClientRect();
    return {footer:{left:f.left,right:f.right,top:f.top,bottom:f.bottom},body:{top:s.top,bottom:s.bottom,width:scroll.clientWidth,scroll:scroll.scrollWidth},tabs:{top:tabs.top,bottom:tabs.bottom},viewport:{width:innerWidth,height:innerHeight},pageWidth:document.documentElement.scrollWidth};
  });
}
async function fixedFooter(page,label) {
  const first=await geometry(page);
  assert.ok(first.footer.top>first.tabs.bottom,`${label}: footer below tabs`);
  assert.ok(first.footer.left>=-1&&first.footer.right<=first.viewport.width+1,`${label}: footer inside viewport`);
  assert.ok(first.footer.bottom<=first.viewport.height+1&&first.footer.bottom>=first.viewport.height-32,`${label}: footer pinned near viewport bottom ${JSON.stringify(first)}`);
  assert.ok(first.body.bottom<=first.footer.top+1,`${label}: scroll content never overlays footer`);
  assert.ok(first.body.scroll<=first.body.width+1&&first.pageWidth<=first.viewport.width+1,`${label}: no page or vertical body horizontal overflow`);
  await scrollTo(page,1);const last=await geometry(page);
  assert.ok(Math.abs(first.footer.top-last.footer.top)<1&&Math.abs(first.footer.bottom-last.footer.bottom)<1,`${label}: footer is stationary during content scroll`);
  assert.ok(Math.abs(first.tabs.top-last.tabs.top)<1,`${label}: tab strip remains stationary`);
}
async function approvalDeadline(page,label) {
  const layout=await page.locator(footer).evaluate(node=>{
    const deadline=node.querySelector('.id-detail-deadline').getBoundingClientRect(),button=node.querySelector('[data-id-approval="approve"]').getBoundingClientRect();
    return {deadline:{top:deadline.top,bottom:deadline.bottom,left:deadline.left,right:deadline.right},button:{top:button.top,bottom:button.bottom,left:button.left,right:button.right},gap:parseFloat(getComputedStyle(node).columnGap),width:node.clientWidth};
  });
  if(layout.width>700){
    assert.ok(Math.abs(layout.button.left-layout.deadline.right-layout.gap)<1,`${label}: deadline directly precedes the right CTA`);
    assert.ok(layout.deadline.top>=layout.button.top&&layout.deadline.bottom<=layout.button.bottom,`${label}: deadline and CTA share one row`);
  }else{
    assert.ok(Math.abs(layout.deadline.right-layout.button.right)<1,`${label}: compact deadline aligns with the right CTA`);
    assert.ok(layout.deadline.bottom<=layout.button.top+1,`${label}: compact deadline stays above the CTA`);
  }
}
async function main() {
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:700},reducedMotion:'reduce',offline:true});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(pathToFileURL(source).href+'#insights');await ready(page);
    await open(page,'INS-000060');
    await approvalDeadline(page,'Initial approval');
    locked(await progress(page),'Approval starts gated');const initial=await viewedProgress(page,'Initial approval');assert.ok(initial>0);
    const initialStatus=await page.evaluate(()=>BpmInsightStore.get('INS-000060').status);
    await page.locator(approve).evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));
    assert.equal(await page.locator('#insight-detail-approval-confirm[open]').count(),0,'Synthetic click cannot bypass reading');
    await page.locator(approve).focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>BpmInsightStore.get('INS-000060').status),initialStatus,'Keyboard cannot approve unread insight');
    await scrollTo(page,.4);const partial=await progress(page);locked(partial,'Partial review');await viewedProgress(page,'Partial approval');assert.ok(partial.progress>initial&&partial.progress<1);
    await open(page,'INS-000058');locked(await progress(page),'Another tab has independent gate');await viewedProgress(page,'Independent initial progress');
    await page.locator('[data-insight-tab="INS-000060"]').click();await paint(page);
    assert.ok(Math.abs((await progress(page)).progress-partial.progress)<.03,'Switching tabs restores partial progress and scroll position');
    await scrollTo(page,0);assert.ok(Math.abs((await progress(page)).progress-initial)<.0001,'Scrollback reduces incomplete progress to the visible portion');
    await fixedFooter(page,'Approval desktop');completed(await progress(page),'End unlocks approval');
    await scrollTo(page,0);completed(await progress(page),'First completion remains latched');
    await page.locator('[data-insight-tab="INS-000058"]').click();await paint(page);locked(await progress(page),'Other tab remains unread');
    await page.locator('[data-insight-tab="INS-000060"]').click();await paint(page);completed(await progress(page),'Completed tab retains latch on return');
    await page.locator('[data-insight-tab="INS-000060"]').hover();await page.locator('[data-insight-tab-close="INS-000060"]').click();await paint(page);
    await open(page,'INS-000060');locked(await progress(page),'Closing and reopening resets gate');assert.ok(Math.abs((await progress(page)).progress-initial)<.0001);
    console.log('PASS — Tab-only approval, real scroll progress, keyboard/synthetic guard, independent tabs, restored partial progress and completion, close/reset');

    for(const width of [320,390,768,1440,3840]) {
      await page.setViewportSize({width,height:width===3840?2160:920});await paint(page);
      if(await page.locator('body.mobile-menu-open').count())await page.locator('#collapse-menu').click();
      await fixedFooter(page,`${width}px approval`);
      await approvalDeadline(page,`${width}px approval`);
      const broken=await page.locator(`${detail} img:visible`).evaluateAll(images=>images.filter(image=>!image.complete||!image.naturalWidth).map(image=>image.src));assert.deepEqual(broken,[]);
      if(width===390||width===1440)await page.screenshot({path:path.join(output,`approval-tab-${width}.png`)});
    }
    await open(page,'INS-000057');
    const range=await page.locator(scroll).evaluate(node=>node.scrollHeight-node.clientHeight);
    assert.ok(range>2,'Fresh 4K approval requires a short scroll');
    await page.setViewportSize({width:3840,height:2160+range-100});await paint(page);
    const shortRange=await page.locator(scroll).evaluate(node=>node.scrollHeight-node.clientHeight);
    assert.ok(Math.abs(shortRange-100)<=1,`Short approval form has 100px remaining, not an arbitrary long scroll: ${shortRange}`);
    locked(await progress(page),'Short form remains gated');const shortInitial=await viewedProgress(page,'Short form initial portion');assert.ok(shortInitial>.9);
    await scrollTo(page,.5);locked(await progress(page),'50px remaining');await viewedProgress(page,'Short form halfway');
    assert.ok((await progress(page)).progress>shortInitial,'The last 100px fill only the remaining arc');
    await approvalDeadline(page,'Short approval');await page.screenshot({path:path.join(output,'approval-short-form.png')});
    await scrollTo(page,1);completed(await progress(page),'Short form unlocks exactly at its end');
    await scrollTo(page,0);completed(await progress(page),'Short form completion stays latched');
    await page.setViewportSize({width:1440,height:700});await open(page,'INS-000055');
    const opinion=`${footer} [data-id-send-opinion]`;locked(await progress(page,opinion),'Opinion gated even while business-disabled');
    await scrollTo(page,1);completed(await progress(page,opinion),'Reading does not override unchanged-opinion validation',true);
    await scrollTo(page,0);await page.locator('[data-id-reproduction="Воспроизводится"]').click();await paint(page);
    completed(await progress(page,opinion),'Reading does not override unanswered effect questions',true);
    const effectCount=await page.locator(`${detail} .id-detail-effect`).count();
    for(let index=0;index<effectCount;index++)await page.locator(`${detail} [data-id-applicable="${index}"][data-id-value="false"]`).click();
    completed(await progress(page,opinion),'Valid edit unlocks opinion after review');
    await page.locator(opinion).click();await paint(page);
    async function sentOpinion(label) {
      assert.equal(await page.locator(`${opinion} [data-id-opinion-submit-label]`).textContent(),'Мнение отправлено',`${label}: persisted response has a sent caption`);
      assert.ok(await page.locator(opinion).isDisabled(),`${label}: sent primary stays disabled`);
      assert.equal(await page.locator(opinion).getAttribute('data-scroll-pending'),null,`${label}: sent caption never implies another review is required`);
      assert.equal(await page.locator(`${opinion} .scroll-cta-meter:not([hidden])`).count(),0,`${label}: sent primary has no misleading loader`);
      assert.equal(await page.locator(`${footer} [data-id-close]`).textContent(),'Закрыть',`${label}: sent navigation closes its tab`);
      assert.equal(await page.locator(`${footer} [data-id-return]`).count(),0,`${label}: no return-to-registry button remains`);
      const layout=await page.locator(footer).evaluate(node=>{
        const close=node.querySelector('[data-id-close]'),submit=node.querySelector('[data-id-send-opinion]'),c=close.getBoundingClientRect(),s=submit.getBoundingClientRect();
        return {sent:node.classList.contains('id-detail-footer--opinion-sent'),ordered:close.nextElementSibling===submit,gap:s.left-c.right,expectedGap:parseFloat(getComputedStyle(node).columnGap),sameRow:Math.abs(c.top-s.top)<1};
      });
      assert.ok(layout.sent&&layout.ordered&&layout.sameRow,`${label}: Close and Sent form one ordered footer group`);
      assert.ok(Math.abs(layout.gap-layout.expectedGap)<1,`${label}: sent footer actions are adjacent`);
    }
    await sentOpinion('Immediately after sending');
    await page.screenshot({path:path.join(output,'opinion-sent-footer.png')});
    const comment=page.locator('[data-id-field="reproductionComment"]');
    await comment.fill('Уточнённая оценка после отправки');await paint(page);
    assert.equal(await comment.evaluate(node=>node===document.activeElement),true,'Editing the sent opinion preserves textarea focus');
    assert.equal(await page.locator(`${opinion} [data-id-opinion-submit-label]`).textContent(),'Отправить мнение','An edit restores the send caption');
    assert.equal(await page.locator(`${footer} [data-id-return]`).textContent(),'К реестру','An unsent revision restores normal draft navigation');
    assert.equal(await page.locator(`${footer}.id-detail-footer--opinion-sent`).count(),0,'An unsent revision removes the sent layout state');
    completed(await progress(page,opinion),'An edit unlocks resending without resetting completed review');
    await page.locator(opinion).click();await paint(page);await sentOpinion('After resending');
    let savedOpinion=await page.evaluate(()=>{const row=BpmInsightStore.get('INS-000055'),flow=BpmInsightWorkflow.getWorkflow(row);return flow.opinions.responses.find(response=>response.bank===flow.currentActor.bank);});
    assert.equal(savedOpinion.comment,'Уточнённая оценка после отправки','Resending persists the edited opinion');
    await page.locator(`${footer} [data-id-close]`).click();await paint(page);
    assert.equal(await page.locator('[data-insight-tab="INS-000055"]').count(),0,'Sent Close actually removes the insight tab');
    await open(page,'INS-000055');await sentOpinion('After closing and reopening');
    await comment.fill('Уточнение после повторного открытия');await paint(page);
    locked(await progress(page,opinion),'Editing a fresh reopened sent opinion restores its independent review gate');
    await scrollTo(page,1);completed(await progress(page,opinion),'Review enables an edited reopened opinion');
    await page.locator(opinion).click();await paint(page);await sentOpinion('After reviewing and resending a reopened opinion');
    savedOpinion=await page.evaluate(()=>{const row=BpmInsightStore.get('INS-000055'),flow=BpmInsightWorkflow.getWorkflow(row);return flow.opinions.responses.find(response=>response.bank===flow.currentActor.bank);});
    assert.equal(savedOpinion.comment,'Уточнение после повторного открытия','Reopened revision is saved explicitly');
    await page.reload();await ready(page);await open(page,'INS-000055');await sentOpinion('After browser reload');
    const restoredOpinion=await page.evaluate(()=>{const row=BpmInsightStore.get('INS-000055'),flow=BpmInsightWorkflow.getWorkflow(row);return flow.opinions.responses.find(response=>response.bank===flow.currentActor.bank);});
    assert.deepEqual(restoredOpinion,savedOpinion,'Sent state and opinion data survive reload without another write');
    console.log('PASS — Sent opinion footer, adjacent Close, persisted reopen/reload, live edit focus, resending and independent scroll/business validation');
    await open(page,'INS-000054');const take=`${footer} [data-id-take]`;locked(await progress(page,take),'Team decision starts gated');
    await scrollTo(page,1);completed(await progress(page,take),'Team primary unlocks after reading');
    console.log('PASS — Fixed footer at 320–3840px, 24px loader assets, opinion validation independent of reading, team decision gate');

    await open(page,'INS-000042');assert.ok(await page.locator(`${footer} [data-id-return]`).isEnabled(),'Realized read-only navigation is not gated');
    assert.equal(await page.locator(`${footer} [data-id-return]`).textContent(),'Выйти','Read-only navigation is labelled Выйти');
    assert.equal(await page.locator(footer).getByText('К реестру',{exact:true}).count(),0,'Read-only footer has no old return label');
    const exitLayout=await page.locator(footer).evaluate(node=>{
      const status=node.querySelector('.id-detail-status'),button=node.querySelector('[data-id-return]'),s=status.getBoundingClientRect(),b=button.getBoundingClientRect();
      return {statusBeforeButton:status.nextElementSibling===button,statusRight:s.right,buttonLeft:b.left,statusTop:s.top,statusBottom:s.bottom,buttonTop:b.top,buttonBottom:b.bottom};
    });
    assert.ok(exitLayout.statusBeforeButton&&exitLayout.buttonLeft>exitLayout.statusRight,'Exit is directly to the right of status');
    assert.ok(exitLayout.statusTop>=exitLayout.buttonTop&&exitLayout.statusBottom<=exitLayout.buttonBottom,'Status and exit align in one row');
    assert.equal(await page.locator(`${footer} [data-scroll-pending]`).count(),0,'Read-only record has no blocked navigation CTA');
    await fixedFooter(page,'Read-only view');
    await page.locator(`${footer} [data-id-return]`).click();await ready(page);assert.ok(await page.locator('#insights-registry-view').isVisible(),'Footer returns to registry');
    assert.equal(await page.locator('body.insight-tab-open').count(),0,'Registry restores ordinary page scrolling');
    assert.equal(await page.locator('[data-insight-tab="INS-000042"]').count(),1,'Выйти retains a realized insight tab');
    console.log('PASS — Read-only footer returns to the registry without closing its tab');

    // Rejected insights have a real close action, sharing the tab-strip cleanup
    // and neighboring-tab activation rather than only returning to the registry.
    async function closeAllTabs() {
      while(await page.locator('[data-insight-tab-close]').count()) {
        const close=page.locator('[data-insight-tab-close]').first();
        await close.locator('..').hover();await close.click();await paint(page);
      }
      await ready(page);
    }
    await closeAllTabs();
    const rejectedBefore=await page.evaluate(()=>BpmInsightStore.get('INS-000078'));
    await open(page,'INS-000067');await open(page,'INS-000078');await open(page,'INS-000051');
    await page.locator('[data-insight-tab="INS-000078"]').click();await paint(page);
    const closeRejected=`${footer} [data-id-close]`;
    assert.equal(await page.locator(closeRejected).textContent(),'Закрыть','The rejected footer is labelled Закрыть');
    assert.equal(await page.locator(`${footer} [data-id-return]`).count(),0,'Rejected footer has no exit-to-registry action');
    assert.ok(await page.locator(closeRejected).isEnabled(),'Rejected close is never scroll-gated');
    assert.equal(await page.locator(`${footer} [data-scroll-pending]`).count(),0,'Rejected footer has no reading meter');
    await page.locator(closeRejected).click();await paint(page);
    assert.deepEqual(await page.locator('[data-insight-tab]').evaluateAll(nodes=>nodes.map(node=>node.dataset.insightTab)),['INS-000067','INS-000051'],'Close removes only the rejected tab');
    assert.equal(await page.locator('[data-insight-tab="INS-000051"]').getAttribute('aria-selected'),'true','Close activates the next tab at the same index');
    assert.equal(await page.locator('[data-insight-tab="INS-000051"]').evaluate(node=>node===document.activeElement),true,'Focus follows the activated neighboring tab');
    assert.deepEqual(await page.evaluate(()=>BpmInsightStore.get('INS-000078')),rejectedBefore,'Closing never changes or deletes the rejected insight');

    await closeAllTabs();await open(page,'INS-000078');await scrollTo(page,1);
    assert.ok(await page.locator(scroll).evaluate(node=>node.scrollTop>0),'Rejected insight has a remembered nonzero scroll before close');
    await page.locator(closeRejected).click();await ready(page);await paint(page);
    assert.equal(await page.locator('[data-insight-tab]').count(),0,'Closing the last rejected tab removes the entire tab strip');
    assert.ok(await page.locator('#insights-registry-view').isVisible(),'Closing the last tab returns to the registry');
    assert.equal(await page.locator('body.insight-tab-open').count(),0,'Last-tab close restores ordinary registry scrolling');
    await open(page,'INS-000078');
    assert.equal(await page.locator(scroll).evaluate(node=>node.scrollTop),0,'Reopening the closed rejected insight creates a fresh session');
    assert.deepEqual(await page.evaluate(()=>BpmInsightStore.get('INS-000078')),rejectedBefore,'Reopening retains the source record unchanged');
    console.log('PASS — Rejected close removes only its tab, focuses the next one, returns after the last tab, and resets the closed session');

    await open(page,'INS-000067');await page.locator('#cabinet-nav').click();
    await page.waitForFunction(()=>!document.querySelector('#cabinet-panel')?.hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
    const cabinetTrigger=page.locator('#cabinet-feed-insights [data-cabinet-open="INS-000078"] .card-title');
    const cabinetHash=new URL(page.url()).hash;
    await cabinetTrigger.click();await page.locator('#cabinet-insight-drawer[open]').waitFor();await paint(page);
    await page.locator(closeRejected).click();await page.locator('#cabinet-insight-drawer[open]').waitFor({state:'hidden'});await paint(page);
    assert.ok(await page.locator('#cabinet-panel').isVisible(),'Rejected close in Cabinet stays in Cabinet');
    assert.equal(new URL(page.url()).hash,cabinetHash,'Closing from Cabinet does not navigate');
    assert.equal(await page.locator('[data-insight-tab="INS-000078"]').count(),0,'Cabinet close removes the rejected internal tab');
    assert.equal(await page.locator('[data-insight-tab="INS-000067"]').getAttribute('aria-selected'),'true','Cabinet close selects the remaining tab offscreen');
    assert.equal(await cabinetTrigger.evaluate(node=>node===document.activeElement),true,'Cabinet close restores its originating card focus');
    assert.equal(await page.locator('#insights-panel #insights-detail-view').count(),1,'Shared detail host is returned before tab cleanup');
    await page.locator('#sidebar').hover();
    if(await page.locator('#paths-nav').getAttribute('aria-expanded')!=='true')await page.locator('#paths-nav').click();
    await page.locator('#insights-nav').click();await paint(page);
    assert.equal(await page.locator(`${detail}[data-insight-id="INS-000067"]`).isVisible(),true,'Entering Insights reveals the selected remaining tab');
    assert.deepEqual(await page.evaluate(()=>BpmInsightStore.get('INS-000078')),rejectedBefore,'Cabinet close also leaves the source record unchanged');
    assert.deepEqual(errors,[],'No runtime errors');
    console.log(`PASS — Rejected Cabinet close preserves Cabinet, host ownership and neighboring tab. Screenshots: ${output}`);
  } catch(error) {await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(`Screenshots: ${output}`);throw error;}
  finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

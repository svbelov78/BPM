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
  if (await page.locator('#insights-back').isVisible()) {await page.locator('#insights-back').click();await ready(page);}
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
async function main() {
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:700},reducedMotion:'reduce',offline:true});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(pathToFileURL(source).href+'#insights');await ready(page);
    await open(page,'INS-000060');
    locked(await progress(page),'Approval starts gated');assert.equal((await progress(page)).progress,0);
    const initialStatus=await page.evaluate(()=>BpmInsightStore.get('INS-000060').status);
    await page.locator(approve).evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));
    assert.equal(await page.locator('#insight-detail-approval-confirm[open]').count(),0,'Synthetic click cannot bypass reading');
    await page.locator(approve).focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>BpmInsightStore.get('INS-000060').status),initialStatus,'Keyboard cannot approve unread insight');
    await scrollTo(page,.4);const partial=await progress(page);locked(partial,'Partial review');assert.ok(partial.progress>.3&&partial.progress<.5);
    await open(page,'INS-000058');locked(await progress(page),'Another tab has independent gate');assert.equal((await progress(page)).progress,0);
    await page.locator('[data-insight-tab="INS-000060"]').click();await paint(page);
    assert.ok(Math.abs((await progress(page)).progress-partial.progress)<.03,'Switching tabs restores partial progress and scroll position');
    await scrollTo(page,0);assert.equal((await progress(page)).progress,0,'Scrollback reduces incomplete progress');
    await fixedFooter(page,'Approval desktop');completed(await progress(page),'End unlocks approval');
    await scrollTo(page,0);completed(await progress(page),'First completion remains latched');
    await page.locator('[data-insight-tab="INS-000058"]').click();await paint(page);locked(await progress(page),'Other tab remains unread');
    await page.locator('[data-insight-tab="INS-000060"]').click();await paint(page);completed(await progress(page),'Completed tab retains latch on return');
    await page.locator('[data-insight-tab="INS-000060"]').hover();await page.locator('[data-insight-tab-close="INS-000060"]').click();await paint(page);
    await open(page,'INS-000060');locked(await progress(page),'Closing and reopening resets gate');assert.equal((await progress(page)).progress,0);
    console.log('PASS — Tab-only approval, real scroll progress, keyboard/synthetic guard, independent tabs, restored partial progress and completion, close/reset');

    for(const width of [320,390,768,1440,3840]) {
      await page.setViewportSize({width,height:width===3840?2160:920});await paint(page);
      if(await page.locator('body.mobile-menu-open').count())await page.locator('#collapse-menu').click();
      await fixedFooter(page,`${width}px approval`);
      const broken=await page.locator(`${detail} img:visible`).evaluateAll(images=>images.filter(image=>!image.complete||!image.naturalWidth).map(image=>image.src));assert.deepEqual(broken,[]);
      if(width===390||width===1440)await page.screenshot({path:path.join(output,`approval-tab-${width}.png`)});
    }
    await page.setViewportSize({width:1440,height:700});await open(page,'INS-000055');
    const opinion=`${footer} [data-id-send-opinion]`;locked(await progress(page,opinion),'Opinion gated even while business-disabled');
    await scrollTo(page,1);completed(await progress(page,opinion),'Reading does not override unchanged-opinion validation',true);
    await scrollTo(page,0);await page.locator('[data-id-reproduction="Воспроизводится"]').click();await paint(page);
    completed(await progress(page,opinion),'Valid edit unlocks opinion after review');
    await page.locator(opinion).click();await paint(page);completed(await progress(page,opinion),'Saved opinion disables unchanged submission without resetting review',true);
    await open(page,'INS-000054');const take=`${footer} [data-id-take]`;locked(await progress(page,take),'Team decision starts gated');
    await scrollTo(page,1);completed(await progress(page,take),'Team primary unlocks after reading');
    console.log('PASS — Fixed footer at 320–3840px, 24px loader assets, opinion validation independent of reading, team decision gate');

    await open(page,'INS-000067');assert.ok(await page.locator(`${footer} [data-id-return]`).isEnabled(),'Read-only navigation is not gated');
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
    assert.deepEqual(errors,[],'No runtime errors');
    console.log(`PASS — Read-only footer, return navigation, ordinary registry scrolling restored. Screenshots: ${output}`);
  } catch(error) {await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(`Screenshots: ${output}`);throw error;}
  finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

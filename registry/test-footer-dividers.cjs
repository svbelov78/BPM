/* Footer/actionbar divider regression. Fresh offline browser; no live profile.
 * node registry/test-footer-dividers.cjs [registry/index.html | standalone.html]
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-footer-dividers-'));
let source = path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
if (path.basename(source) !== 'index.html') {
  const isolated = path.join(output,'offline-prototype.html');
  fs.copyFileSync(source,isolated); source = isolated;
}
const url = section => `${pathToFileURL(source).href}#${section}`;
const report = message => console.log(`PASS — ${message}`);
async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function ready(page,section) {
  await page.waitForFunction(section => document.querySelector(`#${section}-results`)?.getAttribute('aria-busy') === 'false',section);
}
async function noDivider(page,selector,label,{scroll}={}) {
  const target = page.locator(selector).first(); await target.waitFor({state:'visible'}); await paint(page);
  const metrics = await target.evaluate(node => {
    const inspect = item => {
      const style = getComputedStyle(item);
      return {top:style.borderTopWidth,bottom:style.borderBottomWidth,shadow:style.boxShadow,image:style.backgroundImage,
        before:getComputedStyle(item,'::before').content,after:getComputedStyle(item,'::after').content};
    };
    const box = node.getBoundingClientRect();
    return {footer:inspect(node),previous:node.previousElementSibling ? inspect(node.previousElementSibling) : null,
      parent:inspect(node.parentElement),top:box.top,bottom:box.bottom,height:innerHeight,buttons:node.querySelectorAll('button').length};
  });
  assert.equal(metrics.footer.top,'0px',`${label}: footer has no top border`);
  assert.equal(metrics.footer.shadow,'none',`${label}: no shadow-based divider`);
  assert.equal(metrics.footer.image,'none',`${label}: no background-image divider`);
  for (const key of ['before','after']) assert.ok(['none','normal'].includes(metrics.footer[key]),`${label}: no ${key} divider`);
  if (metrics.previous) {
    assert.equal(metrics.previous.bottom,'0px',`${label}: preceding content has no bottom-border substitute`);
    assert.equal(metrics.previous.shadow,'none',`${label}: preceding content has no shadow substitute`);
    for (const key of ['before','after']) assert.ok(['none','normal'].includes(metrics.previous[key]),`${label}: preceding content has no ${key} substitute`);
  }
  assert.equal(metrics.parent.bottom,'0px',`${label}: enclosing shell has no bottom-divider substitute`);
  assert.ok(metrics.buttons>0,`${label}: action buttons remain present`);
  if (scroll) {
    assert.ok(metrics.top>=0 && metrics.bottom<=metrics.height+1,`${label}: footer remains inside the viewport`);
    await page.locator(scroll).evaluate(node => {node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});
    await paint(page);
    const after=await target.evaluate(node=>{const rect=node.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};});
    assert.ok(Math.abs(after.top-metrics.top)<1 && Math.abs(after.bottom-metrics.bottom)<1,`${label}: content scroll does not move footer`);
  }
}
async function openInsight(page,id) {
  if (await page.locator('#insights-panel.is-insight-detail').count()) await page.locator('.insights-view-controls [aria-pressed="true"]').click();
  await ready(page,'insights'); await page.locator(`[data-insight-open="${id}"]`).click();
  await page.locator(`#insights-detail-view[data-insight-id="${id}"]`).waitFor();
}
async function main() {
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({offline:true,reducedMotion:'reduce',viewport:{width:1440,height:920}});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(url('insights')); await ready(page,'insights');
    await openInsight(page,'INS-000060');
    for (const width of [320,390,768,1440,3840]) {
      await page.setViewportSize({width,height:width===3840?2160:920});
      await noDivider(page,'#insights-detail-view .id-detail-footer',`Insight tab ${width}px`,{scroll:'#insights-detail-view .id-detail-scroll'});
    }
    await page.setViewportSize({width:1440,height:920});
    for (const id of ['INS-000055','INS-000009','INS-000042','INS-000078']) {
      await openInsight(page,id);
      await noDivider(page,'#insights-detail-view .id-detail-footer',`Insight ${id}`,{scroll:'#insights-detail-view .id-detail-scroll'});
    }
    assert.equal(await page.locator('#insights-detail-view .secondary-button').last().evaluate(node=>getComputedStyle(node).borderTopWidth),'1px','Secondary button outline is preserved');
    await page.screenshot({path:path.join(output,'insight-footer-1440.png'),animations:'disabled'});
    report('All insight footer modes: 0px divider, intact button outlines, fixed position at 320–3840px');

    await page.locator('#cabinet-nav').click();
    await page.waitForFunction(()=>!document.querySelector('#cabinet-panel')?.hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
    await page.locator('#cabinet-feed-insights [data-cabinet-open="INS-000078"] .card-title').click();
    await page.locator('#cabinet-insight-drawer[open]').waitFor();
    await noDivider(page,'#cabinet-insight-drawer .id-detail-footer','Cabinet insight drawer',{scroll:'#cabinet-insight-drawer .id-detail-scroll'});
    await page.locator('#cabinet-insight-drawer [data-id-drawer-close]').click();
    await page.locator('#cabinet-insight-drawer[open]').waitFor({state:'hidden'});
    report('Cabinet 10-column insight drawer: no divider, stable footer');

    await page.goto(url('insights')); await ready(page,'insights');
    if (await page.locator('#insights-panel.is-insight-detail').count()) {
      await page.locator('.insights-view-controls [aria-pressed="true"]').click(); await ready(page,'insights');
    }
    await page.locator('#insights-create').click();
    await noDivider(page,'#insight-create-drawer .ic-actions','Insight creation drawer',{scroll:'#insight-create-drawer .ic-scroll'});
    await page.keyboard.press('Escape'); await page.locator('#insight-create-drawer[open]').waitFor({state:'hidden'});
    await page.locator('#insights-export').click();
    await noDivider(page,'#insights-export-dialog .insights-export-actions','Insights export actions');
    await page.locator('#insights-export-dialog .insights-export-actions [data-insight-export-close]').click();
    report('Insight creation and export actions: no own or preceding-content divider');

    // Instantiate the public preview component in this isolated document only.
    await page.evaluate(()=>{
      window.__footerQaApproval=BpmInsightApproval.create({getRow:id=>BpmInsightStore.get(id),onChange:()=>{},onOpenTab:()=>{}});
      window.__footerQaApproval.open('INS-000060');
    });
    await noDivider(page,'dialog.ia-drawer[open] .ia-footer','Approval drawer',{scroll:'dialog.ia-drawer[open] .ia-scroll'});
    await page.locator('dialog.ia-drawer[open] [data-ia-decision="approve"]').click();
    await noDivider(page,'#insight-approval-confirm[open] .modal-actions','Approval confirmation actions');
    await page.locator('#insight-approval-confirm[open] .modal-actions [data-ia-confirm-close]').click();
    await page.evaluate(()=>window.__footerQaApproval.close());
    await page.locator('dialog.ia-drawer[open]').waitFor({state:'hidden'});
    report('Approval preview/confirmation actions: no divider, no decision submitted');

    await page.goto(url('tasks')); await ready(page,'tasks');
    await page.evaluate(()=>BpmTaskFlow.open({mode:'create'}));
    await noDivider(page,'#task-flow .tf-footer','Standard task creation',{scroll:'#task-flow .tf-content'});
    await page.evaluate(()=>BpmTaskFlow.close({immediate:true}));
    const types=['extended-access','role-management','process-result-approval','business-description-checklist','metric-inapplicability','bulk-metric-inapplicability','business-description-update','insight','insight-work'];
    for (const typeId of types) {
      await page.evaluate(typeId=>BpmSpecialTaskFlow.open({mode:'create',typeId,insightId:typeId==='insight-work'?'INS-000009':undefined}),typeId);
      await noDivider(page,'#special-task-flow .tf-footer',`${typeId} creation`,{scroll:'#special-task-flow .tf-content'});
      if (typeId==='metric-inapplicability') {
        await page.locator('#special-task-flow [data-stf-action="item-add"][data-field="metrics"]').click();
        await noDivider(page,'#special-task-flow .tf-sheet-actions','Nested task sheet',{scroll:'#special-task-flow .stf-sheet-content'});
        await page.locator('#special-task-flow .tf-sheet-actions [data-stf-action="sheet-cancel"]').click();
      }
      await page.evaluate(()=>BpmSpecialTaskFlow.close({immediate:true}));
    }
    report('Standard, 9 specialized task drawers and nested task sheet: no divider, stable actionbars');

    await page.goto(url('main')); await page.locator('#structure-toggle').click();
    await page.waitForFunction(()=>document.querySelector('#structure-list')?.getAttribute('aria-busy')==='false');
    await page.locator('#structure-people').click();
    await noDivider(page,'#structure-people-popup .structure-people-footer','People filter footer',{scroll:'#structure-people-list'});
    await page.screenshot({path:path.join(output,'people-footer-1440.png'),animations:'disabled'});
    report('People filter footer: 0px divider and intact reset control');
    assert.deepEqual(errors,[],'No browser runtime errors');
    report(`No runtime errors; screenshots: ${output}`);
  } finally {await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

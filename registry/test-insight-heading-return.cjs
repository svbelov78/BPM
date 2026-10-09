/* The entire Insights heading returns to the registry and replays its demo alert.
 * node registry/test-insight-heading-return.cjs [registry/index.html | standalone.html]
 * Uses an isolated offline profile and only synthetic demonstration records. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-heading-return-'));
let source = path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
if (path.basename(source) !== 'index.html') {
  const copy = path.join(output,'isolated-prototype.html');
  fs.copyFileSync(source,copy); source = copy;
}
const ready = page => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
const paint = page => page.evaluate(async () => {await document.fonts.ready;await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));});
const tabs = page => page.locator('#insights-tabs [data-insight-tab]').evaluateAll(nodes => nodes.map(node => node.dataset.insightTab));
async function openTab(page,id) {
  await page.locator(`#insights-tabs [data-insight-tab="${id}"]`).click(); await paint(page);
  assert.ok(await page.locator('#insights-detail-view').isVisible(),'Opening a tab displays detail');
  assert.ok(await page.locator('.insights-alert').isHidden(),'The registry alert is absent in detail');
}
async function alertInViewport(page,label) {
  assert.ok(await page.locator('#insights-registry-view').isVisible(),`${label}: registry is restored`);
  assert.ok(await page.locator('#insights-detail-view').isHidden(),`${label}: detail is hidden`);
  assert.ok(await page.locator('.insights-alert').isVisible(),`${label}: current pending-actions alert is restored`);
  const geometry = await page.locator('.insights-alert').evaluate(node => {
    const box = node.getBoundingClientRect(),header = document.querySelector('.header').getBoundingClientRect();
    return {top:box.top,bottom:box.bottom,left:box.left,right:box.right,headerBottom:header.bottom,height:innerHeight,width:innerWidth,scroll:scrollY};
  });
  assert.ok(geometry.top >= geometry.headerBottom - 1 && geometry.bottom <= geometry.height + 1,`${label}: alert is fully visible below the header ${JSON.stringify(geometry)}`);
  assert.ok(geometry.left >= -1 && geometry.right <= geometry.width + 1,`${label}: alert stays inside the viewport`);
  assert.equal(geometry.scroll,0,`${label}: heading return resets the window scroll`);
  assert.equal(await page.locator('#insights-tabs [aria-selected="true"]').count(),0,`${label}: registry has no selected record tab`);
  assert.ok(await page.locator('#insights-back-icon').isHidden(),`${label}: registry heading hides only its back icon`);
}
async function clickGap(page) {
  const point = await page.locator('#insights-back').evaluate(node => {
    const label = node.querySelector('#insights-title-label').getBoundingClientRect(),count = node.querySelector('#insights-count').getBoundingClientRect();
    const x = (label.right + count.left) / 2,y = (Math.max(label.top,count.top) + Math.min(label.bottom,count.bottom)) / 2;
    return {x,y,gap:count.left-label.right,belongs:document.elementFromPoint(x,y) === node};
  });
  assert.ok(point.gap > 0 && point.belongs,`The gap between title and counter belongs to the same native button ${JSON.stringify(point)}`);
  await page.mouse.click(point.x,point.y);
}
async function returnVia(page,action,label) {
  await action(); await ready(page); await paint(page); await alertInViewport(page,label);
}
async function pendingCounts(page) {
  return page.evaluate(() => {
    const rows = BpmInsightStore.list();
    return {approval:rows.filter(row => BpmInsightWorkflow.canApprove(row)).length,opinion:rows.filter(row => row.needsOpinion).length,decision:rows.filter(row => BpmInsightWorkflow.canDecideTeam(row)).length};
  });
}
async function assertPendingCounts(page,expected,label) {
  for (const [kind,count] of Object.entries(expected)) {
    const button = page.locator(`.insights-alert [data-insight-attention="${kind}"]`);
    if (!count) assert.equal(await button.count(),0,`${label}: empty ${kind} category is absent`);
    else assert.match(await button.textContent(),new RegExp(` ${count}$`),`${label}: ${kind} count uses the current store`);
  }
}
async function headingGeometry(page,width) {
  const value = await page.locator('#insights-back').evaluate(node => {
    const rect = element => {const box = element.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom};};
    return {tag:node.tagName,button:rect(node),title:rect(node.querySelector('#insights-title-label')),count:rect(node.querySelector('#insights-count')),viewport:innerWidth,page:document.documentElement.scrollWidth,buttons:document.querySelectorAll('#insights-title button').length};
  });
  assert.equal(value.tag,'BUTTON',`${width}px: heading uses native keyboard semantics`);
  assert.equal(value.buttons,1,`${width}px: the heading has one, not nested, button`);
  assert.ok(value.button.left >= -1 && value.button.right <= value.viewport + 1 && value.page <= value.viewport + 1,`${width}px: heading does not introduce horizontal overflow ${JSON.stringify(value)}`);
  for (const name of ['title','count']) assert.ok(value[name].left >= value.button.left - 1 && value[name].right <= value.button.right + 1 && value[name].top >= value.button.top - 1 && value[name].bottom <= value.button.bottom + 1,`${width}px: ${name} is entirely inside the common button`);
}
async function main() {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',offline:true});
  const page = await context.newPage(),errors = [];page.setDefaultTimeout(15000);
  page.on('pageerror',error => errors.push(error.message));
  try {
    await page.goto(pathToFileURL(source).href+'#insights');await ready(page);await paint(page);
    const initialStore = await page.evaluate(() => BpmInsightStore.list());
    const id = initialStore[0].id;
    assert.ok(await page.locator('#insights-back').isVisible(),'The heading button remains available in registry mode');
    await headingGeometry(page,1440);
    await page.locator(`#insights-results [data-insight-open="${id}"]`).click();await paint(page);
    const expectedTabs = await tabs(page);
    await returnVia(page,() => page.locator('#insights-title-label').click(),'Title text click');
    assert.deepEqual(await tabs(page),expectedTabs,'Title return leaves the open tab in place');
    await openTab(page,id);
    await returnVia(page,() => page.locator('#insights-count').click(),'Counter click');
    await openTab(page,id);
    await returnVia(page,() => clickGap(page),'Heading gap click');
    for (const key of ['Enter','Space']) {
      await openTab(page,id);await page.locator('#insights-back').focus();
      await returnVia(page,() => page.keyboard.press(key),`${key} activation`);
      assert.equal(await page.locator('#insights-back').evaluate(node => node === document.activeElement),true,`${key}: focus remains on the native heading control`);
    }
    assert.deepEqual(await page.evaluate(() => BpmInsightStore.list()),initialStore,'Replaying unchanged examples retains their baseline data');
    console.log('PASS — Text, counter, empty gap and Enter/Space restore the initial alert without closing tabs');

    // A record opened near the end of a scrolled registry must return to the
    // visible alert, not to the older offscreen scroll position.
    await page.locator('#insights-results .insights-card').last().scrollIntoViewIfNeeded();await paint(page);
    const registryScroll = await page.evaluate(() => scrollY);
    assert.ok(registryScroll > 100,'The registry is substantially scrolled before opening another record');
    assert.ok(await page.locator('#insights-tabs').evaluate(node => node.matches(':popover-open')),'Open tabs are genuinely docked in the global header before opening the record');
    const lastId = await page.locator('#insights-results .insights-card').last().getAttribute('data-insight-id');
    await page.locator(`#insights-results [data-insight-open="${lastId}"]`).click();await paint(page);
    await returnVia(page,() => page.locator('#insights-count').click(),'Return from a scrolled registry');
    assert.ok(await page.locator('#insights-tabs').evaluate(node => !node.matches(':popover-open')),'Heading return restores the normal in-flow strip at the top');
    assert.equal(await page.locator('#insights-tabs').count(),1,'Header docking never duplicates the real tab strip');
    assert.ok((await tabs(page)).includes(lastId),'The record opened while scrolled stays in the tab strip');

    // Clear applied filters and custom sorting so the replayed scenarios are
    // visible, but keep the user's table view and open tabs.
    await page.locator('#insights-table').click();await ready(page);
    await page.locator('#insights-search').fill(id);await ready(page);
    await page.locator('[data-insight-sort="created"]').click();await ready(page);
    assert.ok((await page.locator('#insights-chips').textContent()).includes(id),'The pre-reset query is genuinely applied');
    const beforeTabs = await tabs(page);
    await page.locator(`#insights-results [data-insight-open="${id}"]`).click();await paint(page);
    await returnVia(page,() => clickGap(page),'Replay from a filtered table');
    assert.ok(await page.locator('.insights-table').isVisible(),'Table view remains selected');
    assert.equal(await page.locator('#insights-search').inputValue(),'','The search is cleared to expose the original scenarios');
    assert.ok(await page.locator('#insights-applied').isHidden(),'Applied filters are cleared');
    assert.equal(await page.locator('#insights-count').textContent(),String(initialStore.length),'All records are counted again');
    assert.deepEqual(await page.locator('.insights-table th[aria-sort]').evaluate(node => ({direction:node.getAttribute('aria-sort'),key:node.querySelector('button').dataset.insightSort})),{direction:'descending',key:'id'},'The initial ID sort is restored');
    assert.deepEqual(await tabs(page),beforeTabs,'All existing tabs remain after returning to a filtered table');
    console.log('PASS — Replay from a scrolled/docked registry makes the alert visible and clears filters while preserving table view and tabs');

    for (const width of [320,1440]) {
      await page.setViewportSize({width,height:900});await paint(page);
      await headingGeometry(page,width);await openTab(page,id);await headingGeometry(page,width);
      await returnVia(page,() => page.locator('#insights-count').click(),`${width}px counter return`);
      await headingGeometry(page,width);
      await page.screenshot({path:path.join(output,`heading-return-${width}.png`)});
    }

    // Store mutations below are confined to this disposable context. They
    // prove the heading replays consumed pending work, not merely cached HTML.
    await openTab(page,id);
    const beforeCounts = await pendingCounts(page);
    assert.ok(beforeCounts.approval > 0,'Fixture includes pending approvals');
    await page.evaluate(() => {
      const row = BpmInsightStore.list().find(item => BpmInsightWorkflow.canApprove(item));
      BpmInsightStore.update(row.id,{status:'Отклонено'});
    });
    const afterCounts = await pendingCounts(page);
    assert.equal(afterCounts.approval,beforeCounts.approval-1,'Updating one pending record changes the store count');
    await returnVia(page,() => page.locator('#insights-count').click(),'Return after a pending-record update');
    await assertPendingCounts(page,beforeCounts,'Original pending counts restored');
    await openTab(page,id);
    await page.evaluate(() => {for (const row of BpmInsightStore.list()) BpmInsightStore.update(row.id,{status:'Отклонено',needsApproval:false,needsOpinion:false});});
    assert.deepEqual(await pendingCounts(page),{approval:0,opinion:0,decision:0},'The isolated fixture has no remaining pending work');
    await page.locator('#insights-title-label').click();await ready(page);await paint(page);
    await alertInViewport(page,'Replay after all demo actions are consumed');
    await assertPendingCounts(page,beforeCounts,'All original pending categories return');
    assert.deepEqual(await page.evaluate(() => BpmInsightStore.list()),initialStore,'The complete baseline scenarios return');
    assert.deepEqual(errors,[],'No browser runtime errors');
    console.log(`PASS — 320/1440px geometry and original pending work restored after all actions are consumed. Screenshots: ${output}`);
  } finally {await browser.close();}
}
main().catch(error => {console.error(error);process.exitCode=1;});

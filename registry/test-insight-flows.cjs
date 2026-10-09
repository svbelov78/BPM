/* Internal insight tabs + creation/duplicate flows, source and offline HTML.
 * node test-insight-flows.cjs [index.html | standalone.html] */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {chromium} = require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-flows-'));
let source = path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
const standalone = path.basename(source) !== 'index.html';
if (standalone) {const isolated = path.join(output,'prototype.html');fs.copyFileSync(source,isolated);source=isolated;}
const url = pathToFileURL(source).href+'#insights';
const ready = page => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
const report = text => console.log(`PASS — ${text}`);
async function noOverflow(page,label) {
  const size = await page.evaluate(() => ({width:innerWidth,body:document.documentElement.scrollWidth}));
  assert.ok(size.body <= size.width+1,`${label}: page overflow ${JSON.stringify(size)}`);
  const broken = await page.locator('img:visible').evaluateAll(images => images.filter(image=>!image.complete || !image.naturalWidth).map(image=>image.src.slice(0,100)));
  assert.deepEqual(broken,[],`${label}: all visible icons loaded`);
}
async function selectFirst(page,id) {
  await page.locator(`#${id}-input`).click();
  await page.locator(`#${id}-list [role=option]`).first().click();
}
async function main() {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce',offline:standalone});
  const page = await context.newPage(), errors = [], failed = [];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('requestfailed',request=>failed.push(request.url()));
  try {
    await page.goto(url); await ready(page);
    const seed = await page.evaluate(()=>window.BpmInsightStore.list());
    assert.equal(seed.length,16,'Six registry examples and ten BRD cases');
    const primary='INS-000067', second='INS-000009';
    await page.locator(`[data-insight-open="${primary}"]`).click();
    assert.equal(await page.locator('dialog[open]').count(),0,'Viewing is not a drawer');
    assert.equal(await page.locator('[role=tab][aria-selected=true]').innerText(),primary);
    assert.ok(await page.locator('#insights-registry-view').isHidden());
    await page.locator('[data-id-rating="4"]').click();
    assert.equal(await page.evaluate(id=>window.BpmInsightStore.get(id).detail.userRating,primary),4);
    await page.locator('.insights-view-controls button[aria-pressed="true"]').click(); await ready(page);
    await page.locator(`[data-insight-open="${second}"]`).click();
    assert.equal(await page.locator('#insights-tabs [role=tab]').count(),2);
    await page.locator(`[data-insight-tab="${primary}"]`).click();
    assert.equal(await page.locator('[data-id-rating="4"]').getAttribute('aria-pressed'),'true');
    await page.locator(`[data-insight-tab="${primary}"]`).press('End');
    assert.equal(await page.locator('[role=tab][aria-selected=true]').innerText(),second);
    await page.locator(`[data-insight-tab="${second}"]`).press('Home');
    assert.equal(await page.locator('[role=tab][aria-selected=true]').innerText(),primary);
    await page.locator('.insights-view-controls button[aria-pressed="true"]').click(); await ready(page);
    await page.locator(`[data-insight-open="${primary}"]`).click();
    assert.equal(await page.locator('#insights-tabs [role=tab]').count(),2,'Repeated open reuses tab');
    await page.locator(`[data-insight-tab="${primary}"]`).hover();
    await page.locator(`[data-insight-tab-close="${primary}"]`).click();
    assert.equal(await page.locator('[role=tab][aria-selected=true]').innerText(),second);
    await page.locator(`[data-insight-tab="${second}"]`).hover();
    await page.locator(`[data-insight-tab-close="${second}"]`).click(); await ready(page);
    assert.ok(await page.locator('#insights-tabs').isHidden());
    report('Internal tabs, repeated open, keyboard/close fallback, persisted rating');

    await page.locator('#insights-table').click(); await ready(page);
    await page.locator(`#insights-results [data-insight-open="${primary}"]`).click();
    assert.ok(await page.locator('#insights-detail-view').isVisible());
    await page.locator('.insights-view-controls button[aria-pressed="true"]').click(); await ready(page);
    assert.ok(await page.locator('.insights-table').isVisible(),'Return preserves table');
    await page.locator('#insights-create').click();
    const drawer=page.locator('#insight-create-drawer');
    await drawer.waitFor({state:'visible'});
    await drawer.locator('.ic-scroll').evaluate(node=>node.scrollTop=node.scrollHeight);
    await drawer.locator('[data-submit]').click();
    assert.ok(await drawer.locator('[data-error="title"]').isVisible(),'Required fields validated');
    const match=seed.find(row=>row.id===primary);
    await drawer.locator('[name=title]').fill(match.title);
    await drawer.locator('[name=description]').fill(match.description);
    await page.locator('#ic-duplicate-status[data-state=loading]').waitFor();
    assert.equal(await page.locator('#ic-duplicate-status').getAttribute('aria-busy'),'true');
    const sheet=page.locator('#insight-duplicate-sheet');
    await sheet.waitFor({state:'visible'});
    assert.ok((await sheet.locator('[data-open-match]').allTextContents()).includes(match.title));
    await page.screenshot({path:path.join(output,'duplicate-desktop.png'),animations:'disabled'});
    await sheet.locator(`[data-open-match="${primary}"]`).click();
    const preview=page.locator('#insight-approval-drawer');
    await preview.waitFor({state:'visible'});
    assert.ok(await drawer.isVisible(),'Creation remains open below the matching-insight preview');
    await preview.locator('[data-ia-close]').first().click();
    await sheet.waitFor({state:'visible'});await page.keyboard.press('Escape');
    assert.equal(await drawer.locator('[name=description]').inputValue(),match.description,'Draft survives duplicate inspection');
    await drawer.locator('[name=title]').fill('Оптимизация освещения архивного помещения');
    await drawer.locator('[name=description]').fill(match.description);
    await drawer.locator('[name=description]').fill('Освещение архивного помещения потребляет электричество ночью. Датчики присутствия сократят энергозатраты здания.');
    await page.locator('#ic-duplicate-status[data-state=none]').waitFor();
    assert.ok(await sheet.isHidden(),'Latest no-match text cancels stale duplicate result');
    report('Spinner, actual duplicate matching, automatic bottom sheet, draft and latest-input safety');

    await drawer.locator('[name=solution]').fill('Установить датчики присутствия и автоматическое отключение освещения.');
    await drawer.locator('[name=rootCauses]').fill('Отсутствует автоматическое отключение освещения архивного помещения.');
    await selectFirst(page,'ic-process');
    const effect=drawer.locator('.ic-effect').first(), effectId=await effect.getAttribute('data-effect');
    await selectFirst(page,`ic-${effectId}-name`);
    await effect.locator('[data-effect-field=description]').fill('Снижение регулярных расходов на освещение архивного помещения.');
    await effect.locator('[data-effect-field=current]').fill('240');
    await effect.locator('[data-effect-field=target]').fill('60');
    await selectFirst(page,`ic-${effectId}-unit`);
    await drawer.locator('#ic-file-input').setInputFiles({name:'example.txt',mimeType:'text/plain',buffer:Buffer.from('Local attachment demo')});
    await drawer.locator('#ic-attachment-count').filter({hasText:'1'}).waitFor();
    await drawer.locator('[data-submit]').click();
    await drawer.waitFor({state:'hidden'});
    await page.waitForFunction(count=>window.BpmInsightStore.list().length===count,seed.length+1);
    const created=await page.evaluate(()=>window.BpmInsightStore.list().find(row=>row.local));
    assert.equal(created.id,'INS-000079');
    assert.equal(created.title,'Оптимизация освещения архивного помещения');
    assert.equal(created.comments,0);
    assert.equal(created.attachments[0].name,'example.txt');
    assert.equal(await page.locator('[role=tab][aria-selected=true]').innerText(),created.id);
    assert.equal(await page.locator('#insight-detail-title').innerText(),created.title);
    await page.locator('.insights-view-controls button[aria-pressed="true"]').click(); await ready(page);
    assert.equal(await page.locator('#insights-results [data-insight-id]').count(),seed.length+1,'New record is visible despite old default date');
    await page.reload(); await ready(page);
    assert.ok(await page.evaluate(id=>!!window.BpmInsightStore.get(id),created.id),'Creation survives reload');
    assert.equal(await page.locator(`#insights-results [data-insight-open="${created.id}"]`).count(),1,'Default period includes the newly created record after reload');
    report('Creation, field validation, attachment metadata, current date visibility, local persistence');

    await page.locator('[data-insight-open="INS-000067"]').click();
    await page.locator('[data-id-create-task]').click();
    await page.locator('#special-task-flow[open][data-type="insight-work"]').waitFor();
    assert.equal(await page.locator('#stf-heading').innerText(),'Создать задачу');
    assert.equal(await page.locator('#stf-title').inputValue(),(await page.evaluate(()=>BpmInsightStore.get('INS-000067'))).title,'Related task seeds the selected insight title');
    assert.equal(await page.locator('#stf-insightId-input,#stf-processId-input,#stf-assignees-input').count(),0,'Insight context stays implicit in the compact four-field form');
    await page.evaluate(()=>window.BpmSpecialTaskFlow.close({immediate:true,restoreFocus:false}));
    report('Existing task-creation flow opens with the selected registry insight');

    for(const width of [1920,1440,768,390,3840]) {
      await page.setViewportSize({width,height:width===3840?2160:1080});
      await page.keyboard.press('Escape');
      await noOverflow(page,`${width}px detail`);
      await page.screenshot({path:path.join(output,`detail-${width}.png`),animations:'disabled'});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);
    await page.locator('#insights-create').click();
    await drawer.locator('[name=title]').fill('Совпадение на мобильном');
    await drawer.locator('[name=description]').fill(match.description);
    await sheet.waitFor({state:'visible'});
    const bounds=await sheet.boundingBox();
    assert.ok(bounds.x>=0 && bounds.x+bounds.width<=391,'Bottom sheet stays inside mobile viewport');
    await page.screenshot({path:path.join(output,'duplicate-390.png'),animations:'disabled'});
    await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
    assert.ok(await drawer.isVisible(),'Escape closes sheet before drawer');
    await page.evaluate(()=>{document.querySelector('#insight-create-drawer').close();});
    await page.locator('#cabinet-nav').evaluate(button=>button.click());
    await page.locator('#insights-nav').evaluate(button=>button.click());await ready(page);
    assert.equal(await page.locator('dialog[open]').count(),0,'Leaving has no stale sheet or discard modal');
    assert.deepEqual(errors,[],'No runtime errors');
    assert.deepEqual(failed,[],'No missing resources (offline standalone included)');
    report('Responsive through 4K, mobile sheet, Escape layering, native-close cleanup');
    console.log(`Screenshots: ${output}`);
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

/* Creation and duplicate-review regression. Isolated local browser data only.
 * node test-insight-create-brd.cjs [index.html | standalone.html] */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-create-brd-'));
let source = path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
if(path.basename(source)!=='index.html'){const copy=path.join(output,'isolated.html');fs.copyFileSync(source,copy);source=copy;}
const ready = page => page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
async function choose(page,id,value) {
  await page.locator(`#${id}-input`).click();
  await page.locator(`#${id}-list [data-option]`).filter({hasText:value}).first().click();
}
async function stableEdges(page,root,scroll,header,footer) {
  const before=await page.locator(root).evaluate((element,{header,footer})=>({header:element.querySelector(header).getBoundingClientRect().top,footer:element.querySelector(footer).getBoundingClientRect().top}),{header,footer});
  await page.locator(`${root} ${scroll}`).evaluate(element=>element.scrollTop=element.scrollHeight);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const after=await page.locator(root).evaluate((element,{header,footer})=>({header:element.querySelector(header).getBoundingClientRect().top,footer:element.querySelector(footer).getBoundingClientRect().top,bottom:element.querySelector(footer).getBoundingClientRect().bottom}),{header,footer});
  assert.ok(Math.abs(before.header-after.header)<1,'Header remains fixed while content scrolls');
  assert.ok(Math.abs(before.footer-after.footer)<1,'Footer remains fixed while content scrolls');
  assert.ok(after.bottom<=page.viewportSize().height,'Actions remain inside viewport');
}
async function main() {
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',offline:true});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  try {
    await page.goto(pathToFileURL(source).href+'#insights');await ready(page);
    const before=await page.evaluate(()=>window.BpmInsightStore.list().length);
    await page.locator('#insights-create').click();
    const drawer=page.locator('#insight-create-drawer'), sheet=page.locator('#insight-duplicate-sheet');
    await page.mouse.click(12,300);
    assert.ok(await drawer.isVisible(),'Backdrop does not close an empty creation drawer');
    assert.equal(await drawer.locator('.ic-effect').count(),1);
    assert.ok(await drawer.locator('[data-remove-effect]').isDisabled(),'The only effect cannot be removed');
    await stableEdges(page,'#insight-create-drawer','.ic-scroll','.ic-header','.ic-actions');
    await drawer.locator('#ic-file-input').setInputFiles({name:'details.txt',mimeType:'text/plain',buffer:Buffer.from('Demo attachment')});
    await drawer.locator('#ic-attachment-count').filter({hasText:'1'}).waitFor();
    await drawer.locator('[name=title]').fill('Освещение архивного помещения');
    await page.mouse.click(12,300);
    assert.ok(await drawer.isVisible(),'Backdrop does not close an edited creation drawer');
    assert.equal(await page.locator('#ic-discard-confirm[open], .ic-discard-dialog[open]').count(),0,'Backdrop does not trigger discard confirmation');
    assert.equal(await drawer.locator('[name=title]').inputValue(),'Освещение архивного помещения');
    await drawer.locator('[name=description]').fill('Датчики освещения архивного помещения сократят расход электричества ночью.');
    await sheet.waitFor({state:'visible'});
    assert.equal(await sheet.locator('.ic-match-card').count(),3,'First completed check always has three real demo matches');
    await stableEdges(page,'#insight-duplicate-sheet','.ic-matches-list','.ic-sheet-header','.ic-sheet-actions');
    await page.screenshot({path:path.join(output,'matches-desktop.png')});
    await sheet.locator('[data-open-match]').first().click();
    const preview=page.locator('#insight-approval-drawer');
    await preview.waitFor({state:'visible'});
    assert.ok(await drawer.isVisible(),'Creation remains open below the matching insight');
    const back=preview.getByRole('button',{name:'Все совпадения',exact:true});
    assert.ok(await back.isVisible(),'Matching insight has an explicit backlink');
    assert.ok(await back.locator('img').evaluate(node=>node.complete&&node.naturalWidth>0),'Backlink reuses the native return icon');
    await stableEdges(page,'#insight-approval-drawer','.ia-scroll','.ia-header','.ia-footer');
    assert.ok(await back.isVisible(),'Backlink remains in the fixed header');
    await page.setViewportSize({width:390,height:844});
    const backBox=await back.boundingBox();assert.ok(backBox.x>=0&&backBox.x+backBox.width<=390,'Backlink fits mobile');
    await preview.locator('.ia-scroll').evaluate(node=>node.scrollTop=0);
    await page.screenshot({path:path.join(output,'matching-insight-backlink-390.png')});
    await back.focus();await page.keyboard.press('Enter');
    await sheet.waitFor({state:'visible'});
    assert.equal(await sheet.locator('.ic-match-card').count(),3,'Backlink restores the full matches list');
    await page.setViewportSize({width:1440,height:900});
    assert.equal(await drawer.locator('[name=description]').inputValue(),'Датчики освещения архивного помещения сократят расход электричества ночью.');
    assert.equal(await drawer.locator('#ic-attachment-count').innerText(),'1','Attachment draft survives inspection');
    await sheet.locator('[data-close-matches]').last().click();
    await drawer.locator('[data-show-matches]').click();
    assert.ok(await sheet.isVisible(),'Closed results reopen from the status link');
    await page.keyboard.press('Escape');
    assert.ok(await drawer.isVisible(),'Escape closes only the duplicate sheet');
    await drawer.locator('[name=solution]').fill('Установить датчики присутствия и автоматическое отключение освещения.');
    await page.locator('#ic-process-input').click();
    await page.locator('#ic-process-list [data-option]').first().click();
    const effect=drawer.locator('.ic-effect').first(), effectId=await effect.getAttribute('data-effect');
    await choose(page,`ic-${effectId}-name`,'Сокращение операционных расходов без ФОТ');
    await effect.locator('[data-effect-field=description]').fill('Снижение расходов на освещение архивного помещения за счет датчиков.');
    await effect.locator('[data-effect-field=current]').fill('240');
    await effect.locator('[data-effect-field=target]').fill('240');
    await choose(page,`ic-${effectId}-unit`,'руб.');
    await drawer.locator('[data-submit]').click();
    assert.ok((await effect.locator('[data-effect-error]').innerText()).includes('совпадает'),'Equal current/target values are rejected');
    await effect.locator('[data-effect-field=target]').fill('60');
    await choose(page,`ic-${effectId}-frequency`,'Единоразово');
    assert.ok(await effect.locator('[data-effect-period]').isHidden(),'One-time effect hides its period');
    await drawer.locator('[data-submit]').click();
    await page.locator('#ic-duplicate-confirm[open]').waitFor();
    await page.locator('[data-create-anyway]').click();
    await drawer.waitFor({state:'hidden'});
    const row=await page.evaluate(()=>window.BpmInsightStore.list().find(item=>item.local&&item.title==='Освещение архивного помещения'));
    assert.ok(row);
    assert.equal(row.detail.duplicateIds.length,3);
    assert.equal(row.detail.duplicateCheck.demo,true);
    assert.equal(row.attachments[0].name,'details.txt');
    assert.equal(await page.evaluate(()=>window.BpmInsightStore.list().length),before+1);
    await page.reload();await ready(page);
    assert.ok(await page.evaluate(id=>window.BpmInsightStore.get(id)?.detail.duplicateIds.length===3,row.id),'Duplicate links survive reload');
    await page.locator('#insights-create').click();
    await drawer.locator('[name=description]').fill('Новое описание для первого поиска с демонстрационными совпадениями.');
    await sheet.waitFor({state:'visible'});await page.keyboard.press('Escape');
    await drawer.locator('[name=description]').fill('Орбитальная антенна исследовательского спутника регистрирует космическое излучение.');
    await page.locator('#ic-duplicate-status[data-state=none]').waitFor();
    assert.ok(await sheet.isHidden(),'Revised unrelated text uses the actual local matcher');
    for(const width of [1920,768,390]) {
      await page.setViewportSize({width,height:width===390?844:900});
      await stableEdges(page,'#insight-create-drawer','.ic-scroll','.ic-header','.ic-actions');
      const geometry=await drawer.boundingBox();assert.ok(geometry.x>=0&&geometry.x+geometry.width<=width+1);
      await drawer.locator('.ic-scroll').evaluate(element=>element.scrollTop=0);
      await page.screenshot({path:path.join(output,`creation-${width}.png`)});
    }
    assert.deepEqual(errors,[],'No runtime errors');
    console.log('PASS — fixed drawer/sheet edges, first matches, fresh rerun, BRD effects, duplicate consent, attachment metadata, persistence and responsive geometry');
    console.log(`Screenshots: ${output}`);
  } catch(error) {await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(`Screenshots: ${output}`);throw error;}
  finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

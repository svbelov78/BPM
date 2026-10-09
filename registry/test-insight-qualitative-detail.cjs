/* Qualitative expected effects use only applicability and comment in every
 * tab, Cabinet drawer and approval/preview presentation. Quantitative effects
 * beside them retain their original fields, validation and six-column table.
 * node registry/test-insight-qualitative-detail.cjs [standalone.html] */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-qualitative-detail-'));
let source = path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
if (path.basename(source) !== 'index.html') {const copy=path.join(output,'isolated.html');fs.copyFileSync(source,copy);source=copy;}
const host = '#insights-detail-view', qual = `${host} [data-id-effect="0"]`, quant = `${host} [data-id-effect="1"]`;
const comment = `${qual} [data-id-field="effect:0:comment"]`, choices = `${qual} [data-id-applicable="0"]`;
const yes = `${choices}[data-id-value="true"]`, no = `${choices}[data-id-value="false"]`;
const ready = page => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
const paint = page => page.evaluate(async () => {await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
async function open(page) {
  if (await page.locator('#insights-panel.is-insight-detail').count()) {await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);}
  await page.locator('#insights-results [data-insight-open="INS-000056"]').click();await paint(page);
}
async function bottom(page) {
  await page.locator(`${host} .id-detail-scroll`).evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});await paint(page);
}
async function checkDetail(page,label,editable) {
  assert.deepEqual(await page.locator(`${qual} th`).allTextContents(),['Территориальный банк','Актуальность','Комментарий'],`${label}: qualitative table has three columns`);
  assert.equal(await page.locator(`${qual} col`).count(),3,`${label}: qualitative colgroup matches table`);
  assert.equal(await page.locator(`${qual} .id-detail-effect-values .id-detail-value`).count(),1,`${label}: qualitative summary contains type only`);
  assert.equal(await page.locator(`${qual} .id-detail-effect-values strong`).textContent(),'Качественный');
  assert.equal(await page.locator(`${qual} .id-detail-unit`).count(),0,`${label}: unit select is not created`);
  assert.equal(await page.locator(`${qual} [data-id-field$=":current"], ${qual} [data-id-field$=":target"]`).count(),0,`${label}: no numeric fields`);
  const text=await page.locator(qual).textContent();
  for (const sentinel of ['999201','999202','777801','777802','OLD_QUAL_UNIT','OLD_QUAL_PERIOD']) assert.equal(text.includes(sentinel),false,`${label}: legacy ${sentinel} is not displayed`);
  const rows=await page.locator(`${qual} tbody tr`).evaluateAll(nodes=>nodes.map(node=>{const choice=node.querySelector('.id-detail-applicability')?.dataset.choice;return {cells:node.cells.length,author:node.hasAttribute('data-id-effect-author'),copy:node.textContent,applicable:choice?(choice==='yes'?'Да':choice==='no'?'Нет':'—'):node.cells[1].textContent.trim()};}));
  assert.ok(rows.every(row=>row.cells===3),`${label}: no hidden metric cells remain`);
  assert.ok(rows[0].author&&rows[0].copy.includes('Автор инсайта'),`${label}: highlighted author is still first`);
  const highlight=await page.locator(`${qual} [data-id-effect-author] td`).first().evaluate(node=>getComputedStyle(node).backgroundColor);
  assert.notEqual(highlight,'rgba(0, 0, 0, 0)',`${label}: author remains highlighted`);
  const active=rows.filter(row=>row.applicable==='Да').length,inactive=rows.filter(row=>row.applicable==='Нет').length;
  assert.equal(await page.locator(`${qual} [data-id-effect-counts]`).textContent(),`(Актуальных ${active}, Неактуальных ${inactive})`,`${label}: counters use actual qualitative rows`);
  assert.equal(await page.locator(choices).count(),editable?2:0,`${label}: both own applicability choices follow workflow permissions`);
  assert.equal(await page.locator(comment).count(),editable?1:0,`${label}: own comment follows workflow permissions`);
  assert.deepEqual(await page.locator(`${quant} th`).allTextContents(),['Территориальный банк','Актуальность','Текущее','Целевое','Ед. изм.','Комментарий'],`${label}: quantitative columns unchanged`);
  assert.equal(await page.locator(`${quant} .id-detail-effect-values .id-detail-value`).count(),2,`${label}: quantitative periodicity stays`);
  assert.equal(await page.locator(`${quant} .id-detail-unit`).count(),editable?1:0,`${label}: quantitative unit select remains`);
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
  const context=await browser.newContext({viewport:{width:1440,height:920},reducedMotion:'reduce',offline:true});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(pathToFileURL(source).href+'#insights');await ready(page);
    await page.evaluate(()=>{
      const row=BpmInsightStore.get('INS-000056'),effects=row.detail.effects,workflow=row.detail.workflow;
      const qualitative={...effects[0],id:'qualitative',type:'Качественный',title:'Качественный эффект для регрессии',current:'999201',target:'999202',baselineCurrent:'999201',baselineTarget:'999202',unit:'OLD_QUAL_UNIT',baselineUnit:'OLD_QUAL_UNIT',period:'OLD_QUAL_PERIOD',frequency:'Регулярно',comment:'Комментарий автора качественного эффекта'};
      const quantitative={...effects[1],id:'quantitative',type:'Количественный',title:'Количественный эффект для регрессии',current:'240',target:'60',baselineCurrent:'240',baselineTarget:'60',unit:'мин',baselineUnit:'мин',frequency:'Регулярно',period:'Год'};
      workflow.opinions.responses=workflow.opinions.responses.filter(response=>response.bank!==workflow.currentActor.bank).map((response,index)=>({...response,effects:[{id:qualitative.id,applicable:index!==1,current:'777801',target:'777802',unit:'OLD_QUAL_UNIT',comment:'Комментарий другого банка'},{id:quantitative.id,applicable:true,current:'120',target:'30',unit:'мин',comment:'Количественный комментарий'}]}));
      workflow.opinions.responses.push({bank:workflow.currentActor.bank,person:workflow.currentActor.name,actorId:workflow.currentActor.id,reproduction:'Воспроизводится',comment:'Сохранённое мнение',createdAt:'2026-10-01',updatedAt:'2026-10-01',effects:[{id:qualitative.id,applicable:true,current:'777801',target:'777802',unit:'OLD_QUAL_UNIT',comment:''},{id:quantitative.id,applicable:false,current:'',target:'',unit:'',comment:''}]});
      BpmInsightStore.update(row.id,{status:'Согласовано',detail:{...row.detail,effects:[qualitative,quantitative],workflow}});
    });
    await open(page);await checkDetail(page,'Mixed editable tab',true);
    assert.ok(await page.locator(comment).isEnabled(),'Applicable qualitative comment is enabled');
    await page.locator(no).click();await paint(page);
    assert.equal(await page.locator('[data-id-reset-confirm]').count(),0,'Legacy numeric values do not make qualitative toggle destructive');
    assert.equal(await page.locator(no).getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator(yes).getAttribute('aria-pressed'),'false');
    assert.ok(await page.locator(comment).isEnabled(),'No keeps the qualitative explanation comment available');
    await page.locator(yes).click();await page.locator(comment).fill('Оценка качественного эффекта');await page.locator(comment).press('Tab');
    assert.ok(await page.locator(comment).isEnabled(),'Yes re-enables comment');
    await page.locator(no).click();
    assert.equal(await page.locator('[data-id-reset-confirm]').count(),1,'An actual comment still requires confirmation before clearing');
    await page.locator('[data-id-reset-cancel]').click();
    assert.equal(await page.locator(comment).inputValue(),'Оценка качественного эффекта','Cancel preserves the visible comment');
    await page.locator(no).click();await page.locator('[data-id-reset-confirm]').click();
    assert.equal(await page.locator(comment).inputValue(),'','Confirm clears comment');assert.ok(await page.locator(comment).isEnabled(),'After confirmed reset the qualitative comment remains available for explaining No');
    await page.locator(yes).click();await page.locator(comment).fill('Только актуальность и комментарий');await page.locator(comment).press('Tab');
    await checkDetail(page,'Edited mixed tab',true);
    await bottom(page);await page.locator(`${host} [data-id-send-opinion]`).click();await paint(page);
    const saved=await page.evaluate(()=>{const row=BpmInsightStore.get('INS-000056');return row.detail.workflow.opinions.responses.find(response=>response.bank===row.detail.workflow.currentActor.bank);});
    assert.deepEqual(saved.effects.find(effect=>effect.id==='qualitative'),{id:'qualitative',applicable:true,comment:'Только актуальность и комментарий'},'Sent qualitative answer has no metric or periodicity keys');
    assert.deepEqual(Object.keys(saved.effects.find(effect=>effect.id==='quantitative')).sort(),['id','applicable','comment','current','target','unit'].sort(),'Quantitative answer shape is unchanged');
    console.log('PASS — Qualitative three-column tables, legacy-value suppression, explicit Yes/No choices, enabled comments, reset confirmation and metric-free opinion persistence');

    await page.reload();await ready(page);await open(page);await checkDetail(page,'Reloaded editable tab',true);
    assert.equal(await page.locator(comment).inputValue(),'Только актуальность и комментарий');
    await page.locator('#cabinet-nav').click();
    await page.waitForFunction(()=>!document.querySelector('#cabinet-panel')?.hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
    await page.locator('#cabinet-feed-insights [data-cabinet-open="INS-000056"] .card-title').click();
    await page.locator('#cabinet-insight-drawer[open]').waitFor();await paint(page);
    await checkDetail(page,'Cabinet drawer',true);
    for (const width of [320,1440,3840]) {
      await page.setViewportSize({width,height:width===3840?2160:920});await paint(page);
      const overflow=await page.locator(`${host} .id-detail-scroll`).evaluate(node=>({scroll:node.scrollWidth,client:node.clientWidth,page:document.documentElement.scrollWidth,viewport:innerWidth}));
      assert.ok(overflow.scroll<=overflow.client+1&&overflow.page<=overflow.viewport+1,`${width}px: any table overflow stays local`);
      await page.locator(qual).scrollIntoViewIfNeeded();
      await page.locator(`${host} .id-detail-scroll`).evaluate(node=>{node.scrollTop=Math.max(0,node.scrollTop-32);});
      await paint(page);await page.screenshot({path:path.join(output,`cabinet-qualitative-${width}.png`)});
    }
    await page.locator('#cabinet-insight-drawer [data-id-open-tab]').click();await paint(page);
    await page.setViewportSize({width:1440,height:920});
    for (const status of ['Мнения собраны','В работе','Реализовано','Отклонено']) {
      await page.evaluate(status=>BpmInsightStore.update('INS-000056',{status}),status);await open(page);
      // The process owner's decision view is tested with the seeded owner actor;
      // this bank actor still has editable opinion rights before team decision.
      const editable=['Мнения собраны'].includes(status);
      await checkDetail(page,`${status} tab`,editable);
    }
    await page.evaluate(()=>{
      const row=BpmInsightStore.get('INS-000056'),approval=BpmInsightStore.get('INS-000060');
      BpmInsightStore.update(row.id,{source:'ТБ',bank:approval.bank,status:'Новый',detail:{...row.detail,workflow:approval.detail.workflow}});
    });await open(page);await checkDetail(page,'Approval tab',false);
    assert.equal(await page.locator(`${host} [data-id-approval="approve"]`).count(),1,'Seeded approval role is active');
    await page.evaluate(()=>{
      document.getElementById('insight-approval-drawer').id='qa-existing-approval-drawer';
      document.getElementById('insight-approval-confirm').id='qa-existing-approval-confirm';
      window.__qaQualitativePreview=BpmInsightApproval.create({api:{toast(){}},getRow:id=>BpmInsightStore.get(id),onChange(){}});
      window.__qaQualitativePreview.open('INS-000056',{preview:true});
    });await paint(page);
    const preview='#insight-approval-drawer .ia-effect';
    assert.deepEqual(await page.locator(preview).first().locator('th').allTextContents(),['Территориальный банк','Актуальность','Комментарий'],'Approval preview shares qualitative three-column shape');
    assert.equal(await page.locator(preview).first().locator('.ia-effect-values .ia-value').count(),1,'Preview qualitative type-only summary');
    assert.equal(await page.locator(preview).first().locator('tbody tr').first().getAttribute('data-ia-effect-author'),'','Preview highlights author first');
    for (const sentinel of ['999201','999202','OLD_QUAL_UNIT','OLD_QUAL_PERIOD']) assert.equal((await page.locator(preview).first().textContent()).includes(sentinel),false,`Preview omits stale ${sentinel}`);
    assert.equal(await page.locator(preview).nth(1).locator('th').count(),6,'Preview quantitative columns are unchanged');
    await page.locator(preview).first().scrollIntoViewIfNeeded();
    await page.locator('#insight-approval-drawer .ia-scroll').evaluate(node=>{node.scrollTop=Math.max(0,node.scrollTop-32);});
    await paint(page);await page.screenshot({path:path.join(output,'approval-preview-qualitative.png')});
    assert.deepEqual(errors,[],'No runtime errors');
    console.log(`PASS — Source/reload, Cabinet drawer, 320–3840px local scrolling, readonly and approval/preview renderers. Screenshots: ${output}`);
  } catch (error) {await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(`Screenshots: ${output}`);throw error;}
  finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

/* Insight bank-opinion projection: live draft, counters and explicit save. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-opinions-'));
let source=path.resolve(process.argv[2]||path.join(__dirname,'index.html'));
if(path.basename(source)!=='index.html'){const copy=path.join(output,'prototype.html');fs.copyFileSync(source,copy);source=copy;}
const detail='#insights-detail-view',table=`${detail} .id-detail-opinions-table`,alert=`${detail} [data-id-reproduction-alert]`;
const field=`${detail} [data-id-field="reproductionComment"]`,submit=`${detail} [data-id-send-opinion]`;
const labels=['Воспроизводится','Частично','Не воспроизводится','Без оценки'];
const ready=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const paint=page=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
const read=(page,id)=>page.evaluate(id=>BpmInsightStore.get(id),id);
async function open(page,id){
 // Ordinary navigation preserves saved/draft opinions; the heading intentionally resets the demo.
 if(await page.locator('#insights-panel.is-insight-detail').count()){await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);}
 await page.locator(`#insights-results [data-insight-open="${id}"]`).click();await paint(page);
 assert.equal(await page.locator('dialog[open]').count(),0,'Existing insight opens in a tab');
}
async function bottom(page){await page.locator(`${detail} .id-detail-scroll`).evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});await paint(page);}
async function projection(page,label){
 const values=await page.locator(`${detail} .id-detail-opinions`).evaluate(block=>{
  const heading=block.querySelector('.id-detail-opinions-heading');
  return {total:Number(heading.querySelector('.id-detail-opinion-total').textContent),summary:heading.querySelector('.id-detail-opinion-summary')?.textContent.replace(/\s+/g,' ').trim()||'',
   rows:[...block.querySelectorAll('tbody tr')].map(row=>({bank:row.cells[0].querySelector('strong').textContent.trim(),person:row.cells[0].querySelector('small')?.textContent.trim(),rating:row.cells[1].textContent.trim(),comment:row.cells[2].textContent.trim(),own:row.hasAttribute('data-id-opinion-own')}))};
 });
 assert.equal(await page.locator(`${detail} [data-id-opinions-toggle]`).count(),0,`${label}: no obsolete hide/show switch`);
 assert.equal(values.total,values.rows.length,`${label}: heading total equals visible rows`);
 const nonzero=labels.map(rating=>({rating,count:values.rows.filter(row=>row.rating===rating).length})).filter(item=>item.count);
 const expected=nonzero.length?`(${nonzero.map(item=>`${item.rating} ${item.count}`).join(', ')})`:'';
 assert.equal(values.summary,expected,`${label}: inline nonzero counters use visible rows and canonical order`);
 assert.equal(nonzero.reduce((sum,item)=>sum+item.count,0),values.total,`${label}: no missing or fabricated category counts`);
 assert.equal(new Set(values.rows.map(row=>row.bank)).size,values.rows.length,`${label}: one displayed row per bank`);
 return values;
}
async function ownProjection(page,bank,rating,comment,label){
 const result=await projection(page,label),own=result.rows.filter(row=>row.bank===bank);
 assert.equal(own.length,1,`${label}: exactly one row for current bank`);
 assert.equal(result.rows[0].bank,bank,`${label}: current bank is always first`);
 assert.equal(own[0].person,'Вы',`${label}: own row is labelled Вы`);
 assert.equal(own[0].own,true,`${label}: own-row marker agrees with projection`);
 assert.equal(own[0].rating,rating,`${label}: live rating visible`);
 assert.equal(own[0].comment,comment||'—',`${label}: live comment visible`);
 assert.equal(await page.locator(alert).isVisible(),false,`${label}: instruction disappears after choice or saved opinion`);
 return result;
}
async function borders(page,label){
 const widths=await page.locator(`${detail} .id-detail-effect`).evaluateAll(nodes=>nodes.map(node=>parseFloat(getComputedStyle(node).borderBottomWidth)));
 assert.ok(widths.length>0,`${label}: effects exist`);
 assert.equal(widths.at(-1),0,`${label}: last effect has no black bottom separator`);
 widths.slice(0,-1).forEach(width=>assert.equal(width,1,`${label}: earlier effects retain their separator`));
}
async function effectTableUI(page,label){
 const shapes=await page.locator(`${detail} .id-detail-effect`).evaluateAll(nodes=>nodes.map(node=>({
  index:node.dataset.idEffect,
  type:node.querySelector('.id-detail-effect-values strong')?.textContent.trim(),
  attributes:[...node.querySelectorAll('.id-detail-effect-values .internal-label')].map(item=>item.textContent.trim()),
  headings:[...node.querySelectorAll('thead th')].map(item=>item.textContent.trim()),
  cells:[...node.querySelectorAll('tbody tr')].map(row=>row.cells.length),
  metrics:node.querySelectorAll('[data-id-field$=":current"],[data-id-field$=":target"],.id-detail-unit').length,
  choiceCount:node.querySelectorAll('[data-id-applicable]').length,
  commentCount:node.querySelectorAll('[data-id-field$=":comment"]').length
 })));
 for(const shape of shapes){
  const qualitative=shape.type==='Качественный';
  assert.deepEqual(shape.headings.slice(1),qualitative?['Актуальность','Комментарий']:['Актуальность','Текущее','Целевое','Ед. изм.','Комментарий'],`${label}: effect ${shape.index} table matches its explicit type`);
  assert.ok(shape.cells.every(count=>count===(qualitative?3:6)),`${label}: author, bank and editable rows use the same column set`);
  assert.deepEqual(shape.attributes,qualitative?['Тип эффекта']:['Тип эффекта','Периодичность'],`${label}: qualitative effect has no periodicity metadata`);
  if(qualitative){
   assert.equal(shape.metrics,0,`${label}: qualitative effect has no metric inputs or unit select`);
   assert.equal(shape.choiceCount,shape.commentCount*2,`${label}: editable qualitative row contains the Yes/No pair and comment only`);
  }
 }
 return shapes;
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce',offline:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
 try{
  await page.goto(pathToFileURL(source).href+'#insights');await ready(page);await open(page,'INS-000056');
  const original=await read(page,'INS-000056'),bank=original.detail.workflow.currentActor.bank,stored=original.detail.workflow.opinions.responses;
  const first=await projection(page,'Before selecting');
  assert.equal(first.total,stored.length);assert.ok(first.rows.every(row=>row.bank!==bank),'Unsaved current bank is not fabricated before selection');
  assert.ok(await page.locator(alert).isVisible(),'Blue instruction appears before first choice');
  assert.equal(await page.locator(`${detail} [data-id-reproduction]`).count(),3,'Only three opinion choices are available');
  assert.equal(await page.locator(`${detail} [data-id-reproduction][aria-pressed="true"]`).count(),0,'No choice is selected before submitting an opinion');
  assert.match(await page.locator(alert).evaluate(node=>getComputedStyle(node.matches('.id-detail-alert')?node:node.querySelector('.id-detail-alert')).backgroundColor),/^rgba?\(0, 136, 255/,'Instruction uses the DS blue tint');
  await borders(page,'Two-effect case');
  const effectShapes=await effectTableUI(page,'Before opinion selection'),qualitativeIndex=Number(effectShapes.find(item=>item.type==='Качественный')?.index);
  assert.ok(Number.isInteger(qualitativeIndex),'Mixed seed includes an explicit qualitative effect');
  await bottom(page);await page.locator(field).fill('Черновик до выбора оценки');await paint(page);
  assert.equal((await projection(page,'Comment without selection')).total,stored.length,'Comment alone does not invent an opinion');
  assert.ok(await page.locator(alert).isVisible(),'Comment alone does not hide selection guidance');
  assert.deepEqual(await read(page,'INS-000056'),original,'Typing has not saved anything');

  for(const rating of ['Не воспроизводится','Частично','Воспроизводится']){
   await page.locator(`${detail} [data-id-reproduction="${rating}"]`).click();await paint(page);
   const comment=`Живой комментарий: ${rating}`;
   await page.locator(field).fill(comment);await paint(page);
   assert.equal(await page.locator(field).evaluate(node=>node===document.activeElement),true,'Updating the live row preserves textarea focus');
   const visible=await ownProjection(page,bank,rating,comment,`Choice ${rating}`);
   assert.equal(visible.total,stored.length+1,'Draft projection appends one opinion without duplicating other responses');
   assert.deepEqual(await read(page,'INS-000056'),original,'Selection and live comment do not mutate store before submit');
   await page.locator(`${detail} [data-id-reproduction="${rating}"]`).press('Space');await paint(page);
   assert.equal(await page.locator(`${detail} [data-id-reproduction][aria-pressed="true"]`).count(),0,'Pressing the selected choice again clears it');
   assert.ok(await page.locator(submit).isDisabled(),'A cleared choice cannot be sent');
   assert.ok(await page.locator(alert).isVisible(),'Guidance returns when the choice is cleared');
   assert.equal((await projection(page,`Cleared ${rating}`)).total,stored.length,'Clearing an unsaved choice removes the projected own row');
   assert.equal(await page.locator(field).inputValue(),comment,'Clearing a choice preserves the local comment');
   assert.deepEqual(await read(page,'INS-000056'),original,'Clearing a choice never deletes a submitted response');
   await page.locator(`${detail} [data-id-reproduction="${rating}"]`).press('Space');await paint(page);
   await ownProjection(page,bank,rating,comment,`Restored ${rating}`);
  }
  console.log('PASS — Canonical inline counters, three toggleable choices, keyboard deselection, own row first, live comment, focus and draft-only data');

  await page.locator(`${detail} [data-id-applicable="0"][data-id-value="true"]`).click();
  await page.locator(`${detail} [data-id-field="effect:0:current"]`).fill('100');
  await page.locator(`${detail} [data-id-field="effect:0:target"]`).fill('50');await page.locator(`${detail} [data-id-field="effect:0:target"]`).press('Tab');
  await page.locator(`${detail} [data-id-reproduction="Не воспроизводится"]`).click();
  assert.equal(await page.locator('[data-id-reset-confirm]').count(),1,'Removing effect data requires confirmation');
  await ownProjection(page,bank,'Воспроизводится','Живой комментарий: Воспроизводится','Pending reset preserves old projection');
  await page.locator('[data-id-reset-cancel]').click();
  assert.equal(await page.locator(`${detail} [data-id-field="effect:0:current"]`).inputValue(),'100','Cancel retains effect values');
  await ownProjection(page,bank,'Воспроизводится','Живой комментарий: Воспроизводится','Cancelled reset');
  await page.locator(`${detail} [data-id-reproduction="Воспроизводится"]`).click();
  assert.equal(await page.locator('[data-id-reset-confirm]').count(),0,'Deselecting does not delete metrics or ask for a destructive reset');
  assert.ok(await page.locator(submit).isDisabled(),'Deselecting suspends the opinion submit');
  await page.locator(`${detail} [data-id-reproduction="Воспроизводится"]`).click();
  assert.equal(await page.locator(`${detail} [data-id-field="effect:0:current"]`).inputValue(),'100','Selecting again restores the preserved metric draft');
  await page.locator(`${detail} [data-id-reproduction="Не воспроизводится"]`).click();await page.locator('[data-id-reset-confirm]').click();
  await ownProjection(page,bank,'Не воспроизводится','Живой комментарий: Воспроизводится','Confirmed reset');
  assert.deepEqual(await read(page,'INS-000056'),original,'Reset decisions remain draft-only');
  await page.locator(`${detail} [data-id-reproduction="Частично"]`).click();
  await effectTableUI(page,'Editable mixed effects');
  const qualitativeYes=page.locator(`${detail} [data-id-applicable="${qualitativeIndex}"][data-id-value="true"]`),qualitativeComment=page.locator(`${detail} [data-id-field="effect:${qualitativeIndex}:comment"]`);
  if(await qualitativeYes.getAttribute('aria-pressed')!=='true')await qualitativeYes.click();
  assert.equal(await page.locator(`${detail} [data-id-applicable][aria-pressed="true"]`).count(),effectShapes.length,'Every effect has an explicit Yes or No answer before sending');
  await qualitativeComment.fill('Качественный эффект актуален: статус стал понятнее.');
  assert.deepEqual(await read(page,'INS-000056'),original,'Qualitative applicability and comment remain draft-only before sending');
  await page.locator(field).fill('Сохранённое мнение текущего банка');await bottom(page);await page.locator(submit).click();await paint(page);
  let saved=await read(page,'INS-000056'),own=saved.detail.workflow.opinions.responses.filter(item=>item.bank===bank);
  assert.equal(own.length,1);assert.equal(own[0].reproduction,'Частично');assert.equal(own[0].comment,'Сохранённое мнение текущего банка');
  assert.equal(own[0].effects[qualitativeIndex].applicable,true,'Qualitative applicability is persisted');
  assert.equal(own[0].effects[qualitativeIndex].comment,'Качественный эффект актуален: статус стал понятнее.','Qualitative comment is persisted');
  for(const key of ['current','target','unit','frequency','period'])assert.equal(Object.hasOwn(own[0].effects[qualitativeIndex],key),false,`Qualitative bank response never persists ${key}`);
  await ownProjection(page,bank,'Частично','Сохранённое мнение текущего банка','After explicit submit');
  await page.reload();await ready(page);await open(page,'INS-000056');
  await effectTableUI(page,'Qualitative effects after reload');
  assert.equal(await qualitativeComment.inputValue(),'Качественный эффект актуален: статус стал понятнее.','Reload restores the qualitative comment without metric fields');
  await ownProjection(page,bank,'Частично','Сохранённое мнение текущего банка','After reload');
  saved=await read(page,'INS-000056');
  await page.locator(`${detail} [data-id-reproduction="Воспроизводится"]`).click();await page.locator(field).fill('Обновлённое мнение без второй строки');
  const updated=await ownProjection(page,bank,'Воспроизводится','Обновлённое мнение без второй строки','Overlay saved own response');
  assert.equal(updated.total,saved.detail.workflow.opinions.responses.length,'Editing replaces saved own row rather than appending it');
  assert.deepEqual(await read(page,'INS-000056'),saved,'Editing existing opinion does not save early');
  await bottom(page);await page.locator(submit).click();await paint(page);
  own=(await read(page,'INS-000056')).detail.workflow.opinions.responses.filter(item=>item.bank===bank);
  assert.equal(own.length,1);assert.equal(own[0].comment,'Обновлённое мнение без второй строки');
  console.log('PASS — Pending reset/cancel/confirm projections, explicit persistence, reload, saved own-row overlay and single-row updates');

  for(const width of [320,390,1440,3840]){
   await page.setViewportSize({width,height:width===3840?2160:920});await paint(page);
   if(await page.locator('body.mobile-menu-open').count())await page.locator('#collapse-menu').click();
   await page.locator(`${detail} .id-detail-opinions`).scrollIntoViewIfNeeded();await paint(page);
   const layout=await page.evaluate(()=>{
    const scroll=document.querySelector('#insights-detail-view .id-detail-scroll'),heading=document.querySelector('.id-detail-opinions-heading'),summary=heading.querySelector('.id-detail-opinion-summary'),total=heading.querySelector('.id-detail-opinion-total'),title=heading.querySelector('.id-detail-subheading')||heading;
    const box=node=>{const rect=node.getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};};
    return {viewport:innerWidth,page:document.documentElement.scrollWidth,scroll:scroll.scrollWidth,client:scroll.clientWidth,heading:box(heading),title:box(title),summary:box(summary),total:box(total)};
   });
   assert.ok(layout.page<=width+1&&layout.scroll<=layout.client+1,`${width}: horizontal table scrolling never overflows page ${JSON.stringify(layout)}`);
   assert.ok(layout.summary.left>=layout.heading.left-1&&layout.summary.right<=layout.heading.right+1,`${width}: counters remain inside heading`);
   if(width===3840)assert.ok(Math.abs(layout.summary.top-layout.total.top)<3,'Wide layout places counters inline after total');
   await projection(page,`${width}px counters`);await borders(page,`${width}px effect borders`);await effectTableUI(page,`${width}px mixed effect tables`);
   await page.screenshot({path:path.join(output,`opinions-${width}.png`)});
   if(width===390||width===1440){
    await page.locator(`${detail} .id-detail-reproduction`).evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));await paint(page);
    await page.locator(`${detail} .id-detail-reproduction`).screenshot({path:path.join(output,`opinions-block-${width}.png`)});
   }
  }
  await page.setViewportSize({width:1440,height:920});
  for(const id of ['INS-000054','INS-000052','INS-000053']){
   await open(page,id);const record=await read(page,id),actual=record.detail.workflow.opinions.responses;
   const visible=await projection(page,`${id} readonly`);
   assert.equal(visible.total,actual.length,'Read-only counters contain actual responses only');
   assert.deepEqual(visible.rows.map(item=>item.bank).sort(),actual.map(item=>item.bank).sort(),'Read-only rows never fabricate current user or missing expected banks');
   assert.equal(await page.locator(`${detail} [data-id-reproduction]`).count(),0,'Read-only opinions have no editing controls');
   assert.equal(await page.locator(alert).isVisible(),false,'Read-only view has no instruction to submit an opinion');
   await effectTableUI(page,`${id} readonly effects`);
  }
  await page.evaluate(()=>{const row=BpmInsightStore.get('INS-000055');BpmInsightStore.update(row.id,{detail:{...row.detail,effects:row.detail.effects.slice(0,1)}});});
  await open(page,'INS-000055');assert.equal(await page.locator(`${detail} .id-detail-effect`).count(),1);await borders(page,'Single effect');
  assert.deepEqual(errors,[],'No runtime errors');
  console.log(`PASS — 320–3840px layout, local-only table scroll, truthful read-only counters, zero-response state, last/single effect without border. Screenshots: ${output}`);
 }catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(`Screenshots: ${output}`);throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

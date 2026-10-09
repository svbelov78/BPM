/* Bank effect applicability = No still permits an optional explanation.
 * node registry/test-insight-inactive-comment.cjs [--standalone [file.html]]
 * Isolated, offline contexts; no live profile or production data writes. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const args=process.argv.slice(2),output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-inactive-effect-comment-'));
let source=path.resolve(args.find(arg=>!arg.startsWith('--'))||(args.includes('--standalone')?path.join(__dirname,'..','Sber-BPM-Registry-Standalone.html'):path.join(__dirname,'index.html')));
const standalone=path.basename(source)!=='index.html';
if(standalone){const copy=path.join(output,'isolated-prototype.html');fs.copyFileSync(source,copy);source=copy;}
const base=pathToFileURL(source).href,id='INS-000056',host='#insights-detail-view';
const ready=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const cabinetReady=page=>page.waitForFunction(()=>!document.querySelector('#cabinet-panel')?.hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
const paint=page=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
const record=page=>page.evaluate(id=>BpmInsightStore.get(id),id);
const response=row=>row.detail.workflow.opinions.responses.find(item=>item.bank===row.detail.workflow.currentActor.bank);
const effect=(page,index)=>page.locator(`${host} [data-id-effect="${index}"]`);
const field=(page,index,key)=>effect(page,index).locator(`[data-id-field="effect:${index}:${key}"]`);
const choice=(page,index,value)=>effect(page,index).locator(`[data-id-applicable="${index}"][data-id-value="${value}"]`);
const group=(page,index)=>effect(page,index).locator('.id-detail-applicability');
async function seed(page){
  await page.evaluate(id=>{
    const row=BpmInsightStore.get(id),workflow=row.detail.workflow;
    const quantitative={...row.detail.effects[0],id:'qa-quantitative',type:'Количественный',title:'Количественный эффект для проверки комментария',current:'240',target:'60',baselineCurrent:'240',baselineTarget:'60',unit:'мин.',baselineUnit:'мин.',frequency:'Регулярно',period:'Год',applicable:false,comment:'Комментарий автора количественного эффекта'};
    const qualitative={...row.detail.effects[1],id:'qa-qualitative',type:'Качественный',title:'Качественный эффект для проверки комментария',applicable:false,comment:'Комментарий автора качественного эффекта'};
    workflow.opinions.responses=workflow.opinions.responses.filter(item=>item.bank!==workflow.currentActor.bank);
    workflow.opinions.responses.push({bank:workflow.currentActor.bank,person:workflow.currentActor.name,actorId:workflow.currentActor.id,reproduction:'Воспроизводится',comment:'',createdAt:'2026-10-01',updatedAt:'2026-10-01',effects:[{id:quantitative.id,applicable:false,current:'',target:'',unit:'',comment:''},{id:qualitative.id,applicable:false,comment:''}]});
    BpmInsightStore.update(id,{status:'Согласовано',detail:{...row.detail,effects:[quantitative,qualitative],workflow}});
  },id);
  return record(page);
}
async function open(page,surface){
  if(surface==='tab'){
    if(await page.locator('#insights-panel.is-insight-detail').count())await page.locator('.insights-view-controls button[aria-pressed="true"]').click();
    await ready(page);await page.locator(`#insights-results [data-insight-open="${id}"]`).click();
  }else{
    await cabinetReady(page);
    await page.locator(`#cabinet-feed-insights [data-cabinet-open="${id}"] .card-title`).click();
    await page.locator('#cabinet-insight-drawer[open]').waitFor();
  }
  await page.locator(`${host}[data-insight-id="${id}"]`).waitFor();await paint(page);
}
async function close(page,surface){
  if(surface==='tab'){await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);}
  else{await page.locator(`${host} [data-id-drawer-close]`).click();await page.locator('#cabinet-insight-drawer[open]').waitFor({state:'hidden'});await cabinetReady(page);}
}
async function reloadOpen(page,surface){
  await page.reload();
  if(surface==='tab')await ready(page);else await cabinetReady(page);
  await open(page,surface);
}
async function inactive(page,index,label){
  assert.equal(await group(page,index).getAttribute('data-choice'),'no',`${label}: applicability stays No`);
  assert.equal(await choice(page,index,false).getAttribute('aria-pressed'),'true',`${label}: No is explicitly selected`);
  assert.equal(await choice(page,index,true).getAttribute('aria-pressed'),'false',`${label}: Yes is not selected`);
  const comment=field(page,index,'comment');assert.ok(await comment.isEnabled(),`${label}: comment remains enabled at No`);
  assert.equal(await comment.evaluate(node=>node.closest('.field').classList.contains('is-disabled')),false,`${label}: comment does not use disabled visual state`);
  assert.equal(await comment.evaluate(node=>node.required),false,`${label}: comment is still optional`);
  if(index===0){
    assert.ok(await field(page,index,'current').isDisabled(),`${label}: current remains disabled`);
    assert.ok(await field(page,index,'target').isDisabled(),`${label}: target remains disabled`);
    assert.ok(await page.locator('#id-detail-unit-0-input').isDisabled(),`${label}: unit remains disabled`);
  }else{
    assert.equal(await effect(page,index).locator('[data-id-field$=":current"],[data-id-field$=":target"],.id-detail-unit').count(),0,`${label}: qualitative effect has no numerical/unit controls`);
  }
}
async function typeComment(page,index,text){await field(page,index,'comment').fill(text);await field(page,index,'comment').press('Tab');await paint(page);}
async function send(page){
  await page.locator(`${host} .id-detail-scroll`).evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});await paint(page);
  await page.locator(`${host} [data-id-send-opinion]`).click();await paint(page);
  assert.equal(await page.locator(`${host} [data-id-opinion-submit-label]`).textContent(),'Мнение отправлено','Explicit submit completes the bank opinion');
  assert.ok(await page.locator(`${host} [data-id-send-opinion]`).isDisabled(),'Unchanged submitted opinion is disabled');
}
function assertSaved(row,texts,baseline,label){
  const own=response(row);assert.ok(own,`${label}: own bank opinion exists`);
  assert.equal(row.detail.workflow.opinions.responses.filter(item=>item.bank===own.bank).length,1,`${label}: editing does not duplicate bank responses`);
  assert.deepEqual(own.effects.find(item=>item.id==='qa-quantitative'),{id:'qa-quantitative',applicable:false,comment:texts[0],current:'',target:'',unit:''},`${label}: inactive quantitative answer has its explanation but no metrics`);
  assert.deepEqual(own.effects.find(item=>item.id==='qa-qualitative'),{id:'qa-qualitative',applicable:false,comment:texts[1]},`${label}: inactive qualitative answer contains only applicability/comment`);
  assert.deepEqual(row.detail.effects,baseline.detail.effects,`${label}: authored effect baselines/comments are unchanged`);
  assert.deepEqual(row.effects,baseline.effects,`${label}: source effects are unchanged`);
}
async function readOnly(page,surface,status){
  await close(page,surface);
  await page.evaluate(({id,status})=>{
    const row=BpmInsightStore.get(id),detail=row.detail;
    if(status==='Мнения собраны')detail.workflow.currentActor={id:`${id}:owner`,name:row.owner,role:'Владелец процесса',bank:'',processIds:row.related.map(item=>item.id)};
    BpmInsightStore.update(id,{status,detail});
  },{id,status});
  await open(page,surface);
  assert.equal(await page.locator(`${host} .id-detail-effects [data-id-field],${host} [data-id-applicable],${host} .id-detail-unit`).count(),0,`${surface}/${status}: read-only modes do not acquire effect-entry controls`);
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    for(const surface of ['tab','cabinet']){
      const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',offline:true}),page=await context.newPage(),errors=[];
      page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
      try{
        await page.goto(`${base}#insights`);await ready(page);const baseline=await seed(page);
        if(surface==='cabinet'){await page.locator('#cabinet-nav').click();await cabinetReady(page);}
        await open(page,surface);
        for(const index of [0,1])await inactive(page,index,`${surface}/initial effect ${index}`);
        const initial=[`${surface}: числовой эффект не актуален, другой маршрут.`,`${surface}: качественный эффект не актуален, другой канал.`];
        for(const index of [0,1])await typeComment(page,index,initial[index]);
        assert.deepEqual(response(await record(page)).effects,response(baseline).effects,'Typing an inactive comment does not persist before explicit submit');
        await send(page);assertSaved(await record(page),initial,baseline,`${surface}/initial false submit`);
        await reloadOpen(page,surface);
        for(const index of [0,1]){await inactive(page,index,`${surface}/initial false reload ${index}`);assert.equal(await field(page,index,'comment').inputValue(),initial[index]);}

        // Preserve the existing data-loss confirmation and clearing behavior;
        // the new No explanation is entered only after the reset completes.
        for(const index of [0,1]){
          await choice(page,index,true).click();assert.equal(await choice(page,index,true).getAttribute('aria-pressed'),'true');
          await typeComment(page,index,`${surface}: прежний актуальный комментарий ${index}`);
          if(index===0){await field(page,index,'current').fill('180');await field(page,index,'target').fill('40');await field(page,index,'target').press('Tab');}
          await choice(page,index,false).click();await page.locator(`${host} [data-id-reset-confirm]`).waitFor();
          await page.locator(`${host} [data-id-reset-cancel]`).click();
          assert.equal(await choice(page,index,true).getAttribute('aria-pressed'),'true','Cancel preserves the applicable state');
          assert.equal(await field(page,index,'comment').inputValue(),`${surface}: прежний актуальный комментарий ${index}`,'Cancel preserves the existing comment');
          if(index===0){assert.equal(await field(page,index,'current').inputValue(),'180');assert.equal(await field(page,index,'target').inputValue(),'40');}
          await choice(page,index,false).click();await page.locator(`${host} [data-id-reset-confirm]`).click();
          await inactive(page,index,`${surface}/confirmed false ${index}`);
          assert.equal(await field(page,index,'comment').inputValue(),'','Confirmed reset still clears the prior comment');
          if(index===0){assert.equal(await field(page,index,'current').inputValue(),'','Confirmed reset still clears current');assert.equal(await field(page,index,'target').inputValue(),'','Confirmed reset still clears target');}
          await typeComment(page,index,`${surface}: объяснение Нет после подтверждения ${index}`);
        }
        const afterReset=[`${surface}: объяснение Нет после подтверждения 0`,`${surface}: объяснение Нет после подтверждения 1`];
        await send(page);assertSaved(await record(page),afterReset,baseline,`${surface}/confirmed false submit`);
        await reloadOpen(page,surface);
        for(const index of [0,1]){await inactive(page,index,`${surface}/confirmed false reload ${index}`);assert.equal(await field(page,index,'comment').inputValue(),afterReset[index]);}
        await effect(page,0).scrollIntoViewIfNeeded();await paint(page);await page.screenshot({path:path.join(output,`${surface}-inactive-comment-1440.png`),animations:'disabled'});
        const edited=[`${surface}: обновлённое объяснение количественного Нет.`,`${surface}: обновлённое объяснение качественного Нет.`];
        for(const index of [0,1])await typeComment(page,index,edited[index]);
        await send(page);await reloadOpen(page,surface);assertSaved(await record(page),edited,baseline,`${surface}/edited false reload`);
        for(const index of [0,1]){await inactive(page,index,`${surface}/edited false ${index}`);assert.equal(await field(page,index,'comment').inputValue(),edited[index]);}
        for(const status of ['В работе','Реализовано','Отклонено','Новый','Мнения собраны'])await readOnly(page,surface,status);
        assert.deepEqual(errors,[],`${surface}: no runtime errors`);
        console.log(`PASS — ${surface}: initial No, confirmed Yes→No, optional comments, disabled metrics, explicit submit/reload, immutable author baselines and read-only modes`);
      }catch(error){await page.screenshot({path:path.join(output,`${surface}-failure.png`)}).catch(()=>{});throw error;}
      finally{await context.close();}
    }
    console.log(JSON.stringify({source,standalone,output}));
  }finally{await browser.close();}
})().catch(error=>{console.error(`Screenshots: ${output}`);console.error(error);process.exitCode=1;});

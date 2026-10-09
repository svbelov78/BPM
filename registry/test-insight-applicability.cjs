/* Explicit, required tri-state bank effect answers: none / Yes / No.
 * node registry/test-insight-applicability.cjs [--standalone [file.html]]
 * Disposable offline contexts only; never the user's browser or storage. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const args=process.argv.slice(2),output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-applicability-'));
let source=path.resolve(args.find(arg=>!arg.startsWith('--'))||(args.includes('--standalone')?path.join(__dirname,'..','Sber-BPM-Registry-Standalone.html'):path.join(__dirname,'index.html')));
const standalone=path.basename(source)!=='index.html';
if(standalone){const copy=path.join(output,'isolated-prototype.html');fs.copyFileSync(source,copy);source=copy;}
const base=pathToFileURL(source).href,id='INS-000056',host='#insights-detail-view';
const ready=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const cabinetReady=page=>page.waitForFunction(()=>!document.querySelector('#cabinet-panel')?.hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
const paint=page=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
const effect=(page,index)=>page.locator(`${host} [data-id-effect="${index}"]`);
const group=(page,index)=>effect(page,index).locator('.id-detail-applicability');
const choice=(page,index,value)=>group(page,index).locator(`[data-id-applicable="${index}"][data-id-value="${value}"]`);
const field=(page,index,key)=>effect(page,index).locator(`[data-id-field="effect:${index}:${key}"]`);
const record=page=>page.evaluate(id=>BpmInsightStore.get(id),id);
const own=row=>row.detail.workflow.opinions.responses.find(response=>response.bank===row.detail.workflow.currentActor.bank);
async function seed(page){
  await page.evaluate(id=>{
    const row=BpmInsightStore.get(id),workflow=row.detail.workflow;
    const quantitative={...row.detail.effects[0],id:'tri-quant',title:'Количественный эффект: обязательный выбор',type:'Количественный',current:'240',target:'60',baselineCurrent:'240',baselineTarget:'60',unit:'мин.',baselineUnit:'мин.',period:'Год',frequency:'Регулярно',comment:'Комментарий автора: количественный эффект'};
    const qualitative={...row.detail.effects[1],id:'tri-qual',title:'Качественный эффект: обязательный выбор',type:'Качественный',current:'LEGACY_CURRENT',target:'LEGACY_TARGET',unit:'LEGACY_UNIT',period:'LEGACY_PERIOD',comment:'Комментарий автора: качественный эффект'};
    workflow.opinions.responses=workflow.opinions.responses.filter(response=>response.bank!==workflow.currentActor.bank).map((response,index)=>({...response,effects:[{id:quantitative.id,applicable:index!==0,current:index===0?'':'120',target:index===0?'':'30',unit:index===0?'':'мин.',comment:'Длинный комментарий другого банка. Проверка, что банк, актуальность и значения располагаются у верхнего края строки, а комментарий не прижимается к её центру.'},{id:qualitative.id,applicable:index!==1,comment:'Качественная оценка другого банка без числовых и периодических атрибутов.'}]}));
    BpmInsightStore.update(id,{status:'Согласовано',detail:{...row.detail,effects:[quantitative,qualitative],workflow}});
  },id);
  return record(page);
}
async function open(page,surface){
  if(surface==='cabinet'){
    await cabinetReady(page);await page.locator(`#cabinet-feed-insights [data-cabinet-open="${id}"] .card-title`).click();await page.locator('#cabinet-insight-drawer[open]').waitFor();
  }else{
    if(await page.locator('#insights-panel.is-insight-detail').count()){await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);}
    await ready(page);await page.locator(`#insights-results [data-insight-open="${id}"]`).click();
  }
  await page.locator(`${host}[data-insight-id="${id}"]`).waitFor();await paint(page);
}
async function close(page,surface){
  if(surface==='cabinet'){await page.locator(`${host} [data-id-drawer-close]`).click();await page.locator('#cabinet-insight-drawer[open]').waitFor({state:'hidden'});await cabinetReady(page);}
  else{await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);}
}
async function reloadOpen(page,surface){await page.reload();if(surface==='cabinet')await cabinetReady(page);else await ready(page);await open(page,surface);}
async function bottom(page){await page.locator(`${host} .id-detail-scroll`).evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});await paint(page);}
async function state(page,index,answer,label){
  assert.equal(await group(page,index).getAttribute('role'),'group',`${label}: accessible group`);
  assert.match(await group(page,index).getAttribute('aria-label'),/обязательный выбор/,`${label}: required choice is announced`);
  assert.equal(await effect(page,index).locator('[role="switch"]').count(),0,`${label}: legacy default switch is absent`);
  assert.equal(await group(page,index).getAttribute('data-choice'),answer===null?'none':answer?'yes':'no',`${label}: explicit tri-state`);
  assert.deepEqual(await group(page,index).locator('button').allTextContents(),['Да','Нет'],`${label}: two explicit choices`);
  assert.equal(await choice(page,index,true).getAttribute('aria-pressed'),String(answer===true),`${label}: Yes pressed state`);
  assert.equal(await choice(page,index,false).getAttribute('aria-pressed'),String(answer===false),`${label}: No pressed state`);
  assert.ok(await field(page,index,'comment').isEnabled(),`${label}: comments stay editable at every answer`);
  assert.equal(await field(page,index,'comment').evaluate(node=>node.required),false,`${label}: optional comment stays optional`);
  if(index===0){
    for(const key of ['current','target'])assert.equal(await field(page,index,key).isDisabled(),answer!==true,`${label}: numeric ${key} enabled only for explicit Yes`);
    assert.equal(await page.locator('#id-detail-unit-0-input').isDisabled(),answer!==true,`${label}: unit enabled only for explicit Yes`);
  }else{
    assert.equal(await effect(page,index).locator('[data-id-field$=":current"],[data-id-field$=":target"],.id-detail-unit').count(),0,`${label}: qualitative has no metric inputs`);
    assert.equal(await effect(page,index).locator('.id-detail-effect-values .id-detail-value').count(),1,`${label}: qualitative summary has type only`);
    assert.deepEqual(await effect(page,index).locator('th').allTextContents(),['Территориальный банк','Актуальность','Комментарий'],`${label}: qualitative table has no metric/time columns`);
    for(const legacy of ['LEGACY_CURRENT','LEGACY_TARGET','LEGACY_UNIT','LEGACY_PERIOD'])assert.equal((await effect(page,index).innerText()).includes(legacy),false,`${label}: stale qualitative ${legacy} is suppressed`);
  }
}
async function comment(page,index,text){await field(page,index,'comment').fill(text);await field(page,index,'comment').press('Tab');await paint(page);}
async function blocked(page,missing,label){
  await bottom(page);const before=await record(page),submit=page.locator(`${host} [data-id-send-opinion]`);
  assert.ok(await submit.isDisabled(),`${label}: missing answer disables submission`);
  // Exercise the production hard guard too; the real native button is disabled.
  await submit.evaluate(button=>{
    // The review gate repaints `disabled` in capture phase. Keep only this
    // disposable DOM button logically enabled for a synthetic hard-guard test.
    Object.defineProperty(button,'disabled',{configurable:true,get:()=>false,set(){}});
    button.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    delete button.disabled;button.disabled=true;
  });await paint(page);
  assert.deepEqual((await record(page)).detail.workflow.opinions.responses,before.detail.workflow.opinions.responses,`${label}: forcing a click cannot persist incomplete answers`);
  for(const index of missing)assert.equal(await group(page,index).getAttribute('aria-invalid'),'true',`${label}: every missing answer is marked invalid`);
  assert.equal(await choice(page,missing[0],true).evaluate(node=>node===document.activeElement),true,`${label}: first unanswered Yes button receives focus`);
}
async function send(page,label){
  await bottom(page);assert.ok(await page.locator(`${host} [data-id-send-opinion]`).isEnabled(),`${label}: every effect answered`);
  await page.locator(`${host} [data-id-send-opinion]`).click();await paint(page);
  assert.equal(await page.locator(`${host} [data-id-opinion-submit-label]`).textContent(),'Мнение отправлено',`${label}: response sent`);
}
async function capture(page,surface,label){
  // Tabbing from the target value opens the unit picker. Close its real popup
  // before captures so the QA image shows the table rather than a menu overlay.
  for(const input of await page.locator(`${host} input[role="combobox"][aria-expanded="true"]`).all())await input.press('Escape');
  await page.evaluate(()=>document.activeElement?.blur());
  for(const width of [1440,390,3840]){
    await page.setViewportSize({width,height:width===3840?2160:1000});await paint(page);
    for(const index of [0,1]){
      await effect(page,index).scrollIntoViewIfNeeded();await paint(page);
      const overflow=await page.locator(`${host} .id-detail-scroll`).evaluate(node=>({scroll:node.scrollWidth,client:node.clientWidth,page:document.documentElement.scrollWidth,viewport:innerWidth}));
      assert.ok(overflow.scroll<=overflow.client+1&&overflow.page<=overflow.viewport+1,`${surface}/${label}/${width}: table scrolling remains local`);
      await page.screenshot({path:path.join(output,`${surface}-${label}-${index===0?'quantitative':'qualitative'}-${width}.png`),animations:'disabled'});
      if(width===1440||width===3840){
        const extra=await effect(page,index).evaluate(node=>Math.max(0,node.getBoundingClientRect().height-node.closest('.id-detail-scroll').clientHeight)+80);
        // Native component capture: give a long table room inside the scrolling
        // viewport, without image editing or obscuring it with the sticky footer.
        if(extra>80)await page.setViewportSize({width,height:(width===3840?2160:1000)+Math.ceil(extra)});
        await effect(page,index).scrollIntoViewIfNeeded();await paint(page);
        await effect(page,index).screenshot({path:path.join(output,`${surface}-${label}-${index===0?'quantitative':'qualitative'}-component-${width}.png`),animations:'disabled'});
        if(await effect(page,index).locator('.id-detail-edit-row').count())await effect(page,index).locator('.id-detail-edit-row').screenshot({path:path.join(output,`${surface}-${label}-${index===0?'quantitative':'qualitative'}-own-row-${width}.png`),animations:'disabled'});
        if(extra>80)await page.setViewportSize({width,height:width===3840?2160:1000});
      }
    }
  }
  await page.setViewportSize({width:1440,height:1000});await paint(page);
}
async function tableStyles(page,editable,label){
  for(const index of [0,1]){
    const regular=effect(page,index).locator('tbody tr:not(.id-detail-edit-row)');
    const cells=await regular.locator('td').evaluateAll(nodes=>nodes.map(node=>({vertical:getComputedStyle(node).verticalAlign,center:node.cellIndex===1?getComputedStyle(node).textAlign:null,padding:node.cellIndex===node.parentElement.cells.length-1?getComputedStyle(node).paddingLeft:null})));
    assert.ok(cells.every(cell=>cell.vertical==='top'),`${label}: regular rows are top-aligned`);
    assert.ok(cells.filter(cell=>cell.center!==null).every(cell=>cell.center==='center'),`${label}: applicability is centered`);
    assert.ok(cells.filter(cell=>cell.padding!==null).every(cell=>cell.padding==='24px'),`${label}: readonly comments retain the requested left inset`);
    const yesCells=regular.locator('td:nth-child(2)').filter({hasText:/^Да$/});
    assert.ok(await yesCells.count()>0,`${label}: author row remains applicable`);
    assert.equal(await yesCells.locator('strong').count(),await yesCells.count(),`${label}: readonly Yes is bold`);
    const noCells=regular.locator('td:nth-child(2)').filter({hasText:/^Нет$/});
    assert.ok(await noCells.count()>0,`${label}: fixture includes a readonly No`);
    assert.equal(await noCells.locator('strong').count(),0,`${label}: readonly No is regular, not bold`);
    assert.ok((await noCells.evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).fontWeight))).every(weight=>weight==='400'),`${label}: readonly No uses regular weight`);
    if(editable){
      assert.ok((await effect(page,index).locator('.id-detail-edit-row td').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).verticalAlign))).every(value=>value==='middle'),`${label}: own row stays vertically centered`);
      const styles=await group(page,index).evaluate(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node),cell=node.closest('td').getBoundingClientRect();return {width:rect.width,height:rect.height,background:style.backgroundColor,gap:style.gap,center:(rect.left+rect.right-cell.left-cell.right)/2,buttons:[...node.querySelectorAll('button')].map(button=>({height:button.getBoundingClientRect().height,size:getComputedStyle(button).fontSize,line:getComputedStyle(button).lineHeight}))};});
      assert.equal(styles.width,114);assert.equal(styles.height,50);assert.equal(styles.gap,'4px');assert.ok(Math.abs(styles.center)<1);
      const answer=await group(page,index).getAttribute('data-choice');assert.equal(styles.background,answer==='none'?'rgb(196, 196, 196)':answer==='yes'?'rgba(52, 199, 89, 0.1)':'rgba(255, 56, 60, 0.1)');
      assert.ok(styles.buttons.every(button=>button.height===34&&button.size==='13px'&&button.line==='16px'));
    }
  }
}
function baselineUnchanged(row,baseline,label){assert.deepEqual(row.detail.effects,baseline.detail.effects,`${label}: author detail effects unchanged`);assert.deepEqual(row.effects,baseline.effects,`${label}: source effect payload unchanged`);}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    for(const surface of ['tab','cabinet']){
      const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',offline:true}),page=await context.newPage(),errors=[],requests=[];
      page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>requests.push(request.url().slice(0,150)));
      try{
        await page.goto(`${base}#insights`);await ready(page);const baseline=await seed(page);
        if(surface==='cabinet'){await page.locator('#cabinet-nav').click();await cabinetReady(page);}
        await open(page,surface);assert.equal(own(await record(page)),undefined,'Fresh bank has no implicit response');
        await page.locator(`${host} [data-id-reproduction="Воспроизводится"]`).click();
        for(const index of [0,1]){
          await state(page,index,null,`${surface}/fresh/${index}`);
          assert.equal(await field(page,index,'comment').inputValue(),'','Fresh bank does not inherit the author comment');
          assert.match(await effect(page,index).locator('.id-detail-edit-row td').first().innerText(),/Актуален ли эффект\s+для Поволжского банка\?/,'Question names the current territorial bank');
        }
        for(const key of ['current','target'])assert.equal(await field(page,0,key).inputValue(),'','Fresh bank does not inherit author metrics');
        await tableStyles(page,true,`${surface}/fresh`);await capture(page,surface,'unanswered');
        await blocked(page,[0,1],`${surface}/all unanswered`);
        await comment(page,0,'Черновик количественного эффекта без ответа');await comment(page,1,'Качественный комментарий до ответа');
        await choice(page,0,true).click();await state(page,0,true,`${surface}/explicit Yes`);assert.notEqual(await group(page,0).getAttribute('aria-invalid'),'true','Selecting Yes removes missing-answer error');
        await field(page,0,'current').fill('180');await field(page,0,'target').fill('40');await field(page,0,'target').press('Tab');
        await blocked(page,[1],`${surface}/one unanswered`);
        await choice(page,0,true).click();await state(page,0,null,`${surface}/deselected Yes`);
        assert.equal(await page.locator(`${host} [data-id-reset-confirm]`).count(),0,'Yes→none is not a destructive reset');
        assert.equal(await field(page,0,'current').inputValue(),'180');assert.equal(await field(page,0,'target').inputValue(),'40');assert.equal(await field(page,0,'comment').inputValue(),'Черновик количественного эффекта без ответа');
        await blocked(page,[0,1],`${surface}/deselected Yes required`);
        await choice(page,0,true).click();await choice(page,0,false).click();await page.locator(`${host} [data-id-reset-confirm]`).waitFor();
        await page.locator(`${host} [data-id-reset-cancel]`).click();await state(page,0,true,`${surface}/cancel direct Yes→No`);assert.equal(await field(page,0,'current').inputValue(),'180');
        await choice(page,0,false).click();await page.locator(`${host} [data-id-reset-confirm]`).click();await state(page,0,false,`${surface}/confirmed No`);
        for(const key of ['current','target','comment'])assert.equal(await field(page,0,key).inputValue(),'','Direct Yes→No confirmation keeps prior clearing semantics');
        await comment(page,0,'Не актуален: в нашем банке другой маршрут');
        await choice(page,1,false).focus();await page.keyboard.press('Enter');await state(page,1,false,`${surface}/keyboard No`);
        await tableStyles(page,true,`${surface}/all No`);await capture(page,surface,'all-no');
        await send(page,`${surface}/valid all No`);let saved=await record(page);baselineUnchanged(saved,baseline,`${surface}/all No`);
        assert.deepEqual(own(saved).effects,[{id:'tri-quant',applicable:false,comment:'Не актуален: в нашем банке другой маршрут',current:'',target:'',unit:''},{id:'tri-qual',applicable:false,comment:'Качественный комментарий до ответа'}],'All-No is valid without invented numeric or qualitative attributes');
        await reloadOpen(page,surface);for(const index of [0,1])await state(page,index,false,`${surface}/saved No reload/${index}`);
        await choice(page,0,false).focus();await page.keyboard.press('Space');await state(page,0,null,`${surface}/keyboard deselected No`);assert.equal(await field(page,0,'comment').inputValue(),'Не актуален: в нашем банке другой маршрут','No→none preserves the explanation');
        await blocked(page,[0],`${surface}/deselected saved No`);await choice(page,0,false).click();await send(page,`${surface}/reselected saved No`);
        assert.equal((await record(page)).detail.workflow.opinions.responses.filter(response=>response.bank===baseline.detail.workflow.currentActor.bank).length,1,'Resubmission updates, not duplicates, the response');
        await choice(page,0,true).click();await field(page,0,'current').fill('120');await field(page,0,'target').fill('30');await field(page,0,'target').press('Tab');await state(page,0,true,`${surface}/mixed Yes`);
        await tableStyles(page,true,`${surface}/mixed Yes-No`);await capture(page,surface,'mixed-yes-no');
        await reloadOpen(page,surface);await state(page,0,false,`${surface}/unsent Yes draft not persisted`);
        await page.locator(`${host} [data-id-reproduction="Частично"]`).click();await choice(page,1,false).click();await state(page,1,null,`${surface}/Partial missing qualitative answer`);
        await blocked(page,[1],`${surface}/Partial requires every answer`);await choice(page,1,false).click();await send(page,`${surface}/Partial all No`);assert.equal(own(await record(page)).reproduction,'Частично');
        await page.locator(`${host} [data-id-reproduction="Не воспроизводится"]`).click();await page.locator(`${host} [data-id-reset-confirm]`).click();
        assert.equal(await page.locator(`${host} [data-id-applicable],${host} .id-detail-edit-row`).count(),0,'Non-reproducible opinion bypasses effect-entry controls');
        await send(page,`${surface}/non-reproducible bypass`);saved=await record(page);assert.equal(own(saved).reproduction,'Не воспроизводится');assert.deepEqual(own(saved).effects,[]);baselineUnchanged(saved,baseline,`${surface}/non-reproducible`);
        await close(page,surface);await page.evaluate(id=>BpmInsightStore.update(id,{status:'В работе'}),id);await open(page,surface);
        assert.equal(await page.locator(`${host} [data-id-applicable],${host} .id-detail-effects [data-id-field],${host} .id-detail-unit`).count(),0,'Readonly workflow has no accidental bank inputs');
        await tableStyles(page,false,`${surface}/readonly`);await capture(page,surface,'readonly');
        assert.deepEqual(errors,[],`${surface}: no JS errors`);assert.deepEqual(requests,[],`${surface}: every asset works offline`);
        console.log(`PASS — ${surface}: fresh null, required Yes/Partial answers, Yes/No deselection, reset semantics, comments at No/null, all-No, reload, keyboard, readonly typography and 390–3840px tables`);
      }catch(error){await page.screenshot({path:path.join(output,`${surface}-failure.png`)}).catch(()=>{});throw error;}
      finally{await context.close();}
    }
    console.log(JSON.stringify({source,standalone,output}));
  }finally{await browser.close();}
})().catch(error=>{console.error(`Screenshots: ${output}`);console.error(error);process.exitCode=1;});

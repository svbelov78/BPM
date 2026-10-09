/* Quantitative and qualitative effects share their bank / applicability column axis.
 * node registry/test-insight-effect-column-alignment.cjs [--standalone [file.html]]
 * Uses disposable offline browser contexts, never the user's browser or storage. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const args=process.argv.slice(2),output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-effect-column-alignment-'));
let source=path.resolve(args.find(arg=>!arg.startsWith('--'))||(args.includes('--standalone')?path.join(__dirname,'..','Sber-BPM-Registry-Standalone.html'):path.join(__dirname,'index.html')));
const standalone=path.basename(source)!=='index.html';
if(standalone){const copy=path.join(output,'isolated-prototype.html');fs.copyFileSync(source,copy);source=copy;}
const base=pathToFileURL(source).href,id='INS-000056',host='#insights-detail-view';
const ready=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const cabinetReady=page=>page.waitForFunction(()=>!document.querySelector('#cabinet-panel')?.hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
const paint=page=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
async function seed(page){
  await page.evaluate(id=>{
    const row=BpmInsightStore.get(id),workflow=row.detail.workflow;
    const quantitative={...row.detail.effects[0],id:'alignment-quant',title:'Количественный эффект для проверки общей оси',type:'Количественный',current:'240',target:'60',baselineCurrent:'240',baselineTarget:'60',unit:'мин.',baselineUnit:'мин.',period:'Год',frequency:'Регулярно'};
    const qualitative={...row.detail.effects[1],id:'alignment-qual',title:'Качественный эффект для проверки общей оси',type:'Качественный'};
    workflow.opinions.responses=workflow.opinions.responses.filter(response=>response.bank!==workflow.currentActor.bank).map(response=>({...response,effects:[{id:quantitative.id,applicable:true,current:'120',target:'30',unit:'мин.',comment:'Комментарии банков выровнены по верхнему краю строки.'},{id:qualitative.id,applicable:false,comment:'Качественная оценка без числовых полей.'}]}));
    BpmInsightStore.update(id,{status:'Согласовано',detail:{...row.detail,effects:[quantitative,qualitative],workflow}});
  },id);
}
async function open(page,surface){
  if(surface==='cabinet'){
    await cabinetReady(page);await page.locator(`#cabinet-feed-insights [data-cabinet-open="${id}"] .card-title`).click();await page.locator('#cabinet-insight-drawer[open]').waitFor();
  }else{
    await ready(page);await page.locator(`#insights-results [data-insight-open="${id}"]`).click();
  }
  await page.locator(`${host}[data-insight-id="${id}"]`).waitFor();await paint(page);
}
async function close(page,surface){
  if(surface==='cabinet'){
    await page.locator(`${host} [data-id-drawer-close]`).click();await page.locator('#cabinet-insight-drawer[open]').waitFor({state:'hidden'});await cabinetReady(page);
  }else{
    await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page);
  }
}
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1,`${label}: ${actual} ≈ ${expected}`);
async function geometry(page,surface,mode,width){
  await page.setViewportSize({width,height:width>=1920?1400:1000});await paint(page);
  await page.locator(`${host} .id-detail-table-scroll`).evaluateAll(nodes=>nodes.forEach(node=>{node.scrollLeft=0;}));
  const data=await page.locator(`${host} .id-detail-effects`).evaluate(effects=>{
    const rect=node=>{const box=node.getBoundingClientRect();return {left:box.left,right:box.right,width:box.width,center:(box.left+box.right)/2};};
    const tables=[...effects.querySelectorAll('.id-detail-effects-table')].map(table=>{
      const headers=[...table.querySelector('thead tr').cells],rows=[...table.querySelectorAll('tbody tr')],app=table.querySelector('.id-detail-applicability');
      const scroll=table.closest('.id-detail-table-scroll');
      return {qualitative:table.classList.contains('id-detail-effects-table--qualitative'),table:rect(table),headers:headers.map(rect),texts:headers.map(cell=>cell.textContent),rows:rows.map(row=>({count:row.cells.length,bank:rect(row.cells[0]),applicability:rect(row.cells[1]),edit:row.classList.contains('id-detail-edit-row')})),group:app?rect(app):null,scroll:{left:scroll.getBoundingClientRect().left,client:scroll.clientWidth,width:scroll.scrollWidth},comment:rect(headers.at(-1)),fields:table.querySelectorAll('[data-id-field$=":current"],[data-id-field$=":target"],.id-detail-unit').length};
    });
    const detail=effects.closest('.id-detail-scroll');
    return {tables,overflow:{detailWidth:detail.clientWidth,detailScroll:detail.scrollWidth,page:document.documentElement.scrollWidth,viewport:innerWidth}};
  });
  const [quant,qual]=data.tables,label=`${surface}/${mode}/${width}`;
  assert.equal(data.tables.length,2,`${label}: both effect tables exist`);
  assert.equal(quant.qualitative,false);assert.equal(qual.qualitative,true);
  assert.equal(quant.headers.length,6,`${label}: quantitative fields retained`);
  assert.deepEqual(qual.texts,['Территориальный банк','Актуальность','Комментарий'],`${label}: qualitative table has only its three actual columns`);
  assert.ok(qual.rows.every(row=>row.count===3),`${label}: no empty metric cells in qualitative rows`);
  assert.equal(qual.fields,0,`${label}: no qualitative metric controls`);
  near(quant.table.left,qual.table.left,`${label}: common table start`);
  for(const index of [0,1]){
    near(quant.headers[index].left,qual.headers[index].left,`${label}: shared column ${index} left`);
    near(quant.headers[index].width,qual.headers[index].width,`${label}: shared column ${index} width`);
    near(quant.headers[index].center,qual.headers[index].center,`${label}: shared column ${index} center`);
  }
  for(const table of [quant,qual])for(const row of table.rows){
    near(row.bank.left,quant.headers[0].left,`${label}: bank rows share the header axis`);
    near(row.applicability.center,quant.headers[1].center,`${label}: applicability rows share the header axis`);
  }
  near(qual.comment.left,quant.headers[2].left,`${label}: qualitative comment starts after the common applicability column`);
  near(qual.comment.right,qual.table.right,`${label}: qualitative comment fills all remaining space without empty metric columns`);
  if(mode==='editable'){
    assert.ok(quant.group&&qual.group,`${label}: both editable choices exist`);
    near(quant.group.center,qual.group.center,`${label}: button groups share the same center`);
    for(const table of [quant,qual]){
      near(table.group.width,114,`${label}: standard choice width`);
      assert.ok(table.group.left>=table.headers[1].left+11.9&&table.group.right<=table.headers[1].right-11.9,`${label}: choice stays inside its cell`);
    }
  }else assert.equal(quant.group||qual.group,null,`${label}: read-only has no editable choices`);
  assert.ok(data.overflow.detailScroll<=data.overflow.detailWidth+1&&data.overflow.page<=data.overflow.viewport+1,`${label}: no drawer/page horizontal overflow`);
  if(width<=768)assert.ok(quant.scroll.width>quant.scroll.client,`${label}: the wider quantitative table scrolls locally on narrow screens`);
  assert.equal(await page.locator(`${host} .id-detail-effects-table--qualitative`).evaluate(table=>getComputedStyle(table).minWidth),'640px',`${label}: qualitative tables retain the compact minimum even in a mixed list`);
  if(mode==='editable'&&[390,1440,1920,3840].includes(width)){
    await page.locator(`${host} [data-id-effect="0"]`).scrollIntoViewIfNeeded();await paint(page);
    await page.screenshot({path:path.join(output,`${surface}-${mode}-${width}.png`),animations:'disabled'});
    if(width>=1920){
      const effects=page.locator(`${host} .id-detail-effects`);
      const height=Math.ceil(await effects.evaluate(node=>node.getBoundingClientRect().height))+500;
      await page.setViewportSize({width,height});await effects.scrollIntoViewIfNeeded();await paint(page);
      await effects.screenshot({path:path.join(output,`${surface}-${mode}-${width}-effects.png`),animations:'disabled'});
      for(const index of [0,1])await page.locator(`${host} [data-id-effect="${index}"] .id-detail-edit-row`).screenshot({path:path.join(output,`${surface}-${mode}-${width}-${index===0?'quantitative':'qualitative'}-own-row.png`),animations:'disabled'});
    }
  }
}
async function qualitativeOnly(page,surface){
  await close(page,surface);
  await page.evaluate(id=>{const row=BpmInsightStore.get(id);BpmInsightStore.update(id,{detail:{...row.detail,effects:[row.detail.effects[1]]}});},id);
  await open(page,surface);await page.setViewportSize({width:768,height:1000});await paint(page);
  const table=await page.locator(`${host} .id-detail-effects-table`).evaluate(table=>({width:table.getBoundingClientRect().width,min:getComputedStyle(table).minWidth,columns:table.querySelectorAll('th').length,fields:table.querySelectorAll('[data-id-field$=":current"],[data-id-field$=":target"],.id-detail-unit').length}));
  assert.equal(table.min,'640px',`${surface}: an entirely qualitative list preserves its compact minimum`);
  assert.ok(table.width<1120,`${surface}: no quantitative-sized blank space in a qualitative-only list`);
  assert.equal(table.columns,3);assert.equal(table.fields,0);
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    for(const surface of ['tab','cabinet']){
      const context=await browser.newContext({viewport:{width:1440,height:1000},offline:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],failed=[];
      page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>failed.push(request.url()));
      try{
        await page.goto(`${base}#insights`);await ready(page);await seed(page);
        if(surface==='cabinet'){await page.locator('#cabinet-nav').click();await cabinetReady(page);}
        await open(page,surface);await page.locator(`${host} [data-id-reproduction="Воспроизводится"]`).click();
        for(const width of [320,390,768,1440,1920,3840])await geometry(page,surface,'editable',width);
        await close(page,surface);await page.evaluate(id=>BpmInsightStore.update(id,{status:'В работе'}),id);await open(page,surface);
        for(const width of [320,390,768,1440,1920,3840])await geometry(page,surface,'readonly',width);
        await qualitativeOnly(page,surface);
        assert.deepEqual(errors,[],`${surface}: no runtime errors`);assert.deepEqual(failed,[],`${surface}: assets work offline`);
        console.log(`PASS — ${surface}: shared bank/applicability/header/button axes for mixed effects, 320–3840 px, editable/read-only, qualitative-only stays compact`);
      }catch(error){await page.screenshot({path:path.join(output,`${surface}-failure.png`)}).catch(()=>{});throw error;}
      finally{await context.close();}
    }
    console.log(JSON.stringify({source,standalone,output}));
  }finally{await browser.close();}
})().catch(error=>{console.error(`Screenshots: ${output}`);console.error(error);process.exitCode=1;});

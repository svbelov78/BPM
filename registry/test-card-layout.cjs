/* Cross-page card sizing and Home filter visual regressions.
 * node test-card-layout.cjs
 * BPM_CABINET_STANDALONE=1 node test-card-layout.cjs
 * Optional BPM_CARD_LAYOUT_URL and test groups: home, leftColumn, mobileColumns, dualExpansion, conditionalScroll, registry, tasks, filters, sharedMenus.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const standalone = process.env.BPM_CABINET_STANDALONE === '1';
const embedded = standalone || process.env.BPM_CABINET_EMBEDDED === '1';
const base = process.env.BPM_CARD_LAYOUT_URL || process.env.BPM_CABINET_URL || pathToFileURL(path.join(__dirname,standalone ? '../Sber-BPM-Registry-Standalone.html' : 'index.html')).href;
const widths = [2560,1920,1440,1280,1024,768,390,320];
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-card-layout-'));
const failures = [],measurements = [];
let loadSequence=0;
function check(condition,message) {if(!condition){failures.push(message);console.error(`FAIL — ${message}`);}}
async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  });
}
async function ready(page,id) {await page.waitForFunction(id => document.getElementById(id)?.getAttribute('aria-busy') === 'false',id);await paint(page);}
async function load(page,hash,id) {
  await page.setViewportSize({width:1920,height:1080});
  const url = new URL(base);url.searchParams.set('card-layout-test',String(++loadSequence));url.hash=hash;await page.goto(url.href);await ready(page,id);
}
async function viewport(page,width) {
  await page.setViewportSize({width,height:1080});await page.mouse.move(width-1,1);
  if(await page.locator('body').evaluate(element => element.classList.contains('mobile-menu-open'))) await page.locator('#collapse-menu').click();
  if(width<768) await page.waitForFunction(() => document.getElementById('sidebar').getBoundingClientRect().right <= 0);
  await page.evaluate(() => window.scrollTo(0,0));await paint(page);
}
async function geometry(page,label,selector) {
  await paint(page);
  const result=await page.locator(selector).evaluateAll(elements => {
    const grid=elements[0]?.parentElement,s=grid&&getComputedStyle(grid),number=value=>Number.parseFloat(value)||0;
    return {viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      grid:s?.display==='grid'?{gap:number(s.columnGap),minimum:number(s.getPropertyValue('--card-min-width'))||340,limit:number(s.getPropertyValue('--card-columns-limit')),columns:s.gridTemplateColumns.trim().split(/\s+/).length,available:grid.getBoundingClientRect().width-number(s.paddingLeft)-number(s.paddingRight)-number(s.borderLeftWidth)-number(s.borderRightWidth)}:null,
      boxes:elements.map(element=>{const r=element.getBoundingClientRect();return {width:r.width,left:r.left,right:r.right,top:r.top};})};
  });
  const tag=`${label} at ${result.viewport}px`,sizes=result.boxes.map(box=>box.width);
  check(sizes.length>0,`${tag}: cards exist`);if(!sizes.length)return;
  const minimum=Math.min(...sizes),maximum=Math.max(...sizes);
  const rows=[];
  for(const box of result.boxes){let row=rows.find(row=>Math.abs(row.top-box.top)<1);if(!row){row={top:box.top,count:0,boxes:[]};rows.push(row);}row.count++;row.boxes.push(box);}
  const columns=Math.max(...rows.map(row=>row.count));
  measurements.push({label,viewport:result.viewport,cards:sizes.length,minWidth:minimum,maxWidth:maximum,columns,lastRowCount:rows.at(-1).count});
  check(maximum<=420.1,`${tag}: every card is at most 420px (maximum ${maximum.toFixed(2)})`);
  check(maximum-minimum<=1,`${tag}: all rows have equal card widths (${minimum.toFixed(2)}–${maximum.toFixed(2)})`);
  check(result.pageWidth<=result.viewport+1&&result.bodyWidth<=result.viewport+1,`${tag}: page remains within viewport (${result.pageWidth}/${result.bodyWidth})`);
  check(result.boxes.every(box=>box.width>0&&box.left>=-1&&box.right<=result.viewport+1),`${tag}: cards stay within viewport`);
  if(result.grid){
    const grid=result.grid;
    let expected=Math.max(1,Math.floor((grid.available+grid.gap+.01)/(grid.minimum+grid.gap)));
    if(grid.limit>0)expected=Math.min(expected,grid.limit);
    check(grid.columns===expected,`${tag}: column count fills available width at minimum ${grid.minimum}px (${grid.columns}, expected ${expected})`);
    for(const row of rows){row.boxes.sort((a,b)=>a.left-b.left);for(let i=1;i<row.boxes.length;i++){
      const gap=row.boxes[i].left-row.boxes[i-1].right;
      check(Math.abs(gap-grid.gap)<=1,`${tag}: actual card gap matches ${grid.gap}px (${gap.toFixed(2)})`);
    }}
    check(Math.abs(maximum-Math.min(420,(grid.available-grid.gap*(expected-1))/expected))<=1,`${tag}: card width matches its capped grid track`);
  }
}
async function home(page) {
  await load(page,'cabinet','cabinet-feed-insights');
  for(const width of widths){
    await viewport(page,width);
    for(const key of ['insights','tasks','paths','processes']) await geometry(page,`Home ${key}`,`#cabinet-panel [data-cabinet-kind="${key}"]`);
    if(width===1920||width===390)await page.screenshot({path:path.join(output,`home-${width}.png`),fullPage:true});
    for(const key of ['insights','tasks']){
      await page.locator(`#cabinet-expand-${key}`).click();await paint(page);
      await geometry(page,`Expanded ${key}`,`#cabinet-panel [data-cabinet-kind="${key}"]`);
      if(width===1920&&key==='insights'){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,'expanded-insights-1920.png')});}
      await page.locator(`#cabinet-expand-${key}`).click();await paint(page);
    }
  }
  console.log('CHECKED — default and expanded Home grids at all eight widths');
}
async function leftColumn(page) {
  await load(page,'cabinet','cabinet-feed-insights');
  const samples=[];
  const inspect=()=>page.evaluate(()=>{
    const width=element=>element.getBoundingClientRect().width;
    const left=document.querySelector('.cabinet-left'),right=document.querySelector('.cabinet-right'),layout=document.querySelector('.cabinet-layout');
    return {viewport:innerWidth,leftWidth:width(left),rightWidth:width(right),layoutWidth:width(layout),panelWidth:width(document.querySelector('#cabinet-panel')),feeds:['insights','tasks'].map(key=>{
      const widget=document.querySelector(`[data-cabinet-section="${key}"]`),feed=widget.querySelector('.cabinet-feed'),style=getComputedStyle(feed),rect=widget.getBoundingClientRect();
      return {key,widgetWidth:rect.width,widgetHeight:rect.height,chromeHeight:[...widget.children].filter(child=>child!==feed).reduce((sum,child)=>sum+child.getBoundingClientRect().height,0),display:style.display,direction:style.flexDirection,gap:style.gap,paddingLeft:style.paddingLeft,paddingRight:style.paddingRight,verticalPadding:parseFloat(style.paddingTop)+parseFloat(style.paddingBottom),scrollbar:feed.offsetWidth-feed.clientWidth,cards:[...feed.querySelectorAll('.cabinet-card')].map(card=>({width:width(card),height:card.getBoundingClientRect().height,left:card.getBoundingClientRect().left}))};
    })};
  });
  for(const width of [1920,2200,2560,3200,1440,1280,1024,768,600,390,320]){
    await viewport(page,width);const before=await inspect();samples.push(before);
    check(before.leftWidth<=436.1,`${width}px: collapsed left column is at most 436px (${before.leftWidth})`);
    for(const feed of before.feeds){
      check(feed.widgetWidth<=436.1,`${width}px/${feed.key}: widget is at most 436px (${feed.widgetWidth})`);
      check(Math.abs(feed.widgetWidth-before.leftWidth)<=1,`${width}px/${feed.key}: widget fills its column`);
      check(feed.cards.every(card=>Math.abs(card.width-(feed.widgetWidth-16-feed.scrollbar))<=1),`${width}px/${feed.key}: cards fill widget minus 16px padding and scrollbar`);
      check(feed.display==='flex'&&feed.direction==='column'&&feed.gap==='8px'&&feed.paddingLeft==='8px'&&feed.paddingRight==='8px',`${width}px/${feed.key}: original vertical feed spacing is retained`);
      check(feed.cards.every(card=>Math.abs(card.height-(feed.key==='insights'?311:304))<=1),`${width}px/${feed.key}: original card heights are retained`);
      const visibleRows=Math.min(feed.cards.length,2),contentHeight=feed.cards.slice(0,visibleRows).reduce((sum,card)=>sum+card.height,0)+Math.max(0,visibleRows-1)*8+feed.verticalPadding;
      check(Math.abs(feed.widgetHeight-feed.chromeHeight-contentHeight)<=1,`${width}px/${feed.key}: widget naturally fits at most two card rows`);
      check(feed.cards.every(card=>Math.abs(card.left-feed.cards[0].left)<=1),`${width}px/${feed.key}: feed stays a single aligned column`);
    }
    if(width>=2200)check(Math.abs(before.leftWidth-436)<=1,`${width}px: wide left column stops at 436px`);
    for(const key of ['insights','tasks']){
      await page.locator(`#cabinet-expand-${key}`).click();await paint(page);
      const expanded=await page.locator(`[data-cabinet-section="${key}"]`).boundingBox();
      check(Math.abs(expanded.width-before.layoutWidth)<=1,`${width}px/${key}: expanded feed still spans the available layout`);
      await page.locator(`#cabinet-expand-${key}`).click();await paint(page);const restored=await inspect();
      check(Math.abs(restored.leftWidth-before.leftWidth)<=1&&Math.abs(restored.rightWidth-before.rightWidth)<=1,`${width}px/${key}: closing expansion restores both column widths`);
      check(restored.feeds.every((feed,index)=>Math.abs(feed.widgetWidth-before.feeds[index].widgetWidth)<=1&&feed.display==='flex'&&feed.direction==='column'),`${width}px/${key}: original feed layout is restored`);
    }
    if([1920,2560,600,390].includes(width)){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,`left-column-${width}.png`),fullPage:true});}
  }
  const wide=samples.filter(sample=>sample.viewport>=2200).sort((a,b)=>a.viewport-b.viewport);
  for(let i=1;i<wide.length;i++){
    const viewportGrowth=wide[i].viewport-wide[i-1].viewport,rightGrowth=wide[i].rightWidth-wide[i-1].rightWidth;
    check(Math.abs(rightGrowth-viewportGrowth)<=1,`${wide[i-1].viewport}→${wide[i].viewport}px: all additional width goes to the right column (${rightGrowth}/${viewportGrowth})`);
  }
  fs.writeFileSync(path.join(output,'left-column-measurements.json'),JSON.stringify(samples,null,2));
  console.log('CHECKED — 436px left-column cap, flush 420px cards, original feed styles, right-column growth and expansion restoration at 11 widths');
}
async function mobileColumns(page) {
  await load(page,'cabinet','cabinet-feed-insights');
  const samples=[];
  for(const width of [320,390,436,480,600,700]){
    await viewport(page,width);
    const result=await page.evaluate(()=>({viewport:innerWidth,panel:document.getElementById('cabinet-panel').getBoundingClientRect().width,widgets:[...document.querySelectorAll('#cabinet-panel [data-cabinet-section]')].map(widget=>{
      const r=widget.getBoundingClientRect(),grid=widget.querySelector('.cabinet-entity-grid');
      return {key:widget.dataset.cabinetSection,left:r.left,right:r.right,width:r.width,scrollbar:grid?grid.offsetWidth-grid.clientWidth:0,cards:[...widget.querySelectorAll('.cabinet-entity-card')].map(card=>card.getBoundingClientRect().width)};
    })}));
    samples.push(result);
    check(result.panel<=700,`${width}px: the narrow container rule is exercised (${result.panel}px)`);
    check(result.widgets.length===6,`${width}px: all six Home widgets exist`);
    const reference=result.widgets.find(widget=>widget.key==='insights');
    for(const widget of result.widgets){
      check(widget.width<=436.1,`${width}px/${widget.key}: normal widget is at most 436px (${widget.width})`);
      check(Math.abs(widget.width-reference.width)<=1&&Math.abs(widget.left-reference.left)<=1&&Math.abs(widget.right-reference.right)<=1,`${width}px/${widget.key}: widget edges match Insights`);
      check(widget.cards.every(cardWidth=>Math.abs(cardWidth-(widget.width-16-widget.scrollbar))<=1),`${width}px/${widget.key}: entity cards fill the widget minus padding and scrollbar`);
    }
    if(width===600){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,'mobile-columns-600.png'),fullPage:true});}
  }
  for(const width of [1920,2560]){
    await viewport(page,width);
    const right=await page.locator('.cabinet-right').boundingBox();
    check(right.width>436,`${width}px: desktop right column remains fluid (${right.width}px)`);
  }
  fs.writeFileSync(path.join(output,'mobile-column-measurements.json'),JSON.stringify(samples,null,2));
  console.log('CHECKED — aligned six-widget mobile columns at 320/390/436/480/600/700px; desktop right column remains fluid');
}
async function dualExpansion(page) {
  await load(page,'cabinet','cabinet-feed-insights');
  const orders=[['insights','tasks'],['tasks','insights']];
  async function state(expected,label){
    const actual=await page.evaluate(()=>({tokens:(document.querySelector('.cabinet-layout').dataset.expanded||'').split(/\s+/).filter(Boolean).sort(),count:Number(document.querySelector('.cabinet-layout').dataset.expandedCount||0),sections:[...document.querySelectorAll('.cabinet-widget.is-expanded')].map(element=>element.dataset.cabinetSection).sort(),buttons:['insights','tasks'].map(key=>({key,expanded:document.getElementById(`cabinet-expand-${key}`).getAttribute('aria-expanded')}))}));
    check(JSON.stringify(actual.tokens)===JSON.stringify([...expected].sort()),`${label}: layout retains independent expanded tokens`);
    check(actual.count===expected.length,`${label}: expanded count is ${expected.length}`);
    check(JSON.stringify(actual.sections)===JSON.stringify([...expected].sort()),`${label}: expanded sections match their buttons`);
    check(actual.buttons.every(button=>button.expanded===String(expected.includes(button.key))),`${label}: aria-expanded is independent`);
  }
  async function both(label){
    await paint(page);await state(['insights','tasks'],label);
    const result=await page.evaluate(()=>{const layout=document.querySelector('.cabinet-layout').getBoundingClientRect();return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,layout:{left:layout.left,right:layout.right,width:layout.width},widgets:[...document.querySelectorAll('#cabinet-panel [data-cabinet-section]')].map(element=>{const r=element.getBoundingClientRect();return {key:element.dataset.cabinetSection,left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom};})};});
    check(result.widgets.length===6,`${label}: all six widgets remain visible`);
    for(const widget of result.widgets)check(Math.abs(widget.left-result.layout.left)<=1&&Math.abs(widget.right-result.layout.right)<=1&&Math.abs(widget.width-result.layout.width)<=1,`${label}/${widget.key}: both-expanded widgets span the full available width`);
    check(result.widgets.map(widget=>widget.key).join(',')==='insights,tasks,paths,processes,research,gemba',`${label}: DOM order remains Insights, Tasks, then right-side widgets`);
    check([...result.widgets].sort((a,b)=>a.top-b.top).map(widget=>widget.key).join(',')==='insights,tasks,paths,processes,research,gemba',`${label}: visual order remains Insights above Tasks above Paths`);
    for(let i=1;i<result.widgets.length;i++)check(result.widgets[i].top>=result.widgets[i-1].bottom-1,`${label}: ${result.widgets[i-1].key} does not overlap ${result.widgets[i].key}`);
    check(result.scroll<=result.viewport+1,`${label}: expanded layout does not overflow horizontally`);
  }
  for(const width of [1920,1440,600,900,390]){
    await viewport(page,width);
    const baseline=await page.locator('.cabinet-right').boundingBox();
    const originalWidths=await page.locator('[data-cabinet-section]').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().width));
    for(const openOrder of orders)for(const closeOrder of orders){
      const label=`${width}px open ${openOrder.join('→')} close ${closeOrder.join('→')}`;
      await page.locator(`#cabinet-expand-${openOrder[0]}`).click();await paint(page);await state([openOrder[0]],`${label}/first open`);
      await page.locator(`#cabinet-expand-${openOrder[1]}`).click();await both(label);
      for(const key of ['insights','tasks','paths','processes'])await geometry(page,`${label}/${key}`,`#cabinet-panel [data-cabinet-kind="${key}"]`);
      await page.locator('#cabinet-filter-insights').click();
      await page.locator('.cabinet-menu').getByRole('menuitemradio',{name:'Новый',exact:true}).click();await page.keyboard.press('Escape');await both(`${label}/filter render`);
      await page.locator('#cabinet-tab-outgoing').click();await both(`${label}/outgoing render`);
      await page.locator('#cabinet-tab-incoming').click();await both(`${label}/incoming render`);
      if(width===1920&&openOrder[0]==='insights'&&closeOrder[0]==='insights'){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,'both-expanded-1920.png'),fullPage:true});}
      await page.locator(`#cabinet-expand-${closeOrder[0]}`).click();await paint(page);await state([closeOrder[1]],`${label}/first close`);
      const right=await page.locator('.cabinet-right').boundingBox(),remaining=await page.locator(`[data-cabinet-section="${closeOrder[1]}"]`).boundingBox(),layout=await page.locator('.cabinet-layout').boundingBox();
      check(Math.abs(right.width-baseline.width)<=1,`${label}: closing one restores the normal right-column width`);
      check(Math.abs(remaining.width-layout.width)<=1,`${label}: the other feed stays fully expanded`);
      await page.locator(`#cabinet-expand-${closeOrder[1]}`).click();await paint(page);await state([],`${label}/both closed`);
      const restored=await page.locator('[data-cabinet-section]').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().width));
      check(restored.every((value,index)=>Math.abs(value-originalWidths[index])<=1),`${label}: closing both restores every original widget width`);
    }
  }
  console.log('CHECKED — independent dual expansion, four click/collapse orders, six full-width widgets, render persistence and restoration at 1920/1440/600/900/390px');
}
async function conditionalScroll(page) {
  await load(page,'cabinet','cabinet-feed-insights');
  const samples=[];
  async function inspect(label){
    await paint(page);
    const rows=await page.locator('.cabinet-feed,.cabinet-entity-grid').evaluateAll(elements=>elements.map(element=>{
      const style=getComputedStyle(element),widget=element.closest('[data-cabinet-section]'),cards=[...element.children].filter(child=>child.matches('.cabinet-card')),cardRows=[];
      for(const card of cards){const r=card.getBoundingClientRect();let row=cardRows.find(row=>Math.abs(row.top-r.top)<1);if(!row){row={top:r.top,height:0};cardRows.push(row);}row.height=Math.max(row.height,r.height);}
      const fade=element.classList.contains('cabinet-feed')?getComputedStyle(widget,'::after'):null;
      return {key:widget.dataset.cabinetSection,rows:cardRows.length,reportedRows:Number(element.dataset.cabinetRows),scroll:element.dataset.cabinetScroll,overflow:style.overflowY,maxHeight:style.maxHeight,twoRowHeight:parseFloat(style.getPropertyValue('--cabinet-two-row-height'))||0,expectedHeight:cardRows.slice(0,2).reduce((sum,row)=>sum+row.height,0)+Math.max(0,Math.min(cardRows.length,2)-1)*(parseFloat(style.rowGap)||0)+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom),clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,scrollTop:element.scrollTop,fade:fade?fade.content!=='none'&&fade.display!=='none'&&fade.visibility!=='hidden'&&Number(fade.opacity)>0&&parseFloat(fade.height)>0:null};
    }));
    samples.push({label,rows});
    for(const row of rows){
      const shouldScroll=row.rows>2,tag=`${label}/${row.key} (${row.rows} rows)`;
      check(row.reportedRows===row.rows,`${tag}: reported row count matches rendered rows`);
      check(row.scroll===String(shouldScroll),`${tag}: internal scrolling is enabled only beyond two rows`);
      if(shouldScroll){
        check(row.overflow==='auto'&&row.maxHeight!=='none',`${tag}: overflow and maximum height enable scrolling`);
        check(Math.abs(row.twoRowHeight-row.expectedHeight)<=1&&Math.abs(parseFloat(row.maxHeight)-row.expectedHeight)<=1&&Math.abs(row.clientHeight-row.expectedHeight)<=1,`${tag}: viewport shows exactly two rows plus padding`);
        check(row.scrollHeight>row.clientHeight+1,`${tag}: additional rows are actually scrollable`);
        if(row.fade!==null)check(row.fade,`${tag}: long feed retains its bottom fade`);
      }else{
        check(row.overflow==='visible'&&row.maxHeight==='none',`${tag}: short content remains naturally sized and visible`);
        check(row.scrollHeight<=row.clientHeight+1&&row.scrollTop===0,`${tag}: short content has no internal scroll range`);
        if(row.fade!==null)check(!row.fade,`${tag}: short feed has no bottom fade`);
      }
    }
    return rows;
  }
  async function expand(keys){
    for(const key of ['insights','tasks']){const button=page.locator(`#cabinet-expand-${key}`);if(await button.getAttribute('aria-expanded')!==String(keys.includes(key)))await button.click();}
    await paint(page);
  }
  async function expansion(keys,label){
    for(const key of ['insights','tasks'])check(await page.locator(`#cabinet-expand-${key}`).getAttribute('aria-expanded')===String(keys.includes(key)),`${label}: ${key} expansion survives rerender`);
  }
  async function wheel(key,internal,label){
    const element=page.locator(`#cabinet-feed-${key}`);await element.scrollIntoViewIfNeeded();await element.evaluate(node=>{node.scrollTop=0;});await paint(page);
    const box=await element.boundingBox(),before=await page.evaluate(()=>window.scrollY);
    await page.mouse.move(box.x+Math.min(24,box.width/2),box.y+box.height/2);await page.mouse.wheel(0,350);
    const moved=await page.waitForFunction(({key,internal,before})=>internal?document.getElementById(`cabinet-feed-${key}`).scrollTop>0:window.scrollY>before+1,{key,internal,before},{timeout:3000}).then(()=>true,()=>false);
    const after=await element.evaluate(node=>({page:window.scrollY,inner:node.scrollTop}));
    check(moved,`${label}: wheel moves the ${internal?'internal feed':'page'}`);
    check(internal?Math.abs(after.page-before)<=1:after.inner===0,`${label}: wheel does not scroll the ${internal?'page':'short feed'}`);
  }
  for(const width of [1920,600,390]){
    await viewport(page,width);await expand([]);
    if(await page.locator('#cabinet-tab-incoming').getAttribute('aria-selected')!=='true')await page.locator('#cabinet-tab-incoming').click();
    await inspect(`${width}px/default`);await wheel('insights',true,`${width}px/default Insights`);
    await expand(['tasks']);await inspect(`${width}px/expanded incoming Tasks`);
    await page.locator('#cabinet-tab-outgoing').click();await expansion(['tasks'],`${width}px/outgoing`);
    const outgoing=await inspect(`${width}px/expanded outgoing Tasks`);
    check(outgoing.find(row=>row.key==='tasks').rows===1,`${width}px: outgoing task fixture has one row`);
    await wheel('tasks',false,`${width}px/one-row Tasks`);
    await page.locator('#cabinet-tab-incoming').click();await expansion(['tasks'],`${width}px/incoming`);await inspect(`${width}px/incoming restored`);
    await expand(['insights','tasks']);await inspect(`${width}px/both expanded`);
    await page.locator('#cabinet-filter-insights').click();await page.locator('.cabinet-menu').getByRole('menuitemradio',{name:'В работе',exact:true}).click();await page.keyboard.press('Escape');
    await expansion(['insights','tasks'],`${width}px/filter`);
    const filtered=await inspect(`${width}px/no-result Insights`);check(filtered.find(row=>row.key==='insights').rows===0,`${width}px: filter removes all insight rows`);
    await page.locator('#cabinet-filter-insights').click();await page.locator('.cabinet-menu [data-clear]').click();await page.keyboard.press('Escape');
    await expansion(['insights','tasks'],`${width}px/filter reset`);await inspect(`${width}px/Insights restored`);
    if(width===1920){
      const before=await inspect('1920px/resize start');check(before.find(row=>row.key==='insights').rows===3,'Expanded Insights starts with three rows');
      await viewport(page,2560);const resized=await inspect('2560px/two-row resize');check(resized.find(row=>row.key==='insights').rows===2,'Wider layout reduces expanded Insights to two rows');
      await wheel('insights',false,'2560px/two-row Insights');
      await viewport(page,1920);const restored=await inspect('1920px/three-row resize restored');check(restored.find(row=>row.key==='insights').rows===3,'Narrowing restores three-row internal scrolling');
      await wheel('insights',true,'1920px/three-row Insights');
    }
    await expand([]);await inspect(`${width}px/collapsed restored`);
  }
  fs.writeFileSync(path.join(output,'scroll-measurements.json'),JSON.stringify(samples,null,2));
  console.log('CHECKED — 0/1/2/3+ rows, conditional internal scrolling, wheel routing, resize, filters/tabs and expansion persistence at 1920/600/390px');
}
async function registry(page) {
  await load(page,'main','results');
  if(await page.locator('#cards-view').getAttribute('aria-pressed')!=='true'){await page.locator('#cards-view').click();await ready(page,'results');}
  for(const entity of ['paths','processes']){
    await viewport(page,1920);
    if(await page.locator(`#${entity}-tab`).getAttribute('aria-pressed')!=='true'){await page.locator(`#${entity}-tab`).click();await ready(page,'results');}
    for(const width of widths){await viewport(page,width);await geometry(page,`Registry ${entity}`,'#results .entity-card[data-record]');}
  }
  console.log('CHECKED — path and process registry grids at all eight widths');
}
async function tasks(page) {
  await load(page,'tasks','tasks-results');
  await page.locator('#tasks-cards').click();await ready(page,'tasks-results');
  for(const width of widths){await viewport(page,width);await geometry(page,'Tasks cards','#tasks-results .task-card[data-task-id]');}
  console.log('CHECKED — task cards at all eight widths');
}
async function buttonStyle(button) {
  return button.evaluate(element=>{const s=getComputedStyle(element),icon=getComputedStyle(element.querySelector('img'));return {background:s.backgroundColor,image:s.backgroundImage,shadow:s.boxShadow,outline:s.outlineStyle,outlineWidth:s.outlineWidth,border:s.borderWidth,filter:icon.filter};});
}
function neutral(style,label) {
  check(style.background==='rgba(0, 0, 0, 0)'&&style.image==='none',`${label}: transparent background (${style.background}/${style.image})`);
  check(style.shadow==='none',`${label}: no state ring or pressed shadow (${style.shadow})`);
  check(style.outline==='none'||style.outlineWidth==='0px',`${label}: pointer state has no outline (${style.outline}/${style.outlineWidth})`);
  check(style.border==='0px',`${label}: no border (${style.border})`);
}
async function radius(page,selector,label) {
  const radii=await page.locator(selector).evaluate(element=>{const s=getComputedStyle(element);return [s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomRightRadius,s.borderBottomLeftRadius];});
  check(radii.every(value=>value==='16px'),`${label}: outer radius is 16px (${radii.join(', ')})`);
}
async function filters(page) {
  await load(page,'cabinet','cabinet-feed-insights');
  for(const [key,value] of [['insights','Новый'],['tasks','Новая'],['paths','Подтверждён'],['processes','Подтверждён']]){
    const button=page.locator(`#cabinet-filter-${key}`);await button.scrollIntoViewIfNeeded();await page.mouse.move(1,1);await paint(page);
    const initial=await buttonStyle(button);neutral(initial,`${key} default`);
    await button.hover();const hovered=await buttonStyle(button);neutral(hovered,`${key} hover`);
    check(hovered.filter!==initial.filter,`${key}: hover changes the icon filter from gray to Text Black`);
    await page.mouse.down();neutral(await buttonStyle(button),`${key} pressed`);await page.mouse.up();
    await page.locator('.cabinet-menu').waitFor();
    check(await button.getAttribute('aria-expanded')==='true',`${key}: filter still opens`);
    neutral(await buttonStyle(button),`${key} expanded`);
    await radius(page,'.cabinet-menu',`${key} filter`);
    await page.locator('.cabinet-menu').getByRole('menuitemradio',{name:value,exact:true}).click();
    check(await button.evaluate(element=>element.classList.contains('has-filter')),`${key}: chosen filter is retained`);
    neutral(await buttonStyle(button),`${key} has-filter`);
    await page.locator('.cabinet-menu [data-clear]').click();await page.keyboard.press('Escape');
    await page.locator('#cabinet-heading-insights').click({position:{x:1,y:1}});
  }
  console.log('CHECKED — filter default/hover/pressed/expanded/selected visuals, functional opening and 16px menus');
}
async function sharedMenus(page) {
  await load(page,'main','results');
  await page.locator('#block-select-input').click();await page.locator('#block-select-list').waitFor();
  await radius(page,'#block-select-list','Registry select');await page.keyboard.press('Escape');
  const card=page.locator('#results .entity-card[data-record]').first();await card.hover();await card.locator('[data-menu]').click();
  await page.locator('.action-menu').waitFor();await radius(page,'.action-menu','Registry action menu');await page.keyboard.press('Escape');
  await card.locator('[data-detail]').click();
  await page.waitForFunction(()=>{const drawer=document.getElementById('process-drawer');return drawer?.open&&!drawer.classList.contains('pd-is-loading')&&!drawer.querySelector('.pd-main')?.inert;});
  await page.locator('#process-drawer .pd-data-filter summary').first().click();
  await radius(page,'#process-drawer .pd-data-filter[open] .pd-data-filter-popup','Drawer data filter');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
  console.log('CHECKED — registry select/action and shared drawer filter 16px menus');
}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],resourceFailures=[];
  try{
    const context=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce',offline:embedded});
    await context.addInitScript(()=>localStorage.setItem('bpm-registry-menu','expanded'));
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('requestfailed',request=>resourceFailures.push(`${request.url().slice(0,150)}: ${request.failure()?.errorText}`));
    page.on('response',response=>{if(response.status()>=400)resourceFailures.push(`${response.status()} ${response.url()}`);});
    const groups=[home,leftColumn,mobileColumns,dualExpansion,conditionalScroll,registry,tasks,filters,sharedMenus],requested=process.argv.slice(2);
    assert.ok(requested.every(name=>groups.some(group=>group.name===name)),'Every requested group exists');
    for(const group of groups.filter(group=>!requested.length||requested.includes(group.name))){
      try{await group(page);}catch(error){failures.push(`${group.name}: ${error.stack||error}`);console.error(`FAIL — ${group.name}: ${error.message}`);await page.screenshot({path:path.join(output,`${group.name}-failure.png`)}).catch(()=>{});}
    }
    check(!errors.length,`No browser errors: ${[...new Set(errors)].join('; ')}`);
    check(!resourceFailures.length,`No resource failures: ${[...new Set(resourceFailures)].join('; ')}`);
    fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(measurements,null,2));
    if(failures.length)throw new Error(failures.join('\n'));
    console.log(`PASS — ${embedded?'offline standalone':'source'} card layout and filter checks; ${measurements.length} grid measurements`);
  }finally{await browser.close();console.log(`Artifacts: ${output}`);}
})().catch(error=>{console.error(error);process.exitCode=1;});

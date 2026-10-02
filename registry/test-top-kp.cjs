/* ТОП-КП integration, source identity, shared card geometry and keyboard checks.
 * node registry/test-top-kp.cjs [URL|standalone.html]
 * BPM_TOP_KP_URL / BPM_TOP_KP_FILE select source or an isolated standalone.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const requested = process.env.BPM_TOP_KP_URL || process.env.BPM_TOP_KP_FILE || process.argv[2] || 'http://127.0.0.1:8765/registry/index.html';
const source = /^(https?:|file:)/.test(requested) ? requested : pathToFileURL(path.resolve(requested)).href;
const base = source.split('#')[0];
const output = process.env.BPM_TOP_KP_OUTPUT || '/private/tmp/bpm-top-kp-qa';
const viewports = [[320,844],[390,844],[768,1024],[1024,768],[1280,920],[1440,920],[1600,1000],[1920,920],[1920,1080],[2046,1107],[2047,1107],[2048,1107],[2560,920],[2560,1440],[3200,1800],[3840,920],[3840,2160],[3840,1920]];
const cardTiers = {
  compact:{height:36,font:'9px',lineHeight:'12px',code:false,textTransform:'uppercase'},
  small:{height:48,font:'13px',lineHeight:'18px',code:false,textTransform:'none'},
  regular:{height:60,font:'13px',lineHeight:'18px',code:true,textTransform:'none'},
  large:{height:72,font:'17px',lineHeight:'24px',code:true,textTransform:'none'}
};
const supportingGroups=new Set(['K10','L10','M10','N10','O10','P10','Q10','R10','S10']);
function headingStyles(root) {
  const style=element=>{const s=getComputedStyle(element);return {font:s.fontSize,line:s.lineHeight,weight:s.fontWeight,whiteSpace:s.whiteSpace,transform:s.textTransform,background:s.backgroundImage,radius:s.borderRadius,top:s.borderTopWidth,bottom:s.borderBottomWidth,borderColor:s.borderTopColor,padding:s.padding};};
  const panel=getComputedStyle(root),heading=getComputedStyle(root.querySelector('.top-kp-heading'));
  const titleBottom=root.querySelector('.top-kp-title-row').getBoundingClientRect().bottom,toolbarBottom=root.querySelector('.top-kp-filter-toolbar').getBoundingClientRect().bottom;
  return {viewportHeight:innerHeight,spacing:root.dataset.spacing,padding:panel.padding,containerWidth:root.clientWidth-parseFloat(panel.paddingLeft)-parseFloat(panel.paddingRight),headingHeight:heading.minHeight,headingMargin:heading.marginBottom,headingGap:heading.gap,headingDirection:heading.flexDirection,filterCounts:[...root.querySelectorAll('.top-kp-filter-group')].map(group=>group.querySelectorAll('.top-kp-filter').length),fieldHeights:[...root.querySelectorAll('.top-kp-filter .field')].map(field=>getComputedStyle(field).height),legendInTitle:!!root.querySelector('.top-kp-title-row .top-kp-legend'),captionGaps:[...root.querySelectorAll('.top-kp-filter-caption')].map(caption=>({fromTitle:caption.getBoundingClientRect().top-titleBottom,toField:caption.parentElement.querySelector('.field').getBoundingClientRect().top-caption.getBoundingClientRect().bottom,top:getComputedStyle(caption).top,parentPadding:getComputedStyle(caption.parentElement).paddingTop})),filtersToMap:root.querySelector('.top-kp-map').getBoundingClientRect().top-toolbarBottom,h1:style(root.querySelector('h1')),h2:[...root.querySelectorAll('.top-kp-block>h2')].map(style),h3:[...root.querySelectorAll('.top-kp-department>h3')].map(el=>({cell:el.parentElement.dataset.sourceCategory,...style(el)})),groups:[...root.querySelectorAll('.top-kp-group')].map(el=>({cell:el.dataset.sourceCategory,gap:getComputedStyle(el).gap,padding:getComputedStyle(el).padding,title:style(el.querySelector('h4'))}))};
}
function assertHeadingStyles(styles,width) {
  const compact=styles.spacing==='compact';assert.ok(['compact','design'].includes(styles.spacing));if(compact)assert.ok(width>=1280,'Compact vertical padding is a desktop height fallback only');
  const shortDesktop=width>=1280&&styles.viewportHeight<=960,expectedGap=compact?(shortDesktop?12:16):24;
  assert.equal(styles.padding,width<768?'16px 12px':compact?(shortDesktop?'16px 24px 8px':'16px 24px'):'24px');assert.equal(styles.headingHeight,'auto');assert.equal(styles.headingMargin,compact?'16px':'24px');assert.equal(styles.headingGap,`${expectedGap}px`);assert.equal(styles.headingDirection,'column');
  const smallTitle=width<768||styles.containerWidth<=450;
  assert.equal(styles.h1.font,smallTitle?'22px':'26px');assert.equal(styles.h1.line,smallTitle?'26px':'31px');assert.equal(styles.h1.weight,'700');
  assert.equal(styles.legendInTitle,true);assert.deepEqual(styles.filterCounts,[2,1,4,3]);assert.equal(styles.fieldHeights.length,10);assert.ok(styles.fieldHeights.every(height=>height==='50px'));
  assert.equal(styles.captionGaps.length,3);for(const caption of styles.captionGaps){assert.equal(caption.top,'0px');assert.equal(caption.parentPadding,'16px');assert.ok(caption.fromTitle>=expectedGap-.1,'Filter captions must not consume the title gap');assert.ok(Math.abs(caption.toField-4)<.1,'The caption retains 4px before its field');}assert.ok(styles.filtersToMap>=(compact?16:24)-.1,'Filters must retain a separate gap before the map');
  for(const h of styles.h2){assert.equal(h.font,'26px');assert.equal(h.line,'31px');assert.equal(h.weight,'400');assert.equal(h.whiteSpace,'nowrap');}
  for(const h of styles.h3){const major=h.cell==='A21';assert.equal(h.font,major?'26px':'13px');assert.equal(h.line,major?'31px':'18px');assert.equal(h.weight,'400');assert.equal(h.background,'none');assert.equal(h.radius,'0px');assert.equal(h.top,major?'0px':'1px');assert.equal(h.bottom,major?'0px':'1px');if(!major){assert.equal(h.borderColor,'rgba(26, 26, 26, 0.2)');assert.equal(h.padding,'4px 8px 4px 2px');}}
  for(const group of styles.groups){const left=['L2','M2','C11','D11'].includes(group.cell);assert.equal(group.padding,compact?(left?'4px 8px':'4px 8px 4px 0px'):(left?'8px':'8px 8px 8px 0px'),group.cell);assert.equal(group.gap,compact?'4px':supportingGroups.has(group.cell)||['A2','B2','D2','G11'].includes(group.cell)?'10px':'8px',group.cell);assert.equal(group.title.font,'9px');assert.equal(group.title.line,'12px');assert.equal(group.title.weight,group.cell==='D11'?'400':'510');assert.equal(group.title.transform,'uppercase');assert.equal(group.title.whiteSpace,'nowrap');}
}
const failures = [], measurements = [];
const check = (name, callback) => {
  try {callback(); console.log(`PASS ${name}`);}
  catch (error) {failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name}: ${error.message}`);}
};
const paint = page => page.evaluate(async () => {
  await document.fonts.ready;
  // Height-aware packing and its ResizeObserver correction must settle before
  // collecting geometry, especially when only the viewport height changes.
  for(let frame=0;frame<5;frame++) await new Promise(requestAnimationFrame);
});
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('#top-kp-panel')?.hidden && document.querySelectorAll('.top-kp-card').length === 136);
  await paint(page);
}
async function route(page, hash) {
  await page.evaluate(hash => {location.hash = hash;}, hash);
  await paint(page);
}
async function loadedDrawer(page) {
  await page.waitForFunction(() => {
    const drawer = document.querySelector('#process-drawer');
    return drawer?.open && drawer.dataset.pdEntity === 'paths' && !drawer.classList.contains('pd-is-loading') && !drawer.querySelector('.pd-main')?.inert;
  });
}

async function main() {
  fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
  const errors = [], failedResources = [];
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if(message.type()==='error')errors.push(message.text());});
    page.on('requestfailed', request => failedResources.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => {if(response.status()>=400)failedResources.push(`${response.status()} ${response.url()}`);});
  });
  try {
    const page = await context.newPage();
    await page.goto(`${base}#top-kp`);
    await ready(page);
    const sourceData = await page.evaluate(() => {
      const data = window.BPM_TOP_KP, root = document.querySelector('#top-kp-panel');
      const leaves = [...root.querySelectorAll('.top-kp-card')].map(card => ({id:card.dataset.topKpId,title:card.querySelector('.top-kp-card-title').textContent,band:card.dataset.band,code:card.querySelector('.top-kp-card-code')?.textContent}));
      const groups=[];
      for(const block of data.blocks) {
        const el=root.querySelector(`[data-source-category="${block.sourceCell}"]`);
        groups.push({type:'block',cell:block.sourceCell,name:block.name,visibleName:el?.querySelector('h2,h3,h4')?.textContent,count:el?.querySelectorAll('.top-kp-card').length,expected:block.departments.flatMap(d=>d.groups.flatMap(g=>g.cards)).length});
        for(const department of block.departments) {
          const el=root.querySelector(`[data-source-category="${department.sourceCell}"]`);
          groups.push({type:'department',cell:department.sourceCell,name:department.name,visibleName:el?.querySelector('h2,h3,h4')?.textContent,count:el?.querySelectorAll('.top-kp-card').length,expected:department.groups.flatMap(g=>g.cards).length});
          for(const group of department.groups.filter(g=>g.sourceCell)) {
            const el=root.querySelector(`[data-source-category="${group.sourceCell}"]`);
            groups.push({type:'group',cell:group.sourceCell,name:group.name,visibleName:el?.querySelector('h2,h3,h4')?.textContent,count:el?.querySelectorAll('.top-kp-card').length,expected:group.cards.length});
          }
        }
      }
      return {records:data.records.map(r=>({id:r.id,title:r.title,sourceName:r.sourceName,source:r.source,sourceCell:r.sourceCell,efficiency:r.efficiency,sourceCode:r.code||null,demoCode:window.BpmTopKpIdentifiers.codeFor(r)})),leaves,groups,blockCount:data.blocks.length,departmentCount:data.blocks.flatMap(b=>b.departments).length,domBlockCount:root.querySelectorAll('.top-kp-block').length};
    });
    check('136 unique Excel-based cards',()=>{
      assert.equal(sourceData.records.length,136);assert.equal(sourceData.leaves.length,136);
      assert.equal(new Set(sourceData.leaves.map(r=>r.id)).size,136);
      const actual=new Map(sourceData.leaves.map(r=>[r.id,r.title]));
      for(const record of sourceData.records) {
        assert.equal(actual.get(record.id),record.title,record.sourceCell);
        assert.equal(record.source,'top-kp');assert.equal(record.efficiency,null,'Workbook has no efficiency values');
      }
    });
    check('5 blocks, 23 departments and exact rendered group membership',()=>{
      assert.equal(sourceData.blockCount,5);assert.equal(sourceData.domBlockCount,5);assert.equal(sourceData.departmentCount,23);
      for(const group of sourceData.groups) {
        assert.equal(group.visibleName,group.name,`${group.type} ${group.cell} heading`);
        assert.equal(group.count,group.expected,`${group.type} ${group.cell} membership`);
      }
    });
    check('136 unique stable demo IDs populate cards without changing workbook codes',()=>{
      assert.equal(new Set(sourceData.records.map(record=>record.demoCode)).size,136);
      const actual=new Map(sourceData.leaves.map(card=>[card.id,card.code]));
      for(const record of sourceData.records){assert.equal(record.sourceCode,null);assert.match(record.demoCode,/^КП\d{4}$/);assert.equal(actual.get(record.id),record.demoCode);}
    });
    check('All four efficiency border categories',()=>assert.deepEqual([...new Set(sourceData.leaves.map(r=>r.band))].sort(),['gray','green','red','yellow']));
    const boundaries=await page.evaluate(()=>[null,0,45,45.1,65,65.1,85,85.1,100].map(window.BpmTopKp.band));
    check('Methodology boundaries start the next band at 45/65/85',()=>assert.deepEqual(boundaries,['none','red','yellow','yellow','gray','gray','green','green','green']));
    const palette = await page.locator('.top-kp-card').evaluateAll(cards => Object.fromEntries(cards.map(card=>[card.dataset.band,getComputedStyle(card).borderTopColor])));
    check('Efficiency colors match established palette',()=>assert.deepEqual(palette,{green:'rgb(52, 199, 89)',gray:'rgb(127, 127, 127)',yellow:'rgb(255, 204, 0)',red:'rgb(255, 56, 60)'}));

    for(const [width,height] of viewports) {
      await page.setViewportSize({width,height});await page.mouse.move(width-1,1);await paint(page);
      const result=await page.evaluate(() => {
        const root=document.querySelector('#top-kp-panel'), map=root.querySelector('.top-kp-map'), viewport=root.querySelector('.top-kp-map-viewport'), rect=root.getBoundingClientRect();
        const cards=[...root.querySelectorAll('.top-kp-card')],cardWidths=cards.map(c=>c.getBoundingClientRect().width);
        const main = root.parentElement, mainStyle = getComputedStyle(main), titleStyles=getComputedStyle(cards[0].querySelector('.top-kp-card-title'));
        const codes=cards.map(card=>({card,code:card.querySelector('.top-kp-card-code'),title:card.querySelector('.top-kp-card-title')}));
        const cardGaps=[...root.querySelectorAll('.top-kp-cards')].map(grid=>({cell:grid.parentElement.dataset.sourceCategory,row:getComputedStyle(grid).rowGap,column:getComputedStyle(grid).columnGap}));
        const groupGaps=[...root.querySelectorAll('.top-kp-row,.top-kp-stack,.top-kp-map')].filter(group=>group.children.length>1).map(group=>({gap:getComputedStyle(group).gap,topBlocks:group.classList.contains('top-kp-row')&&[...group.children].every(child=>child.classList.contains('top-kp-block'))}));
        const physicalCardGaps=[];
        for(const grid of root.querySelectorAll('.top-kp-cards')) {
          const boxes=[...grid.children].map(card=>card.getBoundingClientRect());
          for(let i=1;i<boxes.length;i++) {
            const previous=boxes[i-1],current=boxes[i];
            if(Math.abs(current.top-previous.top)<.1) physicalCardGaps.push({cell:grid.parentElement.dataset.sourceCategory,gap:current.left-previous.right});
            else {const above=boxes.slice(0,i).reverse().find(box=>Math.abs(box.left-current.left)<.1);if(above)physicalCardGaps.push({cell:grid.parentElement.dataset.sourceCategory,gap:current.top-above.bottom});}
          }
        }
        return {viewport:innerWidth,screenHeight:innerHeight,body:document.body.scrollWidth,document:document.documentElement.scrollWidth,panelWidth:rect.width,panelHeight:rect.height,availableWidth:main.clientWidth-parseFloat(mainStyle.paddingLeft)-parseFloat(mainStyle.paddingRight),cardMin:Math.min(...cardWidths),cardMax:Math.max(...cardWidths),cardHeight:cards[0].getBoundingClientRect().height,fontSize:titleStyles.fontSize,lineHeight:titleStyles.lineHeight,textTransform:titleStyles.textTransform,titleClamp:titleStyles.webkitLineClamp,radii:[...new Set(cards.map(card=>getComputedStyle(card).borderRadius))],cardGaps,groupGaps,physicalCardGaps,visibleCodes:codes.filter(({code})=>code&&getComputedStyle(code).display!=='none').length,codesAboveTitle:codes.filter(({code,title})=>code&&getComputedStyle(code).display!=='none'&&code.getBoundingClientRect().bottom<=title.getBoundingClientRect().top+.1).length,codeFonts:[...new Set(codes.filter(({code})=>code).map(({code})=>`${getComputedStyle(code).fontSize}/${getComputedStyle(code).lineHeight}`))],titleWidth:cards[0].querySelector('.top-kp-card-title').getBoundingClientRect().width,density:root.dataset.density,mapWidth:map.scrollWidth,mapHeight:map.scrollHeight,viewportWidth:viewport.clientWidth,viewportHeight:viewport.clientHeight,viewportScrollWidth:viewport.scrollWidth,viewportScrollHeight:viewport.scrollHeight,count:cards.length,clippedCards:cards.filter(card=>card.scrollWidth>card.clientWidth+1).length,leaves:cards.map(card=>({id:card.dataset.topKpId,title:card.querySelector('.top-kp-card-title').textContent}))};
      });
      const leaves = result.leaves; delete result.leaves;
      measurements.push(result);
      const {cardGaps,groupGaps,physicalCardGaps,...compactMeasurement}=result;
      console.log(`MEASURE ${JSON.stringify(compactMeasurement)}`);
      check(`${width}×${height} globally uniform width and exact source completeness`,()=>{
        assert.equal(result.count,136);assert.ok(result.cardMax-result.cardMin<=.1,`${result.cardMin}–${result.cardMax}`);
        assert.deepEqual([...leaves].sort((a,b)=>a.id.localeCompare(b.id)), sourceData.records.map(({id,title})=>({id,title})).sort((a,b)=>a.id.localeCompare(b.id)));
      });
      check(`${width}px no body horizontal overflow`,()=>{assert.ok(result.body<=width+1);assert.ok(result.document<=width+1);});
      check(`${width}px no inner horizontal overflow`,()=>assert.ok(result.viewportScrollWidth<=result.viewportWidth+1,`${result.viewportScrollWidth} / ${result.viewportWidth}`));
      check(`${width}px panel fills available main width`,()=>assert.ok(Math.abs(result.panelWidth-result.availableWidth)<=1,`${result.panelWidth} / ${result.availableWidth}`));
      if(width<=1440)check(`${width}px compact map retains 920px height cap`,()=>assert.ok(result.panelHeight<=920.1,`height ${result.panelHeight}`));
      if(width>=1280)check(`${width}×${height} full map fits without inner scrolling`,()=>assert.ok(result.viewportScrollHeight<=result.viewportHeight+1,`${result.viewportScrollHeight} / ${result.viewportHeight}`));
      if(width>=1280) {
        const fit=await page.locator('#top-kp-panel').evaluate(root=>({bottom:root.getBoundingClientRect().bottom+scrollY,floors:root.querySelector('.top-kp-map').children.length,fit:root.dataset.fit}));
        check(`${width}×${height} all three map floors fit the desktop viewport`,()=>{assert.equal(fit.floors,3);assert.equal(fit.fit,'true');assert.ok(fit.bottom<=height+1,`${fit.bottom} / ${height}`);});
      }
      check(`${width}×${height} card matches its exact Figma adaptive variant`,()=>{
        const expected=cardTiers[result.density];assert.ok(expected,`Unknown tier ${result.density}`);
        assert.equal(result.fontSize,expected.font);assert.equal(result.lineHeight,expected.lineHeight);
        assert.ok(Math.abs(result.cardHeight-expected.height)<.1,`${result.cardHeight} / ${expected.height}`);
        assert.equal(result.textTransform,expected.textTransform);assert.equal(result.titleClamp,'2');
        assert.deepEqual(result.radii,['8px']);assert.deepEqual(result.codeFonts,['9px/12px']);
        assert.equal(result.visibleCodes,expected.code?136:0);assert.equal(result.codesAboveTitle,result.visibleCodes);
      });
      const displayedIds=await page.locator('.top-kp-card').evaluateAll(cards=>cards.map(card=>({id:card.dataset.topKpId,code:card.querySelector('.top-kp-card-code')?.textContent})));
      check(`${width}×${height} card IDs remain stable through adaptive reflow`,()=>assert.deepEqual(displayedIds.sort((a,b)=>a.id.localeCompare(b.id)),sourceData.records.map(record=>({id:record.id,code:record.demoCode})).sort((a,b)=>a.id.localeCompare(b.id))));
      check(`${width}×${height} updated Figma card and container spacing`,()=>{
        assert.ok(result.cardGaps.every(gap=>gap.row==='4px'&&gap.column==='4px'));
        assert.ok(result.physicalCardGaps.length>0);assert.ok(result.physicalCardGaps.every(({gap})=>Math.abs(gap-4)<.15),JSON.stringify(result.physicalCardGaps));
        assert.ok(result.groupGaps.length>0);assert.ok(result.groupGaps.every(({gap,topBlocks})=>gap===(topBlocks?'16px':'8px')),JSON.stringify(result.groupGaps));
      });
      const typography=await page.locator('#top-kp-panel').evaluate(headingStyles);
      check(`${width}×${height} updated Figma headers, dividers and panel/group padding`,()=>assertHeadingStyles(typography,width));
      const borders=await page.locator('.top-kp-card').evaluateAll(cards=>[...new Set(cards.map(card=>{const style=getComputedStyle(card);return [style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth].join('/');}))]);
      check(`${width}×${height} all four card borders stay 2px`,()=>assert.deepEqual(borders,['2px/2px/2px/2px']));
      const safety=await page.locator('#top-kp-panel').evaluate(root=>{
        const cards=[...root.querySelectorAll('.top-kp-card')].map(card=>({id:card.dataset.topKpId,rect:card.getBoundingClientRect()})),overlaps=[];
        for(let a=0;a<cards.length;a++)for(let b=a+1;b<cards.length;b++) {
          const x=Math.min(cards[a].rect.right,cards[b].rect.right)-Math.max(cards[a].rect.left,cards[b].rect.left),y=Math.min(cards[a].rect.bottom,cards[b].rect.bottom)-Math.max(cards[a].rect.top,cards[b].rect.top);
          if(x>.1&&y>.1)overlaps.push([cards[a].id,cards[b].id]);
        }
        const groups=[...root.querySelectorAll('.top-kp-group')];
        return {overlaps,padding:[...new Set(groups.map(group=>getComputedStyle(group).padding))],overflow:groups.filter(group=>{const r=group.getBoundingClientRect(),p=group.parentElement.getBoundingClientRect();return r.left<p.left-.2||r.right>p.right+.2;}).map(group=>group.dataset.sourceCategory)};
      });
      check(`${width}×${height} cards never overlap and groups fit their real parent`,()=>{assert.deepEqual(safety.overlaps,[]);assert.deepEqual(safety.overflow,[]);});
      if([3840,2560,2047,1920,1440,390,320].includes(width))await page.screenshot({path:path.join(output,`top-kp-${width}x${height}.png`),fullPage:true});
    }
    check('Desktop cards and panel grow through 4K rather than retaining the 1440 cap',()=>{
      const compact=measurements.find(item=>item.viewport===1440),desktop=measurements.find(item=>item.viewport===1920&&item.screenHeight===1080),fourK=measurements.find(item=>item.viewport===3840&&item.screenHeight===2160);
      assert.ok(desktop.panelWidth>1440);assert.ok(fourK.panelWidth>desktop.panelWidth);
      assert.ok(desktop.cardMin>compact.cardMin);assert.ok(fourK.cardMin>desktop.cardMin);
      assert.ok(fourK.titleWidth>desktop.titleWidth&&desktop.titleWidth>compact.titleWidth,'Wider cards expose more of the original two-line title');
      assert.ok(fourK.visibleCodes>0,'Wide adaptive cards expose the ID row');
    });

    for(const width of [1440,1920])for(const mode of ['expanded','collapsed']) {
      const menuPage=await context.newPage();
      try {
        await menuPage.setViewportSize({width,height:920});
        await menuPage.addInitScript(mode=>localStorage.setItem('bpm-registry-menu',mode),mode);
        await menuPage.goto(`${base}#top-kp`);await ready(menuPage);
        const fitted=await menuPage.locator('#top-kp-panel').evaluate(root=>{
          const cards=[...root.querySelectorAll('.top-kp-card')].map(card=>card.getBoundingClientRect());let overlaps=0;
          for(let a=0;a<cards.length;a++)for(let b=a+1;b<cards.length;b++)if(Math.min(cards[a].right,cards[b].right)-Math.max(cards[a].left,cards[b].left)>.1&&Math.min(cards[a].bottom,cards[b].bottom)-Math.max(cards[a].top,cards[b].top)>.1)overlaps++;
          const view=root.querySelector('.top-kp-map-viewport');
          return {fit:root.dataset.fit,bottom:root.getBoundingClientRect().bottom+scrollY,overlaps,overflow:view.scrollHeight-view.clientHeight,collapsed:document.body.classList.contains('menu-collapsed')};
        });
        check(`${width}×920 ${mode} menu: three floors fit without overlapping cards`,()=>{assert.equal(fitted.collapsed,mode==='collapsed');assert.equal(fitted.fit,'true');assert.ok(fitted.bottom<=921,`map bottom ${fitted.bottom}`);assert.ok(fitted.overflow<=1,`inner overflow ${fitted.overflow}`);assert.equal(fitted.overlaps,0);});
        const typography=await menuPage.locator('#top-kp-panel').evaluate(headingStyles);
        check(`${width}×920 ${mode} menu: new typography survives compact height fallback`,()=>assertHeadingStyles(typography,width));
        await menuPage.screenshot({path:path.join(output,`top-kp-${width}x920-${mode}.png`),fullPage:true});
      } finally {await menuPage.close();}
    }

    await page.setViewportSize({width:1920,height:1080});await paint(page);
    const first=page.locator('.top-kp-card').first(),firstId=await first.getAttribute('data-top-kp-id'),firstRecord=sourceData.records.find(r=>r.id===firstId),firstTitle=firstRecord.title;
    await first.hover();await page.locator('.top-kp-hover').waitFor();
    check('Hover exposes the full source title',()=>{});
    assert.equal(await page.locator('.top-kp-hover strong').textContent(),firstTitle);
    assert.equal((await page.locator('.top-kp-hover [data-top-copy]').innerText()).trim(),firstRecord.demoCode);
    await page.evaluate(()=>{window.__topIdCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.__topIdCopies.push(value)}});});
    await page.locator('.top-kp-hover [data-top-copy]').click();
    assert.deepEqual(await page.evaluate(()=>window.__topIdCopies),[firstRecord.demoCode]);
    assert.equal(await page.locator('#process-drawer[open]').count(),0,'Copying a demo ID does not open the drawer');
    await page.screenshot({path:path.join(output,'top-kp-demo-id-tooltip.png')});
    await page.mouse.move(1900,1);await first.focus();await page.keyboard.press('Enter');
    await loadedDrawer(page);
    const drawer=page.locator('#process-drawer');
    assert.equal(await drawer.locator('#pd-title').textContent(),firstTitle);
    assert.equal(await page.locator('#top-kp-detail').count(),0,'Deprecated custom TOP modal is not created');
    const expectedEfficiency=await page.evaluate(id=>window.BpmTopKp.score(window.BPM_TOP_KP.records.find(record=>record.id===id)),firstId);
    assert.equal(Number((await drawer.locator('.jd-widget .pd-widget-value').innerText()).replace('%','').replace(',','.').trim()),expectedEfficiency);
    assert.equal(await drawer.locator('#jd-included-processes .jd-process-card').count(),0,'Missing Excel process relationships are not replaced by fixtures');
    const drawerCopy=drawer.locator('.pd-heading-labels [data-pd-action="copy"]');
    assert.equal(await drawerCopy.count(),1,'The authorized demo ID can be copied');
    assert.equal((await drawerCopy.innerText()).trim(),firstRecord.demoCode);
    assert.equal(await drawerCopy.getAttribute('data-pd-copy'),firstRecord.demoCode);
    await drawerCopy.click();assert.deepEqual(await page.evaluate(()=>window.__topIdCopies),[firstRecord.demoCode,firstRecord.demoCode]);
    await page.screenshot({path:path.join(output,'top-kp-demo-id-drawer.png')});
    for(const anchor of ['about','assessment','benchmark','additional']) {
      assert.equal(await drawer.locator(`#pd-${anchor}`).count(),1);
      await drawer.locator(`[data-pd-anchor="${anchor}"]`).click();
      await page.waitForTimeout(100);
      assert.equal(await drawer.locator(`[data-pd-anchor="${anchor}"]`).getAttribute('aria-current'),'location');
    }
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__topShareLink=value;}}}));
    await drawer.locator('[data-pd-action="share"]').click();
    assert.equal(await page.evaluate(()=>window.__topShareLink),`${base}#journey=${encodeURIComponent(firstId)}`);
    await page.keyboard.press('Escape');await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
    assert.equal(await first.evaluate(el=>el===document.activeElement),true);
    console.log('PASS keyboard opens the standard КП drawer, shared efficiency, anchors and share; Escape restores card focus');
    await first.focus();await page.keyboard.press('Space');await loadedDrawer(page);
    await drawer.locator('[data-pd-action="close"]').click();
    await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
    assert.equal(await first.evaluate(el=>el===document.activeElement),true);
    console.log('PASS Space and explicit Close return focus');

    await route(page,'#main');await page.waitForFunction(()=>document.querySelector('#results')?.getAttribute('aria-busy')==='false');
    await page.locator('#structure-toggle').click();await page.waitForFunction(()=>document.body.classList.contains('structure-mode'));
    const registrySourceCount=await page.evaluate(()=>window.BPM_DATA.length);
    await page.locator('#top-paths').click();await ready(page);
    assert.equal(await page.locator('#top-paths').getAttribute('aria-current'),'page');
    assert.equal(await page.locator('#registry-panel').isVisible(),false);
    await page.locator('#tasks-nav').click();await page.locator('#tasks-panel').waitFor({state:'visible'});
    await page.locator('#cabinet-nav').click();await page.locator('#cabinet-panel').waitFor({state:'visible'});
    await route(page,'#main');await page.waitForFunction(()=>document.body.classList.contains('structure-mode')&&!document.querySelector('#registry-panel').hidden);
    assert.equal(await page.evaluate(()=>window.BPM_DATA.length),registrySourceCount);
    await route(page,'#top-kp');await ready(page);
    assert.equal(await page.title(),'ТОП-КП — Sber BPM');
    assert.equal(await page.locator('#main').getAttribute('aria-labelledby'),'top-kp-title');
    assert.equal(await page.locator('.navigation [aria-current="page"]').count(),1);
    console.log('PASS section navigation preserves structure, registry data and current item');

    await page.goto(`${base}#journey=${encodeURIComponent(firstId)}`);
    await loadedDrawer(page);await ready(page);
    assert.equal(await page.locator('#pd-title').textContent(),firstTitle);
    assert.equal((await page.locator('#process-drawer .pd-heading-labels .pd-id-badge').innerText()).trim(),firstRecord.demoCode);
    assert.equal(await page.locator('#top-paths').getAttribute('aria-current'),'page');
    assert.equal(await page.locator('#top-kp-detail').count(),0);
    await page.keyboard.press('Escape');
    console.log('PASS reloaded shared hash reopens TOP section and correct source-based detail');
    check('No console/page errors',()=>assert.deepEqual(errors,[]));
    check('No failed/missing resources',()=>assert.deepEqual(failedResources,[]));
    fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({source:base,measurements,failures,errors,failedResources},null,2));
    assert.deepEqual(failures,[],`${failures.length} TOP checks failed; see ${output}`);
    console.log(`PASS TOP-КП suite. Screenshots and measurements: ${output}`);
  } finally {await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

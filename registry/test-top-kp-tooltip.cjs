/* Figma 204:2915: interactive TOP-КП hover card and pointer/keyboard lifecycle.
 * node test-top-kp-tooltip.cjs [absolute/standalone.html]
 * An optional standalone is copied alone, renamed and tested without network. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BPM_PLAYWRIGHT||'/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const standalone=process.argv[2];
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-top-tooltip-'));
let file=path.join(__dirname,'index.html');
if(standalone){assert(path.isAbsolute(standalone));file=path.join(output,'renamed-offline.html');fs.copyFileSync(standalone,file);}
const base=pathToFileURL(file).href;
const near=(actual,expected,label,tolerance=.2)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} vs ${expected}`);
const report=label=>console.log(`PASS — ${label}`);
const tip=page=>page.locator('#top-kp-tooltip');
const paint=page=>page.evaluate(async()=>{await document.fonts.ready;for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);});
async function ready(page){await page.waitForFunction(()=>!document.querySelector('#top-kp-panel')?.hidden&&document.querySelectorAll('.top-kp-card').length===136);await paint(page);}
async function noTip(page,label){await tip(page).waitFor({state:'hidden'});assert.equal(await page.locator('.top-kp-card[aria-controls="top-kp-tooltip"]').count(),0,`${label}: stale aria-controls removed`);}
async function hover(page,card){await page.mouse.move(1,1);await card.scrollIntoViewIfNeeded();await paint(page);await card.hover();await tip(page).waitFor();await paint(page);}
async function recordFor(page,card){const id=await card.getAttribute('data-top-kp-id');return page.evaluate(id=>{const row=window.BPM_TOP_KP.records.find(row=>row.id===id);return {id,title:row.title,path:[row.block,row.division,row.group].filter(Boolean).join(' / '),code:window.BpmTopKpIdentifiers.codeFor(row),sourceCode:row.code||null,score:window.BpmTopKp.score(row),band:window.BpmTopKp.band(window.BpmTopKp.score(row))};},id);}
function snapshot(root){
  const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const style=el=>{const s=getComputedStyle(el);return {font:s.fontSize,line:s.lineHeight,weight:s.fontWeight,color:s.color,padding:s.padding,radius:s.borderRadius,background:s.backgroundColor,gap:s.gap,overflow:s.overflow,textOverflow:s.textOverflow,clamp:s.webkitLineClamp};};
  const bubble=root.querySelector('.top-kp-hover-bubble'),title=root.querySelector('strong'),hierarchy=root.querySelector('.top-kp-hover-path'),badge=root.querySelector('[data-top-copy]'),arrow=root.querySelector('.top-kp-hover-arrow'),glyph=root.querySelector('.efficiency-glyph');
  const trigger=document.querySelector('.top-kp-card[aria-controls="top-kp-tooltip"]');
  return {root:box(root),bubble:box(bubble),bubbleStyle:style(bubble),title:style(title),titleHeight:title.clientHeight,titleScrollHeight:title.scrollHeight,path:style(hierarchy),pathHeight:hierarchy.clientHeight,pathScrollHeight:hierarchy.scrollHeight,badge:box(badge),badgeStyle:style(badge),copyIcon:box(badge.querySelector('img')),arrow:box(arrow),arrowNatural:{width:arrow.naturalWidth,height:arrow.naturalHeight},glyph:box(glyph),number:style(root.querySelector('.efficiency-number')),percent:style(root.querySelector('.percent')),trigger:box(trigger),placement:root.dataset.placement,viewport:{width:innerWidth,height:innerHeight}};
}
async function verify(page,card,label){
  const data=await recordFor(page,card),popover=tip(page);
  assert.equal(await popover.getAttribute('role'),'dialog');assert.equal(await popover.getAttribute('aria-modal'),'false');
  assert.equal(await popover.getAttribute('aria-labelledby'),'top-kp-tooltip-title');assert.equal(await popover.getAttribute('aria-describedby'),'top-kp-tooltip-path');
  assert.equal(await card.getAttribute('aria-controls'),'top-kp-tooltip');
  assert.equal(await popover.locator('strong').textContent(),data.title,`${label}: complete source title`);
  assert.equal(await popover.locator('.top-kp-hover-path').textContent(),data.path,`${label}: complete source hierarchy`);
  assert.equal(Number(await popover.locator('.efficiency').getAttribute('data-efficiency-percent')),data.score,`${label}: stable authorized demo efficiency`);
  assert.equal(Number(await popover.locator('.bpm-efficiency-glyph').getAttribute('data-efficiency')),data.score,`${label}: shared sphere matches score`);
  assert.equal(await popover.locator('.efficiency-sphere').count(),1);
  const copy=popover.locator('[data-top-copy]');
  assert.equal((await copy.innerText()).trim(),data.code);assert.equal(await copy.isDisabled(),false);
  if(!data.sourceCode){assert.match(data.code,/^КП\d{4}$/);assert.equal(await card.locator('.top-kp-card-code').textContent(),data.code,`${label}: card and tooltip use the same demo ID`);}
  assert.doesNotMatch(await popover.innerText(),/top-kp-sheet1-/,'Internal source keys are not shown as business IDs');
  const s=await popover.evaluate(snapshot);
  near(s.bubble.width,Math.min(363,s.viewport.width-24),`${label}: component width`);
  assert.equal(s.bubbleStyle.background,'rgb(26, 26, 26)');assert.equal(s.bubbleStyle.padding,'16px');assert.equal(s.bubbleStyle.radius,'16px');assert.equal(s.bubbleStyle.gap,'8px');
  assert.equal(s.title.font,'17px');assert.equal(s.title.line,'24px');assert.equal(s.title.weight,'590');assert.equal(s.title.color,'rgb(255, 255, 255)');assert.ok(s.titleScrollHeight<=s.titleHeight+1,`${label}: source title is never truncated`);
  assert.equal(s.path.font,'13px');assert.equal(s.path.line,'18px');assert.equal(s.path.color,'rgb(255, 255, 255)');assert.ok(s.pathScrollHeight<=s.pathHeight+1,`${label}: hierarchy is never truncated`);
  near(s.badge.height,24,`${label}: ID badge height`);assert.equal(s.badgeStyle.font,'13px');near(s.copyIcon.width,16,`${label}: copy icon width`);near(s.copyIcon.height,16,`${label}: copy icon height`);
  near(s.glyph.width,24,`${label}: sphere width`);near(s.glyph.height,24,`${label}: sphere height`);assert.equal(s.number.font,'17px');assert.equal(s.percent.font,'13px');assert.equal(s.number.weight,'400');assert.equal(s.percent.weight,'400');assert.equal(s.number.color,'rgb(255, 255, 255)');
  near(s.arrow.width,24,`${label}: arrow width`);near(s.arrow.height,8,`${label}: arrow height`);assert.deepEqual(s.arrowNatural,{width:24,height:8});
  assert.ok(s.root.x>=11.8&&s.root.right<=s.viewport.width-11.8,`${label}: horizontal viewport clamping`);
  assert.ok(s.root.y>=11.8&&s.root.bottom<=s.viewport.height-11.8,`${label}: vertical viewport clamping`);
  if(s.placement==='above'){assert.ok(s.bubble.bottom<=s.arrow.y+.2);near(s.trigger.y-s.arrow.bottom,2,`${label}: arrow tip is 2px above card`);}
  else {assert.equal(s.placement,'below');assert.ok(s.arrow.bottom<=s.bubble.y+.2);near(s.arrow.y-s.trigger.bottom,2,`${label}: arrow tip is 2px below card`);}
  return s;
}
async function drawerReady(page){await page.waitForFunction(()=>{const drawer=document.querySelector('#process-drawer');return drawer?.open&&!drawer.classList.contains('pd-is-loading')&&!drawer.querySelector('.pd-main')?.inert;});}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({offline:true,viewport:{width:1440,height:920},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[],failures=[],unexpected=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  context.on('requestfailed',request=>failures.push(`${request.url().slice(0,160)}: ${request.failure()?.errorText}`));
  context.on('request',request=>{const url=request.url();if(/^(data:|blob:)/.test(url))return;if(standalone?url.split(/[?#]/)[0]!==base:!url.startsWith('file:'))unexpected.push(url.slice(0,160));});
  try {
    await page.goto(`${base}#top-kp`);await ready(page);
    const original=await page.evaluate(()=>JSON.stringify(window.BPM_TOP_KP.records));
    for(const [width,height] of [[1440,920],[3840,2160],[390,844],[320,844]]){
      await page.setViewportSize({width,height});await paint(page);await page.mouse.move(width-1,1);
      const card=page.locator('.top-kp-card').first();await hover(page,card);await verify(page,card,`${width}×${height}`);
      await page.screenshot({path:path.join(output,`tooltip-${width}x${height}.png`)});
      await page.mouse.move(1,1);await noTip(page,'pointer leaves both');
    }
    report('Figma bubble geometry, complete title/hierarchy, consistent demo IDs, shared efficiency and responsive bounds through 4K');
    const longest=await page.evaluate(()=>[...window.BPM_TOP_KP.records].sort((a,b)=>(b.title.length+[b.block,b.division,b.group].join(' / ').length)-(a.title.length+[a.block,a.division,a.group].join(' / ').length))[0].id);
    for(const width of [320,1440]) {
      await page.setViewportSize({width,height:920});await paint(page);const longCard=page.locator(`[data-top-kp-id="${longest}"]`);
      await hover(page,longCard);await verify(page,longCard,`${width}px longest source text`);await page.screenshot({path:path.join(output,`tooltip-longest-${width}.png`)});
      await page.mouse.move(1,1);await noTip(page,'long source pointer exit');
    }
    report('Longest source title and hierarchy wrap without truncation on desktop and mobile');
    await page.setViewportSize({width:1440,height:920});await paint(page);
    for(const band of ['red','yellow','gray','green']){
      const card=page.locator(`.top-kp-card[data-band="${band}"]`).first();await hover(page,card);await verify(page,card,`${band} band`);
      const classes=await tip(page).locator('.bpm-efficiency-glyph').getAttribute('class');assert.match(classes,new RegExp(`efficiency-${band==='gray'?'blue':band}(?: |$)`));
      await tip(page).locator('.top-kp-hover-bubble').hover();await page.waitForTimeout(500);assert.equal(await tip(page).count(),1,'Pointer can move from card onto hover bubble');
      await page.mouse.move(1,1);await noTip(page,'band pointer exit');
    }
    report('All four color bands keep their score; moving onto the interactive bubble does not dismiss it');

    let card=page.locator('.top-kp-card').first();
    await card.focus();await tip(page).waitFor();await verify(page,card,'keyboard focus');
    await page.keyboard.press('Escape');await noTip(page,'Escape');assert.equal(await card.evaluate(el=>el===document.activeElement),true);
    await page.locator('.top-kp-card').nth(1).focus();await tip(page).waitFor();await noTipAfterFocusChange();
    async function noTipAfterFocusChange(){await page.locator('.brand').focus();await noTip(page,'focus left trigger and bubble');}

    const id=await card.getAttribute('data-top-kp-id');
    const demo=await recordFor(page,card);assert.match(demo.code,/^КП\d{4}$/);
    await page.evaluate(()=>{window.__tooltipDemoCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.__tooltipDemoCopies.push(value)}});});
    await hover(page,card);await tip(page).locator('[data-top-copy]').click();
    assert.deepEqual(await page.evaluate(()=>window.__tooltipDemoCopies),[demo.code]);assert.equal(await page.locator('#process-drawer[open]').count(),0);
    await page.screenshot({path:path.join(output,'tooltip-demo-id-copy.png')});
    await page.mouse.move(1,1);await page.keyboard.press('Escape');await noTip(page,'demo ID copy cleanup');
    await page.evaluate(id=>{const row=window.BPM_TOP_KP.records.find(row=>row.id===id);window.__tooltipOriginalCode={present:Object.hasOwn(row,'code'),value:row.code,efficiency:row.efficiency};row.code='КП-ТЕСТ-0123';row.efficiency=86.1;window.__tooltipCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.__tooltipCopies.push(value)}});},id);
    await hover(page,card);await verify(page,card,'explicit ID fixture');
    assert.deepEqual(await tip(page).locator('.fraction').evaluate(el=>({font:getComputedStyle(el).fontSize,line:getComputedStyle(el).lineHeight,weight:getComputedStyle(el).fontWeight,text:el.textContent})),{font:'13px',line:'18px',weight:'400',text:',1'});
    await page.screenshot({path:path.join(output,'tooltip-real-id-86-1.png')});
    const copy=tip(page).locator('[data-top-copy]');await copy.hover();await page.waitForTimeout(500);await copy.click();
    assert.deepEqual(await page.evaluate(()=>window.__tooltipCopies),['КП-ТЕСТ-0123']);assert.equal(await page.locator('#process-drawer[open]').count(),0,'Copy does not open drawer');
    await card.focus();await page.keyboard.press('Tab');assert.equal(await copy.evaluate(el=>el===document.activeElement),true,'Tab reaches real ID copy action');
    await page.keyboard.press('Shift+Tab');assert.equal(await card.evaluate(el=>el===document.activeElement),true,'Shift+Tab returns to trigger');
    await page.keyboard.press('Tab');await page.keyboard.press('Escape');await noTip(page,'Escape from copy');assert.equal(await card.evaluate(el=>el===document.activeElement),true);
    await page.evaluate(id=>{const row=window.BPM_TOP_KP.records.find(row=>row.id===id),saved=window.__tooltipOriginalCode;if(saved.present)row.code=saved.value;else delete row.code;row.efficiency=saved.efficiency;},id);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.BPM_TOP_KP.records)),original,'Synthetic test code does not persist and source records are unchanged');
    report('Keyboard, copy for stable demo IDs and overriding explicit IDs, Escape and trigger-focus restoration');

    // Move only a test trigger inside this isolated browser, to exercise every
    // placement edge independently of the Excel map packing and viewport size.
    const savedStyle=await card.getAttribute('style');
    for(const [name,left,top] of [['above',640,500],['below',640,12],['left',12,500],['right',1328,500]]){
      await card.evaluate((el,{left,top})=>{el.style.position='fixed';el.style.left=`${left}px`;el.style.top=`${top}px`;el.style.width='100px';el.style.height='34px';el.style.zIndex='240';},{left,top});
      await page.mouse.move(1,1);await hover(page,card);const s=await verify(page,card,`${name} edge`);
      assert.equal(s.placement,name==='below'?'below':'above');near(s.arrow.x+s.arrow.width/2,s.trigger.x+s.trigger.width/2,`${name}: arrow points at trigger center`,1);
      if(name==='above')near(s.bubble.x+s.bubble.width/2,s.trigger.x+s.trigger.width/2,'Unclamped bubble is centered',1);
      await page.screenshot({path:path.join(output,`tooltip-${name}.png`)});
      await page.keyboard.press('Escape');await noTip(page,`${name} cleanup`);
    }
    await card.evaluate((el,value)=>{if(value===null)el.removeAttribute('style');else el.setAttribute('style',value);},savedStyle);
    report('Above-first placement, below fallback and left/right clamping keep the 24×8 arrow attached to its card');

    await page.mouse.move(1,1);await hover(page,card);await card.click();await drawerReady(page);await noTip(page,'drawer opened');
    const expected=await recordFor(page,card);assert.equal(await page.locator('#pd-title').textContent(),expected.title);
    const drawerCopy=page.locator('#process-drawer .pd-heading-labels [data-pd-action="copy"]');
    assert.equal((await drawerCopy.innerText()).trim(),expected.code);assert.equal(await drawerCopy.getAttribute('data-pd-copy'),expected.code);
    await drawerCopy.click();assert.deepEqual(await page.evaluate(()=>window.__tooltipCopies),['КП-ТЕСТ-0123',expected.code]);
    await page.screenshot({path:path.join(output,'tooltip-demo-id-drawer.png')});
    assert.equal(Number((await page.locator('#process-drawer .jd-widget .pd-widget-value').innerText()).replace('%','').replace(',','.').trim()),expected.score);
    // dialog.close() clears `open` before its queued close event restores the
    // trigger's focus. Wait for cleanup, not just hidden DOM, before moving
    // focus elsewhere; otherwise cleanup legitimately reopens the hover card.
    await page.mouse.move(1,1);await page.keyboard.press('Escape');
    await page.waitForFunction(id=>!document.querySelector('#process-drawer')?.open&&!document.body.classList.contains('pd-drawer-open')&&document.activeElement?.dataset.topKpId===id,expected.id);
    await paint(page);await page.locator('.brand').focus();await noTip(page,'drawer closed and focus left its restored trigger');
    await page.mouse.move(1,1);await hover(page,card);await page.evaluate(()=>{location.hash='tasks';});await page.locator('#tasks-panel').waitFor({state:'visible'});await noTip(page,'route changed');
    await page.evaluate(()=>{location.hash='top-kp';});await ready(page);card=page.locator('.top-kp-card').first();
    await hover(page,card);await page.setViewportSize({width:390,height:844});await paint(page);await noTip(page,'viewport resized');
    card=page.locator('.top-kp-card').first();await hover(page,card);await page.locator('.top-kp-map-viewport').evaluate(el=>{el.scrollTop=100;});await noTip(page,'inner map scroll');
    report('Opening/closing the shared КП drawer, route changes, resizing and native map scrolling leave no stale hover bubble');
    const images=await page.evaluate(()=>[...document.images].filter(image=>image.src.includes('top-kp/tooltip')).map(image=>({width:image.naturalWidth,height:image.naturalHeight})));
    assert.ok(images.every(image=>image.width>0&&image.height>0));assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);assert.deepEqual(unexpected,[]);
    console.log(JSON.stringify({status:'PASS',standalone:!!standalone,file,output,errors,failures,unexpected},null,2));
  } catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(JSON.stringify({output,errors,failures,unexpected}));throw error;}
  finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

/* Large efficiency sphere: separate motion and widget-length stationary glass.
 * node test-large-sphere.cjs [absolute/standalone.html]
 * The optional standalone is copied alone and tested with network blocked. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BPM_PLAYWRIGHT||'/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-large-sphere-'));
let file=path.join(__dirname,'index.html');
if(process.argv[2]){assert(path.isAbsolute(process.argv[2]));file=path.join(output,'isolated.html');fs.copyFileSync(process.argv[2],file);}
const base=pathToFileURL(file).href;
const near=(actual,expected,label,tolerance=.2)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} vs ${expected}`);
const report=text=>console.log(`PASS — ${text}`);
const widget=page=>page.locator('#process-drawer .pd-efficiency-widget');
const paint=page=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
async function loaded(page){await page.waitForFunction(()=>{const drawer=document.querySelector('#process-drawer');return drawer?.open&&!drawer.classList.contains('pd-is-loading')&&!drawer.querySelector('.pd-main').inert;});}

function geometry(w){
  const box=element=>{if(!element)return null;const r=element.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const viewport=w.querySelector('.pd-sphere-viewport'),group=w.querySelector('.pd-large-sphere'),ball=group.querySelector('.pd-sphere-image'),curtain=group.querySelector('.pd-sphere-curtain'),period=w.querySelector('.pd-period');
  const css=element=>element&&getComputedStyle(element);
  return {widget:box(w),viewport:box(viewport),group:box(group),ball:box(ball),curtain:box(curtain),period:box(period),percent:group.dataset.efficiencyPercent,
    className:group.className,outerOverflow:css(w).overflow,viewportOverflow:css(viewport).overflow,ballBackground:css(ball).backgroundImage,ballBorder:css(ball).borderTopWidth,
    curtainParent:curtain?.parentElement===group,ballContainsCurtain:ball.contains(curtain),curtainBlur:css(curtain)?.backdropFilter,curtainPointer:css(curtain)?.pointerEvents,
    curtainTransform:css(curtain)?.transform,curtainAnimation:css(curtain)?.animationName,periodZ:Number(css(period).zIndex),headingZ:Number(css(w.querySelector('.pd-widget-heading')).zIndex)};
}

function verify(s,label){
  near(s.ball.width,154,`${label}: ball width`);near(s.ball.height,154,`${label}: ball height`);
  assert.equal(s.viewportOverflow,'visible',`${label}: sphere viewport does not cut glass`);
  assert.equal(s.outerOverflow,'hidden',`${label}: full rounded widget clips glass`);
  assert.ok(s.periodZ>0&&s.headingZ>0,`${label}: text/buttons are above glass`);
  if(s.curtain){
    assert.equal(s.curtainParent,true,`${label}: ball and curtain are siblings`);
    assert.equal(s.ballContainsCurtain,false,`${label}: no glass inside moving ball`);
    near(s.curtain.width,306,`${label}: glass width`);
    assert.ok(s.curtain.bottom>s.widget.bottom+1,`${label}: glass ends past whole widget (${s.curtain.bottom} > ${s.widget.bottom})`);
    assert.equal(s.curtainBlur,'blur(12.5px)',`${label}: original large glass blur`);
    assert.equal(s.curtainPointer,'none',`${label}: glass cannot block controls`);
    assert.equal(s.curtainTransform,'none');assert.equal(s.curtainAnimation,'none');
  }
}

async function motion(page,label){
  const current=widget(page);await current.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.pd-efficiency-widget')?.dataset.pdMotionState==='running');
  const samples=await current.evaluate(async w=>{
    const ball=w.querySelector('.pd-sphere-image'),curtain=w.querySelector('.pd-sphere-curtain');
    const animation=ball.getAnimations().find(item=>item.animationName==='pd-sphere-rise');
    if(!animation)throw new Error('Missing sphere entrance animation');
    animation.pause();const results=[];
    for(const time of [0,180,540,1100]){
      animation.currentTime=time;await new Promise(requestAnimationFrame);
      const sphere=ball.getBoundingClientRect(),glass=curtain.getBoundingClientRect();
      results.push({time,ballY:sphere.y,opacity:Number(getComputedStyle(ball).opacity),curtainY:glass.y,curtainBottom:glass.bottom});
    }
    animation.finish();return results;
  });
  assert.ok(samples[0].ballY-samples.at(-1).ballY>89,`${label}: sphere rises independently by 90px`);
  assert.equal(samples[0].opacity,0);assert.equal(samples.at(-1).opacity,1);
  for(const sample of samples){near(sample.curtainY,samples[0].curtainY,`${label}: fixed glass top at ${sample.time}ms`);near(sample.curtainBottom,samples[0].curtainBottom,`${label}: fixed glass bottom at ${sample.time}ms`);}
  report(`${label}: independent sphere entrance, stationary glass`);
}

async function openEntry(page,kind){
  await page.goto('about:blank');
  await page.goto(`${base}${kind==='top'?'#top-kp':'#main'}`);
  if(kind==='top')await page.locator('.top-kp-card').first().click();
  else{
    await page.locator('.entity-card:not(.skeleton-card)').first().waitFor();
    if(kind==='process'){await page.locator('#processes-tab').click();await page.locator('.entity-card:not(.skeleton-card)').first().waitFor();}
    await page.locator('.entity-card:not(.skeleton-card) [data-detail]').first().click();
  }
  await loaded(page);
  assert.equal(await page.locator('#process-drawer').getAttribute('data-pd-entity'),kind==='process'?'processes':'paths');
}

async function stateFixtures(page){
  const values=[null,0,44.9,45,64.9,65,84.9,85,100];
  const expected=['unrated','danger','danger','attention','attention','indigo','indigo','positive','positive'];
  await page.evaluate(values=>{
    const fixture=document.createElement('div');fixture.id='large-sphere-fixtures';fixture.style.cssText='position:fixed;inset:0;z-index:99999;background:#f2f4f8;padding:24px;display:grid;grid-template-columns:repeat(3,367px);gap:16px;overflow:auto';
    const esc=text=>String(text??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const original=window.BpmTopKp.detailRecord(window.BPM_TOP_KP.records[0]);
    for(const value of values){const template=document.createElement('template');template.innerHTML=window.BpmJourneyDetails.render({...original,efficiency:value},{esc,icon:()=>'',tag:()=>''});const article=template.content.querySelector('.pd-efficiency-widget');article.dataset.fixtureValue=String(value);fixture.append(article);}
    document.body.append(fixture);
  },values);
  await paint(page);
  for(let index=0;index<values.length;index++){
    const item=page.locator('#large-sphere-fixtures .pd-efficiency-widget').nth(index),s=await item.evaluate(geometry),value=values[index],label=`Fixture ${value}`;
    verify(s,label);assert.match(s.className,new RegExp(`jd-large-sphere--${expected[index]}(?: |$)`),`${label}: correct efficiency tone`);
    if(value===null){assert.equal(s.curtain,null);assert.equal(s.ballBackground,'none');assert.equal(s.ballBorder,'1px');}
    else{
      assert.equal(Number(s.percent),value);assert.notEqual(s.ballBackground,'none');
      if(value===100)assert.equal(s.curtain,null,'100% has no curtain or seam');
      else if(value===0)assert.ok(s.curtain.y<s.ball.y-50,'Zero is covered above the whole sphere');
      else near(s.curtain.y-s.ball.y,154*value/100,`${label}: boundary matches value`);
    }
  }
  await page.locator('#large-sphere-fixtures').screenshot({path:path.join(output,'boundary-fixtures.png')});
  await page.locator('#large-sphere-fixtures').evaluate(element=>element.remove());
  report('0/100/unrated and exact 45/65/85 tone boundaries');
}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],failed=[],network=[];
  try{
    const context=await browser.newContext({viewport:{width:1920,height:1080}});
    await context.route(/^https?:/,route=>{network.push(route.request().url());return route.abort();});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>failed.push(request.url()));
    for(const kind of ['top','journey','process']){
      await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1920,height:1080});
      await openEntry(page,kind);await motion(page,kind);await page.emulateMedia({reducedMotion:'reduce'});
      for(const width of [1920,1440,390,320]){
        await page.setViewportSize({width,height:1080});await widget(page).scrollIntoViewIfNeeded();await paint(page);
        verify(await widget(page).evaluate(geometry),`${kind} ${width}px`);
        const motionStyle=await widget(page).locator('.pd-sphere-image').evaluate(element=>{const s=getComputedStyle(element);return {animation:s.animationName,opacity:s.opacity,transform:s.transform};});
        assert.deepEqual(motionStyle,{animation:'none',opacity:'1',transform:'none'},`${kind} ${width}px: reduced motion shows the settled sphere`);
        const overflow=await page.locator('#process-drawer .pd-main').evaluate(element=>element.scrollWidth-element.clientWidth);assert.ok(overflow<=1,`${kind} ${width}px: no horizontal drawer overflow`);
        await widget(page).screenshot({path:path.join(output,`${kind}-${width}.png`)});
      }
      await page.emulateMedia({media:'print',reducedMotion:'no-preference'});await paint(page);
      const printStyle=await widget(page).locator('.pd-sphere-image').evaluate(element=>{const s=getComputedStyle(element);return {animation:s.animationName,opacity:s.opacity,transform:s.transform};});
      assert.deepEqual(printStyle,{animation:'none',opacity:'1',transform:'none'},`${kind}: print uses the settled sphere`);
      assert.equal(await widget(page).locator('.pd-sphere-curtain').evaluate(element=>getComputedStyle(element).animationName),'none',`${kind}: print glass remains stationary`);
      await page.emulateMedia({media:'screen',reducedMotion:'reduce'});
      report(`${kind}: 1920/1440/390/320px glass extends past widget, readable period, no overflow`);
    }
    await page.setViewportSize({width:1920,height:1200});await page.keyboard.press('Escape');await page.locator('#process-drawer[open]').waitFor({state:'hidden'});await stateFixtures(page);
    assert.deepEqual(errors,[],'No browser exceptions');assert.deepEqual(failed,[],'No failed resources');assert.deepEqual(network,[],'No network dependencies');
    report(`${process.argv[2]?'Isolated standalone':'Source'} complete; screenshots ${output}`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

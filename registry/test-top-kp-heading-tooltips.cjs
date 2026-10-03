/* TOP-КП clipped section/filter headings use the shared accessible tooltip.
 * node test-top-kp-heading-tooltips.cjs [index.html|standalone.html|URL]
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {chromium}=require(process.env.BPM_PLAYWRIGHT||'/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const requested=process.argv[2]||path.join(__dirname,'index.html');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-top-heading-tooltip-'));
let target=requested;
if(!/^https?:/.test(requested)){
  const local=requested.startsWith('file:')?fileURLToPath(requested.split('#')[0]):path.resolve(requested);
  if(path.basename(local)!=='index.html'){target=path.join(output,'standalone-offline.html');fs.copyFileSync(local,target);}
}
const base=(/^(https?:|file:)/.test(target)?target:pathToFileURL(path.resolve(target)).href).split('#')[0];
const selector='#top-kp-panel .top-kp-map h2,#top-kp-panel .top-kp-map h3,#top-kp-panel .top-kp-map h4,#top-kp-panel .top-kp-filter-caption,#top-kp-panel .internal-label';
const paint=page=>page.evaluate(async()=>{await document.fonts.ready;for(let i=0;i<6;i++)await new Promise(requestAnimationFrame);});
const report=text=>console.log(`PASS — ${text}`);
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<.25,`${label}: ${actual} versus ${expected}`);

async function verifyAttributes(page,label){
  const headings=await page.locator(selector).evaluateAll(nodes=>nodes.map((node,index)=>{
    const content=node.matches('h3')?node.querySelector('span')||node:node;
    return {index,text:node.textContent.trim(),clipped:content.scrollWidth>content.clientWidth+.5,tooltip:node.getAttribute('data-tooltip'),tabindex:node.getAttribute('tabindex'),nativeTitle:node.getAttribute('title'),visible:!!node.getClientRects().length,tag:node.tagName};
  }));
  assert.ok(headings.length>30,`${label}: complete header inventory`);
  const clipped=headings.filter(item=>item.visible&&item.clipped),full=headings.filter(item=>item.visible&&!item.clipped);
  assert.ok(full.length,`${label}: full heading coverage`);
  for(const heading of headings.filter(item=>item.visible)){
    assert.equal(heading.nativeTitle,null,`${label}: native title duplicate removed (${heading.text})`);
    if(heading.clipped){assert.equal(heading.tooltip,heading.text,`${label}: complete clipped name (${heading.text})`);assert.equal(heading.tabindex,'0',`${label}: clipped name is keyboard reachable (${heading.text})`);}
    else {assert.equal(heading.tooltip,null,`${label}: no tooltip for an uncut heading (${heading.text})`);assert.equal(heading.tabindex,null,`${label}: no unnecessary tab stop (${heading.text})`);}
  }
  return {headings,clipped,full};
}
async function show(page,target,method='hover'){
  await page.mouse.move(1,1);await page.keyboard.press('Escape');await target.scrollIntoViewIfNeeded();await paint(page);
  if(method==='focus')await target.focus();else await target.hover();
  const tip=page.locator('.tooltip');await tip.waitFor({state:'visible'});
  assert.equal(await tip.getAttribute('role'),'tooltip');
  const id=await tip.getAttribute('id');assert.ok(id,'Tooltip has an ID');
  assert.ok((await target.getAttribute('aria-describedby')||'').split(/\s+/).includes(id),'Trigger references shared tooltip');
  assert.equal((await tip.textContent()).trim(),(await target.textContent()).trim(),'Full untruncated name');
  const rect=await tip.boundingBox(),viewport=page.viewportSize();assert.ok(rect.x>=7&&rect.x+rect.width<=viewport.width-7,'Tooltip stays in viewport');
  return {tip,id};
}
async function hidden(page,target,id,label){
  await page.locator('.tooltip').waitFor({state:'hidden'});
  assert.ok(!(await target.getAttribute('aria-describedby')||'').split(/\s+/).includes(id),`${label}: stale tooltip description cleared`);
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:920},offline:true,reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(`${base}#top-kp`);await page.waitForSelector('.top-kp-card');await paint(page);
    let inventory=await verifyAttributes(page,'1440×920 initial');assert.ok(inventory.clipped.length,'Desktop fixture contains clipped headings');
    for(const tag of ['H2','H3','H4']){
      const entry=inventory.clipped.find(item=>item.tag===tag);if(!entry)continue;
      const target=page.locator(selector).nth(entry.index),{id}=await show(page,target);
      await page.screenshot({path:path.join(output,`heading-${tag}.png`)});
      await page.mouse.move(1,1);await hidden(page,target,id,`${tag} pointer leaves`);
      const focus=await show(page,target,'focus');await page.keyboard.press('Escape');await hidden(page,target,focus.id,`${tag} Escape`);
    }
    report('Clipped block, department and SSP headings expose the full name on hover and keyboard focus');
    const filter=page.locator('#top-kp-panel .internal-label[data-tooltip]').first();
    const first=await show(page,filter);await page.evaluate(()=>document.querySelector('.top-kp-map-viewport').dispatchEvent(new Event('scroll')));await hidden(page,filter,first.id,'scroll');
    const second=await show(page,filter,'focus');await page.locator('.brand').focus();await hidden(page,filter,second.id,'focus leaves');
    report('Shared tooltip has role/ID/aria-describedby and closes on scroll, blur and Escape');
    await page.locator('.top-kp-map-viewport').evaluate(el=>el.scrollTop=0);await paint(page);
    await page.mouse.move(1,1);await page.keyboard.press('Escape');
    await page.locator('#top-filter-block-input').click();await page.locator('#top-filter-block-list').getByRole('option',{name:'B2B',exact:true}).click();await paint(page);
    inventory=await verifyAttributes(page,'active filter / erase slot');
    assert.equal(await page.locator('.top-kp-reset').isVisible(),true);
    await page.mouse.move(1,1);await page.keyboard.press('Escape');await page.locator('.top-kp-reset').click();await paint(page);await verifyAttributes(page,'reset');
    report('Filter activation/reset recomputes truncation when the erase button changes available width');
    for(const [width,height] of [[390,844],[1920,1080],[3840,2160],[1440,920]]){
      await page.setViewportSize({width,height});await paint(page);await verifyAttributes(page,`${width}×${height}`);
    }
    const reflowTarget=page.locator('#top-kp-panel [data-tooltip]').first(),reflow=await show(page,reflowTarget);
    await page.setViewportSize({width:1450,height:920});await paint(page);await page.locator('.tooltip').waitFor({state:'hidden'});
    assert.equal(await page.locator(`[aria-describedby~="${reflow.id}"]`).count(),0,'Resize removes stale tooltip references');
    report('Resize removes stale tooltips and refreshes clipping through 4K');
    await page.setViewportSize({width:1440,height:920});await paint(page);
    const gaps=await page.evaluate(()=>{
      const groups=[...document.querySelectorAll('.top-kp-group')];
      const first=cell=>document.querySelector(`.top-kp-group[data-source-category="${cell}"] .top-kp-card`).getBoundingClientRect();
      const h=first('H2'),i=first('I2'),j=[...document.querySelectorAll('.top-kp-group[data-source-category="J2"] .top-kp-card')].map(el=>el.getBoundingClientRect());
      return {rightPaddings:groups.map(group=>({cell:group.dataset.sourceCategory,value:getComputedStyle(group).paddingRight})),hi:i.left-h.right,j:Math.abs(j[1].top-j[0].top)<.5?j[1].left-j[0].right:j[1].top-j[0].bottom};
    });
    for(const group of gaps.rightPaddings)assert.equal(group.value,'0px',`${group.cell}: no extra right gutter`);
    near(gaps.hi,8,'H2 → I2 card-edge gap');near(gaps.j,8,'J2 internal card-edge gap');
    report('H2/I2 and J2 card-edge gaps are both 8px; all SSP groups have zero extra right padding');
    await page.mouse.move(1,1);await page.keyboard.press('Escape');
    const leaveTarget=page.locator('#top-kp-panel [data-tooltip]').first();await show(page,leaveTarget);await page.evaluate(()=>location.hash='tasks');await paint(page);await page.locator('.tooltip').waitFor({state:'hidden'});
    assert.equal(await page.locator('#top-kp-panel [aria-describedby]').count(),0,'Leaving TOP-КП clears heading descriptions');
    assert.deepEqual(errors,[],'No browser errors');report(`No stale tooltip on page leave; screenshots: ${output}`);
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

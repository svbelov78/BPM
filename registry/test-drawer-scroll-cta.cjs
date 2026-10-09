/* Shared scroll-to-enable CTA regression. Uses isolated, offline Chrome data.
 * node test-drawer-scroll-cta.cjs [index.html | ../Sber-BPM-Registry-Standalone.html]
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {PNG} = require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-scroll-cta-'));
let source = path.resolve(process.argv[2] || path.join(__dirname, 'index.html'));
if (path.basename(source) !== 'index.html') {
  const isolated = path.join(output, 'isolated-prototype.html');
  fs.copyFileSync(source, isolated); source = isolated;
}
const url = hash => `${pathToFileURL(source).href}#${hash}`;
const types = ['standard', 'extended-access', 'role-management', 'process-result-approval', 'business-description-checklist', 'metric-inapplicability', 'bulk-metric-inapplicability', 'business-description-update', 'insight'];
const report = message => console.log(`PASS — ${message}`);
async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  });
}
async function ready(page, kind) { await page.waitForFunction(kind => document.querySelector(`#${kind}-results`)?.getAttribute('aria-busy') === 'false', kind); }
async function setScroll(page, selector, fraction) {
  await page.locator(selector).evaluate((node, fraction) => {
    node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight) * fraction;
    node.dispatchEvent(new Event('scroll'));
  }, fraction);
  await paint(page);
}
async function viewedProgress(page, selector) {
  return page.locator(selector).evaluate(node => Math.min(1,(node.scrollTop + node.clientHeight) / node.scrollHeight));
}
async function followsViewedExtent(page, button, scroll, label) {
  const value=await state(page,button),expected=await viewedProgress(page,scroll);
  assert.ok(Math.abs(value.progress-expected)<=.0001,`${label}: progress reflects the viewed portion of the entire form (${value.progress} / ${expected})`);
  return value;
}
async function state(page, button) {
  return page.locator(button).evaluate(node => ({
    disabled: node.disabled,
    pending: node.getAttribute('data-scroll-pending'),
    progress: Number(node.getAttribute('data-scroll-progress')),
    meter: [...node.querySelectorAll('.scroll-cta-meter')].filter(item => !item.hidden && getComputedStyle(item).display !== 'none').map(item => ({role: item.getAttribute('role'), value: Number(item.getAttribute('aria-valuenow')), width:item.getBoundingClientRect().width, height:item.getBoundingClientRect().height})),
    background:getComputedStyle(node).backgroundColor,
    opacity:getComputedStyle(node).opacity,
    title: node.getAttribute('title') || ''
  }));
}
function locked(value, label) {
  assert.equal(value.disabled, true, `${label}: disabled before reaching the bottom`);
  assert.equal(value.pending, 'true', `${label}: pending flag`);
  assert.ok(value.progress >= 0 && value.progress < 1, `${label}: incomplete progress ${JSON.stringify(value)}`);
  assert.equal(value.meter.length, 1, `${label}: one visible progress indicator`);
  assert.equal(value.meter[0].role, 'progressbar', `${label}: accessible progress indicator`);
  assert.ok(Math.abs(value.meter[0].value - value.progress * 100) <= 1, `${label}: visual and accessible progress agree`);
  assert.equal(value.background,'rgb(178, 213, 249)',`${label}: waiting CTA uses the exact design-system blue fill`);
  assert.equal(value.opacity,'1',`${label}: the disabled-state opacity does not fade the progress treatment`);
  assert.equal(value.meter[0].width,24,`${label}: native loader width is 24px`);
  assert.equal(value.meter[0].height,24,`${label}: native loader height is 24px`);
  assert.ok(value.title.length > 0, `${label}: the disabled action explains how to unlock`);
}
function complete(value, label, businessDisabled = false) {
  assert.equal(value.pending, null, `${label}: pending flag removed`);
  assert.equal(value.progress, 1, `${label}: progress complete`);
  assert.equal(value.disabled, businessDisabled, `${label}: normal business disabled state restored`);
  assert.equal(value.meter.length, 0, `${label}: progress indicator disappears after completion`);
}
async function loaderGeometry(page, button, label) {
  const meter=page.locator(`${button} .scroll-cta-meter:not([hidden])`);
  await meter.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  const geometry=await meter.evaluate(node=>{
    const track=node.querySelector('.scroll-cta-track'),fill=node.querySelector('.scroll-cta-fill');
    return {progress:Number(node.closest('button').dataset.scrollProgress),aria:Number(node.getAttribute('aria-valuenow')),mask:getComputedStyle(fill).maskImage,
      source:track.currentSrc===fill.currentSrc,width:track.naturalWidth,height:track.naturalHeight,trackOpacity:Number(getComputedStyle(track).opacity),transform:getComputedStyle(node).transform};
  });
  assert.ok(geometry.source,`${label}: track and fill use one closed-circle asset`);
  assert.equal(geometry.width,24,`${label}: 24px native circle`);assert.equal(geometry.height,24);
  assert.equal(geometry.trackOpacity,.2,`${label}: unfilled circle remains visible`);
  assert.equal(geometry.transform,'none',`${label}: progress starts at twelve o'clock without rotating the whole ring`);
  const stop=geometry.mask.match(/rgba?\([^)]*\)\s+([\d.e+-]+)deg/);
  assert.ok(stop,`${label}: conic fill exposes an explicit angle: ${geometry.mask}`);
  const angle=Number(stop[1]),minimum=2/10*180/Math.PI;
  assert.ok(Math.abs(angle-Math.max(minimum,geometry.progress*360))<.025,`${label}: fill equals the viewed percentage, with a minimum 2px seed ${JSON.stringify(geometry)}`);
  assert.ok(Math.abs(geometry.aria-geometry.progress*100)<=1,`${label}: initial visual segment does not falsify accessible scroll progress`);
  const raster=PNG.sync.read(await meter.screenshot({path:path.join(output,`loader-${label}.png`)}));
  const {width,height,data}=raster,cx=width/2,cy=height/2,scale=Math.min(width,height)/24;
  const pixel=(x,y)=>{const offset=(Math.max(0,Math.min(height-1,y))*width+Math.max(0,Math.min(width-1,x)))*4;return [...data.subarray(offset,offset+4)];};
  const background=pixel(Math.floor(cx),Math.floor(cy));
  // Sample the actual composited pixels all around the circumference. A native
  // loading arc with a gap fails this even if its CSS mask says 360 degrees.
  for(let degrees=0;degrees<360;degrees+=6){
    const radians=degrees*Math.PI/180,x=Math.floor(cx+10*scale*Math.sin(radians)),y=Math.floor(cy-10*scale*Math.cos(radians));
    let contrast=0;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)contrast=Math.max(contrast,background[0]-pixel(x+dx,y+dy)[0]);
    assert.ok(contrast>12,`${label}: ring has no gap at ${degrees}° (contrast ${contrast})`);
  }
  const blue=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const color=pixel(x,y);if(color[0]<90&&color[1]<185&&color[2]>230)blue.push({x:x+.5,y:y+.5});}
  assert.ok(blue.length>=2,`${label}: real opaque blue segment is visible`);
  if(geometry.progress*360<=minimum){
    assert.ok(Math.abs(angle/180*Math.PI*10-2)<.005,'Initial segment is 2px along the circle centerline');
    assert.ok(blue.every(point=>point.y<height*.25&&point.x>=cx-1.5&&point.x<=cx+4*scale),`${label}: the initial segment is at twelve o'clock, not on another side: ${JSON.stringify(blue)}`);
    assert.ok(blue.length<18*scale*scale,`${label}: initial segment is small, not a prefilled quadrant`);
  }
  return {angle,bluePixels:blue.length};
}
async function shellGeometry(page, config) {
  return page.locator(config.root).evaluate((root, config) => {
    const outer = root.getBoundingClientRect(), scroll = root.querySelector(config.localScroll);
    const header = root.querySelector(config.header).getBoundingClientRect(), footer = root.querySelector(config.footer).getBoundingClientRect();
    return {left: outer.left, right: outer.right, top: header.top, bottom: footer.bottom, footerTop: footer.top, width: scroll.scrollWidth, client: scroll.clientWidth};
  }, config);
}
async function checkForm(page, config, label, {validation = true} = {}) {
  await paint(page);
  const overflow = await page.locator(config.scroll).evaluate(node => node.scrollHeight > node.clientHeight + 2);
  const before = await shellGeometry(page, config);
  assert.ok(before.left >= -1 && before.right <= page.viewportSize().width + 1, `${label}: drawer fits the viewport`);
  assert.ok(before.width <= before.client + 1, `${label}: no horizontal overflow`);
  assert.ok(before.top < before.footerTop && before.bottom <= page.viewportSize().height + 1, `${label}: fixed edges remain visible`);
  const count = await page.evaluate(kind => (kind === 'insights' ? window.BpmInsightStore : window.BpmTaskStore).list().length, config.kind);
  if (overflow) {
    let emptyLoader;
    locked(await state(page, config.button), label);
    const initial=await followsViewedExtent(page,config.button,config.scroll,`${label}: initially visible content`);
    assert.ok(initial.progress>0,`${label}: visible content contributes to initial progress`);
    if(label==='Insight create'){await page.screenshot({path:path.join(output,'insight-cta-empty.png')});emptyLoader=await loaderGeometry(page,config.button,'empty');}
    await page.locator(config.form).evaluate(form => {
      form.dispatchEvent(new SubmitEvent('submit', {bubbles: true, cancelable: true}));
      form.requestSubmit();
    });
    if (await page.locator(`${config.form} input:not([type=hidden])`).count()) {
      await page.locator(`${config.form} input:not([type=hidden])`).first().focus();
      await page.keyboard.press('Enter');
    }
    await page.locator(config.button).evaluate(button => button.click());
    assert.equal(await page.evaluate(kind => (kind === 'insights' ? window.BpmInsightStore : window.BpmTaskStore).list().length, config.kind), count, `${label}: Enter/requestSubmit/direct click cannot bypass reading`);
    assert.equal(await page.locator(`${config.form} [aria-invalid=true]`).count(), 0, `${label}: blocked submission does not prematurely validate`);
    await setScroll(page, config.scroll, .4);
    const partial = await followsViewedExtent(page,config.button,config.scroll,`${label}: partial scroll`); locked(partial, label);
    assert.ok(partial.progress>initial.progress,`${label}: scrolling increases the viewed portion`);
    if(label==='Insight create'){
      await page.screenshot({path:path.join(output,'insight-cta-partial.png')});
      const partialLoader=await loaderGeometry(page,config.button,'partial');
      assert.ok(partialLoader.angle>emptyLoader.angle&&partialLoader.bluePixels>emptyLoader.bluePixels,'Scrolling grows the actual blue fill, not only ARIA or a counter');
      report('closed 24px loader ring, initially visible content counted, minimum 2px seed and raster-verified proportional fill');
    }
    await setScroll(page, config.scroll, 0);
    const reversed=await followsViewedExtent(page,config.button,config.scroll,`${label}: scrolling back before completion`);
    assert.ok(reversed.progress<partial.progress,`${label}: scrolling back reduces progress without discarding the visible top portion`);
    await setScroll(page, config.scroll, 1);
  }
  complete(await state(page, config.button), label);
  const after = await shellGeometry(page, config);
  assert.ok(Math.abs(before.top - after.top) < 1 && Math.abs(before.footerTop - after.footerTop) < 1, `${label}: header and footer do not scroll`);
  await setScroll(page, config.scroll, 0);
  complete(await state(page, config.button), `${label}: latch after scrolling back`);
  if (validation) {
    await page.locator(config.button).click();
    assert.ok(await page.locator(config.root).isVisible(), `${label}: incomplete form stays open after normal validation`);
    assert.ok(await page.locator(`${config.form} [aria-invalid=true]`).count() > 0, `${label}: required-field validation remains active after unlock`);
    assert.equal(await page.evaluate(kind => (kind === 'insights' ? window.BpmInsightStore : window.BpmTaskStore).list().length, config.kind), count, `${label}: incomplete form creates nothing`);
    complete(await state(page, config.button), `${label}: validation does not relock`);
  }
}
const insight = {kind:'insights', root:'#insight-create-drawer', scroll:'#insight-create-drawer .ic-scroll', localScroll:'.ic-scroll', button:'#insight-create-drawer [data-submit]', form:'#insight-create-drawer .ic-form', header:'.ic-header', footer:'.ic-actions'};
function taskConfig(type) {
  const root = type === 'standard' ? '#task-flow' : '#special-task-flow', prefix = type === 'standard' ? 'tf' : 'stf';
  return {kind:'tasks', root, scroll:`${root} .tf-content`, localScroll:'.tf-content', button:`${root} .tf-footer [data-${prefix}-action=save]`, form:`#${prefix}-form`, header:'.tf-header', footer:'.tf-footer', prefix};
}
async function openTask(page, type) {
  await page.locator('#tasks-create').click();
  await page.locator(`#task-drawer [data-task-type="${type}"]`).click();
  const config = taskConfig(type);
  await page.locator(`${config.root}[open][data-mode=create]`).waitFor(); await paint(page);
  return config;
}
async function closeTask(page, config) {
  await page.locator(`${config.root} .tf-header [data-${config.prefix}-action=close]`).click();
  await page.locator(`${config.root}[open]`).waitFor({state:'hidden'});
}
async function contracts(page) {
  await page.setViewportSize({width:1440,height:1200});
  await page.goto(url('insights')); await ready(page, 'insights');
  assert.equal(await page.evaluate(() => typeof window.BpmDrawerScroll?.create), 'function', 'The shared controller is loaded');
  await page.evaluate(() => {
    const make = (id, contentHeight = 600) => {
      const root = document.createElement('section'); root.id = id;
      root.style.cssText = 'position:fixed;top:10px;left:10px;width:320px;background:white;z-index:99999';
      root.innerHTML = `<div class="qa-scroll" style="height:120px;overflow:auto"><form novalidate><input aria-label="QA field"><div class="qa-content" style="height:${contentHeight}px"></div></form></div><button type="button" class="button primary-button">Создать</button><button type="button" class="qa-cancel">Отменить</button>`;
      document.body.append(root);
      const gate = window.BpmDrawerScroll.create(), scroll = root.querySelector('.qa-scroll'), button = root.querySelector('.primary-button'), form = root.querySelector('form');
      gate.begin(); gate.bind({root, scroll, buttons:[button], form});
      const result = {root, gate, scroll, button, form, count:0};
      form.addEventListener('submit', event => {event.preventDefault(); if (gate.allow()) result.count++;});
      return result;
    };
    window.__scrollGateQA = {make, parent:make('qa-parent'), child:make('qa-child')};
  });
  await paint(page);
  const button = '#qa-parent .primary-button';
  locked(await state(page, button), 'Shared contract');
  await setScroll(page, '#qa-child .qa-scroll', 1);
  complete(await state(page, '#qa-child .primary-button'), 'Independent nested scope');
  locked(await state(page, button), 'Nested scrolling leaves parent locked');
  await page.evaluate(() => { const p=window.__scrollGateQA.parent; p.form.requestSubmit(); p.form.dispatchEvent(new SubmitEvent('submit', {bubbles:true,cancelable:true})); });
  assert.equal(await page.evaluate(() => window.__scrollGateQA.parent.count), 0, 'allow() blocks implicit/programmatic submits');
  await setScroll(page, '#qa-parent .qa-scroll', .5);
  const oldProgress = (await state(page, button)).progress;
  await page.locator('#qa-parent .qa-content').evaluate(node => node.style.height = '1000px');
  await page.waitForFunction(old => Number(document.querySelector('#qa-parent .primary-button').dataset.scrollProgress) < old, oldProgress);
  locked(await state(page, button), 'Growing content updates the incomplete range');
  await page.evaluate(() => window.__scrollGateQA.parent.gate.setDisabled(window.__scrollGateQA.parent.button, true));
  await setScroll(page, '#qa-parent .qa-scroll', 1);
  complete(await state(page, button), 'Business-disabled state is preserved', true);
  await page.evaluate(() => window.__scrollGateQA.parent.gate.setDisabled(window.__scrollGateQA.parent.button, false));
  complete(await state(page, button), 'Business state can enable a read form');
  await setScroll(page, '#qa-parent .qa-scroll', 0);
  await page.locator('#qa-parent .qa-content').evaluate(node => node.style.height = '1400px');
  await page.locator('#qa-parent .qa-scroll').evaluate(node => node.style.height = '80px');
  await paint(page); complete(await state(page, button), 'Growing and resizing after completion retain the latch');
  await page.evaluate(() => {
    const p=window.__scrollGateQA.parent;
    p.gate.bind({root:p.root,scroll:p.scroll,buttons:[p.button],form:p.form});
  });
  await paint(page); complete(await state(page, button), 'Binding the same form again retains completion');
  await page.evaluate(() => {
    const p=window.__scrollGateQA.parent;
    p.gate.end();p.gate.begin();p.gate.bind({root:p.root,scroll:p.scroll,buttons:[p.button],form:p.form});
  });
  await paint(page); locked(await followsViewedExtent(page,button,'#qa-parent .qa-scroll','A new session resets completion'), 'A new session resets completion');
  assert.ok(await page.locator('#qa-parent .qa-cancel').isEnabled(), 'Cancel is not gated');
  await page.evaluate(() => window.__scrollGateQA.short = window.__scrollGateQA.make('qa-short', 20));
  await paint(page); complete(await state(page, '#qa-short .primary-button'), 'Forms without overflow start ready');
  await page.locator('#qa-short .qa-content').evaluate(node => node.style.height = '500px');
  await paint(page); complete(await state(page, '#qa-short .primary-button'), 'Already-complete no-overflow form stays ready after resize/content growth');
  const metrics=[
    {id:'qa-viewed-90',total:1000,viewport:900,middle:50,initial:.9,partial:.95},
    {id:'qa-viewed-long',total:1000,viewport:100,middle:450,initial:.1,partial:.55},
    {id:'qa-travel-100',total:220,viewport:120,middle:50,initial:120/220,partial:170/220},
    {id:'qa-form-100',total:100,viewport:60,middle:20,initial:.6,partial:.8}
  ];
  await page.evaluate(metrics=>{
    const qa=window.__scrollGateQA;qa.metrics=metrics.map(config=>{
      const entry=qa.make(config.id,config.total);
      entry.form.querySelector('input').style.display='none';
      entry.scroll.style.height=`${config.viewport}px`;
      entry.gate.begin();entry.gate.bind({root:entry.root,scroll:entry.scroll,buttons:[entry.button],form:entry.form});
      return entry;
    });
  },metrics);
  await paint(page);
  for(const config of metrics){
    const button=`#${config.id} .primary-button`,scroll=`#${config.id} .qa-scroll`;
    const geometry=await page.locator(scroll).evaluate(node=>({total:node.scrollHeight,viewport:node.clientHeight,top:node.scrollTop}));
    assert.deepEqual(geometry,{total:config.total,viewport:config.viewport,top:0},`${config.id}: deterministic form geometry`);
    const initial=await followsViewedExtent(page,button,scroll,`${config.id}: initial`);locked(initial,`${config.id}: initial`);
    assert.ok(Math.abs(initial.progress-config.initial)<=.0001,`${config.id}: expected initial viewed fraction`);
    await page.locator(scroll).evaluate((node,top)=>{node.scrollTop=top;node.dispatchEvent(new Event('scroll'));},config.middle);await paint(page);
    const partial=await followsViewedExtent(page,button,scroll,`${config.id}: partial`);locked(partial,`${config.id}: partial`);
    assert.ok(Math.abs(partial.progress-config.partial)<=.0001,`${config.id}: expected viewed fraction after a pixel scroll`);
    await setScroll(page,scroll,0);await followsViewedExtent(page,button,scroll,`${config.id}: reverse before completion`);
    await setScroll(page,scroll,1);complete(await state(page,button),`${config.id}: actual bottom`);
    await setScroll(page,scroll,0);complete(await state(page,button),`${config.id}: latched after reverse`);
  }
  await page.evaluate(() => {
    for (const key of ['parent','child','short']) {const p=window.__scrollGateQA[key];p.gate.end();p.root.remove();}
    window.__scrollGateQA.metrics.forEach(p=>{p.gate.end();p.root.remove();});
    delete window.__scrollGateQA;
  });
  report('shared API: entire-form progress (1000/900px: 90%→95%→100%), long form, 100px travel and 100px form, reverse/latch, accessibility, submit guard, nested scopes, dynamic geometry, validation, rebind, session reset and no-overflow');
}
async function actualForms(page) {
  await page.setViewportSize({width:1440,height:700});
  await page.goto(url('insights')); await ready(page,'insights');
  await page.locator('#insights-create').click(); await checkForm(page, insight, 'Insight create');
  await page.locator('#insight-create-drawer [data-close]').first().click();
  await page.locator('#insight-create-drawer[open]').waitFor({state:'hidden'});
  await page.locator('#insights-create').click(); await paint(page);
  locked(await state(page, insight.button), 'Insight new open resets reading');
  await page.locator('#insight-create-drawer [data-close]').first().click();
  await page.locator('#insight-create-drawer[open]').waitFor({state:'hidden'});
  await page.goto(url('tasks'));await ready(page,'tasks');
  for (const type of types) {
    const config=await openTask(page,type);
    await checkForm(page,config,`${type} create`);
    await closeTask(page,config);
    if(type==='standard') {
      await openTask(page,type);await paint(page);
      const overflow=await page.locator(config.scroll).evaluate(node=>node.scrollHeight>node.clientHeight+2);
      if(overflow)locked(await state(page,config.button),'Typical task new open resets reading');
      await closeTask(page,config);
    }
  }
  report('real insight, typical task and all eight specialised creation forms: reading gate, keyboard/programmatic safety, fixed shell and validation');
}
async function responsive(page) {
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:3840,height:2160}]) {
    await page.setViewportSize(viewport);
    await page.goto(url('tasks'));await ready(page,'tasks');await paint(page);
    if(await page.locator('body.mobile-menu-open').count())await page.locator('#collapse-menu').click();
    const config=await openTask(page,'standard');
    await checkForm(page,config,`Typical ${viewport.width}×${viewport.height}`,{validation:false});
    await page.screenshot({path:path.join(output,`task-${viewport.width}.png`)});
    await closeTask(page,config);
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(url('insights'));await ready(page,'insights');await paint(page);
  if(await page.locator('body.mobile-menu-open').count())await page.locator('#collapse-menu').click();
  await page.locator('#insights-create').click();await checkForm(page,insight,'Insight mobile',{validation:false});
  await page.screenshot({path:path.join(output,'insight-mobile-complete.png')});
  await page.locator('#insight-create-drawer [data-close]').first().click();
  report('390/320 mobile and 3840×2160 desktop: no overflow or clipped CTA, reduced-motion compatibility and no-scroll ready state');
}
async function lifecycleAndEditing(page) {
  await page.setViewportSize({width:1440,height:700});
  await page.goto(url('tasks'));await ready(page,'tasks');
  const typicalId=await page.evaluate(() => {
    const store=window.BpmTaskStore;
    const row=store.create({title:'Проверка прочтения задачи',description:Array(35).fill('Демонстрационная строка описания задачи.').join('\n'),assignees:[store.currentUser]});
    window.BpmTaskFlow.open({mode:'view',taskId:row.id});return row.id;
  });
  await page.locator('#task-flow[open][data-mode=view]').waitFor();await paint(page);
  locked(await state(page,'#task-flow [data-tf-action=complete]'),'Typical completion requires reading');
  assert.ok(await page.locator('#task-flow [data-tf-action=reject]').isEnabled(),'Secondary reject remains available');
  await setScroll(page,'#task-flow .tf-content',1);
  complete(await state(page,'#task-flow [data-tf-action=complete]'),'Typical completion unlocks');
  await setScroll(page,'#task-flow .tf-content',0);
  complete(await state(page,'#task-flow [data-tf-action=complete]'),'Typical view latch persists');
  await page.locator('#task-flow [data-tf-edit=description]').click();
  await page.locator('#task-flow[open][data-mode=edit]').waitFor();await paint(page);
  const config=taskConfig('standard');
  await setScroll(page,config.scroll,1);
  complete(await state(page,config.button),'Unchanged typical edit stays disabled',true);
  await page.locator('#tf-title').fill('Изменённая задача после просмотра');
  complete(await state(page,config.button),'Changed typical edit is enabled');
  await page.locator('#task-flow [data-tf-action=reset]').click();await paint(page);
  complete(await state(page,config.button),'Reset preserves reading but disables unchanged save',true);
  await closeTask(page,config);
  assert.equal(await page.evaluate(id=>window.BpmTaskStore.get(id).title,typicalId),'Проверка прочтения задачи','Unsaved edits do not mutate the store');
  await page.evaluate(() => {
    const store=window.BpmTaskStore;
    const row=store.create({title:'Проверка согласования доступа',flowType:'extended-access',description:Array(35).fill('Демонстрационное обоснование запроса.').join('\n'),assignees:[store.currentUser],flowData:{}});
    window.BpmSpecialTaskFlow.open({mode:'view',taskId:row.id});
  });
  await page.locator('#special-task-flow[open][data-mode=view]').waitFor();await paint(page);
  const specialPrimary='#special-task-flow .tf-footer .is-primary[data-stf-action^="lifecycle:"]';
  locked(await state(page,specialPrimary),'Special task lifecycle requires reading');
  await setScroll(page,'#special-task-flow .tf-content',1);
  complete(await state(page,specialPrimary),'Special task lifecycle unlocks');
  await setScroll(page,'#special-task-flow .tf-content',0);
  complete(await state(page,specialPrimary),'Special task view latch persists');
  await closeTask(page,taskConfig('extended-access'));
  await page.goto(url('insights'));await ready(page,'insights');
  await page.locator('[data-insight-open="INS-000060"]').click();
  await page.locator('#insights-detail-view .id-detail-scroll').waitFor();await paint(page);
  const approval='#insights-detail-view [data-id-approval=approve]';
  locked(await state(page,approval),'Insight approval requires reading');
  assert.ok(await page.locator('#insights-detail-view [data-id-approval=reject]').isEnabled(),'Insight secondary reject remains available');
  await setScroll(page,'#insights-detail-view .id-detail-scroll',1);
  complete(await state(page,approval),'Insight approval unlocks');
  await setScroll(page,'#insights-detail-view .id-detail-scroll',0);
  complete(await state(page,approval),'Insight approval latch persists');
  await page.locator('.insights-view-controls button[aria-pressed="true"]').click();await ready(page,'insights');
  report('primary task completion, specialised lifecycle and insight approval are gated; secondary rejection and existing edit validation stay intact');
}
async function nestedInsight(page) {
  await page.setViewportSize({width:1440,height:700});
  await page.goto(url('insights'));await ready(page,'insights');
  await page.locator('#insights-create').click();
  await page.locator('#insight-create-drawer [name=title]').fill('Демонстрационный поиск совпадений');
  await page.locator('#insight-create-drawer [name=description]').fill('Нужно упростить оформление банковского продукта и сократить число действий клиента.');
  const sheet=page.locator('#insight-duplicate-sheet');await sheet.waitFor({state:'visible'});
  const before=await state(page,insight.button);
  await setScroll(page,'#insight-duplicate-sheet .ic-matches-list',1);
  assert.deepEqual(await state(page,insight.button),before,'Scrolling duplicate results does not change parent reading progress');
  await sheet.locator('[data-open-match]').first().click();
  await page.locator('#insight-approval-drawer[open]').waitFor();
  await setScroll(page,'#insight-approval-drawer .ia-scroll',1);
  assert.deepEqual(await state(page,insight.button),before,'Reading a duplicate preview does not unlock the creation form');
  await page.locator('#insight-approval-drawer [data-ia-back]').click();await sheet.waitFor({state:'visible'});
  await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
  assert.equal(await page.locator('#insight-create-drawer [name=title]').inputValue(),'Демонстрационный поиск совпадений');
  locked(await state(page,insight.button),'Parent remains gated after duplicate review');
  await setScroll(page,insight.scroll,1);complete(await state(page,insight.button),'Parent unlocks only by reading its own body');
  await page.locator('#insight-create-drawer [data-close]').first().click();
  await page.locator('[data-discard]').click();await page.locator('#insight-create-drawer[open]').waitFor({state:'hidden'});
  report('duplicate bottom sheet and preview scrolling stay isolated; returning preserves draft and parent reading state');
}
async function normalMotion(page) {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:1440,height:700});
  await page.goto(url('tasks'));await ready(page,'tasks');
  const config=await openTask(page,'standard');
  await page.locator('#task-flow.has-entered').waitFor();
  await checkForm(page,config,'Animated typical drawer',{validation:false});
  await closeTask(page,config);
  report('default-motion drawer animation does not prematurely unlock or interfere with progress');
}
async function nestedSpecial(page) {
  await page.setViewportSize({width:320,height:568});
  await page.goto(url('tasks'));await ready(page,'tasks');await paint(page);
  if(await page.locator('body.mobile-menu-open').count())await page.locator('#collapse-menu').click();
  const config=await openTask(page,'process-result-approval');
  await setScroll(page,config.scroll,1);complete(await state(page,config.button),'Special parent read before adding a variant');
  await page.locator('#special-task-flow [data-stf-action=item-add][data-field=proposedVariants]').click();
  const sheet='#special-task-flow .stf-sheet',body=`${sheet} .stf-sheet-content`,button=`${sheet} [data-stf-action=sheet-save]`;
  await page.locator(sheet).waitFor();await paint(page);
  const edges=()=>page.locator(sheet).evaluate(root=>({header:root.querySelector('.tf-sheet-heading').getBoundingClientRect().top,footer:root.querySelector('.tf-sheet-actions').getBoundingClientRect().top,bottom:root.querySelector('.tf-sheet-actions').getBoundingClientRect().bottom,scroll:root.querySelector('.stf-sheet-content').scrollWidth,client:root.querySelector('.stf-sheet-content').clientWidth}));
  const before=await edges();
  assert.ok(before.scroll<=before.client+1&&before.bottom<=568,'Mobile special sheet keeps footer on screen without horizontal overflow');
  locked(await state(page,button),'Actual mobile variant sheet starts gated');
  await setScroll(page,body,.4);const partial=await state(page,button);locked(partial,'Actual variant sheet partial progress');
  await followsViewedExtent(page,button,body,'Actual variant sheet tracks its own viewed extent');
  complete(await state(page,config.button),'Child scrolling preserves completed parent');
  await setScroll(page,body,1);complete(await state(page,button),'Actual variant sheet complete');
  const after=await edges();
  assert.ok(Math.abs(before.header-after.header)<1&&Math.abs(before.footer-after.footer)<1,'Actual special sheet header/footer remain fixed');
  await setScroll(page,body,0);complete(await state(page,button),'Actual variant sheet retains latch on upward scroll');
  await page.locator(button).click();
  assert.ok(await page.locator(`${sheet} [aria-invalid=true]`).count()>0,'Actual sheet still validates required fields after reading');
  complete(await state(page,button),'Sheet validation does not relock');
  await page.locator('#sts-title').fill('Вариант с проверкой прокрутки');
  for(const key of ['channel','service','segment','businessDescription']) {
    await page.locator(`#sts-${key}-input`).click();
    await page.locator(`#sts-${key}-list [data-option]:not([data-option=""])`).first().click();
    if(await page.locator(`#sts-${key}-list`).count())await page.keyboard.press('Escape');
  }
  await page.locator(button).click();await page.locator(sheet).waitFor({state:'hidden'});await paint(page);
  assert.equal(await page.locator('#stf-proposedVariants .stf-variant').count(),1,'Read and valid nested form adds one variant');
  complete(await state(page,config.button),'Parent rerender after saving child retains completed latch');
  await page.locator('#special-task-flow [data-stf-action=item-add][data-field=proposedVariants]').click();await paint(page);
  locked(await state(page,button),'Opening a new nested form resets its own latch');
  await page.screenshot({path:path.join(output,'special-mobile-nested-pending.png')});
  await page.locator(`${sheet} [data-stf-action=sheet-cancel]`).first().click();
  await closeTask(page,config);
  report('real mobile variant sheet: independent progress/latch, fixed edges, validation, save, parent rerender and new-sheet reset');
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:700},reducedMotion:'reduce',offline:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    await contracts(page);await actualForms(page);await lifecycleAndEditing(page);await responsive(page);await nestedInsight(page);await nestedSpecial(page);await normalMotion(page);
    assert.deepEqual(errors,[],'No uncaught runtime errors');
    console.log(`Screenshots: ${output}`);
  } catch(error) {await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(`Screenshots: ${output}`);throw error;}
  finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

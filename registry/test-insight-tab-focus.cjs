/* Keyboard focus surrounds the entire insight tab, including its close action.
 * node registry/test-insight-tab-focus.cjs [registry/index.html | standalone.html]
 * Isolated offline browser profile: does not modify a user's local storage. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-tab-focus-'));
let source = path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
if (path.basename(source) !== 'index.html') {
  const isolated = path.join(output,'isolated-prototype.html');
  fs.copyFileSync(source,isolated); source = isolated;
}
const tab = (page,id) => page.locator(`#insights-tabs [data-insight-tab="${id}"]`);
const close = (page,id) => page.locator(`#insights-tabs [data-insight-tab-close="${id}"]`);
const ready = page => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
const paint = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

async function focusBoundary(page,id,action,label) {
  const state = await tab(page,id).evaluate(element => {
    const wrapper = element.parentElement, cross = wrapper.querySelector('[data-insight-tab-close]'), track = wrapper.parentElement;
    const box = node => {const value = node.getBoundingClientRect();return {left:value.left,right:value.right,top:value.top,bottom:value.bottom,width:value.width};};
    const css = getComputedStyle(wrapper), thickness = parseFloat(css.outlineWidth), offset = parseFloat(css.outlineOffset);
    const bounds = box(wrapper), reach = thickness + offset;
    return {
      focusedTab:element === document.activeElement, focusedClose:cross === document.activeElement,
      tabVisible:element.matches(':focus-visible'), closeVisible:cross.matches(':focus-visible'),
      wrapperOutline:css.outlineStyle, width:css.outlineWidth, color:css.outlineColor, offset:css.outlineOffset,
      tabOutline:getComputedStyle(element).outlineStyle, closeOutline:getComputedStyle(cross).outlineStyle,
      closeBackground:getComputedStyle(cross).backgroundColor, label:box(element), cross:box(cross), track:box(track),
      ring:{left:bounds.left-reach,right:bounds.right+reach,top:bounds.top-reach,bottom:bounds.bottom+reach},
      pageWidth:document.documentElement.scrollWidth, viewport:innerWidth
    };
  });
  assert.equal(action === 'close' ? state.focusedClose && state.closeVisible : state.focusedTab && state.tabVisible,true,`${label}: actual ${action} keyboard focus`);
  assert.equal(state.wrapperOutline,'solid',`${label}: shared focus boundary is visible`);
  assert.equal(state.width,'2px',`${label}: standard focus thickness`);
  assert.equal(state.color,'rgb(0, 136, 255)',`${label}: standard blue focus token`);
  assert.equal(state.offset,'3px',`${label}: standard focus offset`);
  assert.equal(state.tabOutline,'none',`${label}: no cropped ID focus outline`);
  assert.equal(state.closeOutline,'none',`${label}: no second close outline`);
  assert.ok(state.label.right <= state.cross.left + 1,`${label}: ID and close do not overlap`);
  for (const child of [state.label,state.cross]) {
    assert.ok(state.ring.left < child.left && state.ring.right > child.right && state.ring.top < child.top && state.ring.bottom > child.bottom,`${label}: the complete action lies within the focus boundary`);
  }
  assert.ok(state.ring.left >= state.track.left - 1 && state.ring.right <= state.track.right + 1 && state.ring.top >= state.track.top - 1 && state.ring.bottom <= state.track.bottom + 1,`${label}: all four focus edges are inside the strip and remain unclipped`);
  assert.ok(state.pageWidth <= state.viewport + 1,`${label}: focus introduces no page overflow`);
  if (action === 'close') assert.notEqual(state.closeBackground,'rgba(0, 0, 0, 0)',`${label}: close target has a distinct keyboard highlight`);
}

async function screenshot(page,name) {
  const rect = await page.locator('#insights-tabs').boundingBox();
  const viewport = page.viewportSize(), padding = 12;
  const x = Math.max(0,rect.x-padding), y = Math.max(0,rect.y-padding);
  await page.screenshot({path:path.join(output,`${name}.png`),animations:'disabled',clip:{x,y,width:Math.min(viewport.width-x,rect.width+padding*2),height:Math.min(viewport.height-y,rect.height+padding*2)}});
}

async function keyboardFocus(page,id) {
  await tab(page,id).click();
  await page.mouse.move(1,1); await paint(page);
  assert.equal(await tab(page,id).evaluate(element => getComputedStyle(element.parentElement).outlineStyle),'none','Pointer selection does not leave a keyboard focus ring');
  assert.equal(await close(page,id).evaluate(element => getComputedStyle(element).display),'none','Pointer selection does not leave the close action expanded');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await paint(page);
}

(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1440,height:920},reducedMotion:'reduce',offline:true});
  await context.addInitScript(() => localStorage.setItem('bpm-registry-menu','collapsed'));
  const page = await context.newPage(), errors = [], failed = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror',error => errors.push(error.message));
  page.on('requestfailed',request => failed.push(request.url()));
  try {
    await page.goto(pathToFileURL(source).href+'#insights'); await ready(page); await paint(page);
    const ids = await page.evaluate(() => ['INS-000054',...BpmInsightStore.list().filter(row => row.id !== 'INS-000054').slice(0,2).map(row => row.id)]);
    await page.evaluate(ids => {
      for (const id of ids) {
        const button = document.createElement('button');button.type = 'button';button.dataset.insightOpen = id;
        document.querySelector('#insights-panel').append(button);button.click();button.remove();
      }
    },ids);
    await paint(page);
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:920}); await paint(page);
      await keyboardFocus(page,ids[0]);
      await focusBoundary(page,ids[0],'tab',`${width}px label`); await screenshot(page,`focus-label-${width}`);
      await page.keyboard.press('Tab'); await paint(page);
      await focusBoundary(page,ids[0],'close',`${width}px close`); await screenshot(page,`focus-close-${width}`);
      assert.equal(await close(page,ids[0]).getAttribute('aria-label'),`Закрыть вкладку ${ids[0]}`,'Close retains its separate accessible action');
      await page.keyboard.press('Shift+Tab'); await page.keyboard.press('ArrowRight'); await paint(page);
      const selected = await page.evaluate(() => document.activeElement?.dataset.insightTab);
      assert.equal(selected,ids[1],`${width}px: ArrowRight activates adjacent tab`);
      assert.equal(await tab(page,selected).getAttribute('aria-selected'),'true');
      await focusBoundary(page,selected,'tab',`${width}px arrow navigation`);
    }
    await page.setViewportSize({width:1440,height:920}); await keyboardFocus(page,ids[0]);
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await paint(page);
    assert.equal(await tab(page,ids[0]).count(),0,'Enter on close removes only the corresponding tab');
    assert.equal(await tab(page,ids[1]).getAttribute('aria-selected'),'true','Close activates a surviving neighbor');
    await focusBoundary(page,ids[1],'tab','After keyboard close');
    await page.keyboard.press('End'); await paint(page);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.insightTab),ids[2],'End activates the last tab');
    await page.keyboard.press('Home'); await paint(page);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.insightTab),ids[1],'Home activates the first tab');
    await page.keyboard.press('Delete'); await paint(page);
    assert.equal(await tab(page,ids[1]).count(),0,'Delete closes the focused tab');
    await focusBoundary(page,ids[2],'tab','After Delete');

    await page.locator('.insights-view-controls button[aria-pressed="true"]').click(); await ready(page); await paint(page);
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:920});
      await page.evaluate(() => window.scrollTo({top:600,behavior:'instant'}));
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#insights-tabs')).position === 'fixed');
      await page.mouse.move(1,1);
      // Select the registry's roving tab without activation; arrow keys would
      // open its detail and return the dock to the workspace row.
      await tab(page,ids[2]).focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await paint(page);
      await focusBoundary(page,ids[2],'tab',`${width}px docked tab`); await screenshot(page,`focus-dock-${width}`);
    }
    assert.deepEqual(errors,[],'No runtime errors'); assert.deepEqual(failed,[],'No missing assets or network dependencies');
    console.log(`PASS — Full tab focus boundary includes ID and close at 1440/390px, in-flow and docked; pointer behavior, Tab/Shift+Tab, arrows, Home/End, Enter close and Delete preserved. Screenshots: ${output}`);
  } catch (error) {
    await page.screenshot({path:path.join(output,'failure.png'),animations:'disabled'}).catch(() => {});
    console.error(`Screenshots: ${output}`); throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});

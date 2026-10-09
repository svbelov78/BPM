/* Internal insight-tab density, pointer behavior and keyboard accessibility.
 * node registry/test-insight-tabs.cjs [registry/index.html | standalone.html]
 * Uses an isolated offline browser profile, never a user's existing local data. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-tabs-'));
let source = path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
if (path.basename(source) !== 'index.html') {
  const isolated = path.join(output,'isolated-prototype.html');
  fs.copyFileSync(source,isolated);
  source = isolated;
}
const url = pathToFileURL(source).href + '#insights';
const tab = (page,id) => page.locator(`#insights-tabs [data-insight-tab="${id}"]`);
const close = (page,id) => page.locator(`#insights-tabs [data-insight-tab-close="${id}"]`);
const ready = page => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
const report = text => console.log(`PASS — ${text}`);
async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function noHover(page) {
  await page.mouse.move(1,1);
  await page.evaluate(() => document.activeElement?.blur());
  await paint(page);
  const buttons = await page.locator('#insights-tabs [data-insight-tab-close]').evaluateAll(elements => elements.map(element => ({
    id:element.dataset.insightTabClose,display:getComputedStyle(element).display,
    selected:element.parentElement.querySelector('[data-insight-tab]').getAttribute('aria-selected')
  })));
  assert.ok(buttons.length > 0,'Tab close controls exist');
  for (const button of buttons) assert.equal(button.display,'none',`${button.id}: close is hidden without hover/focus, selected=${button.selected}`);
}
async function dimensions(page) {
  return page.locator('#insights-tabs [data-insight-tab]').evaluateAll(elements => elements.map(element => {
    const wrapper = element.parentElement, rect = wrapper.getBoundingClientRect(), style = getComputedStyle(element);
    return {id:element.dataset.insightTab,selected:element.getAttribute('aria-selected') === 'true',width:rect.width,left:rect.left,right:rect.right,
      labelWidth:element.clientWidth,labelScroll:element.scrollWidth,textOverflow:style.textOverflow};
  }));
}
async function hoverFits(page,id,{mustExpand = false} = {}) {
  await noHover(page);
  const before = (await dimensions(page)).find(item => item.id === id);
  await tab(page,id).hover();
  await paint(page);
  const after = (await dimensions(page)).find(item => item.id === id);
  assert.ok(await close(page,id).isVisible(),`${id}: hovered tab reveals close`);
  assert.ok(after.labelScroll <= after.labelWidth + 1,`${id}: hovered ID fits fully (${after.labelScroll}/${after.labelWidth})`);
  if (mustExpand) assert.ok(after.width > before.width + 1,`${id}: crowded hovered tab expands (${before.width} → ${after.width})`);
  const state = await tab(page,id).evaluate(element => {
    const button = element.parentElement.querySelector('[data-insight-tab-close]');
    const wrapper = element.parentElement.getBoundingClientRect(), label = element.getBoundingClientRect(), close = button.getBoundingClientRect();
    return {labelRight:label.right,closeLeft:close.left,closeRight:close.right,wrapperRight:wrapper.right};
  });
  assert.ok(state.labelRight <= state.closeLeft + 1,`${id}: full ID and close never overlap`);
  assert.ok(state.closeRight <= state.wrapperRight + 1,`${id}: close stays inside its tab`);
  await noOverflow(page,`${id} hovered`);
  // The close affordance belongs to the tab: moving directly onto it keeps it
  // usable; moving outside the tab removes it immediately, not after a timer.
  await close(page,id).hover();
  assert.ok(await close(page,id).isVisible(),`${id}: close remains visible under its own pointer`);
  await page.mouse.move(1,1);
  await paint(page);
  assert.equal(await close(page,id).evaluate(element => getComputedStyle(element).display),'none',`${id}: mouse leave hides close immediately`);
}
async function noOverflow(page,label) {
  const box = await page.evaluate(() => {
    const track = document.getElementById('insights-tabs'), rect = track.getBoundingClientRect();
    const style = getComputedStyle(track), children = [...track.children];
    const minChildren = children.reduce((sum,child) => {
      const minimum = Number.parseFloat(getComputedStyle(child).minWidth);
      const expanded = child.matches(':hover') || !!child.querySelector(':focus-visible');
      return sum + (expanded ? child.getBoundingClientRect().width : Number.isFinite(minimum) ? minimum : 40);
    },0);
    const minimumRequired = minChildren + Math.max(0,children.length - 1) * (Number.parseFloat(style.columnGap) || 0)
      + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
    return {viewport:innerWidth,page:document.documentElement.scrollWidth,trackLeft:rect.left,trackRight:rect.right,
      client:track.clientWidth,scroll:track.scrollWidth,minimumRequired};
  });
  assert.ok(box.page <= box.viewport + 1,`${label}: no page overflow (${box.page}/${box.viewport})`);
  assert.ok(box.trackLeft >= -1 && box.trackRight <= box.viewport + 1,`${label}: tab strip remains inside viewport`);
  if (box.minimumRequired <= box.client + 1) assert.ok(box.scroll <= box.client + 1,`${label}: tabs that fit at minimum width do not scroll (${box.scroll}/${box.client})`);
}

async function main() {
  const start = Date.now();
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce',offline:true});
  await context.addInitScript(() => localStorage.setItem('bpm-registry-menu','collapsed'));
  const page = await context.newPage(), errors = [], failed = [];
  page.setDefaultTimeout(12000);
  page.on('pageerror',error => errors.push(String(error)));
  page.on('requestfailed',request => failed.push(request.url()));
  try {
    await page.goto(url);
    await ready(page);
    const records = await page.evaluate(() => window.BpmInsightStore.list().map(row => ({id:row.id,status:row.status,source:row.source})));
    const original = records.map(row => row.id), approvalRecords = records.filter(row => row.source === 'ТБ' && row.status === 'Новый');
    assert.equal(original.length,16,'Start with the sixteen real demonstration records');
    assert.equal(approvalRecords.length,4,'Four new territorial-bank approval examples are present');
    let normalTabCount = 0;
    for (const [index,id] of original.entries()) {
      await page.locator(`#insights-results [data-insight-open="${id}"]`).click();
      normalTabCount++;
      assert.equal(await tab(page,id).getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('#insights-tabs [data-insight-tab]').count(),normalTabCount);
      assert.equal(await page.locator('dialog[open]').count(),0,'Viewing an insight uses internal tabs, not dialogs');
      await noHover(page);
      if (index < original.length - 1) {await page.locator('.insights-view-controls button[aria-pressed="true"]').click(); await ready(page);}
    }
    assert.equal(normalTabCount,16,'All sixteen detail and approval examples open in internal tabs');
    const initialTabs = await dimensions(page), originalActive = original.at(-1);
    await hoverFits(page,originalActive);
    await hoverFits(page,original[0]);
    // A pointer-selected tab must not leave its close visible merely because the
    // tab received focus. Keyboard focus is tested independently below.
    await tab(page,original[0]).click();
    await page.mouse.move(1,1);
    await paint(page);
    assert.equal(await close(page,original[0]).evaluate(element => getComputedStyle(element).display),'none','Mouse selection does not count as keyboard focus-visible');
    report('All sixteen actual record clicks open tabs, including approval cases; closes remain hover-only without sticky pointer focus');

    // Populate real store records, then exercise the same delegated public DOM
    // action as the registry titles. This avoids twenty extra two-second loader
    // waits and never calls or exposes a private registry/controller method.
    const extra = await page.evaluate(() => {
      const ids = [];
      for (let i = 0; i < 20; i++) {
        const row = window.BpmInsightStore.create({title:`Проверка плотности вкладок ${i + 1}`,description:'Локальная тестовая запись',solution:'Проверка адаптива'});
        ids.push(row.id);
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.insightOpen = row.id;
        document.getElementById('insights-panel').append(button);
        button.click(); button.remove();
      }
      return ids;
    });
    assert.equal(await page.locator('#insights-tabs [data-insight-tab]').count(),36);
    await noHover(page);
    const crowded = await dimensions(page);
    assert.ok(Math.max(...crowded.map(item => item.width)) < Math.max(...initialTabs.map(item => item.width)),'More open tabs share space by shrinking');
    assert.ok(crowded.some(item => item.labelScroll > item.labelWidth + 1 && item.textOverflow === 'ellipsis'),'Crowded IDs truncate with ellipsis');
    report('Twenty new store records use the registry action; 36 real tabs shrink and truncate');

    for (const width of [1920,1440,768,390,3840]) {
      await page.setViewportSize({width,height:width === 3840 ? 2160 : 1080});
      await page.keyboard.press('Escape');
      await noHover(page);
      await noOverflow(page,`${width}px default`);
      const geometry = await dimensions(page), widths = geometry.map(item => item.width);
      // Proportional digits have slightly different intrinsic widths. Require
      // balanced shrinking, not the unrelated TOP-journey equal-card constraint.
      const widthTolerance = Math.max(4,Math.min(...widths) * .08);
      assert.ok(Math.max(...widths) - Math.min(...widths) <= widthTolerance,`${width}px: non-hovered tabs shrink proportionally (${widths.map(value => value.toFixed(2)).join(', ')})`);
      assert.ok(Math.min(...widths) >= 39,`${width}px: tabs keep their usable 40px minimum; any extreme overflow stays local`);
      if (width <= 1920) assert.ok(geometry.some(item => item.labelScroll > item.labelWidth + 1),`${width}px: IDs truncate instead of widening the layout`);
      const selected = geometry.find(item => item.selected).id, unselected = geometry.find(item => !item.selected).id;
      await hoverFits(page,selected,{mustExpand:width <= 1920});
      await noOverflow(page,`${width}px selected hover`);
      await hoverFits(page,unselected,{mustExpand:width <= 1920});
      await noOverflow(page,`${width}px inactive hover`);
      await tab(page,unselected).hover();
      await paint(page);
      await page.screenshot({path:path.join(output,`tabs-hover-${width}.png`),animations:'disabled'});
      await noHover(page);
      await page.screenshot({path:path.join(output,`tabs-default-${width}.png`),animations:'disabled'});
    }
    report('Proportional shrinking, full hovered IDs and local-only overflow at 390 / 768 / 1440 / 1920 / 3840 px');

    await page.setViewportSize({width:1920,height:1080});
    await noHover(page);
    await tab(page,extra.at(-1)).focus();
    await page.keyboard.press('ArrowLeft');
    await paint(page);
    const focusedId = await page.evaluate(() => document.activeElement?.dataset.insightTab);
    assert.ok(focusedId,'Arrow key moves actual keyboard focus to another tab');
    assert.equal(await tab(page,focusedId).getAttribute('aria-selected'),'true');
    assert.equal(await tab(page,focusedId).evaluate(element => element.matches(':focus-visible')),true,'Tab indicates keyboard focus');
    assert.ok(await close(page,focusedId).isVisible(),'Keyboard focus reveals a usable close affordance');
    await page.keyboard.press('Tab');
    await paint(page);
    const afterTab = await page.evaluate(() => ({id:document.activeElement?.dataset.insightTabClose,html:document.activeElement?.outerHTML.slice(0,500)}));
    assert.equal(afterTab.id,focusedId,`Tab key reaches the selected close; actual focus: ${afterTab.html}`);
    await page.keyboard.press('Enter');
    assert.equal(await tab(page,focusedId).count(),0,'Keyboard activation closes only its own tab');
    assert.equal(await page.locator('#insights-tabs [data-insight-tab]').count(),35);
    assert.ok(await page.locator('#insights-tabs [data-insight-tab][aria-selected="true"]').count() === 1,'Closing restores a valid active neighbor');
    await noHover(page);
    await noOverflow(page,'After keyboard close');
    assert.deepEqual(errors,[],'No runtime errors');
    assert.deepEqual(failed,[],'No missing assets or network dependencies');
    report('Focus-visible close is keyboard-accessible and restores a neighboring tab');
    console.log(`Screenshots: ${output}`);
    console.log(`Duration: ${((Date.now() - start) / 1000).toFixed(1)}s`);
  } catch (error) {
    await page.screenshot({path:path.join(output,'failure.png'),animations:'disabled'}).catch(() => {});
    console.error(`Screenshots: ${output}`);
    throw error;
  } finally {await browser.close();}
}
main().catch(error => {console.error(error);process.exitCode = 1;});

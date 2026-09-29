/* Dynamics hover regression: explicit synthetic percentages, real drawer entry
 * points, keyboard/touch behavior, exact value centering and entrance motion.
 * Optional argv[2]: absolute standalone HTML, copied alone and tested offline.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const standalone = process.argv[2];
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-dynamics-hover-'));
let file = path.join(__dirname, 'index.html');
if (standalone) {
  assert(path.isAbsolute(standalone), 'Provide an absolute standalone path');
  file = path.join(output, 'relocated-offline.html');
  fs.copyFileSync(standalone, file);
}
const base = pathToFileURL(file).href;
const percentages = [21.8,58.4,99.3,45.5,68.4,70.6,74.8,91.7,72.3,29.2,67.6,78.8];
const heights = percentages.map(value => Math.max(4, 101 * value / 100));
const percentageLabel = value => `${String(value).replace('.', ',')} %`;
const monthLabels = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const report = text => console.log(`PASS — ${text}`);
const near = (actual, expected, label, tolerance = 1) => assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const registryReady = page => page.waitForFunction(() => document.getElementById('results')?.getAttribute('aria-busy') === 'false');
const drawerReady = page => page.waitForFunction(() => {
  const drawer = document.getElementById('process-drawer');
  return drawer?.open && !drawer.classList.contains('pd-is-loading') && !drawer.querySelector('.pd-main').inert;
});
const tip = page => page.locator('.pd-dynamics-hover-value[role="tooltip"]:visible');
const month = page => page.locator('.pd-dynamics-hover-month:visible');
const hits = page => page.locator('.pd-dynamics-hit');
const active = page => page.locator('.pd-dynamics-hit.is-active');
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function noHover(page, label) {
  await page.waitForFunction(() => !document.querySelector('.pd-dynamics-hit.is-active'));
  assert.equal(await tip(page).count(), 0, `${label}: no visible hover value`);
  assert.equal(await month(page).count(), 0, `${label}: no visible hover month`);
  assert.equal(await page.locator('.pd-dynamics-plot.has-active-month').count(), 0, `${label}: plot leaves active-month state`);
  assert.deepEqual(await page.locator('.pd-dynamics-labels span').evaluateAll(elements => elements.filter(element => !element.closest('[inert]') && (element.classList.contains('is-obscured') || getComputedStyle(element).visibility !== 'visible')).map(element => element.textContent)), [], `${label}: persistent axis labels are restored outside the inert loading skeleton`);
}
async function open(page, trigger, entity = 'processes') {
  await trigger.click();
  await drawerReady(page);
  assert.equal(await page.locator('#process-drawer').getAttribute('data-pd-entity'), entity);
}
async function close(page) {
  await page.locator('#process-drawer [data-pd-action="close"]').click();
  await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
  assert.equal(await tip(page).count(), 0, 'Closing leaves no visible tooltip');
  assert.equal(await month(page).count(), 0, 'Closing leaves no visible month');
}
async function plotReady(page) {
  await page.locator('.pd-dynamics-widget').scrollIntoViewIfNeeded();
  await paint(page);
  assert.equal(await page.locator('.pd-dynamics-plot').getAttribute('role'), 'group', 'Interactive plot is not an opaque image');
  assert.equal(await hits(page).count(), 12, 'All January–December bars have interactive hit areas');
  assert.equal(await page.locator('.pd-dynamics-bar').count(), 12, 'All 12 months have data bars');
  assert.equal(await page.locator('.pd-dynamics-empty, .pd-dynamics-unstriped').count(), 0, 'No empty or unstriped months remain');
  assert.deepEqual(await hits(page).evaluateAll(elements => elements.map(element => element.dataset.dynamicsValue)), percentages.map(percentageLabel), 'Every month exposes its explicit synthetic percentage');
  assert.deepEqual(await page.locator('.pd-dynamics-labels span').allTextContents(), ['янв','дек'], 'Persistent axis covers January through December');
  const axis = await page.locator('.pd-dynamics-plot').evaluate(plot => {
    const labels = [...plot.querySelectorAll('.pd-dynamics-labels span')];
    const bars = [...plot.querySelectorAll('.pd-dynamics-hit')];
    const center = element => {const rect = element.getBoundingClientRect(); return rect.x + rect.width / 2;};
    return {first:center(labels[0]),last:center(labels[1]),january:center(bars[0]),december:center(bars[11])};
  });
  near(axis.first, axis.january, 'January static label is centered below the first bar', .1);
  near(axis.last, axis.december, 'December static label is centered below the twelfth bar', .1);
}
async function barGeometry(page, label) {
  const values = await page.locator('.pd-dynamics-bar').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element), stripe = getComputedStyle(element, '::before');
    return {height:element.getBoundingClientRect().height, classes:element.className, border:style.borderTopWidth,
      color:style.borderTopColor, stripe:stripe.backgroundImage, stripeHeight:stripe.height};
  }));
  values.forEach((value, index) => {
    const percentage = percentages[index];
    near(value.height, heights[index], `${label}: month ${index + 1} height is proportional to ${percentage}%`, .1);
    assert.equal(value.border, '4px', `${label}: month ${index + 1} has its efficiency stripe`);
    if (percentage >= 65 && percentage < 85) {
      assert.match(value.classes, /pd-dynamics-on-track/);
      assert.match(value.stripe, /gradient/);
      assert.equal(value.stripeHeight, '4px');
    } else {
      const expectedClass = percentage >= 85 ? 'pd-dynamics-bar' : percentage >= 45 ? 'pd-dynamics-bar pd-dynamics-warning' : 'pd-dynamics-bar pd-dynamics-negative';
      assert.equal(value.classes, expectedClass, `${label}: month ${index + 1} uses the percentage threshold tone`);
      assert.equal(value.color, percentage >= 85 ? 'rgb(52, 199, 89)' : percentage >= 45 ? 'rgb(255, 141, 40)' : 'rgb(255, 56, 60)', `${label}: month ${index + 1} tone color`);
    }
  });
}
async function verifyHover(page, index, label, geometry = true) {
  assert.equal(await active(page).count(), 1, `${label}: only one active month`);
  assert(await hits(page).nth(index).evaluate(element => element.classList.contains('is-active')), `${label}: correct month active`);
  assert.equal(await tip(page).count(), 1, `${label}: exactly one visible tooltip`);
  assert.equal(await month(page).count(), 1, `${label}: exactly one visible hover month`);
  assert.equal((await month(page).innerText()).trim(), monthLabels[index], `${label}: correct explicit three-letter Russian month`);
  assert.equal((await tip(page).innerText()).replace(/\s+/g, ' ').trim(), percentageLabel(percentages[index]), `${label}: explicit synthetic numeric percentage, not a placeholder`);
  assert.equal(await hits(page).nth(index).locator('.pd-dynamics-bar').evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 136, 255, 0.1)', `${label}: design-system blue highlight`);
  if (!geometry) return;
  const result = await tip(page).evaluate(element => {
    const rect = node => {const r = node.getBoundingClientRect(); return {x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height};};
    const ancestors = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      if (/(hidden|auto|scroll|clip)/.test(`${css.overflowX} ${css.overflowY}`)) ancestors.push({name:parent.className || parent.tagName, clipsX:/hidden|auto|scroll|clip/.test(css.overflowX), clipsY:/hidden|auto|scroll|clip/.test(css.overflowY), ...rect(parent)});
    }
    const plot = element.closest('.pd-dynamics-plot');
    const month = plot.querySelector('.pd-dynamics-hover-month');
    const monthStyle = getComputedStyle(month);
    const tipStyle = getComputedStyle(element);
    const text = document.createRange();
    text.selectNodeContents(element);
    return {tip:rect(element),text:rect(text),tipStyle:{fontSize:tipStyle.fontSize,lineHeight:tipStyle.lineHeight},month:rect(month), monthStyle:{fontSize:monthStyle.fontSize,lineHeight:monthStyle.lineHeight},
      axis:[...plot.querySelectorAll('.pd-dynamics-labels span')].map(node => ({...rect(node), text:node.textContent, visibility:getComputedStyle(node).visibility})),
      hit:rect(document.querySelector('.pd-dynamics-hit.is-active')), ancestors, viewport:innerWidth, viewportHeight:innerHeight};
  });
  near(result.tip.height, 24, `${label}: Figma value line height`);
  assert.deepEqual(result.tipStyle, {fontSize:'17px',lineHeight:'24px'}, `${label}: value preserves Figma 17px/24px typography`);
  near(result.tip.y, result.hit.y - 32, `${label}: value is 32px above the bar`);
  near(result.tip.x + result.tip.width / 2, result.hit.x + result.hit.width / 2, `${label}: tooltip container is centered over its own bar without edge clamping`, .1);
  near(result.text.x + result.text.width / 2, result.hit.x + result.hit.width / 2, `${label}: actual percentage text is centered over its own bar`, .1);
  near(result.month.height, 18, `${label}: month has the axis 18px line height`, .1);
  assert.deepEqual(result.monthStyle, {fontSize:'13px',lineHeight:'18px'}, `${label}: month uses the existing axis typography`);
  near(result.month.y, result.hit.bottom + 4, `${label}: month is 4px below the bar baseline`, .1);
  near(result.month.x + result.month.width / 2, result.hit.x + result.hit.width / 2, `${label}: month is centered below its own bar`, .1);
  for (const axis of result.axis) {
    near(result.month.y, axis.y, `${label}: hover month shares the persistent axis baseline`, .1);
    assert.equal(axis.visibility, 'hidden', `${label}: persistent ${axis.text} axis label hides while the hover month is visible`);
  }
  assert(result.tip.x >= -1 && result.tip.right <= result.viewport + 1 && result.tip.y >= -1 && result.tip.bottom <= result.viewportHeight + 1, `${label}: value fits viewport`);
  assert(result.month.x >= -1 && result.month.right <= result.viewport + 1 && result.month.y >= -1 && result.month.bottom <= result.viewportHeight + 1, `${label}: month fits viewport`);
  for (const ancestor of result.ancestors) {
    if (ancestor.clipsX) assert(result.tip.x >= ancestor.x - 1 && result.tip.right <= ancestor.right + 1, `${label}: no horizontal clipping by ${ancestor.name}`);
    if (ancestor.clipsY) assert(result.tip.y >= ancestor.y - 1 && result.tip.bottom <= ancestor.bottom + 1, `${label}: no vertical clipping by ${ancestor.name}`);
    if (ancestor.clipsX) assert(result.month.x >= ancestor.x - 1 && result.month.right <= ancestor.right + 1, `${label}: month is not horizontally clipped by ${ancestor.name}`);
    if (ancestor.clipsY) assert(result.month.y >= ancestor.y - 1 && result.month.bottom <= ancestor.bottom + 1, `${label}: month is not vertically clipped by ${ancestor.name}`);
  }
}
async function hoverAll(page, label) {
  await plotReady(page);
  await barGeometry(page, label);
  for (let index = 0; index < percentages.length; index++) {
    await hits(page).nth(index).hover();
    await verifyHover(page, index, `${label}/month ${index + 1}`);
  }
  await page.mouse.move(1, 1);
  await noHover(page, `${label}/pointer exit`);
  await barGeometry(page, `${label}/after hover`);
}
async function edgeScreenshots(page, width) {
  for (const index of [0,1,11]) {
    await hits(page).nth(index).hover();
    await verifyHover(page, index, `${width}px edge screenshot/month ${index + 1}`);
    await page.locator('.pd-dynamics-widget').screenshot({path:path.join(output, `hover-${width}-${monthLabels[index]}.png`)});
  }
  await page.mouse.move(1, 1);
  await noHover(page, `${width}px edge screenshots cleanup`);
}
async function keyboard(page) {
  await hits(page).first().focus();
  await verifyHover(page, 0, 'Keyboard focus');
  await page.keyboard.press('ArrowRight');
  assert(await hits(page).nth(1).evaluate(element => element === document.activeElement), 'ArrowRight moves focus to next month');
  await verifyHover(page, 1, 'ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await verifyHover(page, 0, 'ArrowLeft');
  await page.keyboard.press('Escape');
  await noHover(page, 'First Escape');
  assert.equal(await page.locator('#process-drawer[open]').count(), 1, 'First Escape dismisses hovered parameters only');
  await page.keyboard.press('Escape');
  await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
  report('Keyboard focus, month arrows, first Escape clears value/month and restores axis; second closes drawer');
}
async function smoke(page, label) {
  await plotReady(page);
  await hits(page).nth(8).hover();
  await verifyHover(page, 8, label);
  await page.mouse.move(1, 1);
  await noHover(page, label);
  await close(page);
}
async function entryPoints(page) {
  await page.setViewportSize({width:1920, height:1080});
  await page.goto(`${base}#main`); await registryReady(page);
  await page.locator('#processes-tab').click(); await registryReady(page);
  await page.locator('#table-view').click(); await registryReady(page);
  await open(page, page.locator('.registry-table [data-detail]').first());
  await smoke(page, 'Registry table entry');
  await page.locator('#structure-toggle').click();
  await page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
  if (await page.locator('#structure-processes-tab').getAttribute('aria-pressed') !== 'true') {
    await page.locator('#structure-processes-tab').click();
    await page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
  }
  const chain = await page.evaluate(() => {
    for (const root of window.BPM_STRUCTURE.roots) for (const division of root.children) for (const product of division.children) if (product.total) return [root.id, division.id, product.id];
  });
  assert(chain, 'There is a nonempty source structure branch');
  for (const id of chain) await page.locator(`[data-expand="${id}"]`).click();
  await open(page, page.locator(`[data-node="${chain[2]}"] [data-structure-detail]`).first());
  await smoke(page, 'Expanded structure entry');
  await page.locator('#structure-toggle').click(); await registryReady(page);
  await page.locator('#paths-tab').click(); await registryReady(page);
  await open(page, page.locator('#results [data-detail]').first(), 'paths');
  assert.equal(await page.locator('.pd-dynamics-plot').count(), 0, 'Journey overview is not silently given a new chart');
  await open(page, page.locator('[data-jd-process="0"]').first());
  await smoke(page, 'Linked process entry from journey');
  await page.locator('#cabinet-nav').click();
  await page.waitForFunction(() => !document.getElementById('cabinet-panel').hidden && document.getElementById('cabinet-feed-insights')?.getAttribute('aria-busy') === 'false');
  await open(page, page.locator('[data-cabinet-open="cabinet-process-1"] .card-title').first());
  await smoke(page, 'Cabinet process entry');
  report('Shared dynamics hover works from registry table, structure, linked КП process and cabinet');
}

(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  const context = await browser.newContext({offline:true, viewport:{width:1920, height:1080}, reducedMotion:'reduce', hasTouch:true});
  const errors = [], failed = [], unexpected = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  context.on('requestfailed', request => failed.push(`${request.url().slice(0,160)}: ${request.failure()?.errorText}`));
  if (standalone) context.on('request', request => {
    if (!/^(data:|blob:)/.test(request.url()) && request.url().split(/[?#]/)[0] !== base) unexpected.push(request.url().slice(0,160));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  try {
    await page.goto(`${base}#main`); await registryReady(page);
    await page.locator('#processes-tab').click(); await registryReady(page);
    const trigger = page.locator('#results [data-detail]').first();
    await trigger.click();
    assert(await page.locator('#process-drawer').evaluate(element => element.classList.contains('pd-is-loading')), 'Opening starts with loading skeleton');
    const first = await hits(page).first().boundingBox();
    if (first) await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await noHover(page, 'Inert loading content');
    await drawerReady(page);
    await hoverAll(page, 'Desktop 1920');
    await edgeScreenshots(page, 1920);
    await keyboard(page);
    await open(page, trigger);
    await noHover(page, 'Reopened drawer starts clear');
    for (const width of [1440,390,320]) {
      await page.setViewportSize({width, height:1000});
      await hoverAll(page, `Responsive ${width}`);
      await edgeScreenshots(page, width);
      await hits(page).nth(8).tap();
      await verifyHover(page, 8, `Touch ${width}`);
      await page.locator('.pd-dynamics-widget').screenshot({path:path.join(output, `mobile-hover-${width}.png`)});
      await page.keyboard.press('Escape');
      await noHover(page, `Touch ${width} dismissed`);
      const dimensions = await page.evaluate(() => ({viewport:innerWidth, html:document.documentElement.scrollWidth, body:document.body.scrollWidth, main:document.querySelector('.pd-main').scrollWidth, client:document.querySelector('.pd-main').clientWidth}));
      assert(dimensions.html <= width + 1 && dimensions.body <= width + 1 && dimensions.main <= dimensions.client + 1, `${width}px: hover does not cause horizontal overflow`);
    }
    await close(page);
    report('1920/1440/390/320: all 12 percentage texts centered above their bars, matching synthetic values/heights/tones, hover months centered on axis, no clipping, mouse and tap');
    await entryPoints(page);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(() => window.BpmProcessDrawer.open(window.BPM_DATA.find(row => row.entity === 'processes')));
    await drawerReady(page); await plotReady(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.pd-dynamics-bar')].every(element => {
      const matrix = getComputedStyle(element).transform;
      return matrix === 'none' || matrix === 'matrix(1, 0, 0, 1, 0, 0)';
    }));
    await barGeometry(page, 'Entrance motion completed');
    await hits(page).nth(8).hover(); await verifyHover(page, 8, 'Hover after entrance motion');
    await close(page);
    await page.evaluate(async () => {await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {})));});
    assert.deepEqual(await page.evaluate(() => [...document.images].filter(image => !image.naturalWidth).map(image => image.getAttribute('src').slice(0,100))), [], 'No broken chart or existing assets');
    assert.deepEqual(errors, [], 'No runtime errors');
    assert.deepEqual(failed, [], 'No failed resource requests');
    assert.deepEqual(unexpected, [], 'Standalone needs no sibling files or network');
    report(`${standalone ? 'Relocated standalone' : 'Source'}: hover regression complete; screenshots ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});

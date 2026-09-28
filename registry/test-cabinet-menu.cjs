/* Shared Cabinet menu: no submenu affordance, consistent selected state.
 * node registry/test-cabinet-menu.cjs [path/to/standalone.html]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file = path.resolve(process.argv[2] || process.env.BPM_CABINET_MENU_FILE || path.join(__dirname, 'index.html'));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-cabinet-menu-'));

async function selected(page, active, label) {
  const state = await page.locator('#cabinet-nav').evaluate(button => {
    const tile = button.querySelector('.nav-tile'), icon = tile.querySelector('img');
    return {current:button.classList.contains('current'), aria:button.getAttribute('aria-current'),
      background:getComputedStyle(button).backgroundColor, text:getComputedStyle(button.querySelector('.menu-label')).color,
      iconFilter:getComputedStyle(icon).filter, tileImage:getComputedStyle(tile).backgroundImage,
      tileColor:getComputedStyle(tile).backgroundColor, chevrons:button.querySelectorAll('.nav-chevron').length,
      expanded:button.hasAttribute('aria-expanded'), controls:button.hasAttribute('aria-controls'),
      width:button.getBoundingClientRect().width};
  });
  assert.equal(state.chevrons, 0, `${label}: no Cabinet chevron`);
  assert.equal(state.expanded, false, `${label}: not exposed as an accordion`);
  assert.equal(state.controls, false, `${label}: no nonexistent submenu`);
  assert.equal(state.current, active, `${label}: current class`);
  assert.equal(state.aria, active ? 'page' : null, `${label}: current page accessibility`);
  if (active) {
    assert.equal(state.background, 'rgb(0, 136, 255)', `${label}: blue selected fill`);
    assert.equal(state.text, 'rgb(255, 255, 255)', `${label}: white selected label`);
    assert.equal(state.iconFilter, 'brightness(0) invert(1)', `${label}: white home icon`);
    assert.equal(state.tileImage, 'none', `${label}: no gradient beneath selected home`);
    assert.equal(state.tileColor, 'rgba(0, 0, 0, 0)', `${label}: selected icon tile transparent`);
  } else {
    assert.notEqual(state.background, 'rgb(0, 136, 255)', `${label}: deselected fill resets`);
    assert.equal(state.text, 'rgb(26, 26, 26)', `${label}: deselected label resets`);
    assert.equal(state.iconFilter, 'none', `${label}: deselected icon resets`);
    assert.match(state.tileImage, /linear-gradient/, `${label}: default tile restored`);
  }
  return state;
}
async function openMobile(page) {
  if (await page.locator('#mobile-menu').isVisible() && !(await page.locator('body').evaluate(body => body.classList.contains('mobile-menu-open')))) {
    await page.locator('#mobile-menu').click();
  }
}
async function mobileMenuIcon(page) {
  const icon = page.locator('#mobile-menu img');
  await icon.evaluate(image => image.decode());
  const state = await icon.evaluate(image => ({src:image.getAttribute('src'), standalone:document.documentElement.dataset.bpmStandalone === 'true', loaded:image.complete && image.naturalWidth > 0,
    width:image.getBoundingClientRect().width, height:image.getBoundingClientRect().height}));
  if (state.standalone) {
    const match = state.src.match(/^data:image\/svg\+xml((?:;[^,]*)?),(.*)$/s);
    assert.ok(match, 'mobile: inline burger is an SVG');
    const bytes = match[1].split(';').includes('base64') ? Buffer.from(match[2], 'base64') : Buffer.from(decodeURIComponent(match[2]));
    assert.deepEqual(bytes, fs.readFileSync(path.join(__dirname, 'assets/burger.svg')), 'mobile: inline burger matches the source asset');
  } else {
    assert.equal(state.src, 'assets/burger.svg', 'mobile: uses the dedicated burger asset');
  }
  assert.equal(state.loaded, true, 'mobile: burger loads offline');
  assert.equal(state.width, 24, 'mobile: burger renders 24px wide');
  assert.equal(state.height, 24, 'mobile: burger renders 24px high');
}
async function mobileMenuState(page, open, label) {
  assert.equal(await page.locator('body').evaluate(body => body.classList.contains('mobile-menu-open')), open, `${label}: mobile menu state`);
  assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'), String(open), `${label}: mobile menu accessibility`);
}
async function navigate(page, id, service, label) {
  await openMobile(page);
  if (await page.locator('body').evaluate(body => innerWidth >= 768 && body.classList.contains('menu-collapsed'))) {
    await page.mouse.move(1500, 150);
    await page.locator('#sidebar').hover();
    await page.locator('body.menu-peek').waitFor();
  }
  await page.locator(`#${id}`).click();
  await page.waitForFunction(service => {
    const body = document.body;
    return service === 'cabinet' ? body.classList.contains('cabinet-mode') :
      service === 'tasks' ? body.classList.contains('tasks-mode') :
      !body.classList.contains('cabinet-mode') && !body.classList.contains('tasks-mode');
  }, service);
  await selected(page, service === 'cabinet', label);
  assert.equal(await page.locator(`#${id}`).getAttribute('aria-current'), 'page', `${label}: new page selected`);
  if (await page.locator('#mobile-menu').isVisible()) await mobileMenuState(page, false, label);
}

(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1600,height:1000}, reducedMotion:'reduce', offline:true});
  await context.addInitScript(() => localStorage.setItem('bpm-registry-menu', 'expanded'));
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${pathToFileURL(file).href}#cabinet`);
    await page.locator('body.cabinet-mode').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await selected(page, true, 'full');
    await page.locator('#cabinet-nav').hover();
    await selected(page, true, 'full/hover');
    await page.screenshot({path:path.join(output, 'full.png')});
    for (const mode of ['full', 'peek', 'mobile']) {
      if (mode === 'peek') {
        await page.locator('#collapse-menu').click();
        await page.mouse.move(1500, 150);
        await page.locator('body.menu-collapsed:not(.menu-peek)').waitFor();
        const collapsed = await selected(page, true, 'collapsed');
        assert.equal(collapsed.width, 40, 'collapsed: icon-only width unchanged');
        await page.screenshot({path:path.join(output, 'collapsed.png')});
        await page.locator('#cabinet-nav').hover();
        await page.locator('body.menu-peek').waitFor();
        await selected(page, true, 'peek');
        await page.screenshot({path:path.join(output, 'peek.png')});
      } else if (mode === 'mobile') {
        await page.setViewportSize({width:390,height:844});
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await mobileMenuIcon(page);
        await page.screenshot({path:path.join(output, 'mobile-closed.png')});
        await openMobile(page);
        await mobileMenuState(page, true, 'mobile/open');
        await page.keyboard.press('Escape');
        await mobileMenuState(page, false, 'mobile/escape');
        await openMobile(page);
        await mobileMenuState(page, true, 'mobile/reopen');
        await selected(page, true, 'mobile');
        await page.screenshot({path:path.join(output, 'mobile.png')});
      }
      await navigate(page, 'registry-nav', 'registry', `${mode}/registry`);
      await navigate(page, 'cabinet-nav', 'cabinet', `${mode}/return-from-registry`);
      await navigate(page, 'tasks-nav', 'tasks', `${mode}/tasks`);
      await navigate(page, 'cabinet-nav', 'cabinet', `${mode}/return-from-tasks`);
      console.log(`PASS Cabinet menu ${mode}: no chevron; active blue/white; route state resets`);
    }
    assert.deepEqual(errors, [], 'No browser errors');
    console.log(`PASS Cabinet menu: ${file}\nScreenshots: ${output}`);
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

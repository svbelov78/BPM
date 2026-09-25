/* Home/Cabinet browser regression. Supports the source page and the offline build.
 * BPM_CABINET_STANDALONE=1 node test-cabinet.cjs
 * BPM_CABINET_URL=file:///path/to/standalone.html BPM_CABINET_EMBEDDED=1 node test-cabinet.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const standalone = process.env.BPM_CABINET_STANDALONE === '1';
const base = process.env.BPM_CABINET_URL || pathToFileURL(path.join(__dirname, standalone ? '../Sber-BPM-Registry-Standalone.html' : 'index.html')).href;
const embedded = standalone || process.env.BPM_CABINET_EMBEDDED === '1';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-cabinet-qa-'));
const report = message => console.log(`PASS — ${message}`);
const section = (page, key) => page.locator(`[data-cabinet-section="${key}"]`);
const cards = (page, key) => section(page, key).locator(`[data-cabinet-kind="${key}"]`);
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('#cabinet-panel')?.hidden && document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy') === 'false');
}
async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function settledCounters(page) {
  await page.waitForFunction(() => !document.querySelector('#cabinet-panel [data-counting="true"]'));
}
async function fresh(page) {
  await page.setViewportSize({width:1920, height:1080});
  await page.goto(base.split('#')[0]);
  await ready(page);await settledCounters(page);
}
async function count(page, key, expected) {
  assert.equal(await cards(page, key).count(), expected, `${key}: expected ${expected} cards`);
}
async function filter(page, key, value) {
  await page.locator(`#cabinet-filter-${key}`).click();
  await page.locator('.cabinet-menu').getByRole('menuitemradio', {name:value, exact:true}).click();
  await page.keyboard.press('Escape');
}
async function resetFilter(page, key) {
  await page.locator(`#cabinet-filter-${key}`).click();
  await page.locator('.cabinet-menu [data-clear]').click();
  await page.keyboard.press('Escape');
}
async function assets(page, label) {
  await paint(page);
  const images = await page.evaluate(() => [...document.images].map(image => ({src:(image.getAttribute('src') || '').slice(0,130), width:image.naturalWidth, height:image.naturalHeight})));
  assert.ok(images.length > 20, `${label}: image assets exist`);
  assert.deepEqual(images.filter(image => !image.width || !image.height), [], `${label}: every image decodes`);
  if (embedded) assert.ok(images.every(image => /^(data:|blob:)/.test(image.src)), `${label}: every image is embedded`);
  assert.ok(await page.evaluate(() => [...document.fonts].every(font => font.status !== 'error')), `${label}: fonts load`);
}
async function overflow(page, width, label) {
  await paint(page);
  const size = await page.evaluate(() => ({document:document.documentElement.scrollWidth, body:document.body.scrollWidth}));
  assert.ok(size.document <= width + 1 && size.body <= width + 1, `${label}/${width}px: no page overflow (${JSON.stringify(size)})`);
  const boxes = await page.locator('#cabinet-panel .cabinet-card').evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect();return {left:r.left, right:r.right, width:r.width};
  }));
  assert.ok(boxes.every(box => box.width > 0 && box.left >= -1 && box.right <= width + 1), `${label}/${width}px: cards fit the viewport`);
}

async function loadingAndContent(page) {
  const start = Date.now();
  await page.goto(base.split('#')[0]);
  await page.locator('#cabinet-feed-insights[aria-busy="true"]').waitFor();
  assert.equal(await page.locator('#cabinet-panel .cabinet-skeleton').count(),13,'Both feeds and entity grids have skeletons');
  assert.equal(await page.locator('#cabinet-panel .skeleton-shape').first().evaluate(element => getComputedStyle(element, '::after').animationName),'bpm-shimmer');
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#cabinet-feed-insights').getAttribute('aria-busy'),'true','Loading remains before two seconds');
  await ready(page);
  assert.ok(Date.now() - start >= 1800, 'Home loads for approximately two seconds');
  assert.equal(await page.title(),'Мой кабинет — Sber BPM');
  assert.equal(await page.locator('#cabinet-nav').getAttribute('aria-current'),'page');
  assert.equal(await page.locator('#registry-panel').isVisible(),false);
  assert.equal(await page.locator('#tasks-panel').isVisible(),false);
  for (const [key, n] of [['insights',10],['tasks',4],['paths',4],['processes',3]]) await count(page,key,n);
  assert.match(await page.locator('#cabinet-tab-incoming').textContent(),/Входящие 4/);
  assert.match(await page.locator('#cabinet-tab-outgoing').textContent(),/Исходящие 1/);
  const counters = await page.locator('#cabinet-panel .efficiency[data-efficiency-percent]').evaluateAll(elements => elements.map(element => ({counting:element.dataset.counting, value:Number(element.querySelector('[data-counter-number]').textContent.replace(',','.')), target:Number(element.dataset.efficiencyPercent)})));
  assert.equal(counters.length,7);
  assert.ok(counters.some(counter => counter.counting === 'true' && counter.value < counter.target),'Efficiency animates through intermediate numbers');
  await settledCounters(page);
  assert.ok(await page.locator('#cabinet-panel .efficiency[data-efficiency-percent]').evaluateAll(elements => elements.every(element => Number(element.querySelector('[data-counter-number]').textContent.replace(',','.')) === Number(element.dataset.efficiencyPercent))), 'Efficiency reaches its final value');
  await page.locator('#cabinet-tab-outgoing').click();await count(page,'tasks',1);
  await page.keyboard.press('ArrowLeft');await count(page,'tasks',4);
  assert.equal(await page.locator('#cabinet-tab-incoming').getAttribute('aria-selected'),'true');
  assert.equal(await section(page,'research').locator('.cabinet-empty').count(),1);
  assert.equal(await section(page,'gemba').locator('.cabinet-empty').count(),1);
  await assets(page,'Initial home');
  report('default home, two-second shimmer, animated percentages, 10 insights, 4/1 tasks, 4 paths, 3 processes and placeholders');
}

async function filtersAndKeyboard(page) {
  await fresh(page);
  await page.locator('#cabinet-filter-insights').click();
  const first = await page.evaluate(() => document.activeElement.textContent);
  await page.keyboard.press('ArrowDown');
  assert.notEqual(await page.evaluate(() => document.activeElement.textContent),first,'Down arrow advances the filter menu');
  await page.keyboard.press('End');assert.match(await page.evaluate(() => document.activeElement.textContent),/Сбросить фильтры/);
  await page.keyboard.press('Home');assert.equal(await page.evaluate(() => document.activeElement.textContent),first);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.cabinet-menu').count(),0);
  assert.ok(await page.locator('#cabinet-filter-insights').evaluate(element => element === document.activeElement),'Escape restores trigger focus');
  await filter(page,'insights','В работе');await count(page,'insights',0);
  assert.match(await section(page,'insights').innerText(),/ничего не найдено/);
  await section(page,'insights').locator('[data-cabinet-reset]').click();await count(page,'insights',10);
  await filter(page,'insights','SberBPM');await count(page,'insights',10);await resetFilter(page,'insights');
  await filter(page,'tasks','Комплаенс');await count(page,'tasks',2);await resetFilter(page,'tasks');await count(page,'tasks',4);
  await filter(page,'paths','Приостановлен');await count(page,'paths',1);await resetFilter(page,'paths');
  await filter(page,'processes','Не на мониторинге');await count(page,'processes',1);await resetFilter(page,'processes');
  await filter(page,'paths','От низкой к высокой эффективности');
  assert.equal(await cards(page,'paths').first().locator('[data-efficiency-percent]').getAttribute('data-efficiency-percent'),'25');
  await resetFilter(page,'paths');
  await filter(page,'paths','Без эффективности');await count(page,'paths',0);
  await section(page,'paths').locator('[data-cabinet-reset]').click();await count(page,'paths',4);
  await page.locator('#cabinet-search').fill('INS-000042');
  await page.waitForFunction(() => document.querySelectorAll('[data-cabinet-kind="insights"]').length === 1);
  await page.locator('#cabinet-search').press('Enter');
  await page.locator('#cabinet-search').fill('несуществующая запись cabinet QA');
  await page.waitForFunction(() => !document.querySelector('[data-cabinet-kind]'));
  assert.equal(await page.locator('#cabinet-panel [data-cabinet-reset]').count(),4);
  await section(page,'insights').locator('[data-cabinet-reset]').click();
  assert.equal(await page.locator('#cabinet-search').inputValue(),'');await count(page,'insights',10);
  await page.locator('#cabinet-search-history').click();
  await page.locator('.cabinet-history').getByRole('menuitem',{name:'INS-000042',exact:true}).click();
  await count(page,'insights',1);
  report('working filter choices, sorting, no-results reset, global search/history and keyboard menu navigation');
}

async function favoritesAndNavigation(page) {
  await fresh(page);
  const id = 'cabinet-path-1';
  await page.locator(`[data-cabinet-menu="${id}"]`).click();
  const initial = (await page.locator('.cabinet-context').innerText()).includes('Удалить');
  await page.locator('.cabinet-context [role="menuitem"]').click();
  assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('bpm-registry-favorites')).includes(id),id),!initial,'Favorite persists to local storage');
  await page.locator('[data-cabinet-nav="paths"]').click();
  assert.equal(await page.locator('#registry-panel').isVisible(),true);
  assert.equal(await page.locator('#paths-tab').getAttribute('aria-pressed'),'true');
  await page.locator('#cabinet-nav').click();await ready(page);
  await page.locator(`[data-cabinet-menu="${id}"]`).click();
  assert.equal((await page.locator('.cabinet-context').innerText()).includes('Удалить'),!initial,'Favorite survives section revisit');
  await page.keyboard.press('Escape');
  await page.reload();await ready(page);
  await page.locator(`[data-cabinet-menu="${id}"]`).click();
  assert.equal((await page.locator('.cabinet-context').innerText()).includes('Удалить'),!initial,'Favorite survives page reload');
  await page.locator('.cabinet-context [role="menuitem"]').click();
  for (const itemId of ['cabinet-insight-1','К-2026-0002']) {
    const trigger = page.locator(`.cabinet-card-more[data-cabinet-menu="${itemId}"]`);
    await trigger.click();
    const wasFavorite = (await page.locator('.cabinet-context').innerText()).includes('Удалить');
    await page.locator('.cabinet-context [role="menuitem"]').click();
    assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('bpm-cabinet-item-favorites')).includes(id),itemId),!wasFavorite,`${itemId}: item favorite stored`);
    await page.reload();await ready(page);
    await trigger.click();
    assert.equal((await page.locator('.cabinet-context').innerText()).includes('Удалить'),!wasFavorite,`${itemId}: favorite survives reload`);
    await page.locator('.cabinet-context [role="menuitem"]').click();
  }
  await page.locator('[data-cabinet-nav="processes"]').click();
  assert.equal(await page.locator('#registry-panel').isVisible(),true);
  assert.equal(await page.locator('#processes-tab').getAttribute('aria-pressed'),'true');
  await page.locator('#cabinet-nav').click();await ready(page);
  await page.locator('[data-cabinet-nav="tasks"]').click();
  await page.waitForFunction(() => !document.getElementById('tasks-panel').hidden);
  assert.equal(await page.locator('#tasks-nav').getAttribute('aria-current'),'page');
  assert.equal(new URL(page.url()).hash,'#tasks');
  await page.goBack();await ready(page);
  assert.equal(await page.locator('#cabinet-nav').getAttribute('aria-current'),'page');
  report('persistent favorites, matching path/process registry links, task navigation and browser Back');
}

async function drawers(page) {
  await fresh(page);
  await page.locator('#cabinet-create-tasks').click();
  await page.waitForFunction(() => document.querySelector('#task-drawer')?.open && document.querySelector('#task-drawer').classList.contains('has-entered'));
  assert.equal(await page.locator('#task-drawer [data-task-type]').count(),8);
  assert.equal(await page.locator('#task-drawer input,#task-drawer textarea,#task-drawer select').count(),0,'Creation has only the type choice');
  await page.locator('#task-drawer [data-task-type="standard"]').click();
  assert.equal(await page.locator('#task-drawer [data-task-type="standard"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.task-choice-notice').innerText(),/Форма создания будет добавлена/);
  await assets(page,'Task type drawer');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#task-drawer').open);
  assert.ok(await page.locator('#cabinet-create-tasks').evaluate(element => element === document.activeElement));
  for (const entity of ['paths','processes']) {
    const trigger = cards(page,entity).first().locator('.card-title');
    await trigger.click();
    await page.waitForFunction(() => {
      const dialog = document.querySelector('#process-drawer');
      return dialog?.open && !dialog.classList.contains('pd-is-loading') && !dialog.querySelector('.pd-main')?.inert;
    });
    assert.equal(await page.locator('#process-drawer').getAttribute('data-pd-entity'),entity);
    assert.ok((await page.locator('#pd-title').innerText()).trim());
    await assets(page,`${entity} detail drawer`);
    await page.keyboard.press('Escape');
    await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
    assert.ok(await trigger.evaluate(element => element === document.activeElement),`${entity} detail restores card focus`);
  }
  report('shared task type-only chooser and full path/process drawers, Escape and focus restoration');
}

async function widgetsAndResponsive(page) {
  await fresh(page);
  for (const key of ['insights','tasks']) {
    const baseline = await section(page,key).boundingBox();
    await page.locator(`#cabinet-expand-${key}`).click();
    assert.equal(await section(page,key).evaluate(element => element.classList.contains('is-expanded')),true);
    const expanded = await section(page,key).boundingBox();
    assert.ok(expanded.width > baseline.width * 1.5,`${key} expands across the dashboard`);
    await page.locator(`#cabinet-expand-${key}`).click();
    const restored = await section(page,key).boundingBox();
    assert.ok(Math.abs(restored.width-baseline.width) < 1,`${key} restores its original size`);
  }
  for (const width of [1920,1440,1280,1024,768,390,320]) {
    await page.setViewportSize({width,height:1080});await page.mouse.move(width-1,1);
    if (await page.locator('body').evaluate(element => element.classList.contains('mobile-menu-open'))) await page.locator('#collapse-menu').click();
    if (width < 768) await page.waitForFunction(() => document.getElementById('sidebar').getBoundingClientRect().right <= 0);
    await page.evaluate(() => window.scrollTo(0,0));
    await overflow(page,width,'Home');await assets(page,`Home ${width}`);
    if (width === 1920 || width === 390) await page.screenshot({path:path.join(output,`cabinet-${width}.png`),fullPage:true});
    await page.locator('#cabinet-filter-paths').click();
    const menu = await page.locator('.cabinet-menu').boundingBox();
    assert.ok(menu.x >= 0 && menu.x + menu.width <= width + 1,`${width}: menu stays within viewport`);
    await page.keyboard.press('Escape');
    if (width < 768) {
      await page.locator('#mobile-menu').click();
      assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'),'true');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'),'false');
      await page.locator('#mobile-menu').click();await page.locator('#tasks-nav').click();
      assert.equal(await page.locator('#tasks-panel').isVisible(),true);
      assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'),'false');
      await page.locator('#mobile-menu').click();await page.locator('#cabinet-nav').click();await ready(page);await settledCounters(page);
      await overflow(page,width,'Mobile return');
    }
  }
  report(`expand/restore, 1920/1440/1280/1024/768/390/320 layouts, mobile navigation; screenshots: ${output}`);
}

async function relatedAndEfficiency(page) {
  await fresh(page);
  const favorites = await page.evaluate(() => localStorage.getItem('bpm-cabinet-item-favorites'));
  await page.locator('.cabinet-related-more').first().click();
  assert.equal(await page.locator('.cabinet-context').count(),0,'Related items do not open a favorite menu');
  assert.match(await page.locator('#toast').innerText(),/Связанные элементы инсайта/);
  assert.equal(await page.evaluate(() => localStorage.getItem('bpm-cabinet-item-favorites')),favorites,'Related items do not change favorites');
  const trigger = page.locator('[data-cabinet-efficiency="cabinet-path-1"]');
  await trigger.focus();await trigger.press('Enter');
  const detailButton = page.locator('#cabinet-efficiency-tip button');
  assert.equal(await page.locator('#cabinet-efficiency-tip').getAttribute('role'),'dialog');
  assert.ok(await detailButton.evaluate(element => element === document.activeElement),'Enter focuses the efficiency detail action');
  await page.keyboard.press('Escape');
  assert.ok(await trigger.evaluate(element => element === document.activeElement),'Escape returns focus to efficiency');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#cabinet-efficiency-tip').count(),0,'Focus restoration does not reopen the tooltip');
  await trigger.click();
  assert.ok(await detailButton.evaluate(element => element === document.activeElement),'Click focuses the efficiency detail action');
  await page.mouse.move(1,1);await page.waitForTimeout(200);
  assert.equal(await page.locator('#cabinet-efficiency-tip').count(),1,'Focused details survive pointer departure');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const drawer = document.getElementById('process-drawer');
    return drawer?.open && !drawer.classList.contains('pd-is-loading') && !drawer.querySelector('.pd-main')?.inert;
  });
  assert.equal(await page.locator('#process-drawer').getAttribute('data-pd-entity'),'paths');
  await page.keyboard.press('Escape');await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
  await assets(page,'Related items and efficiency interaction');
  report('related-item notice, keyboard/click efficiency activation, Escape focus and keyboard detail navigation');
}

(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const failures = [],errors = [],requests = [];
  try {
    const context = await browser.newContext({viewport:{width:1920,height:1080},offline:embedded});
    await context.addInitScript(() => localStorage.setItem('bpm-registry-menu','expanded'));
    const page = await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',error => errors.push(error.stack || error.message));
    page.on('requestfailed',request => requests.push(`${request.url().slice(0,150)}: ${request.failure()?.errorText}`));
    page.on('response',response => {if(response.status() >= 400) requests.push(`${response.status()} ${response.url()}`);});
    const tests = [loadingAndContent,filtersAndKeyboard,favoritesAndNavigation,drawers,widgetsAndResponsive,relatedAndEfficiency];
    const names = process.argv.slice(2);
    assert.ok(names.every(name => tests.some(test => test.name === name)),'Every requested test group exists');
    for (const test of tests.filter(test => !names.length || names.includes(test.name))) {
      try {await test(page);} catch (error) {
        failures.push(`${test.name}: ${error.stack || error}`);console.error(`FAIL — ${test.name}: ${error.message}`);
        await page.screenshot({path:path.join(output,`${test.name}-failure.png`)}).catch(() => {});
      }
    }
    if (errors.length) failures.push(`Browser errors: ${[...new Set(errors)].join('\n')}`);
    if (requests.length) failures.push(`Resource failures: ${[...new Set(requests)].join('\n')}`);
    if (failures.length) throw new Error(failures.join('\n\n'));
    report(`${embedded ? 'offline embedded' : 'source'} Home regressions completed without browser errors or missing images`);
  } finally {await browser.close();console.log(`Artifacts: ${output}`);}
})().catch(error => {console.error(error);process.exitCode=1;});

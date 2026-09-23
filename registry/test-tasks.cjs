/* Tasks browser regression. Run against the local preview; isolated Chrome profile only. */
const assert = require('node:assert/strict');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.BPM_TASKS_URL || 'http://127.0.0.1:4180/';
const columns = ['title','processTitle','initiator','assignees','created','deadline','status'];
const filterKeys = ['block','division','status','type','initiator','assignees'];
const typeIds = ['standard','extended-access','metric-inapplicability','bulk-metric-inapplicability','process-result-approval','business-description-checklist','business-description-update','insight'];
const collator = new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
const report = message => console.log(`PASS — ${message}`);
let data,sequence = 0;

async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#tasks-results')?.getAttribute('aria-busy') === 'false');
}
async function stablePaint(page) {
  await page.evaluate(async () => {
    await Promise.all([...document.images].filter(image => image.getClientRects().length).map(image => image.decode().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(150);
}
async function fresh(page) {
  await page.setViewportSize({width:1920,height:1080});
  const url = new URL(base);url.searchParams.set('tasks-regression',String(++sequence));url.hash='tasks';
  await page.goto(url.href);
  await ready(page);
  data = await page.evaluate(() => window.BPM_TASK_DATA);
}
async function tab(page,name) {
  const button = page.locator(`[data-task-tab="${name}"]`);
  if (await button.getAttribute('aria-pressed') !== 'true') {await button.click();await ready(page);}
}
async function view(page,name) {
  const button = page.locator(`#tasks-${name}`);
  if (await button.getAttribute('aria-pressed') !== 'true') {await button.click();await ready(page);}
}
async function viewport(page,width) {
  await page.setViewportSize({width,height:1080});
  await stablePaint(page);
  if (width < 768 && await page.locator('body').evaluate(element => element.classList.contains('mobile-menu-open'))) await page.locator('#collapse-menu').click();
  await page.waitForFunction(() => !document.body.classList.contains('mobile-menu-open'));
  await stablePaint(page);
}
async function ids(page) {
  return page.locator('#tasks-results .task-table-row[data-task-id],#tasks-results article[data-task-id]').evaluateAll(elements => elements.map(element => element.dataset.taskId));
}
async function count(page,expected) {
  assert.equal((await ids(page)).length,expected,'Visible task count');
  assert.equal(await page.locator('#tasks-announcement').textContent(),`Найдено задач: ${expected}.`);
}
function sorted(rows,key,direction) {
  const value = row => key === 'title' ? `${row.type} ${row.id}` : Array.isArray(row[key]) ? row[key].join(', ') : row[key];
  return [...rows].sort((a,b) => collator.compare(value(a) || '',value(b) || '') * (direction === 'desc' ? -1 : 1) || a.number - b.number).map(row => row.id);
}
async function reset(page) {
  if (await page.locator('#tasks-reset').isVisible()) {await page.locator('#tasks-reset').click();await ready(page);}
}
async function chooseFilter(page,key,values) {
  await page.locator(`#tasks-${key}-input`).click();
  for (const value of values) await page.locator(`#tasks-${key}-list`).getByRole('option',{name:value,exact:true}).click();
  await page.keyboard.press('Escape');
  await ready(page);
}
async function drawerReady(page) {
  await page.waitForFunction(() => {
    const element = document.getElementById('task-drawer');
    return element?.open && (element.classList.contains('has-entered') || matchMedia('(prefers-reduced-motion: reduce)').matches);
  });
}
async function closeDrawer(page,trigger = '#tasks-create',method = 'escape') {
  if (method === 'button') await page.locator('.task-drawer-close').click();
  else if (method === 'backdrop') await page.mouse.click(8,500);
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('task-drawer')?.open && !document.body.classList.contains('task-drawer-open'));
  if (trigger) assert.ok(await page.locator(trigger).evaluate(element => element === document.activeElement),'Drawer restores trigger focus');
  assert.equal(await page.locator('body').evaluate(element => element.classList.contains('task-drawer-open')),false,'Drawer releases body scrolling');
}

async function loadingAndTabs(page) {
  const start = Date.now();
  await page.goto(`${base}#tasks`);
  await page.locator('#tasks-results[aria-busy="true"]').waitFor();
  assert.equal(await page.locator('.task-skeleton-row').count(),5);
  assert.equal(await page.locator('.task-skeleton-row .skeleton-shape').first().evaluate(element => getComputedStyle(element,'::after').animationName),'bpm-shimmer');
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#tasks-results').getAttribute('aria-busy'),'true','Loading persists before two seconds');
  await ready(page);
  assert.ok(Date.now() - start >= 1800,'Initial loading lasts approximately two seconds');
  assert.equal(await page.locator('#registry-panel').isVisible(),false);
  assert.equal(await page.locator('#tasks-nav').getAttribute('aria-current'),'page');
  assert.equal(await page.title(),'Задачи — Sber BPM');
  await count(page,10);
  assert.match(await page.locator('[data-task-tab="incoming"]').textContent(),/10/);
  assert.match(await page.locator('[data-task-tab="outgoing"]').textContent(),/5/);
  await tab(page,'outgoing');await count(page,5);
  await tab(page,'all');await count(page,14);
  assert.equal(await page.locator('#tasks-pagination').isVisible(),false,'No pagination for at most 50 tasks');
  assert.equal(await page.locator('#tasks-count').textContent(),'12');
  await page.locator('#tasks-completed').click();await ready(page);await count(page,2);
  assert.ok(await page.locator('#tasks-chips').textContent().then(text => text.includes('Завершено')));
  await reset(page);
  await page.locator('#tasks-cards').click();
  assert.equal(await page.locator('#tasks-results').getAttribute('aria-busy'),'true');
  assert.equal(await page.locator('.task-skeleton-card').count(),14);
  await ready(page);await count(page,14);
  assert.equal(await page.locator('#tasks-sort').isVisible(),true);
  await view(page,'table');
  assert.equal(await page.locator('#tasks-sort').isVisible(),false);
  report('two-second loading, shared shimmer, table/cards, 10/5/14 tabs and completed tasks');
}

async function filters(page) {
  await fresh(page);await tab(page,'all');
  for (const key of filterKeys) {
    const values = [...new Set(data.flatMap(row => Array.isArray(row[key]) ? row[key] : [row[key]]))].sort(collator.compare).slice(0,2);
    assert.equal(values.length,2,`${key}: fixture provides a multiple selection`);
    await chooseFilter(page,key,values);
    assert.equal(await page.locator(`#tasks-${key}-input`).inputValue(),'Выбрано 2',`${key}: counter replaces values`);
    assert.equal(await page.locator(`#tasks-${key} .select-toggle`).getAttribute('aria-label'),`Очистить: ${await page.locator(`#tasks-${key} label`).textContent()}`);
    assert.equal(await page.locator(`#tasks-chips [data-task-filter-key="${key}"]`).count(),2);
    const expected = data.filter(row => values.some(value => Array.isArray(row[key]) ? row[key].includes(value) : row[key] === value));
    assert.deepEqual(new Set(await ids(page)),new Set(expected.map(row => row.id)),`${key}: filter matches selected values`);
    await page.locator(`#tasks-chips [data-task-filter-key="${key}"]`).first().click();
    assert.equal(await page.locator(`#tasks-${key}-input`).inputValue(),'Выбрано 1',`${key}: chip removal updates selection counter`);
    await page.locator(`#tasks-${key} .select-toggle`).click();await ready(page);
    assert.equal(await page.locator(`#tasks-${key}-input`).inputValue(),'');
    assert.equal(await page.locator('#tasks-selected').isVisible(),false,`${key}: clear removes chips`);
    await count(page,14);
  }
  await chooseFilter(page,'status',['Выполняется']);
  await chooseFilter(page,'type',['Типовая']);
  const expected = data.filter(row => row.status === 'Выполняется' && row.type === 'Типовая');
  assert.deepEqual(new Set(await ids(page)),new Set(expected.map(row => row.id)),'Independent filters combine with AND');
  await reset(page);await count(page,14);
  report('six multi-selects, selected counters, chips, clear buttons and combined/reset filtering');
}

async function searchAndDates(page) {
  await fresh(page);await tab(page,'all');
  await page.locator('#tasks-search').fill('К-2026-0002');await ready(page);await count(page,1);
  assert.deepEqual(await ids(page),['К-2026-0002']);
  await page.locator('#tasks-clear-search').click();await ready(page);await count(page,14);
  await page.locator('#tasks-search').fill('Несуществующая задача 000000');await ready(page);await count(page,0);
  assert.equal(await page.locator('.tasks-empty').count(),1);
  await page.locator('.tasks-empty [data-task-create]').click();await drawerReady(page);await closeDrawer(page,'.tasks-empty [data-task-create]');
  await reset(page);
  await page.locator('#tasks-date').click();
  await page.locator('.bpm-calendar [data-picker="year"]').click();
  await page.locator('.bpm-calendar-picker [data-picker-value="2026"]').click();
  await page.locator('.bpm-calendar [data-picker="month"]').click();
  await page.locator('.bpm-calendar-picker [data-picker-value="8"]').click();
  await page.locator('.bpm-calendar [data-date="2026-09-12"][data-own-month="true"]').click();
  assert.equal(await page.locator('.bpm-calendar').count(),1,'Range first endpoint does not close calendar');
  await page.locator('.bpm-calendar [data-date="2026-09-16"][data-own-month="true"]').click();await ready(page);
  assert.equal(await page.locator('#tasks-date-summary').textContent(),'12.09.2026 → 16.09.2026');
  assert.deepEqual(new Set(await ids(page)),new Set(data.filter(row => row.deadline >= '2026-09-12' && row.deadline <= '2026-09-16').map(row => row.id)));
  await page.locator('#tasks-chips [data-task-filter-key="date"]').click();await ready(page);await count(page,14);
  await page.locator('#tasks-date').click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('.bpm-calendar').count(),0);
  assert.equal(await page.locator('#tasks-date').getAttribute('aria-expanded'),'false');
  report('ID search, empty state, chooser from empty state, clear/reset and shared range calendar');
}

async function sorting(page) {
  await fresh(page);await tab(page,'all');
  for (const key of columns) {
    for (let round = 0; round < 2; round++) {
      const button = page.locator(`[data-task-sort="${key}"]`);
      const prior = await button.locator('..').getAttribute('aria-sort');
      await button.click();
      const expectedDirection = prior === 'ascending' ? 'descending' : 'ascending';
      assert.equal(await button.locator('..').getAttribute('aria-sort'),expectedDirection);
      assert.equal(await page.locator('.tasks-table th[aria-sort="ascending"],.tasks-table th[aria-sort="descending"]').count(),1,'Only one column is sorted');
      assert.equal(await page.locator('.task-sort-button.is-sorted .task-sort-icon').count(),1,'Exactly one sort arrow is active');
      assert.deepEqual(await ids(page),sorted(data,key,expectedDirection === 'ascending' ? 'asc' : 'desc'),`${key}: actual ${expectedDirection} row order`);
    }
  }
  await view(page,'cards');
  await page.locator('#tasks-sort-input').click();
  const options = await page.locator('#tasks-sort-list [data-option]').evaluateAll(elements => elements.map(element => element.dataset.option));
  assert.equal(options.length,7,'Cards offer seven sorting options');
  await page.keyboard.press('Escape');
  for (const key of options) {
    await page.locator('#tasks-sort-input').click();
    await page.locator(`#tasks-sort-list [data-option="${key}"]`).click();
    assert.deepEqual(await ids(page),sorted(data,key,key === 'created' ? 'desc' : 'asc'),`${key}: actual card order`);
  }
  report('all seven table columns in both directions and seven card sorting choices');
}

async function exportCsv(page) {
  await fresh(page);await tab(page,'all');
  await page.locator('#tasks-search').fill('К-2026-0002');await ready(page);
  for (const scope of ['all','filtered','variants']) {
    await page.locator('#tasks-export').click();
    assert.equal(await page.locator('#task-export-dialog input[type="radio"]').count(),3);
    await page.locator(`#task-export-dialog [value="${scope}"]`).check();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#task-export-form button[type="submit"]').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(),new RegExp(`^Sber-BPM-tasks-${scope}-.*\\.csv$`));
    const stream = await download.createReadStream(),chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8'),lines = csv.replace(/^\uFEFF/,'').split('\r\n');
    assert.equal(csv.charCodeAt(0),0xfeff,'CSV has UTF-8 BOM');
    assert.equal(lines.length - 1,scope === 'all' ? 14 : scope === 'filtered' ? 1 : 42,`${scope}: downloaded row count`);
    assert.match(lines[0],/"Тип";"ID";"Задача"/);
    if (scope === 'filtered') assert.match(lines[1],/К-2026-0002/);
    if (scope === 'variants') assert.match(lines[0],/Вариант результата процесса/);
    assert.equal(await page.locator('#task-export-dialog').evaluate(element => element.open),false);
  }
  report('three export scopes create downloaded CSV with 14/1/42 data rows');
}

async function typeChooser(page) {
  await fresh(page);
  await page.locator('#tasks-create').click();await drawerReady(page);
  assert.deepEqual(await page.locator('[data-task-type]').evaluateAll(elements => elements.map(element => element.dataset.taskType)),typeIds);
  assert.equal(await page.locator('#task-drawer').getAttribute('aria-labelledby'),'task-drawer-title');
  assert.ok(await page.locator('.task-drawer-close').evaluate(element => element === document.activeElement));
  for (const type of typeIds) {
    await page.locator(`[data-task-type="${type}"]`).click();
    assert.equal(await page.locator('[data-task-type][aria-pressed="true"]').count(),1);
    assert.equal(await page.locator(`[data-task-type="${type}"]`).getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#task-drawer input,#task-drawer textarea,#task-drawer select,#task-drawer form').count(),0,'Type choice does not add a creation form');
    assert.ok(await page.locator('#task-drawer').evaluate(element => element.open));
    assert.equal(await page.evaluate(() => window.BPM_TASK_DATA.length),14,'Type choice does not create a task');
  }
  assert.equal(await page.locator('.task-choice-notice').isVisible(),true,'Choice provides an in-drawer confirmation');
  await closeDrawer(page);
  await page.locator('#tasks-create').click();await drawerReady(page);
  assert.equal(await page.locator('[data-task-type][aria-pressed="true"]').count(),0,'Reopening clears the choice');
  assert.equal(await page.locator('.task-choice-notice').isVisible(),false,'Reopening clears the previous confirmation');
  await page.locator('[data-task-type="standard"]').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-task-type="standard"]').getAttribute('aria-pressed'),'true');
  await closeDrawer(page,'#tasks-create','button');
  await page.locator('#tasks-create').click();await drawerReady(page);await closeDrawer(page,'#tasks-create','backdrop');
  report('eight task types, exclusive selection, keyboard operation, no forms/data writes and close focus');
}

async function processAndNavigation(page) {
  await fresh(page);
  const trigger = page.locator('[data-task-process]').first(),processId = await trigger.getAttribute('data-task-process');
  await trigger.click();
  await page.waitForFunction(() => document.getElementById('process-drawer')?.open && !document.getElementById('process-drawer').classList.contains('pd-is-loading'));
  assert.equal(await page.locator('#process-drawer').getAttribute('data-pd-entity'),'processes');
  const title = await page.evaluate(id => window.BPM_DATA.find(row => row.id === id).title,processId);
  assert.equal(await page.locator('#pd-title').textContent(),title);
  await page.keyboard.press('Escape');await page.waitForFunction(() => !document.getElementById('process-drawer').open && !document.body.classList.contains('pd-drawer-open'));
  assert.ok(await trigger.evaluate(element => element === document.activeElement));
  assert.equal(await page.locator('#tasks-panel').isVisible(),true);
  await page.locator('#global-search').click();assert.ok(await page.locator('#tasks-search').evaluate(element => element === document.activeElement));
  await page.locator('#registry-nav').click();
  await page.locator('.entity-card:not(.skeleton-card)').first().waitFor();
  assert.equal(await page.locator('#tasks-panel').isVisible(),false);
  await page.locator('#structure-toggle').click();
  await page.waitForFunction(() => document.body.classList.contains('structure-mode') && document.querySelector('#structure-list [data-node]'));
  await page.locator('#tasks-nav').click();await ready(page);
  assert.equal(await page.locator('body').evaluate(element => element.classList.contains('structure-mode')),false);
  await page.goBack();
  await page.waitForFunction(() => document.body.classList.contains('structure-mode') && !document.getElementById('registry-panel').hidden);
  assert.equal(await page.locator('#tasks-panel').isVisible(),false,'Browser Back restores structure');
  await page.goForward();await ready(page);
  assert.equal(await page.locator('#tasks-panel').isVisible(),true,'Browser Forward restores Tasks');
  await page.locator('#registry-nav').click();
  await page.locator('.entity-card:not(.skeleton-card)').first().waitFor();
  assert.equal(await page.locator('body').evaluate(element => element.classList.contains('structure-mode')),false,'Registry menu explicitly returns to normal view');
  report('local process details, returned focus, global search and registry/structure browser history');
}

async function responsive(page) {
  await fresh(page);
  for (const width of [1920,1440,390,320]) {
    await viewport(page,width);
    for (const kind of ['table','cards']) {
      await view(page,kind);
      await page.evaluate(() => window.scrollTo(0,0));
      const overflow = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      if (overflow.scroll > overflow.width + 1) {
        console.error('Overflow state:',await page.evaluate(() => ({body:document.body.className,scrollX,scrollY,viewport:innerWidth})));
        await page.screenshot({path:`/tmp/bpm-tasks-${width}-${kind}-overflow.png`,fullPage:false});
      }
      assert.ok(overflow.scroll <= overflow.width + 1,`${width}/${kind}: page stays within viewport (${overflow.scroll})`);
      if (kind === 'table') {
        const local = await page.locator('.tasks-table-scroll').evaluate(element => {element.scrollLeft=element.scrollWidth;const result={scroll:element.scrollWidth,width:element.clientWidth,left:element.scrollLeft};element.scrollLeft=0;return result;});
        if (width < 768) assert.ok(local.scroll > local.width,`${width}: mobile keeps the table locally scrollable`);
        if (local.scroll > local.width) assert.ok(local.left > 0,`${width}: overflowing table actually scrolls horizontally`);
      } else {
        const boxes = await page.locator('.task-card').evaluateAll(elements => elements.map(element => {const r=element.getBoundingClientRect();return {width:r.width,height:r.height,right:r.right,left:r.left};}));
        for (const box of boxes) {assert.equal(box.height,304);assert.ok(box.width > 0 && box.left >= 0 && box.right <= width + 1,`${width}: card within viewport`);}
      }
      await stablePaint(page);
      await page.screenshot({path:`/tmp/bpm-tasks-${width}-${kind}.png`,fullPage:false});
    }
    await page.locator('#tasks-create').click();await drawerReady(page);
    const geometry = await page.locator('#task-drawer').evaluate(element => {const r=element.getBoundingClientRect(),content=element.querySelector('.task-drawer-content');return {x:r.x,y:r.y,width:r.width,right:r.right,height:r.height,scroll:content.scrollWidth,client:content.clientWidth};});
    const expected = width >= 768 ? (width - 328) * 5 / 12 + 96 : width;
    assert.ok(Math.abs(geometry.width - expected) < 1,`${width}: five-column or full-width drawer`);
    assert.ok(geometry.x >= 0 && geometry.right <= width + 1,`${width}: drawer fits viewport`);
    assert.ok(geometry.scroll <= geometry.client + 1,`${width}: drawer does not scroll horizontally`);
    await stablePaint(page);
    await page.screenshot({path:`/tmp/bpm-tasks-${width}-drawer.png`,fullPage:false});
    await page.locator('[data-task-type="standard"]').click();
    const notice = await page.locator('.task-choice-notice').evaluate(element => {const r=element.getBoundingClientRect(),drawer=element.closest('dialog').getBoundingClientRect();return {left:r.left,right:r.right,drawerLeft:drawer.left,drawerRight:drawer.right};});
    assert.ok(notice.left >= notice.drawerLeft - 1 && notice.right <= notice.drawerRight + 1,`${width}: choice notice stays inside drawer`);
    await closeDrawer(page);
  }
  report('1920/1440/390/320 responsive table/cards/drawer, screenshot artifacts in /tmp');
}

async function scrollRetention(page) {
  await fresh(page);await viewport(page,390);
  const scroller = page.locator('.tasks-table-scroll');
  await scroller.evaluate(element => {element.scrollLeft=element.scrollWidth;});
  const before = await scroller.evaluate(element => element.scrollLeft);
  await page.locator('[data-task-sort="status"]').click();
  const after = await scroller.evaluate(element => element.scrollLeft);
  assert.ok(before > 0 && Math.abs(before-after) <= 2,`Sorting retains horizontal scroll: ${before} → ${after}`);
  report('table horizontal scroll remains stable after sorting');
}

(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'}),failures = [];
  try {
    const context = await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:true});
    await context.addInitScript(() => localStorage.setItem('bpm-registry-menu','expanded'));
    const page = await context.newPage(),errors = [],missing = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror',error => errors.push(error.stack || error.message));
    page.on('response',response => {if(response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);});
    const tests = [loadingAndTabs,filters,searchAndDates,sorting,exportCsv,typeChooser,processAndNavigation,responsive,scrollRetention];
    const requested = process.argv.slice(2);
    assert.ok(requested.every(name => tests.some(test => test.name === name)),'Requested test group exists');
    for (const test of tests.filter(test => !requested.length || requested.includes(test.name))) {
      try {await test(page);} catch(error) {failures.push(`${test.name}: ${error.stack || error}`);console.error(`FAIL — ${test.name}: ${error.message}`);}
    }
    if (errors.length) failures.push(`Browser errors: ${errors.join('\n')}`);
    if (missing.length) failures.push(`Missing resources: ${[...new Set(missing)].join('\n')}`);
    if (failures.length) throw new Error(failures.join('\n\n'));
    report(`${requested.length ? 'selected' : 'all'} Tasks browser regressions; no browser errors or missing resources`);
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});

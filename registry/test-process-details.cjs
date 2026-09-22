/* Process Details / Drawer 10 columns, Figma 1115:31908.
 * Run with bundled Node or BPM_PLAYWRIGHT. Isolated headless Chrome only.
 * Runtime fixtures stay read-only; screenshots are written under /tmp.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = pathToFileURL(path.join(__dirname,'index.html')).href;
const widths = [1920,1440,390,320];
const sections = ['about','technology','monitoring','insights','tasks','documents'];
const tableRows = {monitoring:5,insights:2,tasks:5,aris:5,consultant:3};
const near = (actual,expected,label,tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance,`${label}: ${actual} vs ${expected}`);
const report = message => console.log(`PASS — ${message}`);
async function settlePaint(page) {
  // Sorting and resetting a horizontal scroll can leave one stale compositor
  // frame around backdrop-filter glyphs although their DOM/styles are final.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(150);
}

async function registryReady(page,view = 'cards') {
  await page.locator(view === 'cards' ? '.entity-card:not(.skeleton-card)' : '.registry-table tr[data-record]').first().waitFor();
}
async function drawerReady(page) {
  await page.waitForFunction(() => {
    const drawer = document.querySelector('#process-drawer');
    return drawer?.open && !drawer.classList.contains('pd-is-loading') && !drawer.querySelector('.pd-main').inert;
  });
}
async function openFrom(page,trigger,entity = 'processes',loading = false) {
  const started = Date.now();
  await trigger.click();
  const drawer = page.locator('#process-drawer');
  await drawer.locator('#pd-title').waitFor({state:'attached'});
  assert.equal(await drawer.getAttribute('data-pd-entity'),entity);
  if (loading) {
    assert.ok(await drawer.evaluate(element => element.classList.contains('pd-is-loading')),'Initial skeleton is active');
    assert.equal(await drawer.locator('.pd-main').getAttribute('aria-busy'),'true');
    assert.ok(await drawer.locator('.pd-main').evaluate(element => element.inert),'Loading content is inert');
    assert.ok(await drawer.locator('.pd-skeleton').count() > 0,'Loading placeholders are generated');
    assert.equal(await drawer.locator('.skeleton-shape').first().evaluate(element => getComputedStyle(element,'::after').animationName),'bpm-shimmer','Loading uses the shared shimmer');
    const before = await drawer.locator('[data-pd-motion-number]').evaluateAll(elements => elements.map(element => ({text:element.textContent,target:element.dataset.pdMotionNumber})));
    assert.ok(before.length >= 2,'Overview includes animated values');
    before.forEach(value => assert.equal(Number(value.text.replace(/[^\d,.]/g,'').replace(',','.')),0,`Counter starts at zero: ${value.target}`));
    await page.waitForTimeout(500);
    assert.ok(await drawer.evaluate(element => element.classList.contains('pd-is-loading')),'Shimmer remains visible before two seconds');
  }
  await drawerReady(page);
  if (loading) assert.ok(Date.now() - started >= 1800,'Loading lasts approximately two seconds');
  assert.equal(await drawer.locator('.pd-skeleton').count(),0,'Skeletons removed after loading');
  assert.equal(await drawer.locator('.pd-main').getAttribute('aria-busy'),null);
  assert.equal(await page.locator('#detail-dialog[open]').count(),0,'Uses full Drawer, not the legacy short dialog');
  return drawer;
}
async function closeDrawer(page,trigger) {
  await page.keyboard.press('Escape');
  await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
  if (trigger) await page.waitForFunction(element => document.activeElement === element,await trigger.elementHandle());
  await page.waitForFunction(() => !document.body.classList.contains('pd-drawer-open'));
}
async function scrollTo(page,id) {
  const drawer = page.locator('#process-drawer');
  const target = drawer.locator(`#pd-${id}`);
  assert.equal(await target.count(),1,`${id}: unique section`);
  await target.evaluate(element => {if (element.tagName === 'DETAILS') element.open = true;});
  const anchor = drawer.locator(`.pd-anchors [data-pd-anchor="${id}"]`);
  if (await anchor.count()) {
    await anchor.click();
    await page.waitForFunction(id => {
      const root = document.querySelector('#process-drawer .pd-main'), target = document.querySelector(`#pd-${id}`);
      return Math.abs(target.getBoundingClientRect().top - root.getBoundingClientRect().top) <= 2 || root.scrollTop + root.clientHeight >= root.scrollHeight - 3;
    },id);
    await page.waitForFunction(element => element.getAttribute('aria-current') === 'location',await anchor.elementHandle());
  } else await target.scrollIntoViewIfNeeded();
}

async function shell(page,entity = 'processes') {
  const width = page.viewportSize().width;
  const geometry = await page.locator('#process-drawer').evaluate(element => {
    const box = node => {const r = node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const style = getComputedStyle(element), main = element.querySelector('.pd-main'), navigation = element.querySelector('.pd-navigation');
    return {drawer:box(element),main:box(main),navigation:box(navigation),padding:[style.paddingTop,style.paddingRight,style.paddingBottom,style.paddingLeft],radius:style.borderRadius,
      gap:getComputedStyle(element.querySelector('.pd-layout')).columnGap,mainGap:getComputedStyle(main).rowGap,
      backdrop:{background:getComputedStyle(element,'::backdrop').backgroundColor,blur:getComputedStyle(element,'::backdrop').backdropFilter}};
  });
  if (width >= 1200) {
    const expectedWidth = (width - 328) * 10 / 12 + 216;
    near(geometry.drawer.width,expectedWidth,`${entity} ${width}: 10-column drawer width`);
    near(geometry.drawer.x,width - 32 - expectedWidth,`${entity} ${width}: drawer x`);
    near(geometry.drawer.y,24,`${entity} ${width}: drawer y`);
    near(geometry.drawer.right,width - 32,`${entity} ${width}: outer right margin`);
    near(geometry.navigation.width,entity === 'processes' ? 160 : 253,`${entity} ${width}: navigation width`);
    near(geometry.main.width,expectedWidth - 48 - 24 - (entity === 'processes' ? 160 : 253),`${entity} ${width}: main width`);
    assert.equal(geometry.gap,'24px');
    assert.equal(geometry.mainGap,'24px');
    assert.deepEqual(geometry.padding,entity === 'processes' ? ['32px','24px','40px','24px'] : ['24px','24px','24px','24px'],`${entity}: scoped shell padding`);
    assert.equal(geometry.radius,entity === 'processes' ? '32px' : '24px',`${entity}: scoped shell radius`);
    if (entity === 'processes') {
      assert.equal(geometry.backdrop.background,'rgba(0, 36, 68, 0.2)');
      assert.equal(geometry.backdrop.blur,'none');
    }
  } else {
    near(geometry.drawer.x,0,`${entity}: mobile x`);
    near(geometry.drawer.y,0,`${entity}: mobile y`);
    near(geometry.drawer.width,width,`${entity}: mobile full width`);
    near(geometry.drawer.height,page.viewportSize().height,`${entity}: mobile full height`);
    assert.equal(geometry.radius,'0px');
    assert.deepEqual(geometry.padding,['0px','0px','0px','0px']);
    assert.ok(geometry.navigation.bottom <= geometry.main.y + 1,`${entity}: mobile controls above scrolling content`);
  }
  await noOverflow(page,`${entity} ${width}`);
}
async function noOverflow(page,label) {
  const result = await page.evaluate(() => {
    const drawer = document.querySelector('#process-drawer'), main = drawer.querySelector('.pd-main'), box = drawer.getBoundingClientRect();
    return {viewport:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth,left:box.left,right:box.right,mainClient:main.clientWidth,mainScroll:main.scrollWidth};
  });
  assert.ok(result.html <= result.viewport + 1 && result.body <= result.viewport + 1,`${label}: page overflow ${JSON.stringify(result)}`);
  assert.ok(result.left >= -1 && result.right <= result.viewport + 1,`${label}: drawer is contained ${JSON.stringify(result)}`);
  assert.ok(result.mainScroll <= result.mainClient + 1,`${label}: main overflow ${JSON.stringify(result)}`);
}
async function verifyContent(page) {
  const drawer = page.locator('#process-drawer');
  for (const id of sections) assert.equal(await drawer.locator(`#pd-${id}`).count(),1,`Process section ${id}`);
  assert.equal(await drawer.locator('.jd-process-card').count(),0,'Process has no stale Journey content');
  const anchors = await drawer.locator('.pd-anchors [data-pd-anchor]').evaluateAll(elements => elements.map(element => element.dataset.pdAnchor));
  assert.deepEqual(anchors,['about','monitoring','insights','tasks','documents'],'Process anchors retain their semantic order');
  const order = await drawer.locator('#pd-about,#pd-technology,#pd-monitoring,#pd-insights,#pd-tasks,#pd-documents').evaluateAll(elements => elements.map(element => element.id));
  assert.deepEqual(order,sections.map(id => `pd-${id}`),'Process blocks follow the Figma reading order');
  for (const [id,count] of Object.entries(tableRows)) assert.equal(await drawer.locator(`.pd-data-table-${id} tbody tr`).count(),count,`${id}: exact visible Figma rows`);
  for (const id of ['technology','monitoring','insights','tasks','documents']) {
    const section = drawer.locator(`#pd-${id}`);
    assert.equal(await section.evaluate(element => element.tagName),'DETAILS',`${id}: preserves disclosure behavior`);
    await section.locator(':scope > summary').click();
    assert.equal(await section.evaluate(element => element.open),false,`${id}: collapses`);
    await section.locator(':scope > summary').click();
    assert.equal(await section.evaluate(element => element.open),true,`${id}: expands`);
  }
}
async function desktopGeometry(page) {
  assert.equal(page.viewportSize().width,1920,'Figma geometry is measured at its 1920px reference viewport');
  const overview = await page.locator('.pd-overview-grid').boundingBox();
  near(overview.height,440.266,'Figma overview row height');
  for (const selector of ['.pd-efficiency-widget','.pd-dynamics-widget']) near((await page.locator(selector).boundingBox()).width,278,`Figma ${selector} width`);
  near((await page.locator('#pd-technology').boundingBox()).height,471,'Figma technology section height');
  for (const [selector,width] of [['.pd-technology-systems',433.1],['.pd-technology-ai',452.566],['.pd-technology-operations',279]]) near((await page.locator(selector).boundingBox()).width,width,`Figma ${selector} width`);
  for (const [action,width] of [['favorite',72],['export',93],['print',140]]) {
    const button = page.locator(`.pd-process-actions [data-pd-action="${action}"]`);
    near((await button.boundingBox()).width,width,`Figma ${action} action width`);
  }
  for (const [id,width] of [['monitoring',232],['insights',211],['tasks',211]]) near((await page.locator(`#pd-${id} .pd-data-add`).boundingBox()).width,width,`Figma ${id} create/add width`);
  const tableGeometry = {
    monitoring:{height:668,header:68,rows:[120,120,120,120,120],columns:[448.666,112,96,144,112,148,154,48]},
    insights:{height:473,header:56,rows:[209,208],columns:[490.666,220,136,184,100,132]},
    tasks:{height:834,header:50,rows:[157,157,157,157,156],columns:[262.666,162,250,128,128,186,146]},
    aris:{height:625,header:56,rows:[117,113,113,113,113],columns:[190,510.666,180,176,158,48]},
    consultant:{height:460,header:50,rows:[97,145,168],columns:[168,542.666,180,180,144,48]}
  };
  for (const [id,expected] of Object.entries(tableGeometry)) {
    const measured = await page.locator(`.pd-data-table-${id}`).evaluate(table => ({width:table.getBoundingClientRect().width,height:table.getBoundingClientRect().height,header:table.tHead.getBoundingClientRect().height,rows:[...table.tBodies[0].rows].map(row => row.getBoundingClientRect().height),columns:[...table.tBodies[0].rows[0].cells].map(cell => cell.getBoundingClientRect().width)}));
    near(measured.width,1262.667,`${id}: Figma content/table width`);
    near(measured.height,expected.height,`${id}: Figma total height`);
    near(measured.header,expected.header,`${id}: Figma header height`);
    assert.equal(measured.rows.length,expected.rows.length);
    measured.rows.forEach((height,index) => near(height,expected.rows[index],`${id}: Figma row ${index + 1} height`));
    assert.equal(measured.columns.length,expected.columns.length);
    measured.columns.forEach((width,index) => near(width,expected.columns[index],`${id}: Figma column ${index + 1} width`));
  }
  assert.match(await page.locator('#pd-documents .pd-data-subtitle').last().innerText(),/7\s*$/,'Consultant count remains 7 while only the three Figma rows are rendered');
  report('1920 Figma overview, technology, action widths and lower table geometry');
}
async function motion(page) {
  const drawer = page.locator('#process-drawer');
  const kinds = await drawer.locator('[data-pd-motion-group]').evaluateAll(elements => [...new Set(elements.map(element => element.dataset.pdMotionGroup))]);
  for (const kind of ['efficiency','dynamics','operations','table']) assert.ok(kinds.includes(kind),`Motion hook ${kind}`);
  const groups = drawer.locator('[data-pd-motion-group]');
  for (let index = 0; index < await groups.count(); index++) {
    const group = groups.nth(index);
    if (!await group.isVisible()) continue;
    await group.scrollIntoViewIfNeeded();
    await page.waitForFunction(element => {
      const plain = [...element.querySelectorAll('[data-pd-motion-number]')].every(counter => counter.textContent.trim() === counter.dataset.pdMotionNumber.trim());
      const table = [...element.querySelectorAll('.efficiency[data-efficiency-percent]')].every(counter => Math.abs(Number(counter.querySelector('[data-counter-number]').textContent.replace(/\s/g,'').replace(',','.')) - Number(counter.dataset.efficiencyPercent)) < 0.001);
      return plain && table && element.dataset.pdMotionState === 'running';
    },await group.elementHandle());
  }
  await page.waitForFunction(() => [...document.querySelectorAll('.pd-sphere-image,.pd-dynamics-bar,.pd-operation-chart > span')].every(element => {
    const style = getComputedStyle(element);
    return Number(style.opacity) === 1 && (style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)');
  }));
  report('loading, viewport-triggered sphere/dynamics/operations/table motion and final counters');
}

async function filtersAndSort(page) {
  const drawer = page.locator('#process-drawer');
  await scrollTo(page,'monitoring');
  const filter = drawer.locator('.pd-data-filter'), table = drawer.locator('.pd-data-table-monitoring');
  const pending = await table.locator('tbody tr[data-pd-row-status="pending"]').count();
  assert.ok(pending > 0,'Monitoring contains a pending fixture');
  await filter.locator('summary').click();
  await filter.locator('[data-pd-status="pending"]').click();
  assert.equal(await table.locator('tbody tr:visible').count(),pending,'Monitoring status filter changes visible rows');
  assert.equal(await filter.evaluate(element => element.open),false,'Selecting a filter closes its popover');
  await filter.locator('summary').click();
  await page.keyboard.press('Escape');
  assert.equal(await filter.evaluate(element => element.open),false,'Escape closes filter first');
  assert.ok(await drawer.evaluate(element => element.open),'Filter Escape does not close Drawer');
  await filter.locator('summary').click();
  await filter.locator('[data-pd-status="all"]').click();
  assert.equal(await table.locator('tbody tr:visible').count(),tableRows.monitoring);
  await scrollTo(page,'insights');
  const insightTable = drawer.locator('.pd-data-table-insights');
  const buttons = drawer.locator('#pd-insights [data-pd-status]');
  for (let index = 0; index < await buttons.count(); index++) {
    const button = buttons.nth(index), status = await button.getAttribute('data-pd-status');
    const expected = status === 'all' ? tableRows.insights : await insightTable.locator('tbody tr').evaluateAll((rows,status) => rows.filter(row => row.dataset.pdRowStatus === status).length,status);
    await button.click();
    assert.equal(await insightTable.locator('tbody tr:visible').count(),expected,`Insight filter ${status}`);
    assert.equal(await button.getAttribute('aria-pressed'),'true');
    assert.equal(await drawer.locator('#pd-insights [data-pd-empty]').isVisible(),expected === 0,`Insight empty state ${status}`);
  }
  await drawer.locator('#pd-insights [data-pd-status="all"]').click();
  const source = drawer.locator('#pd-insights-source-input');
  assert.equal(await source.count(),1,'Injected shared source select exists');
  await source.click();
  assert.equal(await source.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');
  assert.equal(await source.getAttribute('aria-expanded'),'false','Escape closes source select');
  assert.ok(await drawer.evaluate(element => element.open));
  await source.click();
  const selectedSource = await drawer.locator('#pd-insights-source-list [data-option]:not([data-option=""])').first().getAttribute('data-option');
  await drawer.locator('#pd-insights-source-list [data-option]:not([data-option=""])').first().click();
  assert.equal(await insightTable.locator('tbody tr:visible').count(),await insightTable.locator('tbody tr').evaluateAll((rows,value) => rows.filter(row => row.dataset.pdSource === value).length,selectedSource),'Source filter uses source values');
  await source.click();
  await drawer.locator('#pd-insights-source-list [data-option=""]').click();
  for (const id of Object.keys(tableRows)) {
    const target = drawer.locator(`.pd-data-table-${id}`);
    await target.scrollIntoViewIfNeeded();
    const button = target.locator('[data-pd-sort]').first();
    assert.ok(await button.count(),`${id}: sorting is available`);
    const column = Number(await button.getAttribute('data-pd-sort'));
    for (let round = 0; round < 2; round++) {
      await button.click();
      const direction = await button.locator('xpath=..').getAttribute('aria-sort');
      assert.ok(['ascending','descending'].includes(direction),`${id}: aria-sort updates`);
      const values = await target.locator('tbody tr').evaluateAll((rows,index) => rows.map(row => row.cells[index].textContent.trim()),column);
      const compare = new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
      const sorted = [...values].sort((a,b) => compare.compare(a,b) * (direction === 'descending' ? -1 : 1));
      assert.deepEqual(values,sorted,`${id}: actual row order follows ${direction}`);
    }
  }
  report('monitoring/insight status filters, source select, popover Escape and five table sort controls');
}

async function responsive(page) {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(() => [...document.querySelectorAll('#process-drawer .efficiency[data-efficiency-percent]')].every(element => Number(element.querySelector('[data-counter-number]').textContent.replace(/\s/g,'').replace(',','.')) === Number(element.dataset.efficiencyPercent)));
  for (const width of widths) {
    await page.setViewportSize({width,height:1080});
    await page.locator('#process-drawer .pd-main').evaluate(element => element.scrollTo({top:0,behavior:'instant'}));
    await shell(page);
    await settlePaint(page);
    await page.screenshot({path:`/tmp/bpm-process-details-${width}-overview.png`,fullPage:false});
    for (const id of ['monitoring','insights','tasks','documents']) {
      await scrollTo(page,id);
      await noOverflow(page,`${width} ${id}`);
      const scrolls = page.locator(`#pd-${id} .pd-data-table-scroll`);
      for (let index = 0; index < await scrolls.count(); index++) {
        const result = await scrolls.nth(index).evaluate(element => {
          element.scrollLeft = element.scrollWidth;
          const result = {client:element.clientWidth,scroll:element.scrollWidth,left:element.scrollLeft};
          element.scrollLeft = 0;
          return result;
        });
        if (width < 1920) {
          assert.ok(result.scroll > result.client,`${width} ${id}: wide table remains locally scrollable`);
          assert.ok(result.left > 0,`${width} ${id}: horizontal scroll actually moves`);
        }
      }
      await settlePaint(page);
      await page.screenshot({path:`/tmp/bpm-process-details-${width}-${id}.png`,fullPage:false});
      if (width === 1920 && id === 'monitoring') {
        const paint = await page.locator('#pd-monitoring .efficiency[data-efficiency-percent]').evaluateAll(elements => elements.map(element => {
          const inspect = node => {
            const box = node.getBoundingClientRect(), style = getComputedStyle(node);
            return {text:node.textContent,x:box.x,y:box.y,width:box.width,height:box.height,display:style.display,visibility:style.visibility,opacity:style.opacity,overflow:style.overflow,color:style.color,transform:style.transform};
          };
          return {value:element.dataset.efficiencyPercent,motion:element.closest('[data-pd-motion-state]')?.dataset.pdMotionState || null,parent:inspect(element),number:inspect(element.querySelector('[data-counter-number]')),glyph:inspect(element.querySelector('.bpm-efficiency-glyph'))};
        }));
        paint.forEach(item => {
          assert.equal(item.motion,null,'Reduced motion clears its session attributes');
          assert.equal(Number(item.number.text.replace(',','.')),Number(item.value),'Reduced motion preserves final table values');
          for (const part of [item.number,item.glyph]) {
            assert.equal(part.visibility,'visible');
            assert.equal(part.opacity,'1');
            assert.ok(part.width > 0 && part.height > 0,'Efficiency paint parts retain nonzero bounds');
          }
        });
        await page.screenshot({path:'/tmp/bpm-process-details-1920-monitoring-stable.png',fullPage:false});
      }
    }
  }
  await page.setViewportSize({width:1920,height:1080});
  report('1920/1440/390/320 process shell, anchors, independent table scrolling and screenshots');
}

async function structureEntry(page) {
  await page.locator('#structure-toggle').click();
  await page.waitForFunction(() => document.querySelector('#structure-list').getAttribute('aria-busy') === 'false');
  const tab = page.locator('#structure-processes-tab');
  if (await tab.getAttribute('aria-pressed') !== 'true') {
    await tab.click();
    await page.waitForFunction(() => document.querySelector('#structure-list').getAttribute('aria-busy') === 'false');
  }
  const chain = await page.evaluate(() => {
    for (const root of window.BPM_STRUCTURE.roots) for (const division of root.children) for (const product of division.children) if (product.total) return [root.id,division.id,product.id];
  });
  for (const id of chain) await page.locator(`[data-expand="${id}"]`).click();
  const trigger = page.locator(`[data-node="${chain[2]}"] [data-structure-detail]`).first(), title = await trigger.innerText();
  await openFrom(page,trigger);
  assert.equal(await page.locator('#pd-title').innerText(),title,'Structure opens the selected source process');
  await closeDrawer(page,trigger);
  await page.locator('#structure-toggle').click();
  await registryReady(page,'table');
  report('source process opens from expanded structure and Escape restores its trigger');
}

async function journeyBack(page) {
  await page.locator('#paths-tab').click();
  await registryReady(page,'table');
  const trigger = page.locator('.registry-table [data-detail]').first();
  const title = await trigger.innerText();
  const drawer = await openFrom(page,trigger,'paths');
  await drawer.locator('[data-jd-toggle-processes]').click();
  await drawer.locator('[data-jd-dismiss-summary]').click();
  const nested = drawer.locator('[data-jd-process="1"]');
  await nested.scrollIntoViewIfNeeded();
  const position = await drawer.locator('.pd-main').evaluate(element => element.scrollTop);
  const nestedTitle = (await nested.innerText()).replace(/\s*↗\s*$/,'');
  await openFrom(page,nested,'processes');
  assert.equal(await drawer.locator('#pd-title').innerText(),nestedTitle);
  await drawer.locator('[data-pd-action="back"]').click();
  await drawerReady(page);
  assert.equal(await drawer.getAttribute('data-pd-entity'),'paths');
  assert.equal(await drawer.locator('#pd-title').innerText(),title);
  assert.equal(await drawer.locator('[data-jd-toggle-processes]').getAttribute('aria-expanded'),'true');
  assert.ok(await drawer.locator('#jd-observation-synthesis').evaluate(element => element.hidden));
  await page.waitForFunction(() => document.activeElement?.matches('[data-jd-process="1"]'));
  near(await drawer.locator('.pd-main').evaluate(element => element.scrollTop),position,'Journey back restores scroll',2);
  for (const width of widths) {
    await page.setViewportSize({width,height:1080});
    await shell(page,'paths');
    for (const id of ['assessment','benchmark','additional']) {
      await scrollTo(page,id);
      await noOverflow(page,`Journey unchanged ${width} ${id}`);
    }
  }
  await closeDrawer(page,trigger);
  await page.setViewportSize({width:1920,height:1080});
  report('Journey → process → back preserves title, expanded/hidden state, scroll and focus; Journey shell unchanged at all widths');
}

(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  let page;
  try {
    page = await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'no-preference'});
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    page.on('requestfailed',request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.goto(url);
    await registryReady(page);
    const data = await page.evaluate(() => JSON.stringify([window.BPM_DATA,window.BPM_STRUCTURE_SOURCE,window.BPM_STRUCTURE,window.BPM_STRUCTURE_PATHS]));
    await page.locator('#processes-tab').click();
    await registryReady(page);
    const card = page.locator('.entity-card:not(.skeleton-card)').first(), trigger = card.locator('[data-detail]');
    const title = await trigger.innerText();
    await openFrom(page,trigger,'processes',true);
    assert.equal(await page.locator('#pd-title').innerText(),title,'Card opens the selected process');
    await shell(page);
    await motion(page);
    await verifyContent(page);
    await desktopGeometry(page);
    await filtersAndSort(page);
    await responsive(page);
    await closeDrawer(page,trigger);
    await page.locator('#table-view').click();
    await registryReady(page,'table');
    const tableTrigger = page.locator('.registry-table [data-detail]').first(), tableTitle = await tableTrigger.innerText();
    await openFrom(page,tableTrigger);
    assert.equal(await page.locator('#pd-title').innerText(),tableTitle,'Registry table opens its selected process');
    assert.equal(await page.locator('#process-drawer [data-pd-action="back"]').count(),0,'No stale Journey backlink');
    await closeDrawer(page,tableTrigger);
    await structureEntry(page);
    await journeyBack(page);
    await page.locator('#processes-tab').click();
    await registryReady(page,'table');
    const finalTrigger = page.locator('.registry-table [data-detail]').first();
    await finalTrigger.click();
    assert.ok(await page.locator('#process-drawer').evaluate(element => element.classList.contains('pd-is-loading')));
    await closeDrawer(page,finalTrigger);
    await page.waitForTimeout(2100);
    assert.equal(await page.locator('#process-drawer[open]').count(),0,'Closing during loading cancels its delayed work');
    assert.equal(await page.evaluate(() => JSON.stringify([window.BPM_DATA,window.BPM_STRUCTURE_SOURCE,window.BPM_STRUCTURE,window.BPM_STRUCTURE_PATHS])),data,'Detail interactions do not mutate source data');
    assert.deepEqual(errors,[],'No runtime errors or failed resources');
    report('card/table/structure/Journey entry points, Escape/loading cancellation, source data and resources');
    report('Process Details regression complete');
  } catch (error) {
    if (page) await page.screenshot({path:'/tmp/bpm-process-details-failure.png',fullPage:false}).catch(() => {});
    throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});

/* Shared Cabinet → insight drawer → internal-tab regression.
 * node registry/test-cabinet-insights.cjs [registry/index.html | standalone.html]
 * Runs offline in an isolated browser profile; standalone is also copied away
 * from the source assets so missing embedded resources cannot be concealed.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-cabinet-insights-'));
let source = path.resolve(process.argv[2] || path.join(__dirname, 'index.html'));
const standalone = path.basename(source) !== 'index.html';
if (standalone) {
  const copy = path.join(output, 'isolated-prototype.html');
  fs.copyFileSync(source, copy);
  source = copy;
}
const detail = '#insights-detail-view';
const drawer = '#cabinet-insight-drawer';
const scroll = `${detail} .id-detail-scroll`;
const opinionField = `${detail} [data-id-field="reproductionComment"]`;
const opinionSubmit = `${detail} [data-id-send-opinion]`;
const card = (page, id) => page.locator(`#cabinet-feed-insights .cabinet-insight-card[data-cabinet-open="${id}"]`);
const trigger = (page, id) => card(page, id).locator('.card-title');
const tab = (page, id) => page.locator(`#insights-tabs [data-insight-tab="${id}"]`);
const read = (page, id) => page.evaluate(id => BpmInsightStore.get(id), id);
const report = text => console.log(`PASS — ${text}`);
const ready = page => page.waitForFunction(() => !document.querySelector('#cabinet-panel')?.hidden && document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy') === 'false');
const registryReady = page => page.waitForFunction(() => !document.querySelector('#insights-panel')?.hidden && document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');

async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function uniqueIds(page, label) {
  const duplicates = await page.evaluate(() => {
    const seen = new Set(), duplicates = new Set();
    document.querySelectorAll('[id]').forEach(node => {if (seen.has(node.id)) duplicates.add(node.id); seen.add(node.id);});
    return [...duplicates];
  });
  assert.deepEqual(duplicates, [], `${label}: no duplicate DOM IDs`);
  assert.equal(await page.locator(detail).count(), 1, `${label}: one shared detail host`);
  assert.equal(await page.evaluate(() => window.__cabinetQaDetailHost === document.getElementById('insights-detail-view')), true, `${label}: original detail node is reused`);
}
async function cabinet(page) {
  await page.locator('#cabinet-nav').click();
  await ready(page);
  await paint(page);
}
async function navigateInsights(page) {
  if (!await page.locator('#insights-nav').isVisible()) {
    if (page.viewportSize().width <= 767) await page.locator('#mobile-menu').click();
    else if (await page.locator('body.menu-collapsed:not(.menu-peek)').count()) {
      // Pointer entry itself reveals the compact navigation. Clicking its
      // collapse button would immediately close that automatically opened menu.
      await page.mouse.move(page.viewportSize().width - 5, 5);
      await page.locator('#sidebar').hover();
    }
    if (await page.locator('#paths-nav').getAttribute('aria-expanded') !== 'true') await page.locator('#paths-nav').click();
  }
  await page.locator('#insights-nav').click();
  await registryReady(page);
}
async function openDrawer(page, id) {
  const hash = new URL(page.url()).hash;
  await trigger(page, id).click();
  await page.locator(`${drawer}[open] ${detail}[data-insight-id="${id}"]`).waitFor();
  await paint(page);
  assert.ok(await page.locator('#cabinet-panel').isVisible(), `${id}: Cabinet stays visible behind its drawer`);
  assert.equal(await page.locator('#insights-panel').isVisible(), false, `${id}: registry does not replace Cabinet`);
  assert.equal(new URL(page.url()).hash, hash, `${id}: opening the drawer does not navigate`);
  assert.equal(await tab(page, id).count(), 1, `${id}: internal tab exists immediately`);
  assert.equal(await page.locator('dialog[open]').count(), 1, `${id}: exactly one active drawer`);
  assert.equal(await page.locator(`${detail} #insight-detail-title`).textContent(), (await read(page, id)).title, `${id}: detail comes from the shared store`);
  await uniqueIds(page, `Open ${id}`);
}
async function closeDrawer(page, id, escape = false) {
  if (escape) await page.keyboard.press('Escape');
  else await page.locator(`${drawer} [data-id-drawer-close]`).click();
  await page.locator(`${drawer}[open]`).waitFor({state:'hidden'});
  await paint(page);
  assert.ok(await page.locator('#cabinet-panel').isVisible(), `${id}: closing returns to Cabinet`);
  assert.equal(await trigger(page, id).evaluate(node => node === document.activeElement), true, `${id}: close restores the originating card's focus`);
  assert.equal(await tab(page, id).count(), 1, `${id}: closing the drawer retains its tab`);
  await uniqueIds(page, `Close ${id}`);
}
async function transfer(page, id) {
  await page.locator(`${drawer} [data-id-open-tab]`).click();
  await page.locator(`${drawer}[open]`).waitFor({state:'hidden'});
  await registryReady(page);
  await paint(page);
  assert.equal(new URL(page.url()).hash, '#insights', `${id}: explicit transfer navigates to Insights`);
  assert.ok(await page.locator(`#insights-panel ${detail}[data-insight-id="${id}"]`).isVisible(), `${id}: shared host is now inside the registry`);
  assert.equal(await tab(page, id).getAttribute('aria-selected'), 'true', `${id}: transferred tab is selected`);
  assert.equal(await tab(page, id).count(), 1, `${id}: transferring does not duplicate the tab`);
  assert.equal(await page.locator('dialog[open]').count(), 0, `${id}: internal detail is not a modal`);
  await uniqueIds(page, `Transfer ${id}`);
}
async function setScroll(page, fraction) {
  await page.locator(scroll).evaluate((node, fraction) => {
    node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight) * fraction;
    node.dispatchEvent(new Event('scroll'));
  }, fraction);
  await paint(page);
}
async function gate(page) {
  return page.locator(opinionSubmit).evaluate(node => ({
    disabled:node.disabled, pending:node.getAttribute('data-scroll-pending'),
    progress:Number(node.getAttribute('data-scroll-progress')),
    meters:[...node.querySelectorAll('.scroll-cta-meter')].filter(item => !item.hidden && getComputedStyle(item).display !== 'none').length
  }));
}
async function geometry(page) {
  return page.locator(drawer).evaluate(root => {
    const box = node => {const b = node.getBoundingClientRect(); return {left:b.left, right:b.right, top:b.top, bottom:b.bottom, width:b.width, height:b.height};};
    const scroll = root.querySelector('.id-detail-scroll');
    return {drawer:box(root), header:box(root.querySelector('.id-detail-header')), footer:box(root.querySelector('.id-detail-footer')),
      scroll:box(scroll), scrollWidth:scroll.scrollWidth, clientWidth:scroll.clientWidth, scrollTop:scroll.scrollTop,
      scrollHeight:scroll.scrollHeight, clientHeight:scroll.clientHeight, pageWidth:document.documentElement.scrollWidth};
  });
}
async function assets(page, label) {
  const images = await page.locator(`${detail} img`).evaluateAll(async nodes => {
    await Promise.all(nodes.map(node => node.decode().catch(() => {})));
    return nodes.map(node => ({src:node.getAttribute('src'), loaded:node.complete && node.naturalWidth > 0}));
  });
  assert.ok(images.length > 10, `${label}: detail assets exist`);
  assert.deepEqual(images.filter(image => !image.loaded), [], `${label}: all assets load`);
  if (standalone) assert.ok(images.every(image => /^(data:|blob:)/.test(image.src)), `${label}: standalone detail assets are embedded`);
}

(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1440, height:920}, offline:true});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  page.setDefaultTimeout(15000);
  try {
    const started = Date.now();
    await page.goto(pathToFileURL(source).href);
    await page.locator('#cabinet-feed-insights[aria-busy="true"]').waitFor();
    assert.equal(await page.locator('#cabinet-feed-insights .cabinet-skeleton').count(), 3, 'Cabinet automatically shows three insight placeholders');
    assert.equal(await page.locator('#cabinet-feed-insights .skeleton-shape').first().evaluate(node => getComputedStyle(node, '::after').animationName), 'bpm-shimmer', 'Loading has the shared shimmer animation');
    await ready(page);
    assert.ok(Date.now() - started >= 1800, 'Initial Cabinet loading finishes automatically after the loading interval');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(() => {window.__cabinetQaDetailHost = document.getElementById('insights-detail-view');});
    const records = await page.evaluate(() => BpmInsightStore.list());
    const renderedIds = await page.locator('#cabinet-feed-insights .cabinet-insight-card').evaluateAll(nodes => nodes.map(node => node.dataset.cabinetOpen));
    assert.deepEqual(renderedIds.sort(), records.map(row => row.id).sort(), 'Cabinet lists the actual shared-store records');
    assert.equal(Number(await page.locator('#cabinet-heading-insights .cabinet-count').textContent()), records.length, 'Cabinet counter equals actual store length');
    assert.ok(renderedIds.includes('INS-000056'), 'Requested approved example is present');
    await uniqueIds(page, 'Initial Cabinet');
    report('automatic shimmer completion and live shared-store records/counter');

    const original = await read(page, 'INS-000067');
    await page.evaluate(() => BpmInsightStore.update('INS-000067', {title:'Проверка синхронизации общей записи', status:'Реализовано', source:'ТБ', rating:4.1, comments:7}));
    assert.equal(await trigger(page, original.id).textContent(), 'Проверка синхронизации общей записи', 'Store updates immediately change Cabinet titles');
    assert.match(await card(page, original.id).innerText(), /Реализовано/);
    assert.match(await card(page, original.id).innerText(), /ТБ/);
    assert.match(await card(page, original.id).locator('.cabinet-feedback').innerText(), /4,1/);
    assert.equal(await page.locator('#cabinet-feed-insights').getAttribute('aria-busy'), 'false', 'A store notification does not restart loading');
    await page.evaluate(row => BpmInsightStore.update(row.id, {title:row.title, status:row.status, source:row.source, rating:row.rating, comments:row.comments}), original);
    const added = await page.evaluate(() => BpmInsightStore.create({title:'Новый общий инсайт для Cabinet QA', description:'Проверка обновления ленты и счётчика.', source:'SberBPM ЦА'}));
    assert.equal(await card(page, added.id).count(), 1, 'New store record appears in Cabinet without reload');
    assert.equal(Number(await page.locator('#cabinet-heading-insights .cabinet-count').textContent()), records.length + 1, 'Counter follows creation');
    await page.locator('[data-cabinet-nav="insights"]').click();
    await registryReady(page);
    assert.equal(new URL(page.url()).hash, '#insights', 'Cabinet Insights heading opens the registry');
    const registryTotal = (await page.locator('#insights-count').textContent()).split('/').at(-1).trim();
    assert.equal(Number(registryTotal), records.length + 1, 'Registry and Cabinet share the same total even when a date filter limits the list');
    assert.ok(await page.locator('#insights-registry-view').isVisible(), 'Heading opens the registry list');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await cabinet(page);
    await page.locator('#cabinet-create-insights').click();
    await page.locator('#insight-create-drawer[open]').waitFor();
    assert.ok(await page.locator('#cabinet-panel').isVisible(), 'Cabinet create opens the existing insight form in place');
    await page.locator('#insight-create-drawer [data-close]').first().click();
    await page.locator('#insight-create-drawer[open]').waitFor({state:'hidden'});
    assert.equal(await page.locator('#cabinet-create-insights').evaluate(node => node === document.activeElement), true, 'Closing creation restores the Cabinet create control');
    report('live updates and creation keep both counters in sync; heading and create actions work');

    const byStatus = [...new Map(records.map(row => [row.status, row.id])).entries()];
    const statuses = await page.evaluate(() => [...BpmInsightWorkflow.statuses]);
    assert.deepEqual(byStatus.map(([status]) => status).sort(), statuses.sort(), 'Demo records cover every canonical status');
    for (const [status, id] of byStatus) {
      await openDrawer(page, id);
      assert.match(await page.locator(`${detail} .id-detail-meta`).innerText(), new RegExp(status), `${id}: correct status is visible`);
      await closeDrawer(page, id, status === 'Отклонено');
    }
    await openDrawer(page, 'INS-000056');
    await closeDrawer(page, 'INS-000056');
    await openDrawer(page, 'INS-000056');
    assert.equal(await tab(page, 'INS-000056').count(), 1, 'Repeated opening deduplicates the internal tab');
    await closeDrawer(page, 'INS-000056', true);
    report('all statuses open in Cabinet, one tab per insight, close/Escape return focus');

    await openDrawer(page, 'INS-000055');
    const opinionBefore = (await read(page, 'INS-000055')).detail.workflow.opinions.responses;
    await page.locator(`${detail} [data-id-reproduction="Воспроизводится"]`).click();
    await page.locator(opinionField).fill('Несохранённое мнение при переходе из кабинета');
    await setScroll(page, 0);
    let progress = await gate(page);
    assert.equal(progress.pending, 'true', 'Primary opinion action waits for full content reading');
    assert.equal(progress.disabled, true);
    assert.equal(progress.progress, 0);
    assert.equal(progress.meters, 1, 'One visible reading-progress indicator');
    await page.locator(opinionSubmit).evaluate(node => node.click());
    assert.deepEqual((await read(page, 'INS-000055')).detail.workflow.opinions.responses, opinionBefore, 'Direct click cannot bypass the reading gate or save a draft');
    await setScroll(page, 0.4);
    progress = await gate(page);
    assert.ok(progress.progress > 0.3 && progress.progress < 0.5, 'Reading progress follows the actual scroll');
    const drawerPosition = await page.locator(scroll).evaluate(node => node.scrollTop);
    await transfer(page, 'INS-000055');
    assert.equal(await page.locator(opinionField).inputValue(), 'Несохранённое мнение при переходе из кабинета', 'Unsaved opinion survives moving the shared detail into a tab');
    assert.equal(await page.locator(`${detail} [data-id-reproduction="Воспроизводится"]`).getAttribute('aria-pressed'), 'true');
    assert.deepEqual((await read(page, 'INS-000055')).detail.workflow.opinions.responses, opinionBefore, 'Transfer itself does not submit the opinion');
    const transferredProgress = await gate(page);
    assert.equal(transferredProgress.pending, 'true', 'Partial reading still requires completion after transfer');
    assert.ok(transferredProgress.progress > 0 && transferredProgress.progress < 1, 'Transfer preserves partial progress instead of resetting it');
    const tabPosition = await page.locator(scroll).evaluate(node => ({top:node.scrollTop, header:node.querySelector('.id-detail-header')?.getBoundingClientRect().height || 0}));
    assert.ok(Math.abs(tabPosition.top - drawerPosition) <= Math.max(2, tabPosition.header + 2), 'Transfer preserves reading position within the header height when the header returns to the tab scroll');
    await setScroll(page, 1);
    assert.equal((await gate(page)).pending, null);
    assert.equal((await gate(page)).disabled, false);
    await cabinet(page);
    await openDrawer(page, 'INS-000055');
    assert.equal(await page.locator(opinionField).inputValue(), 'Несохранённое мнение при переходе из кабинета', 'A pending tab draft survives return to its Cabinet drawer');
    await setScroll(page, 0);
    assert.equal((await gate(page)).pending, null, 'Completed reading remains latched when the same detail reopens');
    await closeDrawer(page, 'INS-000055');
    await navigateInsights(page);
    assert.equal(await tab(page, 'INS-000055').getAttribute('aria-selected'), 'true', 'Navigation after closing shows the retained insight tab');
    assert.equal(await page.locator(opinionField).inputValue(), 'Несохранённое мнение при переходе из кабинета', 'Closing drawer then navigating preserves its draft');
    assert.equal((await gate(page)).pending, null, 'Closing and navigation preserve completed reading');
    report('primary reading gate, unsaved opinion and reading progress survive transfer, close and navigation');

    await cabinet(page);
    await openDrawer(page, 'INS-000056');
    for (const width of [320, 390, 1440, 3840]) {
      const height = width === 3840 ? 2160 : 920;
      await page.setViewportSize({width, height});
      await setScroll(page, 0);
      const before = await geometry(page);
      const expected = width <= 767 ? width : (width - 328) * 10 / 12 + 216;
      assert.ok(Math.abs(before.drawer.width - expected) <= 2, `${width}: drawer follows the 10-column/fullscreen width (${before.drawer.width}/${expected})`);
      assert.ok(Math.abs(before.drawer.right - (width <= 767 ? width : width - 32)) <= 1, `${width}: drawer follows the fullscreen edge or desktop outer margin`);
      assert.ok(before.drawer.left >= -1 && before.drawer.top >= -1 && before.drawer.bottom <= height + 1, `${width}: drawer stays in the viewport`);
      if (width <= 767) {
        assert.ok(Math.abs(before.drawer.left) <= 1 && Math.abs(before.drawer.top) <= 1 && Math.abs(before.drawer.height - height) <= 1, `${width}: mobile drawer is fullscreen`);
      }
      assert.ok(before.pageWidth <= width + 1 && before.scrollWidth <= before.clientWidth + 1, `${width}: no page or main detail horizontal overflow`);
      assert.ok(before.header.top >= -1 && before.header.bottom < before.footer.top && before.footer.bottom <= height + 1, `${width}: header and footer remain visible`);
      if (width <= 1440) assert.ok(before.scrollHeight > before.clientHeight + 2, `${width}: this scenario has independently scrollable detail content`);
      await assets(page, `${width}px drawer`);
      await page.screenshot({path:path.join(output, `cabinet-insight-${width}-top.png`)});
      await setScroll(page, 1);
      const after = await geometry(page);
      if (before.scrollHeight > before.clientHeight + 2) assert.ok(after.scrollTop > 0, `${width}: the detail body scrolls`);
      for (const [name, edge] of [['header', 'top'], ['header', 'bottom'], ['footer', 'top'], ['footer', 'bottom']]) {
        assert.ok(Math.abs(before[name][edge] - after[name][edge]) <= 1, `${width}: ${name} ${edge} is fixed while body scrolls (${before[name][edge]} → ${after[name][edge]})`);
      }
      await page.screenshot({path:path.join(output, `cabinet-insight-${width}-bottom.png`)});
      await uniqueIds(page, `${width}px drawer`);
    }
    await page.setViewportSize({width:1440, height:920});
    await paint(page);
    report('320/390/1440/3840px drawer width, fullscreen mobile, fixed header/footer, body scrolling and assets');

    const authored = (await read(page, 'INS-000056')).detail.effects;
    await page.locator(`${detail} [data-id-reproduction="Воспроизводится"]`).click();
    await page.locator(opinionField).fill('Мнение сохранено в drawer кабинета');
    await page.locator(`${detail} [data-id-applicable="0"]`).click();
    await page.locator(`${detail} [data-id-field="effect:0:current"]`).fill('630');
    await page.locator(`${detail} [data-id-field="effect:0:target"]`).fill('125');
    await page.locator(`${detail} [data-id-field="effect:0:target"]`).press('Tab');
    await setScroll(page, 1);
    await page.locator(opinionSubmit).click();
    const saved = await read(page, 'INS-000056'), bank = saved.detail.workflow.currentActor.bank;
    const own = saved.detail.workflow.opinions.responses.filter(response => response.bank === bank);
    assert.equal(own.length, 1, 'Drawer submits one opinion for the current bank');
    assert.equal(own[0].comment, 'Мнение сохранено в drawer кабинета');
    assert.equal(own[0].effects[0].current, '630');
    assert.equal(own[0].effects[0].target, '125');
    assert.deepEqual(saved.detail.effects, authored, 'Bank opinion does not overwrite the author’s baseline effects');
    await page.locator(`${detail} [data-id-rating="4"]`).click();
    assert.equal((await read(page, 'INS-000056')).detail.userRating, 4, 'Drawer rating updates the shared store');
    await transfer(page, 'INS-000056');
    assert.equal(await page.locator(opinionField).inputValue(), 'Мнение сохранено в drawer кабинета', 'Tab shows the opinion saved in Cabinet');
    assert.equal(await page.locator(`${detail} [data-id-field="effect:0:current"]`).inputValue(), '630');
    assert.equal(await page.locator(`${detail} [data-id-field="effect:0:target"]`).inputValue(), '125');
    assert.equal(await page.locator(`${detail} [data-id-rating="4"]`).getAttribute('aria-pressed'), 'true', 'Tab shows the rating saved in Cabinet');
    assert.equal(await page.locator(`${detail} [data-id-rating-value]`).textContent(), '4,0');
    await page.screenshot({path:path.join(output, 'cabinet-insight-transferred-desktop.png')});
    await cabinet(page);
    await openDrawer(page, 'INS-000056');
    await page.locator(opinionField).fill('Изменение после сохранения без отправки');
    await closeDrawer(page, 'INS-000056');
    await navigateInsights(page);
    assert.equal(await page.locator(opinionField).inputValue(), 'Изменение после сохранения без отправки', 'A later unsaved edit survives close and registry navigation');
    assert.equal((await read(page, 'INS-000056')).detail.workflow.opinions.responses.find(response => response.bank === bank).comment, 'Мнение сохранено в drawer кабинета', 'Unsaved later edit leaves the previously submitted opinion unchanged');
    report('drawer opinion/effects/rating persist into the tab; later unsaved edits remain local and survive close');

    await page.locator('#insights-back').click();
    await registryReady(page);
    await page.locator('#insights-results [data-insight-open="INS-000052"]').click();
    await page.locator(`#insights-panel ${detail}[data-insight-id="INS-000052"]`).waitFor();
    assert.equal(await page.locator('dialog[open]').count(), 0, 'Opening from the existing registry still uses a normal internal tab');
    assert.equal(await tab(page, 'INS-000052').count(), 1, 'Existing registry reuses the tab opened from Cabinet');
    assert.equal(await page.locator(`${detail} [data-id-drawer-close]`).isVisible(), false, 'Drawer-only controls are hidden in a normal tab');
    await uniqueIds(page, 'Final registry');
    assert.deepEqual(errors, [], 'No page or browser-console errors');
    report(`existing registry behavior and zero duplicate IDs/runtime errors. Screenshots: ${output}`);
  } catch (error) {
    await page.screenshot({path:path.join(output, 'failure.png')}).catch(() => {});
    console.error(`Screenshots: ${output}`);
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});

/* Inline insight detail: bank opinions, process-team decisions and read-only states. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source = path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
const ready = page => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
const read = (page,id) => page.evaluate(id => window.BpmInsightStore.get(id),id);
const readToEnd = page => page.locator('#insights-detail-view .id-detail-scroll').evaluate(node => {node.scrollTop = node.scrollHeight;node.dispatchEvent(new Event('scroll'));});
async function open(page,id) {
  if (await page.locator('#insights-back').isVisible()) await page.locator('#insights-back').click();
  await ready(page);
  await page.locator(`[data-insight-open="${id}"]`).click();
  await page.locator('#insight-detail-title').waitFor();
}
async function main() {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
  const page = await context.newPage(), errors = [];
  page.on('pageerror',error => errors.push(String(error)));
  try {
    await page.goto(pathToFileURL(source).href+'#insights'); await ready(page);
    await open(page,'INS-000055');
    assert.equal(await page.locator('dialog[open]').count(),0,'Detail remains an internal tab');
    assert.equal(await page.locator('[data-id-reproduction]').count(),4,'Other bank can assess reproducibility');
    const authored = (await read(page,'INS-000055')).detail.effects;
    await page.locator('[data-id-reproduction="Воспроизводится"]').click();
    await page.locator('[data-id-applicable="0"]').click();
    await page.locator('[data-id-field="effect:0:current"]').fill('500');
    await page.locator('[data-id-field="effect:0:target"]').fill('100');
    await page.locator('[data-id-field="effect:0:target"]').press('Tab');
    assert.equal((await read(page,'INS-000055')).detail.workflow.opinions.responses.filter(item => item.bank === 'Поволжский банк').length,0,'Draft is not submitted early');
    await readToEnd(page);await page.locator('[data-id-send-opinion]').click();
    let saved = await read(page,'INS-000055');
    let own = saved.detail.workflow.opinions.responses.find(item => item.bank === 'Поволжский банк');
    assert.equal(own.effects[0].current,'500');
    assert.deepEqual(saved.detail.effects,authored,'Bank metrics preserve author metrics');
    await page.locator('#insights-detail-view').screenshot({path:'/tmp/insight-detail-updated-desktop.png'});
    await page.locator('[data-id-field="effect:0:current"]').fill('700');
    await page.locator('[data-id-field="effect:0:current"]').press('Tab');
    await page.locator('[data-id-send-opinion]').click();
    saved = await read(page,'INS-000055');
    assert.equal(saved.detail.workflow.opinions.responses.filter(item => item.bank === 'Поволжский банк').length,1,'One bank has one opinion after editing');
    assert.equal(saved.detail.workflow.opinions.responses.find(item => item.bank === 'Поволжский банк').effects[0].current,'700');
    await page.locator('[data-id-reproduction="Не воспроизводится"]').click();
    assert.equal(await page.locator('[data-id-reset-confirm]').count(),1,'Losing metrics requires an explicit choice');
    await page.locator('[data-id-reset-cancel]').click();
    assert.equal(await page.locator('[data-id-field="effect:0:current"]').inputValue(),'700');
    await page.locator('[data-id-reproduction="Не воспроизводится"]').click();
    await page.locator('[data-id-reset-confirm]').click();
    assert.equal(await page.locator('[data-id-applicable]').count(),0,'No effect entry for non-reproducible opinion');
    await page.locator('[data-id-send-opinion]').click();
    own = (await read(page,'INS-000055')).detail.workflow.opinions.responses.find(item => item.bank === 'Поволжский банк');
    assert.equal(own.reproduction,'Не воспроизводится');
    assert.deepEqual(own.effects,[]);
    console.log('PASS — Bank opinions submit explicitly, update in place, preserve baselines and confirm data loss');

    await open(page,'INS-000054');
    const decisionRow = await read(page,'INS-000054');
    assert.equal(await page.locator('[data-id-reproduction]').count(),0,'Process owner cannot edit another bank opinion');
    await page.locator('[data-id-reject]').click();
    assert.equal(await page.locator('[data-id-decision-submit]').isDisabled(),true,'Reject requires reason');
    await page.locator('[name="decisionComment"]').fill('Решение уже реализовано в другом процессе.');
    await readToEnd(page);await page.locator('[data-id-decision-submit]').click();
    const rejected = await read(page,'INS-000054');
    assert.equal(rejected.status,'Отклонено');
    assert.ok(rejected.detail.comments.some(item => item.text === 'Решение уже реализовано в другом процессе.'));
    assert.equal(await page.locator('[data-id-reject],[data-id-take]').count(),0,'Decision actions close after a terminal decision');
    assert.equal(await page.locator('[data-id-comment-form]').count(),1);
    assert.equal(await page.locator('[data-id-rating]').count(),5);
    await page.locator('[data-id-field="newComment"]').fill('Комментарий после решения');
    await page.locator('[data-id-comment-form] button').click();
    assert.ok((await read(page,'INS-000054')).detail.comments.some(item => item.text === 'Комментарий после решения'));
    await page.locator('[data-id-rating="4"]').click();
    assert.equal((await read(page,'INS-000054')).detail.userRating,4);
    await page.evaluate(row => window.BpmInsightStore.update(row.id,{status:row.status,detail:row.detail,rejection:'',comments:row.comments}),decisionRow);
    await open(page,'INS-000054');
    await readToEnd(page);await page.locator('[data-id-take]').click();
    assert.equal((await read(page,'INS-000054')).status,'В работе');
    assert.equal(await page.locator('[data-id-reproduction],[data-id-applicable]').count(),0);
    console.log('PASS — Required rejection reason, canonical team decisions, comments and ratings remain available');

    for (const id of ['INS-000055','INS-000054']) {
      await open(page,id);
      for (const width of [1920,768,390]) {
        await page.setViewportSize({width,height:1080});
        await page.waitForFunction(() => [...document.querySelectorAll('#insights-detail-view img')].every(image => image.complete && image.naturalWidth));
        const dimensions = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth}));
        assert.ok(dimensions.scroll <= dimensions.width+1,`${id}: no overflow at ${width}`);
        const broken = await page.locator('#insights-detail-view img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.src));
        assert.deepEqual(broken,[],`${id}: all detail assets load at ${width}`);
        if (id === 'INS-000055' && width === 390) await page.screenshot({path:'/tmp/insight-detail-updated-mobile.png',fullPage:true});
      }
    }
    assert.deepEqual(errors,[]);
    console.log('PASS — Desktop/tablet/mobile detail layout, static assets and runtime');
  } finally {await browser.close();}
}
main().catch(error => {console.error(error);process.exitCode=1;});

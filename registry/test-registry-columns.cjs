/* Regression coverage for the three-column process/client-path registry tables. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = process.env.BPM_TEST_URL || pathToFileURL(path.join(__dirname, 'index.html')).href;

async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#results').getAttribute('aria-busy') === 'false');
}

async function assertTable(page, entity, loading) {
  const table = page.locator('#results .registry-table');
  assert.equal(await table.count(), 1);
  assert.equal(await table.locator('col').count(), 3, 'Exactly three layout columns');
  assert.deepEqual(await table.locator('th [data-sort]').evaluateAll(buttons => buttons.map(button => button.dataset.sort)), ['id','owner','eff']);
  assert.equal(await table.locator('[data-sort="status"], [data-sort="tags"], .table-status, .table-tags, .skeleton-table-status, .skeleton-table-tags').count(), 0);
  assert.equal(await table.locator('caption').innerText(), entity === 'paths' ? 'Клиентские пути' : 'Процессы');
  const rows = await table.locator('tbody tr').evaluateAll(rows => rows.map(row => ({cells:row.cells.length,skeleton:row.classList.contains('skeleton-row')})));
  assert.ok(rows.length > 0);
  assert.ok(rows.every(row => row.cells === 3 && row.skeleton === loading), 'Data and shimmer rows match the three columns');
  const dimensions = await page.evaluate(() => {
    const viewport = innerWidth, table = document.querySelector('.registry-table'), scroll = table.parentElement;
    return {viewport,document:document.documentElement.scrollWidth,scrollWidth:scroll.clientWidth,scrollLeft:scroll.getBoundingClientRect().left,scrollRight:scroll.getBoundingClientRect().right,table:table.getBoundingClientRect().width,columns:[...table.querySelectorAll('th')].map(cell => cell.getBoundingClientRect().width)};
  });
  assert.ok(dimensions.document <= dimensions.viewport + 1, 'Table scrolling does not overflow the page');
  assert.ok(dimensions.scrollLeft >= 0 && dimensions.scrollRight <= dimensions.viewport + 1, 'Table viewport remains on screen');
  assert.equal(dimensions.columns[1],240);
  assert.equal(dimensions.columns[2],188);
  assert.ok(dimensions.columns[0] >= 439, 'Freed table width goes to the description');
  return dimensions.columns;
}

async function assertOrder(page, entity, key, direction) {
  const result = await page.evaluate(({entity,key,direction}) => {
    const compare = new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
    const expected = window.BPM_DATA.filter(row => row.entity === entity && row.date >= '2001-08-21' && row.date <= '2026-09-13').sort((a,b) => {
      const comparison = key === 'id' ? a.number-b.number : key === 'eff' ? a.efficiency-b.efficiency : compare.compare(a.owner,b.owner);
      return (direction === 'desc' ? -comparison : comparison) || a.number-b.number;
    }).slice(0,25).map(row => row.id);
    return {expected,actual:[...document.querySelectorAll('#results tbody tr')].map(row => row.dataset.record)};
  },{entity,key,direction});
  assert.deepEqual(result.actual,result.expected,`${entity}: ${key} ${direction}`);
  assert.equal(await page.locator('#results th[aria-sort]').count(),1,'Only one active sort');
  assert.equal(await page.locator(`#results th:has([data-sort="${key}"])`).getAttribute('aria-sort'),direction === 'asc' ? 'ascending' : 'descending');
}

(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {
    for (const width of [1920,1440,390,320]) {
      const page = await browser.newPage({viewport:{width,height:1100},reducedMotion:'reduce'});
      const errors = [];
      page.on('pageerror',error => errors.push(error.message));
      await page.goto(url);
      await ready(page);
      const originalData = await page.evaluate(() => JSON.stringify(window.BPM_DATA));
      for (const entity of ['paths','processes']) {
        if (entity === 'processes') {
          await page.locator('#processes-tab').click();
          const loadingColumns = await assertTable(page,entity,true);
          await ready(page);
          assert.deepEqual(await assertTable(page,entity,false),loadingColumns,'Switching entity keeps shimmer/data geometry identical');
        } else {
          await page.locator('#table-view').click();
          const loadingColumns = await assertTable(page,entity,true);
          await ready(page);
          assert.deepEqual(await assertTable(page,entity,false),loadingColumns,'Shimmer/data geometry identical');
        }
        assert.equal(await page.locator('#sort-select').isVisible(),false,'Cards-only sort select stays hidden');
        for (const key of ['owner','eff','id']) {
          for (const direction of ['asc','desc']) {
            await page.locator(`#results [data-sort="${key}"]`).click();
            await assertOrder(page,entity,key,direction);
          }
        }
        await page.locator('#cards-view').click();
        await ready(page);
        assert.ok(await page.locator('#results .entity-card .status time').count() > 0,'Card status and dates are preserved');
        if(entity === 'processes') assert.ok(await page.locator('#results .card-tags .tag').count() > 0,'Card tags are preserved');
        await page.locator('#table-view').click();
        await assertTable(page,entity,true);
        await ready(page);
        await assertTable(page,entity,false);
        await assertOrder(page,entity,'id','desc');
      }
      assert.equal(await page.evaluate(() => JSON.stringify(window.BPM_DATA)),originalData,'Source data remains untouched');
      assert.deepEqual(errors,[],'No browser exceptions');
      console.log(`PASS — ${width}px: both entities, three-column data/shimmer, all remaining sorts, cards/table switching, no page overflow`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});

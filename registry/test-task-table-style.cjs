/* Products BPM 137:12975: registry-only geometry and interaction regression.
 * BPM_TASK_TABLE_FILE=../Sber-BPM-Registry-Standalone.html node test-task-table-style.cjs
 * All reference fixtures live in an isolated browser DOM, never in the task store.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file = path.resolve(process.env.BPM_TASK_TABLE_FILE || path.join(__dirname, 'index.html'));
const url = process.env.BPM_TASK_TABLE_URL || pathToFileURL(file).href;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-task-table-style-'));
const fixture = {
  id:'К-2026-0002', type:'Тип задачи', title:'Согласование доступа к процессу максимум в две строки',
  description:'При приеме на работу нового сотрудника и для перечислений выплат…',
  processId:'1232', processCode:'П1232', processTitle:'Предоставление инвесторам / аналитикам информации по …',
  initiator:'Константинопольский Игорь Иванович', assignees:['Алексей Иванов','Иван Петров','Анна Орлова','Мария Козлова','Олег Соколов','Павел Смирнов'],
  created:'2026-03-26T13:22:00', deadline:'2026-09-21', status:'На доработке'
};
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < .75, `${label}: ${actual} versus ${expected}`);
async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#tasks-results')?.getAttribute('aria-busy') === 'false');
  await paint(page);
}
(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  try {
    const context = await browser.newContext({viewport:{width:1920,height:1080}});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${url}#tasks`);
    await ready(page);
    const originalCount = await page.locator('#tasks-results .task-table-row').count();
    await page.evaluate(fixture => {
      const host = document.createElement('section');
      host.id = 'task-table-style-fixture';
      host.style.cssText = 'position:absolute;left:16px;top:16px;width:1485px;z-index:9000;background:white';
      host.innerHTML = window.BpmTaskVisuals.table([fixture], {sortKey:'title',sortDir:'asc'});
      document.body.append(host);
    }, fixture);
    await paint(page);
    const geometry = await page.locator('#task-table-style-fixture').evaluate(host => {
      const table = host.querySelector('table'), row = table.querySelector('tbody tr');
      const top = row.getBoundingClientRect().top;
      const metric = selector => {
        const element = host.querySelector(selector), box = element.getBoundingClientRect(), css = getComputedStyle(element);
        return {x:box.x-table.getBoundingClientRect().x,y:box.y-top,width:box.width,height:box.height,fontSize:css.fontSize,lineHeight:css.lineHeight,fontWeight:css.fontWeight,letterSpacing:css.letterSpacing};
      };
      return {
        headerHeight:table.tHead.getBoundingClientRect().height,rowHeight:row.getBoundingClientRect().height,
        widths:[...table.tHead.rows[0].cells].map(cell => cell.getBoundingClientRect().width),
        header:[...table.querySelectorAll('th .task-sort-button')].map(element => ({fontSize:getComputedStyle(element).fontSize,lineHeight:getComputedStyle(element).lineHeight})),
        tags:metric('.task-table-tags'), title:metric('.task-table-title'), description:metric('.task-table-description'),
        processId:metric('.task-table-process .task-id-badge'), process:metric('.task-process-link'),
        owner:metric('.task-owner'), participants:metric('.task-avatar-group'), created:metric('.task-table-created time'),
        deadline:metric('.task-table-deadline .task-deadline'), status:metric('.task-status'),
        images:[...host.querySelectorAll('img')].filter(image => image.getClientRects().length).map(image => ({src:image.getAttribute('src'),width:image.width,height:image.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,complete:image.complete})),
        deadlineText:host.querySelector('.task-table-deadline').innerText.trim(),
        prefixes:host.querySelectorAll('.task-deadline-prefix').length
      };
    });
    near(geometry.headerHeight,56,'Header height');near(geometry.rowHeight,180,'Row height');
    [326,328,248,129,132,161,161].forEach((width,index) => near(geometry.widths[index],width,`Column ${index+1}`));
    geometry.header.forEach(font => assert.deepEqual(font,{fontSize:'13px',lineHeight:'18px'}));
    for (const key of ['tags','processId']) {near(geometry[key].y,24,`${key} Y`);near(geometry[key].height,24,`${key} height`);}
    for (const key of ['title','process','owner','created','deadline']) near(geometry[key].y,56,`${key} Y`);
    near(geometry.description.y,112,'Description Y');near(geometry.participants.y,63,'Participants Y');near(geometry.status.y,55,'Status Y');
    for(const key of ['title','process']) {assert.equal(geometry[key].fontWeight,'590');assert.equal(geometry[key].fontSize,'17px');assert.equal(geometry[key].lineHeight,'24px');}
    near(geometry.owner.height,48,'Two-line owner');near(geometry.participants.width,113,'Participant overlap');
    assert.equal(geometry.deadlineText,'21.09.2026');assert.equal(geometry.prefixes,0);
    assert.ok(geometry.images.every(image => image.complete && image.naturalWidth > 0),'Every visible static SVG resolves');
    assert.ok(geometry.images.every(image => image.width===image.naturalWidth && image.height===image.naturalHeight),'Every visible SVG uses its exact native dimensions');
    await page.locator('#task-table-style-fixture').screenshot({path:path.join(output,'reference-row-1485.png')});
    await page.locator('#task-table-style-fixture').evaluate(host => host.remove());
    console.log('PASS — exact 1485px reference, 56px header / 180px row, typography, baseline offsets and original icon slots');
    for(const width of [1920,1440,1024,390,320]) {
      await page.setViewportSize({width,height:1080});await paint(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),`${width}: no page overflow`);
      const rows = await page.locator('#tasks-results .task-table-row').evaluateAll(elements => elements.map(row => row.getBoundingClientRect().height));
      rows.forEach(height => near(height,180,`${width} row height`));
      near(await page.locator('#tasks-results thead').evaluate(element => element.getBoundingClientRect().height),56,`${width} header height`);
      assert.equal(await page.locator('#tasks-results thead br').count(),0,`${width}: every header label stays on one line`);
      const createdOverflow = await page.locator('#tasks-results .task-table-created time').evaluateAll(elements => elements.some(element => {
        const range=document.createRange();range.selectNodeContents(element);
        return [...range.getClientRects()].some(box=>box.right>element.getBoundingClientRect().right+.75);
      }));
      assert.equal(createdOverflow,false,`${width}: date and time stay inside their column content area`);
      const scroller = page.locator('#tasks-results .tasks-table-scroll');
      const scroll = await scroller.evaluate(element => {element.scrollLeft=element.scrollWidth;return {left:element.scrollLeft,width:element.clientWidth,total:element.scrollWidth};});
      if(scroll.total > scroll.width+1) assert.ok(scroll.left>0,`${width}: local horizontal scroll`);
      const sort = page.locator('#tasks-results [data-task-sort="status"]');
      await sort.click();assert.equal(await sort.locator('..').getAttribute('aria-sort'),'ascending');
      await sort.click();assert.equal(await sort.locator('..').getAttribute('aria-sort'),'descending');
      assert.equal(await page.locator('#tasks-results .task-table-row').count(),originalCount);
      await scroller.evaluate(element => {element.scrollLeft=0;});
      await page.screenshot({path:path.join(output,`registry-${width}.png`)});
      // Reset the sort state so every viewport checks the same two clicks.
      await page.locator('#tasks-results [data-task-sort="title"]').click();
    }
    await page.setViewportSize({width:1920,height:1080});
    await page.locator('#tasks-cards').click();await ready(page);
    assert.equal(await page.locator('#tasks-results .task-card').first().evaluate(element => element.getBoundingClientRect().height),304);
    assert.equal(await page.locator('#tasks-results .task-card-title').first().evaluate(element => getComputedStyle(element).fontSize),'22px');
    assert.ok(await page.locator('#tasks-results .task-card .task-deadline-prefix').count()>0,'Card date rendering is unchanged');
    assert.deepEqual(errors,[],'No browser exceptions');
    console.log('PASS — table scrolling/sorting at 1920/1440/1024/390/320; cards retain original layout and deadlines');
    console.log(`Screenshots: ${output}`);
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});

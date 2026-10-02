/* Full people content in the task registry at every container width.
 * Serve registry locally, then run with BPM_TASK_TABLE_URL=http://127.0.0.1:8765/index.html.
 * This uses an isolated browser and synthetic DOM fixtures, not the user's tab/store.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const target = new URL(process.env.BPM_TASK_TABLE_URL || 'http://127.0.0.1:8765/index.html');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Use an isolated localhost copy, not an app-owned browser tab');
target.hash = 'tasks';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-task-table-people-'));
const widths = [1485, 1399, 1255, 1217, 1147, 1005, 390];
const headers = ['Тип, ID, Задача', 'Процесс', 'Инициатор', 'Ответственные', 'Создано', 'Срок задачи', 'Статус'];
const base = {
  id:'ТЕСТ-2026-0001', type:'Типовая', title:'Согласование доступа к процессу максимум в две строки',
  description:'Описание для проверки адаптивной таблицы, не сохраняемое в пользовательских данных.',
  processId:'1232', processCode:'П1232', processTitle:'Предоставление информации инвесторам и аналитикам',
  initiator:'Константинопольский Игорь Иванович',
  assignees:['Алексей Иванов','Иван Петров','Анна Орлова','Мария Козлова','Олег Соколов','Павел Смирнов'],
  created:'2026-03-26T13:22:00', deadline:'2026-09-21', status:'На доработке'
};
const fixtures = [
  base,
  {...base, id:'ТЕСТ-2026-0002', initiator:'Константинопольский-Зареченский Александр Константинович', assignees:['Анна Александровна Орлова']},
  {...base, id:'ТЕСТ-2026-0003', initiator:'Иванов Иван Иванович', assignees:[]}
];
async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function checkAssigneeHeader(page, label) {
  const result = await page.locator('#task-table-people-fixture .task-col-assignees .task-sort-button').evaluate(button => {
    const text=button.querySelector('span'), cell=button.closest('th').getBoundingClientRect(), textBox=text.getBoundingClientRect();
    const range=document.createRange();range.selectNodeContents(text);
    return {text:text.textContent,visible:getComputedStyle(text).display!=='none',rects:[...range.getClientRects()].filter(box=>box.width>0&&box.height>0).map(box=>({left:box.left,right:box.right,top:box.top,bottom:box.bottom})),
      cell:{left:cell.left,right:cell.right,top:cell.top,bottom:cell.bottom},textBox:{left:textBox.left,right:textBox.right,top:textBox.top,bottom:textBox.bottom}};
  });
  assert.equal(result.text,'Ответственные',`${label}: complete assignee header`);
  assert.ok(result.visible,`${label}: label remains visible`);
  for(const box of result.rects) {
    assert.ok(box.left>=result.textBox.left-1 && box.right<=result.textBox.right+1,`${label}: full label fits beside sort icon`);
    assert.ok(box.top>=result.cell.top-1 && box.bottom<=result.cell.bottom+1,`${label}: wrapped label fits header`);
  }
}
(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  try {
    const context = await browser.newContext({viewport:{width:1600,height:1000}});
    const page = await context.newPage(), errors = [], measurements = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(target.href);
    await page.waitForFunction(() => window.BpmTaskVisuals && document.querySelector('#tasks-results')?.getAttribute('aria-busy') === 'false');
    await page.evaluate(fixtures => {
      // Keep the production CSS and renderer, but isolate geometry from application layout.
      for (const child of document.body.children) if (!['SCRIPT','STYLE'].includes(child.tagName)) child.style.setProperty('display','none','important');
      document.body.style.cssText = 'margin:0;padding:0;min-width:0';
      const host = document.createElement('section');
      host.id = 'task-table-people-fixture';
      host.style.cssText = 'margin:16px;width:1485px;min-width:0';
      host.innerHTML = window.BpmTaskVisuals.table(fixtures, {sortKey:'title',sortDir:'asc'});
      document.body.append(host);
    }, fixtures);
    for (const width of widths) {
      await page.setViewportSize({width:width+32,height:1000});
      await page.locator('#task-table-people-fixture').evaluate((host,width) => { host.style.width=`${width}px`;host.querySelector('.tasks-table-scroll').scrollLeft=0; }, width);
      await paint(page);
      const result = await page.locator('#task-table-people-fixture').evaluate(host => {
        const table = host.querySelector('table'), scroller = host.querySelector('.tasks-table-scroll');
        const rect = element => {
          const box = element.getBoundingClientRect();
          return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height};
        };
        const visible = element => element && !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
        const textRects = element => {
          const range=document.createRange();range.selectNodeContents(element);
          return [...range.getClientRects()].filter(box=>box.width>0&&box.height>0).map(box=>({left:box.left,right:box.right,top:box.top,bottom:box.bottom}));
        };
        const rows = [...table.tBodies[0].rows].map(row => {
          const owner=row.querySelector('.task-owner-name'), group=row.querySelector('.task-table-assignees .task-avatar-group');
          const content = ['.task-owner','.task-table-assignees .task-avatar-group','.task-table-created time','.task-table-deadline .task-deadline','.task-table-status .task-status'].map(selector => {
            const element=row.querySelector(selector);
            return element && visible(element) ? {selector,box:rect(element),cell:rect(element.closest('td'))} : null;
          }).filter(Boolean);
          return {cells:row.cells.length,box:rect(row),ownerText:owner.textContent,ownerVisible:visible(owner),ownerBox:rect(owner),ownerTextRects:textRects(owner),ownerClamp:getComputedStyle(owner).webkitLineClamp,
            assigneesText:row.querySelector('.task-table-assignees').innerText.trim(),avatarCount:group ? [...group.querySelectorAll('.task-avatar')].filter(visible).length : 0,
            compactVisible:[...row.querySelectorAll('.task-assignees-compact,.task-assignee-count')].some(visible),content};
        });
        return {headers:[...table.tHead.rows[0].cells].map(cell=>cell.innerText.trim()),headerCells:table.tHead.rows[0].cells.length,cols:table.querySelectorAll('col').length,
          width:rect(host).width,tableWidth:rect(table).width,scrollWidth:scroller.scrollWidth,clientWidth:scroller.clientWidth,
          pageOverflow:document.documentElement.scrollWidth-innerWidth,rows};
      });
      assert.equal(result.width,width,`${width}: requested container width`);
      assert.equal(result.headerCells,7,`${width}: seven headers`);
      assert.equal(result.cols,7,`${width}: seven column tracks`);
      assert.deepEqual(result.headers,headers,`${width}: complete header labels remain visible`);
      assert.ok(result.pageOverflow<=1,`${width}: horizontal overflow is contained in the table`);
      assert.ok(result.clientWidth<=width+1,`${width}: scroller does not stretch its parent`);
      result.rows.forEach((row,index) => {
        const label=`${width}, fixture ${index+1}`;
        assert.equal(row.cells,7,`${label}: seven data cells`);
        assert.equal(row.ownerText,fixtures[index].initiator,`${label}: full FIO text`);
        assert.ok(row.ownerVisible && row.ownerBox.width>0 && row.ownerBox.height>0,`${label}: FIO is visible`);
        assert.ok(row.ownerClamp==='none'||row.ownerClamp==='0',`${label}: FIO is not line-clamped`);
        for(const text of row.ownerTextRects) {
          assert.ok(text.left>=row.ownerBox.left-1 && text.right<=row.ownerBox.right+1,`${label}: FIO fits horizontally`);
          assert.ok(text.top>=row.ownerBox.top-1 && text.bottom<=row.ownerBox.bottom+1,`${label}: every FIO line is visible`);
        }
        assert.equal(row.compactVisible,false,`${label}: no count-only replacement`);
        assert.equal(row.avatarCount,index===0?4:index===1?1:0,`${label}: assignee avatars are retained`);
        if(index===2) assert.equal(row.assigneesText,'Не назначены',`${label}: unassigned label retained`);
        for(const item of row.content) {
          assert.ok(item.box.left>=item.cell.left-1 && item.box.right<=item.cell.right+1,`${label}: ${item.selector} stays inside its column`);
          assert.ok(item.box.bottom<=row.box.bottom+1,`${label}: ${item.selector} stays inside its row`);
        }
      });
      if(width<=1399) assert.ok(result.rows[1].ownerBox.height>24,`${width}: long FIO wraps onto multiple lines`);
      const scroll = await page.locator('#task-table-people-fixture .tasks-table-scroll').evaluate(element => {
        element.scrollLeft=element.scrollWidth;
        return {left:element.scrollLeft,max:element.scrollWidth-element.clientWidth};
      });
      if(result.scrollWidth>result.clientWidth+1) {
        assert.ok(scroll.left>0,`${width}: local horizontal scroll is usable`);
        assert.ok(Math.abs(scroll.left-scroll.max)<1.5,`${width}: last column is reachable`);
      }
      await page.locator('#task-table-people-fixture [data-task-sort="assignees"]').hover();
      await checkAssigneeHeader(page,`${width}, hover`);
      await page.mouse.move(0,0);
      await page.locator('#task-table-people-fixture .tasks-table-scroll').evaluate(element=>{element.scrollLeft=0;});
      await page.locator('#task-table-people-fixture').screenshot({path:path.join(output,`people-${width}.png`)});
      await page.locator('#task-table-people-fixture').evaluate((host,fixtures)=>{host.innerHTML=window.BpmTaskVisuals.table(fixtures,{sortKey:'assignees',sortDir:'asc'});},fixtures);
      await paint(page);
      assert.equal(await page.locator('#task-table-people-fixture th.task-col-assignees').getAttribute('aria-sort'),'ascending',`${width}: renderer activates assignee sorting`);
      await checkAssigneeHeader(page,`${width}, sorted`);
      await page.locator('#task-table-people-fixture').evaluate((host,fixtures)=>{host.innerHTML=window.BpmTaskVisuals.table(fixtures,{sortKey:'title',sortDir:'asc'});},fixtures);
      measurements.push({container:width,table:result.tableWidth,ownerWidth:result.rows[0].ownerBox.width,longOwnerHeight:result.rows[1].ownerBox.height,scroll:scroll.max});
    }
    assert.deepEqual(errors,[],'No browser exceptions');
    console.log('PASS — 7 full headers, complete wrapping FIO, assignee avatars and contained scroll at every width');
    console.table(measurements);
    console.log(`Screenshots: ${output}`);
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});

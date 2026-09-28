/* Typical-task lifecycle browser regression. Uses an isolated Chrome context. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source = process.env.BPM_TASK_FLOW_FILE;
let base = process.env.BPM_TASK_FLOW_URL || process.env.BPM_TASKS_URL || 'http://127.0.0.1:4187/';
if (source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-task-flow-offline-'));
  const target = path.join(directory,'renamed-task-prototype.html');
  fs.copyFileSync(path.resolve(source),target);
  base = pathToFileURL(target).href;
}
const report = message => console.log(`PASS — ${message}`);
const ready = page => page.waitForFunction(() => document.querySelector('#tasks-results')?.getAttribute('aria-busy') === 'false');
const action = (page,name) => page.locator(`#task-flow [data-tf-action="${name}"]`);
const footerAction = (page,name) => page.locator(`#task-flow .tf-footer [data-tf-action="${name}"]`);
async function mode(page,value) {
  await page.waitForFunction(value => {
    const element=document.getElementById('task-flow');
    return element?.open && element.dataset.mode===value && !element.inert && (element.classList.contains('has-entered') || matchMedia('(prefers-reduced-motion: reduce)').matches);
  },value);
}
async function fresh(page) {
  await page.setViewportSize({width:1920,height:1080});
  await page.goto(`${base.split('#')[0]}#tasks`);
  await page.evaluate(() => localStorage.removeItem('bpm-task-store:v1'));
  await page.reload();await ready(page);
}
async function create(page) {
  await page.locator('#tasks-create').click();
  await page.locator('#task-drawer[open]').waitFor();
  await page.locator('[data-task-type="standard"]').click();await mode(page,'create');
  assert.equal(await page.locator('#task-drawer').evaluate(element=>element.open),false,'Type chooser closes when the form opens');
}
async function close(page,method='escape',focus) {
  if(focus===undefined) {
    const badge=page.locator('.tf-meta [data-tf-copy]').first();
    const id=await badge.count()?await badge.getAttribute('data-tf-copy'):null;
    focus=id?`#tasks-results button[data-task-id="${id}"]`:'#tasks-create';
  }
  if(method==='button')await page.locator('#task-flow .tf-header [data-tf-action="close"]').click();
  else if(method==='footer')await footerAction(page,'close').click();
  else if(method==='backdrop')await page.mouse.click(8,500);
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('task-flow')?.open);
  assert.equal(await page.locator('body').evaluate(element=>element.classList.contains('task-drawer-open')),false,'Closing restores document scrolling');
  if(focus)assert.ok(await page.locator(focus).evaluate(element=>element===document.activeElement),'Closing restores a usable trigger focus');
}
async function choose(page,id,value) {
  await page.locator(`#${id}-input`).click();
  const option=page.locator(`#${id}-list [data-option]`).filter({hasText:value});
  await option.first().click();
  if(await page.locator(`#${id}-list`).count())await page.keyboard.press('Escape');
  assert.ok(await page.locator('#task-flow').evaluate(element=>element.open),'Closing a select preserves the task dialog');
}
async function ownedDraft(page,title) {
  const user=await page.evaluate(()=>window.BpmTaskStore.currentUser);
  await page.locator('#tf-title').fill(title);
  await choose(page,'tf-assignees',user);
}
async function row(page,id) {return page.evaluate(id=>window.BpmTaskStore.get(id),id);}
async function saveCreated(page,{repeat=false}={}) {
  const previous=await page.evaluate(()=>window.BpmTaskStore.list().map(task=>task.id));
  assert.equal((await action(page,'save').textContent()).trim(),'Создать','Create uses the short button label');
  if(repeat)await action(page,'save').evaluate(button=>{button.click();button.click();});
  else await action(page,'save').click();
  await page.waitForFunction(()=>!document.getElementById('task-flow')?.open&&!document.getElementById('task-drawer')?.open);
  await ready(page);
  const added=await page.evaluate(previous=>window.BpmTaskStore.list().filter(task=>!previous.includes(task.id)),previous);
  assert.equal(added.length,1,'A successful submit creates exactly one task');
  const id=added[0].id;
  assert.equal(new URL(page.url()).hash,'#tasks','Creation routes to the Tasks registry');
  assert.equal(await page.locator('#tasks-panel').isVisible(),true);
  assert.equal(await page.locator('[data-task-tab="outgoing"]').getAttribute('aria-pressed'),'true','Created task is shown in outgoing');
  assert.equal(await page.locator('#tasks-search').inputValue(),'','Creation clears the registry query');
  assert.equal(await page.locator('#tasks-selected').isVisible(),false,'Creation clears blocking filters');
  assert.equal(await page.locator('#tasks-date-summary').textContent(),'Все','Creation clears the deadline range');
  assert.equal(await page.locator('#tasks-results article[data-task-id], #tasks-results tbody tr[data-task-id]').first().getAttribute('data-task-id'),id,'Created task is the first result');
  const rows=await page.locator('#tasks-results article[data-task-id], #tasks-results tbody tr[data-task-id]').evaluateAll(elements=>elements.map(element=>element.dataset.taskId));
  const created=await page.evaluate(ids=>ids.map(id=>window.BpmTaskStore.get(id).created),rows);
  assert.ok(created.every((value,index)=>index===0||created[index-1]>=value),'Registry results use descending creation order');
  if(await page.locator('#tasks-table').getAttribute('aria-pressed')==='true')assert.equal(await page.locator('#tasks-results th.task-col-created').getAttribute('aria-sort'),'descending');
  else assert.equal(await page.locator('#tasks-sort-input').inputValue(),'Создано');
  const toast=page.locator('#toast');
  assert.equal(await toast.isVisible(),true,'Creation confirmation is visible after the flow closes');
  assert.equal((await toast.textContent()).trim(),'Задача создана');
  assert.equal(await toast.evaluate(element=>element.classList.contains('is-success')),true);
  const check=toast.locator('img');
  assert.equal(await check.count(),1,'Success confirmation includes a check icon');
  assert.equal(await check.isVisible(),true);
  const icon=await check.evaluate(async element=>{await element.decode();const bounds=element.getBoundingClientRect();return {source:element.src,width:bounds.width,height:bounds.height};});
  assert.equal(icon.width,24);assert.equal(icon.height,24);
  if(icon.source.startsWith('data:')) {
    const [metadata,...content]=icon.source.split(','),encoded=content.join(',');
    const svg=metadata.includes(';base64')?Buffer.from(encoded,'base64').toString('utf8'):decodeURIComponent(encoded);
    assert.equal(svg,fs.readFileSync(path.join(__dirname,'assets/dropdown-tick-green.svg'),'utf8'),'Standalone toast embeds the original green design-system check');
  } else assert.match(icon.source,/\/assets\/dropdown-tick-green\.svg$/,'Toast uses the original green design-system check');
  assert.equal(await page.locator('body').evaluate(element=>element.classList.contains('task-drawer-open')),false,'Creation restores document scrolling');
  return id;
}
async function openCreated(page,id) {
  await page.locator(`#tasks-results button[data-task-id="${id}"]`).click();await mode(page,'view');
}
async function openTask(page,id) {
  await page.locator('[data-task-tab="all"]').click();await ready(page);
  await page.locator('#tasks-search').fill(id);await ready(page);
  await page.locator(`#tasks-results button[data-task-id="${id}"]`).click();await mode(page,'view');
}
async function assets(page) {
  const broken=await page.evaluate(async()=>{
    const images=[...document.querySelectorAll('#task-flow img')];
    await Promise.all(images.map(image=>image.decode().catch(()=>{})));
    return images.filter(image=>!image.naturalWidth).map(image=>image.src);
  });
  assert.deepEqual(broken,[],'Task flow assets load');
}
async function closeFooter(page,{terminal=false}={}) {
  const button=footerAction(page,'close');
  assert.equal(await button.count(),1,'Task footer has exactly one Close button');
  assert.equal((await button.textContent()).trim(),'Закрыть');
  assert.equal(await button.isVisible(),true,'Footer Close is visible');
  assert.equal(await button.isEnabled(),true,'Footer Close is enabled');
  await page.mouse.move(0,0);
  assert.equal(await button.evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(255, 255, 255)','Footer Close uses the white button style');
  assert.equal(await action(page,'save').count(),0,'Read-only view has no Save button');
  if(terminal)for(const name of ['withdraw','reject','complete'])assert.equal(await action(page,name).count(),0,`Terminal task has no ${name} lifecycle action`);
}

async function validationAndDraft(page) {
  await fresh(page);await create(page);
  await action(page,'save').click();
  assert.equal(await page.locator('#tf-title').getAttribute('aria-invalid'),'true');
  assert.equal(await page.locator('#tf-assignees-input').getAttribute('aria-invalid'),'true');
  assert.equal(await page.evaluate(()=>window.BpmTaskStore.list().length),14);
  await ownedDraft(page,'Черновик типовой задачи');
  await page.locator('#tf-description').fill('Описание черновика');
  await page.locator('#tf-deadline').fill('31.02.2026');
  await action(page,'save').click();
  assert.equal(await page.locator('#tf-deadline').getAttribute('aria-invalid'),'true');
  await page.locator('#tf-deadline').fill('20.09.2026');
  await action(page,'calendar').click();
  assert.equal(await page.locator('.bpm-calendar [data-days]').count(),1,'Single-date calendar has only Today preset');
  await page.locator('.bpm-calendar [data-date="2026-09-25"][data-own-month="true"]').click();
  assert.equal(await page.locator('#tf-deadline').inputValue(),'25.09.2026');
  assert.equal(await page.locator('.bpm-calendar').count(),0,'A single date applies immediately');
  await action(page,'calendar').click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('.bpm-calendar').count(),0);
  assert.ok(await page.locator('#task-flow').evaluate(element=>element.open),'Calendar Escape preserves the form');
  await action(page,'back').click();await page.locator('#task-drawer[open]').waitFor();
  await page.locator('[data-task-type="standard"]').click();await mode(page,'create');
  assert.equal(await page.locator('#tf-title').inputValue(),'Черновик типовой задачи');
  assert.equal(await page.locator('#tf-description').inputValue(),'Описание черновика');
  assert.equal(await page.locator('#tf-deadline').inputValue(),'25.09.2026');
  assert.equal(await page.locator('#tf-assignees-input').inputValue(),'Выбрано 1');
  await action(page,'reset').click();
  assert.equal(await page.locator('#tf-title').inputValue(),'');
  assert.equal(await page.locator('#tf-assignees-input').inputValue(),'');
  await page.locator('#tf-title').fill('Будет отменено');await action(page,'cancel').click();
  await page.waitForFunction(()=>!document.getElementById('task-flow').open);
  await create(page);assert.equal(await page.locator('#tf-title').inputValue(),'','Cancel discards draft');
  await close(page,'button');await create(page);await close(page,'backdrop');
  report('required-field and date validation, single calendar, back/reset/cancel and drawer closure');
}

async function createEditComplete(page) {
  await fresh(page);await create(page);
  const title='Проверить типовую задачу <без HTML>',description='Описание & детали\nВторая строка';
  await ownedDraft(page,title);await page.locator('#tf-description').fill(description);
  await page.locator('#tf-deadline').fill('25.12.2026');
  const process=await page.evaluate(()=>{const first=window.BPM_TASK_DATA.find(task=>task.processId);return {id:first.processId,title:first.processTitle};});
  await choose(page,'tf-process',process.title);
  await choose(page,'tf-variant','Основной вариант');
  const id=await saveCreated(page),created=await row(page,id);
  assert.equal(created.title,title);assert.equal(created.description,description);assert.equal(created.processId,process.id);
  assert.equal(created.resultVariant,'Основной вариант');assert.equal(created.deadline,'2026-12-25');
  assert.equal(created.status,'Создана');assert.ok(created.incoming&&created.outgoing);
  assert.equal(await page.evaluate(()=>window.BpmTaskStore.list().length),15);
  await openCreated(page,id);
  assert.equal(await page.locator('.tf-task-title').textContent(),title,'User text is rendered literally');
  await assets(page);
  await page.locator('[data-tf-edit="title"]').click();await mode(page,'edit');
  assert.equal(await action(page,'save').isDisabled(),true,'Unchanged edit cannot save');
  await page.locator('#tf-title').fill('Отменённое название');await action(page,'cancel').click();await mode(page,'view');
  assert.equal((await row(page,id)).title,title);
  await page.locator('[data-tf-edit="description"]').click();await mode(page,'edit');
  await page.locator('#tf-title').fill('Сохранённая типовая задача');
  await page.locator('#tf-description').fill('Обновлённое описание');await action(page,'save').click();await mode(page,'view');
  assert.equal((await row(page,id)).description,'Обновлённое описание');
  await action(page,'complete').click();await page.locator('.tf-sheet').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.tf-sheet').count(),0);assert.equal((await row(page,id)).status,'Создана');
  assert.ok(await action(page,'complete').evaluate(element=>element===document.activeElement));
  await action(page,'complete').click();await page.locator('#tf-comment').fill('Работа выполнена');
  await action(page,'sheet-submit').click();
  const completed=await row(page,id);assert.equal(completed.status,'Завершено');assert.equal(completed.progress,100);
  assert.equal(completed.comments.at(-1).text,'Работа выполнена');assert.equal(completed.executor,completed.initiator);
  await closeFooter(page,{terminal:true});
  assert.equal(await action(page,'complete').count(),0,'Completed task cannot be completed twice');
  assert.match(await page.locator('.tf-status').textContent(),/Выполнена/);
  await close(page);await ready(page);
  assert.equal(await page.locator('#tasks-count').textContent(),'12');
  assert.match(await page.locator('#tasks-completed').textContent(),/\+3/);
  assert.match(await page.locator('[data-task-tab="incoming"]').textContent(),/11/);
  assert.match(await page.locator('[data-task-tab="outgoing"]').textContent(),/6/);
  await openTask(page,id);assert.match(await page.locator('.tf-task-title').textContent(),/Сохранённая типовая задача/);
  await close(page,'escape',`#tasks-results button[data-task-id="${id}"]`);
  await page.reload();await ready(page);
  assert.equal((await row(page,id)).status,'Завершено','Status survives reload');
  await page.locator('#tasks-cards').click();await ready(page);
  await page.locator('#tasks-search').fill(id);await ready(page);
  assert.equal(await page.locator('#tasks-results article[data-task-id]').count(),1,'Saved task is searchable in cards');
  report('UI creation, relation fields, escaped text, edit cancel/save, completion, counts and reload persistence');
}

async function rejectionAndOwnership(page) {
  await fresh(page);await create(page);await ownedDraft(page,'Задача для отклонения');
  const id=await saveCreated(page);
  await openCreated(page,id);
  await action(page,'reject').click();await action(page,'sheet-submit').click();
  assert.equal(await page.locator('#tf-comment').getAttribute('aria-invalid'),'true');
  assert.equal((await row(page,id)).status,'Создана');
  await page.locator('#tf-comment').fill('Нет необходимых исходных данных');
  await action(page,'sheet-cancel').first().click();
  assert.equal((await row(page,id)).status,'Создана','Cancel rejection preserves state');
  await action(page,'reject').click();await page.locator('#tf-comment').fill('Нет необходимых исходных данных');
  await action(page,'sheet-submit').click();
  assert.equal((await row(page,id)).status,'Отклонена');
  assert.equal((await row(page,id)).rejectionReason,'Нет необходимых исходных данных');
  await closeFooter(page,{terminal:true});
  await close(page);
  const outgoingId=await page.evaluate(()=>window.BpmTaskStore.create({title:'Исходящая для отзыва',assignees:['Петрова Мария Игоревна']}).id);
  await openTask(page,outgoingId);
  assert.equal(await action(page,'withdraw').count(),1);assert.equal(await action(page,'complete').count(),0);
  await closeFooter(page);
  await action(page,'withdraw').click();assert.equal((await row(page,outgoingId)).status,'Отозвана');
  await closeFooter(page,{terminal:true});await close(page,'footer',`#tasks-results button[data-task-id="${outgoingId}"]`);
  report('rejection justification/cancel, terminal actions and outgoing withdrawal');
}

async function responsive(page) {
  await fresh(page);
  for(const width of [1920,1440,1024,390,320]) {
    await page.setViewportSize({width,height:1080});
    if(width<768&&await page.locator('body').evaluate(element=>element.classList.contains('mobile-menu-open')))await page.locator('#collapse-menu').click();
    await page.waitForFunction(()=>!document.body.classList.contains('mobile-menu-open'));
    await create(page);
    await ownedDraft(page,`Проверка ширины ${width}`);
    await geometry(page,width,'create');
    const id=await saveCreated(page);await openCreated(page,id);await geometry(page,width,'view');
    await action(page,'reject').click();await geometry(page,width,'reject');
    await action(page,'sheet-cancel').first().click();
    await action(page,'complete').click();await geometry(page,width,'complete');
    await action(page,'sheet-cancel').first().click();await close(page);
    assert.equal((await row(page,id)).status,'Создана');
  }
  report('1920/1440/1024/390/320 creation, detail, rejection/completion sheets and screenshots');
}
async function creationFooterAndDropup(page) {
  await fresh(page);
  for(const width of [1440,1024,390,320]) {
    await page.setViewportSize({width,height:1080});
    if(width<768&&await page.locator('body').evaluate(element=>element.classList.contains('mobile-menu-open')))await page.locator('#collapse-menu').click();
    await page.waitForFunction(()=>!document.body.classList.contains('mobile-menu-open'));
    await create(page);
    const clean=await page.locator('#task-flow .tf-footer').boundingBox();
    assert.ok(Math.abs(clean.height-50)<1,`${width}: clean footer is a single 50px row`);
    assert.equal(await action(page,'reset').isVisible(),false,'Reset is hidden for an empty draft');
    await page.locator('#tf-title').fill(`Проверка футера ${width}`);
    const dirty=await page.locator('#task-flow .tf-footer').boundingBox();
    assert.ok(Math.abs(clean.y-dirty.y)<1&&Math.abs(dirty.height-50)<1,`${width}: dirty footer keeps its vertical position and 50px height`);
    const [cancel,reset,save]=await Promise.all(['cancel','reset','save'].map(name=>action(page,name).boundingBox()));
    assert.ok(reset.x>=cancel.x+cancel.width-1&&reset.x+reset.width<=save.x+1,`${width}: reset stays between Cancel and Create`);
    for(const [name,bounds] of [['cancel',cancel],['reset',reset],['save',save]]) {
      assert.ok(Math.abs(bounds.y-dirty.y)<1&&Math.abs(bounds.height-50)<1,`${width}: ${name} stays in the same 50px row`);
      assert.ok(bounds.x>=dirty.x-1&&bounds.x+bounds.width<=dirty.x+dirty.width+1,`${width}: ${name} fits inside the footer`);
    }
    assert.equal((await action(page,'reset').textContent()).trim(),'Сбросить');
    assert.equal(await action(page,'reset').getAttribute('aria-label'),'Сбросить');
    assert.equal(await action(page,'reset').getAttribute('title'),'Сбросить');
    await geometry(page,width,'dirty-footer');
    await page.locator('#tf-assignees-input').click();
    const position=await page.locator('#tf-assignees-list').evaluate(popup=>{
      const anchor=document.querySelector('#tf-assignees .select-control').getBoundingClientRect(),bounds=popup.getBoundingClientRect();
      return {top:bounds.top,bottom:bounds.bottom,left:bounds.left,right:bounds.right,anchorTop:anchor.top,anchorBottom:anchor.bottom,height:bounds.height,scroll:popup.scrollHeight,client:popup.clientHeight,overflow:getComputedStyle(popup).overflowY,below:innerHeight-anchor.bottom};
    });
    assert.ok(position.bottom<=position.anchorTop-7,`${width}: responsible list opens above the control with its gap: ${JSON.stringify(position)}`);
    assert.ok(position.top>=11&&position.left>=11&&position.right<=width-11,`${width}: responsible list stays inside the viewport`);
    assert.ok(position.height>50&&position.scroll>position.client,`${width}: responsible list is bounded and has scrollable options`);
    assert.match(position.overflow,/auto|scroll/);
    await page.locator('#tf-assignees-input').press('End');
    assert.ok(await page.locator('#tf-assignees-list').evaluate(element=>element.scrollTop>0),'Keyboard navigation scrolls to the last responsible');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#tf-assignees-list').count(),0);
    assert.ok(await page.locator('#task-flow').evaluate(element=>element.open),'Closing the dropup preserves the create form');
    await action(page,'reset').click();
    const cleared=await page.locator('#task-flow .tf-footer').boundingBox();
    assert.ok(Math.abs(cleared.y-clean.y)<1&&Math.abs(cleared.height-50)<1,`${width}: resetting does not move or resize the footer`);
    await close(page);
  }
  report('1440/1024/390/320 fixed 50px footer, middle reset button and scrollable responsible dropup');
}
async function relativeDeadlineAndClose(page) {
  await fresh(page);
  const dates=await page.evaluate(()=>[-17,-5,-2,-1,0,1,2,5,17].map(offset=>{
    const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()+offset);
    const day=String(date.getDate()).padStart(2,'0'),month=String(date.getMonth()+1).padStart(2,'0'),year=date.getFullYear();
    return {offset,iso:`${year}-${month}-${day}`,input:`${day}.${month}.${year}`};
  }));
  const expected=offset=>offset===0?'Срок — сегодня':`Срок: ${Math.abs(offset)} ${{1:'день',2:'дня',5:'дней',17:'дней'}[Math.abs(offset)]}`;
  const note=()=>page.locator('#task-flow .tf-deadline-note');
  const deadlineIcon=async name=>{
    const icons=note().locator('img');assert.equal(await icons.count(),1,`${name}: one deadline indicator`);
    const source=await icons.getAttribute('src');
    if(source.startsWith('data:')) {
      const [metadata,...content]=source.split(','),encoded=content.join(',');
      const svg=metadata.includes(';base64')?Buffer.from(encoded,'base64').toString('utf8'):decodeURIComponent(encoded);
      assert.equal(svg,fs.readFileSync(path.join(__dirname,`assets/task-flow/${name}.svg`),'utf8'),`Standalone retains the ${name} indicator`);
    } else assert.ok(source.endsWith(`/task-flow/${name}.svg`),`Deadline retains the ${name} indicator`);
  };
  await create(page);await ownedDraft(page,'Формулировки срока задачи');
  for(const date of dates) {
    await page.locator('#tf-deadline').fill(date.input);
    assert.equal((await note().textContent()).trim(),expected(date.offset),`Create deadline at ${date.offset} days`);
    await deadlineIcon('clock');
  }
  const id=await saveCreated(page);await openCreated(page,id);
  assert.equal((await note().textContent()).trim(),expected(17));
  assert.equal(await footerAction(page,'close').count(),0,'An assigned active task retains Reject and Complete');
  assert.equal(await action(page,'reject').isEnabled(),true);assert.equal(await action(page,'complete').isEnabled(),true);
  for(const date of dates) {
    await page.locator('[data-tf-edit="deadline"]').click();await mode(page,'edit');
    assert.equal(await action(page,'save').isDisabled(),true,'An unchanged edit still cannot save');
    await page.locator('#tf-deadline').fill(date.input);
    assert.equal((await note().textContent()).trim(),expected(date.offset),`Edit deadline at ${date.offset} days`);
    await deadlineIcon('clock');
    assert.equal((await action(page,'reset').textContent()).trim(),'Сбросить');
    assert.equal(await action(page,'reset').getAttribute('aria-label'),'Сбросить');
    assert.equal(await action(page,'reset').getAttribute('title'),'Сбросить');
    await action(page,'save').click();await mode(page,'view');
    assert.equal((await note().textContent()).trim(),expected(date.offset),`View deadline at ${date.offset} days`);
  }
  await close(page);
  for(const late of [false,true]) {
    const completedId=await page.evaluate(({deadline,today,late})=>{
      const store=window.BpmTaskStore,task=store.create({title:late?'Завершена после срока':'Завершена в срок',deadline,assignees:[store.currentUser]});
      store.update(task.id,{status:'Завершено',completedAt:`${today}T12:00:00`,executor:store.currentUser});return task.id;
    },{deadline:dates.find(date=>date.offset===(late?-1:1)).iso,today:dates.find(date=>date.offset===0).iso,late});
    await openTask(page,completedId);
    assert.equal((await note().textContent()).trim(),late?'Превышен срок':'Закрыта в срок');
    await deadlineIcon(late?'overdue':'completed');await closeFooter(page,{terminal:true});
    await page.locator('[data-tf-edit="deadline"]').click();await mode(page,'edit');
    assert.equal(await action(page,'save').isDisabled(),true,'Completed unchanged edit still cannot save');
    assert.equal((await note().textContent()).trim(),late?'Превышен срок':'Закрыта в срок');
    await deadlineIcon(late?'overdue':'completed');
    await action(page,'cancel').click();await mode(page,'view');await close(page,'footer');
  }
  const rejectedId=await page.evaluate(deadline=>{
    const store=window.BpmTaskStore,task=store.create({title:'Отклонённая задача со сроком',deadline,assignees:[store.currentUser]});
    store.update(task.id,{status:'Отклонена',rejectedAt:new Date().toISOString()});return task.id;
  },dates[0].iso);
  await openTask(page,rejectedId);assert.equal((await note().textContent()).trim(),expected(-17));
  await closeFooter(page,{terminal:true});await close(page,'footer');
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:1080});
    // Let the resize handler apply the mobile menu state before closing it.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    if(width<768&&await page.locator('body').evaluate(element=>element.classList.contains('mobile-menu-open')))await page.locator('#collapse-menu').click();
    await page.waitForFunction(()=>!document.body.classList.contains('mobile-menu-open'));
    const outgoingId=await page.evaluate(({width,deadline})=>window.BpmTaskStore.create({title:`Закрытие просмотра ${width}`,deadline,assignees:['Петрова Мария Игоревна']}).id,{width,deadline:dates[0].iso});
    await openTask(page,outgoingId);await closeFooter(page);
    assert.equal(await action(page,'withdraw').isEnabled(),true,'Owned unassigned active task retains Withdraw');
    assert.equal((await note().textContent()).trim(),expected(-17));
    const active=await row(page,outgoingId);await geometry(page,width,'view-close');await close(page,'footer');
    assert.deepEqual(await row(page,outgoingId),active,'Closing the active view preserves task data');
    await openTask(page,outgoingId);await action(page,'withdraw').click();
    await closeFooter(page,{terminal:true});assert.equal((await note().textContent()).trim(),expected(-17));
    assert.equal(await page.locator('#task-flow [data-tf-edit]').count(),0,'Withdrawn task remains read-only');
    const withdrawn=await row(page,outgoingId);await geometry(page,width,'withdrawn-close');await close(page,'footer');
    assert.deepEqual(await row(page,outgoingId),withdrawn,'Closing the withdrawn view preserves task data');
  }
  report('past/future/today deadline grammar in create/edit/view, terminal indicators and 1440/390/320 footer Close with focus restoration');
}
async function filteredRegistryCreation(page) {
  for(const view of ['cards','table']) {
    await fresh(page);await page.locator(`#tasks-${view}`).click();await ready(page);
    if(view==='cards') {
      await page.locator('#tasks-sort-input').click();
      await page.locator('#tasks-sort-list [data-option="processTitle"]').click();
    } else await page.locator('#tasks-results [data-task-sort="created"]').click();
    for(const key of ['block','division','status','type','initiator','assignees']) {
      await page.locator(`#tasks-${key}-input`).click();
      await page.locator(`#tasks-${key}-list [data-option]:not([data-option=""])`).first().click();
      await page.keyboard.press('Escape');await ready(page);
    }
    await page.locator('#tasks-date').click();await page.locator('.bpm-calendar [data-days="1"]').click();await ready(page);
    await page.locator('#tasks-search').fill('Запрос, скрывающий новую задачу');await ready(page);
    assert.equal(await page.locator('#tasks-results article[data-task-id], #tasks-results tbody tr[data-task-id]').count(),0,'Existing filters hide the new task before submission');
    assert.equal(await page.locator('#tasks-selected').isVisible(),true);
    await create(page);await page.locator('#tf-title').fill(`Новая задача в виде ${view}`);
    await choose(page,'tf-assignees','Петрова Мария Игоревна');
    const id=await saveCreated(page,{repeat:true});
    assert.equal((await row(page,id)).incoming,false,'Creation is visible even when its assignee differs from the current user');
    assert.equal(await page.locator(`#tasks-${view}`).getAttribute('aria-pressed'),'true','Creation preserves the selected registry view');
    for(const key of ['block','division','status','type','initiator','assignees'])assert.equal(await page.locator(`#tasks-${key}-input`).inputValue(),'');
    await openCreated(page,id);assert.equal((await page.locator('.tf-task-title').textContent()).trim(),`Новая задача в виде ${view}`);await close(page);
    await create(page);
    assert.equal(await page.locator('#tf-title').inputValue(),'','Reopening create does not restore the saved title');
    assert.equal(await page.locator('#tf-assignees-input').inputValue(),'','Reopening create does not restore saved assignees');
    assert.equal(await action(page,'reset').isVisible(),false);
    await action(page,'save').click();
    assert.equal(await page.locator('#tf-title').getAttribute('aria-invalid'),'true');
    assert.equal(await page.evaluate(()=>window.BpmTaskStore.list().length),15,'Duplicate clicks and an empty reopened form cannot create extra rows');
    await close(page);
  }
  report('filtered cards/table creation clears all blockers, sorts newest first, avoids duplicate creation and discards the saved draft');
}
async function cabinetIntegration(page) {
  await fresh(page);await page.locator('#cabinet-nav').click();
  await page.waitForFunction(()=>!document.getElementById('cabinet-panel').hidden&&document.getElementById('cabinet-feed-tasks')?.getAttribute('aria-busy')==='false');
  await page.locator('#cabinet-create-tasks').click();await page.locator('#task-drawer[open]').waitFor();
  await page.locator('[data-task-type="standard"]').click();await mode(page,'create');
  await ownedDraft(page,'Типовая задача из кабинета');
  const id=await saveCreated(page);
  await openCreated(page,id);await close(page,'button');
  await page.locator('#cabinet-nav').click();
  await page.waitForFunction(()=>!document.getElementById('cabinet-panel').hidden&&document.getElementById('cabinet-feed-tasks')?.getAttribute('aria-busy')==='false');
  const card=page.locator(`#cabinet-panel button[data-cabinet-open="${id}"]`);
  assert.equal(await card.count(),1,'Created assigned task appears in Cabinet incoming feed');
  await card.click();await mode(page,'view');
  assert.equal(new URL(page.url()).hash,'#cabinet','Cabinet task opens detail without routing away');
  assert.match(await page.locator('.tf-task-title').textContent(),/Типовая задача из кабинета/);
  await page.locator('[data-tf-edit="title"]').click();await mode(page,'edit');
  await page.locator('#tf-title').fill('Обновлённая задача из кабинета');
  await action(page,'save').click();await mode(page,'view');
  await close(page,'escape',`#cabinet-panel button[data-cabinet-open="${id}"]`);
  await page.locator('#cabinet-tab-outgoing').click();assert.equal(await card.count(),1,'Created task also appears in outgoing');
  await page.locator('#tasks-nav').click();await ready(page);
  assert.equal((await row(page,id)).title,'Обновлённая задача из кабинета');
  report('Cabinet creation routes to outgoing registry; live Cabinet feeds, direct detail and post-edit focus');
}
async function concurrentTaskUpdate(page) {
  await fresh(page);await create(page);await ownedDraft(page,'Задача в двух вкладках');
  const id=await saveCreated(page);
  await openCreated(page,id);
  await page.locator('[data-tf-edit="title"]').click();await mode(page,'edit');
  await page.locator('#tf-title').fill('Название после внешнего завершения');
  const other=await page.context().newPage();
  try {
    await other.goto(`${base.split('#')[0]}#tasks`);await ready(other);
    await other.evaluate(id=>{
      const store=window.BpmTaskStore,now=new Date().toISOString();
      store.update(id,{status:'Завершено',completedAt:now,executor:store.currentUser,comments:[{author:store.currentUser,text:'Завершена в другой вкладке',created:now,kind:'complete'}]});
    },id);
    await page.waitForFunction(id=>window.BpmTaskStore.get(id)?.status==='Завершено',id);
    await action(page,'save').click();await mode(page,'view');
    const updated=await row(page,id);
    assert.equal(updated.title,'Название после внешнего завершения');
    assert.equal(updated.status,'Завершено','Saving an older edit preserves the newer lifecycle state');
    assert.equal(updated.comments.at(-1).text,'Завершена в другой вкладке','Saving an older edit preserves newer comments');
    assert.equal(await action(page,'complete').count(),0);
    await close(page);
  }finally{await other.close();}
  report('cross-tab completion/comments survive saving an already-open edit');
}
async function geometry(page,width,state) {
  await assets(page);
  const sizes=await page.locator('#task-flow').evaluate(element=>{
    const bounds=element.getBoundingClientRect();
    return {left:bounds.left,right:bounds.right,width:bounds.width,scroll:element.scrollWidth,client:element.clientWidth,page:document.documentElement.scrollWidth,parts:[...element.querySelectorAll('.tf-content,.tf-sheet,.tf-footer,.tf-sheet-actions')].map(part=>({name:part.className,scroll:part.scrollWidth,client:part.clientWidth}))};
  });
  assert.ok(sizes.left>=-1&&sizes.right<=width+1,`${width}/${state}: drawer fits viewport ${JSON.stringify(sizes)}`);
  assert.ok(sizes.scroll<=sizes.client+1&&sizes.page<=width+1,`${width}/${state}: no horizontal overflow ${JSON.stringify(sizes)}`);
  for(const part of sizes.parts)assert.ok(part.scroll<=part.client+1,`${width}/${state}: ${part.name} remains within drawer`);
  const expected=width<768?width:(width-328)*5/12+96;
  assert.ok(Math.abs(sizes.width-expected)<1,`${width}/${state}: shared five-column drawer width`);
  await page.screenshot({path:path.join(os.tmpdir(),`bpm-task-flow-${width}-${state}.png`)});
}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1920,height:1080},offline:Boolean(source)});
  await context.addInitScript(()=>localStorage.setItem('bpm-registry-menu','expanded'));
  const page=await context.newPage(),errors=[],missing=[],external=[],failures=[];
  page.setDefaultTimeout(12000);
  page.on('pageerror',error=>errors.push(error.stack||error.message));
  page.on('response',response=>{if(response.status()>=400)missing.push(`${response.status()} ${response.url()}`);});
  page.on('requestfailed',request=>missing.push(`${request.url()}: ${request.failure()?.errorText}`));
  if(source)page.on('request',request=>{if(!/^(data:|blob:)/.test(request.url())&&request.url().split(/[?#]/)[0]!==base)external.push(request.url());});
  try {
    const tests=[validationAndDraft,createEditComplete,rejectionAndOwnership,responsive,creationFooterAndDropup,relativeDeadlineAndClose,filteredRegistryCreation,cabinetIntegration,concurrentTaskUpdate],requested=process.argv.slice(2);
    assert.ok(requested.every(name=>tests.some(test=>test.name===name)),'Requested test group exists');
    for(const test of tests.filter(test=>!requested.length||requested.includes(test.name))) {
      try{await test(page);}catch(error){failures.push(`${test.name}: ${error.stack||error}`);console.error(`FAIL — ${test.name}: ${error.message}`);await page.screenshot({path:path.join(os.tmpdir(),`bpm-task-flow-${test.name}-failure.png`)});}
    }
    assert.deepEqual(errors,[],'No browser runtime errors');assert.deepEqual(missing,[],'No failed resources');assert.deepEqual(external,[],'Standalone has no external resources');
    if(failures.length)throw new Error(failures.join('\n\n'));
    report(`${source?'isolated offline file':'local preview'} task-flow checks; no runtime errors or missing resources`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

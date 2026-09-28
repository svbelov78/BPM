/* Single-line task footer regression; source and portable build use the same checks.
 * node test-task-card-footer.cjs
 * BPM_TASK_FOOTER_FILE=../Sber-BPM-Registry-Standalone.html node test-task-card-footer.cjs
 * Fixtures are rendered only in an isolated browser DOM; application data is untouched.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file = process.env.BPM_TASK_FOOTER_FILE ? path.resolve(process.env.BPM_TASK_FOOTER_FILE) : path.join(__dirname,'index.html');
const base = pathToFileURL(file).href;
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-task-footer-'));
const failures = [],measurements = [];
const people = ['Мария Иванова','Алексей Орлов','Дмитрий Козлов','Анна Петрова','Ирина Смирнова','Пётр Сидоров'];
const fixtures = ['upcoming','overdue','completed','no-deadline'].flatMap(state => [3,6,0,1,2].map(count => ({
  id:`footer-${state}-${count}`,title:'Проверка срока задачи',description:'Дата и исполнители остаются на одной строке.',
  initiator:'Иван Петров',assignees:people.slice(0,count),created:'2026-09-01',type:'Типовая',
  status:state==='completed'?'Завершено':'Выполняется',deadline:state==='no-deadline'?'':'2026-09-30',
  completedAt:state==='completed'?'2026-09-28':undefined,overdue:state==='overdue',fixtureState:state,fixtureCount:count
})));
function check(condition,message){if(!condition){failures.push(message);console.error(`FAIL — ${message}`);}}
const near = (a,b) => Math.abs(a-b)<=.6;
async function paint(page){
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
}
async function load(page,hash){
  await page.setViewportSize({width:1920,height:1080});
  await page.goto(`${base}#${hash}`);
  const id=hash==='cabinet'?'cabinet-feed-tasks':'tasks-results';
  await page.waitForFunction(id=>document.getElementById(id)?.getAttribute('aria-busy')==='false',id);
  await paint(page);
}
async function viewport(page,width){
  await page.setViewportSize({width,height:1080});
  if(width<768&&await page.locator('body').evaluate(element=>element.classList.contains('mobile-menu-open')))await page.locator('#collapse-menu').click();
  await paint(page);
}
async function inspect(page,selector,label,{fixture=false}={}){
  await paint(page);
  const rows=await page.locator(selector).evaluateAll(cards=>cards.map(card=>{
    const rect=element=>{if(!element)return null;const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,centerY:r.y+r.height/2};};
    const visible=element=>Boolean(element&&element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden');
    const footer=card.querySelector('.task-card-footer'),route=footer.querySelector('.task-participant-route'),deadline=footer.querySelector('.task-deadline'),copy=deadline.querySelector(':scope > span'),prefix=deadline.querySelector('.task-deadline-prefix');
    const range=document.createRange();range.selectNodeContents(copy);
    const style=getComputedStyle(deadline),textStyle=getComputedStyle(copy);
    return {id:card.dataset.fixtureId||card.dataset.taskId||card.dataset.cabinetOpen,state:card.dataset.fixtureState,assignees:Number(card.dataset.fixtureCount),
      card:rect(card),footer:rect(footer),route:rect(route),deadline:rect(deadline),date:rect(copy),dateRange:rect({getBoundingClientRect:()=>range.getBoundingClientRect()}),
      icon:rect(deadline.querySelector(':scope > img')),direction:rect(route.querySelector(':scope > .task-direction')),
      avatars:[...route.querySelectorAll('.task-avatar')].filter(visible).map(rect),initiator:rect(route.querySelector(':scope > .task-avatar')),
      text:copy.innerText,fontSize:style.fontSize,lineHeight:style.lineHeight,textOverflow:textStyle.textOverflow,whiteSpace:style.whiteSpace,
      prefixExists:Boolean(prefix),prefixVisible:visible(prefix),wrap:getComputedStyle(footer).flexWrap,
      images:[...footer.querySelectorAll('img')].filter(visible).map(image=>({width:image.naturalWidth,height:image.naturalHeight}))};
  }));
  check(rows.length>0,`${label}: task cards exist`);
  for(const row of rows){
    const tag=`${label}/${row.id} (${row.card.width.toFixed(2)}px card)`;
    measurements.push({label,...row});
    check(near(row.footer.height,32),`${tag}: footer stays 32px high (${row.footer.height})`);
    check(row.wrap==='nowrap',`${tag}: footer cannot wrap (${row.wrap})`);
    check(near(row.route.centerY,row.deadline.centerY),`${tag}: participants and deadline share a row`);
    check(row.route.right<=row.deadline.x+.6,`${tag}: participants and deadline do not overlap (${row.route.right}/${row.deadline.x})`);
    check(row.route.x>=row.footer.x-.6&&row.deadline.right<=row.footer.right+.6,`${tag}: content fits footer bounds (${row.deadline.right}/${row.footer.right})`);
    check(row.dateRange.x>=row.footer.x-.6&&row.dateRange.right<=row.footer.right+.6,`${tag}: complete deadline text fits`);
    check(near(row.deadline.height,32)&&near(row.icon.width,32)&&near(row.icon.height,32),`${tag}: deadline and its icon retain 32px size`);
    check(row.fontSize==='17px'&&row.lineHeight==='24px',`${tag}: deadline retains 17px type with 24px line height`);
    check(row.whiteSpace==='nowrap'&&row.textOverflow!=='ellipsis',`${tag}: deadline remains untruncated`);
    check(near(row.direction.width,16)&&near(row.direction.height,16),`${tag}: participant arrow retains 16px size`);
    check(near(row.initiator.width,32)&&near(row.initiator.height,32),`${tag}: initiator retains 32px size`);
    check(row.avatars.length>0&&row.avatars.every(avatar=>near(avatar.width,32)&&near(avatar.height,32)&&near(avatar.centerY,row.deadline.centerY)),`${tag}: all visible avatars retain size and alignment`);
    check(row.images.every(image=>image.width>0&&image.height>0),`${tag}: footer icons decode`);
    if(row.prefixExists)check(row.prefixVisible===(row.footer.width>340),`${tag}: 'до' follows available footer width (${row.footer.width})`);
    if(fixture){
      const expected=row.state==='no-deadline'?'Без срока':row.state==='completed'?'28.09.2026':'30.09.2026';
      check(row.text.includes(expected),`${tag}: full date/status text remains readable (${JSON.stringify(row.text)})`);
      if(row.state==='upcoming')check(row.prefixExists,`${tag}: upcoming date provides optional 'до'`);
      else check(!row.prefixExists,`${tag}: completed/overdue/no-deadline text has no 'до' prefix`);
    }
  }
  return rows;
}
async function actualViews(page){
  await load(page,'cabinet');
  for(const width of [1440,1920,320,390]){
    await viewport(page,width);
    await inspect(page,'#cabinet-feed-tasks .cabinet-task-card',`Cabinet/${width}/normal`);
    await page.locator('#cabinet-expand-tasks').click();await paint(page);
    await inspect(page,'#cabinet-feed-tasks .cabinet-task-card',`Cabinet/${width}/expanded`);
    if(width===1440||width===390)await page.locator('[data-cabinet-section="tasks"]').screenshot({path:path.join(output,`cabinet-expanded-${width}.png`)});
    await page.locator('#cabinet-expand-tasks').click();await paint(page);
  }
  await load(page,'tasks');
  await page.locator('[data-task-tab="all"]').click();
  await page.waitForFunction(()=>document.getElementById('tasks-results').getAttribute('aria-busy')==='false');
  await page.locator('#tasks-cards').click();
  await page.waitForFunction(()=>document.getElementById('tasks-results').getAttribute('aria-busy')==='false');
  for(const width of [1440,1920,320,390]){
    await viewport(page,width);
    await inspect(page,'#tasks-results .task-card[data-task-id]',`Tasks/${width}/cards`);
  }
  console.log('CHECKED — real Cabinet normal/expanded and Tasks cards at 1440/1920/320/390px');
}
async function fixtureMatrix(page){
  for(const kind of ['cabinet','tasks']){
    await load(page,kind);
    await page.evaluate(({kind,fixtures})=>{
      const grid=document.createElement('div');grid.id='task-footer-fixtures';grid.className=kind==='cabinet'?'cabinet-feed':'tasks-grid';
      Object.assign(grid.style,{position:'absolute',left:'16px',top:'120px',zIndex:'2000',background:'var(--panel)',maxHeight:'none',overflow:'visible'});
      const render=kind==='cabinet'?window.BpmCabinetCards.task:window.BpmTaskVisuals.card;
      grid.innerHTML=fixtures.map(render).join('');
      [...grid.children].forEach((card,index)=>{const fixture=fixtures[index];card.dataset.fixtureId=fixture.id;card.dataset.fixtureState=fixture.fixtureState;card.dataset.fixtureCount=fixture.fixtureCount;});
      document.querySelector(kind==='cabinet'?'#cabinet-panel':'#tasks-panel').append(grid);
    },{kind,fixtures});
    for(const width of [320,340,360,370,380,388,389,420,600]){
      await page.locator('#task-footer-fixtures').evaluate((grid,{kind,width})=>grid.style.width=`${width+(kind==='cabinet'?16:0)}px`,{kind,width});
      const rows=await inspect(page,'#task-footer-fixtures .task-card',`${kind}/fixture/${width}`,{fixture:true});
      check(rows.every(row=>near(row.card.width,width)),`${kind}/${width}: fixtures exercise the requested card width`);
      if(width===370){
        await page.locator('#task-footer-fixtures .task-card').first().screenshot({path:path.join(output,`${kind}-upcoming-three-assignees-370.png`)});
        await page.locator('#task-footer-fixtures .task-card').nth(1).screenshot({path:path.join(output,`${kind}-upcoming-six-assignees-370.png`)});
      }
    }
    await page.locator('#task-footer-fixtures').evaluate(grid=>grid.remove());
  }
  console.log('CHECKED — Cabinet/Tasks fixture matrices: 9 card widths, 4 deadline states, 0/1/2/3/6 assignees, 388→389px prefix boundary');
}
async function tablePrefix(page){
  await load(page,'tasks');
  await page.locator('#tasks-results').evaluate((element,fixtures)=>element.innerHTML=window.BpmTaskVisuals.table(fixtures.filter(row=>row.fixtureState==='upcoming')) ,fixtures);
  for(const width of [1920,390,320]){
    await viewport(page,width);
    const deadlines=await page.locator('.tasks-table .task-table-deadline').evaluateAll(cells=>cells.map(cell=>{
      const prefix=cell.querySelector('.task-deadline-prefix');return {text:cell.innerText,prefix:prefix&&getComputedStyle(prefix).display,fontSize:getComputedStyle(cell.querySelector('.task-deadline')).fontSize};
    }));
    check(deadlines.length===5,`Table/${width}: all assignee fixtures exist`);
    check(deadlines.every(row=>/до\s+30\.09\.2026/.test(row.text)&&row.prefix!=='none'&&row.fontSize==='17px'),`Table/${width}: full 'до' prefix and date typography remain unchanged`);
  }
  console.log('CHECKED — table retains “до 30.09.2026” at desktop and mobile widths');
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
  try{
    const context=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
    await context.addInitScript(()=>localStorage.setItem('bpm-registry-menu','expanded'));
    const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
    for(const group of [actualViews,fixtureMatrix,tablePrefix]){
      try{await group(page);}catch(error){failures.push(`${group.name}: ${error.stack||error}`);console.error(`FAIL — ${group.name}: ${error.message}`);await page.screenshot({path:path.join(output,`${group.name}-failure.png`)}).catch(()=>{});}
    }
    check(!errors.length,`No browser exceptions: ${errors.join('; ')}`);
    fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(measurements,null,2));
    assert.equal(failures.length,0,failures.join('\n'));
    console.log(`PASS — ${path.basename(file)} task footer; ${measurements.length} card measurements`);
  }finally{await browser.close();console.log(`Artifacts: ${output}`);}
})().catch(error=>{console.error(error);process.exitCode=1;});

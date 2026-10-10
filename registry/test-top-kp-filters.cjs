/* Browser regression for ТОП-КП filters. All selections go through the actual
 * single-select UI; disabled cards are tested with native pointer/keyboard
 * actions. Optional argv[2]: URL, index.html, or the standalone HTML.
 * Run: node test-top-kp-filters.cjs [absolute/path/to/prototype.html]
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL,fileURLToPath} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const requested = process.argv[2] || path.join(__dirname, 'index.html');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-top-kp-filters-'));
const localFile=/^https?:/.test(requested)?null:requested.startsWith('file:')?fileURLToPath(requested.split('#')[0]):path.resolve(requested);
let target=requested;
// A distribution run gets only the HTML: existing neighbours must never hide
// a missing embedded asset. Source index.html intentionally keeps its folder.
if(localFile&&path.basename(localFile)!=='index.html') {
  target=path.join(output,'renamed-offline.html');fs.copyFileSync(localFile,target);
  assert.deepEqual(fs.readdirSync(output),['renamed-offline.html']);
}
const base = (/^(https?:|file:)/.test(target) ? target : pathToFileURL(path.resolve(target)).href).split('#')[0];
const fieldNames = ['block','ssp','efficiency','csat','techErrors','appeals','variability','pm','benchmarking','gemba'];
const blockLabels = ['B2B','B2C','Блок «Сервисы»','Блок «Сеть продаж»','Блок «Транзакционный банкинг B2C»','Подразделения вне блоков экосистемы B2C','Блок «Управление благосостоянием»','Блок «Развитие клиентского опыта B2C»','Блок «Корпоративно-инвестиционный бизнес»','Подразделения вне блоков','Блок «Финансы»','Блок «Технологии»','Блок «GR, правовые вопросы, комплаенс и ДЗО»','Блок «Люди и культура»','Блок «Риски»','Блок «Стратегия и развитие»','Блок «Технологическое развитие»','Прямое подчинение Президенту','Блок «Sberbank International»','Блок «Строительство»'];
const sspLabels = ['Банковские счета','Безопасность','Бренд и маркетинг','Документооборот и архив','Закупки','Здания, сооружения, ТМЦ','Карты','Контакт-центр','Кредиты','ЛиК','Лояльность','Обслуживание УС','Привлечение денежных средств','Проблемные активы','Рекомендательные системы','Риски','Розничный бизнес','Стратегия и модель управления','Технологии','Транзакции','Управление благосостоянием','Управление клиентами','Физические каналы','Финансы','Цифровой канал','ЮЛ','GR'];
const statusLabels = ['Лидер','On track','Есть отставания','Критическое отставание','Нет данных'];
const expectedMenus = Object.fromEntries(fieldNames.map(key => [key, key==='block' ? blockLabels : key==='ssp' ? sspLabels : ['pm','benchmarking','gemba'].includes(key) ? ['Есть','Нет'] : statusLabels]));
const report = message => console.log(`PASS — ${message}`);
const paint = page => page.evaluate(async () => {await document.fonts.ready;for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);});
const input = (page,key) => page.locator(`#top-filter-${key}-input`);
const popup = (page,key) => page.locator(`#top-filter-${key}-list`);
const state = {};
let fields;

async function choose(page,key,value) {
  const optionIndex = fields.find(field=>field.key===key).options.findIndex(option=>option.value===value);
  const label = value ? expectedMenus[key][optionIndex] : 'Все';
  assert.ok(label, `Known menu value ${key}: ${value}`);
  // Closing an option popup may uncover a card beneath the mouse. Leave
  // that card before returning to controls behind its interactive tooltip.
  await page.mouse.move(1,1);await page.keyboard.press('Escape');await paint(page);
  await input(page,key).click();
  await popup(page,key).waitFor({state:'visible'});
  await popup(page,key).getByRole('option',{name:label,exact:true}).click();
  await popup(page,key).waitFor({state:'hidden'});
  state[key]=value;
  await paint(page);
  assert.equal(await input(page,key).inputValue(),value ? label : '');
  assert.equal(await input(page,key).getAttribute('aria-expanded'),'false');
}
async function snapshot(page) {
  return page.locator('#top-kp-panel').evaluate(root=>{
    const map=root.querySelector('.top-kp-map'), origin=map.getBoundingClientRect();
    const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height};};
    const effectiveOpacity=element=>{let value=1;for(let node=element;node&&node!==root.parentElement;node=node.parentElement)value*=Number(getComputedStyle(node).opacity);return value;};
    return {
      mapOrigin:{x:origin.x+scrollX,y:origin.y+scrollY},
      filtering:!root.querySelector('.top-kp-reset').hidden,
      filterArea:rect(root.querySelector('.top-kp-filters')),
      cards:[...map.querySelectorAll('.top-kp-card')].map(card=>({id:card.dataset.topKpId,...rect(card)})),
      headers:[...map.querySelectorAll('h2,h3,h4')].map(header=>({text:header.textContent,opacity:effectiveOpacity(header),color:getComputedStyle(header).color,...rect(header)})),
      filters:[...root.querySelectorAll('.top-kp-filter')].map(element=>({id:element.id,...rect(element)}))
    };
  });
}
function samePositions(actual,expected,label) {
  assert.equal(actual.cards.length,136,`${label}: source cards stay in DOM`);
  for(const axis of ['x','y'])assert.ok(Math.abs(actual.mapOrigin[axis]-expected.mapOrigin[axis])<.25,`${label}: entire map ${axis} position moved`);
  for(const kind of ['cards','headers']) {
    assert.equal(actual[kind].length,expected[kind].length,`${label}: ${kind} count`);
    actual[kind].forEach((item,index)=>{
      const before=expected[kind][index];
      assert.equal(item.id||item.text,before.id||before.text,`${label}: ${kind} ordering`);
      for(const dimension of ['x','y','width','height'])assert.ok(Math.abs(item[dimension]-before[dimension])<.25,`${label}: ${kind}[${index}] ${dimension} moved (${before[dimension]}→${item[dimension]})`);
      if(kind==='headers'){assert.equal(item.opacity,1,`${label}: category heading never dims`);assert.equal(item.color,before.color);}
    });
  }
  assert.equal(actual.filters.length,10);
  const activeChanged=actual.filtering!==expected.filtering;
  actual.filters.forEach((item,index)=>{
    const before=expected.filters[index];
    assert.equal(item.id,before.id,`${label}: filter order`);
    for(const axis of (activeChanged?['y','height']:['x','y','width','height']))assert.ok(Math.abs(item[axis]-before[axis])<.25,`${label}: filter ${index} ${axis} unexpected change`);
    if(activeChanged) {
      const active=actual.filtering?item:before,inactive=actual.filtering?before:item;
      assert.ok(active.width<inactive.width-0.1,`${label}: each filter narrows for the erase button (${item.id})`);
    }
  });
  if(activeChanged) {
    const active=actual.filtering?actual.filterArea:expected.filterArea,inactive=actual.filtering?expected.filterArea:actual.filterArea;
    assert.ok(Math.abs((inactive.width-active.width)-42)<.25,`${label}: active toolbar allocates 34px erase control + 8px gap`);
  }
}
async function assertResults(page,label,geometry) {
  const result=await page.evaluate(state=>{
    const root=document.querySelector('#top-kp-panel'), records=window.BPM_TOP_KP.records;
    const expected=records.filter(record=>window.BpmTopKpFilters.matches(record,state,window.BpmTopKp.score(record))).map(record=>record.id);
    const cards=[...root.querySelectorAll('.top-kp-card')];
    return {
      expected, actual:cards.filter(card=>!card.disabled).map(card=>card.dataset.topKpId),count:root.querySelector('.top-kp-count').textContent,
      counterLabel:root.querySelector('.top-kp-count').getAttribute('aria-label'),
      announcement:root.querySelector('.top-kp-filter-announcement').textContent,
      resetHidden:root.querySelector('.top-kp-reset').hidden,
      states:cards.map(card=>({id:card.dataset.topKpId,disabled:card.disabled,filtered:card.classList.contains('is-filtered-out'),opacity:getComputedStyle(card).opacity,pointerEvents:getComputedStyle(card).pointerEvents})),
      source:JSON.stringify(window.BPM_TOP_KP)
    };
  },state);
  assert.deepEqual(result.actual.slice().sort(),result.expected.slice().sort(),`${label}: exact AND intersection`);
  const active=Object.values(state).some(Boolean);
  assert.equal(result.resetHidden,!active,`${label}: reset exists only while a filter is active`);
  assert.equal(await page.locator('.top-kp-reset').isVisible(),active);
  assert.equal(result.count,active?`${result.expected.length} / 136`:'136',`${label}: visible counter`);
  assert.ok(result.counterLabel.includes(String(result.expected.length)));
  assert.ok(result.announcement.includes(String(result.expected.length)));
  const expected=new Set(result.expected);
  for(const card of result.states) {
    const match=expected.has(card.id);
    assert.equal(card.disabled,!match,`${label}: native disabled state ${card.id}`);
    assert.equal(card.filtered,!match);
    assert.equal(card.opacity,match?'1':'0.25');
    assert.equal(card.pointerEvents,match?'auto':'none');
  }
  if(geometry)samePositions(await snapshot(page),geometry,label);
  return result;
}
async function reset(page) {
  assert.ok(Object.values(state).some(Boolean),'Reset exercise has active filters');
  await page.locator('.top-kp-reset').click();
  for(const key of Object.keys(state))delete state[key];
  await paint(page);
  assert.equal(await page.locator('.top-kp-reset').isVisible(),false);
  assert.equal(await page.locator('.top-kp-filter-popup').count(),0,'Reset closes any open selector');
  for(const key of fieldNames) {
    assert.equal(await input(page,key).inputValue(),'');
    assert.equal(await input(page,key).getAttribute('title'),'Все');
    assert.equal(await input(page,key).getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator(`#top-filter-${key} .select-toggle.is-clear`).count(),0);
    await input(page,key).click();
    assert.deepEqual(await popup(page,key).locator('[role=option][aria-selected=true] .option-label').allTextContents(),['Все'],`${key}: underlying selection cleared`);
    await page.keyboard.press('Escape');
  }
}

async function main() {
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({offline:base.startsWith('file:'),viewport:{width:2560,height:1440},reducedMotion:'reduce'});
  const errors=[],failed=[];
  await context.addInitScript(()=>localStorage.setItem('bpm-registry-menu','expanded'));
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>failed.push(`${request.url()}: ${request.failure()?.errorText}`));
  try {
    await page.goto(`${base}#top-kp`);
    await page.waitForFunction(()=>!document.querySelector('#top-kp-panel')?.hidden&&document.querySelectorAll('.top-kp-card').length===136);
    await paint(page);
    fields=await page.evaluate(()=>window.BpmTopKpFilters.fields);
    assert.deepEqual(fields.map(field=>field.key),fieldNames);
    assert.equal(await page.locator('.top-kp-filters [role=combobox]').count(),10);
    assert.equal(await page.locator('.top-kp-footer').count(),0,'Old demonstration footer removed');
    const resetIcon=await page.locator('.top-kp-reset img').evaluate(img=>({src:img.currentSrc||img.src,loaded:img.complete&&img.naturalWidth>0,width:getComputedStyle(img).width,height:getComputedStyle(img).height}));
    assert.ok(resetIcon.loaded,'Erase icon loads even in isolated offline HTML');
    assert.equal(resetIcon.width,'24px');assert.equal(resetIcon.height,'24px');
    if(resetIcon.src.startsWith('data:')) {
      const comma=resetIcon.src.indexOf(','),body=resetIcon.src.slice(comma+1);
      const svg=resetIcon.src.slice(0,comma).includes(';base64')?Buffer.from(body,'base64').toString('utf8'):decodeURIComponent(body);
      assert.equal(svg,fs.readFileSync(path.join(__dirname,'assets/top-kp/erase.svg'),'utf8'),'Standalone embeds the design-system erase icon');
    } else assert.ok(resetIcon.src.endsWith('/assets/top-kp/erase.svg'),'Reset uses erase.svg');
    const originalSource=await page.evaluate(()=>JSON.stringify(window.BPM_TOP_KP));
    for(const field of fields) {
      assert.equal(await page.locator(`#top-filter-${field.key} .internal-label`).textContent(),field.label);
      assert.equal(await input(page,field.key).getAttribute('placeholder'),'Все');
      await input(page,field.key).click();
      await popup(page,field.key).waitFor({state:'visible'});
      const actual=await popup(page,field.key).locator('[role=option] .option-label').allTextContents();
      assert.deepEqual(actual,['Все',...expectedMenus[field.key]],`${field.key}: exact menu and order`);
      assert.equal(await popup(page,field.key).getAttribute('aria-multiselectable'),null,`${field.key}: single select`);
      const optionStyles=await popup(page,field.key).locator('[role=option]').evaluateAll(options=>options.map(option=>{
        const style=getComputedStyle(option),label=option.querySelector('.option-label'),labelStyle=getComputedStyle(label);
        return {fontSize:style.fontSize,lineHeight:style.lineHeight,fontWeight:style.fontWeight,padding:style.padding,whiteSpace:style.whiteSpace,overflowWrap:style.overflowWrap,labelOverflow:labelStyle.overflow,textOverflow:labelStyle.textOverflow,labelHeight:label.getBoundingClientRect().height,labelWidth:label.clientWidth,labelScrollWidth:label.scrollWidth};
      }));
      for(const style of optionStyles) {
        assert.equal(style.fontSize,'17px');assert.equal(style.lineHeight,'24px');assert.equal(style.fontWeight,'590');assert.equal(style.padding,'13px 16px');
        assert.equal(style.whiteSpace,'normal');assert.equal(style.overflowWrap,'anywhere');
        assert.equal(style.labelOverflow,'visible');assert.equal(style.textOverflow,'clip');
        assert.ok(style.labelScrollWidth<=style.labelWidth+1,`${field.key}: option text wraps instead of overflowing`);
      }
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({width:390,height:844});await paint(page);
    if(await page.locator('body').evaluate(body=>body.classList.contains('mobile-menu-open')))await page.locator('#sidebar-backdrop').click({position:{x:385,y:120}});
    await input(page,'block').click();await popup(page,'block').waitFor({state:'visible'});
    const mobileLabels=await popup(page,'block').locator('.option-label').evaluateAll(labels=>labels.map(label=>({height:label.getBoundingClientRect().height,width:label.clientWidth,scrollWidth:label.scrollWidth})));
    assert.ok(mobileLabels.some(label=>label.height>24),'Long block names wrap onto multiple lines on a narrow viewport');
    assert.ok(mobileLabels.every(label=>label.scrollWidth<=label.width+1),'Wrapped mobile menu labels never overflow');
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:2560,height:1440});await paint(page);
    report('10 single-selects expose exact menus, 17/24px weight-590 options with 13/16px padding and wrapping; erase icon loads, footer absent');
    const baseline=await snapshot(page);
    await assertResults(page,'Initial state',baseline);

    // Exercise each binding independently so an overly restrictive SSP filter
    // cannot conceal an accidentally unconnected metric selector.
    for(const field of fields) {
      await choose(page,field.key,field.options[0].value);
      const selected=await assertResults(page,`${field.key} alone`,baseline);
      assert.ok(selected.expected.length>0&&selected.expected.length<136);
      await choose(page,field.key,'');
      await assertResults(page,`${field.key} reset via Все`,baseline);
    }
    report('Every filter matches its model; erase appearance narrows every select and reset restores widths without moving cards or headings');

    await choose(page,'pm','yes');
    await choose(page,'benchmarking','yes');
    await choose(page,'csat','leader');
    let intersect=await assertResults(page,'PM ∩ benchmarking ∩ CSAT',baseline);
    assert.ok(intersect.expected.length>0&&intersect.expected.length<20);
    await page.screenshot({path:path.join(output,'filtered-desktop.png')});

    for(const size of [{width:1920,height:920},{width:390,height:844},{width:2560,height:1440}]) {
      await page.setViewportSize(size);await paint(page);
      if(await page.locator('body').evaluate(body=>body.classList.contains('mobile-menu-open')))await page.locator('#sidebar-backdrop').click({position:{x:size.width-5,y:120}});
      intersect=await assertResults(page,`${size.width}px selection persists after layout rebuild`);
      for(const key of ['pm','benchmarking','csat'])assert.equal(await input(page,key).inputValue(),fields.find(field=>field.key===key).options.find(option=>option.value===state[key]).label);
    }
    await page.locator('#cabinet-nav').click();
    await page.locator('#cabinet-panel').waitFor({state:'visible'});
    await page.locator('#top-paths').click();
    await page.locator('#top-kp-panel').waitFor({state:'visible'});await paint(page);
    await assertResults(page,'Selection survives cabinet→TOP route',baseline);
    report('AND-composed selections and counter survive mobile/desktop resize and section navigation');

    await input(page,'block').click();await popup(page,'block').waitFor({state:'visible'});
    await reset(page);await assertResults(page,'Full reset using erase button with an open selector',baseline);
    report('Erase button clears all UI/state, disappears and restores filter widths without moving headers or cards');
    const first=page.locator('.top-kp-card').first();
    await first.hover();await page.locator('.top-kp-hover').waitFor({state:'visible'});
    await choose(page,'efficiency','no-data');
    const none=await assertResults(page,'No-data efficiency: empty match set',baseline);
    assert.equal(none.expected.length,0);
    assert.equal(await page.locator('.top-kp-hover').count(),0,'Changing filters dismisses any existing hover');
    assert.equal(await page.locator('.top-kp-card:disabled').count(),136);
    await first.scrollIntoViewIfNeeded();
    const box=await first.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.top-kp-hover').count(),0,'Native pointer hover does not reveal a filtered card');
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    assert.equal(await page.locator('#process-drawer[open]').count(),0,'Native click through pointer-events:none does not open detail');
    const viewport=page.locator('.top-kp-map-viewport');
    await viewport.focus();
    await first.focus();
    assert.equal(await first.evaluate(card=>card===document.activeElement),false,'Native disabled button rejects focus');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#process-drawer[open]').count(),0,'Native keyboard activation cannot open disabled detail');
    await input(page,'gemba').focus();await page.keyboard.press('Escape');
    for(let index=0;index<12;index++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement?.matches('.top-kp-card:disabled')),false,'Tab traversal skips disabled cards');
    }
    await page.keyboard.press('Escape');
    report('Filtered cards remain at 25% opacity, ignore hover/click, reject focus/Enter/Space, and are skipped by Tab');

    await choose(page,'efficiency','');await assertResults(page,'Re-enable every card',baseline);
    await first.focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#process-drawer')?.open&&document.querySelector('#process-drawer')?.dataset.pdEntity==='paths');
    assert.equal(await page.locator('#top-kp-detail').count(),0);
    await page.keyboard.press('Escape');await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
    assert.equal(await first.evaluate(card=>card===document.activeElement),true,'Drawer close restores card focus');

    await page.setViewportSize({width:1440,height:920});await paint(page);
    // Closing the drawer restores card focus. Dismiss its accessible hover
    // before changing the sidebar mode, as a keyboard user would.
    await page.keyboard.press('Escape');await page.locator('.top-kp-hover').waitFor({state:'hidden'});
    if(!await page.locator('body').evaluate(body=>body.classList.contains('menu-collapsed')))await page.locator('#collapse-menu').click();
    await page.mouse.move(1438,1);await page.locator('body.menu-collapsed:not(.menu-peek)').waitFor();await paint(page);
    await choose(page,'efficiency','leader');await assertResults(page,'1440px collapsed screenshot state');
    await page.screenshot({path:path.join(output,'filtered-1440x920-collapsed.png')});
    const screenshotGeometry=await snapshot(page);
    await input(page,'block').click();await popup(page,'block').waitFor({state:'visible'});
    await page.screenshot({path:path.join(output,'filters-dropdown-1440x920.png')});
    await reset(page);await assertResults(page,'Final screenshot reset via erase button',screenshotGeometry);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.BPM_TOP_KP)),originalSource,'No synthetic metadata overwrites the workbook');
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
    report('Reset restores native card→КП drawer behaviour; source data unchanged and no browser errors');
    console.log(JSON.stringify({status:'PASS',source:base,fields:10,cards:136,errors,failed,output},null,2));
  } finally {await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

/* Compact people-filter and entity-tab regression.
 * Optional argv[2]: standalone HTML, relocated into an isolated temporary
 * directory and exercised offline. Uses a fresh browser context only.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-compact-people-'));
const standalone = process.argv[2];
let file = path.join(__dirname, 'index.html');
if (standalone) {
  assert(path.isAbsolute(standalone), 'Provide an absolute standalone HTML path');
  file = path.join(output, 'renamed-offline.html');
  fs.copyFileSync(standalone, file);
}
const url = `${pathToFileURL(file).href}#main`;
const peopleKinds = ['divisionLeader', 'processOwner', 'pathOwner'];
const trigger = page => page.locator('#structure-people');
const popup = page => page.locator('#structure-people-popup');
const query = page => page.locator('#structure-people-search');
const option = (page, person) => popup(page).locator(`[data-structure-person="${person.id}"]`);
const chip = (page, kind, id) => page.locator(`#structure-chips [data-structure-filter="${kind}"][data-value="${id}"]`);
const ready = page => page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
const paint = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
const report = message => console.log(`PASS — ${message}`);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual} vs ${expected}`);

async function open(page) {
  if (await trigger(page).getAttribute('aria-expanded') !== 'true') await trigger(page).click();
  await popup(page).waitFor({state: 'visible'});
  assert.equal(await trigger(page).getAttribute('aria-expanded'), 'true');
}
async function close(page) {
  if (await popup(page).isVisible()) {
    await page.keyboard.press('Escape');
    await popup(page).waitFor({state: 'hidden'});
  }
  assert.equal(await trigger(page).getAttribute('aria-expanded'), 'false');
}
async function choose(page, person) {
  await open(page);
  await query(page).fill(person.title);
  const row = option(page, person);
  await row.waitFor({state: 'visible'});
  assert.equal(await row.locator('.structure-search-id,[data-search-copy],.id-badge').count(), 0, 'People options do not show source IDs or copy actions');
  await row.click();
  await ready(page);
  await chip(page, 'people', person.id).waitFor({state: 'visible'});
  await close(page);
}
async function reset(page) {
  await close(page);
  if (await page.locator('#structure-reset').isVisible()) await page.locator('#structure-reset').click();
  await ready(page);
  assert.equal(await page.locator('#structure-chips [data-structure-filter]').count(), 0, 'Reset removes all applied filters');
}
async function entity(page, value) {
  const tab = page.locator(`#structure-${value}-tab`);
  if (await tab.getAttribute('aria-pressed') !== 'true') {await tab.click(); await ready(page);}
}

// Independent oracle: union of a person's division leadership, direct process
// ownership and occurrence-specific КП ownership, then intersect entity filters.
// It deliberately does not call catalog.matches or the production filter code.
async function assertPeopleResults(page, persons, target, productId, label) {
  const result = await page.evaluate(({persons, target, productId}) => {
    const models = {processes: window.BPM_STRUCTURE, paths: window.BPM_STRUCTURE_PATHS};
    const fold = value => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    const roles = new Map(persons.map(person => [fold(person.title), new Set(person.kinds)]));
    const owners = row => [...new Set([...(row?.owners || []), row?.owner].filter(Boolean).map(fold))];
    const owns = (row, kind) => owners(row).some(name => roles.get(name)?.has(kind));
    const leaders = new Map();
    const visit = (nodes, names = []) => nodes.forEach(node => {
      const branch = node.kind === 'division' ? [...names, ...owners(node)] : names;
      if (node.kind === 'product') leaders.set(node.id, branch);
      visit(node.children || [], branch);
    });
    visit(models.processes.roots);
    const processes = new Map(models.processes.records.map(row => [row.id, row]));
    const paths = models.paths.records;
    const valid = link => link.processId && link.validProcessCode !== false;
    const matches = (row, nodeId) => {
      if (productId && nodeId !== productId) return false;
      if (leaders.get(nodeId)?.some(name => roles.get(name)?.has('divisionLeader'))) return true;
      if (target === 'processes') return owns(row, 'processOwner') || paths.some(kp => kp.sourceLinks.some(link => valid(link) && link.productId === nodeId && link.processId === row.id && owns(link, 'pathOwner')));
      const links = row.sourceLinks.filter(link => link.productId === nodeId);
      return links.some(link => owns(link, 'pathOwner') || valid(link) && owns(processes.get(link.processId), 'processOwner'));
    };
    const expected = {};
    for (const node of models[target].nodes.filter(node => node.kind === 'product')) {
      const rows = node.records.filter(row => matches(row, node.id)).sort((a,b) => a.number-b.number || a.id.localeCompare(b.id));
      if (rows.length) expected[node.id] = rows.map(row => row.id);
    }
    const actual = {};
    for (const node of document.querySelectorAll('#structure-list [data-kind="product"]')) {
      actual[node.dataset.node] = [...node.querySelectorAll(':scope > .structure-children > .structure-table-scroll > .structure-table > tbody > tr[data-structure-record]')].map(row => row.dataset.structureRecord);
    }
    const count = Number(document.getElementById(`structure-${target === 'paths' ? 'path' : 'process'}-count`).textContent.replace(/\D/g, ''));
    return {expected, actual, count};
  }, {persons, target, productId});
  assert.ok(Object.keys(result.expected).length, `${label}: real fixture has results`);
  assert.deepEqual(Object.keys(result.actual).sort(), Object.keys(result.expected).sort(), `${label}: exact matching product occurrences`);
  for (const [id, rows] of Object.entries(result.expected)) assert.deepEqual(result.actual[id], rows.slice(0, 50), `${label}: exact rows in ${id}`);
  assert.equal(result.count, new Set(Object.values(result.expected).flat()).size, `${label}: unique entity counter`);
}

async function geometry(page, width, menu) {
  await page.mouse.move(1,1);
  await page.setViewportSize({width, height: 1080});
  await paint(page);
  if(width<768&&await page.locator('body').evaluate(body=>body.classList.contains('mobile-menu-open')))await page.keyboard.press('Escape');
  await paint(page);
  const geometry = await page.evaluate(() => {
    const box = element => {const r = element.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const toolbar = document.getElementById('structure-toolbar');
    const people = document.getElementById('structure-people');
    return {
      width:innerWidth, documentWidth:document.documentElement.scrollWidth, bodyWidth:document.body.scrollWidth,
      toolbar:{...box(toolbar),clientWidth:toolbar.clientWidth,scrollWidth:toolbar.scrollWidth},
      people:box(people), icons:[...people.querySelectorAll('img')].map(image => ({...box(image),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight})),
      tabs:[...document.querySelectorAll('#structure-entity-tabs button')].map(tab => {
        const label=tab.querySelector('.structure-tab-label'), count=tab.querySelector('.structure-tab-count');
        const style=getComputedStyle(tab), labelStyle=label&&getComputedStyle(label), countStyle=count&&getComputedStyle(count);
        return {id:tab.id,box:box(tab),paddingLeft:parseFloat(style.paddingLeft),paddingRight:parseFloat(style.paddingRight),
          label:label&&{...box(label),overflow:labelStyle.overflow,textOverflow:labelStyle.textOverflow,whiteSpace:labelStyle.whiteSpace,clientWidth:label.clientWidth,scrollWidth:label.scrollWidth},
          count:count&&{...box(count),text:count.textContent,shrink:countStyle.flexShrink,clientWidth:count.clientWidth,scrollWidth:count.scrollWidth}};
      })
    };
  });
  const label = `${width}px/${menu}`;
  assert(geometry.documentWidth<=width+1&&geometry.bodyWidth<=width+1,`${label}: page has no horizontal overflow`);
  assert(geometry.toolbar.scrollWidth<=geometry.toolbar.clientWidth+1,`${label}: compact toolbar has no overflow`);
  assert(geometry.people.x>=geometry.toolbar.x-1&&geometry.people.right<=geometry.toolbar.right+1,`${label}: people trigger stays in toolbar`);
  assert.equal(geometry.icons.length,2,`${label}: people trigger has person and chevron icons`);
  assert.deepEqual(geometry.icons.map(icon=>Math.round(icon.width)).sort((a,b)=>a-b),[16,24],`${label}: exact 24px person and 16px chevron assets`);
  geometry.icons.forEach(icon=>{assert(icon.naturalWidth>0&&icon.naturalHeight>0,`${label}: icon loads offline`);});
  for (const tab of geometry.tabs) {
    assert(tab.label&&tab.count,`${label}/${tab.id}: label and count have separate wrappers`);
    near(tab.paddingLeft,16,`${label}/${tab.id}: left padding`);near(tab.paddingRight,16,`${label}/${tab.id}: right padding`);
    assert.equal(tab.label.textOverflow,'ellipsis',`${label}/${tab.id}: title uses ellipsis`);
    assert.equal(tab.label.whiteSpace,'nowrap',`${label}/${tab.id}: title stays on one line`);
    assert(['hidden','clip'].includes(tab.label.overflow),`${label}/${tab.id}: long title is clipped`);
    assert.equal(tab.count.shrink,'0',`${label}/${tab.id}: counter never shrinks`);
    assert(tab.label.x>=tab.box.x+15&&tab.count.right<=tab.box.right-15,`${label}/${tab.id}: visible label/counter preserve padding`);
    assert(tab.label.right<=tab.count.x+1,`${label}/${tab.id}: title cannot overlap counter`);
    assert(tab.count.scrollWidth<=tab.count.clientWidth+1,`${label}/${tab.id}: full number remains visible`);
    assert(/^\d+$/.test(tab.count.text),`${label}/${tab.id}: live numeric count`);
  }
  await open(page);
  const popupBox = await popup(page).boundingBox();
  assert(popupBox.x>=-1&&popupBox.x+popupBox.width<=width+1,`${label}: popup fits viewport`);
  if(width===1920||width===320)await popup(page).screenshot({path:path.join(output,`people-popup-${width}-${menu}.png`)});
  await page.locator('#structure-toolbar').screenshot({path:path.join(output,`toolbar-${width}-${menu}.png`)});
  await close(page);
  return geometry.tabs.some(tab=>tab.label.scrollWidth>tab.label.clientWidth+1);
}

(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {
    let observedEllipsis = false;
    for (const menu of ['expanded','collapsed']) {
      const context = await browser.newContext({offline:true,viewport:{width:1920,height:1080},reducedMotion:'reduce'});
      await context.addInitScript(menu=>{
        localStorage.clear();localStorage.setItem('bpm-registry-menu',menu);
        const timeout=window.setTimeout;
        window.setTimeout=function(callback,delay,...args){return timeout.call(window,callback,delay===2000?40:delay,...args);};
      },menu);
      const page = await context.newPage(),errors=[],failed=[],external=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('requestfailed',request=>failed.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('request',request=>{if(/^https?:/i.test(request.url())||(standalone&&request.url().startsWith('file:')&&request.url().split('#')[0]!==pathToFileURL(file).href))external.push(request.url());});
      try {
        await page.goto(url);await page.locator('#structure-toggle').click();await ready(page);
        const baseline = await page.evaluate(()=>JSON.stringify([window.BPM_STRUCTURE,window.BPM_STRUCTURE_PATHS]));
        const fixtures = await page.evaluate(() => {
          const catalog=window.BPMStructureSearchModel.create({processes:window.BPM_STRUCTURE,paths:window.BPM_STRUCTURE_PATHS});
          if(catalog.people.some(person=>/^#|^(?:n\/a|н\/д)$/i.test(person.title)))throw new Error('Spreadsheet errors must not be offered as people');
          const people=new Map();
          catalog.entries.filter(entry=>entry.person).forEach(entry=>{if(!people.has(entry.id))people.set(entry.id,{id:entry.id,title:entry.title,kinds:[]});people.get(entry.id).kinds.push(entry.kind);});
          const all=[...people.values()], multi=all.find(person=>person.kinds.includes('divisionLeader')&&person.kinds.includes('pathOwner'))||all.find(person=>person.kinds.length>1);
          const second=all.find(person=>person.id!==multi.id&&person.kinds.includes('processOwner'));
          return {multi,second,unique:all.length};
        });
        assert(fixtures.multi&&fixtures.second,'Real multi-role and second-person fixtures exist');
        if(menu==='expanded') {
          await trigger(page).focus();await page.keyboard.press('Enter');await popup(page).waitFor({state:'visible'});
          assert.equal(await trigger(page).getAttribute('aria-expanded'),'true','Keyboard opens people popup');
          await close(page);
          await open(page);await page.locator('#structure-toggle').click();await popup(page).waitFor({state:'hidden'});
          await page.locator('#structure-toggle').click();await ready(page);
          await open(page);await page.locator('#page-title').click();await popup(page).waitFor({state:'hidden'});
          await open(page);await query(page).fill('ФамилияНеСуществует123');
          assert.equal(await popup(page).locator('[data-structure-person]').count(),0,'Empty query results do not keep stale options');
          await query(page).fill(fixtures.multi.title.toUpperCase().replace(/Е/g,'Ё'));
          assert.equal(await option(page,fixtures.multi).count(),1,'One person appears once across all roles; ё/е and case normalized');
          await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await ready(page);
          assert.equal(await option(page,fixtures.multi).getAttribute('aria-selected'),'true','Keyboard can select a person');
          await page.keyboard.press('Enter');await ready(page);
          assert.equal(await option(page,fixtures.multi).getAttribute('aria-selected'),'false','Keyboard can deselect a person');
          await close(page);
          await choose(page,fixtures.multi);
          for(const target of ['processes','paths']){await entity(page,target);await assertPeopleResults(page,[fixtures.multi],target,null,`multi-role person/${target}`);}
          await choose(page,fixtures.second);
          for(const target of ['processes','paths']){await entity(page,target);await assertPeopleResults(page,[fixtures.multi,fixtures.second],target,null,`two people use OR/${target}`);}
          await reset(page);
          await choose(page,fixtures.multi);
          const productId=await page.locator('#structure-list [data-kind="product"]').first().getAttribute('data-node');
          await page.locator('#structure-product-input').click();
          await page.locator(`#structure-product-list [data-option="${productId}"]`).click();await page.keyboard.press('Escape');await ready(page);
          await assertPeopleResults(page,[fixtures.multi],'paths',productId,'people AND product filter');
          await open(page);await page.locator('#structure-people-clear').click();await ready(page);await close(page);
          assert.equal(await page.locator('#structure-chips [data-structure-filter="product"]').count(),1,'People reset preserves product filter');
          assert.equal(await page.locator('#structure-chips [data-structure-filter="people"]').count(),0,'People reset removes selected people');
          await reset(page);await choose(page,fixtures.multi);
          await chip(page,'people',fixtures.multi.id).click();await ready(page);
          assert.equal(await page.locator('#structure-chips [data-structure-filter]').count(),0,'Removing person chip clears compact selection');
          await open(page);await query(page).fill(fixtures.multi.title);
          const state=await option(page,fixtures.multi).getAttribute('aria-selected');
          if(state!==null)assert.equal(state,'false','Popup reflects chip removal');
          await close(page);
          report('Searchable unique people, normalization, multi-role OR and multi-person OR in both entities, reset/chip removal, keyboard/Escape/outside close');
        }
        await reset(page);
        for(const width of [1920,1720,1440,1024,768,390,320])observedEllipsis=(await geometry(page,width,menu))||observedEllipsis;
        assert.equal(await page.evaluate(()=>JSON.stringify([window.BPM_STRUCTURE,window.BPM_STRUCTURE_PATHS])),baseline,'Source data unchanged');
        assert.deepEqual(errors,[],`${menu}: no runtime errors`);assert.deepEqual(failed,[],`${menu}: no failed resources`);assert.deepEqual(external,[],`${menu}: fully offline`);
        report(`${menu} menu at 1920/1720/1440/1024/768/390/320px: no overflow, accessible popup, exact icons, tab padding and readable counters`);
      } finally {await context.close();}
    }
    assert(observedEllipsis,'At least one narrow layout exercises real truncated tab text');
    report(`${standalone?'Relocated standalone':'Source'}; screenshots: ${output}`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

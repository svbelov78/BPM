/* The Insights heading restores demonstration scenarios, not only navigation.
 * Run: node registry/test-insight-demo-reset.cjs [registry/index.html | standalone.html]
 * Uses a disposable offline profile; no actual browser/user data is accessed. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-demo-reset-'));
let source = path.resolve(process.argv[2] || path.join(__dirname,'index.html'));
if (path.basename(source) !== 'index.html') {
  const isolated = path.join(output,'isolated-prototype.html');
  fs.copyFileSync(source,isolated); source = isolated;
}
const detail = '#insights-detail-view';
const ready = page => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
const paint = page => page.evaluate(async () => {await document.fonts.ready;await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));});
const read = (page,id) => page.evaluate(id => BpmInsightStore.get(id),id);
const tabs = page => page.locator('#insights-tabs [data-insight-tab]').evaluateAll(nodes => nodes.map(node => node.dataset.insightTab));
async function pending(page) {
  return page.evaluate(() => {
    const rows = BpmInsightStore.list();
    return {approval:rows.filter(row => BpmInsightWorkflow.canApprove(row)).length,
      opinion:rows.filter(row => BpmInsightWorkflow.needsOpinion(row)).length,
      decision:rows.filter(row => BpmInsightWorkflow.canDecideTeam(row)).length};
  });
}
async function currentAlert(page,expected,label) {
  assert.ok(await page.locator('.insights-alert').isVisible(),`${label}: yellow alert is visible`);
  for (const [kind,count] of Object.entries(expected)) {
    const link = page.locator(`.insights-alert [data-insight-attention="${kind}"]`);
    assert.equal(await link.count(),count ? 1 : 0,`${label}: ${kind} exists only for nonzero work`);
    if (count) assert.match(await link.textContent(),new RegExp(` ${count}$`),`${label}: correct ${kind} counter`);
  }
}
async function registryWithoutReset(page) {
  // The view controls are ordinary navigation. Do not use the demo-reset heading.
  await page.locator('#insights-table').click();await ready(page);await paint(page);
}
async function openResult(page,id) {
  await page.locator(`#insights-results [data-insight-open="${id}"]`).click();await paint(page);
  assert.ok(await page.locator(detail).isVisible(),`${id}: detail is visible`);
}
async function bottom(page) {
  await page.locator(`${detail} .id-detail-scroll`).evaluate(node => {node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});await paint(page);
}
async function freshGate(page,selector,label) {
  const state = await page.locator(selector).evaluate(node => ({pending:node.dataset.scrollPending,progress:Number(node.dataset.scrollProgress),disabled:node.disabled}));
  assert.equal(state.pending,'true',`${label}: completed review was invalidated`);
  assert.ok(state.progress > 0 && state.progress < 1,`${label}: ring has fresh proportional progress ${JSON.stringify(state)}`);
  assert.equal(state.disabled,true,`${label}: fresh unread action is disabled`);
  assert.equal(await page.locator(`${detail} .id-detail-scroll`).evaluate(node => node.scrollTop),0,`${label}: old scroll position was cleared`);
}
async function main() {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1440,height:700},offline:true,reducedMotion:'reduce'});
  const page = await context.newPage(),errors = [];page.setDefaultTimeout(15000);
  page.on('pageerror',error => errors.push(error.message));
  try {
    await page.goto(pathToFileURL(source).href+'#insights');await ready(page);await paint(page);
    const seed = await page.evaluate(() => BpmInsightStore.list());
    const baseline = await pending(page);
    assert.deepEqual(baseline,{approval:4,opinion:2,decision:2},'Fixture has real actionable workflow scenarios');
    await currentAlert(page,baseline,'Initial state');
    const taskSnapshot = await page.evaluate(() => window.BpmTaskStore?.list?.() || null);
    const local = await page.evaluate(() => {
      const created = BpmInsightStore.create({title:'Сохраняемый пользовательский инсайт',source:'Process Mining',description:'Пользовательское наблюдение',rootCauses:'Пользовательская причина',solution:'Пользовательское решение',owner:'Пользовательский владелец',author:'Пользовательский автор',bank:'Поволжский банк',products:['Пользовательский продукт'],related:[],effects:[{id:'local-effect',name:'Пользовательский эффект',type:'Качественный',description:'Не сбрасывать',applicable:true}],attachments:[{id:'local-file',name:'local-user.pdf',type:'application/pdf',size:42}],commentsDraft:[{id:'local-comment',author:'Пользовательский автор',text:'Не потерять комментарий'}]});
      return BpmInsightStore.update(created.id,{status:'В работе',rating:4.8,detail:{userRating:5,averageRating:4.8,history:[{text:'Пользовательское изменение',date:'09.10.2026'}],taskIds:['local-task'],reproductionComment:'Сохранённый пользовательский текст'}});
    });
    assert.equal(local.local,true,'Test creates a genuinely local record');

    await openResult(page,'INS-000055');await bottom(page);
    await page.locator(`${detail} [data-id-reproduction="Воспроизводится"]`).click();await paint(page);
    for(const index of (await read(page,'INS-000055')).detail.effects.keys())await page.locator(`${detail} [data-id-applicable="${index}"][data-id-value="false"]`).click();
    await page.locator(`${detail} [data-id-field="reproductionComment"]`).fill('Мнение, которое сбросится для повторного показа');
    await page.locator(`${detail} [data-id-send-opinion]`).click();await paint(page);
    assert.match(await page.locator(`${detail} [data-id-send-opinion]`).textContent(),/Мнение отправлено/,'Real UI opinion submission completes the scenario');
    await registryWithoutReset(page);await openResult(page,'INS-000060');await bottom(page);
    assert.equal(await page.locator(`${detail} [data-id-approval="approve"]`).getAttribute('data-scroll-pending'),null,'Approval tab has a genuinely completed cached review');
    await registryWithoutReset(page);await openResult(page,'INS-000054');await bottom(page);await registryWithoutReset(page);

    await page.evaluate(() => {
      for (const original of BpmInsightStore.list().filter(row => !row.local && BpmInsightWorkflow.canApprove(row))) {
        const row = BpmInsightStore.get(original.id);
        BpmInsightStore.update(row.id,BpmInsightWorkflow.decide(row,{decision:'approve',comment:'Демонстрационное согласование'}));
      }
      for (const original of BpmInsightStore.list().filter(row => !row.local && BpmInsightWorkflow.needsOpinion(row))) {
        const row = BpmInsightStore.get(original.id);
        const effects=(row.detail?.effects||row.effects||[]).map((effect,index)=>({id:effect.id||`effect-${index}`,applicable:false}));
        BpmInsightStore.update(row.id,BpmInsightWorkflow.saveOpinion(row,{reproduction:'Частично',comment:'Демонстрационное мнение',effects}));
      }
      for (const original of BpmInsightStore.list().filter(row => !row.local && BpmInsightWorkflow.canDecideTeam(row))) {
        const row = BpmInsightStore.get(original.id);
        BpmInsightStore.update(row.id,BpmInsightWorkflow.decideTeam(row,{decision:'accept',comment:'Демонстрационное решение'}));
      }
    });await paint(page);
    assert.deepEqual(await pending(page),{approval:0,opinion:0,decision:0},'Real workflow mutations consume all pending work');
    assert.ok(await page.locator('.insights-alert').isHidden(),'The exhausted yellow alert is actually absent before reset');
    const progressed = await page.evaluate(() => BpmInsightStore.list());

    await page.locator('#insights-search').fill('Сохраняемый пользовательский');await ready(page);
    await page.locator('#insights-reset').click();await ready(page);
    assert.deepEqual(await page.evaluate(() => BpmInsightStore.list()),progressed,'Ordinary clear-filters control never resets scenario progress');
    assert.ok(await page.locator('.insights-alert').isHidden(),'Clearing filters cannot resurrect the consumed alert');
    await page.locator('#insights-search').fill('INS-000055');await ready(page);
    await page.locator('[data-insight-sort="created"]').click();await ready(page);
    await openResult(page,'INS-000055');
    assert.match(await page.locator(`${detail} [data-id-send-opinion]`).textContent(),/Мнение отправлено/,'Ordinary registry navigation preserves the sent opinion');
    const opened = await tabs(page);
    await page.locator('#insights-count').click();await ready(page);await paint(page);
    assert.deepEqual(await pending(page),baseline,'Heading restores actual pending workflows, not only the alert markup');
    await currentAlert(page,baseline,'Restored state');
    assert.deepEqual(await page.evaluate(() => BpmInsightStore.list().filter(row => !row.local)),seed,'Every demo record is restored coherently to its seed');
    assert.deepEqual(await read(page,local.id),local,'User-created fields, workflow, details, timestamps and status are unchanged');
    assert.deepEqual(await page.evaluate(() => window.BpmTaskStore?.list?.() || null),taskSnapshot,'Other prototype stores are untouched');
    assert.deepEqual(await tabs(page),opened,'Demo reset preserves all existing tabs');
    assert.ok(await page.locator('.insights-table').isVisible(),'Chosen table/card presentation is preserved');
    assert.equal(await page.locator('#insights-search').inputValue(),'','Heading clears the applied query');
    assert.ok(await page.locator('#insights-applied').isHidden(),'Heading clears applied criteria');
    assert.equal(await page.locator('#insights-count').textContent(),String(seed.length+1),'The reset date period includes every retained local record');
    assert.equal(await page.locator(`#insights-results [data-insight-open="${local.id}"]`).count(),1,'Retained local record is immediately visible, not hidden by the older default end date');
    assert.equal(await page.locator('.insights-table th[aria-sort]').getAttribute('aria-sort'),'descending','Heading restores default sort direction');
    assert.equal(await page.locator('.insights-table th[aria-sort] [data-insight-sort]').getAttribute('data-insight-sort'),'id','Heading restores default ID sorting');
    assert.equal(await page.evaluate(() => scrollY),0,'Restored alert is returned to the top');
    await page.screenshot({path:path.join(output,'demo-reset-alert-desktop.png')});

    await page.locator('#insights-tabs [data-insight-tab="INS-000055"]').click();await paint(page);
    assert.match(await page.locator(`${detail} [data-id-send-opinion]`).textContent(),/Отправить мнение/,'Existing opinion tab no longer has stale sent state');
    assert.equal(await page.locator(`${detail} [data-id-reproduction][aria-pressed="true"]`).count(),0,'Existing opinion tab starts with no choice');
    assert.ok(await page.locator(`${detail} [data-id-reproduction-alert]`).isVisible(),'Opinion instruction returns');
    assert.equal(await page.locator(`${detail} [data-id-field="reproductionComment"]`).inputValue(),'','Old demo opinion draft is removed');
    await freshGate(page,`${detail} [data-id-send-opinion]`,'Restored opinion tab');
    await page.locator('#insights-tabs [data-insight-tab="INS-000060"]').click();await paint(page);
    await freshGate(page,`${detail} [data-id-approval="approve"]`,'Restored approval tab');
    console.log('PASS — Exhausted workflow scenarios and absent alert restore; local record/other store/tabs survive; completed review/sent opinion reset; ordinary filter clearing stays non-destructive');

    for (const key of ['Enter','Space']) {
      await page.evaluate(() => {const row = BpmInsightStore.get('INS-000060');BpmInsightStore.update(row.id,BpmInsightWorkflow.decide(row,{decision:'approve'}));});
      assert.equal((await pending(page)).approval,baseline.approval-1,`${key}: there is real consumed approval progress before keyboard reset`);
      await page.locator('#insights-back').focus();await page.keyboard.press(key);await ready(page);await paint(page);
      assert.deepEqual(await pending(page),baseline,`${key}: native keyboard activation restores workflow data`);
      assert.equal(await page.locator('#insights-back').evaluate(node => node===document.activeElement),true,`${key}: heading retains keyboard focus`);
    }
    await page.setViewportSize({width:320,height:900});await paint(page);
    await page.locator('#insights-tabs [data-insight-tab="INS-000055"]').click();await paint(page);
    await page.locator('#insights-title-label').click();await ready(page);await paint(page);await currentAlert(page,baseline,'Mobile reset');
    assert.ok(await page.locator('#insights-registry-view').isVisible(),'Mobile reset returns to registry');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1),true,'Mobile reset has no page horizontal overflow');
    await page.screenshot({path:path.join(output,'demo-reset-alert-mobile.png')});

    await page.reload();await ready(page);await paint(page);
    assert.deepEqual(await pending(page),baseline,'Restored demonstration state survives reload');
    assert.deepEqual(await read(page,local.id),local,'User-created insight survives reset and browser reload byte-equivalently');
    await page.setViewportSize({width:1440,height:900});await paint(page);await page.locator('#cabinet-nav').click();
    await page.waitForFunction(() => !document.querySelector('#cabinet-panel')?.hidden && document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
    assert.equal(await page.locator(`#cabinet-feed-insights .cabinet-insight-card[data-cabinet-open="${local.id}"]`).count(),1,'Preserved user-created insight is still available in Cabinet');
    assert.deepEqual(await read(page,local.id),local,'Cabinet reads the same preserved record');
    assert.deepEqual(errors,[],'No browser runtime errors');
    console.log(`PASS — Enter/Space, 320px title activation, persisted reset, preserved user-created Cabinet insight. Screenshots: ${output}`);
  } finally {await browser.close();}
}
main().catch(error => {console.error(error);process.exitCode=1;});

/* Qualitative effects contain no numerical or period controls/payload.
 * Runs with isolated browser storage against source or a copied standalone.
 * node test-insight-qualitative-create.cjs [index.html | standalone.html] */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BPM_PLAYWRIGHT||'/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-qualitative-create-'));
let source=path.resolve(process.argv[2]||path.join(__dirname,'index.html'));
if(path.basename(source)!=='index.html'){const copy=path.join(output,'isolated.html');fs.copyFileSync(source,copy);source=copy;}
const metricKeys=['current','target','unit','frequency','period'];
async function choose(page,id,value){
  await page.locator(`#${id}-input`).click();
  await page.locator(`#${id}-list [data-option]`).filter({hasText:value}).first().click();
}
async function chooseKeyboard(page,id,value){
  const input=page.locator(`#${id}-input`);await input.click();await input.fill(value);
  await page.keyboard.press('ArrowDown');
  const before=await page.locator('#insight-create-drawer .ic-scroll').evaluate(element=>element.scrollTop);
  await page.keyboard.press('Enter');
  assert.equal(await input.evaluate(element=>element===document.activeElement),true,`${id}: focus remains on the regenerated field after keyboard selection`);
  assert.equal(await input.getAttribute('aria-expanded'),'false',`${id}: restoring focus does not reopen the options`);
  const after=await page.locator('#insight-create-drawer .ic-scroll').evaluate(element=>({top:element.scrollTop,max:element.scrollHeight-element.clientHeight}));
  assert.ok(Math.abs(after.top-Math.min(before,after.max))<=1,`${id}: focus restoration does not move the form scroll`);
}
async function effectId(effect){return `ic-${await effect.getAttribute('data-effect')}`;}
async function noMetrics(effect){
  assert.equal(await effect.locator('.ic-effect-numbers,.ic-effect-period').count(),0,'Qualitative metric and period blocks are absent, not hidden');
  assert.equal(await effect.locator('[data-effect-field=current],[data-effect-field=target],[id$="-unit-input"],[id$="-frequency-input"],[id$="-period-input"]').count(),0,'No hidden numeric/time fields remain in qualitative markup');
  assert.ok(await effect.locator('[data-effect-field=description]').isVisible(),'Qualitative description remains available');
}
async function review(page,drawer){
  await drawer.locator('.ic-scroll').evaluate(element=>element.scrollTop=element.scrollHeight);
  await page.waitForFunction(()=>{const button=document.querySelector('#insight-create-drawer [data-submit]');return button&&!button.disabled&&!button.hasAttribute('data-scroll-pending');});
}
async function submit(page,drawer){
  await review(page,drawer);await drawer.locator('[data-submit]').click();
  const consent=page.locator('#ic-duplicate-confirm[open]');await consent.waitFor();
  await consent.locator('[data-create-anyway]').click();await drawer.waitFor({state:'hidden'});
}
async function base(page,drawer,title){
  await page.locator('#insights-create').click();
  await drawer.locator('[name=title]').fill(title);
  await drawer.locator('[name=description]').fill('Посетитель исследовательского архива не получает подтверждение завершения запроса.');
  await page.locator('#insight-duplicate-sheet').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await drawer.locator('[name=rootCauses]').fill('В архивной системе отсутствует уведомление о завершении запроса.');
  await drawer.locator('[name=solution]').fill('Добавить подтверждение и понятное уведомление о готовности архивного документа.');
  await page.locator('#ic-process-input').click();
  await page.locator('#ic-process-list [data-option]').first().click();
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',offline:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(()=>{
    let value;window.__creationPayloads=[];
    Object.defineProperty(window,'BpmInsightCreate',{configurable:true,get:()=>value,set:original=>{
      value={...original,create:config=>original.create({...config,onCreate:payload=>{
        window.__creationPayloads.push(structuredClone(payload));return config.onCreate(payload);
      }})};
    }});
  });
  try{
    await page.goto(pathToFileURL(source).href+'#insights');
    await page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
    const drawer=page.locator('#insight-create-drawer');
    await base(page,drawer,'Качественное уведомление архивного запроса');
    const first=drawer.locator('.ic-effect').first();let prefix=await effectId(first);
    await chooseKeyboard(page,`${prefix}-name`,'Повышение клиентского опыта внешнего клиента');
    assert.equal(await page.locator(`#${prefix}-type-input`).inputValue(),'Качественный','Catalog name selects qualitative type');
    await noMetrics(first);
    await first.locator('[data-effect-field=description]').fill('Клиент сразу понимает, что архивный запрос завершен и документ доступен.');
    await chooseKeyboard(page,`${prefix}-name`,'Сокращение операционных расходов без ФОТ');
    assert.equal(await page.locator(`#${prefix}-type-input`).inputValue(),'Количественный','Catalog name restores quantitative type');
    assert.equal(await first.locator('.ic-effect-numbers,.ic-effect-period').count(),2);
    await chooseKeyboard(page,`${prefix}-name`,'Повышение клиентского опыта внешнего клиента');await noMetrics(first);
    await chooseKeyboard(page,`${prefix}-type`,'Количественный');
    assert.equal(await first.locator('.ic-effect-numbers,.ic-effect-period').count(),2,'Changing back restores both quantitative blocks');
    await first.locator('[data-effect-field=current]').fill('нечисловой черновик');
    await first.locator('[data-effect-field=target]').fill('90');
    await choose(page,`${prefix}-unit`,'мин');
    await choose(page,`${prefix}-frequency`,'Единоразово');
    assert.ok(await first.locator('[data-effect-period]').isHidden(),'Quantitative one-time behavior is unchanged');
    await chooseKeyboard(page,`${prefix}-type`,'Качественный');await noMetrics(first);
    await chooseKeyboard(page,`${prefix}-type`,'Количественный');
    assert.equal(await first.locator('[data-effect-field=current]').inputValue(),'нечисловой черновик','Switching types does not erase quantitative draft');
    assert.equal(await page.locator(`#${prefix}-frequency-input`).inputValue(),'Единоразово');
    assert.equal(await page.locator(`#${prefix}-unit-input`).inputValue(),'мин.');
    await chooseKeyboard(page,`${prefix}-name`,'Сокращение операционных расходов без ФОТ');
    assert.equal(await page.locator(`#${prefix}-type-input`).inputValue(),'Количественный');
    await chooseKeyboard(page,`${prefix}-name`,'Повышение качества процесса');
    assert.equal(await page.locator(`#${prefix}-type-input`).inputValue(),'Качественный','Catalog type change redraws controls');
    await noMetrics(first);
    await page.setViewportSize({width:390,height:844});
    await drawer.locator('.ic-scroll').evaluate(element=>element.scrollTop=element.querySelector('.ic-effect').offsetTop-64);
    await page.screenshot({path:path.join(output,'qualitative-create-390.png')});
    const geometry=await first.boundingBox();assert.ok(geometry.x>=0&&geometry.x+geometry.width<=391,'Qualitative card fits mobile');
    await page.setViewportSize({width:1440,height:900});
    await submit(page,drawer);
    const firstPayload=await page.evaluate(()=>window.__creationPayloads[0]);
    assert.equal(firstPayload.effects.length,1);
    assert.equal(firstPayload.effects[0].type,'Качественный');
    for(const key of metricKeys)assert.ok(!Object.hasOwn(firstPayload.effects[0],key),`Qualitative payload omits stale ${key}`);
    const firstRow=await page.evaluate(title=>window.BpmInsightStore.list().find(row=>row.local&&row.title===title),firstPayload.title);
    assert.ok(firstRow,'Pure qualitative insight saves without numeric/time validation');
    for(const key of metricKeys)assert.ok(!Object.hasOwn(firstRow.effects[0],key),`Stored qualitative effect omits ${key}`);
    await page.locator('#insights-back').click();
    await base(page,drawer,'Смешанные эффекты архивного запроса');
    const qualitative=drawer.locator('.ic-effect').first();prefix=await effectId(qualitative);
    await choose(page,`${prefix}-name`,'Повышение клиентского опыта внутреннего клиента');
    await qualitative.locator('[data-effect-field=description]').fill('Сотрудник сразу видит готовность документа и не повторяет архивный запрос.');
    await noMetrics(qualitative);
    await drawer.locator('[data-add-effect]').click();
    const quantitative=drawer.locator('.ic-effect').nth(1),quantPrefix=await effectId(quantitative);
    await choose(page,`${quantPrefix}-name`,'Сокращение операционных расходов без ФОТ');
    await quantitative.locator('[data-effect-field=description]').fill('Сокращение времени обработки одного архивного запроса сотрудником.');
    await review(page,drawer);await drawer.locator('[data-submit]').click();
    assert.ok(await qualitative.locator('[data-effect-error]').isHidden(),'Qualitative effect needs no removed fields');
    assert.match(await quantitative.locator('[data-effect-error]').innerText(),/текущее и целевое/,'Mixed form still requires quantitative values');
    await quantitative.locator('[data-effect-field=current]').fill('240');
    await quantitative.locator('[data-effect-field=target]').fill('240');
    await review(page,drawer);await drawer.locator('[data-submit]').click();
    assert.match(await quantitative.locator('[data-effect-error]').innerText(),/совпадает/,'Quantitative equal-value validation remains intact');
    await quantitative.locator('[data-effect-field=target]').fill('60');
    await choose(page,`${quantPrefix}-unit`,'мин');
    await choose(page,`${quantPrefix}-period`,'Квартал');
    await submit(page,drawer);
    const mixed=await page.evaluate(()=>window.__creationPayloads[1]);
    assert.equal(mixed.effects.length,2);
    for(const key of metricKeys)assert.ok(!Object.hasOwn(mixed.effects[0],key));
    assert.deepEqual(Object.fromEntries(metricKeys.map(key=>[key,mixed.effects[1][key]])),{current:'240',target:'60',unit:'мин.',frequency:'Регулярно',period:'Квартал'},'Quantitative payload is unchanged');
    await page.reload();
    assert.ok(await page.evaluate(title=>window.BpmInsightStore.list().some(row=>row.local&&row.title===title),mixed.title),'Mixed insight survives reload');
    assert.deepEqual(errors,[],'No runtime errors');
    console.log('PASS — qualitative controls and payload absent; pure/mixed creation; catalog and type switching; preserved quantitative draft and validation; persistence and mobile geometry');
    console.log(`Screenshots: ${output}`);
  }catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(`Screenshots: ${output}`);throw error;}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

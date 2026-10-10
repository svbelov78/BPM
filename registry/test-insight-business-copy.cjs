/* Business copy in the insight creation drawer uses actual grey placeholders.
 * Isolated, offline browser regression for source or copied standalone HTML.
 * node test-insight-business-copy.cjs [index.html | standalone.html] */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-insight-business-copy-'));
let source = path.resolve(process.argv[2] || path.join(__dirname, 'index.html'));
if (path.basename(source) !== 'index.html') {
  const isolated = path.join(output, 'isolated.html');
  fs.copyFileSync(source, isolated);
  source = isolated;
}
const sources = ['SberBPM ЦА', 'ТБ', 'Process Mining'];
const mainFields = ['description', 'rootCauses', 'solution'];
const expectedPlaceholders = {
  description:'Опишите проблему или наблюдение: на каком этапе процесса возникает, кого затрагивает и как влияет на бизнес.',
  rootCauses:'Укажите причины возникновения проблемы. При необходимости используйте метод «5 почему».',
  solution:'Опишите предлагаемые изменения и объясните, как они помогут устранить причины проблемы.'
};
const expectedEffects = {
  'Количественный':'Опишите ожидаемое улучшение и способ расчёта количественного эффекта.',
  'Качественный':'Опишите ожидаемые улучшения для клиентов, сотрудников или процесса.'
};
const sample = {title:'Тестовый инсайт', description:'Описание', rootCauses:'Причины', solution:'Решение'};
const wrongQuotes = /["'“”„‟‘’]/u;
const casualCopy = /болит|симптомы|эффекты и цифры|у них|за один раз загрузки/iu;
const ready = page => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');

async function choose(page, id, value) {
  await page.locator(`#${id}-input`).click();
  await page.locator(`#${id}-list [data-option]`).filter({hasText:value}).first().click();
}

async function review(page, drawer) {
  await drawer.locator('.ic-scroll').evaluate(element => element.scrollTop = element.scrollHeight);
  await page.waitForFunction(() => {
    const button = document.querySelector('#insight-create-drawer [data-submit]');
    return button && !button.disabled && !button.hasAttribute('data-scroll-pending');
  });
}

async function appearance(field) {
  return field.evaluate(node => {
    const text = getComputedStyle(node), prompt = getComputedStyle(node, '::placeholder');
    const probe = document.createElement('span');
    node.parentElement.append(probe);
    const token = name => {probe.style.color = `var(${name})`;return getComputedStyle(probe).color;};
    const placeholderColor = token('--placeholder'), textColor = token('--text');
    probe.remove();
    return {
      value:node.value, placeholder:node.getAttribute('placeholder'), shown:node.matches(':placeholder-shown'),
      promptColor:prompt.color, promptOpacity:prompt.opacity, enteredColor:text.color, placeholderColor, textColor,
      maxlength:node.maxLength, required:node.required, ariaRequired:node.getAttribute('aria-required')
    };
  });
}

async function assertPublishedCopy(page, drawer, width) {
  const published = await drawer.evaluate(root => {
    const copy = [root.innerText];
    for (const node of root.querySelectorAll('input,textarea,[title],[aria-label]')) {
      if (node.hidden || node.closest('[hidden]')) continue;
      for (const name of ['placeholder','title','aria-label']) {
        const value = node.getAttribute(name);
        if (value) copy.push(value);
      }
    }
    return copy.join('\n');
  });
  assert.doesNotMatch(published, wrongQuotes, `${width}px: published creation copy uses guillemets`);
  assert.doesNotMatch(published, casualCopy, `${width}px: creation prompts do not contain the former casual wording`);
  const roots = await drawer.locator('[name=rootCauses]').getAttribute('placeholder');
  assert.match(roots, /«5 почему»/u, `${width}px: the root-cause method uses Russian guillemets`);
  for (const name of mainFields) {
    const field = drawer.locator(`[name=${name}]`), idle = await appearance(field);
    assert.equal(idle.value, '', `${width}px ${name}: guidance is not prefilled data`);
    assert.equal(idle.placeholder, expectedPlaceholders[name], `${width}px ${name}: approved business guidance is the actual placeholder`);
    assert.ok(idle.shown, `${width}px ${name}: the empty field displays its placeholder`);
    assert.equal(idle.promptColor, idle.placeholderColor, `${width}px ${name}: placeholder uses Placeholder BPM`);
    assert.equal(idle.promptOpacity, '1', `${width}px ${name}: the browser does not reduce placeholder opacity`);
    assert.notEqual(idle.promptColor, idle.enteredColor, `${width}px ${name}: guidance differs from entered text`);
    assert.equal(idle.maxlength, 5000, `${width}px ${name}: description length limit is unchanged`);
    await field.focus();
    const focused = await appearance(field);
    assert.equal(focused.promptColor, idle.placeholderColor, `${width}px ${name}: focused guidance keeps Placeholder BPM`);
    await field.fill(sample[name]);
    const entered = await appearance(field);
    assert.equal(entered.value, sample[name], `${width}px ${name}: users can enter their own content`);
    assert.equal(entered.shown, false, `${width}px ${name}: entering content removes the placeholder`);
    assert.equal(entered.enteredColor, idle.enteredColor, `${width}px ${name}: entering text preserves the existing text color`);
    assert.equal(entered.placeholder, idle.placeholder, `${width}px ${name}: typing does not replace the guidance`);
    await field.fill('');
    const cleared = await appearance(field);
    assert.ok(cleared.shown, `${width}px ${name}: clearing restores guidance`);
    assert.equal(cleared.promptColor, idle.placeholderColor, `${width}px ${name}: clearing restores Placeholder BPM`);
  }
  const effect = drawer.locator('[data-effect-field=description]').first();
  assert.equal(await effect.evaluate(node => node.maxLength), 4000, `${width}px: effect description length limit is unchanged`);
  assert.equal(await effect.inputValue(), '', `${width}px: effect guidance is not prefilled content`);
  assert.ok(await effect.evaluate(node => node.matches(':placeholder-shown')), `${width}px: effect explanation is a placeholder`);
  assert.equal(await effect.getAttribute('placeholder'), expectedEffects['Количественный'], `${width}px: quantitative effect guidance explains the calculation`);
  const effectId = await drawer.locator('.ic-effect').first().getAttribute('data-effect');
  await choose(page, `ic-${effectId}-type`, 'Качественный');
  assert.equal(await effect.getAttribute('placeholder'), expectedEffects['Качественный'], `${width}px: qualitative effect guidance describes expected improvements`);
  assert.equal(await effect.inputValue(), '', `${width}px: switching to qualitative does not prefill the explanation`);
  assert.equal(await drawer.locator('.ic-effect-numbers').count(), 0, `${width}px: qualitative effects still omit quantitative controls`);
  await choose(page, `ic-${effectId}-type`, 'Количественный');
  assert.equal(await effect.getAttribute('placeholder'), expectedEffects['Количественный'], `${width}px: quantitative guidance returns after switching type`);
  for (const name of ['current','target']) {
    const numeric = drawer.locator(`[data-effect-field=${name}]`).first();
    assert.equal(await numeric.getAttribute('placeholder'), 'Введите значение', `${width}px ${name}: numeric guidance requests input`);
    assert.equal(await numeric.inputValue(), '', `${width}px ${name}: numeric guidance is not a supplied value`);
    assert.ok(await numeric.evaluate(node => node.matches(':placeholder-shown')), `${width}px ${name}: numeric guidance is a real placeholder`);
  }
}

async function assertRequirements(drawer, sourceName, width) {
  const complete = sourceName !== 'Process Mining';
  for (const name of ['title', ...mainFields]) {
    const field = drawer.locator(`[name=${name}]`), required = !['rootCauses','solution'].includes(name) || complete;
    assert.equal(await field.evaluate(node => node.required), required, `${width}px ${sourceName} ${name}: native required is unchanged`);
    assert.equal(await field.getAttribute('aria-required'), String(required), `${width}px ${sourceName} ${name}: required is announced`);
  }
  for (const id of ['ic-source','ic-process','ic-bank']) {
    const required = id !== 'ic-bank' || sourceName === 'ТБ';
    assert.equal(await drawer.locator(`#${id}-input`).evaluate(node => node.required), required, `${width}px ${sourceName} ${id}: source/process/bank rules are unchanged`);
  }
  assert.equal(await drawer.locator('#ic-bank-field').isHidden(), sourceName !== 'ТБ', `${width}px ${sourceName}: territorial-bank visibility follows source`);
  assert.equal(await drawer.locator('#ic-effects-requirement').isHidden(), !complete, `${width}px ${sourceName}: effect requirement follows source`);
  assert.equal(await drawer.locator('[data-remove-effect]').first().isDisabled(), complete, `${width}px ${sourceName}: the mandatory single effect cannot be removed`);
}

async function takeScreenshots(page, drawer, width) {
  await drawer.locator('.ic-scroll').evaluate(scroll => {
    const section = scroll.querySelector('.ic-description');
    scroll.scrollTop += section.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 8;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const box = await drawer.boundingBox();
  assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `${width}px: creation drawer fits the viewport`);
  for (const name of mainFields) {
    const field = await drawer.locator(`[name=${name}]`).boundingBox();
    assert.ok(field.x >= 0 && field.x + field.width <= width + 1, `${width}px ${name}: textarea has no horizontal overflow`);
  }
  await page.screenshot({path:path.join(output, `description-${width}.png`)});
  await drawer.locator('.ic-description').screenshot({path:path.join(output, `description-fields-${width}.png`)});
}

async function runWidth(browser, width) {
  const context = await browser.newContext({viewport:{width,height:width === 390 ? 844 : 900}, reducedMotion:'reduce', offline:true});
  const page = await context.newPage(), errors = [], remoteRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {if (/^https?:/u.test(request.url())) remoteRequests.push(request.url());});
  try {
    await page.goto(pathToFileURL(source).href + '#insights');
    await ready(page);
    await page.locator('#insights-create').click();
    const drawer = page.locator('#insight-create-drawer');
    await drawer.waitFor({state:'visible'});
    await assertPublishedCopy(page, drawer, width);
    await takeScreenshots(page, drawer, width);
    await page.locator('#ic-source-input').click();
    assert.deepEqual(await page.locator('#ic-source-list [data-option]').evaluateAll(nodes => nodes.map(node => node.dataset.option)), sources, `${width}px: supported creation sources are unchanged`);
    await page.keyboard.press('Escape');

    // Editing and changing source preserve user-entered data, never substitute guidance.
    for (const [name, value] of Object.entries(sample)) await drawer.locator(`[name=${name}]`).fill(value);
    for (const sourceName of ['SberBPM ЦА','Process Mining','ТБ']) {
      await choose(page, 'ic-source', sourceName);
      await assertRequirements(drawer, sourceName, width);
      for (const [name, value] of Object.entries(sample)) assert.equal(await drawer.locator(`[name=${name}]`).inputValue(), value, `${width}px ${sourceName} ${name}: entered data survives a source change`);
    }
    for (const name of Object.keys(sample)) await drawer.locator(`[name=${name}]`).fill('');
    for (const sourceName of ['ТБ','SberBPM ЦА','Process Mining']) {
      await choose(page, 'ic-source', sourceName);
      await assertRequirements(drawer, sourceName, width);
      await review(page, drawer);
      await drawer.locator('[data-submit]').click();
      for (const name of ['title','description','process']) assert.ok(await drawer.locator(`[data-error=${name}]`).isVisible(), `${width}px ${sourceName}: missing ${name} still fails validation`);
      for (const name of ['rootCauses','solution']) {
        const complete = sourceName !== 'Process Mining';
        assert.equal(await drawer.locator(`[data-error=${name}]`).isVisible(), complete, `${width}px ${sourceName}: missing ${name} follows conditional validation`);
        assert.equal(await drawer.locator(`[name=${name}]`).getAttribute('aria-invalid'), String(complete), `${width}px ${sourceName}: validation remains accessible`);
      }
      assert.equal(await drawer.locator('[data-effect-error]').isVisible(), sourceName !== 'Process Mining', `${width}px ${sourceName}: untouched effect keeps existing conditional validation`);
    }
    assert.equal(await page.locator('#ic-duplicate-confirm[open]').count(), 0, `${width}px: missing required data cannot reach duplicate confirmation`);
    assert.equal(await page.evaluate(() => window.BpmInsightStore.list().some(row => row.local && row.title === 'Тестовый инсайт')), false, `${width}px: copy tests create no insight records`);
    await drawer.locator('[data-close]').first().click();
    await page.locator('.ic-discard-dialog[open] [data-discard]').click();
    await drawer.waitFor({state:'hidden'});
    await page.locator('#insights-create').click();
    for (const name of mainFields) assert.equal(await drawer.locator(`[name=${name}]`).inputValue(), '', `${width}px ${name}: reopening uses empty fields, not placeholder data`);
    assert.equal(await page.locator('#ic-source-input').inputValue(), 'ТБ', `${width}px: a discarded form reopens with the original default source`);
    assert.deepEqual(errors, [], `${width}px: no runtime errors`);
    assert.deepEqual(remoteRequests, [], `${width}px: the test is fully local and offline`);
    console.log(`PASS — ${width}px: business guidance, guillemets, actual grey placeholders, typing/clearing, conditional requirements and validation`);
  } catch (error) {
    await page.screenshot({path:path.join(output, `failure-${width}.png`)}).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  try {
    for (const width of [1440,390]) await runWidth(browser, width);
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(`Screenshots: ${output}`);console.error(error);process.exitCode = 1;});

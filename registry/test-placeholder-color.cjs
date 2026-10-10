/* Placeholder BPM is consistent across native fields and empty comboboxes.
 * Offline, isolated browser coverage of desktop/mobile source or standalone.
 * node test-placeholder-color.cjs [index.html | standalone.html] */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-placeholder-color-'));
let source = path.resolve(process.argv[2] || path.join(__dirname, 'index.html'));
if (path.basename(source) !== 'index.html') {
  const isolated = path.join(output, 'isolated.html');
  fs.copyFileSync(source, isolated);
  source = isolated;
}
const url = pathToFileURL(source).href;
const ready = (page, id) => page.waitForFunction(id => document.getElementById(id)?.getAttribute('aria-busy') === 'false', id);
const specialTypes = ['extended-access','role-management','process-result-approval','business-description-checklist','metric-inapplicability','bulk-metric-inapplicability','business-description-update','insight'];

async function sweep(page, label) {
  const result = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--placeholder)';document.body.append(probe);
    const token = getComputedStyle(probe).color;probe.remove();
    const fields = [...document.querySelectorAll('input[placeholder],textarea[placeholder]')].map(node => {
      const prompt = getComputedStyle(node,'::placeholder'), text = getComputedStyle(node);
      return {id:node.id || node.name, tag:node.tagName, placeholder:node.getAttribute('placeholder'), value:node.value,
        color:prompt.color, fill:prompt.webkitTextFillColor, opacity:prompt.opacity, enteredColor:text.color,
        enteredFill:text.webkitTextFillColor, disabled:node.disabled, combo:node.getAttribute('role') === 'combobox'};
    });
    const pseudo = [...document.querySelectorAll('.tf-placeholder,.tf-deadline-note.is-empty')].map(node => ({text:node.textContent,color:getComputedStyle(node).color}));
    return {token, fields, pseudo};
  });
  assert.equal(result.token, 'rgb(196, 196, 196)', `${label}: Placeholder BPM retains #C4C4C4`);
  assert.ok(result.fields.length, `${label}: native placeholders are present`);
  for (const field of result.fields) {
    assert.equal(field.color, result.token, `${label} ${field.id}: native guidance uses Placeholder BPM`);
    assert.equal(field.fill, result.token, `${label} ${field.id}: disabled text-fill cannot override guidance`);
    assert.equal(field.opacity, '1', `${label} ${field.id}: native guidance opacity is consistent`);
  }
  for (const pseudo of result.pseudo) assert.equal(pseudo.color, result.token, `${label}: deadline guidance uses Placeholder BPM`);
  return result.fields;
}

function stylesheetAudit() {
  // Local file:// stylesheets have an opaque CSSOM origin in Chrome. Audit
  // their real text, or the embedded style blocks of the relocated build.
  const html = fs.readFileSync(source,'utf8');
  let sheets;
  if (path.basename(source) === 'index.html') {
    sheets = [...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/giu)].map(match => fs.readFileSync(path.resolve(path.dirname(source),match[1]),'utf8'));
  } else {
    sheets = [];
    for (let position = 0; (position = html.indexOf('<style',position)) !== -1;) {
      const start = html.indexOf('>',position) + 1, end = html.indexOf('</style>',start);
      assert.ok(start > 0 && end >= start, 'Every embedded style block is complete');
      sheets.push(html.slice(start,end));position = end + 8;
    }
  }
  const rules = [];
  // Tokenize braces without backtracking through embedded font data, which
  // occupies several megabytes in the portable standalone document.
  for (const css of sheets) {
    const pieces = css.split(/[{}]/u);
    for (let index = 0; index < pieces.length - 1; index++) {
      if (!pieces[index].includes('::placeholder')) continue;
      const property = name => pieces[index + 1].match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`,'u'))?.[1].trim() || '';
      rules.push({selector:pieces[index].trim(),color:property('color'),opacity:property('opacity'),fill:property('-webkit-text-fill-color')});
    }
  }
  assert.ok(rules.length > 8, 'The audit includes shared and module-specific placeholder declarations');
  for (const rule of rules) {
    if (rule.color) assert.equal(rule.color, 'var(--placeholder)', `${rule.selector}: no module overrides the placeholder token`);
    if (rule.opacity) assert.equal(rule.opacity, '1', `${rule.selector}: no module fades native guidance`);
    if (rule.fill) assert.equal(rule.fill, 'var(--placeholder)', `${rule.selector}: placeholder fill uses the same token`);
  }
}

async function fieldStates(page, locator, label) {
  const original = await locator.evaluate(node => ({value:node.value, placeholder:node.getAttribute('placeholder'), disabled:node.disabled,
    color:getComputedStyle(node).color, fill:getComputedStyle(node).webkitTextFillColor,
    labelColor:node.closest('.field')?.querySelector('.internal-label') ? getComputedStyle(node.closest('.field').querySelector('.internal-label')).color : null}));
  assert.equal(original.value, '', `${label}: empty guidance is not prefilled data`);
  await locator.focus();await sweep(page, `${label} focused`);
  await locator.fill('Проверка');
  const typed = await locator.evaluate(node => ({value:node.value, shown:node.matches(':placeholder-shown'), color:getComputedStyle(node).color, fill:getComputedStyle(node).webkitTextFillColor}));
  assert.equal(typed.value, 'Проверка', `${label}: typing remains available`);
  assert.equal(typed.shown, false, `${label}: typing hides the native placeholder`);
  assert.equal(typed.color, original.color, `${label}: entered text color stays unchanged`);
  assert.equal(typed.fill, original.fill, `${label}: entered text fill stays unchanged`);
  await locator.fill('');
  const disabled = await locator.evaluate(node => {
    const wrapper = node.closest('.field'), invalid = node.getAttribute('aria-invalid');
    node.disabled = true;node.setAttribute('aria-invalid','true');wrapper?.classList.add('error');
    const prompt = getComputedStyle(node,'::placeholder');
    // A native twin without guidance proves the new pseudo-element rule does
    // not recolor entered values, even in browser-specific disabled styling.
    const twin = node.cloneNode();twin.removeAttribute('id');twin.removeAttribute('placeholder');twin.value = 'Проверка';node.after(twin);
    const text = getComputedStyle(node), plain = getComputedStyle(twin);
    const result = {prompt:prompt.color,fill:prompt.webkitTextFillColor,opacity:prompt.opacity,
      textColor:text.color,plainColor:plain.color,textFill:text.webkitTextFillColor,plainFill:plain.webkitTextFillColor};
    twin.remove();wrapper?.classList.remove('error');node.disabled = false;
    if (invalid === null) node.removeAttribute('aria-invalid');else node.setAttribute('aria-invalid',invalid);
    return result;
  });
  assert.equal(disabled.prompt, 'rgb(196, 196, 196)', `${label}: disabled/error guidance keeps Placeholder BPM`);
  assert.equal(disabled.fill, 'rgb(196, 196, 196)', `${label}: disabled/error guidance has its own text fill`);
  assert.equal(disabled.opacity, '1', `${label}: disabled/error native opacity remains 1`);
  assert.equal(disabled.textColor, disabled.plainColor, `${label}: guidance does not change disabled value color`);
  assert.equal(disabled.textFill, disabled.plainFill, `${label}: guidance does not change disabled value fill`);
  const restored = await locator.evaluate(node => ({value:node.value, placeholder:node.getAttribute('placeholder'), shown:node.matches(':placeholder-shown'),
    labelColor:node.closest('.field')?.querySelector('.internal-label') ? getComputedStyle(node.closest('.field').querySelector('.internal-label')).color : null}));
  assert.equal(restored.value, '', `${label}: clearing restores an empty field`);
  assert.equal(restored.placeholder, original.placeholder, `${label}: field guidance stays unchanged`);
  assert.equal(restored.labelColor, original.labelColor, `${label}: labels keep their existing color`);
  assert.ok(restored.shown, `${label}: clearing restores the native placeholder`);
}

async function structurePagination(page) {
  await page.locator('#structure-paths-tab').click();await ready(page,'structure-list');
  const sample = await page.evaluate(() => {
    for (const root of window.BPM_STRUCTURE_PATHS.roots) for (const division of root.children) for (const product of division.children) {
      const row = product.records.find(record => record.linkedProcesses.length === 92);
      if (row) return {chain:[root.id,division.id,product.id],id:row.id};
    }
  });
  assert.ok(sample, 'Real source provides a paginated linked-process list');
  for (const id of sample.chain) await page.locator(`[data-expand="${id}"]`).click();
  const toggle = page.locator(`[id="panel-${sample.chain[2]}"] [data-structure-path="${sample.id}"]`);
  await toggle.click();
  const panel = page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`), input = panel.locator('.structure-pagination .select-input');
  const before = await input.inputValue();assert.ok(before, 'Pagination retains its selected page size as a real value');
  await input.click();await sweep(page,'opened structure pagination');
  assert.equal(await input.inputValue(), '', 'Opening pagination exposes native search guidance');
  await page.keyboard.press('Escape');
  assert.equal(await input.inputValue(), before, 'Closing pagination restores the selected value');
}

async function runWidth(browser, width) {
  const context = await browser.newContext({viewport:{width,height:width === 390 ? 844 : 900},offline:true,reducedMotion:'reduce'});
  const page = await context.newPage(), errors = [], remote = [], counts = {fields:0,disabled:0,textareas:0,combos:0};
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {if (/^https?:/u.test(request.url())) remote.push(request.url());});
  async function collect(label) {
    const fields = await sweep(page,`${width}px ${label}`);
    counts.fields += fields.length;counts.disabled += fields.filter(field => field.disabled).length;
    counts.textareas += fields.filter(field => field.tag === 'TEXTAREA').length;counts.combos += fields.filter(field => field.combo).length;
  }
  try {
    await page.goto(url + '#cabinet');await page.locator('#cabinet-search').waitFor({state:'attached'});
    await collect('cabinet');
    if (await page.locator('#cabinet-search').isVisible()) await fieldStates(page,page.locator('#cabinet-search'),`${width}px cabinet search`);
    await page.goto(url + '#main');await ready(page,'results');
    stylesheetAudit();
    await collect('registry');await fieldStates(page,page.locator('#registry-search'),`${width}px registry search`);
    if (width < 768) await page.locator('#mobile-filters-toggle').click();
    await page.locator('#owner-select-input').click();await collect('empty/open registry combobox');await page.keyboard.press('Escape');
    await ready(page,'results');
    await page.screenshot({path:path.join(output,`registry-${width}.png`)});
    await page.locator('#structure-toggle').click();await ready(page,'structure-list');await collect('structure');
    await structurePagination(page);
    await page.goto(url + '#tasks');await ready(page,'tasks-results');await collect('task registry');
    await page.locator('#tasks-create').click();await page.locator('[data-task-type=standard]').click();
    await page.locator('#task-flow[open]').waitFor();await collect('standard task form');
    await fieldStates(page,page.locator('#tf-title'),`${width}px standard task input`);
    await fieldStates(page,page.locator('#tf-description'),`${width}px standard task textarea`);
    await page.locator('#task-flow [data-tf-action=close]').first().click();await page.locator('#task-flow[open]').waitFor({state:'hidden'});
    for (const type of specialTypes) {
      await page.locator('#tasks-create').click();await page.locator(`[data-task-type="${type}"]`).click();
      await page.locator('#special-task-flow[open][data-mode=create]').waitFor();await collect(`${type} task form`);
      await page.keyboard.press('Escape');await page.locator('#special-task-flow[open]').waitFor({state:'hidden'});
    }
    await page.goto(url + '#insights');await ready(page,'insights-results');await collect('insight registry');
    await page.locator('#insights-create').click();const drawer = page.locator('#insight-create-drawer');await drawer.waitFor({state:'visible'});
    await collect('insight creation');await fieldStates(page,drawer.locator('[name=title]'),`${width}px insight input`);
    await fieldStates(page,drawer.locator('[name=rootCauses]'),`${width}px insight textarea`);
    await drawer.locator('#ic-process-input').click();await collect('empty/open creation combobox');await page.keyboard.press('Escape');
    await drawer.locator('.ic-scroll').evaluate(scroll => scroll.scrollTop = scroll.scrollHeight);
    await page.waitForFunction(() => {const button = document.querySelector('#insight-create-drawer [data-submit]');return button && !button.disabled && !button.hasAttribute('data-scroll-pending');});
    await drawer.locator('[data-submit]').click();assert.ok(await drawer.locator('[name=title][aria-invalid=true]').isVisible(),'Creation still validates missing input');
    await collect('creation validation errors');
    await drawer.locator('.ic-scroll').evaluate(scroll => {const section = scroll.querySelector('.ic-description');scroll.scrollTop += section.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 8;});
    await drawer.locator('.ic-description').screenshot({path:path.join(output,`insight-fields-${width}.png`)});
    assert.ok(counts.fields > 80 && counts.textareas > 5 && counts.combos > 30 && counts.disabled > 0, `${width}px: broad coverage includes native, textarea, combobox and actual disabled fields`);
    assert.deepEqual(errors, [], `${width}px: no browser script errors`);
    assert.deepEqual(remote, [], `${width}px: no network requests`);
    console.log(`PASS — ${width}px: Placeholder BPM across registries, pagination, insight form, standard/eight special forms; focus/type/clear/disabled/error and untouched entered values (${counts.fields} field checks)`);
  } catch (error) {
    await page.screenshot({path:path.join(output,`failure-${width}.png`)}).catch(() => {});throw error;
  } finally {await context.close();}
}

(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {for (const width of [1440,390]) await runWidth(browser,width);console.log(`Screenshots: ${output}`);}
  finally {await browser.close();}
})().catch(error => {console.error(`Screenshots: ${output}`);console.error(error);process.exitCode = 1;});

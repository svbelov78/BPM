/* Average-efficiency regression coverage.
 * node registry/test-structure-average.cjs [URL] [--unit] [--geometry-only]
 * --geometry-only runs the focused bar-center browser regression without the
 * existing interaction, sorting, palette, or broad layout browser suites.
 * BPM_URL overrides the default localhost:4180 preview. Without an explicit
 * URL, a missing preview falls back to registry/index.html.
 * BPM_PLAYWRIGHT may point to an alternative Playwright installation.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const context = {window: {}};
for (const name of ['structure-source.js', 'structure-data.js', 'card-visuals.js', 'structure-charts.js']) vm.runInNewContext(read(name), context);
const {average, renderAverage, writeAverage} = context.window.BPMStructureCharts;
const close = (actual, expected, label, tolerance = 0.05) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const report = label => console.log(`PASS — ${label}`);
const normalize = value => String(value).toLocaleLowerCase('ru').replace(/ё/g, 'е');
const expectedTone = value => value === null ? 'unrated' : value <= 45 ? 'red' : value <= 65 ? 'yellow' : value <= 85 ? 'gray' : 'green';

// Independent record-level oracle: averages must never be reconstructed from
// bucket midpoints or from an unweighted mean of child-node averages.
function expectedAverage(records) {
  const ids = new Set();
  const unique = records.filter(row => {
    if (row.id == null) return true;
    if (ids.has(row.id)) return false;
    ids.add(row.id);
    return true;
  });
  const assessed = unique.filter(row => Number.isFinite(row.efficiency) && row.efficiency >= 0 && row.efficiency <= 100);
  const value = assessed.length ? assessed.reduce((sum, row) => sum + row.efficiency, 0) / assessed.length : null;
  return {value, score: value === null ? null : Math.round(value), assessed: assessed.length, total: unique.length, unassessed: unique.length - assessed.length};
}

function assertAverage(records, expected, label) {
  const actual = average(records);
  for (const field of ['score', 'assessed', 'total', 'unassessed']) assert.equal(actual[field], expected[field], `${label}: ${field}`);
  if (expected.value === null) assert.equal(actual.value, null, `${label}: no fabricated mean`);
  else close(actual.value, expected.value, `${label}: exact mean`, 1e-10);
}

assert.equal(typeof average, 'function', 'The chart module exposes average(records)');
assert.equal(typeof renderAverage, 'function', 'The chart module exposes renderAverage(options)');
const samples = [
  ['unassessed excluded', [{id: 'a', efficiency: 100}, {id: 'b', efficiency: 50}, {id: 'c', efficiency: null}], {value: 75, score: 75, assessed: 2, total: 3, unassessed: 1}],
  ['zero assessed', [{id: 'a', efficiency: 0}, {id: 'b', efficiency: 100}], {value: 50, score: 50, assessed: 2, total: 2, unassessed: 0}],
  ['single zero', [{id: 'a', efficiency: 0}], {value: 0, score: 0, assessed: 1, total: 1, unassessed: 0}],
  ['single maximum', [{id: 'a', efficiency: 100}], {value: 100, score: 100, assessed: 1, total: 1, unassessed: 0}],
  ['integer display only', [{id: 'a', efficiency: 49.2}, {id: 'b', efficiency: 50}], {value: 49.6, score: 50, assessed: 2, total: 2, unassessed: 0}],
  ['duplicate entity', [{id: 'a', efficiency: 100}, {id: 'a', efficiency: 100}, {id: 'b', efficiency: 0}], {value: 50, score: 50, assessed: 2, total: 2, unassessed: 0}],
  ['unidentified records stay independent', [{efficiency: 0}, {efficiency: 100}, {efficiency: null}], {value: 50, score: 50, assessed: 2, total: 3, unassessed: 1}],
  ['empty node', [], {value: null, score: null, assessed: 0, total: 0, unassessed: 0}],
  ['all unassessed', [{id: 'a', efficiency: null}, {id: 'b', efficiency: null}], {value: null, score: null, assessed: 0, total: 2, unassessed: 2}],
  ['invalid values excluded, never clamped or coerced', [-1, 101, Infinity, -Infinity, NaN, '50', null, undefined, 25].map((efficiency, id) => ({id, efficiency})), {value: 25, score: 25, assessed: 1, total: 9, unassessed: 8}]
];
for (const [label, records, expected] of samples) assertAverage(records, expected, label);
const assessedRecords = samples[0][1];
for (const done of [false, true]) {
  const markup = renderAverage({id: 'sample" onmouseover="bad()', records: assessedRecords, done});
  assert.match(markup, /data-average-chart="sample&quot; onmouseover=&quot;bad\(\)"/, 'The node ID is escaped');
  assert.match(markup, /data-average-value="75"/);
  assert.match(markup, /class="[^"]*structure-average[^\"]*efficiency/);
  assert.ok(markup.includes(context.window.BpmCardVisuals.glyph(75, false, {color: 'blue'})), 'The average reuses the standard efficiency glyph');
  assert.match(markup, /class="efficiency-value"/);
  assert.match(markup, /data-average-tone="gray"/);
  assert.doesNotMatch(markup, /structure-average-badge|structure-average-scale|--average-center/, 'The average has no old colored badge or rail');
  assert.match(markup, /<span class="percent">%<\/span>/, 'The average displays the standard percent suffix');
  assert.match(markup, new RegExp(`data-average-number>${done ? 75 : 0}</span>`), 'The counter remains an integer from its initial zero to its final value');
  assert.match(markup, /Средняя эффективность: 75%\./, 'Tooltip and accessible label use integer percentages');
  assert.match(markup, /aria-label="[^"]*75/);
  assert.match(markup, /title="[^"]*75/);
  assert.match(markup, /data-average-number/);
  assert.ok(!markup.includes('NaN') && !markup.includes('Infinity'), 'Generated geometry is finite');
}
const emptyMarkup = renderAverage({id: 'empty', records: [], done: true});
assert.match(emptyMarkup, /data-average-value=""/, 'Unassessed nodes have no numeric target');
assert.match(emptyMarkup, /data-average-tone="unrated"/);
assert.match(emptyMarkup, /data-average-number>—<\/span>/);
assert.doesNotMatch(emptyMarkup, /class="percent"/, 'Unassessed nodes do not show a misleading percent suffix');
assert.ok(!emptyMarkup.includes('NaN') && !emptyMarkup.includes('Infinity'));
for (const value of [0, 49.4, 49.5, 99.5, 100]) {
  const markup = renderAverage({id: 'integer-percent', records: [{efficiency: value}], done: true});
  assert.match(markup, new RegExp(`data-average-number>${Math.round(value)}</span><span class="percent">%</span>`));
  assert.doesNotMatch(markup.match(/aria-label="([^"]*)"/)[1], /\d[,.]\d/, 'No decimal digits appear in the accessible label or tooltip');
  assert.doesNotMatch(markup, /class="fraction"/, 'No fractional span is rendered');
}
const animatedNumber = {textContent: ''};
const animatedChart = {dataset: {averageValue: '63'}, querySelector: () => animatedNumber};
for (const [progress, expected] of [[0, '0'], [0.5, '32'], [1, '63']]) {
  writeAverage(animatedChart, progress);
  assert.equal(animatedNumber.textContent, expected, 'Animation only changes the integer; the percent sibling stays intact');
}
for (const [value, tone] of [[0, 'red'], [45, 'red'], [45.1, 'yellow'], [65, 'yellow'], [65.1, 'gray'], [85, 'gray'], [85.1, 'green'], [100, 'green'], [null, 'unrated']]) {
  // Values just above a boundary round down to the boundary on screen. The
  // color still belongs to the higher band because it uses the exact mean.
  const records = value === null ? [{id: 'unassessed', efficiency: null}] : [{id: 'first', efficiency: value - (value > 0 && value < 100 ? 0.1 : 0)}, {id: 'second', efficiency: value + (value > 0 && value < 100 ? 0.1 : 0)}];
  for (const done of [false, true]) {
    const markup = renderAverage({id: `threshold-${value}`, records, done});
    const rawMean = expectedAverage(records).value;
    assert.match(markup, new RegExp(`data-average-tone="${tone}"`), `Mean ${value} uses ${tone}, including before its counter animates`);
    assert.match(markup, new RegExp(`data-average-value="${value === null ? '' : Math.round(value)}"`));
    assert.ok(markup.includes(context.window.BpmCardVisuals.glyph(rawMean, false, {color: tone === 'gray' ? 'blue' : tone})), `Mean ${value} retains the standard sphere and its unrounded curtain position`);
  }
}
for (const [value, color] of [[0, 'red'], [45, 'yellow'], [65, 'blue'], [85, 'green'], [100, 'green']]) {
  assert.match(context.window.BpmCardVisuals.glyph(value), new RegExp(`efficiency-${color}(?:\\s|\")`), 'Existing percentage glyph boundaries are unchanged');
}
for (const table of [false, true]) {
  const markup = context.window.BpmCardVisuals.efficiency({efficiency: 59.4, delta: 2}, table);
  assert.match(markup, /class="percent">%<\/span>/, 'Existing card/table values retain their percentage sign');
  assert.match(markup, /class="fraction">,4<\/span>/, 'Existing card/table values retain their decimal fraction');
  assert.match(markup, /Эффективность 59,4 процентов/, 'Existing percentage accessible labels are unchanged');
}

const modelNames = {processes: 'BPM_STRUCTURE', paths: 'BPM_STRUCTURE_PATHS'};
let sourceNodes = 0;
for (const modelName of Object.values(modelNames)) {
  const model = context.window[modelName];
  for (const node of model.nodes) {
    assertAverage(node.records, expectedAverage(node.records), `${modelName}/${node.kind}/${node.name}`);
    if (node.children.length) assertAverage(node.children.flatMap(child => child.records), expectedAverage(node.records), `${modelName}/${node.id}: cross-product deduplication`);
    sourceNodes++;
  }
}
report(`pure averages: zero/null/invalid/duplicate records, unrounded color boundaries, escaped markup, and exact means for ${sourceNodes} source nodes`);

function expectedNodes(entity, query = '', model = context.window[modelNames[entity]]) {
  const result = new Map(), needle = normalize(query);
  function visit(node, ancestors = []) {
    const names = [...ancestors, node.name];
    let rows;
    if (node.kind === 'product') {
      rows = node.records.filter(row => !needle || normalize(`${names.join(' ')} ${row.title} ${row.code || ''} ${row.number} ${(row.owners || [row.owner]).join(' ')} ${row.products?.join(' ') || ''}`).includes(needle));
      if (!rows.length && (node.records.length || (needle && !normalize(names.join(' ')).includes(needle)))) return null;
    } else {
      const children = node.children.map(child => visit(child, names)).filter(Boolean);
      if (!children.length) return null;
      rows = [...new Map(children.flat().map(row => [row.id, row])).values()];
    }
    result.set(node.id, expectedAverage(rows));
    return rows;
  }
  for (const root of model.roots) visit(root);
  return result;
}

if (!process.argv.includes('--unit')) runBrowser().catch(error => {console.error(error); process.exitCode = 1;});

async function runBrowser() {
  const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const explicitURL = process.argv.slice(2).find(argument => !argument.startsWith('--')) || process.env.BPM_URL;
  const fileURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
  let url = explicitURL || 'http://127.0.0.1:4180/';
  if (!explicitURL) {
    try { const response = await fetch(url); if (!response.ok) url = fileURL; }
    catch { url = fileURL; }
  }
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    if (process.argv.includes('--geometry-only')) {
      await barCenterAlignmentFlow(browser, url);
      return;
    }
    await glyphPaletteFlow(browser, url);
    await mainFlow(browser, url);
    await sortingFixtureFlow(browser, url);
    const geometry = await Promise.allSettled([1920, 1440, 1404, 788, 390].map(width => responsiveFlow(browser, url, width)));
    const errors = geometry.filter(item => item.status === 'rejected').map(item => item.reason.stack || String(item.reason));
    assert.equal(errors.length, 0, errors.join('\n\n'));
    report('reduced motion, nested owner/average/segment columns, control containment and no page overflow at 1920/1440/1404/788/390px');
    await barCenterAlignmentFlow(browser, url);
  } finally { await browser.close(); }
}

async function ready(page) {
  await page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
}

async function reload(page, action) {
  await action();
  await page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'true');
  await ready(page);
}

async function enter(page, url) {
  await page.goto(url);
  await page.locator('#structure-toggle').click();
  assert.equal(await page.locator('#structure-list').getAttribute('aria-busy'), 'true', 'Structure entry keeps its loading phase');
}

async function checkMeans(page, entity, query = '', final = false) {
  const expected = expectedNodes(entity, query);
  const actual = await averageMetrics(page);
  assert.ok(actual.length > 0, `${entity}: average charts are rendered`);
  for (const item of actual) {
    const wanted = expected.get(item.id);
    assert.ok(wanted, `${entity}: ${item.id} belongs to the filtered tree`);
    assert.equal(item.target, wanted.score === null ? '' : String(wanted.score), `${entity}: ${item.id} uses its current records`);
    assert.equal(item.tone, expectedTone(wanted.value), `${entity}: ${item.id} uses the unrounded mean's color band`);
    assert.ok(item.label && item.title, 'The average has both an accessible description and tooltip');
    assertStandardAverage(item);
    if (wanted.value !== null) close(Number(item.glyphValue), wanted.value, 'The sphere curtain uses the exact mean', 1e-10);
    if (wanted.score !== null) {
      assert.ok(item.label.includes(String(wanted.score)), 'The accessible label includes the result');
      if (final) {
        assert.equal(item.number, String(wanted.score), 'Final displayed averages are integers');
      }
    }
  }
  const roots = Array.from(context.window[modelNames[entity]].roots).filter(root => expected.has(root.id)).map(root => root.id).sort();
  const renderedRoots = await page.locator('#structure-list > .structure-node').evaluateAll(elements => elements.map(element => element.dataset.node).sort());
  assert.deepEqual(renderedRoots, roots, 'The average check covers the current filtered root set');
}

async function averageMetrics(page, selector = '[data-average-chart]') {
  return page.locator(selector).evaluateAll(elements => elements.map(element => {
    const glyph = element.querySelector('.bpm-efficiency-glyph'), sphere = glyph.querySelector('.efficiency-sphere');
    const number = element.querySelector('[data-average-number]'), curtain = glyph.querySelector('.efficiency-curtain');
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element), numberStyle = getComputedStyle(number);
    const glyphRect = glyph.getBoundingClientRect(), sphereRect = sphere.getBoundingClientRect(), sphereStyle = getComputedStyle(sphere);
    const curtainRect = curtain?.getBoundingClientRect();
    return {
      id: element.dataset.averageChart, target: element.dataset.averageValue, tone: element.dataset.averageTone,
      number: number.textContent.trim(), text: element.textContent, hasPercent: Boolean(element.querySelector('.percent')),
      label: element.getAttribute('aria-label'), title: element.getAttribute('title'),
      efficiency: element.classList.contains('efficiency'), glyphClass: glyph.className, glyphValue: glyph.dataset.efficiency,
      width: rect.width, height: rect.height, oldBadge: Boolean(element.querySelector('.structure-average-badge,.structure-average-scale')),
      centerVariable: style.getPropertyValue('--average-center').trim(),
      color: numberStyle.color, background: style.backgroundColor, gradient: style.backgroundImage,
      border: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      shadow: style.boxShadow, textShadow: numberStyle.textShadow,
      backdrop: style.backdropFilter || style.webkitBackdropFilter || 'none', transform: style.transform,
      fontSize: numberStyle.fontSize, lineHeight: numberStyle.lineHeight, weight: numberStyle.fontWeight,
      glyphWidth: glyphRect.width, glyphHeight: glyphRect.height, sphereWidth: sphereRect.width, sphereHeight: sphereRect.height,
      sphereRadius: sphereStyle.borderRadius, sphereColor: sphereStyle.backgroundColor, sphereGradient: sphereStyle.backgroundImage,
      curtain: curtain ? {left: curtainRect.left - glyphRect.left, top: curtainRect.top - glyphRect.top, width: curtainRect.width, height: curtainRect.height, blur: getComputedStyle(curtain).backdropFilter || getComputedStyle(curtain).webkitBackdropFilter} : null,
      curtainEdge: Boolean(glyph.querySelector('.efficiency-curtain-edge'))
    };
  }));
}

function assertStandardAverage(item) {
  close(item.width, 80, `${item.id}: average column width`);
  close(item.height, 32, `${item.id}: average column height`);
  assert.equal(item.efficiency, true, 'The average uses the shared efficiency component');
  for (const dimension of ['glyphWidth', 'glyphHeight', 'sphereWidth', 'sphereHeight']) close(item[dimension], 24, `Standard 24px sphere: ${dimension}`);
  assert.equal(item.sphereRadius, '50%', 'The standard sphere remains round');
  assert.equal(item.oldBadge, false, 'The old colored badge and scale are absent');
  assert.equal(item.centerVariable, '', 'The old moving-position variable is absent');
  assert.equal(item.background, 'rgba(0, 0, 0, 0)', 'The average wrapper has no colored fill');
  assert.equal(item.gradient, 'none', 'The average wrapper has no gradient fill');
  assert.deepEqual(item.border, ['0px', '0px', '0px', '0px'], 'The average wrapper has no badge border');
  assert.equal(item.shadow, 'none', 'The average wrapper has no badge shadow');
  assert.equal(item.textShadow, 'none', 'The plain numeral has no shadow');
  assert.equal(item.backdrop, 'none', 'Blur is confined to the standard sphere curtain');
  assert.equal(item.transform, 'none', 'The average wrapper has no moving transform');
  assert.deepEqual([item.fontSize, item.lineHeight, item.weight], ['17px', '24px', '400'], 'The numeral uses standard 17/24 regular typography');
  assert.equal(item.hasPercent, item.target !== '', 'Assessed averages have a percentage element; unassessed values keep only a dash');
  assert.match(item.text, item.target === '' ? /^—$/ : /^\d{1,3}%$/, 'Average percentages never display decimals');
  if (item.target !== '') assert.match(`${item.label} ${item.title}`, /\d+%/, 'Accessible label and tooltip include percent units');
  assert.match(item.number, /^(?:\d{1,3}|—)$/, 'The score contains only an integer or an unassessed dash');
  const color = item.tone === 'gray' ? 'blue' : item.tone;
  assert.ok(item.glyphClass.split(/\s+/).includes(`efficiency-${color}`), 'The sphere uses the final efficiency color band');
  if (item.tone === 'unrated') {
    assert.equal(item.glyphValue, undefined); assert.equal(item.curtain, null); assert.equal(item.curtainEdge, false);
    assert.equal(item.number, '—', 'Unassessed records display a dash');
  } else {
    const raw = Number(item.glyphValue);
    if (raw === 100) {
      assert.equal(item.curtain, null, 'A perfect score has no curtain');
      assert.equal(item.curtainEdge, false);
    } else {
      assert.ok(item.curtain, 'The standard sphere has its glass curtain below 100');
      close(item.curtain.left, raw === 0 ? -8 : 24 * raw / 100 + 1, 'Curtain position follows the raw mean');
      close(item.curtain.top, -8, 'Standard curtain top'); close(item.curtain.height, 40, 'Standard curtain height');
      assert.equal(item.curtain.blur, 'blur(2px)', 'The sphere keeps its standard glass blur');
      assert.equal(item.curtainEdge, raw > 0, 'Zero has full coverage and no interior edge');
      if (raw === 0) assert.ok(item.curtain.left <= 0 && item.curtain.left + item.curtain.width >= 24, 'Zero is fully covered by the curtain');
    }
  }
}

function gradientColors(gradient) {
  return [...gradient.matchAll(/\b(?:rgba?|color)\([^()]+\)/g)].map(([color]) => {
    const values = color.match(/(?:\d*\.)?\d+/g).map(Number);
    const channels = color.startsWith('color(srgb ') ? values.slice(0, 3).map(value => Math.round(value * 255)) : values.slice(0, 3);
    return [...channels, values[3] ?? 1];
  });
}

async function glyphPaletteFlow(browser, url) {
  const page = await browser.newPage({viewport: {width: 1000, height: 700}, reducedMotion: 'reduce'});
  try {
    await page.goto(url);
    await page.evaluate(() => {
      const fixture = document.createElement('div');
      fixture.id = 'average-palette-fixtures';
      fixture.style.cssText = 'position:fixed;z-index:10000;left:24px;right:24px;top:24px;display:flex;flex-wrap:wrap;gap:16px;padding:24px;background:white';
      fixture.innerHTML = [0, 25, 45, 45.1, 55, 65, 65.1, 75, 85, 85.1, 95, 100, null].map((value, index) => window.BPMStructureCharts.renderAverage({id: `palette-${index}`, records: [{id: index, efficiency: value}], done: true})).join('');
      fixture.innerHTML += `<div id="average-standard-percentage-fixtures">${[45, 65, 85, 59.4].map(value => window.BpmCardVisuals.efficiency({efficiency: value, delta: 2})).join('')}${window.BpmCardVisuals.efficiency({efficiency: 59.4, delta: 2}, true)}</div>`;
      document.body.append(fixture);
    });
    const palette = await averageMetrics(page, '#average-palette-fixtures [data-average-chart]');
    const values = [0, 25, 45, 45.1, 55, 65, 65.1, 75, 85, 85.1, 95, 100, null];
    assert.equal(palette.length, values.length);
    palette.forEach((item, index) => {
      assertStandardAverage(item);
      assert.equal(item.tone, expectedTone(values[index]));
      assert.equal(item.number, values[index] === null ? '—' : String(Math.round(values[index])));
      const colors = {red: 'rgb(255, 56, 60)', yellow: 'rgb(255, 204, 0)', green: 'rgb(52, 199, 89)', unrated: 'rgb(255, 255, 255)'};
      if (colors[item.tone]) {
        assert.equal(item.sphereColor, colors[item.tone], `${item.tone}: standard sphere color`);
        assert.equal(item.sphereGradient, 'none');
      }
      if (item.tone === 'gray') {
        assert.match(item.sphereGradient, /linear-gradient\(/, 'The on-track sphere uses the shared green-to-gray gradient');
        assert.deepEqual(gradientColors(item.sphereGradient), [[172, 203, 180, 1], [163, 163, 163, 1]], 'Standard sphere gradient stops are unchanged');
      }
    });
    const standard = await page.locator('#average-standard-percentage-fixtures .efficiency').evaluateAll(elements => elements.map(element => ({
      percent: element.querySelector('.percent')?.textContent,
      label: element.getAttribute('aria-label'), value: element.dataset.efficiencyPercent,
      glyphClass: element.querySelector('.bpm-efficiency-glyph').className,
      fraction: element.querySelector('.fraction')?.textContent
    })));
    assert.equal(standard.length, 5);
    standard.forEach((item, index) => {
      assert.equal(item.percent, '%', 'Ordinary cards/tables still display percentages');
      assert.match(item.label, /процентов/, 'Ordinary cards/tables retain percentage accessible labels');
      const color = ['yellow', 'blue', 'green', 'yellow', 'yellow'][index];
      assert.ok(item.glyphClass.split(/\s+/).includes(`efficiency-${color}`), 'Existing standard glyph thresholds are unchanged');
      if (index >= 3) { assert.equal(item.fraction, ',4'); assert.equal(item.value, '59.4'); }
    });
    report('standard 24px sphere/curtain, plain integers, zero/full/unrated states, raw-mean colors and unchanged card/table percentages');
  } finally { await page.close(); }
}

function chainFor(entity, allowed) {
  const model = context.window[modelNames[entity]];
  for (const root of [...model.roots].sort((a, b) => b.total - a.total)) {
    if (allowed && !allowed.has(root.id)) continue;
    for (const division of root.children) for (const product of division.children) {
      if ((!allowed || allowed.has(product.id)) && product.records.some(row => Number.isFinite(row.efficiency))) return [root.id, division.id, product.id];
    }
  }
  throw new Error(`No assessed ${entity} hierarchy fixture found`);
}

async function expand(page, chain) {
  for (const id of chain) {
    const heading = page.locator(`[data-expand="${id}"]`);
    if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
  }
}

async function nestedState(page) {
  return page.evaluate(() => ({
    open: [...document.querySelectorAll('.structure-heading[aria-expanded="true"]')].map(element => element.dataset.expand).sort(),
    records: [...document.querySelectorAll('.structure-table [data-structure-record]')].map(element => element.dataset.structureRecord),
    charts: [...document.querySelectorAll('[data-chart]')].map(element => element.dataset.chart),
    busy: document.getElementById('structure-list').getAttribute('aria-busy')
  }));
}

async function mainFlow(browser, url) {
  const page = await browser.newPage({viewport: {width: 1920, height: 1200}, reducedMotion: 'no-preference'}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const started = Date.now();
    await enter(page, url);
    const samples = await page.evaluate(() => new Promise(resolve => {
      const began = performance.now(), readings = [];
      let id;
      function sample() {
        const charts = [...document.querySelectorAll('[data-average-chart]')];
        const chart = id ? charts.find(element => element.dataset.averageChart === id) : charts.find(element => {
          const box = element.getBoundingClientRect();
          return Number(element.dataset.averageValue) > 0 && box.bottom > 0 && box.top < innerHeight;
        });
        if (chart) {
          id = chart.dataset.averageChart;
          const target = Number(chart.dataset.averageValue), number = Number(chart.querySelector('[data-average-number]').textContent);
          const glyph = chart.querySelector('.bpm-efficiency-glyph'), sphere = glyph.querySelector('.efficiency-sphere');
          const rect = sphere.getBoundingClientRect(), style = getComputedStyle(sphere);
          readings.push({id, number, target, tone: chart.dataset.averageTone, left: rect.left, top: rect.top, width: rect.width, height: rect.height, background: style.backgroundColor, gradient: style.backgroundImage, glyphValue: glyph.dataset.efficiency, curtain: getComputedStyle(glyph).getPropertyValue('--efficiency-curtain'), edge: getComputedStyle(glyph).getPropertyValue('--efficiency-edge'), elapsed: performance.now() - began});
          if (number === target && readings.some(item => item.number > 0 && item.number < target)) return resolve(readings);
        }
        if (performance.now() - began > 6500) return resolve(readings);
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }));
    await ready(page);
    assert.ok(Date.now() - started >= 1800, 'The two-second structure loading phase remains');
    assert.ok(samples.length > 2, 'The average participates in animation frames');
    const intermediate = samples.find(sample => sample.number > 0 && sample.number < sample.target);
    assert.ok(intermediate, 'The average visibly counts through intermediate values');
    const first = samples[0], wantedTone = expectedTone(expectedNodes('processes').get(first.id).value);
    samples.forEach(sample => {
      close(sample.left, first.left, 'The sphere stays horizontally stationary during count-up');
      close(sample.top, first.top, 'The sphere stays vertically stationary during count-up');
      close(sample.width, 24, 'Standard sphere width during count-up'); close(sample.height, 24, 'Standard sphere height during count-up');
      assert.equal(sample.tone, wantedTone, 'The color band always reflects the final unrounded mean');
      assert.deepEqual([sample.background, sample.gradient, sample.glyphValue, sample.curtain, sample.edge], [first.background, first.gradient, first.glyphValue, first.curtain, first.edge], 'The sphere color and raw-mean curtain stay fixed while the numeral increases');
    });
    const last = samples.at(-1);
    assert.equal(last.number, last.target, 'Animation reaches its exact integer result');
    await checkMeans(page, 'processes');
    const toggle = page.locator('#structure-average-toggle');
    assert.equal(await toggle.evaluate(element => element.tagName), 'BUTTON');
    assert.equal(await toggle.getAttribute('role'), 'switch');
    assert.equal(await toggle.getAttribute('aria-checked'), 'true', 'Averages default to enabled');
    assert.equal(await page.locator('#structure-list').evaluate(element => element.classList.contains('has-average')), true);
    await expand(page, chainFor('processes'));
    const before = await nestedState(page);
    await toggle.focus(); await page.keyboard.press('Space');
    assert.equal(await toggle.getAttribute('aria-checked'), 'false', 'Space switches averages off');
    assert.equal(await page.locator('[data-average-chart]').count(), 0, 'Disabled average charts are removed');
    assert.equal(await page.locator('#structure-list').evaluate(element => element.classList.contains('has-average')), false);
    assert.deepEqual(await nestedState(page), before, 'Disabling averages preserves open accordions, table rows and segment charts');
    await page.keyboard.press('Enter');
    assert.equal(await toggle.getAttribute('aria-checked'), 'true', 'Enter restores averages');
    assert.equal(await page.locator('#structure-list').evaluate(element => element.classList.contains('has-average')), true);
    assert.deepEqual(await nestedState(page), before, 'Re-enabling averages preserves nested state');
    await checkMeans(page, 'processes');
    await page.locator('#structure-chart-toggle').setChecked(true);
    assert.deepEqual(await page.locator('[data-chart]').evaluateAll(elements => [...new Set(elements.map(element => element.dataset.chartType))]), ['1']);
    await checkMeans(page, 'processes');
    await page.locator('#structure-chart-toggle').setChecked(false);
    await checkMeans(page, 'processes');
    report('loading, animated numeral with stationary standard sphere/curtain, default switch, Space/Enter toggle and nested-state retention in both chart presentations');

    for (const entity of ['processes', 'paths']) {
      if (await page.locator(`#structure-${entity}-tab`).getAttribute('aria-pressed') !== 'true') await reload(page, () => page.locator(`#structure-${entity}-tab`).click());
      await checkMeans(page, entity);
      await sourceSorting(page, entity);
      const model = context.window[modelNames[entity]];
      const fixture = model.records.find(row => Number.isFinite(row.efficiency) && row.efficiency > 0 && (row.code || row.title));
      const query = fixture.code || fixture.title;
      const expected = expectedNodes(entity, query);
      assert.ok([...expected].some(([id, value]) => value.total < model.nodes.find(node => node.id === id).total), 'Search fixture narrows a source node');
      await reload(page, () => page.locator('#structure-search').fill(query));
      await expand(page, chainFor(entity, expected));
      await checkMeans(page, entity, query);
      await selectStructureSort(page, 'average-desc');
      await assertSortedGroups(page, context.window[modelNames[entity]], entity, 'average-desc', query);
      await selectStructureSort(page, 'average-asc');
      await assertSortedGroups(page, context.window[modelNames[entity]], entity, 'average-asc', query);
      await reload(page, () => page.locator('#structure-clear-search').click());
      await checkMeans(page, entity);
      await selectStructureSort(page, 'count-desc');
    }
    assert.deepEqual(errors, [], 'No browser runtime errors');
    report('process/client-path source means and recalculation after filtering/clearing at all hierarchy levels');
  } finally { await page.close(); }
}

const sortLabels = {
  'count-desc': 'Количество ↓', 'count-asc': 'Количество ↑', 'name-asc': 'Название А–Я',
  'average-desc': 'Средняя эффективность ↓', 'average-asc': 'Средняя эффективность ↑'
};

async function selectStructureSort(page, mode) {
  const input = page.locator('#structure-sort-input');
  await input.click();
  const options = await page.locator('#structure-sort-list [role="option"]').evaluateAll(elements => Object.fromEntries(elements.map(element => [element.dataset.option, element.textContent.trim()])));
  assert.deepEqual(options, sortLabels, 'The real dropdown retains its original options and adds both average directions');
  await page.locator(`#structure-sort-list [data-option="${mode}"]`).click();
  assert.equal(await input.inputValue(), sortLabels[mode]);
  assert.equal(await page.locator('#structure-list').getAttribute('aria-busy'), 'false', 'Sorting is immediate and does not reload the hierarchy');
}

async function openHierarchyGroups(page) {
  // Dispatch ordinary heading clicks to instantiate all sibling groups without
  // spending time scrolling through every expanded source branch.
  await page.evaluate(() => {
    const list = document.getElementById('structure-list');
    for (const kind of ['block', 'division']) {
      for (const heading of list.querySelectorAll(`.structure-node[data-kind="${kind}"] > .structure-heading`)) {
        if (heading.getAttribute('aria-expanded') !== 'true') heading.click();
      }
    }
    const product = list.querySelector('.structure-node[data-kind="product"] > .structure-heading');
    if (product?.getAttribute('aria-expanded') !== 'true') product?.click();
  });
}

async function assertSortedGroups(page, model, entity, mode, query = '') {
  const means = expectedNodes(entity, query, model), nodes = new Map(model.nodes.map(node => [node.id, node]));
  const groups = await page.evaluate(() => {
    const list = document.getElementById('structure-list');
    const children = parent => [...parent.children].filter(element => element.matches('.structure-node')).map(element => element.dataset.node);
    return [{parent: null, ids: children(list)}, ...[...list.querySelectorAll('.structure-children')].map(panel => ({parent: panel.closest('.structure-node').dataset.node, ids: children(panel)})).filter(group => group.ids.length)];
  });
  const compare = (a, b) => {
    const name = a.name.localeCompare(b.name, 'ru');
    if (mode === 'name-asc') return name;
    if (mode.startsWith('count-')) return (mode === 'count-asc' ? means.get(a.id).total - means.get(b.id).total : means.get(b.id).total - means.get(a.id).total) || name;
    const first = means.get(a.id).value, second = means.get(b.id).value;
    if (first === null && second !== null) return 1;
    if (first !== null && second === null) return -1;
    return (first === null ? 0 : mode === 'average-asc' ? first - second : second - first) || name || a.id.localeCompare(b.id);
  };
  const kinds = new Set();
  for (const group of groups) {
    const siblings = group.parent ? nodes.get(group.parent).children : model.roots;
    const expected = Array.from(siblings).filter(node => means.has(node.id)).sort(compare).map(node => node.id);
    assert.deepEqual(group.ids, expected, `${entity}/${mode}/${group.parent || 'blocks'}: siblings use the current unrounded record means`);
    group.ids.forEach(id => kinds.add(nodes.get(id).kind));
  }
  return kinds;
}

async function sourceSorting(page, entity) {
  const model = context.window[modelNames[entity]];
  assert.equal(await page.locator('#structure-sort-input').inputValue(), sortLabels['count-desc'], 'Count descending remains the default');
  if (entity === 'processes') {
    await page.locator('#structure-sort-input').click();
    const labels = await page.locator('#structure-sort-list [data-option^="average-"] .option-label').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(), popup = element.closest('[role="listbox"]').getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      return {text: element.textContent, contained: text.left >= popup.left && text.right <= popup.right && text.top >= popup.top && text.bottom <= popup.bottom, width: box.width, scroll: element.scrollWidth};
    }));
    assert.deepEqual(labels.map(item => item.text), [sortLabels['average-desc'], sortLabels['average-asc']]);
    assert.ok(labels.every(item => item.contained && item.scroll <= item.width + 1), 'Both complete average labels and arrows fit in the open dropdown');
    await page.locator('#structure-sort-list').screenshot({path: '/private/tmp/bpm-average-sort-dropdown.png'});
    await page.keyboard.press('Escape');
  }
  await openHierarchyGroups(page);
  const before = (await nestedState(page)).open;
  for (const mode of ['count-desc', 'average-desc', 'average-asc', 'count-asc', 'name-asc']) {
    await selectStructureSort(page, mode);
    assert.deepEqual([...await assertSortedGroups(page, model, entity, mode)].sort(), ['block', 'division', 'product'], 'Sorting covers all three hierarchy levels');
    assert.deepEqual((await nestedState(page)).open, before, 'Changing the sort retains expanded sections');
  }
  await page.locator('#structure-average-toggle').click();
  assert.equal(await page.locator('[data-average-chart]').count(), 0);
  for (const mode of ['average-desc', 'average-asc']) {
    await selectStructureSort(page, mode);
    await assertSortedGroups(page, model, entity, mode);
    assert.equal(await page.locator('#structure-average-toggle').getAttribute('aria-checked'), 'false', 'Sorting does not enable the average display');
  }
  await page.locator('#structure-average-toggle').click();
  assert.deepEqual((await nestedState(page)).open, before, 'Hidden average sorting retains expanded sections');
  await selectStructureSort(page, 'count-desc');
}

function installAverageSortFixtures() {
  let original;
  Object.defineProperty(window, 'BpmStructure', {
    configurable: true,
    get() { return original; },
    set(api) {
      original = {...api, create(options) {
        for (const modelName of ['BPM_STRUCTURE', 'BPM_STRUCTURE_PATHS']) {
          const source = window[modelName], entity = modelName.endsWith('_PATHS') ? 'paths' : 'processes';
          const specs = [
            ['raw-low', 'Я точное низкое', [70, 70.2]], ['raw-high', 'А точное высокое', [70.3, 70.5]],
            ['tie-b', 'Одинаковый', [50, 50]], ['tie-a', 'Одинаковый', [50, 50]],
            ['null', 'А без оценки', [null, null]], ['zero', 'Я ноль', [0, 0]],
            ['filter-a', 'Фильтр А', [10, 100]], ['filter-b', 'Фильтр Б', [80, 0]]
          ];
          const nodes = [], records = [], prefix = `average-sort-${entity}`;
          function node(kind, id, name, children, rows) {
            rows ||= [...new Map(children.flatMap(child => child.records).map(row => [row.id, row])).values()];
            const buckets = [0, 0, 0, 0, 0]; rows.forEach(row => buckets[row.bucket]++);
            const result = {...source.nodes.find(item => item.kind === kind), id, kind, name, children, records: rows, total: rows.length, buckets};
            nodes.push(result); return result;
          }
          function product(scope, [key, name, values]) {
            const id = `${prefix}-${scope}-${key}`;
            const rows = values.map((efficiency, index) => ({
              ...source.records[0], id: `${id}-row-${index}`, entity, efficiency,
              number: records.length + index + 1, code: `${id}-${index}`,
              title: index === 0 ? 'sorting-keep' : 'sorting-remove', products: [name],
              owner: 'Владелец теста', owners: ['Владелец теста'],
              bucket: efficiency === null ? 4 : efficiency > 85 ? 0 : efficiency > 65 ? 1 : efficiency > 45 ? 2 : 3,
              linkedProcesses: [], linkedProcessIds: [], count: 0, processCount: 0
            }));
            records.push(...rows);
            return node('product', id, name, [], rows);
          }
          const roots = specs.map(spec => {
            const child = product('block-product', spec);
            const division = node('division', `${prefix}-block-division-${spec[0]}`, 'Подразделение', [child]);
            return node('block', `${prefix}-block-${spec[0]}`, spec[1], [division]);
          });
          const divisions = specs.map(spec => node('division', `${prefix}-division-${spec[0]}`, spec[1], [product('division-product', spec)]));
          roots.push(node('block', `${prefix}-division-root`, 'Подразделения', divisions));
          const productDivision = node('division', `${prefix}-product-division`, 'Продукты', specs.map(spec => product('product', spec)));
          roots.push(node('block', `${prefix}-product-root`, 'Продуктовый блок', [productDivision]));
          window[modelName] = {...source, roots, nodes, records, total: records.length, pathCount: records.length, sourceIssues: [], placeholderCount: 0, productCount: nodes.filter(item => item.kind === 'product').length};
        }
        return api.create(options);
      }};
    }
  });
}

async function sortingFixtureFlow(browser, url) {
  const page = await browser.newPage({viewport: {width: 1920, height: 1100}, reducedMotion: 'reduce'}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(installAverageSortFixtures);
    await enter(page, url); await ready(page);
    for (const entity of ['processes', 'paths']) {
      if (await page.locator(`#structure-${entity}-tab`).getAttribute('aria-pressed') !== 'true') await reload(page, () => page.locator(`#structure-${entity}-tab`).click());
      const model = await page.evaluate(name => ({roots: window[name].roots, nodes: window[name].nodes}), modelNames[entity]);
      await openHierarchyGroups(page);
      const before = (await nestedState(page)).open;
      for (const mode of ['average-desc', 'average-asc']) {
        await selectStructureSort(page, mode);
        assert.deepEqual([...await assertSortedGroups(page, model, entity, mode)].sort(), ['block', 'division', 'product']);
        assert.deepEqual((await nestedState(page)).open, before, 'Fixture sorting retains all expanded levels');
      }
      await selectStructureSort(page, 'average-desc');
      const rootIds = () => page.locator('#structure-list > .structure-node').evaluateAll(elements => elements.map(element => element.dataset.node));
      const initial = await rootIds(), prefix = `average-sort-${entity}-block-`;
      assert.ok(initial.indexOf(`${prefix}filter-a`) < initial.indexOf(`${prefix}filter-b`), 'Unfiltered means put 55 before 40');
      await reload(page, () => page.locator('#structure-search').fill('sorting-keep'));
      await assertSortedGroups(page, model, entity, 'average-desc', 'sorting-keep');
      const filtered = await rootIds();
      assert.ok(filtered.indexOf(`${prefix}filter-b`) < filtered.indexOf(`${prefix}filter-a`), 'Filtering recomputes means and puts 80 before 10');
      await selectStructureSort(page, 'average-asc');
      await assertSortedGroups(page, model, entity, 'average-asc', 'sorting-keep');
      await reload(page, () => page.locator('#structure-clear-search').click());
    }
    assert.deepEqual(errors, [], 'Sorting fixtures produce no runtime errors');
    report('real average sort options: both entities/all levels, unrounded ordering, name/ID ties, zero before missing scores, filters reversing order, hidden averages and retained expansion');
  } finally { await page.close(); }
}

async function barCenterAlignmentFlow(browser, url) {
  const page = await browser.newPage({viewport: {width: 1920, height: 1100}, reducedMotion: 'reduce'}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await enter(page, url); await ready(page);
    const chain = chainFor('processes');
    await expand(page, chain);
    const opened = (await nestedState(page)).open;
    let comparisons = 0, largestDifference = 0, scrollbarGutter = 0;
    async function check(width, mode, state) {
      const measured = await page.evaluate(ids => ids.map(id => {
        const heading = document.querySelector(`[data-expand="${id}"]`);
        const segment = [...heading.querySelectorAll('.structure-segment')].find(element => Number(element.dataset.count) > 0 && element.dataset.bucket !== '4');
        const center = element => {
          const rect = element.getBoundingClientRect();
          return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height};
        };
        return {
          id, kind: heading.closest('.structure-node').dataset.kind,
          sphere: center(heading.querySelector('.efficiency-sphere')),
          number: center(heading.querySelector('[data-average-number]')),
          track: segment ? center(segment.querySelector('.structure-track')) : null,
          chart: center(heading.querySelector('.structure-chart')),
          chartType: heading.querySelector('.structure-chart').dataset.chartType
        };
      }), chain);
      assert.deepEqual(measured.map(item => item.kind), ['block', 'division', 'product']);
      for (const item of measured) {
        const label = `${width}px/chart${mode}/${item.kind}/${state}`;
        assert.equal(item.chartType, String(mode));
        assert.ok(item.track, `${label}: the fixture has a nonzero colored segment`);
        close(item.track.height, 22, `${label}: colored bar height`);
        close(item.sphere.height, 24, `${label}: sphere height`);
        close(item.number.height, 24, `${label}: numeral line height`);
        close(item.sphere.y, item.track.y, `${label}: sphere is centered on the colored bar`, 0.5);
        close(item.number.y, item.track.y, `${label}: numeral is centered on the colored bar`, 0.5);
        assert.ok(item.track.y > item.chart.y + 5, `${label}: the comparison excludes the labels above the colored bars`);
        largestDifference = Math.max(largestDifference, Math.abs(item.sphere.y - item.track.y), Math.abs(item.number.y - item.track.y));
        comparisons += 2;
      }
      const bounds = await page.evaluate(() => ({viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth}));
      assert.ok(bounds.document <= width + 1 && bounds.body <= width + 1, `${labelForWidth(width, mode, state)}: no page overflow: ${JSON.stringify(bounds)}`);
    }
    for (const width of [1920, 1440, 1404, 788, 390, 320]) {
      // Reuse the mounted hierarchy through real viewport changes so breakpoints
      // must update existing, expanded headings rather than only first render.
      await page.setViewportSize({width, height: 1100});
      for (const mode of [2, 1]) {
        await page.locator('#structure-chart-toggle').setChecked(mode === 1);
        await check(width, mode, 'after resize');
        if (width === 1920 || width === 390) {
          const product = page.locator(`[data-expand="${chain[2]}"]`);
          await product.scrollIntoViewIfNeeded();
          await product.screenshot({path: `/private/tmp/bpm-average-bar-center-${width}-chart-${mode}.png`});
        }
      }
      await page.locator('#structure-average-toggle').click();
      assert.equal(await page.locator('[data-average-chart]').count(), 0);
      await page.locator('#structure-average-toggle').click();
      assert.deepEqual((await nestedState(page)).open, opened, 'Off/on and resizes preserve the expanded hierarchy');
      await check(width, 1, 'after off/on');
    }
    // QA-only CSS requests a classic horizontal scrollbar and adds asymmetric
    // padding. Overlay-scrollbar platforms may still reserve zero gutter.
    await page.setViewportSize({width: 390, height: 1100});
    await page.evaluate(ids => ids.forEach(id => { document.querySelector(`[data-expand="${id}"]`).dataset.alignmentQa = 'true'; }), chain);
    const fixtureStyle = await page.addStyleTag({content: `
      [data-alignment-qa] > .structure-chart-scroll { overflow-x:scroll!important; scrollbar-width:auto!important; padding-top:7px!important; padding-bottom:11px!important; }
      [data-alignment-qa] > .structure-chart-scroll::-webkit-scrollbar { height:14px; }
      [data-alignment-qa] > .structure-chart-scroll::-webkit-scrollbar-thumb { background:#b8c5d8; }
    `});
    for (const mode of [2, 1]) {
      await page.locator('#structure-chart-toggle').setChecked(mode === 1);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const gutter = await page.locator('[data-alignment-qa] > .structure-chart-scroll').evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        return {reserved: element.offsetHeight - element.clientHeight - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth), top: style.paddingTop, bottom: style.paddingBottom};
      }));
      assert.equal(gutter.length, 3);
      gutter.forEach(item => {
        assert.ok(item.reserved === 0 || Math.abs(item.reserved - 14) <= 1, `The requested scrollbar is either 14px or platform-overlay: ${item.reserved}px`);
        scrollbarGutter = Math.max(scrollbarGutter, item.reserved);
        assert.deepEqual([item.top, item.bottom], ['7px', '11px'], 'QA fixture applies asymmetric padding');
      });
      await check(390, mode, 'requested scrollbar with asymmetric padding');
    }
    await page.locator(`[data-expand="${chain[2]}"]`).screenshot({path: '/private/tmp/bpm-average-bar-center-scrollbar-fixture.png'});
    await fixtureStyle.evaluate(element => element.remove());
    await page.evaluate(ids => ids.forEach(id => { delete document.querySelector(`[data-expand="${id}"]`).dataset.alignmentQa; }), chain);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await check(390, 1, 'after removing QA scrollbar/padding');
    assert.deepEqual(errors, [], 'The bar-center regression produces no browser runtime errors');
    report(`bar-center alignment: ${comparisons} sphere/numeral comparisons, maximum difference ${largestDifference.toFixed(3)}px; both chart modes, block/division/product, real resizes and off/on at 1920/1440/1404/788/390/320px, plus asymmetric padding; observed scrollbar gutter ${scrollbarGutter}px${scrollbarGutter ? '' : ' (overlay platform; native gutter not exercised)'}`);
  } finally { await page.close(); }
}

function labelForWidth(width, mode, state) { return `${width}px/chart${mode}/${state}`; }

async function responsiveFlow(browser, url, width) {
  const page = await browser.newPage({viewport: {width, height: 1200}, reducedMotion: 'reduce'}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await enter(page, url); await ready(page);
    await checkMeans(page, 'processes', '', true);
    const chain = chainFor('processes');
    await expand(page, chain);
    await checkMeans(page, 'processes', '', true);
    const measured = await page.evaluate(ids => ids.map(id => {
      const heading = document.querySelector(`[data-expand="${id}"]`);
      const box = element => {
        const rect = element.getBoundingClientRect();
        return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height};
      };
      const children = [...heading.children].map(box);
      const chartScroll = heading.querySelector('.structure-chart-scroll');
      return {
        id, heading: box(heading), owner: box(heading.querySelector('.structure-owner')),
        average: box(heading.querySelector('.structure-average')), bars: box(heading.querySelector('.structure-bars')),
        title: box(heading.querySelector('.structure-title')), children,
        chart: {viewport: chartScroll.clientWidth, content: chartScroll.scrollWidth, overflow: getComputedStyle(chartScroll).overflowX}
      };
    }), chain);
    for (let index = 0; index < measured.length; index++) {
      const item = measured[index], label = `${width}px/${item.id}`;
      for (const column of ['owner', 'average', 'bars']) close(item[column].left, measured[0][column].left, `${label}: shared ${column} column`, 1);
      if (index) assert.ok(item.title.left > measured[index - 1].title.left, `${label}: titles retain hierarchy indentation`);
      for (const child of item.children) {
        assert.ok(child.left >= item.heading.left - 1 && child.right <= item.heading.right + 1, `${label}: heading child stays horizontally contained: ${JSON.stringify(child)}`);
        assert.ok(child.top >= item.heading.top - 1 && child.bottom <= item.heading.bottom + 1, `${label}: heading child stays vertically contained`);
      }
      for (let first = 0; first < item.children.length; first++) for (let second = first + 1; second < item.children.length; second++) {
        const a = item.children[first], b = item.children[second];
        assert.ok(Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1, `${label}: heading children ${first}/${second} overlap`);
      }
      if (item.chart.content > item.chart.viewport + 1) assert.ok(['auto', 'scroll'].includes(item.chart.overflow), `${label}: wide segment charts scroll locally`);
    }
    const bounds = await page.evaluate(() => ({viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth}));
    assert.ok(bounds.document <= width + 1 && bounds.body <= width + 1, `${width}px: no page overflow: ${JSON.stringify(bounds)}`);
    assert.deepEqual(errors, [], `${width}px: no runtime errors`);
  } catch (error) { error.message = `${width}px: ${error.message}`; throw error; }
  finally { await page.close(); }
}

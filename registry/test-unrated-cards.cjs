/* Unrated process-card regression for the registry and My cabinet.
 * Run with bundled Node (or BPM_PLAYWRIGHT):
 *   node registry/test-unrated-cards.cjs [source|standalone|both]
 * Default: both. Build the standalone HTML first. The offline run copies only
 * that HTML into an unrelated directory so sibling assets cannot mask omissions.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const mode = process.argv[2] || 'both';
assert.ok(['source', 'standalone', 'both'].includes(mode), 'Expected source, standalone, or both');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-unrated-cards-'));
const report = text => console.log(`PASS — ${text}`);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= .1, `${label}: ${actual} vs ${expected}`);
const registryReady = page => page.waitForFunction(() => document.querySelector('#results')?.getAttribute('aria-busy') === 'false');
const cabinetReady = page => page.waitForFunction(() => !document.querySelector('#cabinet-panel')?.hidden && document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy') === 'false');

async function paint(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function unrated(efficiency, label, embedded) {
  assert.equal(await efficiency.count(), 1, `${label}: one efficiency value`);
  const actual = await efficiency.evaluate(element => {
    const icon = element.querySelector('img');
    const value = element.querySelector('.efficiency-value');
    const iconBox = icon?.getBoundingClientRect();
    const valueBox = value?.getBoundingClientRect();
    const style = getComputedStyle(element), valueStyle = value && getComputedStyle(value);
    return {
      text: element.textContent.trim(), label: element.getAttribute('aria-label'),
      numericAttribute: element.hasAttribute('data-efficiency-percent'),
      numericChildren: element.querySelectorAll('.percent, .trend, [data-counter-number], [data-efficiency], .efficiency-curtain').length,
      fontSize: valueStyle?.fontSize, lineHeight: valueStyle?.lineHeight, gap: style.columnGap,
      icon: icon && {src: icon.getAttribute('src'), loaded: icon.complete && icon.naturalWidth > 0, width: iconBox.width, height: iconBox.height},
      actualGap: iconBox && valueBox ? valueBox.left - iconBox.right : null
    };
  });
  assert.equal(actual.text, '---', `${label}: Figma Card / NONE placeholder`);
  assert.match(actual.label || '', /Эффективность не (?:оценивалась|рассчитана|посчитана)/, `${label}: accessible unrated label`);
  assert.equal(actual.numericAttribute, false, `${label}: no fabricated percentage`);
  assert.equal(actual.numericChildren, 0, `${label}: no percentage, trend, counter, or rated curtain`);
  assert.doesNotMatch(actual.text, /0\s*%|null|undefined|[↑↓%]/i, `${label}: no false numeric value or dynamics`);
  assert.ok(actual.icon?.loaded, `${label}: exported unrated SVG loaded`);
  assert.match(actual.icon.src, embedded ? /^data:image\/svg\+xml[;,]/ : /(?:^|\/)assets\/efficiency-unrated\.svg$/, `${label}: correct local/embedded asset`);
  near(actual.icon.width, 24, `${label}: icon width`);
  near(actual.icon.height, 24, `${label}: icon height`);
  assert.equal(actual.fontSize, '17px', `${label}: Figma text size`);
  assert.equal(actual.lineHeight, '24px', `${label}: Figma text line height`);
  assert.equal(actual.gap, '8px', `${label}: Figma gap`);
  near(actual.actualGap, 8, `${label}: visible icon/text gap`);
}

async function rated(efficiency, value, label) {
  assert.equal(await efficiency.count(), 1, `${label}: one efficiency value`);
  assert.equal(await efficiency.getAttribute('data-efficiency-percent'), String(value), `${label}: actual numerical percentage`);
  assert.equal(await efficiency.locator('.percent').innerText(), '%', `${label}: percentage sign retained`);
  const number = await efficiency.locator('[data-counter-number]').innerText();
  assert.equal(Number(number.replace(/\s/g, '').replace(',', '.')), value, `${label}: numeric value retained`);
  assert.equal(await efficiency.locator('.efficiency-unrated').count(), 0, `${label}: not an unrated glyph`);
  assert.equal(await efficiency.locator('[data-efficiency]').getAttribute('data-efficiency'), String(value), `${label}: rated glyph retained`);
}

async function cabinet(page, embedded, label) {
  await cabinetReady(page);
  const records = await page.evaluate(() => window.BPM_CABINET_DATA.entities.filter(row => row.entity === 'processes').map(row => ({id: row.id, efficiency: row.efficiency})));
  const missing = records.filter(row => row.efficiency === null);
  assert.ok(missing.length >= 2, `${label}: at least two real unrated process examples in My cabinet data`);
  for (const row of missing) {
    const card = page.locator(`article[data-cabinet-open="${row.id}"]`);
    const metric = card.locator('.efficiency');
    await card.scrollIntoViewIfNeeded();
    await paint(page);
    await unrated(metric, `${label} cabinet ${row.id}`, embedded);
    assert.equal(await card.locator('[data-cabinet-efficiency]').count(), 0, `${row.id}: no dynamics trigger`);
    assert.equal(await metric.evaluate(element => !!element.closest('button, [role="button"], [tabindex="0"]')), false, `${row.id}: unrated metric is not an interactive control`);
    await metric.hover();
    assert.equal(await page.locator('#cabinet-efficiency-tip').count(), 0, `${row.id}: hover cannot invent dynamics`);
    await metric.click();
    assert.equal(await page.locator('#cabinet-efficiency-tip').count(), 0, `${row.id}: click cannot invent dynamics`);
    // Clicking a non-interactive footer may legitimately follow the card's own
    // detail action. Its efficiency must never become a dynamics popover.
    if (await page.locator('#process-drawer[open]').count()) {
      await page.keyboard.press('Escape');
      await page.locator('#process-drawer[open]').waitFor({state: 'hidden'});
    }
    await card.screenshot({path: path.join(output, `${label}-cabinet-${row.id}.png`)});
  }

  const numeric = records.find(row => typeof row.efficiency === 'number');
  assert.ok(numeric, `${label}: cabinet also retains a rated process`);
  const numericCard = page.locator(`article[data-cabinet-open="${numeric.id}"]`);
  await rated(numericCard.locator('.efficiency'), numeric.efficiency, `${label} cabinet rated process`);
  const trigger = numericCard.locator(`[data-cabinet-efficiency="${numeric.id}"]`);
  await trigger.click();
  await page.locator('#cabinet-efficiency-tip[role="dialog"]').waitFor();
  assert.match(await page.locator('#cabinet-efficiency-tip').innerText(), /Эффективность и динамика/);
  assert.doesNotMatch(await page.locator('#cabinet-efficiency-tip').innerText(), /null%|undefined%/);
  await page.keyboard.press('Escape');
  await page.locator('#cabinet-efficiency-tip').waitFor({state: 'hidden'});

  await page.locator('#cabinet-filter-processes').click();
  await page.locator('.cabinet-menu [data-group="efficiency"][data-value="Без эффективности"]').click();
  await page.keyboard.press('Escape');
  const filteredIds = await page.locator('article[data-cabinet-kind="processes"]').evaluateAll(cards => cards.map(card => card.dataset.cabinetOpen));
  assert.deepEqual(filteredIds.sort(), missing.map(row => row.id).sort(), `${label}: No efficiency filter returns the actual unrated examples`);
  await page.locator('[data-cabinet-section="processes"]').screenshot({path: path.join(output, `${label}-cabinet-unrated.png`)});
  report(`${label}: ${missing.length} actual cabinet examples, Figma NONE layout, inert dynamics, numeric interaction, and filter`);
}

async function registry(page, embedded, label) {
  await page.locator('#registry-nav').click();
  await page.locator('#processes-tab').click();
  await registryReady(page);
  const records = await page.evaluate(() => window.BPM_DATA.filter(row => row.entity === 'processes').map(row => ({id: row.id, efficiency: row.efficiency})));
  const missing = records.filter(row => row.efficiency === null);
  assert.ok(missing.length >= 2, `${label}: at least two real unrated process examples in registry data`);
  const visibleIds = await page.locator('#results article[data-record]').evaluateAll(cards => cards.map(card => card.dataset.record));
  assert.ok(missing.filter(row => visibleIds.includes(row.id)).length >= 2, `${label}: a pair of unrated examples appears on the first registry page`);
  for (const row of missing.filter(row => visibleIds.includes(row.id))) {
    const card = page.locator(`#results article[data-record="${row.id}"]`);
    await card.scrollIntoViewIfNeeded();
    await paint(page);
    await unrated(card.locator('.efficiency'), `${label} registry ${row.id}`, embedded);
    await card.screenshot({path: path.join(output, `${label}-registry-${row.id}.png`)});
  }
  const numeric = records.find(row => typeof row.efficiency === 'number' && visibleIds.includes(row.id));
  assert.ok(numeric, `${label}: registry retains rated processes beside the new examples`);
  await rated(page.locator(`#results article[data-record="${numeric.id}"] .efficiency`), numeric.efficiency, `${label} registry rated process`);
  await page.locator('#results .cards-grid').screenshot({path: path.join(output, `${label}-registry-cards.png`)});
  await page.locator('#size-select-input').click();
  await page.locator('#size-select-list [data-option="80"]').click();
  await registryReady(page);
  for (const direction of ['asc', 'desc']) {
    await page.locator('#sort-select-input').click();
    await page.locator(`#sort-select-list [data-option="eff-${direction}"]`).click();
    await registryReady(page);
    const values = await page.locator('#results article[data-record]').evaluateAll(cards => cards.map(card => window.BPM_DATA.find(row => row.id === card.dataset.record).efficiency));
    assert.equal(values.length, records.length, `${label}: all registry processes are included in sort check`);
    assert.deepEqual(values.slice(-missing.length), missing.map(() => null), `${label}: unrated processes follow rated processes in ${direction} efficiency order`);
    const assessed = values.filter(value => value !== null);
    assert.deepEqual(assessed, [...assessed].sort((a, b) => direction === 'asc' ? a - b : b - a), `${label}: numerical ${direction} efficiency order is preserved`);
  }
  report(`${label}: actual registry examples retain the NONE state beside numerical ratings`);
  report(`${label}: unrated processes sort after assessed processes in both efficiency directions`);
}

async function numericalZero(page, embedded, label) {
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.id = 'unrated-cards-numerical-fixture';
    fixture.style.cssText = 'position:relative;z-index:1000;background:#eff3f6;padding:24px;display:flex;gap:24px;align-items:start';
    fixture.innerHTML = [0, 89.3].map(value => {
      const row = {...window.BPM_CABINET_DATA.entities.find(row => row.entity === 'processes'), id: `test-numeric-${value}`, efficiency: value, delta: 0};
      return `<div data-fixture-value="${value}" style="width:400px"><div data-fixture-registry style="padding:24px;background:white">${window.BpmCardVisuals.efficiency(row)}</div><div data-fixture-cabinet>${window.BpmCabinetCards.entity(row)}</div></div>`;
    }).join('');
    document.body.append(fixture);
  });
  for (const value of [0, 89.3]) {
    const fixture = page.locator(`[data-fixture-value="${value}"]`);
    for (const target of ['registry', 'cabinet']) await rated(fixture.locator(`[data-fixture-${target}] .efficiency`), value, `${label} ${target} fixture ${value}`);
    assert.equal(await fixture.locator(`[data-cabinet-efficiency="test-numeric-${value}"]`).count(), 1, `${label}: numeric ${value} retains cabinet dynamics control`);
  }
  await paint(page);
  await page.locator('#unrated-cards-numerical-fixture').screenshot({path: path.join(output, `${label}-numerical-zero.png`)});
  await page.locator('#unrated-cards-numerical-fixture').evaluate(element => element.remove());
  report(`${label}: numerical zero remains 0%, and 89.3 remains rated in both production renderers`);
}

async function run(browser, embedded) {
  const label = embedded ? 'standalone' : 'source';
  let file = path.join(__dirname, 'index.html');
  if (embedded) {
    const original = path.join(__dirname, '..', 'Sber-BPM-Registry-Standalone.html');
    assert.ok(fs.existsSync(original), `Build the standalone file first: ${original}`);
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-unrated-offline-'));
    file = path.join(isolated, 'renamed-unrated-prototype.html');
    fs.copyFileSync(original, file);
    assert.deepEqual(fs.readdirSync(isolated), ['renamed-unrated-prototype.html']);
  }
  const url = pathToFileURL(file).href;
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce', offline: embedded});
  const errors = [], failed = [], external = [];
  await context.addInitScript(() => localStorage.setItem('bpm-registry-menu', 'expanded'));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('requestfailed', request => failed.push(`${request.url().slice(0, 160)}: ${request.failure()?.errorText}`));
  page.on('request', request => {
    if (embedded && !/^(data:|blob:)/.test(request.url()) && request.url().split(/[?#]/)[0] !== url) external.push(request.url().slice(0, 160));
  });
  try {
    await page.goto(url);
    await cabinet(page, embedded, label);
    await registry(page, embedded, label);
    await numericalZero(page, embedded, label);
    const broken = await page.locator('img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.getAttribute('src').slice(0, 120)));
    assert.deepEqual(broken, [], `${label}: no broken images`);
    assert.deepEqual(errors, [], `${label}: no page errors`);
    assert.deepEqual(failed, [], `${label}: no failed resource requests`);
    assert.deepEqual(external, [], `${label}: no sibling-file or network dependency`);
    report(`${label}: no JavaScript errors or resource failures${embedded ? '; isolated HTML works offline' : ''}`);
  } catch (error) {
    await page.screenshot({path: path.join(output, `${label}-failure.png`), fullPage: true}).catch(() => {});
    console.error(JSON.stringify({label, file, errors, failed, external}, null, 2));
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    if (mode !== 'standalone') await run(browser, false);
    if (mode !== 'source') await run(browser, true);
  } finally {
    await browser.close();
    console.log(`Screenshots: ${output}`);
  }
})().catch(error => {console.error(error); process.exitCode = 1;});

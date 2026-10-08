/* Long insight source/bank tags must truncate the text, not the flex wrapper.
 * Runs in an isolated browser context; no user data or prototype data is changed.
 * node test-insight-source-badges.cjs [index.html | standalone.html] */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-insight-source-badges-'));
let source = path.resolve(process.argv[2] || path.join(__dirname, 'index.html'));
if (path.basename(source) !== 'index.html') {
  const isolated = path.join(output, 'prototype.html');
  fs.copyFileSync(source, isolated);
  source = isolated;
}
const ready = page => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');
const paint = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

async function checkBadges(scope, label, {constrained = false, cards = false} = {}) {
  const badges = scope.locator('.insight-source-badge');
  assert.ok(await badges.count(), `${label}: source badges exist`);
  if (constrained) await badges.evaluateAll(nodes => nodes.forEach(node => {
    node.dataset.testOriginalStyle = node.getAttribute('style') || '';
    node.style.setProperty('max-width', '120px');
  }));
  const values = await badges.evaluateAll(nodes => nodes.map(node => {
    const text = node.querySelector('.insight-source-text');
    const box = node.getBoundingClientRect(), css = getComputedStyle(node);
    const textBox = text?.getBoundingClientRect(), textCSS = text && getComputedStyle(text);
    const container = node.parentElement.getBoundingClientRect();
    const siblings = [...node.parentElement.children].filter(item => item !== node).map(item => {
      const rect = item.getBoundingClientRect();
      return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom};
    });
    return {
      text: text?.textContent, title: node.title, fullText: node.textContent,
      box: {left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height},
      textLeft: textBox?.left, textRight: textBox?.right,
      paddingLeft: parseFloat(css.paddingLeft), paddingRight: parseFloat(css.paddingRight),
      overflow: textCSS?.overflowX, ellipsis: textCSS?.textOverflow, nowrap: textCSS?.whiteSpace,
      scroll: text?.scrollWidth, client: text?.clientWidth,
      container: {left: container.left, right: container.right}, siblings
    };
  }));
  for (const value of values) {
    const info = `${label}: ${JSON.stringify(value)}`;
    assert.equal(value.text, value.fullText, info);
    assert.equal(value.title, value.fullText, `${label}: tooltip preserves complete source/bank text`);
    assert.equal(value.ellipsis, 'ellipsis', info);
    assert.equal(value.overflow, 'hidden', info);
    assert.equal(value.nowrap, 'nowrap', info);
    assert.ok(value.textLeft >= value.box.left + value.paddingLeft - .5, info);
    assert.ok(value.textRight <= value.box.right - value.paddingRight + .5, info);
    assert.ok(value.box.left >= value.container.left - 1 && value.box.right <= value.container.right + 1, info);
    assert.ok(value.box.height <= 25, `${label}: source tag stays single-line`);
    if (cards) for (const sibling of value.siblings) {
      assert.ok(sibling.left >= value.container.left - 1 && sibling.right <= value.container.right + 1, `${label}: ID and relationship icons remain inside metadata`);
      if (sibling.top < value.box.bottom && sibling.bottom > value.box.top) {
        assert.ok(sibling.left >= value.box.right - .5 || sibling.right <= value.box.left + .5, `${label}: metadata siblings do not overlap source tag`);
      }
    }
  }
  if (constrained) {
    assert.ok(values.some(value => value.scroll > value.client + 1), `${label}: a long source really truncates at 120px`);
    await badges.evaluateAll(nodes => nodes.forEach(node => {
      const previous = node.dataset.testOriginalStyle;
      if (previous) node.setAttribute('style', previous); else node.removeAttribute('style');
      delete node.dataset.testOriginalStyle;
    }));
  }
  return values;
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce', offline: true});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  try {
    await page.goto(pathToFileURL(source).href + '#insights');
    await ready(page);
    const records = await page.evaluate(() => BpmInsightStore.list());
    const normal = records.find(row => row.source === 'ТБ' && row.status !== 'Новый');
    const approval = records.find(row => row.source === 'ТБ' && row.status === 'Новый');
    assert.ok(normal && approval, 'Both tabbed and approval bank records exist');
    let realTruncation = false;
    for (const width of [320, 390, 768, 1440, 1920, 3840]) {
      await page.setViewportSize({width, height: width === 3840 ? 2160 : 920});
      await paint(page);
      const values = await checkBadges(page.locator('#insights-results'), `${width}px cards`, {cards: true});
      realTruncation ||= values.some(value => value.scroll > value.client + 1);
      if (width === 390) {
        const card = page.locator('.insights-card').filter({has: page.locator('.insight-source-text', {hasText: 'Северо-Западный'})}).first();
        if (await card.count()) await card.screenshot({path: path.join(output, 'truncated-source-390.png')});
      }
    }
    assert.ok(realTruncation, 'Actual responsive card geometry exercises truncated source text');
    await page.setViewportSize({width: 1440, height: 920});
    await page.locator('#insights-table').click(); await ready(page); await paint(page);
    await checkBadges(page.locator('#insights-results'), 'table');
    await checkBadges(page.locator('#insights-results'), 'table constrained', {constrained: true});

    await page.locator(`[data-insight-open="${normal.id}"]`).click();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height: 920}); await paint(page);
      await checkBadges(page.locator('#insights-detail-view'), `${width}px detail`);
    }
    await checkBadges(page.locator('#insights-detail-view'), 'detail constrained', {constrained: true});
    await page.locator('#insights-back').click(); await ready(page);
    await page.locator(`[data-insight-open="${approval.id}"]`).click();
    const approvalTab = page.locator('#insights-detail-view');
    await approvalTab.waitFor({state: 'visible'});
    assert.equal(await page.locator('dialog[open]').count(), 0, 'Approval source is displayed in a tab, not a drawer');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height: 920}); await paint(page);
      await checkBadges(approvalTab, `${width}px approval`);
    }
    await checkBadges(approvalTab, 'approval constrained', {constrained: true});
    await page.locator('#insights-back').click(); await ready(page);

    await page.locator('#insights-create').click();
    const create = page.locator('#insight-create-drawer');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height: 920}); await paint(page);
      await checkBadges(create, `${width}px creation header`);
    }
    await create.locator('[name=title]').fill(normal.title);
    await create.locator('[name=description]').fill(normal.description);
    const duplicates = page.locator('#insight-duplicate-sheet');
    await duplicates.waitFor({state: 'visible'});
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height: 920}); await paint(page);
      await checkBadges(duplicates, `${width}px duplicates`);
    }
    await checkBadges(duplicates, 'duplicates constrained', {constrained: true});
    assert.deepEqual(errors, []);
    console.log(`PASS: source ellipsis, preserved full labels, responsive metadata and IDs; cards 320–3840px, table, detail, approval, creation header and duplicate sheet. Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

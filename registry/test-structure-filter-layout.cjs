/* Compact structure-filter layout and responsive interaction regression.
 * Run with bundled Node; BPM_PLAYWRIGHT may point to another Playwright module.
 * Optional argv[2]: absolute standalone HTML path, copied and tested offline.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const standalone = process.argv[2];
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-filter-layout-'));
let file = path.join(__dirname, 'index.html');
if (standalone) {
  assert(path.isAbsolute(standalone), 'Provide an absolute standalone HTML path');
  file = path.join(output, 'relocated-offline.html');
  fs.copyFileSync(standalone, file);
}
const kinds = ['block', 'division', 'product'];
const near = (actual, expected, message) => assert(Math.abs(actual - expected) <= 1, `${message}: ${actual} vs ${expected}`);
const ready = page => page.waitForFunction(() => document.getElementById('structure-list')?.getAttribute('aria-busy') === 'false');
const paint = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

async function geometry(page, label, singleRow) {
  const data = await page.evaluate(() => {
    const box = element => {
      const rect = element.getBoundingClientRect();
      return {x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height};
    };
    const filters = document.getElementById('structure-toolbar');
    return {
      viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
      assets:[...filters.querySelectorAll('img')].filter(img=>img.getClientRects().length).map(img=>({src:img.getAttribute('src').slice(0,80),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,...box(img)})),
      filters: {...box(filters), scrollWidth: filters.scrollWidth, clientWidth: filters.clientWidth},
      children: [...filters.children].filter(element=>element.getClientRects().length).map(element => ({id: element.id || element.className, ...box(element)})),
      controls: ['block', 'division', 'product'].map(kind => {
        const host = document.getElementById(`structure-${kind}`), control = host.querySelector('.select-control');
        const input = host.querySelector('.select-input'), style = getComputedStyle(input);
        const canvas = document.createElement('canvas').getContext('2d');
        canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return {kind, control: box(control), input: box(host.querySelector('.select-input')),
          allTextWidth: canvas.measureText('Все').width,
          content: box(host.querySelector('.select-content')), toggle: box(host.querySelector('.select-toggle')),
          eye: host.querySelector('.select-visibility') ? box(host.querySelector('.select-visibility')) : null,
          eyeImage: host.querySelector('.select-visibility img') ? box(host.querySelector('.select-visibility img')) : null};
      }),
      separators: [...filters.querySelectorAll('.structure-level-separator')].filter(element => element.getClientRects().length).map(box)
    };
  });
  assert(data.documentWidth <= data.viewport + 1 && data.bodyWidth <= data.viewport + 1, `${label}: no page overflow`);
  for(const asset of data.assets){assert(asset.naturalWidth>0&&asset.naturalHeight>0,`${label}: image loads ${asset.src}`);near(asset.width,asset.naturalWidth,`${label}: native icon width ${asset.src}`);near(asset.height,asset.naturalHeight,`${label}: native icon height ${asset.src}`);}
  assert(data.filters.scrollWidth <= data.filters.clientWidth + 1, `${label}: filters do not overflow`);
  assert.equal(data.children.length, 6, `${label}: six top-level filter groups, including people`);
  for (const child of data.children) {
    assert(child.x >= data.filters.x - 1 && child.right <= data.filters.right + 1, `${label}: ${child.id} stays within filters`);
    for (const other of data.children.filter(item => item !== child)) {
      assert(Math.min(child.right, other.right) - Math.max(child.x, other.x) <= 1 ||
        Math.min(child.bottom, other.bottom) - Math.max(child.y, other.y) <= 1, `${label}: ${child.id} does not overlap ${other.id}`);
    }
  }
  for (const item of data.controls) {
    near(item.control.height, 50, `${label}/${item.kind}: 50px control`);
    assert(item.input.width >= item.allTextWidth, `${label}/${item.kind}: input fits “Все” (${item.input.width} >= ${item.allTextWidth})`);
    for (const target of [item.input, item.toggle, item.eye].filter(Boolean)) {
      assert(target.x >= item.control.x && target.right <= item.control.right + 1, `${label}/${item.kind}: input and actions stay within their control`);
    }
    assert(item.content.right <= item.toggle.x + 1, `${label}/${item.kind}: input does not overlap dropdown action`);
    if (item.eye) {
      near(item.eye.width, 24, `${label}/${item.kind}: 24px eye target width`);
      near(item.eye.height, 24, `${label}/${item.kind}: 24px eye target height`);
      near(item.eyeImage.width, 24, `${label}/${item.kind}: 24px eye icon width`);
      near(item.eyeImage.height, 24, `${label}/${item.kind}: 24px eye icon height`);
      assert(item.toggle.right <= item.eye.x + 1 || item.eye.right <= item.toggle.x + 1, `${label}/${item.kind}: actions do not overlap`);
      assert(item.content.right <= item.eye.x + 1 || item.eye.right <= item.content.x + 1, `${label}/${item.kind}: eye does not overlap input`);
    }
  }
  if (singleRow) {
    near(data.filters.height, 50, `${label}: complete filter strip is one 50px row`);
    for (const child of data.children) near(child.y, data.filters.y, `${label}/${child.id}: same row`);
    for (const item of data.controls.slice(0, 3)) near(item.input.y, data.controls[0].input.y, `${label}/${item.kind}: level inputs share a baseline`);
    assert.equal(data.separators.length, 2, `${label}: both level separators visible`);
    for (const separator of data.separators) {
      near(separator.width, 16, `${label}: 16px separator width`);
      near(separator.height, 16, `${label}: 16px separator height`);
      near(separator.y + separator.height / 2, data.filters.y + 25, `${label}: separator centered in row`);
    }
  }
  return data;
}

async function eyesWork(page, label) {
  for (const kind of kinds) {
    const eye = page.locator(`#structure-${kind} .select-visibility`), input = page.locator(`#structure-${kind}-input`);
    assert.equal(await eye.getAttribute('aria-pressed'), 'true', `${label}/${kind}: initially shown`);
    await eye.click();
    assert.equal(await eye.getAttribute('aria-pressed'), 'false', `${label}/${kind}: can hide`);
    assert.equal(await input.isDisabled(), true, `${label}/${kind}: hiding disables input`);
    assert.equal(await eye.isDisabled(), false, `${label}/${kind}: eye remains enabled`);
    assert.equal(await page.locator(`#structure-${kind}-list`).count(), 0, `${label}/${kind}: eye does not open list`);
    await eye.focus();
    await page.keyboard.press('Space');
    assert.equal(await eye.getAttribute('aria-pressed'), 'true', `${label}/${kind}: keyboard can restore`);
    assert.equal(await input.isDisabled(), false, `${label}/${kind}: restored input is enabled`);
  }
}

async function mobileTargets(page, label) {
  for (const kind of kinds) {
    const input = page.locator(`#structure-${kind}-input`);
    await input.click();
    assert.equal(await input.getAttribute('aria-expanded'), 'true', `${label}/${kind}: input opens options`);
    assert.equal(await page.locator(`#structure-${kind}-list`).isVisible(), true, `${label}/${kind}: options are accessible`);
    await page.keyboard.press('Escape');
  }
  await eyesWork(page, label);
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    for (const menu of ['expanded', 'collapsed']) {
      const context = await browser.newContext({offline: true, viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
      await context.addInitScript(menu => {
        localStorage.clear();
        localStorage.setItem('bpm-registry-menu', menu);
        const timeout = window.setTimeout;
        window.setTimeout = function(callback, delay, ...args) {return timeout.call(window, callback, delay === 2000 ? 30 : delay, ...args);};
      }, menu);
      const page = await context.newPage(), errors = [], failed = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('request', request => {
        if (/^https?:/i.test(request.url()) || (standalone && request.url().startsWith('file:') && request.url().split('#')[0] !== pathToFileURL(file).href)) external.push(request.url());
      });
      try {
        await page.goto(`${pathToFileURL(file).href}#main`);
        await page.locator('#structure-toggle').click();
        await ready(page);
        assert.equal(await page.locator('body').evaluate(element => element.classList.contains('menu-collapsed')), menu === 'collapsed');
        for (const width of menu === 'expanded' ? [1920, 1720] : [1920, 1720, 1440]) {
          const label = `${width}px/${menu}`;
          await page.setViewportSize({width, height: 1080});
          await paint(page);
          await geometry(page, label, true);
          await eyesWork(page, label);
          await geometry(page, `${label}/restored`, true);
          await page.locator('#structure-toolbar').screenshot({path: path.join(output, `filters-${width}-${menu}.png`)});
          console.log(`PASS — ${label}: one 50px row, aligned levels and functional eyes`);
        }
        assert.equal(await page.locator('#structure-owner,#structure-average-toggle,#structure-chart-toggle').count(),0,'Removed settings have no hidden controls');
        await page.locator('#structure-sort .select-toggle').click();
        await page.locator('#structure-sort-list [data-option="average-desc"]').click();
        assert.equal(await page.locator('#structure-sort-input').inputValue(),'Средняя эффективность ↓');
        await page.locator('#structure-sort-input').focus();
        await page.keyboard.press('Escape');
        await page.keyboard.press('ArrowDown');
        assert(await page.locator('#structure-sort-list').isVisible(),'Compact sorting is keyboard accessible');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#structure-sort-list').count(),0,'Escape closes sorting');
        if (menu === 'collapsed') {
          for (const width of [390, 320]) {
            const label = `${width}px/mobile`;
            await page.setViewportSize({width, height: 844});
            await paint(page);
            await geometry(page, label, false);
            await mobileTargets(page, label);
            await geometry(page, `${label}/restored`, false);
            console.log(`PASS — ${label}: no overflow, usable inputs and eye controls`);
          }
          await page.setViewportSize({width: 1720, height: 1080});
          await page.mouse.move(1710, 1000);
          await page.evaluate(() => scrollTo(0, 0));
          await paint(page);
          await geometry(page, '1720px/desktop round-trip', true);
          await eyesWork(page, '1720px/desktop round-trip');
          console.log('PASS — desktop layout and eye controls recover after mobile widths');
        }
        assert.deepEqual(errors, [], `${menu}: no runtime errors`);
        assert.deepEqual(failed, [], `${menu}: no failed offline assets`);
        assert.deepEqual(external, [], `${menu}: no external dependencies`);
      } finally {await context.close();}
    }
    console.log(`Filter layout screenshots: ${output}`);
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

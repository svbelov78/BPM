/* Insights search uses a placeholder, not a prefilled or black prompt.
 * node test-insight-search-placeholder.cjs [index.html | standalone.html] */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-insight-search-placeholder-'));
let source = path.resolve(process.argv[2] || path.join(__dirname, 'index.html'));
if (path.basename(source) !== 'index.html') {
  const isolated = path.join(output, 'prototype.html');
  fs.copyFileSync(source, isolated);
  source = isolated;
}
const expectedPrompt = 'Введите ID, название, процесс, автора...';
const ready = page => page.waitForFunction(() => document.querySelector('#insights-results')?.getAttribute('aria-busy') === 'false');

async function readAppearance(input) {
  return input.evaluate(node => {
    const style = getComputedStyle(node), placeholder = getComputedStyle(node, '::placeholder');
    const probe = document.createElement('span');
    node.parentElement.append(probe);
    const tokenColor = name => {probe.style.color = `var(${name})`;return getComputedStyle(probe).color;};
    const placeholderToken = tokenColor('--placeholder'), textToken = tokenColor('--text');
    probe.remove();
    return {
      value: node.value, prompt: node.getAttribute('placeholder'),
      visiblePrompt: node.matches(':placeholder-shown'),
      placeholderColor: placeholder.color, placeholderOpacity: placeholder.opacity,
      textColor: style.color, placeholderToken, textToken
    };
  });
}

async function main() {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, offline: true, reducedMotion: 'reduce'});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(pathToFileURL(source).href + '#insights');
    await ready(page);
    const input = page.locator('#insights-search');
    for (const width of [1440, 320]) {
      await page.setViewportSize({width, height: 900});
      await input.fill('');
      await ready(page);
      await page.locator('#insights-title').focus();
      const idle = await readAppearance(input);
      assert.equal(idle.value, '', `${width}px: prompt is not stored as input text`);
      assert.equal(idle.prompt, expectedPrompt, `${width}px: intended prompt is the real placeholder attribute`);
      assert.ok(idle.visiblePrompt, `${width}px: empty search displays its placeholder`);
      assert.equal(idle.placeholderColor, idle.placeholderToken, `${width}px: placeholder uses the design-system placeholder color`);
      assert.equal(idle.placeholderOpacity, '1', `${width}px: browser opacity does not alter the design-system color`);
      assert.notEqual(idle.placeholderColor, idle.textToken, `${width}px: placeholder is distinct from actual entered text`);
      await input.focus();
      const focused = await readAppearance(input);
      assert.equal(focused.placeholderColor, idle.placeholderToken, `${width}px: focused empty field keeps the grey placeholder`);
      await page.screenshot({path: path.join(output, `empty-focused-${width}.png`)});
      await input.fill('INS-000060');
      await ready(page);
      const filled = await readAppearance(input);
      assert.equal(filled.value, 'INS-000060', `${width}px: typing remains available`);
      assert.equal(filled.visiblePrompt, false, `${width}px: typing removes the placeholder`);
      assert.equal(filled.textColor, filled.textToken, `${width}px: actual search text remains black`);
      await page.locator('#insights-clear-search').click();
      await ready(page);
      const cleared = await readAppearance(input);
      assert.equal(cleared.value, '', `${width}px: clear restores empty input`);
      assert.equal(cleared.placeholderColor, cleared.placeholderToken, `${width}px: clear restores the same grey prompt`);
      assert.ok(cleared.visiblePrompt, `${width}px: clear restores the real placeholder`);
      console.log(`PASS — ${width}px: empty, focused, typed and cleared search use the correct placeholder/text colors`);
    }
    assert.deepEqual(errors, [], 'No runtime errors');
    console.log(`Screenshots: ${output}`);
  } finally {await context.close();await browser.close();}
}
main().catch(error => {console.error(error);process.exitCode = 1;});

/* Embedded SF Pro regression: local file:// source and a renamed standalone
 * copied alone to an unrelated directory, both offline in isolated Chrome.
 * node registry/test-font-portability.cjs [standalone.html] [source/index.html]
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const family = 'BPM SF Pro';
const weights = [400, 510, 590, 700];
const glyphs = 'Съешь ещё этих мягких французских булок Ёё Йй ABC xyz 0123456789 !?.,:;()[]{} / + − × ÷ = % ₽ € $ £ ¥ № © ® ™ • … «» “”—';
const standalone = path.resolve(process.argv[2] || path.join(__dirname, '..', 'Sber-BPM-Registry-Standalone.html'));
const source = path.resolve(process.argv[3] || path.join(__dirname, 'index.html'));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-font-portability-qa-'));
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-font-isolated-'));
const copy = path.join(isolated, 'renamed-offline-prototype.html');
const measurements = [];
const routes = [
  {name:'main', panel:'#registry-panel', ready:'#results'},
  {name:'tasks', panel:'#tasks-panel', ready:'#tasks-results'},
  {name:'insights', panel:'#insights-panel', ready:'#insights-results'},
  {name:'cabinet', panel:'#cabinet-panel', ready:'#cabinet-feed-insights'}
];
const report = message => console.log(`PASS — ${message}`);
const normalize = name => name.replace(/^["']|["']$/g, '');

async function settle(page) {
  const faces = await page.evaluate(async ({family, weights, glyphs}) => {
    const loaded = await Promise.all(weights.map(weight => document.fonts.load(`${weight} 17px "${family}"`, glyphs)));
    await document.fonts.ready;
    for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame);
    return loaded.map((fonts, index) => ({weight:weights[index], faces:fonts.map(font => ({family:font.family, weight:font.weight, style:font.style, status:font.status}))}));
  }, {family, weights, glyphs});
  for (const load of faces) {
    assert.ok(load.faces.length > 0, `${load.weight}: embedded family exists`);
    assert.ok(load.faces.every(face => normalize(face.family) === family && face.status === 'loaded' && face.style === 'normal'), `${load.weight}: upright embedded face loads`);
  }
  return faces;
}

async function customFonts(session, selector, label) {
  const {root} = await session.send('DOM.getDocument', {depth:1, pierce:true});
  const {nodeId} = await session.send('DOM.querySelector', {nodeId:root.nodeId, selector});
  assert.ok(nodeId, `${label}: inspected node exists`);
  const {fonts} = await session.send('CSS.getPlatformFontsForNode', {nodeId});
  const used = fonts.filter(font => font.glyphCount > 0);
  assert.ok(used.length > 0, `${label}: browser reports rendered glyphs`);
  assert.ok(used.every(font => font.isCustomFont), `${label}: no system font fallback (${JSON.stringify(used)})`);
  return used;
}

async function verifyFixtures(page, session, label) {
  await page.evaluate(({glyphs, weights}) => {
    const host = document.createElement('section');
    host.id = 'bpm-font-portability-fixtures';
    Object.assign(host.style, {position:'fixed', zIndex:'999999', top:'16px', left:'16px', width:'calc(100vw - 32px)', padding:'12px', background:'white', color:'#1a1a1a'});
    for (const weight of weights) {
      const line = document.createElement('div');
      line.id = `bpm-font-probe-${weight}`;
      line.textContent = glyphs;
      Object.assign(line.style, {fontWeight:String(weight), fontSize:'17px', lineHeight:'24px', overflowWrap:'anywhere', fontVariationSettings:'"wdth" 100'});
      host.append(line);
    }
    const button = document.createElement('button');
    button.id = 'bpm-font-probe-button';button.textContent = 'Кнопка Ёё Йй Button ₽ €';host.append(button);
    document.body.append(host);
  }, {glyphs, weights});
  try {
    await settle(page);
    for (const weight of weights) {
      const selector = `#bpm-font-probe-${weight}`;
      const style = await page.locator(selector).evaluate(element => {
        const style = getComputedStyle(element);
        return {family:style.fontFamily, weight:style.fontWeight, width:style.fontVariationSettings, optical:style.fontOpticalSizing, synthesis:style.fontSynthesis};
      });
      assert.equal(normalize(style.family.split(',')[0].trim()), family, `${label}/${weight}: embedded family is first`);
      assert.equal(style.weight, String(weight), `${label}/${weight}: exact variable weight`);
      assert.equal(style.width, '"wdth" 100', `${label}/${weight}: width axis preserved`);
      assert.equal(style.optical, 'auto', `${label}/${weight}: optical sizing enabled`);
      assert.equal(style.synthesis, 'none', `${label}/${weight}: synthetic styles disabled`);
      measurements.push({label, weight, style, fonts:await customFonts(session, selector, `${label}/${weight} Cyrillic, Latin and symbols`)});
    }
    measurements.push({label, control:'button', fonts:await customFonts(session, '#bpm-font-probe-button', `${label}/inherited button`)});
    report(`${label}: all four exact weights render Cyrillic Ё/ё/Й/й, Latin and currency/punctuation with custom font glyphs`);
  } finally {
    await page.locator('#bpm-font-portability-fixtures').evaluate(element => element.remove());
  }
}

async function inspectVisible(page, session, panel, label) {
  const samples = await page.evaluate(panel => {
    const visible = element => {
      const box = element.getBoundingClientRect(), style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const elements = [...document.querySelectorAll(`${panel} h1, ${panel} h2, ${panel} h3, ${panel} p, ${panel} button, ${panel} input, ${panel} textarea, ${panel} .internal-label`)]
      .filter(element => visible(element) && (element.value || element.placeholder || element.textContent).trim());
    const samples = elements.slice(0, 40).map((element, index) => {
      element.dataset.bpmFontQa = String(index);
      const style = getComputedStyle(element);
      return {selector:`[data-bpm-font-qa="${index}"]`, tag:element.tagName, family:style.fontFamily, text:(element.value || element.placeholder || element.textContent).trim().slice(0, 90), hasText:[...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())};
    });
    return samples;
  }, panel);
  try {
    assert.ok(samples.length >= 3, `${label}: visible production typography sampled`);
    for (const sample of samples) assert.equal(normalize(sample.family.split(',')[0].trim()), family, `${label}/${sample.tag}: production text inherits embedded family`);
    const text = samples.find(sample => sample.hasText && !['INPUT','TEXTAREA'].includes(sample.tag));
    assert.ok(text, `${label}: visible production text is available`);
    const fonts = await customFonts(session, text.selector, `${label}/${text.tag} production text`);
    const sizes = await page.evaluate(() => ({viewport:innerWidth, document:document.documentElement.scrollWidth, body:document.body.scrollWidth}));
    assert.ok(sizes.document <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1, `${label}: no horizontal document overflow (${JSON.stringify(sizes)})`);
    measurements.push({label, sizes, samples:samples.map(({selector, hasText, ...sample}) => sample), fonts});
  } finally {
    await page.evaluate(() => document.querySelectorAll('[data-bpm-font-qa]').forEach(element => delete element.dataset.bpmFontQa));
  }
}

async function inspectForm(page, session, label) {
  await page.locator('#insights-create').click();
  const drawer = page.locator('#insight-create-drawer[open]');
  await drawer.waitFor();
  try {
    for (const tag of ['input', 'textarea']) {
      const control = drawer.locator(tag).filter({visible:true}).first();
      await control.scrollIntoViewIfNeeded();
      const style = await control.evaluate(element => {
        const style = getComputedStyle(element);
        return {family:style.fontFamily, weight:style.fontWeight, size:style.fontSize, text:element.value || element.placeholder, font:style.font};
      });
      assert.equal(normalize(style.family.split(',')[0].trim()), family, `${label}/${tag}: production form control uses embedded family`);
      // Chrome does not expose native control text through this CDP method.
      // A visible probe with the control's computed font checks the same face.
      await page.evaluate(style => {
        const probe = document.createElement('span');probe.id = 'bpm-font-control-probe';
        Object.assign(probe.style, {position:'fixed', zIndex:'999999', top:'16px', left:'16px', width:'calc(100vw - 32px)', font:style.font, overflowWrap:'anywhere', background:'white'});
        probe.textContent = style.text || 'Проверка Ёё Йй Input textarea ₽ €';
        document.querySelector('#insight-create-drawer').append(probe);
      }, style);
      try {
        await settle(page);
        measurements.push({label, control:tag, style, fonts:await customFonts(session, '#bpm-font-control-probe', `${label}/${tag} computed-font text`)});
      } finally {
        await page.locator('#bpm-font-control-probe').evaluate(element => element.remove());
      }
    }
    await page.screenshot({path:path.join(output, `${label}-form.png`)});
  } finally {
    await page.keyboard.press('Escape');
    await drawer.waitFor({state:'hidden'});
  }
}

async function verifyDocument(browser, file, name) {
  const base = pathToFileURL(file).href;
  const context = await browser.newContext({offline:true, reducedMotion:'reduce', viewport:{width:1920, height:1080}});
  const errors = [], failures = [], unexpected = [];
  context.on('requestfailed', request => failures.push(`${request.url().slice(0, 160)}: ${request.failure()?.errorText}`));
  context.on('request', request => {
    const url = request.url();
    if (/^https?:/i.test(url) || name === 'standalone' && !/^(data:|blob:)/.test(url) && url.split(/[?#]/)[0] !== base) unexpected.push(url.slice(0, 160));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  const session = await context.newCDPSession(page);
  await session.send('DOM.enable');await session.send('CSS.enable');
  try {
    for (const width of [1920, 390]) {
      await page.setViewportSize({width, height:width === 390 ? 844 : 1080});
      for (const route of routes) {
        const label = `${name}-${route.name}-${width}`;
        await page.goto(`${base}#${route.name}`);
        await page.locator(`${route.panel}:not([hidden])`).waitFor();
        await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-busy') === 'false', route.ready);
        const faces = await settle(page);
        if (route.name === 'main') {
          measurements.push({label, faces});
          await verifyFixtures(page, session, label);
        }
        await inspectVisible(page, session, route.panel, label);
        await page.screenshot({path:path.join(output, `${label}.png`)});
        if (route.name === 'insights') await inspectForm(page, session, label);
        report(`${label}: visible text and controls use embedded family; viewport fits`);
      }
    }
    assert.deepEqual(errors, [], `${name}: no script errors`);
    assert.deepEqual(failures, [], `${name}: no failed resource loads`);
    assert.deepEqual(unexpected, [], `${name}: no external or standalone sibling resource requests`);
  } finally {
    await session.detach();await context.close();
  }
}

(async () => {
  assert.ok(fs.existsSync(source), `Source file exists: ${source}`);
  assert.ok(fs.existsSync(standalone), `Build standalone first: ${standalone}`);
  const html = fs.readFileSync(standalone, 'utf8');
  const encoded = html.match(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g) || [];
  assert.equal(encoded.length, 1, 'Standalone stores the upright WOFF2 exactly once, without a duplicate runtime asset');
  assert.match(html, /BPM SF Pro/, 'Standalone contains the embedded font declaration');
  fs.copyFileSync(standalone, copy);
  assert.deepEqual(fs.readdirSync(isolated), ['renamed-offline-prototype.html'], 'Isolated directory has the renamed HTML only');
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    await verifyDocument(browser, source, 'source');
    await verifyDocument(browser, copy, 'standalone');
    assert.deepEqual(fs.readdirSync(isolated), ['renamed-offline-prototype.html']);
    fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify({source, standalone, isolatedFile:copy, measurements}, null, 2));
    report(`Source and isolated standalone passed offline at 1920/390px; one WOFF2 payload. Screenshots and font evidence: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});

/* Figma 03.28 / 03.31 palette regression, 22 September 2026.
 * Uses production renderers and styles in an isolated Chrome page. Synthetic
 * values are DOM fixtures only: source records, thresholds and geometry stay intact.
 * Run with bundled Node, or set BPM_PLAYWRIGHT to a Playwright module path.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
const RGB = {green:'rgb(52, 199, 89)', journeyGreen:'rgb(42, 198, 83)', yellow:'rgb(255, 204, 0)', red:'rgb(255, 56, 60)', white:'rgb(255, 255, 255)', border:'rgb(127, 127, 127)'};
const samples = [null, undefined, 0, 23.5, 44.9, 45, 45.1, 64.9, 65, 65.1, 75, 84.9, 85, 85.1, 100];
const report = label => console.log(`PASS — ${label}`);
const near = (actual, expected, label, tolerance = 0.1) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
function gradient(value, label) {
  assert.match(value, /^linear-gradient\(/, `${label}: a linear gradient`);
  assert.ok(value.includes('rgb(172, 203, 180) 16.697%'), `${label}: #ACCBB4 at 16.697% (${value})`);
  assert.ok(value.includes('rgb(163, 163, 163) 83.495%'), `${label}: #A3A3A3 at 83.495% (${value})`);
  assert.ok(!/97, 85, 245|0, 136, 255/.test(value), `${label}: no former purple/blue stops`);
}
function outline(value, label) {
  assert.match(value, /rgb\(127, 127, 127\) 0px 0px 0px 1px inset|inset rgb\(127, 127, 127\) 0px 0px 0px 1px/, `${label}: unscaled, inset 1px #7F7F7F outline (${value})`);
}
async function registryReady(page, view = 'cards') {
  await page.locator(view === 'cards' ? '.entity-card:not(.skeleton-card)' : '.registry-table tr[data-record]').first().waitFor();
}
async function structureReady(page) {
  await page.waitForFunction(() => document.querySelector('#structure-list')?.getAttribute('aria-busy') === 'false');
}
async function drawerReady(page) {
  await page.waitForFunction(() => {
    const drawer = document.querySelector('#process-drawer');
    return drawer?.open && !drawer.classList.contains('pd-is-loading') && !drawer.querySelector('.pd-main').inert;
  });
}
async function closeDrawer(page) {
  await page.keyboard.press('Escape');
  await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
}
async function noOverflow(page, label) {
  const size = await page.evaluate(() => ({viewport:innerWidth, html:document.documentElement.scrollWidth, body:document.body.scrollWidth}));
  assert.ok(size.html <= size.viewport + 1 && size.body <= size.viewport + 1, `${label}: page overflow ${JSON.stringify(size)}`);
}

async function glyphs(page, selector, journey = false) {
  return page.locator(selector).evaluateAll((elements, journey) => elements.map(element => {
    const sphere = element.querySelector(journey ? '.jd-sphere-ball' : '.efficiency-sphere');
    const curtain = element.querySelector(journey ? '.jd-curtain' : '.efficiency-curtain');
    const box = element.getBoundingClientRect(), sphereBox = sphere?.getBoundingClientRect(), curtainBox = curtain?.getBoundingClientRect();
    const style = sphere && getComputedStyle(sphere);
    return {classes:element.className, value:element.dataset[journey ? 'efficiencyPercent' : 'efficiency'], text:element.textContent,
      width:box.width, height:box.height, sphereWidth:sphereBox?.width, sphereHeight:sphereBox?.height,
      image:style?.backgroundImage, color:style?.backgroundColor, shadow:style?.boxShadow,
      curtain:!!curtain, curtainStart:curtainBox && (journey ? curtainBox.top - box.top : curtainBox.left - box.left)};
  }), journey);
}
function checkGlyph(row, value, journey, label, structureBucket) {
  const unrated = value === null || value === undefined;
  if (unrated) {
    if (journey) {
      assert.match(row.classes, /jd-efficiency-unrated/, label);
      assert.equal(row.text.trim(), '—', `${label}: no numeric rating`);
    } else {
      assert.match(row.classes, /efficiency-unrated/, label);
      assert.equal(row.color, RGB.white, label);
      assert.equal(row.image, 'none', label);
      outline(row.shadow, label);
      assert.equal(row.value, undefined, `${label}: no fabricated zero data attribute`);
    }
    assert.equal(row.curtain, false, `${label}: no curtain for unrated`);
    return;
  }
  const tone = journey ? (value > 85 ? 'positive' : value > 65 ? 'indigo' : value > 45 ? 'attention' : 'danger') : (value < 45 ? 'red' : value < 65 ? 'yellow' : value < 85 ? 'blue' : 'green');
  assert.ok(row.classes.includes(journey ? `jd-efficiency--${tone}` : `efficiency-${tone}`), `${label}: existing threshold ${tone}`);
  assert.equal(Number(row.value), value, `${label}: original percentage`);
  const paintedTone = structureBucket === undefined ? tone : ['green','blue','yellow','red'][structureBucket];
  if (paintedTone === 'blue' || paintedTone === 'indigo') gradient(row.image, label);
  else {
    assert.equal(row.image, 'none', `${label}: solid category unchanged`);
    const expected = {positive:RGB.journeyGreen, green:RGB.green, attention:RGB.yellow, yellow:RGB.yellow, danger:RGB.red, red:RGB.red}[paintedTone];
    assert.equal(row.color, expected, `${label}: solid category unchanged`);
  }
  const size = journey ? 64 : 24;
  near(row.width, size, `${label}: glyph width`);
  near(row.height, size, `${label}: glyph height`);
  near(row.sphereWidth, size, `${label}: sphere width`);
  near(row.sphereHeight, size, `${label}: sphere height`);
  assert.equal(row.curtain, value < 100, `${label}: original curtain presence`);
  if (value < 100) near(row.curtainStart, journey ? (value === 0 ? -32 : 64 * value / 100) : (value === 0 ? -8 : 24 * value / 100 + 1), `${label}: curtain boundary`);
}

async function rendererFixtures(page) {
  await page.evaluate(values => {
    const fixture = document.createElement('section');
    fixture.id = 'efficiency-palette-fixture';
    fixture.style.cssText = 'position:absolute;top:0;left:0;width:100%;z-index:-1;pointer-events:none;background:#fff;padding:40px;box-sizing:border-box';
    fixture.innerHTML = values.map((value,index) => `<article data-palette-sample="${index}" style="display:inline-flex;flex-direction:column;gap:28px;align-items:center;padding:36px;width:170px;vertical-align:top"><h3>${value == null ? 'Без подсчёта' : value + '%'}</h3><div data-palette-card>${window.BpmCardVisuals.efficiency({efficiency:value})}</div><div data-palette-table>${window.BpmCardVisuals.efficiency({efficiency:value},true)}</div><div data-palette-journey>${window.BpmJourneyDetails.renderSphere(value)}</div></article>`).join('');
    document.body.append(fixture);
  }, samples);
  for (const mode of ['card','table']) {
    const rows = await glyphs(page, `#efficiency-palette-fixture [data-palette-${mode}] .bpm-efficiency-glyph`);
    assert.equal(rows.length, samples.length);
    rows.forEach((row,index) => checkGlyph(row,samples[index],false,`${mode} renderer ${String(samples[index])}`));
    const unrated = await page.locator(`#efficiency-palette-fixture [data-palette-${mode}] .efficiency`).evaluateAll(elements => elements.slice(0,2).map(element => ({text:element.textContent, label:element.getAttribute('aria-label'), value:element.dataset.efficiencyPercent})));
    unrated.forEach(row => {
      assert.equal(row.text.trim(), '—');
      assert.equal(row.label, 'Эффективность не оценивалась');
      assert.equal(row.value, undefined);
    });
  }
  const journeys = await glyphs(page, '#efficiency-palette-fixture [data-palette-journey] > span', true);
  journeys.forEach((row,index) => checkGlyph(row,samples[index],true,`journey renderer ${String(samples[index])}`));
  await page.locator('#efficiency-palette-fixture').evaluate(element => {element.hidden = true;});
  report('rendered card/table/journey fixtures: exact gradient, unrated state, thresholds and sphere geometry');
}

async function regularViews(page) {
  for (const entity of ['paths','processes']) {
    await page.locator(`#${entity}-tab`).click();
    for (const view of ['cards','table']) {
      await page.locator(`#${view}-view`).click();
      await registryReady(page,view);
      const rows = await glyphs(page, `${view === 'cards' ? '.entity-card' : '.registry-table'} .bpm-efficiency-glyph`);
      assert.ok(rows.length > 0, `${entity} ${view}: actual glyphs rendered`);
      rows.forEach((row,index) => checkGlyph(row,Number(row.value),false,`${entity} ${view} ${index}`));
      await noOverflow(page, `${entity} ${view}`);
    }
  }
  await page.locator('#cards-view').click();
  await registryReady(page);
  report('actual registry cards and tables for both entities retain other category colors');
}

async function structureViews(page) {
  const snapshots = [];
  await page.locator('#structure-toggle').click();
  await structureReady(page);
  for (const entity of ['processes','paths']) {
    const tab = page.locator(`#structure-${entity}-tab`);
    if (await tab.getAttribute('aria-pressed') !== 'true') {await tab.click(); await structureReady(page);}
    for (const type of [1,2]) {
      await page.locator('#structure-chart-toggle').setChecked(type === 1);
      await page.waitForFunction(type => [...document.querySelectorAll('.structure-chart')].every(chart => chart.dataset.chartType === String(type)), type);
      const charts = await page.locator('.structure-chart').evaluateAll((elements, entity) => {
        const model = window[entity === 'paths' ? 'BPM_STRUCTURE_PATHS' : 'BPM_STRUCTURE'];
        return elements.map(chart => {
          const node = model.nodes.find(node => node.id === chart.dataset.chart);
          return {id:node.id, total:node.total, buckets:node.buckets, segments:[...chart.querySelectorAll('.structure-segment')].map(segment => {
            const track = segment.querySelector('.structure-track'), fill = segment.querySelector('.structure-fill');
            const before = getComputedStyle(track,'::before'), after = getComputedStyle(track,'::after'), style = getComputedStyle(fill);
            return {bucket:Number(segment.dataset.bucket), count:Number(segment.dataset.count), ratio:Number(fill.dataset.fill), color:style.backgroundColor, image:style.backgroundImage,
              width:segment.getBoundingClientRect().width, trackWidth:track.getBoundingClientRect().width, fillWidth:fill.getBoundingClientRect().width,
              before:{content:before.content, display:before.display, opacity:before.opacity, image:before.backgroundImage, color:before.backgroundColor}, after:{width:parseFloat(after.width), shadow:after.boxShadow}};
          })};
        });
      }, entity);
      assert.equal(charts.length, 9, `${entity} Chart${type}: all root charts`);
      const seen = new Set();
      for (const chart of charts) {
        assert.equal(chart.segments.reduce((sum,segment) => sum + segment.count,0),chart.total);
        for (const segment of chart.segments) {
          const label = `${entity} Chart${type} ${chart.id} bucket${segment.bucket}`;
          seen.add(segment.bucket);
          assert.equal(segment.count,chart.buckets[segment.bucket], `${label}: source count unchanged`);
          near(segment.fillWidth,segment.trackWidth * segment.ratio,`${label}: original fill ratio`);
          if (segment.bucket === 1) gradient(segment.image,label);
          else {
            assert.equal(segment.image,'none',label);
            assert.equal(segment.color,[RGB.green,null,RGB.yellow,RGB.red,RGB.white][segment.bucket],label);
          }
          const hasTrack = segment.before.content !== 'none' && segment.before.display !== 'none' && Number(segment.before.opacity) > 0;
          if (type === 2 || segment.bucket === 4) assert.equal(hasTrack,false,`${label}: no translucent track`);
          else {
            assert.ok(hasTrack,`${label}: comparison track retained`);
            near(Number(segment.before.opacity),segment.bucket === 1 ? 0.15 : 0.25,`${label}: track opacity`,0.001);
            if (segment.bucket === 1) gradient(segment.before.image,`${label} track`);
          }
          if (segment.bucket === 4) {
            outline(segment.after.shadow,label);
            near(segment.after.width,segment.fillWidth,`${label}: outline follows actual fill without scaled border`);
          }
        }
      }
      assert.deepEqual([...seen].sort(),[0,1,2,3,4],`${entity} Chart${type}: cover every bucket`);
      // Prefer a non-maximal root so the overview visibly includes the .15 track.
      snapshots.push({entity,type,html:await page.locator('.structure-chart').evaluateAll(elements => {
        const sample = elements.find(element => {
          const fills = [1,4].map(bucket => element.querySelector(`.structure-segment[data-bucket="${bucket}"] .structure-fill`));
          return fills.every(fill => fill && Number(fill.dataset.fill) > 0 && Number(fill.dataset.fill) < 0.95);
        }) || elements[1] || elements[0];
        return sample.outerHTML;
      })});
      await noOverflow(page,`${entity} Chart${type}`);
    }
  }
  await page.locator('#structure-toggle').click();
  await registryReady(page);
  report('actual Structure Chart 1/2 × processes/journeys: five buckets, exact track opacity, white unrated fill and unscaled outline');
  return snapshots;
}

async function processDrawer(page) {
  await page.evaluate(() => window.BpmProcessDrawer.open(window.BPM_DATA.find(row => row.entity === 'processes')));
  await drawerReady(page);
  assert.equal(await page.locator('#process-drawer').getAttribute('data-pd-entity'),'processes');
  const bars = await page.locator('.pd-dynamics-bar').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element), stripe = getComputedStyle(element,'::before');
    return {height:element.getBoundingClientRect().height, classes:element.className, color:style.borderTopColor, border:style.borderTopWidth, image:stripe.backgroundImage, stripeHeight:stripe.height};
  }));
  const heights = [22,59,101,46,59,59,59,93,101,29.5,68.251,3];
  assert.equal(bars.length,heights.length);
  bars.forEach((bar,index) => {
    const label = `dynamics month ${index + 1}`;
    near(bar.height,heights[index],`${label}: height unchanged`);
    if ([1,4,5,6].includes(index)) {
      assert.match(bar.classes,/pd-dynamics-on-track/);
      gradient(bar.image,label);
      assert.equal(bar.stripeHeight,'4px');
    } else if (index >= 9) {
      // Updated Process Details instance 1122:37292 has no stripe in months 10–12.
      assert.equal(bar.border,'0px',`${label}: unstriped in the current Figma instance`);
      if (index < 11) assert.match(bar.classes,/pd-dynamics-unstriped/);
    } else assert.equal(bar.color,index === 0 ? RGB.red : index === 3 ? 'rgb(255, 141, 40)' : RGB.green,`${label}: Figma solid category`);
  });
  const monitor = await glyphs(page,'#pd-monitoring .bpm-efficiency-glyph');
  assert.ok(monitor.length > 0,'Process monitoring table uses production efficiency glyphs');
  monitor.forEach((row,index) => checkGlyph(row,Number(row.value),false,`process monitoring ${index}`));
  const html = await page.locator('.pd-dynamics-bars').evaluate(element => {
    const clone = element.cloneNode(true), original = element.querySelectorAll('.pd-dynamics-bar');
    clone.querySelectorAll('.pd-dynamics-bar').forEach((bar,index) => {bar.style.borderTop = getComputedStyle(original[index]).borderTop;});
    return clone.outerHTML;
  });
  await page.locator('.pd-dynamics-widget').screenshot({path:'/tmp/bpm-efficiency-palette-process-dynamics.png'});
  await closeDrawer(page);
  report('actual process drawer: monitoring glyphs, four on-track stripes, current Figma unstriped months 10–12 and unchanged bar heights');
  return html;
}

async function journeyDrawer(page) {
  const source = await page.evaluate(() => {
    const rows = window.BPM_STRUCTURE_PATHS.records;
    const row = rows.find(row => row.linkedProcesses.some(item => item.efficiency > 65 && item.efficiency <= 85) && row.linkedProcesses.some(item => item.efficiency === null));
    if (!row) throw new Error('Expected a source journey containing both on-track and unrated processes');
    window.BpmProcessDrawer.open(row);
    return {id:row.id, values:row.linkedProcesses.map(item => item.efficiency)};
  });
  await drawerReady(page);
  await page.locator('[data-jd-toggle-processes]').click();
  const rows = await glyphs(page,'.jd-process-card .jd-sphere-slot > span',true);
  assert.equal(rows.length,source.values.length,'Original journey/process relationships retained');
  rows.forEach((row,index) => checkGlyph(row,source.values[index],true,`actual journey ${source.id} process ${index}`));
  await closeDrawer(page);
  report('actual journey drawer: linked on-track spheres and unrated dashes, source relationships unchanged');
}

async function screenshots(page, charts, dynamics) {
  await page.evaluate(({charts,dynamics}) => {
    const fixture = document.querySelector('#efficiency-palette-fixture');
    fixture.hidden = false;
    fixture.removeAttribute('style');
    fixture.insertAdjacentHTML('afterbegin','<h1>Эффективность · Figma 03.28 / 03.31</h1><p>Production renderer samples · card / table / journey. Existing thresholds intentionally differ at 45 / 65 / 85.</p>');
    fixture.insertAdjacentHTML('beforeend',`<div class="palette-chart-grid">${charts.map(chart => `<section><h2>${chart.entity} · Chart ${chart.type}</h2><div class="palette-chart-scroll">${chart.html}</div></section>`).join('')}</div><section class="palette-dynamics"><h2>Динамика · 12 месяцев</h2>${dynamics}</section>`);
    const style = document.createElement('style');
    style.textContent='body{overflow:auto!important}body>:not(#efficiency-palette-fixture){display:none!important}#efficiency-palette-fixture{box-sizing:border-box;width:100%;padding:28px;background:#fff;color:#1a1a1a}#efficiency-palette-fixture>h1{font-size:26px;line-height:32px;margin-bottom:12px}#efficiency-palette-fixture>p{margin-bottom:20px}#efficiency-palette-fixture [data-palette-sample]{width:170px;max-width:100%;box-sizing:border-box;border:1px solid #d1d9e6;border-radius:16px;margin:4px;gap:28px!important}#efficiency-palette-fixture h3{font-size:14px;white-space:nowrap}#efficiency-palette-fixture h2{font-size:18px;line-height:24px;margin-bottom:14px}.palette-chart-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,450px),1fr));gap:24px;margin-top:32px}.palette-chart-scroll{max-width:100%;overflow-x:auto;padding:10px 0}.palette-dynamics{max-width:620px;margin-top:32px;padding:24px;background:#fff;border:1px solid #d1d9e6;border-radius:16px}@media(max-width:500px){#efficiency-palette-fixture{padding:16px}#efficiency-palette-fixture [data-palette-sample]{width:calc(50% - 8px);padding:30px 10px!important}}';
    // Only the screenshot gallery scales chart copies; actual responsive views
    // above retain their production geometry and their local scroll containers.
    style.textContent += '@media(max-width:500px){.palette-chart-scroll .structure-chart{zoom:.8}}';
    fixture.append(style);
  },{charts,dynamics});
  for (const width of [1920,390]) {
    await page.setViewportSize({width,height:1080});
    await noOverflow(page,`palette overview ${width}`);
    await page.screenshot({path:`/tmp/bpm-efficiency-palette-${width}.png`,fullPage:true});
  }
  report('desktop/mobile palette overviews saved in /tmp; no horizontal page overflow');
}

(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const errors = [];
  try {
    const page = await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'});
    page.on('pageerror',error => errors.push(error.message));
    page.on('requestfailed',request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.goto(url);
    await registryReady(page);
    const before = await page.evaluate(() => JSON.stringify([window.BPM_DATA,window.BPM_STRUCTURE_SOURCE,window.BPM_STRUCTURE,window.BPM_STRUCTURE_PATHS]));
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(['start','end','gradient','unrated-fill','unrated-border'].map(key => [key,style.getPropertyValue(key.startsWith('unrated') ? `--efficiency-${key}` : `--efficiency-on-track-${key}`).trim()]));
    });
    assert.equal(tokens.start.toLowerCase(),'#accbb4');
    assert.equal(tokens.end.toLowerCase(),'#a3a3a3');
    assert.ok(['#fff','#ffffff'].includes(tokens['unrated-fill'].toLowerCase()));
    assert.equal(tokens['unrated-border'].toLowerCase(),'#7f7f7f');
    assert.ok(tokens.gradient.includes('16.697%') && tokens.gradient.includes('83.495%'));
    const modelPalettes = await page.evaluate(() => [window.BPM_STRUCTURE,window.BPM_STRUCTURE_PATHS].map(model => model.colors.map(color => color.color)));
    for (const palette of modelPalettes) assert.deepEqual(palette,['#34c759','var(--efficiency-on-track-gradient)','#ffcc00','#ff383c','var(--efficiency-unrated-fill)'], 'Only the two intended model palette colors change; both entities share the dedicated tokens');
    await rendererFixtures(page);
    await regularViews(page);
    const charts = await structureViews(page);
    const dynamics = await processDrawer(page);
    await journeyDrawer(page);
    const after = await page.evaluate(() => JSON.stringify([window.BPM_DATA,window.BPM_STRUCTURE_SOURCE,window.BPM_STRUCTURE,window.BPM_STRUCTURE_PATHS]));
    assert.equal(after,before,'Rendering and UI interactions never mutate source records, hierarchy, counts or colors');
    report('source data and relationships unchanged across all renderers and views');
    await screenshots(page,charts,dynamics);
    assert.deepEqual(errors,[],'No page errors or failed local assets');
    report('efficiency palette regression complete');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});

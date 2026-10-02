/* ТОП-КП header spacing regression, measured from visible element geometry.
 * node test-top-kp-header-spacing.cjs [URL|index.html|standalone.html]
 * Standalone input is copied alone into a fresh directory and tested offline.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL,fileURLToPath} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const requested = process.argv[2] || path.join(__dirname,'index.html');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'bpm-top-kp-header-'));
const local = /^https?:/.test(requested) ? null : requested.startsWith('file:') ? fileURLToPath(requested.split('#')[0]) : path.resolve(requested);
let target = requested;
if (local && path.basename(local) !== 'index.html') {
  target = path.join(output,'isolated.html');
  fs.copyFileSync(local,target);
  assert.deepEqual(fs.readdirSync(output),['isolated.html']);
}
const base = (/^(https?:|file:)/.test(target) ? target : pathToFileURL(path.resolve(target)).href).split('#')[0];
const sizes = [[2047,1107],[2048,1108],[1920,1080],[1440,920],[1280,920],[3840,2160],[3840,920]];
const results = [], failures = [], errors = [], failed = [];
const paint = page => page.evaluate(async () => {
  await document.fonts.ready;
  for(let index=0;index<6;index++) await new Promise(requestAnimationFrame);
});

async function measure(page,mode,width,height,state) {
  await paint(page);
  const value = await page.locator('#top-kp-panel').evaluate(root => {
    const rect = element => element.getBoundingClientRect();
    const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    const titleParts = [...root.querySelectorAll('.top-kp-title-row h1,.top-kp-title-row .top-kp-legend')].filter(visible).map(rect);
    const captions = [...root.querySelectorAll('.top-kp-filter-caption')].filter(visible).map(rect);
    const filters = [...root.querySelectorAll('.top-kp-filter .field')].map(rect);
    const mapHeadings = [...root.querySelectorAll('.top-kp-map h2,.top-kp-map h3,.top-kp-map h4')].filter(visible).map(rect);
    const titleBottom = Math.max(...titleParts.map(box=>box.bottom));
    const captionTop = Math.min(...captions.map(box=>box.top));
    const filterBottom = Math.max(...filters.map(box=>box.bottom));
    const mapHeadingTop = Math.min(...mapHeadings.map(box=>box.top));
    const panel = rect(root), style = getComputedStyle(root);
    const map=root.querySelector('.top-kp-map'),viewport=root.querySelector('.top-kp-map-viewport');
    return {
      titleToCaption:captionTop-titleBottom,
      filtersToMap:mapHeadingTop-filterBottom,
      panelPaddingTop:parseFloat(style.paddingTop),
      visibleTopInset:Math.min(...titleParts.map(box=>box.top))-panel.top,
      titleBottom,captionTop,filterBottom,mapHeadingTop,
      collapsed:document.body.classList.contains('menu-collapsed'),
      menuPeek:document.body.classList.contains('menu-peek'),
      filtering:!root.querySelector('.top-kp-reset').hidden,
      filterCount:filters.length,captionCount:captions.length,
      count:root.querySelector('.top-kp-count').textContent,
      spacing:root.dataset.spacing,density:root.dataset.density,fit:root.dataset.fit,
      panelBottom:panel.bottom,mapTop:rect(map).top,
      mapFloors:map.children.length,viewportOverflow:viewport.scrollHeight-viewport.clientHeight,
      lastCardBottom:Math.max(...[...root.querySelectorAll('.top-kp-card')].map(card=>rect(card).bottom))
    };
  });
  const name = `${width}×${height} ${mode} ${state}`;
  const result = {name,...value};results.push(result);
  try {
    assert.equal(value.collapsed,mode==='collapsed','Actual sidebar mode matches requested mode');
    assert.equal(value.menuPeek,false,'Sidebar hover overlay is not active');
    assert.equal(value.filterCount,10);assert.equal(value.captionCount,3);
    assert.equal(value.filtering,state==='active');
    assert.equal(value.count,state==='active'?'61 / 136':'136');
    for(const key of ['titleToCaption','filtersToMap','panelPaddingTop','visibleTopInset']) {
      // At <=960px tall desktops only the title/caption gap contracts to12px;
      // the map gap and top inset retain16px so all three floors still fit.
      const minimum=key==='titleToCaption'&&width>=1280&&height<=960&&value.spacing==='compact'?12:16;
      assert.ok(Number.isFinite(value[key]),`${key}: finite geometry`);
      assert.ok(value[key]>=minimum-.1,`${key} must be at least ${minimum}px, got ${value[key]}px`);
    }
    if(width===1440&&height===920) {
      assert.equal(value.fit,'true','All three desktop map floors use the fitting layout');
      assert.equal(value.mapFloors,3);
      assert.ok(value.viewportOverflow<=1,`Map needs no internal scroll, overflow=${value.viewportOverflow}`);
      assert.ok(value.panelBottom<=height+1,`Panel remains within the screen, bottom=${value.panelBottom}`);
      assert.ok(value.lastCardBottom<=height+1,`Last card remains visible, bottom=${value.lastCardBottom}`);
    }
    console.log(`PASS ${name}: title→caption ${value.titleToCaption}px; filters→map ${value.filtersToMap}px; top padding ${value.panelPaddingTop}px`);
  } catch(error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name}: ${error.message}`);
    await page.screenshot({path:path.join(output,`failure-${width}x${height}-${mode}-${state}.png`)});
  }
  return result;
}

async function main() {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {
    for(const mode of ['expanded','collapsed']) {
      const context = await browser.newContext({offline:base.startsWith('file:'),viewport:{width:sizes[0][0],height:sizes[0][1]},reducedMotion:'reduce'});
      try {
        await context.addInitScript(mode=>localStorage.setItem('bpm-registry-menu',mode),mode);
        const page = await context.newPage();page.setDefaultTimeout(15000);
        page.on('pageerror',error=>errors.push(error.message));
        page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
        page.on('requestfailed',request=>failed.push(`${request.url()}: ${request.failure()?.errorText}`));
        await page.goto(`${base}#top-kp`);
        await page.waitForFunction(()=>!document.querySelector('#top-kp-panel')?.hidden&&document.querySelectorAll('.top-kp-card').length===136);
        for(const [width,height] of sizes) {
          await page.setViewportSize({width,height});await page.mouse.move(width-2,1);await paint(page);
          const before = await measure(page,mode,width,height,'none');
          await page.locator('#top-filter-efficiency-input').click();
          await page.locator('#top-filter-efficiency-list').getByRole('option',{name:'Лидер',exact:true}).click();
          await page.mouse.move(width-2,1);await page.keyboard.press('Escape');
          await page.locator('.top-kp-hover').waitFor({state:'hidden'});
          const active = await measure(page,mode,width,height,'active');
          if((width===2047||width===2048)&&mode==='expanded'||width===1440&&mode==='collapsed')await page.screenshot({path:path.join(output,`header-${width}x${height}-${mode}-active.png`)});
          await page.locator('.top-kp-reset').click();await page.mouse.move(width-2,1);
          const reset = await measure(page,mode,width,height,'reset');
          for(const phase of [active,reset]) {
            if(Math.abs(phase.mapTop-before.mapTop)>.25)failures.push(`${phase.name}: filter state moved map top ${before.mapTop}→${phase.mapTop}`);
          }
        }
      } finally {await context.close();}
    }
  } finally {await browser.close();}
  assert.deepEqual(errors,[],'No browser runtime errors');
  assert.deepEqual(failed,[],'No missing or online assets');
  console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',source:base,states:results.length,minimumGaps:Object.fromEntries(['titleToCaption','filtersToMap','panelPaddingTop','visibleTopInset'].map(key=>[key,Math.min(...results.map(result=>result[key]))])),failures,errors,failed,output},null,2));
  assert.deepEqual(failures,[],'All viewport/sidebar/filter combinations preserve comfortable header spacing');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

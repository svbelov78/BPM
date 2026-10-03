/* ТОП-КП opens with a narrow menu per visit, without changing other sections.
 * node test-top-kp-menu.cjs [URL|index.html|standalone.html]
 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {chromium}=require(process.env.BPM_PLAYWRIGHT||'/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const requested=process.argv[2]||path.join(__dirname,'index.html');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-top-kp-menu-'));
const local=/^https?:/.test(requested)?null:requested.startsWith('file:')?fileURLToPath(requested.split('#')[0]):path.resolve(requested);
let target=requested;
if(local&&path.basename(local)!=='index.html'){target=path.join(output,'isolated.html');fs.copyFileSync(local,target);assert.deepEqual(fs.readdirSync(output),['isolated.html']);}
const base=(/^(https?:|file:)/.test(target)?target:pathToFileURL(path.resolve(target)).href).split('#')[0];
const errors=[],failed=[];
const paint=page=>page.evaluate(async()=>{await document.fonts.ready;for(let index=0;index<5;index++)await new Promise(requestAnimationFrame);});
async function settle(page){await page.mouse.move((await page.viewportSize()).width-2,1);await paint(page);}
async function makePage(browser,preference,hash='#top-kp',width=1920){
  const context=await browser.newContext({viewport:{width,height:1080},reducedMotion:'reduce',offline:base.startsWith('file:')});
  await context.addInitScript(preference=>{if(preference==null)localStorage.removeItem('bpm-registry-menu');else localStorage.setItem('bpm-registry-menu',preference);},preference);
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>failed.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(`${base}${hash}`);await page.waitForFunction(hash=>hash==='#top-kp'?document.querySelectorAll('.top-kp-card').length===136:!document.querySelector('#cabinet-panel')?.hidden,hash);await settle(page);
  return{context,page};
}
async function check(page,{collapsed,stored,pinned=false,mobileOpen=false},label){
  const actual=await page.evaluate(()=>({
    collapsed:document.body.classList.contains('menu-collapsed'),pinned:document.body.classList.contains('menu-pinned'),peek:document.body.classList.contains('menu-peek'),
    mobileOpen:document.body.classList.contains('mobile-menu-open'),mobile:innerWidth<768,
    stored:localStorage.getItem('bpm-registry-menu'),aria:document.querySelector('#collapse-menu').getAttribute('aria-expanded'),burgerAria:document.querySelector('#mobile-menu').getAttribute('aria-expanded'),
    backdropHidden:document.querySelector('#sidebar-backdrop').hidden,inert:document.querySelector('#sidebar').inert,
    width:document.querySelector('#sidebar').getBoundingClientRect().width
  }));
  assert.equal(actual.collapsed,collapsed,`${label}: collapsed`);assert.equal(actual.pinned,pinned,`${label}: pinned`);
  assert.equal(actual.stored,stored,`${label}: saved global preference unchanged`);assert.equal(actual.mobileOpen,mobileOpen,`${label}: mobile drawer`);
  assert.equal(actual.peek,false,`${label}: no accidental desktop peek`);
  assert.equal(actual.aria,String(actual.mobile?mobileOpen:!collapsed),`${label}: menu ARIA`);
  assert.equal(actual.burgerAria,String(mobileOpen));assert.equal(actual.backdropHidden,!mobileOpen);
  assert.equal(actual.inert,actual.mobile&&!mobileOpen);
  if(!actual.mobile){if(collapsed)assert.ok(actual.width<120,`${label}: physically narrow sidebar`);else assert.ok(actual.width>200,`${label}: full sidebar`);}
}
async function revealNavigation(page){
  const mobile=(await page.viewportSize()).width<768;
  if(mobile){if(!await page.locator('body').evaluate(body=>body.classList.contains('mobile-menu-open')))await page.locator('#mobile-menu').click();return;}
  if(await page.locator('body').evaluate(body=>body.classList.contains('menu-collapsed'))){
    await page.locator('#sidebar').hover({position:{x:4,y:45}});
    if(!await page.locator('body').evaluate(body=>body.classList.contains('menu-peek')))await page.locator('#collapse-menu').click();
    await page.locator('body.menu-peek').waitFor();
  }
}
async function navigate(page,id,mode){
  await revealNavigation(page);await page.locator(`#${id}`).click();
  await page.locator(`#${mode==='registry'?'registry':mode==='top-kp'?'top-kp':mode}-panel`).waitFor({state:'visible'});await settle(page);
}
async function pin(page){await revealNavigation(page);await page.locator('#pin-menu').click();await settle(page);}
async function exerciseFilter(page){
  await page.locator('#top-filter-efficiency-input').click();await page.locator('#top-filter-efficiency-list').getByRole('option',{name:'Лидер',exact:true}).click();
  await page.mouse.move((await page.viewportSize()).width-2,1);await page.keyboard.press('Escape');await paint(page);
}

async function main(){
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    for(const preference of ['expanded','collapsed',null]){
      const {context,page}=await makePage(browser,preference);
      try{
        for(const width of [1920,1440,3840]){
          await page.setViewportSize({width,height:width===3840?2160:1080});await settle(page);
          await check(page,{collapsed:true,stored:preference},`Direct TOP, saved ${preference||'auto'}, ${width}px`);
        }
        await page.reload();await page.locator('#top-kp-panel').waitFor({state:'visible'});await settle(page);
        await check(page,{collapsed:true,stored:preference},'Reload starts narrow again');
        await page.setViewportSize({width:1920,height:1080});await settle(page);
        await pin(page);await check(page,{collapsed:false,pinned:true,stored:preference},'Manual pin on TOP');
        await exerciseFilter(page);await check(page,{collapsed:false,pinned:true,stored:preference},'Filtering never collapses manual expansion');
        await page.locator('.top-kp-reset').click();await settle(page);await check(page,{collapsed:false,pinned:true,stored:preference},'Reset never collapses manual expansion');
        for(const width of [1440,2560]){await page.setViewportSize({width,height:1080});await settle(page);await check(page,{collapsed:false,pinned:true,stored:preference},'Desktop resize retains manual expansion');}
        await page.setViewportSize({width:390,height:844});await settle(page);
        await check(page,{collapsed:false,pinned:true,stored:preference},'Desktop→mobile TOP never opens burger automatically');
        await page.locator('#mobile-menu').click();await check(page,{collapsed:false,pinned:true,stored:preference,mobileOpen:true},'Burger still opens explicitly');
        await page.keyboard.press('Escape');await check(page,{collapsed:false,pinned:true,stored:preference},'Mobile Escape closes drawer');
        await page.setViewportSize({width:1920,height:1080});await settle(page);await check(page,{collapsed:false,pinned:true,stored:preference},'Returning to desktop retains manual expansion');
        await navigate(page,'cabinet-nav','cabinet');
        await check(page,{collapsed:preference==='collapsed',pinned:preference==='expanded',stored:preference},'Cabinet restores its previous preference');
        await navigate(page,'top-paths','top-kp');await check(page,{collapsed:true,stored:preference},'Re-enter TOP starts narrow');
        await navigate(page,'tasks-nav','tasks');await check(page,{collapsed:preference==='collapsed',pinned:preference==='expanded',stored:preference},'Tasks retain the global preference');
        await page.goBack();await page.locator('#top-kp-panel').waitFor({state:'visible'});await settle(page);
        await check(page,{collapsed:true,stored:preference},'Back navigation to TOP starts narrow');
        await pin(page);await page.locator('#collapse-menu').click();await settle(page);
        await check(page,{collapsed:true,stored:preference},'Manual TOP collapse remains visit-local');
        await navigate(page,'registry-nav','registry');await check(page,{collapsed:preference==='collapsed',pinned:preference==='expanded',stored:preference},'Registry restores the global preference');
        console.log(`PASS saved ${preference||'auto'}: direct/reload/re-entry/back start narrow; manual actions survive resize/filter; other sections restored`);
      }finally{await context.close();}
    }
    for(const preference of ['expanded','collapsed',null]){
      const {context,page}=await makePage(browser,preference,'#top-kp',390);
      try{
        await check(page,{collapsed:true,stored:preference},'Direct mobile TOP keeps burger closed');
        await page.locator('#mobile-menu').click();await check(page,{collapsed:true,stored:preference,mobileOpen:true},'Direct mobile burger opens explicitly');
        await page.keyboard.press('Escape');await page.setViewportSize({width:1920,height:1080});await settle(page);
        await check(page,{collapsed:true,stored:preference},'Mobile entry resized to desktop stays narrow');
      }finally{await context.close();}
    }
    const {context,page}=await makePage(browser,'expanded','#cabinet');
    try{
      await check(page,{collapsed:false,pinned:true,stored:'expanded'},'Unchanged default Cabinet');
      await page.locator('#collapse-menu').click();await settle(page);await check(page,{collapsed:true,stored:'collapsed'},'Outside TOP collapse still persists globally');
      await pin(page);await check(page,{collapsed:false,pinned:true,stored:'expanded'},'Outside TOP pin still persists globally');
      await navigate(page,'top-paths','top-kp');await check(page,{collapsed:true,stored:'expanded'},'UI entry from wide Cabinet narrows TOP');
      await page.screenshot({path:path.join(output,'top-default-collapsed.png')});
    }finally{await context.close();}
  }finally{await browser.close();}
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  console.log(JSON.stringify({status:'PASS',source:base,errors,failed,output},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

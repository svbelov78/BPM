/* Rating block matches Figma 312:47966: original indigo filled stars. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const runtime='/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/';
const {chromium}=require(runtime+'playwright');
const {PNG}=require(runtime+'pngjs');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-rating-'));
let source=path.resolve(process.argv[2]||path.join(__dirname,'index.html'));
if(path.basename(source)!=='index.html'){const copy=path.join(output,'prototype.html');fs.copyFileSync(source,copy);source=copy;}
const ready=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const paint=page=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.id-detail-rating img')].map(img=>img.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
async function open(page){await page.locator('[data-insight-open="INS-000067"]').click();await paint(page);}
async function checkStars(page,rating){
 const stars=await page.locator('[data-id-rating]').evaluateAll(nodes=>nodes.map(node=>{
  const img=node.querySelector('img'),box=img.getBoundingClientRect();return {filled:node.classList.contains('is-rated'),pressed:node.getAttribute('aria-pressed'),width:box.width,height:box.height,loaded:img.complete&&img.naturalWidth===24,filter:getComputedStyle(img).filter,src:img.src};
 }));
 assert.equal(stars.length,5);
 stars.forEach((star,index)=>{assert.equal(star.filled,index<rating);assert.equal(star.pressed,String(index+1===rating));assert.equal(star.width,24);assert.equal(star.height,24);assert.ok(star.loaded);assert.equal(star.filter,'none');});
 assert.equal(new Set(stars.map(star=>star.src)).size,rating===5?1:2,'Filled and outline stars use distinct original assets');
 assert.equal(await page.locator('[data-id-rating-value]').textContent(),rating.toFixed(1).replace('.',','));
 const image=PNG.sync.read(await page.locator('[data-id-rating="1"] img').screenshot());
 let indigo=0;for(let i=0;i<image.data.length;i+=4)if(Math.abs(image.data[i]-97)<3&&Math.abs(image.data[i+1]-85)<3&&Math.abs(image.data[i+2]-245)<3)indigo++;
 assert.ok(indigo>80,`Selected star is visibly filled DS indigo, not a recoloured outline: ${indigo}`);
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:920},reducedMotion:'reduce',offline:true});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(pathToFileURL(source).href+'#insights');await ready(page);await open(page);
  await checkStars(page,3);
  assert.equal(await page.locator('.id-detail-rating .internal-label').first().evaluate(n=>getComputedStyle(n).color),'rgb(26, 26, 26)');
  await page.mouse.move(0,0);await page.locator('.id-detail-rating').screenshot({path:path.join(output,'rating-desktop.png')});
  for(const rating of [5,1]){await page.locator(`[data-id-rating="${rating}"]`).click();await paint(page);await checkStars(page,rating);}
  await page.locator('[data-id-rating="4"]').focus();await page.keyboard.press('Enter');await paint(page);await checkStars(page,4);
  assert.equal(await page.evaluate(()=>BpmInsightStore.get('INS-000067').detail.userRating),4);
  await page.reload();await ready(page);await open(page);await checkStars(page,4);
  for(const width of [320,390,1440,3840]){
   await page.setViewportSize({width,height:920});await paint(page);await checkStars(page,4);
   const layout=await page.locator('.id-detail-rating').evaluate(node=>{const b=node.getBoundingClientRect(),scroll=document.querySelector('.id-detail-scroll');return {left:b.left,right:b.right,children:[...node.querySelectorAll('button,strong')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};}),page:document.documentElement.scrollWidth,scroll:scroll.scrollWidth,client:scroll.clientWidth};});
   assert.ok(layout.page<=width+1&&layout.scroll<=layout.client+1,`${width}: no outer overflow`);
   assert.ok(layout.children.every(n=>n.left>=layout.left&&n.right<=layout.right),`${width}: complete rating remains inside its panel`);
   if(width===390)await page.locator('.id-detail-rating').screenshot({path:path.join(output,'rating-mobile.png')});
  }
  await page.setViewportSize({width:1440,height:920});await paint(page);
  const exit=page.locator('.id-detail-footer [data-id-return]');assert.equal(await exit.textContent(),'Выйти');assert.ok(await exit.isEnabled());
  await page.locator('.id-detail-footer').screenshot({path:path.join(output,'footer-exit.png')});
  await exit.click();await ready(page);assert.ok(await page.locator('#insights-registry-view').isVisible());
  assert.deepEqual(errors,[]);
  console.log(`PASS — Original 24px indigo filled stars, initial/persisted rating, click/keyboard edits, responsive 320–3840px and exit navigation. Screenshots: ${output}`);
 }catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

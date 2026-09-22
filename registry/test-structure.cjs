/* Run locally with Node; browser automation is optional via the bundled Playwright. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const source = fs.readFileSync(path.join(__dirname,'structure-data.js'),'utf8');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'structure-source.js'),'utf8'),context);
vm.runInNewContext(source,context);
const model=context.window.BPM_STRUCTURE;
assert.equal(model.roots.length,9);
assert.equal(model.records.length,913);
assert.equal(new Set(model.records.map(r=>r.id)).size,913);
assert.equal(new Set(model.nodes.map(n=>n.id)).size,model.nodes.length);
assert.equal(model.provenance.invalidRows,7);
const biggestBlock=Math.max(...model.roots.map(n=>n.total));
for(const node of model.nodes){
  assert.equal(node.buckets.reduce((a,b)=>a+b,0),node.total,node.name);
  if(node.kind==='product')assert.equal(node.records.length,node.total);
  else {
    const unique=[...new Map(node.children.flatMap(n=>n.records).map(r=>[r.id,r])).values()];
    assert.equal(unique.length,node.total);
    node.buckets.forEach((count,i)=>assert.equal(count,unique.filter(r=>r.bucket===i).length));
  }
  node.buckets.forEach((count,i)=>assert.ok(count<=model.maxima[i]));
}
for(const row of model.records){
  const bucket=row.efficiency===null?4:row.efficiency>85?0:row.efficiency>65?1:row.efficiency>45?2:3;
  assert.equal(row.bucket,bucket);
}
console.log('Data invariants: PASS — 9 product blocks, 913 unique processes, union totals and methodology colors agree.');
if(!process.env.BPM_PLAYWRIGHT)process.exit(0);

(async()=>{
  const {chromium}=require(process.env.BPM_PLAYWRIGHT);
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
    await page.waitForTimeout(2100);
    const initialCards=await page.locator('.entity-card:not(.skeleton-card)').count();
    assert.ok(initialCards>0,'Regular registry loads');
    await page.locator('#structure-toggle').click();
    assert.equal(await page.locator('#structure-list').getAttribute('aria-busy'),'true');
    await page.waitForTimeout(2100);
    assert.equal(await page.locator('#structure-list > .structure-node').count(),model.roots.length);
    assert.equal(await page.locator('.structure-heading[aria-expanded=true]').count(),0);
    const counts=await page.locator('.structure-total').allTextContents();
    assert.ok(Number(counts[0].replace(/\s/g,''))<biggestBlock,'Counter starts below its final value after loading');
    await page.waitForTimeout(1300);
    assert.equal(Number((await page.locator('.structure-total').first().textContent()).replace(/\s/g,'')),biggestBlock);
    const b2c=page.locator('#structure-list > .structure-node').filter({has:page.locator('.structure-name',{hasText:'Развитие клиентского опыта B2C'})});
    await b2c.locator(':scope > .structure-heading').click();
    const prime=b2c.locator('.structure-node[data-kind=division]').filter({has:page.locator('.structure-name',{hasText:/^(Дивизион ")?Прайм("|)$/})});
    await prime.locator(':scope > .structure-heading').click();
    const product=prime.locator('.structure-node[data-kind=product]').filter({has:page.locator('.structure-name',{hasText:/^СберПрайм$/})});
    await product.locator(':scope > .structure-heading').click();
    assert.ok(await product.locator('tbody tr').count()>0);
    const firstRow=product.locator('tbody tr').first();
    await firstRow.locator('[data-structure-detail]').first().click();
    await page.locator('#process-drawer[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#process-drawer[open]').waitFor({state:'hidden'});
    await firstRow.locator('[data-structure-menu]').click();
    await page.locator('.action-menu [data-favorite]').click();
    assert.equal(await product.locator('tbody tr').first().locator('.favorite-heart').count(),1);
    await page.locator('#structure-search').fill('СберПрайм');
    await page.waitForTimeout(2300);
    assert.ok(await page.locator('#structure-list > .structure-node').count()<model.roots.length);
    assert.ok(await page.locator('#structure-selected').isVisible());
    await page.locator('#structure-reset').click();
    await page.waitForTimeout(2100);
    assert.equal(await page.locator('#structure-list > .structure-node').count(),model.roots.length);
    await page.locator('#structure-toggle').click();
    await page.waitForTimeout(2100);
    assert.equal(await page.locator('.entity-card:not(.skeleton-card)').count(),initialCards);
    await page.locator('#table-view').click();await page.waitForTimeout(2100);
    assert.ok(await page.locator('.registry-table tbody tr').count()>0);
    await page.locator('#structure-toggle').click();await page.waitForTimeout(2100);
    assert.equal(await page.locator('.structure-heading[aria-expanded=true]').count(),0,'All nodes collapsed on entry');
    await page.waitForTimeout(1300);
    await page.screenshot({path:'/tmp/bpm-structure-1920.png',fullPage:false});
    for(const width of [1440,1024,768,390,320]){
      await page.setViewportSize({width,height:900});
      await page.waitForTimeout(150);
      const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(dims.scroll<=dims.width+1,`No page overflow at ${width}: ${dims.scroll}`);
    }
    await page.screenshot({path:'/tmp/bpm-structure-mobile.png',fullPage:false});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('#structure-toggle').click();await page.locator('#structure-toggle').click();
    await page.waitForTimeout(2100);
    assert.equal(Number((await page.locator('.structure-total').first().textContent()).replace(/\s/g,'')),biggestBlock,'Reduced motion shows final values');
    assert.deepEqual(errors,[]);
    console.log('Browser flows: PASS — collapse, animation, nesting, Drawer, favorites, search, reset, return to cards/table, responsive and reduced motion.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Shared card geometry and full available-width regression for TOP-КП.
 * node test-top-kp-fill-width.cjs [URL|prototype.html]
 * BPM_TOP_KP_BASELINE=1 records the pre-change layout without assertions.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BPM_PLAYWRIGHT||'/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const requested=process.env.BPM_TOP_KP_URL||process.env.BPM_TOP_KP_FILE||process.argv[2]||path.join(__dirname,'index.html');
const base=(/^(https?:|file:)/.test(requested)?requested:pathToFileURL(path.resolve(requested)).href).split('#')[0];
const baseline=process.env.BPM_TOP_KP_BASELINE==='1';
const output=process.env.BPM_TOP_KP_OUTPUT||`/private/tmp/bpm-top-kp-fill-width-${baseline?'baseline':'qa'}`;
const sizes=[[320,844],[390,844],[768,1024],[1024,768],[1280,920],[1343,983],[1440,920],[1600,1000],[1920,920],[1920,1080],[2560,920],[2560,1440],[3840,920],[3840,2160]];
const failures=[],measurements=[];
function check(label,callback){if(baseline)return;try{callback();console.log(`PASS ${label}`);}catch(error){failures.push(`${label}: ${error.message}`);console.error(`FAIL ${label}: ${error.message}`);}}
async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);});}
function geometry(){
  const root=document.querySelector('#top-kp-panel'),view=root.querySelector('.top-kp-map-viewport'),map=root.querySelector('.top-kp-map'),viewBox=view.getBoundingClientRect(),mapBox=map.getBoundingClientRect();
  const cards=[...map.querySelectorAll('.top-kp-card')].map(card=>{
    const box=card.getBoundingClientRect(),title=card.querySelector('.top-kp-card-title'),text=getComputedStyle(title),style=getComputedStyle(card),line=parseFloat(text.lineHeight);
    return {id:card.dataset.topKpId,x:box.x-mapBox.x,y:box.y-mapBox.y,width:box.width,height:box.height,right:box.right,bottom:box.bottom,lines:Math.round(title.getBoundingClientRect().height/line),clamp:Number(text.webkitLineClamp),titleHeight:title.getBoundingClientRect().height,inset:parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth),titleHorizontalOverflow:title.scrollWidth-title.clientWidth,disabled:card.disabled,opacity:style.opacity};
  });
  const overlaps=[];
  for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
    const a=cards[i],b=cards[j];
    if(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>.2&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>.2)overlaps.push([a.id,b.id]);
  }
  const groupsOutside=[...map.querySelectorAll('.top-kp-group')].filter(group=>{const box=group.getBoundingClientRect(),parent=group.parentElement.getBoundingClientRect();return box.left<parent.left-.2||box.right>parent.right+.2;}).map(group=>group.dataset.sourceCategory);
  const floorRightGaps=[...map.children].map(floor=>viewBox.right-Math.max(...[...floor.querySelectorAll('.top-kp-card')].map(card=>card.getBoundingClientRect().right)));
  return {screen:[innerWidth,innerHeight],density:root.dataset.density,sharedLines:Number(root.dataset.lines),fit:root.dataset.fit,spacing:root.dataset.spacing,count:cards.length,widthMin:Math.min(...cards.map(card=>card.width)),widthMax:Math.max(...cards.map(card=>card.width)),heightMin:Math.min(...cards.map(card=>card.height)),heightMax:Math.max(...cards.map(card=>card.height)),viewWidth:view.clientWidth,viewHeight:view.clientHeight,mapHeight:map.scrollHeight,scrollWidth:view.scrollWidth,scrollHeight:view.scrollHeight,rightGap:viewBox.right-Math.max(...cards.map(card=>card.right)),floorRightGaps,maxFloorRightGap:Math.max(...floorRightGaps),leftGap:Math.min(...cards.map(card=>card.x))+mapBox.left-viewBox.left,bodyOverflow:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth,fullyVisible:cards.filter(card=>card.y+mapBox.top>=viewBox.top-.1&&card.bottom<=Math.min(viewBox.bottom,innerHeight)+.1).length,lineCounts:Object.fromEntries([1,2,3].map(lines=>[lines,cards.filter(card=>card.lines===lines).length])),overlaps,groupsOutside,resetVisible:!root.querySelector('.top-kp-reset').hidden,cards};
}
function sameCards(before,after,label){
  assert.equal(after.count,136);
  after.cards.forEach((card,index)=>{const prior=before.cards[index];assert.equal(card.id,prior.id,`${label}: card identity`);for(const key of ['x','y','width','height'])assert.ok(Math.abs(card[key]-prior[key])<.25,`${label}: ${card.id} ${key} (${prior[key]} → ${card[key]})`);});
}
async function filterAndReset(page,before){
  await page.mouse.move(1,1);await page.keyboard.press('Escape');
  await page.locator('#top-filter-block-input').click();
  const list=page.locator('#top-filter-block-list');await list.waitFor({state:'visible'});
  await list.getByRole('option',{name:'B2B',exact:true}).click();
  await list.waitFor({state:'hidden'});await page.mouse.move(1,1);await settle(page);
  const filtered=await page.evaluate(geometry);
  check(`${before.screen.join('×')} filtering keeps all geometry stable`,()=>{
    sameCards(before,filtered,'filter');assert.equal(filtered.resetVisible,true);
    assert.ok(filtered.cards.some(card=>card.disabled));assert.ok(filtered.cards.some(card=>!card.disabled));
    assert.ok(filtered.cards.every(card=>card.opacity===(card.disabled?'0.25':'1')));
  });
  await page.locator('.top-kp-reset').click();await settle(page);
  const cleared=await page.evaluate(geometry);
  check(`${before.screen.join('×')} reset restores cards without reflow`,()=>{sameCards(before,cleared,'reset');assert.equal(cleared.resetVisible,false);assert.ok(cleared.cards.every(card=>!card.disabled));});
}
async function main(){
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({reducedMotion:'reduce'}),errors=[];
  try{
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    for(const [width,height] of sizes){
      await page.setViewportSize({width,height});await page.goto(`${base}#top-kp`);
      await page.waitForFunction(()=>!document.querySelector('#top-kp-panel')?.hidden&&document.querySelectorAll('#top-kp-panel .top-kp-card').length===136);
      await page.mouse.move(width-1,1);await settle(page);
      const result=await page.evaluate(geometry),label=`${width}×${height}`;
      measurements.push(result);const {cards,...summary}=result;console.log(`MEASURE ${JSON.stringify(summary)}`);
      check(`${label} all 136 cards share one width and height`,()=>{assert.equal(result.count,136);assert.equal(new Set(cards.map(card=>card.id)).size,136);assert.ok(result.widthMax-result.widthMin<.1);assert.ok(result.heightMax-result.heightMin<.1);});
      check(`${label} shared line mode controls clamp and height`,()=>{
        const heights={compact:{2:34,3:45},regular:{2:40,3:54},large:{2:48,3:64}};
        assert.ok([2,3].includes(result.sharedLines));assert.equal(result.heightMin,heights[result.density][result.sharedLines]);
        for(const card of cards){assert.equal(card.clamp,result.sharedLines);assert.ok(card.lines>=1&&card.lines<=result.sharedLines);assert.ok(card.titleHeight+card.inset<=card.height+.1);assert.ok(card.titleHorizontalOverflow<=1,'Broken words must remain within the card');}
      });
      // Different floors have different grid counts: the widest occupied floor
      // reaches the field edge without stretching gaps or individual cards.
      check(`${label} useful card content fills the map width`,()=>{assert.ok(result.rightGap>=-.2&&result.rightGap<=10,`Unfilled right edge: ${result.rightGap}px`);assert.ok(Math.abs(result.leftGap)<=.2,`Left edge: ${result.leftGap}px`);});
      check(`${label} no overlaps or horizontal overflow`,()=>{assert.deepEqual(result.overlaps,[]);assert.deepEqual(result.groupsOutside,[]);assert.ok(result.bodyOverflow<=1);assert.ok(result.scrollWidth<=result.viewWidth+1);});
      await page.screenshot({path:path.join(output,`top-kp-${width}x${height}.png`),fullPage:true});
      if(!baseline)await filterAndReset(page,result);
    }
    check('Both two-line and three-line shared layouts are covered',()=>assert.deepEqual([...new Set(measurements.map(result=>result.sharedLines))].sort(),[2,3]));
    check('No browser errors',()=>assert.deepEqual(errors,[]));
    fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({base,baseline,measurements,errors,failures},null,2));
    if(failures.length)throw new Error(failures.join('\n'));
    console.log(`${baseline?'BASELINE':'PASS'} full-width card geometry: ${output}`);
  }finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

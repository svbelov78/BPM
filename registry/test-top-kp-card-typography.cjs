/* Isolated Figma card fixtures against shared production CSS.
 * node registry/test-top-kp-card-typography.cjs [URL|standalone.html]
 * No production styles, renderer, source data or layout are modified.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BPM_PLAYWRIGHT||'/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const requested=process.env.BPM_TOP_KP_URL||process.env.BPM_TOP_KP_FILE||process.argv[2]||path.join(__dirname,'index.html');
const source=/^(https?:|file:)/.test(requested)?requested:pathToFileURL(path.resolve(requested)).href;
const output=process.env.BPM_TOP_KP_OUTPUT||'/private/tmp/bpm-top-kp-card-typography-qa';
const compactTitle='Идентификация по Sber ID Много слов в макс 3 строки а потом многоточки';
const regularTitle='Идентификация по Sber ID Много слов в макс 3 строки';
const fixtures=[
  {name:'compact-80',density:'compact',width:80,title:compactTitle},
  {name:'compact-128',density:'compact',width:128,title:compactTitle},
  {name:'regular-128',density:'regular',width:128,title:regularTitle},
  {name:'regular-173',density:'regular',width:173,title:'Идентификация по Sber ID Много слов до трех строк для переносом и многоточием'},
  {name:'large-270',density:'large',width:270,title:'Идентификация по Sber ID Много слов в макс 3 строки а затем обрезается многоточием'}
];
const variants={
  compact:{font:'11px',line:'11px',tracking:'-0.66px',weight:'510',padding:'4px 6px',radius:'8px',height:45},
  regular:{font:'13px',line:'14px',tracking:'-0.91px',weight:'400',padding:'4px 6px',radius:'8px',height:54},
  large:{font:'17px',line:'16px',tracking:'-1.02px',weight:'510',padding:'6px',radius:'10px',height:64}
};
const failures=[],measurements=[];
function check(name,callback){try{callback();console.log(`PASS ${name}`);}catch(error){failures.push(`${name}: ${error.message}`);console.error(`FAIL ${name}: ${error.message}`);}}
async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);});}
function cardStyle(card){
  const style=getComputedStyle(card),title=card.querySelector('.top-kp-card-title'),text=getComputedStyle(title),box=card.getBoundingClientRect();
  return {width:box.width,height:box.height,font:text.fontSize,line:text.lineHeight,tracking:text.letterSpacing,weight:text.fontWeight,padding:style.padding,radius:style.borderRadius,borders:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth],variation:style.fontVariationSettings,titleHeight:title.getBoundingClientRect().height,clamp:text.webkitLineClamp,overflow:text.overflow,transform:text.textTransform,title:title.textContent,color:style.color,background:style.backgroundImage,backgroundColor:style.backgroundColor,shadow:style.boxShadow,hasId:!!card.querySelector('.top-kp-card-code'),childCount:card.children.length,verticalChrome:parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth)};
}
async function main(){
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1200,height:900},reducedMotion:'reduce'}),errors=[];
  try{
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(`${source.split('#')[0]}#top-kp`);
    await page.waitForFunction(()=>!document.querySelector('#top-kp-panel')?.hidden&&document.querySelectorAll('#top-kp-panel .top-kp-card').length===136);
    await settle(page);
    const sourceCards=await page.locator('#top-kp-panel .top-kp-card').evaluateAll(cards=>({count:cards.length,visibleIds:cards.filter(card=>card.querySelector('.top-kp-card-code')).length,titleOnly:cards.every(card=>card.children.length===1&&card.firstElementChild.classList.contains('top-kp-card-title'))}));
    check('Production renderer has 136 title-only cards without an ID row',()=>{assert.equal(sourceCards.count,136);assert.equal(sourceCards.visibleIds,0);assert.equal(sourceCards.titleOnly,true);});
    await page.evaluate(fixtures=>{
      const original=document.querySelector('#top-kp-panel .top-kp-card'),strip=document.createElement('section');
      strip.id='top-kp-typography-fixtures';strip.setAttribute('aria-label','Изолированные Figma-варианты карточки ТОП-КП');
      Object.assign(strip.style,{position:'fixed',zIndex:'999999',left:'24px',top:'24px',padding:'24px',display:'flex',alignItems:'flex-start',gap:'24px',background:'#dfe8f8',borderRadius:'16px',width:'max-content'});
      for(const fixture of fixtures){
        const item=document.createElement('div');item.style.width=`${fixture.width}px`;
        const caption=document.createElement('div');caption.textContent=`${fixture.density} · ${fixture.width}px`;Object.assign(caption.style,{fontSize:'11px',lineHeight:'16px',marginBottom:'12px',whiteSpace:'nowrap'});item.append(caption);
        const surface=document.createElement('div');surface.className='top-kp-measure';surface.dataset.density=fixture.density;
        Object.assign(surface.style,{position:'relative',left:'auto',top:'auto',visibility:'visible',pointerEvents:'auto',width:`${fixture.width}px`});surface.style.setProperty('--top-card-width',`${fixture.width}px`);
        const card=original.cloneNode(true);card.removeAttribute('data-top-kp-id');card.removeAttribute('data-top-kp-code');card.removeAttribute('aria-describedby');card.removeAttribute('aria-controls');card.removeAttribute('aria-expanded');card.removeAttribute('title');card.setAttribute('aria-label',fixture.title);card.dataset.fixture=fixture.name;card.dataset.band='green';card.disabled=false;card.classList.remove('is-filtered-out');card.querySelector('.top-kp-card-title').textContent=fixture.title;
        surface.append(card);item.append(surface);strip.append(item);
      }
      document.body.append(strip);
    },fixtures);
    await page.mouse.move(1199,899);await settle(page);
    const strip=page.locator('#top-kp-typography-fixtures');
    for(const fixture of fixtures){
      const card=page.locator(`[data-fixture="${fixture.name}"]`),actual=await card.evaluate(cardStyle),expected=variants[fixture.density];
      measurements.push({fixture,...actual});
      check(`${fixture.name}: exact production typography and box`,()=>{
        for(const property of ['font','line','tracking','weight','padding','radius'])assert.equal(actual[property],expected[property],property);
        assert.equal(actual.width,fixture.width);assert.deepEqual(actual.borders,['2px','2px','2px','2px']);assert.equal(actual.variation,'"wdth" 100');
        assert.equal(actual.clamp,'3');assert.equal(actual.overflow,'hidden');assert.equal(actual.transform,'none');assert.equal(actual.title,fixture.title);
        assert.equal(actual.hasId,false);assert.equal(actual.childCount,1);
        const lines=actual.titleHeight/parseFloat(actual.line);
        assert.ok(lines>=1&&lines<=3,`lines ${lines}`);assert.ok(Math.abs(lines-Math.round(lines))<.01,`whole line count ${lines}`);
        assert.equal(actual.height,expected.height,'Fixed card height is independent of title length');
        assert.ok(actual.titleHeight+actual.verticalChrome<=actual.height+.1,'Clamped title fits the reserved three-line box');
        assert.equal(actual.color,'rgb(26, 26, 26)');assert.equal(actual.background,'none');assert.equal(actual.backgroundColor,'rgb(255, 255, 255)');assert.equal(actual.shadow,'none');
      });
      const lineCases=await card.evaluate(card=>{
        const title=card.querySelector('.top-kp-card-title'),original=title.textContent,lineHeight=parseFloat(getComputedStyle(title).lineHeight),cases=[];
        try{
          for(const lines of [1,2,3]){
            let found=false;
            // Natural wrapping, not inserted <br> or test-only text styles.
            for(let count=1;count<=100;count++){
              title.textContent=Array(count).fill('Путь').join(' ');
              const titleHeight=title.getBoundingClientRect().height;
              if(Math.abs(titleHeight-lines*lineHeight)<.1){cases.push({lines,title:title.textContent,titleHeight,height:card.getBoundingClientRect().height,width:card.getBoundingClientRect().width});found=true;break;}
            }
            if(!found)cases.push({lines,error:'Cannot find naturally wrapped title'});
          }
        }finally{title.textContent=original;}
        return cases;
      });
      measurements[measurements.length-1].lineCases=lineCases;
      check(`${fixture.name}: one-, two- and three-line titles retain the same fixed height`,()=>{
        assert.equal(lineCases.length,3);
        for(const sample of lineCases){assert.equal(sample.error,undefined);assert.equal(sample.height,expected.height,`${sample.lines} lines`);assert.equal(sample.width,fixture.width);assert.ok(Math.abs(sample.titleHeight-sample.lines*parseFloat(expected.line))<.1);}
      });
    }
    await strip.screenshot({path:path.join(output,'top-kp-five-figma-card-fixtures.png')});
    for(const fixture of fixtures){
      const card=page.locator(`[data-fixture="${fixture.name}"]`);
      await card.hover();await page.waitForTimeout(180);
      const hover=await card.evaluate(cardStyle);
      check(`${fixture.name}: hover blue and outer shadow`,()=>{
        assert.equal(hover.color,'rgb(0, 136, 255)');assert.equal(hover.shadow,'rgba(26, 26, 26, 0.12) 0px 4px 12px 0px');assert.equal(hover.background,'none');assert.equal(hover.width,fixture.width);
      });
      await strip.screenshot({path:path.join(output,`top-kp-${fixture.name}-hover.png`)});
      await page.mouse.down();
      try{
        await page.waitForTimeout(180);const pressed=await card.evaluate(cardStyle);
        check(`${fixture.name}: pressed gradient, inset shadow and dark blue`,()=>{
          assert.equal(pressed.color,'rgb(0, 109, 204)');assert.equal(pressed.shadow,'rgba(26, 26, 26, 0.16) 0px 2px 4px 0px inset');assert.equal(pressed.background,'linear-gradient(90deg, rgb(255, 238, 253) 0%, rgb(241, 255, 234) 55%, rgb(255, 255, 255) 100%)');assert.equal(pressed.width,fixture.width);
          assert.equal(pressed.height,measurements.find(measurement=>measurement.fixture.name===fixture.name).height,'Press does not shift the card');
        });
        await strip.screenshot({path:path.join(output,`top-kp-${fixture.name}-pressed.png`)});
        measurements.find(measurement=>measurement.fixture.name===fixture.name).states={hover,pressed};
      }finally{await page.mouse.up();}
      await page.mouse.move(1199,899);await page.waitForTimeout(180);
    }
    const openDrawers=await page.locator('#process-drawer[open]').count();
    check('No fixture interaction opens a process drawer',()=>assert.equal(openDrawers,0));
    check('No browser script or console errors',()=>assert.deepEqual(errors,[]));
    fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({source,measurements,errors,failures},null,2));
    if(failures.length)throw new Error(failures.join('\n'));
    console.log(`PASS All five Figma typography fixtures, hover and pressed states: ${output}`);
  }finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

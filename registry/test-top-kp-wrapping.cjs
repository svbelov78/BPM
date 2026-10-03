/* TOP-КП: compact titles fill the next line after a split word.
 * node registry/test-top-kp-wrapping.cjs [URL|standalone.html]
 * Fixtures inherit production typography; source data and layout stay intact.
 */
'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.BPM_PLAYWRIGHT||'/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const requested=process.env.BPM_TOP_KP_URL||process.env.BPM_TOP_KP_FILE||process.argv[2]||path.join(__dirname,'index.html');
const source=/^(https?:|file:)/.test(requested)?requested:pathToFileURL(path.resolve(requested)).href;

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await page.goto(`${source.split('#')[0]}#top-kp`);
    await page.waitForSelector('.top-kp-card');
    await page.evaluate(()=>document.fonts.ready);
    const result=await page.evaluate(()=>{
      const cards=[...document.querySelectorAll('#top-kp-panel .top-kp-card')];
      const invalidTitles=cards.filter(card=>/[\r\n\t\u00a0\u2000-\u200f\u2028\u2029\u202f\u2060]/u.test(card.textContent)||card.querySelector('br')).map(card=>card.textContent);
      const host=document.createElement('section');host.className='top-kp-measure';host.dataset.density='compact';
      host.style.cssText='position:fixed;left:16px;top:16px;z-index:999999;--top-card-width:80px';
      const card=cards[0].cloneNode(true);card.removeAttribute('data-top-kp-id');
      const title=card.querySelector('.top-kp-card-title');host.append(card);document.body.append(host);
      function getLines(){
        const text=title.firstChild,lines=[];
        for(let i=0;i<text.length;i++){
          const range=document.createRange();range.setStart(text,i);range.setEnd(text,i+1);
          const rect=range.getBoundingClientRect();let line=lines.find(item=>Math.abs(item.y-rect.y)<.1);
          if(!line){line={y:rect.y,text:''};lines.push(line);}line.text+=text.textContent[i];
        }
        return lines.map(line=>line.text);
      }
      const examples=[];
      for(const sample of [{text:'Обслуживание СберПремьер',next:'СберПре'},{text:'Прохождение онбординга',next:'онборди'},{text:'Консультирование клиентов ММБ',next:'клие'}]){
        title.textContent=sample.text;
        examples.push({...sample,lines:getLines()});
      }
      const style=getComputedStyle(title),typography={wordBreak:style.wordBreak,whiteSpace:style.whiteSpace,overflowWrap:style.overflowWrap};
      host.remove();
      return {count:cards.length,invalidTitles,typography,examples};
    });
    assert.equal(result.count,136);
    assert.deepEqual(result.invalidTitles,[],'Source titles contain no forced line breaks or non-breaking spaces');
    assert.equal(result.typography.whiteSpace,'normal');
    assert.equal(result.typography.wordBreak,'break-all','New words can start after the remainder of a split word');
    for(const sample of result.examples){
      assert.ok(sample.lines[1].includes(` ${sample.next}`),`${sample.text}: line 2 should continue with the next word, got ${JSON.stringify(sample.lines)}`);
      console.log(`PASS ${sample.text}: ${sample.lines.slice(0,3).join(' / ')}`);
    }
    console.log('PASS 136 titles: no forced breaks; compact lines continue after spaces');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

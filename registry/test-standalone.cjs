/* Offline distribution regression. Copies ONLY the generated HTML to a new,
 * unrelated directory and renames it, so sibling files cannot mask omissions.
 * Run: node registry/test-standalone.cjs [absolute/path/to/standalone.html]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BPM_PLAYWRIGHT || '/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source = path.resolve(process.argv[2] || path.join(__dirname, '..', 'Sber-BPM-Registry-Standalone.html'));
const report = text => console.log(`PASS — ${text}`);
const ready = (page, id = 'results') => page.waitForFunction(id => document.getElementById(id)?.getAttribute('aria-busy') === 'false', id);
const tenPixelLabelGroups=new Set(['A2','B2','D2','G11','L10']);
const eightPixelColumnGroups=new Set(['H2','I2','J2','B22','D22','F22','G22','O10']);
const tenPixelRowGroups=new Set(['A11','F11','S10']);
const eightPixelRowGroups=new Set(['A2','J2','A22','C22']);
function headingStyles(root) {
  const style=element=>{const s=getComputedStyle(element);return {font:s.fontSize,line:s.lineHeight,weight:s.fontWeight,tracking:parseFloat(s.letterSpacing),parentGap:getComputedStyle(element.parentElement).gap,whiteSpace:s.whiteSpace,transform:s.textTransform,background:s.backgroundImage,radius:s.borderRadius,top:s.borderTopWidth,bottom:s.borderBottomWidth,borderColor:s.borderTopColor,padding:s.padding};};
  const title=root.querySelector('h1').getBoundingClientRect(),legend=root.querySelector('.top-kp-legend').getBoundingClientRect();
  return {spacing:root.dataset.spacing,padding:getComputedStyle(root).padding,contentWidth:root.clientWidth-parseFloat(getComputedStyle(root).paddingLeft)-parseFloat(getComputedStyle(root).paddingRight),headingGap:getComputedStyle(root.querySelector('.top-kp-heading')).gap,headingMargin:getComputedStyle(root.querySelector('.top-kp-heading')).marginBottom,footerCount:root.querySelectorAll('.top-kp-footer').length,legendBelowTitle:legend.top-title.bottom,filterGroups:[...root.querySelectorAll('.top-kp-filter-group')].map(group=>({paddingTop:getComputedStyle(group).paddingTop,captionTop:group.querySelector('.top-kp-filter-caption')?getComputedStyle(group.querySelector('.top-kp-filter-caption')).top:null})),h1:style(root.querySelector('h1')),h2:[...root.querySelectorAll('.top-kp-block>h2')].map(style),h3:[...root.querySelectorAll('.top-kp-department>h3')].map(el=>({cell:el.parentElement.dataset.sourceCategory,...style(el)})),groups:[...root.querySelectorAll('.top-kp-group')].map(el=>({cell:el.dataset.sourceCategory,gap:getComputedStyle(el).gap,padding:getComputedStyle(el).padding,title:style(el.querySelector('h4'))}))};
}
function assertHeadingStyles(styles,width,height) {
  const compact=styles.spacing==='compact';assert.ok(['compact','design'].includes(styles.spacing));if(compact)assert.ok(width>=1280,'Compact vertical padding is a desktop height fallback only');
  const shortDesktop=width>=1280&&height<=960;
  assert.equal(styles.padding,width<768?'16px 12px':compact?(shortDesktop?'16px 24px 8px':'16px 24px'):'24px');assert.equal(styles.headingGap,compact&&shortDesktop?'12px':'16px');assert.equal(styles.headingMargin,compact?'16px':'24px');
  for(const group of styles.filterGroups){assert.equal(group.paddingTop,'16px','Caption line has its own layout space');if(group.captionTop!==null)assert.equal(group.captionTop,'0px');}
  if(styles.contentWidth<=1000)assert.ok(styles.legendBelowTitle>=7.9,'Legend owns a separate row at container widths up to 1000px');
  const narrowTitle=width<768||styles.contentWidth<=450;assert.equal(styles.h1.font,narrowTitle?'22px':'26px');assert.equal(styles.h1.line,narrowTitle?'26px':'31px');assert.equal(styles.h1.weight,'700');
  assert.equal(styles.footerCount,0,'The removed TOP footer does not remain as hidden DOM');
  for(const h of styles.h2){assert.equal(h.font,'17px');assert.equal(h.line,'24px');assert.equal(h.weight,'590');assert.ok(Math.abs(h.tracking+.51)<.005);assert.equal(h.parentGap,'0px');assert.equal(h.whiteSpace,'nowrap');}
  for(const h of styles.h3){const major=h.cell==='A21';assert.equal(h.font,major?'17px':'13px');assert.equal(h.line,major?'24px':'18px');assert.equal(h.weight,major?'590':'400');assert.equal(h.background,'none');assert.equal(h.radius,'0px');assert.equal(h.top,major?'0px':'1px');assert.equal(h.bottom,major?'0px':'1px');if(major){assert.ok(Math.abs(h.tracking+.51)<.005);assert.equal(h.parentGap,'0px');}else{assert.equal(h.borderColor,'rgba(26, 26, 26, 0.2)');assert.equal(h.padding,'4px 8px 4px 2px');}}
  for(const group of styles.groups){const vertical=compact?'4px':'8px';assert.equal(group.padding,`${vertical} 0px`,`${group.cell}: group side padding must not add to the shared horizontal gap`);assert.equal(group.gap,compact?'4px':tenPixelLabelGroups.has(group.cell)?'10px':'8px',group.cell);assert.equal(group.title.font,'9px');assert.equal(group.title.line,'12px');assert.equal(group.title.weight,group.cell==='D11'?'400':'510');assert.equal(group.title.transform,'uppercase');assert.equal(group.title.whiteSpace,'nowrap');}
}

async function assets(page, label) {
  const images = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
    return [...document.images].map(img => ({src: (img.getAttribute('src') || '').slice(0, 120), width: img.naturalWidth, height: img.naturalHeight}));
  });
  assert.ok(images.length > 15, `${label}: page has real image assets`);
  assert.deepEqual(images.filter(img => !img.width || !img.height), [], `${label}: no broken static or dynamically rendered images`);
  assert.ok(images.every(img => /^(data:|blob:)/.test(img.src)), `${label}: images are embedded`);
  const fonts = await page.evaluate(() => [...document.fonts].map(font => ({family: font.family, status: font.status})));
  assert.ok(fonts.every(font => font.status !== 'error'), `${label}: all declared web fonts load; system-only font stacks require no asset`);
}

async function closeDrawer(page) {
  await page.keyboard.press('Escape');
  await page.locator('#process-drawer[open]').waitFor({state: 'hidden'});
}

async function detail(page, trigger, entity) {
  await trigger.click();
  const drawer = page.locator('#process-drawer');
  await page.waitForFunction(() => {
    const element = document.querySelector('#process-drawer');
    return element?.open && !element.classList.contains('pd-is-loading') && !element.querySelector('.pd-main')?.inert;
  });
  assert.equal(await drawer.getAttribute('data-pd-entity'), entity);
  assert.ok((await drawer.locator('#pd-title').innerText()).trim());
  await assets(page, `${entity} Drawer`);
  for (const group of await drawer.locator('[data-pd-motion-group]').all()) {
    if (await group.isVisible()) await group.scrollIntoViewIfNeeded();
  }
  await assets(page, `${entity} Drawer after scrolling`);
  await closeDrawer(page);
}

async function responsive(page, label) {
  for (const width of [1920, 788, 390, 320]) {
    await page.setViewportSize({width, height: 1000});
    await page.mouse.move(width - 1, 1);
    if (await page.locator('body').evaluate(body => body.classList.contains('mobile-menu-open'))) await page.locator('#collapse-menu').click();
    await page.waitForTimeout(200);
    const sizes = await page.evaluate(() => ({viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth}));
    assert.ok(sizes.document <= width + 1 && sizes.body <= width + 1, `${label} ${width}px: no horizontal page overflow: ${JSON.stringify(sizes)}`);
    await assets(page, `${label} ${width}px`);
    if (width === 1920 || width === 390) await page.screenshot({path: path.join(os.tmpdir(), `bpm-standalone-${label}-${width}.png`)});
  }
  await page.setViewportSize({width: 1920, height: 1080});
}

async function topKp(page, url) {
  await page.locator('#top-paths').click();
  await page.waitForFunction(() => !document.querySelector('#top-kp-panel')?.hidden && document.querySelectorAll('#top-kp-panel [data-top-kp-id]').length === 136);
  assert.equal(new URL(page.url()).hash, '#top-kp');
  assert.equal(await page.locator('#top-paths').getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('menu-collapsed')),true,'TOP opens with the narrow menu');
  async function expandTopMenu(target) {
    if(!await target.locator('body').evaluate(body=>body.classList.contains('menu-collapsed')))return;
    await target.locator('#sidebar').hover({position:{x:4,y:45}});
    if(!await target.locator('body').evaluate(body=>body.classList.contains('menu-peek')))await target.locator('#collapse-menu').click();
    await target.locator('#pin-menu').click();
    await target.mouse.move((await target.viewportSize()).width-2,1);
    await target.evaluate(async()=>{for(let frame=0;frame<5;frame++)await new Promise(requestAnimationFrame);});
  }
  const source = await page.evaluate(() => ({
    count: window.BPM_TOP_KP.records.length,
    blocks: window.BPM_TOP_KP.blocks.map(block => block.name),
    first: window.BPM_TOP_KP.records.find(record => record.sourceCell === 'A3'),
    firstCode: window.BpmTopKpIdentifiers.codeFor(window.BPM_TOP_KP.records.find(record => record.sourceCell === 'A3')),
    missing: window.BPM_TOP_KP.records.every(record => !record.code && record.efficiency === null && record.owner === null && record.linkedProcesses.length === 0)
  }));
  assert.equal(source.count, 136);
  assert.deepEqual(source.blocks, ['Каналы', 'Управление клиентским опытом', 'Корпоративное управление', 'Основной бизнес', 'Поддерживающие процессы']);
  assert.equal(source.first.title, 'Идентификация по SberID');
  assert.equal(source.missing, true, 'Synthetic display values do not overwrite missing Excel data');
  const identifiers=await page.locator('#top-kp-panel .top-kp-card').evaluateAll(cards=>cards.map(card=>({id:card.dataset.topKpId,code:card.dataset.topKpCode,expected:window.BpmTopKpIdentifiers.codeFor(window.BPM_TOP_KP.records.find(record=>record.id===card.dataset.topKpId))})));
  assert.equal(new Set(identifiers.map(record=>record.code)).size,136,'All demo business IDs are unique');
  for(const record of identifiers){assert.match(record.code,/^КП\d{4}$/);assert.equal(record.code,record.expected,'Card ID matches the stable demo identifier adapter');}
  assert.equal(await page.locator('[data-source-category="H10"] > h3').textContent(), 'Управление багосостоянием', 'Workbook category names are preserved');
  assert.equal(await page.locator('[data-top-kp-id="top-kp-sheet1-i4"] .top-kp-card-title').textContent(), 'Подключение подписки СберПрайм');

  assert.equal(await page.locator('.top-kp-count').textContent(),'136','Current record count is shown next to the title');
  assert.equal(await page.locator('.top-kp-filters .top-kp-filter').count(),10,'All ten Figma filters are embedded');
  assert.deepEqual(await page.locator('.top-kp-filter .internal-label').allTextContents(),['Блоки','ССП','Эффективность','CSAT/CSI','Технические ошибки','Обращения','Вариативность','PM','Бенчмаркинг','Гемба']);
  assert.deepEqual(await page.locator('.top-kp-legend>span').allTextContents(),['Эффективность','0–44%','45–64%','65–84%','85–100%','Нет данных']);
  const topIcons=await page.locator('.top-kp-legend img,.top-kp-filter .select-toggle img').evaluateAll(async images=>{await Promise.all(images.map(image=>image.decode()));return images.map(image=>({src:image.getAttribute('src'),width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight}));});
  assert.equal(topIcons.length,15,'Five legend icons and ten dropdown chevrons');
  for(const icon of topIcons){assert.match(icon.src,/^data:image\/svg\+xml/,'TOP icons are embedded SVGs, not sibling files');assert.equal(icon.width,16);assert.equal(icon.height,16);assert.ok(icon.naturalWidth>0&&icon.naturalHeight>0);}
  async function verifyTopFilters(label) {
    const reset=page.locator('.top-kp-reset');
    assert.equal(await reset.isVisible(),false,'Reset is hidden until a filter is selected');
    await page.locator('#top-filter-efficiency .select-input').click();
    const popup=page.locator('.top-kp-filter-popup');
    await popup.waitFor();
    const menu=await popup.evaluate(element=>({left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right,width:innerWidth,options:[...element.querySelectorAll('[role="option"]')].map(option=>{const style=getComputedStyle(option);return {font:style.fontSize,line:style.lineHeight,weight:style.fontWeight};})}));
    assert.ok(menu.left>=0&&menu.right<=menu.width+1,`${label}: dropdown stays inside viewport`);
    for(const option of menu.options)assert.deepEqual(option,{font:'17px',line:'24px',weight:'590'},`${label}: shared UI semibold dropdown typography`);
    await page.screenshot({path:path.join(os.tmpdir(),`bpm-standalone-top-kp-filter-${label}.png`)});
    await popup.locator('[role="option"]').filter({hasText:/^Лидер$/}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.top-kp-card:disabled').length>0);
    const filtered=await page.evaluate(()=>({total:document.querySelectorAll('.top-kp-card').length,enabled:document.querySelectorAll('.top-kp-card:not(:disabled)').length,count:document.querySelector('.top-kp-count').textContent,faded:[...document.querySelectorAll('.top-kp-card:disabled')].every(card=>getComputedStyle(card).opacity==='0.25')}));
    assert.equal(filtered.total,136,'Filtering does not remove or reflow Excel cards');assert.ok(filtered.enabled>0&&filtered.enabled<136);assert.equal(filtered.count,`${filtered.enabled} / 136`);assert.equal(filtered.faded,true);
    // Closing an option list can expose a card beneath the pointer and its preview.
    await page.mouse.move(1,1);await page.locator('#top-kp-tooltip').waitFor({state:'hidden'});
    await page.locator('#top-filter-pm .select-input').click();
    await page.locator('.top-kp-filter-popup [role="option"]').filter({hasText:/^Есть$/}).click();
    await page.mouse.move(1,1);await page.locator('#top-kp-tooltip').waitFor({state:'hidden'});
    assert.equal(await reset.isVisible(),true,'Eraser appears for active filters');
    assert.equal(await reset.getAttribute('aria-label'),'Сбросить все фильтры');
    await reset.scrollIntoViewIfNeeded();
    const eraser=await reset.locator('img').evaluate(async image=>{await image.decode();const box=image.getBoundingClientRect();return {src:image.getAttribute('src'),width:box.width,height:box.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight};});
    assert.match(eraser.src,/^data:image\/svg\+xml/);assert.equal(eraser.width,24);assert.equal(eraser.height,24);assert.ok(eraser.naturalWidth>0&&eraser.naturalHeight>0);
    const eraserSvg=/;base64,/.test(eraser.src)?Buffer.from(eraser.src.split(',')[1],'base64').toString('utf8'):decodeURIComponent(eraser.src.slice(eraser.src.indexOf(',')+1));
    assert.match(eraserSvg,/fill=["']#0088ff["']/i,'Eraser uses the Blue text token');
    await page.screenshot({path:path.join(os.tmpdir(),`bpm-standalone-top-kp-reset-${label}.png`)});
    await reset.click();
    await page.waitForFunction(()=>document.querySelectorAll('.top-kp-card:disabled').length===0);
    assert.equal(await page.locator('.top-kp-count').textContent(),'136');
    assert.equal(await reset.isVisible(),false,'Eraser hides after resetting all filters');
    assert.deepEqual(await page.locator('.top-kp-filter .select-input').evaluateAll(inputs=>inputs.map(input=>input.title)),Array(10).fill('Все'));
    assert.equal(await page.locator('.top-kp-filter-popup').count(),0,'Reset returns focus without reopening a dropdown');
    assert.deepEqual(await page.locator('#top-kp-panel .top-kp-card').evaluateAll(cards=>cards.map(card=>card.dataset.topKpCode)),identifiers.map(record=>record.code),'Filtering/reset never changes demo IDs');
    assert.equal(await page.locator('.top-kp-card-code').count(),0,'Demo IDs live in metadata, hover and drawer, not in card titles');
  }
  await verifyTopFilters('desktop');
  await assets(page,'ТОП-КП embedded filter/legend assets');
  report('Offline TOP count, 136 stable unique demo IDs, embedded legend/filter/eraser icons, 25% filter opacity and global reset');

  const departmentBackgrounds = await page.locator('.top-kp-department > h3').evaluateAll(elements => [...new Set(elements.map(element => getComputedStyle(element).backgroundImage))]);
  assert.deepEqual(departmentBackgrounds, ['none'], 'Updated Figma department headings use dividers, not the old gradient asset');

  const topViewports = [[320,844],[390,844],[768,1024],[1024,768],[1280,920],[1440,920],[1600,1000],[1920,920],[1920,1080],[2047,1107],[2560,920],[2560,1440],[3200,1800],[3840,920],[3840,2160],[3840,1920]];
  const tiers={compact:{minWidth:80,height:45,twoWidth:100,twoHeight:34,font:'11px',line:'11px',weight:'510',tracking:-.66,padding:'4px 6px',radius:'8px'},regular:{minWidth:100,height:54,twoWidth:128,twoHeight:40,font:'13px',line:'14px',weight:'400',tracking:-.91,padding:'4px 6px',radius:'8px'},large:{minWidth:270,height:64,twoWidth:320,twoHeight:48,font:'17px',line:'16px',weight:'510',tracking:-1.02,padding:'6px',radius:'10px'}};
  const topGeometry = [];
  for (const [width,height] of topViewports) {
    await page.setViewportSize({width, height});
    await page.mouse.move(width - 1, 1);
    await page.waitForTimeout(250);
    await page.evaluate(async()=>{for(let frame=0;frame<5;frame++)await new Promise(requestAnimationFrame);});
    const geometry = await page.evaluate(() => {
      const root = document.querySelector('#top-kp-panel'), panel = root.getBoundingClientRect(), main = root.parentElement, mainStyle = getComputedStyle(main);
      const elements = [...root.querySelectorAll('.top-kp-card')], cards = elements.map(card => card.getBoundingClientRect().width), viewport = root.querySelector('.top-kp-map-viewport');
      const titles = new Map(elements.map(card => [card.dataset.topKpId, card.querySelector('.top-kp-card-title').textContent]));
      const title=elements[0].querySelector('.top-kp-card-title');
      const mainBusiness=root.querySelector('[data-source-category="A9"]'),corporateBusiness=root.querySelector('[data-source-category="A21"]');
      const majorPeers={sameParent:mainBusiness.parentElement===corporateBusiness.parentElement,headingOffset:Math.abs(mainBusiness.querySelector('h2').getBoundingClientRect().top-corporateBusiness.querySelector('h3').getBoundingClientRect().top)};
      const cardDetails=elements.map(card=>{const title=card.querySelector('.top-kp-card-title'),style=getComputedStyle(card),text=getComputedStyle(title);return {height:card.getBoundingClientRect().height,titleHeight:title.getBoundingClientRect().height,font:text.fontSize,line:text.lineHeight,weight:text.fontWeight,tracking:parseFloat(text.letterSpacing),padding:style.padding,insets:parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth),radius:style.borderRadius,clamp:text.webkitLineClamp,transform:text.textTransform,variation:text.fontVariationSettings,code:card.dataset.topKpCode};});
      return {cards,cardDetails,majorPeers,panel: {width: panel.width, height: panel.height,bottom:panel.bottom+scrollY}, availableWidth: main.clientWidth-parseFloat(mainStyle.paddingLeft)-parseFloat(mainStyle.paddingRight), documentWidth: document.documentElement.scrollWidth, viewportWidth: viewport.clientWidth, viewportScrollWidth: viewport.scrollWidth,viewportHeight:viewport.clientHeight,viewportScrollHeight:viewport.scrollHeight,viewportOverflow:getComputedStyle(viewport).overflowY,viewportChain:getComputedStyle(viewport).overscrollBehaviorY,fit:root.dataset.fit,mapFloors:root.querySelector('.top-kp-map').children.length,titleWidth:title.getBoundingClientRect().width,cardGaps:[...root.querySelectorAll('.top-kp-cards')].map(grid=>({cell:grid.parentElement.dataset.sourceCategory,row:getComputedStyle(grid).rowGap,column:getComputedStyle(grid).columnGap})),groupGaps:[...root.querySelectorAll('.top-kp-row,.top-kp-stack,.top-kp-map')].filter(group=>group.children.length>1).map(group=>({gap:getComputedStyle(group).gap,topBlocks:!group.classList.contains('top-kp-map')&&!group.closest('.top-kp-block,.top-kp-department--major')})),codeSpans:root.querySelectorAll('.top-kp-card-code').length,density: root.dataset.density, exactNames: window.BPM_TOP_KP.records.every(record => titles.get(record.id) === record.title)};
    });
    topGeometry.push({width,height,...geometry});
    assert.equal(geometry.cards.length, 136, `${width}px: all Excel cards remain present`);
    assert.ok(geometry.cards.every(value => value > 0 && Math.abs(value - geometry.cards[0]) < .1), `${width}px: all cards have the same global width`);
    assert.equal(geometry.exactNames, true, `${width}px: every source name remains intact after reflow`);
    assert.ok(Math.abs(geometry.panel.width-geometry.availableWidth) <= 1, `${width}px: map fills the available layout width`);
    if (width <= 1440) assert.ok(geometry.panel.height <= 920.1, `${width}px: compact map keeps its 920px cap`);
    assert.ok(geometry.documentWidth <= width + 1, `${width}px: no horizontal page overflow`);
    assert.ok(geometry.viewportScrollWidth <= geometry.viewportWidth + 1, `${width}px: no horizontal inner overflow`);
    if(width>=1280){assert.equal(geometry.mapFloors,3,`${width}×${height}: hierarchy retains three map floors`);assert.ok(geometry.panel.bottom<=height+1,`${width}×${height}: panel stays within viewport`);assert.equal(geometry.majorPeers.sameParent,true,'Main and corporate business remain peer sections');assert.ok(geometry.majorPeers.headingOffset<.1,'Main and corporate business headings share their top line');}
    if(geometry.fit==='true')assert.ok(geometry.viewportScrollHeight<=geometry.viewportHeight+1,`${width}×${height}: a fitted map needs no inner scrolling`);
    else if(geometry.viewportScrollHeight>geometry.viewportHeight+1){assert.equal(geometry.viewportOverflow,'auto',`${width}×${height}: exact minimum cards use native overflow`);assert.equal(geometry.viewportChain,'auto');}
    const tier=tiers[geometry.density];assert.ok(tier,`${width}×${height}: valid Figma tier`);
    const lines=Number(await page.locator('#top-kp-panel').getAttribute('data-lines'));
    assert.ok([2,3].includes(lines),'All cards share one adaptive line mode');
    assert.ok(geometry.cards.every(cardWidth=>cardWidth>=(lines===2?tier.twoWidth:tier.minWidth)-.1),`${width}×${height}: minimum card width is never sacrificed to fit`);
    for(const card of geometry.cardDetails){
      assert.equal(card.font,tier.font);assert.equal(card.line,tier.line);assert.equal(card.weight,tier.weight);assert.ok(Math.abs(card.tracking-tier.tracking)<.005);
      assert.equal(card.padding,tier.padding);assert.equal(card.radius,tier.radius);assert.equal(card.clamp,String(lines));assert.equal(card.transform,'none');assert.equal(card.variation,'"wdth" 100');
      assert.ok(card.titleHeight>=parseFloat(tier.line)-.1&&card.titleHeight<=parseFloat(tier.line)*lines+.1,`${width}×${height}: title respects the shared line limit`);
      assert.equal(card.height,lines===2?tier.twoHeight:tier.height,`${width}×${height}: every card has the same fixed height, regardless of title length`);
      assert.ok(card.titleHeight+card.insets<=card.height+.1,`${width}×${height}: titles fit inside the fixed card`);
    }
    assert.deepEqual(await page.locator('.top-kp-card').evaluateAll(cards=>[...new Set(cards.map(card=>getComputedStyle(card).borderTopWidth))]),['2px'],`${width}×${height}: updated component border thickness`);
    assert.equal(geometry.codeSpans,0,`${width}×${height}: ID row stays removed at every size`);
    assert.deepEqual(geometry.cardDetails.map(card=>card.code),identifiers.map(record=>record.code),`${width}×${height}: ID metadata remains stable`);
    for(const gap of geometry.cardGaps){assert.equal(gap.column,gap.cell==='N10'?'10px':eightPixelColumnGroups.has(gap.cell)?'8px':'4px',`${width}×${height}: ${gap.cell} Figma column gap`);assert.equal(gap.row,tenPixelRowGroups.has(gap.cell)?'10px':eightPixelRowGroups.has(gap.cell)?'8px':'4px',`${width}×${height}: ${gap.cell} Figma row gap`);}
    assert.ok(geometry.groupGaps.every(({gap,topBlocks})=>gap===(topBlocks?'16px':'8px')),`${width}×${height}: updated Figma container gaps`);
    assertHeadingStyles(await page.locator('#top-kp-panel').evaluate(headingStyles),width,height);
    await assets(page, `ТОП-КП ${width}px`);
    if ([1440,390,2047,3840].includes(width)) await page.screenshot({path: path.join(os.tmpdir(), `bpm-standalone-top-kp-${width}x${height}.png`)});
    if(width===1440||width===2047)await verifyTopFilters(`${width}x${height}`);
  }
  const compact = topGeometry.find(item => item.width === 1440), desktop = topGeometry.find(item => item.width === 1920&&item.height===1080), fourK = topGeometry.find(item => item.width === 3840&&item.height===2160);
  assert.ok(desktop.panel.width > 1440 && fourK.panel.width > desktop.panel.width, 'Panel expands beyond the old 1440px cap');
  assert.ok(desktop.cards[0] > compact.cards[0] && fourK.cards[0] > desktop.cards[0], 'Card widths increase on wide screens');
  assert.ok(fourK.titleWidth>desktop.titleWidth&&desktop.titleWidth>compact.titleWidth,'Wider adaptive cards expose more title text');
  assert.equal(fourK.codeSpans,0,'Wide cards also reserve the whole card for the title');

  for(const width of [1440,1920])for(const mode of ['expanded','collapsed']) {
    const menuPage=await page.context().newPage();
    try {
      await menuPage.setViewportSize({width,height:920});
      await menuPage.addInitScript(mode=>localStorage.setItem('bpm-registry-menu',mode),mode);
      await menuPage.goto(`${url}#top-kp`);
      await menuPage.waitForFunction(()=>document.querySelectorAll('.top-kp-card').length===136);
      assert.equal(await menuPage.locator('body').evaluate(body=>body.classList.contains('menu-collapsed')),true,'Every TOP entry starts narrow regardless of the saved global preference');
      if(mode==='expanded')await expandTopMenu(menuPage);
      await menuPage.evaluate(async()=>{await document.fonts.ready;for(let frame=0;frame<5;frame++)await new Promise(requestAnimationFrame);});
      const fitted=await menuPage.locator('#top-kp-panel').evaluate(root=>{
        const cards=[...root.querySelectorAll('.top-kp-card')].map(card=>card.getBoundingClientRect());let overlaps=0;
        for(let a=0;a<cards.length;a++)for(let b=a+1;b<cards.length;b++)if(Math.min(cards[a].right,cards[b].right)-Math.max(cards[a].left,cards[b].left)>.1&&Math.min(cards[a].bottom,cards[b].bottom)-Math.max(cards[a].top,cards[b].top)>.1)overlaps++;
        const view=root.querySelector('.top-kp-map-viewport');
        return {fit:root.dataset.fit,bottom:root.getBoundingClientRect().bottom+scrollY,overlaps,overflow:view.scrollHeight-view.clientHeight,overflowY:getComputedStyle(view).overflowY,chain:getComputedStyle(view).overscrollBehaviorY,minCardWidth:Math.min(...cards.map(card=>card.width)),floors:root.querySelector('.top-kp-map').children.length,collapsed:document.body.classList.contains('menu-collapsed')};
      });
      assert.equal(fitted.collapsed,mode==='collapsed');assert.equal(fitted.floors,3);assert.ok(fitted.minCardWidth>=79.9);
      assert.ok(fitted.bottom<=921,`${width}px ${mode}: map panel bottom ${fitted.bottom}`);assert.equal(fitted.overlaps,0,`${width}px ${mode}: no overlapping cards`);
      if(fitted.fit==='true')assert.ok(fitted.overflow<=1,`${width}px ${mode}: fitted map has no overflow`);
      else if(fitted.overflow>1){assert.equal(fitted.overflowY,'auto');assert.equal(fitted.chain,'auto');}
      report(`ТОП-КП ${width}×920 / ${mode} menu: minimum widths preserved, three floors ${fitted.fit==='true'?'fit':'scroll internally'} without overlapping cards`);
    } finally {await menuPage.close();}
  }

  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(200);
  await page.evaluate(()=>scrollTo(0,0));
  await verifyTopFilters('mobile');
  const viewport = page.locator('.top-kp-map-viewport');
  await page.evaluate(() => scrollTo(0, 0));
  await viewport.evaluate(element => {element.scrollTop = 0;});
  await page.waitForFunction(() => document.querySelector('.top-kp-map-viewport')?.dataset.scrollFade === 'bottom');
  const scrollState = await viewport.evaluate(element => ({overflow: element.scrollHeight - element.clientHeight, behavior: getComputedStyle(element).overscrollBehaviorY, mask: getComputedStyle(element).maskImage}));
  assert.ok(scrollState.overflow > 100, 'Mobile map has genuine inner overflow');
  assert.equal(scrollState.behavior, 'auto', 'Map allows native scroll chaining');
  assert.match(scrollState.mask, /linear-gradient/, 'Mobile overflowing map has a gradient edge');
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + box.width / 2, Math.min(800, box.y + box.height / 2));
  await page.mouse.wheel(0, 140);
  await page.waitForFunction(() => {
    const element = document.querySelector('.top-kp-map-viewport');
    return element.scrollTop > 0 && element.dataset.scrollFade === 'both';
  });
  await viewport.evaluate(element => {element.scrollTop = element.scrollHeight;});
  await page.waitForFunction(() => document.querySelector('.top-kp-map-viewport')?.dataset.scrollFade === 'top');
  const pageScrollBefore = await page.evaluate(() => ({y: scrollY, room: document.documentElement.scrollHeight - innerHeight - scrollY}));
  if (pageScrollBefore.room > 2) {
    await page.mouse.wheel(0, 180);
    await page.waitForFunction(y => scrollY > y, pageScrollBefore.y);
  }

  await page.setViewportSize({width: 1440, height: 920});
  await viewport.evaluate(element => {element.scrollTop = 0;});
  const first = page.locator(`[data-top-kp-id="${source.first.id}"]`);
  await first.click();
  await page.waitForFunction(() => {
    const drawer = document.querySelector('#process-drawer');
    return drawer?.open && drawer.dataset.pdEntity === 'paths' && !drawer.classList.contains('pd-is-loading') && !drawer.querySelector('.pd-main')?.inert;
  });
  const drawer = page.locator('#process-drawer');
  assert.equal(await drawer.locator('#pd-title').textContent(), source.first.title);
  assert.match(await drawer.innerText(), /Каналы|Цифровой канал/);
  assert.equal(await page.locator('#top-kp-detail').count(), 0, 'Excel card uses the standard КП drawer, not a separate custom modal');
  const efficiency = await page.evaluate(id => window.BpmTopKp.score(window.BPM_TOP_KP.records.find(record => record.id === id)), source.first.id);
  await page.waitForFunction(value => Number(document.querySelector('#process-drawer .jd-widget .pd-widget-value')?.textContent.replace('%','').replace(',','.').trim()) === value, efficiency);
  assert.equal(await drawer.locator('#jd-included-processes .jd-process-card').count(), 0, 'No invented process relationships');
  assert.equal(await drawer.locator('.pd-heading-labels [data-pd-action="copy"]').count(), 1, 'The authorized demo business ID can be copied');
  assert.equal(await drawer.locator('.pd-heading-labels .pd-id-badge').textContent(), source.firstCode, 'Card and standard drawer share the same demo ID');
  assert.equal(await drawer.locator('.pd-heading-labels [data-pd-action="copy"]').getAttribute('data-pd-copy'),source.firstCode);
  for (const anchor of ['about','assessment','benchmark','additional']) {
    assert.equal(await drawer.locator(`#pd-${anchor}`).count(), 1);
    assert.equal(await drawer.locator(`[data-pd-anchor="${anchor}"]`).count(), 1);
  }
  await assets(page, 'ТОП-КП detail');
  await page.keyboard.press('Escape');
  await page.locator('#process-drawer[open]').waitFor({state: 'hidden'});
  assert.equal(await first.evaluate(element => element === document.activeElement), true, 'Escape returns to the selected map card');

  const deepLink = await page.context().newPage();
  try {
    await deepLink.goto(`${url}#top-kp`);
    await deepLink.waitForFunction(() => !document.querySelector('#top-kp-panel')?.hidden && document.querySelectorAll('#top-kp-panel .top-kp-card').length === 136);
    assert.equal(await deepLink.locator('#top-paths').getAttribute('aria-current'), 'page', 'Renamed standalone opens directly at #top-kp');
    await assets(deepLink, 'ТОП-КП direct hash navigation');
  } finally {await deepLink.close();}
  await page.setViewportSize({width: 1920, height: 1080});
  await expandTopMenu(page);
  report('Offline ТОП-КП navigation/deep link, 136 source-backed equal-width cards, updated Figma headers/dividers/padding, responsive map through 4K, native inner scroll/fades and standard КП drawer');
}

async function main() {
  assert.ok(fs.existsSync(source), `Build the standalone file first: ${source}`);
  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-standalone-verify-'));
  const copy = path.join(isolated, 'renamed-offline-prototype.html');
  fs.copyFileSync(source, copy);
  assert.deepEqual(fs.readdirSync(isolated), ['renamed-offline-prototype.html']);
  const url = pathToFileURL(copy).href;
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  const context = await browser.newContext({offline: true, acceptDownloads: true, viewport: {width: 1920, height: 1080}});
  const errors = [], failures = [], unexpected = [], resources = new Set();
  const short = value => value.length > 180 ? `${value.slice(0, 180)}…` : value;
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  context.on('request', request => {
    const requested = request.url();
    resources.add(request.resourceType());
    if (!/^(data:|blob:)/.test(requested) && requested.split(/[?#]/)[0] !== url) unexpected.push(short(requested));
  });
  context.on('requestfailed', request => failures.push(`${short(request.url())}: ${request.failure()?.errorText}`));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  try {
    await page.goto(`${url}#main`);
    await ready(page);
    assert.ok(await page.locator('.entity-card:not(.skeleton-card)').count() > 0);
    await assets(page, 'Initial cards');
    await page.waitForFunction(() => [...document.querySelectorAll('.efficiency[data-efficiency-percent]')].filter(e => e.getClientRects().length).every(element => {
      const number = element.querySelector('[data-counter-number]');
      return !number || Math.abs(Number(number.textContent.replace(/\s/g, '').replace(',', '.')) - Number(element.dataset.efficiencyPercent)) < .001;
    }));
    await detail(page, page.locator('#results [data-detail]').first(), 'paths');
    await page.locator('#processes-tab').click(); await ready(page);
    await detail(page, page.locator('#results [data-detail]').first(), 'processes');
    await page.locator('#table-view').click(); await ready(page);
    assert.ok(await page.locator('.registry-table tbody tr[data-record]').count() > 0);
    await page.locator('.registry-table [data-sort="owner"]').click();
    assert.equal(await page.locator('.registry-table th[aria-sort="ascending"], .registry-table th[aria-sort="descending"]').count(), 1);
    await assets(page, 'Registry table');
    await page.locator('#cards-view').click(); await ready(page);
    await page.locator('#registry-search').fill('несуществующая запись standalone 999'); await ready(page);
    assert.equal(await page.locator('.entity-card').count(), 0);
    await page.locator('#clear-search').click(); await ready(page);
    await page.locator('#block-select-input').click();
    const option = page.locator('#block-select-list [role="option"]').filter({hasNotText: /^Все$/}).first();
    await option.click(); await page.keyboard.press('Escape'); await ready(page);
    assert.ok(await page.locator('#selected-filter-groups [data-filter-key="block"]').count() > 0);
    await page.locator('#reset-filters').click(); await ready(page);
    await page.locator('#date-filter').click();
    await page.locator('.bpm-calendar').waitFor();
    await assets(page, 'Registry calendar');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.bpm-calendar').count(), 0);
    await responsive(page, 'registry');
    report('Offline cards/table, search/reset, selected filters, calendar, animated efficiency and both full Drawers');

    await page.locator('#structure-toggle').click(); await ready(page, 'structure-list');
    assert.equal(await page.locator('#structure-list > .structure-node').count(), 9);
    assert.equal(await page.locator('.structure-heading[aria-expanded="true"]').count(), 0);
    assert.ok(await page.locator('[data-chart-type="2"]').count() > 0);
    assert.equal(await page.locator('#structure-list [data-chart-type="1"]').count(), 0, 'Structure uses the fixed proportional chart');
    assert.ok(await page.locator('#structure-list [data-average-chart]').count() > 0, 'Average efficiency is always enabled');
    assert.equal(await page.locator('#structure-owner, #structure-average-toggle, #structure-chart-toggle').count(), 0, 'Removed settings are absent from the compact toolbar');
    const fixture = await page.evaluate(() => {
      const path = window.BPM_STRUCTURE_PATHS.records.find(row => row.code === 'КП-ДЕМО-0027');
      const product = path.productLinks[0].id;
      let chain;
      for (const root of window.BPM_STRUCTURE.roots) for (const division of root.children) if (division.children.some(child => child.id === product)) chain = [root.id, division.id, product];
      return {chain, path: path.id, processes: path.linkedProcessIds.length, process: 'structure-p433', paths: window.BPM_STRUCTURE_PATHS.records.filter(row => row.linkedProcessIds.includes('structure-p433')).length};
    });
    for (const entity of ['processes', 'paths']) {
      const tab = page.locator(`#structure-${entity}-tab`);
      if (await tab.getAttribute('aria-pressed') !== 'true') {await tab.click(); await ready(page, 'structure-list');}
      for (const id of fixture.chain) {
        const heading = page.locator(`[data-expand="${id}"]`);
        if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
      }
      const id = entity === 'processes' ? fixture.process : fixture.path;
      if (entity === 'processes') {
        assert.equal(await page.locator('#structure-list [data-structure-related], #structure-list .structure-linked-row').count(), 0, 'Process view has no reverse KP disclosure');
        await assets(page, 'Structure terminal process rows');
        await detail(page, page.locator(`[data-structure-detail="${id}"]`).first(), entity);
        continue;
      }
      const button = page.locator(`[data-structure-related="${id}"]`).first();
      const control = await button.getAttribute('aria-controls');
      await button.click();
      const panel = page.locator(`[id="${control}"]`);
      const childEntity = entity === 'processes' ? 'paths' : 'processes';
      const rows = panel.locator(`[data-structure-record][data-record-entity="${childEntity}"]`);
      assert.equal(await rows.count(), entity === 'processes' ? fixture.paths : fixture.processes);
      assert.equal(await panel.locator('.structure-pagination').count(), 0);
      if (childEntity === 'processes') assert.equal(await panel.locator('.structure-incoming-relationship').count(), fixture.processes);
      await assets(page, `Structure ${entity} reciprocal rows`);
      await detail(page, rows.first().locator('[data-structure-detail]'), childEntity);
    }
    await responsive(page, 'structure');
    const documentation = page.locator('.structure-note a');
    if (await documentation.count()) {
      await documentation.click();
      const dialog = page.locator('dialog[open]');
      await dialog.waitFor();
      assert.match(await dialog.innerText(), /источник|структур|Excel/i);
      await page.keyboard.press('Escape');
      await dialog.waitFor({state: 'hidden'});
    }
    report('Both Structure entities, fixed proportional charts and average efficiency, terminal process rows, Excel-backed KP → process disclosure, participation tags, embedded source documentation and responsive layout');

    await page.locator('#tasks-nav').click(); await ready(page, 'tasks-results');
    assert.ok(await page.locator('.task-table-row[data-task-id]').count() > 0);
    await page.locator('#tasks-cards').click(); await ready(page, 'tasks-results');
    assert.ok(await page.locator('#tasks-results article[data-task-id]').count() > 0);
    await page.locator('[data-task-tab="all"]').click(); await ready(page, 'tasks-results');
    await page.locator('#tasks-search').fill('К-2026-0002'); await ready(page, 'tasks-results');
    assert.equal(await page.locator('#tasks-results article[data-task-id]').count(), 1);
    await page.locator('#tasks-clear-search').click(); await ready(page, 'tasks-results');
    await page.locator('#tasks-date').click();
    await page.locator('.bpm-calendar').waitFor();
    await page.locator('.bpm-calendar [data-picker="year"]').click();
    await page.locator('.bpm-calendar-picker [data-picker-value="2026"]').click();
    await page.locator('.bpm-calendar [data-picker="month"]').click();
    await page.locator('.bpm-calendar-picker [data-picker-value="8"]').click();
    await page.locator('.bpm-calendar [data-date="2026-09-12"][data-own-month="true"]').click();
    await page.locator('.bpm-calendar [data-date="2026-09-16"][data-own-month="true"]').click(); await ready(page, 'tasks-results');
    assert.equal(await page.locator('#tasks-date-summary').innerText(), '12.09.2026 → 16.09.2026');
    await page.locator('#tasks-reset').click(); await ready(page, 'tasks-results');
    await page.locator('#tasks-create').click();
    await page.locator('#task-drawer[open]').waitFor();
    assert.equal(await page.locator('[data-task-type]').count(), 9);
    await page.locator('[data-task-type="standard"]').click();
    await page.locator('#task-flow[open][data-mode="create"]').waitFor();
    assert.equal(await page.locator('#task-flow #tf-form').count(), 1);
    await assets(page, 'Standard task form');
    await page.keyboard.press('Escape');
    await page.locator('#task-flow[open]').waitFor({state: 'hidden'});
    await responsive(page, 'tasks');
    report('Tasks table/cards, tabs, search, calendar range, standard creation form and responsive layout');

    await topKp(page, url);

    await page.locator('#registry-nav').click(); await ready(page);
    for (const id of ['paths-nav', 'gemba-nav']) {
      await page.locator(`#${id}`).click(); await assets(page, `${id} collapsed chevron`);
      await page.locator(`#${id}`).click(); await assets(page, `${id} expanded chevron`);
    }
    await page.locator('#collapse-menu').click();
    await assets(page, 'Collapsed sidebar arrow');
    await page.mouse.move(1800, 500);
    await page.locator('#sidebar').hover();
    await page.locator('#pin-menu').click();
    await assets(page, 'Pinned sidebar arrow');
    await page.locator('#export').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-form button[type="submit"]').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.csv$/);
    assert.equal(await download.failure(), null);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    assert.match(csv, /Эффективность/);
    assert.ok(csv.split('\n').length > 2);
    await page.locator('.brand').click();
    await page.waitForFunction(() => !document.querySelector('#cabinet-panel')?.hidden && document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy') === 'false');
    assert.equal(page.url().split(/[?#]/)[0], url, 'Brand works after the HTML is renamed');
    await assets(page, 'Brand self navigation');
    report('Dynamic menu assets, offline CSV download and renamed-file logo navigation');

    assert.deepEqual(errors, [], 'No JavaScript errors');
    assert.deepEqual(failures, [], 'No failed resource loads');
    assert.deepEqual(unexpected, [], 'No sibling-file or network resource requests');
    console.log(JSON.stringify({status: 'PASS', source, isolatedFile: copy, bytes: fs.statSync(copy).size, resourceTypes: [...resources], errors, failures, unexpected, screenshots: [path.join(os.tmpdir(), 'bpm-standalone-{registry,structure,tasks}-{1920,390}.png'), path.join(os.tmpdir(), 'bpm-standalone-top-kp-{1440x920,390x844,2047x1107,3840x2160,3840x1920}.png'),path.join(os.tmpdir(),'bpm-standalone-top-kp-{filter,reset}-{desktop,mobile,1440x920,2047x1107}.png')]}, null, 2));
  } catch (error) {
    await page.screenshot({path: path.join(os.tmpdir(), 'bpm-standalone-failure.png')}).catch(() => {});
    console.error(JSON.stringify({errors, failures, unexpected, isolatedFile: copy}, null, 2));
    throw error;
  } finally {await context.close(); await browser.close();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});

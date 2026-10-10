/* Disposable offline contexts: an actual own rejection stays in the route and
 * uses the same committed-decision flight as an approval, without faking state. */
'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=path.resolve(process.argv[2]||path.join(__dirname,'index.html'));
const projectionOnly=process.argv.includes('--projection-only');
const base=pathToFileURL(source).href+'#insights';
const id='INS-000058';
const shots=fs.mkdtempSync(path.join(os.tmpdir(),'bpm-insight-rejection-motion-'));
const ready=page=>page.waitForFunction(()=>document.querySelector('#insights-results')?.getAttribute('aria-busy')==='false');
const read=page=>page.evaluate(id=>BpmInsightStore.get(id),id);
const decisionButton=(scope,separate=false)=>scope.locator(separate?'[data-ia-decision="reject"]':'[data-id-approval="reject"]');
const confirmation=(page,separate=false)=>page.locator(separate?'#insight-approval-confirm':'#insight-detail-approval-confirm').last();
const normalTracker=scope=>scope.locator('.ia-tracker:not(.ia-tracker--flight)');
async function registry(page){
 if(await page.locator('#cabinet-insight-drawer[open]').count()){
  await page.locator('[data-id-drawer-close]').click();
  await page.locator('#cabinet-insight-drawer[open]').waitFor({state:'hidden'});
 }
 if(await page.locator('#cabinet-panel').isVisible())await page.locator('[data-cabinet-nav="insights"]').click();
 if(await page.locator('#insights-panel.is-insight-detail').count())await page.locator('.insights-view-controls button[aria-pressed="true"]').click();
 await ready(page);
}
async function open(page){await registry(page);await page.locator(`[data-insight-open="${id}"]`).click();await page.locator('#insight-detail-title').waitFor();return page.locator('#insights-detail-view');}
async function reset(page){await registry(page);await page.evaluate(()=>BpmInsightStore.resetDemo());await ready(page);}
async function end(scope){await scope.locator('.id-detail-scroll,.ia-scroll').evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'));});}
async function begin(page,scope,separate=false,{review=true}={}){
 if(review)await end(scope);const button=decisionButton(scope,separate);
 assert.ok(await button.isEnabled(),'Reject does not require the Approve scroll gate');
 await button.click();const modal=confirmation(page,separate);await modal.waitFor({state:'visible'});
 // Click waits for a sliding Cabinet drawer to settle; measure its final
 // action position, not an earlier intermediate entrance frame.
 const anchor=await button.evaluate(node=>{const rect=node.getBoundingClientRect();return {left:rect.left,right:rect.right,center:(rect.left+rect.right)/2};});
 assert.ok(await modal.evaluate(node=>node.matches(':modal')),'Rejection uses a native modal confirmation');
 assert.equal(await modal.locator('h2').textContent(),'Отклонить инсайт?');
 assert.equal(await modal.locator('textarea').evaluate(node=>node.required),true,'A rejection comment is mandatory');
 return {modal,anchor};
}
async function watch(scope){
 await scope.evaluate(node=>{
  node.__rejectionPhases=[];node.__rejectionFlights=0;
  node.__rejectionObserver?.disconnect();
  node.__rejectionObserver=new MutationObserver(records=>{
   for(const record of records){
    if(record.type==='attributes'&&record.attributeName==='data-ia-approval-phase'){
     const phase=node.dataset.iaApprovalPhase;
     if(phase&&node.__rejectionPhases.at(-1)!==phase)node.__rejectionPhases.push(phase);
    }
    for(const item of record.addedNodes||[])if(item.nodeType===1&&item.classList.contains('ia-approval-flight-layer'))node.__rejectionFlights++;
   }
  });
  node.__rejectionObserver.observe(node,{attributes:true,childList:true});
 });
}
async function noMotion(scope,label){
 const result=await scope.evaluate(node=>({phases:node.__rejectionPhases||[],flights:node.__rejectionFlights||0,hidden:node.querySelectorAll('.is-approval-flight-source').length,phase:node.dataset.iaApprovalPhase||null}));
 assert.deepEqual(result,{phases:[],flights:0,hidden:0,phase:null},`${label}: no committed-decision motion is painted`);
 assert.equal(await scope.locator('.ia-approval-flight-layer').count(),0);
}
async function savedRejection(page,comment){
 const row=await read(page),model=row.detail.workflow,actor=model.currentActor;
 assert.equal(row.status,'Отклонено','The chair rejection commits the real terminal status');
 assert.equal(model.stage,'complete');
 assert.equal(row.needsApproval,false);
 const stage=model.stages.find(stage=>stage.id==='chair');
 assert.equal(stage.status,'rejected');
 const own=stage.decisions.filter(item=>item.actorId===actor.id);
 assert.equal(own.length,1,'A successful submit persists one own decision');
 assert.equal(own[0].decision,'reject');assert.equal(own[0].comment,comment);
 assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(own[0].date));
 assert.equal(row.rejection,comment);
 assert.ok(row.detail.comments.some(item=>item.text===comment&&item.kind==='decision'));
 return row;
}
async function ownRed(scope,row,selector='.ia-tracker:not(.ia-tracker--flight)'){
 const tracker=scope.locator(selector),own=tracker.locator('[data-ia-own-stage][data-stage-state="rejected"]');
 assert.equal(await own.count(),1,'Our saved rejection is still labelled in the approval route');
 assert.equal(await own.locator('.ia-stage-own').textContent(),'Ваше согласование');
 assert.equal(await own.locator('.ia-stage-own').evaluate(node=>getComputedStyle(node).color),'rgb(97, 85, 245)','The personal label keeps the DS purple colour');
 const decision=row.detail.workflow.stages.flatMap(stage=>stage.decisions).find(item=>item.actorId===row.detail.workflow.currentActor.id&&item.decision==='reject');
 assert.equal(await own.locator('.ia-stage-date-line small').textContent(),decision.date.split('-').reverse().join('.'));
 const line=await own.locator('.ia-stage-own').evaluate(node=>({own:node.getBoundingClientRect().top,date:node.parentElement.querySelector('small').getBoundingClientRect().top}));
 assert.ok(Math.abs(line.own-line.date)<2,'The own rejection label remains beside its date');
 const icon=await own.locator('.ia-stage-rail > img').evaluate(async node=>{await node.decode();return {source:node.src,width:node.width,height:node.height,naturalWidth:node.naturalWidth,naturalHeight:node.naturalHeight};});
 assert.deepEqual({width:icon.width,height:icon.height,naturalWidth:icon.naturalWidth,naturalHeight:icon.naturalHeight},{width:24,height:24,naturalWidth:24,naturalHeight:24});
 if(icon.source.startsWith('data:')){
  const [metadata,...content]=icon.source.split(','),encoded=content.join(',');
  const svg=metadata.includes(';base64')?Buffer.from(encoded,'base64').toString('utf8'):decodeURIComponent(encoded);
  assert.equal(svg,fs.readFileSync(path.join(__dirname,'assets/insight-approval/rejected.svg'),'utf8'),'The standalone uses the unchanged original red DS rejection icon');
 }else assert.match(icon.source,/\/assets\/insight-approval\/rejected\.svg$/,'The own rejection uses the original red DS icon');
 assert.equal(await tracker.locator('h3').textContent(),'Ход согласования');
}
async function submit(page,scope,comment,separate=false){
 await watch(scope);const {modal,anchor}=await begin(page,scope,separate);
 await modal.locator('textarea').fill(comment);await modal.locator('[type=submit]').click();
 await modal.waitFor({state:'hidden'});
 return {row:await savedRejection(page,comment),anchor};
}
async function flight(page,scope,row,anchor,shot){
 await scope.locator('.ia-tracker--flight').waitFor();
 assert.equal(await scope.getAttribute('data-ia-approval-phase'),'appearing','The committed decision starts in the shared appearing phase');
 assert.equal(await scope.locator('.ia-tracker--flight [data-ia-own-stage]').getAttribute('data-stage-state'),'current','The flight first shows the captured current approval stage');
 await scope.locator('.ia-tracker--flight [data-ia-own-stage][data-stage-state="rejected"]').waitFor();
 assert.equal(await scope.getAttribute('data-ia-approval-phase'),'completed');
 await ownRed(scope,row,'.ia-tracker--flight');
 const geometry=await scope.evaluate(node=>{const card=node.querySelector('.ia-tracker--flight').getBoundingClientRect(),footer=node.querySelector('.id-detail-footer,.ia-footer').getBoundingClientRect(),view=node.getBoundingClientRect();return {card:{left:card.left,right:card.right,top:card.top,bottom:card.bottom},footer:footer.top,view:{left:view.left,right:view.right,top:view.top,bottom:view.bottom}};});
 assert.ok(geometry.card.bottom<=geometry.footer+2,`The red decision is above the footer: ${JSON.stringify(geometry)}`);
 assert.ok(geometry.card.left>=geometry.view.left-1&&geometry.card.right<=geometry.view.right+1,'The flight stays inside its own panel');
 assert.ok(anchor.center>=geometry.card.left-1&&anchor.center<=geometry.card.right+1,`The rejection flight is anchored over Reject, not over Approve: ${JSON.stringify({anchor,geometry})}`);
 assert.equal(await scope.locator('.ia-approval-flight-layer').getAttribute('aria-hidden'),'true');
 assert.ok(await scope.locator('.ia-approval-flight-layer').evaluate(node=>node.inert),'The visual clone cannot receive focus or actions');
 const shadows=await scope.evaluate(node=>({flight:getComputedStyle(node.querySelector('.ia-tracker--flight')).boxShadow,normal:getComputedStyle(node.querySelector('.ia-tracker:not(.ia-tracker--flight)')).boxShadow}));
 assert.notEqual(shadows.flight,shadows.normal,'The floating tracker has the stronger approval-motion shadow');
 await scope.screenshot({path:path.join(shots,`${shot}.png`)});
 await scope.locator('.ia-approval-flight-layer').waitFor({state:'detached'});
 const phases=await scope.evaluate(node=>node.__rejectionPhases);
 assert.deepEqual(phases,['appearing','completed','returning'],'Rejection uses the same three motion phases as approval');
 assert.equal(await normalTracker(scope).count(),1,'The real upper-slot tracker survives the return');
 assert.equal(await scope.locator('.is-approval-flight-source').count(),0,'The original is no longer hidden');
 assert.equal(await scope.getAttribute('data-ia-approval-phase'),null);
 const returned=await scope.evaluate(node=>{const tracker=node.querySelector('.ia-tracker').getBoundingClientRect(),scroll=node.querySelector('.id-detail-scroll,.ia-scroll').getBoundingClientRect();return {top:tracker.top,bottom:tracker.bottom,viewTop:scroll.top,viewBottom:scroll.bottom};});
 assert.ok(returned.top>=returned.viewTop-1&&returned.bottom<=returned.viewBottom+1,`The returned tracker stays visible in its own scroll area: ${JSON.stringify(returned)}`);
 await ownRed(scope,row);assert.deepEqual(await read(page),row,'Animating the saved decision never mutates stored business data');
 await scope.screenshot({path:path.join(shots,`${shot}-returned.png`)});
}
async function cabinet(page){
 await registry(page);await page.locator('#cabinet-nav').click();
 await page.waitForFunction(()=>!document.querySelector('#cabinet-panel').hidden&&document.querySelector('#cabinet-feed-insights')?.getAttribute('aria-busy')==='false');
 await page.locator(`#cabinet-feed-insights [data-cabinet-open="${id}"] .card-title`).click();
 await page.locator('#cabinet-insight-drawer[open]').waitFor();return page.locator('#insights-detail-view');
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],failed=[],external=[];
 async function context(options={}){
  const context=await browser.newContext({viewport:{width:1440,height:1080},offline:true,reducedMotion:'no-preference',...options});
  context.on('page',page=>{
   page.on('pageerror',error=>errors.push(error.message));
   page.on('requestfailed',request=>failed.push(request.url()));
   page.on('request',request=>{if(!/^(file:|data:)/.test(request.url()))external.push(request.url());});
  });return context;
 }
 try{
  const desktop=await context(),page=await desktop.newPage();await page.goto(base);await ready(page);
  const history=await page.evaluate(id=>{
   const beforeRows=JSON.stringify(BpmInsightStore.list()),beforeStorage=localStorage.getItem('bpm-insight-store:v1');
   const projection=row=>{
    const holder=document.createElement('template');holder.innerHTML=BpmInsightApproval.tracker(row);
    const dom=holder.content;
    return {html:holder.innerHTML,text:dom.textContent,heading:dom.querySelector('h3')?.textContent||'',red:dom.querySelectorAll('[data-stage-state="rejected"]').length,own:dom.querySelectorAll('[data-ia-own-stage]').length,current:dom.querySelectorAll('[data-stage-state="current"],[data-stage-state="pending"]').length,dateLines:dom.querySelectorAll('.ia-stage-date-line,.ia-stage-deadline').length,people:[...dom.querySelectorAll('.ia-stage-copy small')].map(node=>node.textContent),events:[...dom.querySelectorAll('.ia-stage')].map(node=>({state:node.dataset.stageState,text:node.querySelector('.ia-stage-copy p')?.textContent||'',date:node.querySelector('.ia-stage-copy small')?.textContent||''}))};
   };
   const original=BpmInsightStore.get(id),clone=()=>JSON.parse(JSON.stringify(original));
   const own=BpmInsightWorkflow.decide(original,{decision:'reject',comment:'Контроль исходной модели.'});
   const saved={...original,...own};
   const visibility=['Согласовано','Мнения собраны','Отклонено','В работе','Реализовано'].map(status=>{
    const row=clone();row.status=status;row.detail.workflow.currentActor={id:'readonly-outsider',name:'Другой участник',role:'Наблюдатель',bank:row.bank};
    const rejected={...saved,status};
    return {status,withoutOwn:projection(row),otherSource:projection({...rejected,source:'Process mining'}),own:projection(rejected)};
   });
   const seed53=BpmInsightStore.get('INS-000053');seed53.detail.workflow.currentActor={id:'readonly-outsider',name:'Другой участник',role:'Наблюдатель',bank:seed53.bank};
   const seed78=BpmInsightStore.get('INS-000078');
   const pm=BpmInsightStore.get('INS-000009');pm.source='Process mining';pm.detail.workflow.currentActor={id:'process-owner',name:pm.owner,role:'Владелец процесса',bank:'',processIds:pm.related.map(item=>item.id)};
   const pmPatch=BpmInsightWorkflow.decideTeam(pm,{decision:'reject',comment:'Расчёт команды процесса не подтверждает ожидаемый эффект.',now:'2026-10-10'}),pmRejected={...pm,...pmPatch};
   const empty={...seed78,source:'Гемба',rejection:'',detail:{...seed78.detail,workflow:{version:1,route:'none',stage:'complete',stages:[],currentActor:null,teamDecision:null}}};
   const legacy={...empty,detail:{...empty.detail,history:[
    {date:'10.10.2026',text:'Отклонено: итоговый расчёт не подтверждён.'},
    {date:'09.10.2026',text:'Согласовано: уточнённое предложение, ранее отклонено из-за неполного расчёта.'},
    {date:'08.10.2026',text:'Согласовано: первичная проверка завершена.'}
   ]}};
   const legacySnapshot=JSON.stringify(legacy),legacyProjection=projection(legacy);
   return {visibility,seed53:projection(seed53),seed53Rejection:seed53.rejection,seed78:projection(seed78),seed78Rejection:seed78.rejection,pm:projection(pmRejected),pmDecision:pmRejected.detail.workflow.teamDecision,pmDisplayActorName:BpmAvatars.displayName(pmRejected.detail.workflow.teamDecision.actorName,`${pmRejected.id}:approval:0`),empty:projection(empty),legacy:legacyProjection,legacyHistory:legacy.detail.history,unchangedLegacy:legacySnapshot===JSON.stringify(legacy),unchangedRows:beforeRows===JSON.stringify(BpmInsightStore.list()),unchangedStorage:beforeStorage===localStorage.getItem('bpm-insight-store:v1')};
  },id);
  for(const item of history.visibility){
   if(item.status==='Отклонено'){
    assert.equal(item.withoutOwn.heading,'Ход согласования','Every rejected row retains the history, regardless of its current actor');
    assert.equal(item.otherSource.heading,'Ход согласования','Every rejected source retains the recorded history');
   }else{
    assert.equal(item.withoutOwn.html,'',`${item.status}: a non-rejected terminal row without our saved decision stays hidden`);
    assert.equal(item.otherSource.html,'',`${item.status}: a non-rejected other-source row stays hidden`);
   }
   assert.equal(item.own.heading,'Ход согласования');assert.equal(item.own.own,1);assert.ok(item.own.red>0);
  }
  for(const [label,item] of [['INS53 with another current actor',history.seed53],['INS78 CA legacy reason',history.seed78],['Process mining team rejection',history.pm]]){
   assert.equal(item.heading,'Ход согласования',`${label}: the history heading remains`);assert.ok(item.red>0,`${label}: recorded rejection is red`);assert.equal(item.current,0,`${label}: a rejected record cannot invent another active approval`);
  }
  assert.equal(history.seed53.own,0,'Another actor is not falsely labelled as our own rejection');assert.ok(history.seed53.text.includes(history.seed53Rejection));
  assert.ok(history.seed78.text.includes(history.seed78Rejection));assert.equal(history.seed78.own,0);assert.deepEqual(history.seed78.people,[],'A legacy reason never invents an actor or decision date');assert.equal(history.seed78.dateLines,0);
  assert.ok(history.pm.text.includes(history.pmDecision.comment));assert.ok(history.pm.text.includes(history.pmDecision.role));assert.ok(history.pm.text.includes(history.pmDisplayActorName),'The actual actor uses the existing avatar display-name mapping, not a newly invented participant');assert.ok(history.pm.text.includes('10.10.2026'),'The actual team-decision date is retained');
  assert.equal(history.empty.heading,'Ход согласования','An empty legacy rejected row retains an honest empty history block');assert.deepEqual(history.empty.people,[]);assert.equal(history.empty.own,0);assert.equal(history.empty.dateLines,0);assert.equal(history.empty.current,0);
  assert.deepEqual(history.legacy.events,[...history.legacyHistory].reverse().map((event,index)=>({state:index===2?'rejected':'approved',text:event.text,date:event.date})),'Legacy event prefixes determine green/red state; a mention of earlier rejection in an approval comment cannot turn it red, and chronology remains oldest-first');
  assert.equal(history.legacy.own,0,'Legacy events never invent an own actor');assert.equal(history.legacy.current,0);
  assert.ok(history.unchangedRows&&history.unchangedStorage&&history.unchangedLegacy,'Readonly history projections never write or normalise stored records or legacy events');
  console.log('PASS — all rejected actors/sources retain honest history; legacy/team/empty records and non-rejected visibility remain read-only');
  if(projectionOnly){
   assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(external,[]);
   await desktop.close();console.log('PASS — targeted legacy approval/rejection classification, chronology and unchanged readonly data');return;
  }
  let scope=await open(page);const original=await read(page);
  await watch(scope);let {modal}=await begin(page,scope,false,{review:false});
  await modal.locator('[type=submit]').click();assert.ok(await modal.isVisible());
  assert.deepEqual(await read(page),original,'An empty required comment cannot commit');await noMotion(scope,'Empty comment');
  await modal.locator('textarea').fill('   ');await modal.locator('[type=submit]').click();
  assert.equal(await modal.locator('.ia-error').textContent(),'Комментарий обязателен');
  assert.deepEqual(await read(page),original,'A whitespace-only comment cannot commit');await noMotion(scope,'Whitespace comment');
  await modal.getByRole('button',{name:'Отмена',exact:true}).click();await modal.waitFor({state:'hidden'});
  assert.deepEqual(await read(page),original,'Cancelling native confirmation leaves the original workflow unchanged');await noMotion(scope,'Cancel');
  await watch(scope);({modal}=await begin(page,scope));
  const unauthorized=await page.evaluate(id=>{const row=BpmInsightStore.get(id);row.detail.workflow.currentActor.bank='Другой банк';return BpmInsightStore.update(id,{detail:row.detail});},id);
  await modal.locator('textarea').fill('Комментарий не создаёт полномочий.');await modal.locator('[type=submit]').click();
  assert.ok(await modal.isVisible());assert.match(await modal.locator('.ia-error').textContent(),/недоступно/);
  assert.deepEqual(await read(page),unauthorized,'A permission change cannot be overwritten by the old confirmation');await noMotion(scope,'Permission change');
  await modal.getByRole('button',{name:'Отмена',exact:true}).click();await reset(page);scope=await open(page);
  await watch(scope);({modal}=await begin(page,scope));
  const concurrent=await desktop.newPage();await concurrent.goto(base);await ready(concurrent);
  const remote=await concurrent.evaluate(id=>{const row=BpmInsightStore.get(id);return BpmInsightStore.update(id,BpmInsightWorkflow.decide(row,{decision:'approve',comment:'Решение другой вкладки.'}));},id);
  await page.waitForFunction(id=>BpmInsightStore.get(id).status==='Согласовано',id);
  await modal.locator('textarea').fill('Устаревший отказ не должен сохраниться.');await modal.locator('[type=submit]').click();
  assert.ok(await modal.isVisible());assert.match(await modal.locator('.ia-error').textContent(),/уже принято|недоступно/);
  assert.deepEqual(await read(page),remote,'An actual cross-tab approval wins over a stale rejection');await noMotion(scope,'Concurrent decision');
  await modal.getByRole('button',{name:'Отмена',exact:true}).click();await concurrent.close();await reset(page);scope=await open(page);
  console.log('PASS — cancel, required/whitespace comment, permission and cross-tab guards never paint a rejection flight');
  const comment='Расчёт ожидаемого эффекта требует уточнения. Предложенная схема не исключает повторную проверку полномочий при изменении документа; необходимо определить срок действия результата проверки и ответственность за актуальность сведений.';
  let committed=await submit(page,scope,comment);await flight(page,scope,committed.row,committed.anchor,'tab-rejected');
  assert.equal(await scope.locator('[data-id-approval]').count(),0,'The rejected actor cannot submit twice');
  await page.reload();await ready(page);scope=await open(page);await ownRed(scope,committed.row);
  assert.deepEqual(await read(page),committed.row,'Reload retains the exact saved rejection');
  console.log('PASS — INS58 native rejection persists, animates all phases over Reject, returns its red DS stage and survives reload');
  await reset(page);scope=await cabinet(page);committed=await submit(page,scope,'Отказ в карточке личного кабинета.');await flight(page,scope,committed.row,committed.anchor,'cabinet-rejected');
  await registry(page);assert.deepEqual(await read(page),committed.row,'Closing Cabinet never resets its rejection');
  await reset(page);scope=await open(page);committed=await submit(page,scope,'Смена представления не отменяет решение.');
  await scope.locator('.ia-tracker--flight').waitFor();await registry(page);
  assert.equal(await page.locator('.ia-approval-flight-layer,.is-approval-flight-source').count(),0,'Switching away removes every visual clone');
  assert.deepEqual(await read(page),committed.row);scope=await open(page);await ownRed(scope,committed.row);
  await reset(page);scope=await cabinet(page);committed=await submit(page,scope,'Закрытие панели не отменяет отказ.');await scope.locator('.ia-tracker--flight').waitFor();
  await page.locator('[data-id-drawer-close]').click();await page.locator('#cabinet-insight-drawer[open]').waitFor({state:'hidden'});
  assert.equal(await page.locator('.ia-approval-flight-layer,.is-approval-flight-source').count(),0,'Closing the Cabinet drawer cancels visual clones');
  assert.deepEqual(await read(page),committed.row);await reset(page);scope=await open(page);committed=await submit(page,scope,'Изменение ширины не отменяет отказ.');await scope.locator('.ia-tracker--flight').waitFor();
  await page.setViewportSize({width:1500,height:1080});await scope.locator('.ia-approval-flight-layer').waitFor({state:'detached'});
  assert.equal(await scope.locator('.is-approval-flight-source').count(),0);assert.deepEqual(await read(page),committed.row);await ownRed(scope,committed.row);
  await reset(page);
  await page.evaluate(id=>{window.__rejectionDrawer=BpmInsightApproval.create({getRow:id=>BpmInsightStore.get(id),onChange:(id,patch)=>BpmInsightStore.update(id,patch)});__rejectionDrawer.open(id);},id);
  const drawer=page.locator('#insight-approval-drawer').last();await drawer.waitFor({state:'visible'});scope=drawer.locator('.ia-shell');
  committed=await submit(page,scope,'Отказ в отдельном согласовательном drawer.',true);await flight(page,scope,committed.row,committed.anchor,'separate-drawer-rejected');
  await drawer.locator('[data-ia-close]').first().click();await drawer.waitFor({state:'hidden'});
  assert.equal(await page.locator('.ia-approval-flight-layer,.is-approval-flight-source').count(),0);assert.deepEqual(await read(page),committed.row);
  await desktop.close();console.log('PASS — Cabinet and separate drawer share the rejection flight; switch/close/resize clean clones without resetting saved data');
  const mobileContext=await context({viewport:{width:390,height:900}}),mobile=await mobileContext.newPage();await mobile.goto(base);await ready(mobile);scope=await open(mobile);
  committed=await submit(mobile,scope,'Проверка отказа в мобильном представлении.');await flight(mobile,scope,committed.row,committed.anchor,'mobile-rejected');
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile rejection does not overflow');await mobileContext.close();
  const reducedContext=await context({viewport:{width:390,height:900},reducedMotion:'reduce'}),reduced=await reducedContext.newPage();await reduced.goto(base);await ready(reduced);scope=await open(reduced);
  committed=await submit(reduced,scope,'Проверка отказа без анимации.');await noMotion(scope,'Reduced motion');await ownRed(scope,committed.row);
  await reduced.reload();await ready(reduced);scope=await open(reduced);await ownRed(scope,committed.row);assert.deepEqual(await read(reduced),committed.row);
  assert.ok(await reduced.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await reduced.screenshot({path:path.join(shots,'reduced-mobile-rejected.png')});await reducedContext.close();
  assert.deepEqual(errors,[],'No runtime errors');assert.deepEqual(failed,[],'No missing local assets');assert.deepEqual(external,[],'The offline test never requests the network');
  console.log(`PASS — normal/reduced-motion mobile, persistent own rejection, no runtime errors or missing assets. Screenshots: ${shots}`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

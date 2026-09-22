/* Process Details · Drawer 10 columns (Figma 1115:31908 / 1122:35208). */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name, className = '') => `<img class="pd-icon ${esc(className)}" src="${esc(window.BpmProcessAssets?.[name] || `assets/${name}.svg`)}" alt="" width="24" height="24">`;
  const tag = (label, tone = '', iconName = '') => `<span class="pd-tag${tone ? ` pd-tag--${esc(tone)}` : ''}">${esc(label)}${iconName ? icon(iconName,'pd-icon-16') : ''}</span>`;
  const section = (id,title,count,content,options={}) => `<details class="pd-section ${esc(options.className || '')}" id="pd-${esc(id)}"${options.open === false ? '' : ' open'}><summary class="pd-section-heading"><h2>${esc(title)}${count !== null && count !== undefined && count !== '' ? ` <span class="pd-counter">${esc(count)}</span>` : ''}</h2>${icon('chevron-up','pd-section-chevron')}</summary><div class="pd-section-content">${content}</div></details>`;
  const processAnchors = [['about','О процессе'],['monitoring','Мониторинг'],['insights','Инсайты'],['tasks','Задачи'],['documents','Документы']];
  let anchors=processAnchors;
  let dialog,main,row,options,selects=[],scrollFrame,toastTimer,returnFocus,loadingTimer,closingTimer;
  let opening=0,closing=false;
  const LOADING_DURATION=2000;
  const filters = {insights:{status:'all',source:''},monitoring:{status:'all'}};

  function notify(message) {
    const target=dialog.querySelector('.pd-notice');
    target.textContent=message;target.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>{target.hidden=true;},4500);
  }
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); notify('Скопировано'); }
    catch (_) {
      const focus=document.activeElement,area=document.createElement('textarea');
      area.value=value;area.className='pd-copy-buffer';dialog.append(area);area.select();
      const done=document.execCommand('copy');area.remove();focus?.focus({preventScroll:true});
      notify(done ? 'Скопировано' : `Не удалось скопировать. ${value}`);
    }
  }
  function setActive(id) {
    dialog.querySelectorAll('.pd-anchors [data-pd-anchor]').forEach(button=>{
      const active=button.dataset.pdAnchor===id;
      button.classList.toggle('is-active',active);
      if(active)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');
    });
  }
  function syncAnchor() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame=requestAnimationFrame(()=>{
      const top=main.getBoundingClientRect().top+80;
      let active=anchors[0][0];
      for(const [id] of anchors){const node=dialog.querySelector(`#pd-${id}`);if(node && node.getBoundingClientRect().top<=top)active=id;}
      if(main.scrollTop+main.clientHeight>=main.scrollHeight-3)active=anchors[anchors.length-1][0];
      setActive(active);
    });
  }
  function goTo(id) {
    const node=dialog.querySelector(`#pd-${id}`);if(!node)return;
    if(node.tagName==='DETAILS')node.open=true;
    main.scrollTo({top:main.scrollTop+node.getBoundingClientRect().top-main.getBoundingClientRect().top,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    setActive(id);
  }
  function filterRows(scope) {
    const filter=filters[scope];if(!filter)return;
    const rows=[...dialog.querySelectorAll(`tr[data-pd-row-status]`)].filter(tr=>tr.closest('[data-pd-scope]')?.dataset.pdScope===scope);
    rows.forEach(tr=>{tr.hidden=(filter.status!=='all'&&tr.dataset.pdRowStatus!==filter.status)||!!(filter.source&&tr.dataset.pdSource!==filter.source);});
    const count=rows.filter(tr=>!tr.hidden).length;
    const sectionNode=dialog.querySelector(`#pd-${scope}`);
    let empty=sectionNode?.querySelector('[data-pd-empty],.pd-filter-empty');
    if(!empty&&sectionNode){empty=document.createElement('p');empty.className='pd-filter-empty';empty.textContent='Нет записей с выбранными фильтрами';sectionNode.querySelector('.pd-section-content').append(empty);}
    if(empty)empty.hidden=count>0;
  }
  function sortTable(button) {
    const key=button.dataset.pdTable;
    const table=button.closest('table') || dialog.querySelector(`table[data-pd-table-id="${CSS.escape(key || '')}"]`);
    if(!table?.tBodies[0])return;
    const index=Number(button.dataset.pdSort),th=button.closest('th');
    const descending=th?.getAttribute('aria-sort')==='ascending';
    const collator=new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
    const read=tr=>{const td=tr.cells[index];return td?.dataset.pdSortValue || td?.querySelector('[data-efficiency-percent]')?.dataset.efficiencyPercent || td?.textContent.trim() || '';};
    [...table.tBodies[0].rows].sort((a,b)=>{
      const x=read(a),y=read(b),number=value=>{const date=value.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);return date ? Date.UTC(Number(date[3]),Number(date[2])-1,Number(date[1]),Number(date[4]||0),Number(date[5]||0)) : Number(value.replace(/\s/g,'').replace(',','.').replace(/%$/,''));};
      const nx=number(x),ny=number(y),numeric=x!==''&&y!==''&&Number.isFinite(nx)&&Number.isFinite(ny);
      return (numeric?nx-ny:collator.compare(x,y))*(descending?-1:1);
    }).forEach(tr=>table.tBodies[0].append(tr));
    table.querySelectorAll('th[aria-sort]').forEach(node=>node.removeAttribute('aria-sort'));
    table.querySelectorAll('[data-pd-sort]').forEach(node=>{node.classList.remove('is-active','is-descending');node.dataset.active='false';});
    th?.setAttribute('aria-sort',descending?'descending':'ascending');button.classList.add('is-active');button.classList.toggle('is-descending',descending);button.dataset.active='true';
  }
  function printDetails(pdf=false) {
    finishLoading(false);window.BpmProcessMotion?.finish(dialog);
    if(pdf)notify('В окне печати выберите «Сохранить как PDF».');
    const closed=[...dialog.querySelectorAll('details:not([open])')];closed.forEach(node=>node.open=true);
    const restore=()=>{closed.forEach(node=>node.open=false);window.removeEventListener('afterprint',restore);};
    window.addEventListener('afterprint',restore);
    window.print();
  }
  function toggleJourneyProcesses(expanded) {
    const button=dialog.querySelector('[data-jd-toggle-processes]');
    const list=dialog.querySelector('#jd-included-processes');
    if(!button||!list)return;
    button.setAttribute('aria-expanded',String(expanded));
    list.querySelectorAll('[data-jd-extra-process]').forEach(process=>process.hidden=!expanded);
    const label=button.querySelector('[data-jd-toggle-label]');
    if(label)label.textContent=expanded?'Свернуть':'Показать все';
    syncAnchor();
  }
  function openJourneyProcess(index) {
    const record=Number.isInteger(index)?window.BpmJourneyDetails?.getProcesses?.(row)?.[index]:null;
    if(!record){notify('Данные этого процесса пока не подключены.');return;}
    const resumeState={
      scrollTop:main.scrollTop,
      expanded:dialog.querySelector('[data-jd-toggle-processes]')?.getAttribute('aria-expanded')==='true',
      summaryHidden:dialog.querySelector('#jd-observation-synthesis')?.hidden || false,
      sections:[...main.querySelectorAll('details[id]')].map(node=>[node.id,node.open]),
      processIndex:index
    };
    const backConfiguration={...options,trigger:returnFocus,resumeState,skipLoading:true};
    open(record,{...options,trigger:returnFocus,skipLoading:false,resumeState:null,backRecord:row,backConfiguration});
  }
  function handleClick(event) {
    dialog.querySelectorAll('.pd-data-filter[open]').forEach(filter=>{if(!filter.contains(event.target))filter.open=false;});
    const link=event.target.closest('a[href^="#pd-"]');if(link){event.preventDefault();goTo(link.getAttribute('href').slice(4));return;}
    const anchor=event.target.closest('[data-pd-anchor]');if(anchor){goTo(anchor.dataset.pdAnchor);return;}
    const summaryAction=event.target.closest('[data-jd-dismiss-summary],[data-jd-show-summary]');
    if(summaryAction){
      const summary=dialog.querySelector('#jd-observation-synthesis');
      if(summary){
        const hidden=summaryAction.hasAttribute('data-jd-dismiss-summary');summary.hidden=hidden;
        const show=dialog.querySelector('[data-jd-show-summary]');show?.setAttribute('aria-expanded',String(!hidden));
        if(hidden)show?.focus({preventScroll:true});else summary.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
        syncAnchor();
      }
      return;
    }
    const journeyToggle=event.target.closest('[data-jd-toggle-processes]');
    if(journeyToggle){toggleJourneyProcesses(journeyToggle.getAttribute('aria-expanded')!=='true');return;}
    const journeyProcess=event.target.closest('[data-jd-process]');
    if(journeyProcess){openJourneyProcess(Number(journeyProcess.dataset.jdProcess));return;}
    const status=event.target.closest('[data-pd-status]');
    if(status){const scope=status.dataset.pdScope || status.closest('[data-pd-scope]')?.dataset.pdScope || 'insights';if(filters[scope]){filters[scope].status=status.dataset.pdStatus;dialog.querySelectorAll(`[data-pd-status]`).forEach(button=>{if((button.dataset.pdScope || button.closest('[data-pd-scope]')?.dataset.pdScope || 'insights')===scope){const selected=button===status;button.classList.toggle('is-active',selected);button.setAttribute('aria-pressed',String(selected));}});filterRows(scope);}const popover=status.closest('.pd-data-filter');if(popover){popover.open=false;popover.querySelector('summary').focus();}return;}
    const sort=event.target.closest('[data-pd-sort]');if(sort){sortTable(sort);return;}
    const action=event.target.closest('[data-pd-action]');
    if(action){
      switch(action.dataset.pdAction){
        case 'close':close();break;
        case 'copy':copy(action.dataset.pdValue || action.dataset.pdCopy || row.code || `${row.entity==='paths'?'КП':'П'} ${row.number}`);break;
        case 'share':copy(`${location.href.split('#')[0]}#${row.entity==='paths'?'journey':'process'}=${encodeURIComponent(row.id)}`);break;
        case 'back':if(options.backRecord)open(options.backRecord,options.backConfiguration || {});break;
        case 'favorite':{
          options.toggleFavorite?.(row);
          const selected=options.isFavorite?.(row) || false;
          action.setAttribute('aria-pressed',String(selected));action.setAttribute('aria-label',selected?'Удалить из избранного':'Добавить в избранное');
          action.innerHTML=icon(selected?'liked':'dont-like');
          notify(selected?'Добавлено в избранное':'Удалено из избранного');break;
        }
        case 'print':printDetails();break;
        case 'export':printDetails(true);break;
        case 'period-prev':case 'period-next':notify('В демонстрации показан период из макета. Данные других периодов не подключены.');break;
      }
      return;
    }
    const demo=event.target.closest('[data-pd-demo]');if(demo)notify(demo.dataset.pdDemo || 'Действие показано в макете; серверная часть не подключена.');
  }
  function finishLoading(animate=true) {
    clearTimeout(loadingTimer);
    if(!dialog)return;
    const wasLoading=dialog.classList.contains('pd-is-loading');
    dialog.classList.remove('pd-is-loading');
    main?.removeAttribute('aria-busy');
    if(main)main.inert=false;
    dialog.querySelectorAll('.pd-skeleton').forEach(node=>node.remove());
    dialog.querySelectorAll('.pd-loading-block').forEach(node=>node.classList.remove('pd-loading-block'));
    const announcement=dialog.querySelector('.pd-loading-announcement');
    if(announcement)announcement.textContent=row?.entity==='paths'?'Деталка клиентского пути загружена':'Деталка процесса загружена';
    if(wasLoading&&animate&&dialog.open&&!closing)window.BpmProcessMotion?.start(dialog);
  }
  function beginLoading() {
    const thisOpening=opening;
    dialog.classList.add('pd-is-loading');main.setAttribute('aria-busy','true');main.inert=true;
    const targets=main.querySelectorAll('.pd-process-heading,.pd-ai-summary,.pd-context-warning,.pd-overview-panel,.pd-about-panel,.pd-section');
    const shape=className=>`<span class="skeleton-shape ${className}"></span>`;
    targets.forEach(block=>{
      const placeholder=document.createElement('div');placeholder.className='pd-skeleton';placeholder.setAttribute('aria-hidden','true');
      const widget=block.matches('.pd-efficiency-widget,.pd-dynamics-widget');
      const lines=Math.max(2,Math.min(18,Math.floor((block.getBoundingClientRect().height-72)/48)));
      placeholder.innerHTML=widget
        ? `${shape('pd-skeleton-caption')}${shape('pd-skeleton-value')}<div class="pd-skeleton-chart">${block.matches('.pd-efficiency-widget')?shape('pd-skeleton-sphere'):Array.from({length:8},(_,i)=>`<span class="skeleton-shape pd-skeleton-bar" style="height:${28+(i*17)%65}%"></span>`).join('')}</div>${shape('pd-skeleton-period')}`
        : `${shape('pd-skeleton-title')}<div class="pd-skeleton-lines">${Array.from({length:lines},()=>`<div class="pd-skeleton-row">${shape('pd-skeleton-line')}${shape('pd-skeleton-short')}</div>`).join('')}</div>`;
      block.classList.add('pd-loading-block');block.append(placeholder);
    });
    loadingTimer=setTimeout(()=>{if(thisOpening===opening&&dialog.open&&!closing)finishLoading();},LOADING_DURATION);
  }
  function cleanup(restoreFocus=true) {
    clearTimeout(loadingTimer);clearTimeout(closingTimer);closing=false;
    dialog.classList.remove('pd-is-closing','pd-has-entered');
    window.BpmProcessMotion?.cancel(dialog);finishLoading(false);
    document.body.classList.remove('pd-drawer-open');selects.forEach(select=>select.close());selects=[];
    window.BpmCardVisuals.cancelCounters(dialog);cancelAnimationFrame(scrollFrame);clearTimeout(toastTimer);
    const id=CSS.escape(row?.id || '');
    const trigger=returnFocus?.isConnected ? returnFocus : document.querySelector(`[data-detail="${id}"],[data-structure-detail="${id}"]`);
    if(restoreFocus)(trigger || document.getElementById(row?.entity==='paths'?'paths-tab':'processes-tab'))?.focus({preventScroll:true});
  }
  function setup() {
    dialog=document.getElementById('process-drawer');
    dialog.addEventListener('click',event=>{
      if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();return;}
      handleClick(event);
    });
    dialog.addEventListener('close',()=>{if(!dialog.open)cleanup();});
    dialog.addEventListener('keydown',event=>{const filter=dialog.querySelector('.pd-data-filter[open]');if(event.key==='Escape'&&filter){event.preventDefault();event.stopPropagation();filter.open=false;filter.querySelector('summary').focus();}});
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(dialog.querySelector('.select-popup'))selects.forEach(select=>select.close());else close();});
    dialog.addEventListener('animationend',event=>{
      if(event.target!==dialog)return;
      // A filled transform animation can retain a fixed-position containing block.
      if(event.animationName==='pd-slide-in'&&!closing)dialog.classList.add('pd-has-entered');
      if(event.animationName==='pd-slide-out'&&closing)dialog.close();
    });
    window.addEventListener('beforeprint',()=>{if(dialog.open){finishLoading(false);window.BpmProcessMotion?.finish(dialog);}});
  }
  function open(record,configuration={}) {
    if(!dialog)setup();
    // Native close events are queued: reset even if close() already cleared open.
    if(main){cleanup(false);if(dialog.open)dialog.close();}
    opening++;
    row=record;options=configuration;returnFocus=configuration.trigger || document.activeElement;
    const isJourney=row.entity==='paths';
    const entityTitle=isJourney?'клиентского пути':'процесса';
    anchors=isJourney?window.BpmJourneyDetails.anchors:processAnchors;
    dialog.classList.toggle('jd-drawer',isJourney);
    dialog.dataset.pdEntity=row.entity;
    filters.insights={status:'all',source:''};filters.monitoring={status:'all'};
    const utilities={esc,icon,tag,section,efficiency:window.BpmCardVisuals.efficiency,isFavorite:options.isFavorite?.(row) || false};
    const content=isJourney?window.BpmJourneyDetails.render(row,utilities):`${window.BpmProcessOverview.render(row,utilities)}${window.BpmProcessSections.render(row,utilities)}`;
    const backlink=options.backRecord?`<button type="button" class="pd-backlink" data-pd-action="back">${icon('calendar-arrow-left')}<span>Назад к клиентскому пути</span></button>`:'';
    dialog.innerHTML=`<div class="pd-layout"><div class="pd-main" tabindex="-1">${backlink}${content}</div><aside class="pd-navigation" aria-label="Разделы ${entityTitle}"><div class="pd-navigation-actions"><button class="pd-control pd-share" data-pd-action="share" aria-label="Скопировать ссылку ${isJourney?'на клиентский путь':'на процесс'}" title="Поделиться">${icon('imgIcon24Share')}</button><button class="pd-control pd-close" data-pd-action="close" aria-label="Закрыть деталку ${entityTitle}" title="Закрыть (Esc)" autofocus>${icon('imgIcon24Exit')}</button></div><nav class="pd-anchors">${anchors.map(([id,label],index)=>`<button type="button" data-pd-anchor="${id}" class="pd-anchor${index===0?' is-active':''}"${index===0?' aria-current="location"':''}>${label}</button>`).join('')}</nav></aside></div><div class="pd-notice" role="status" aria-live="polite" hidden></div>`;
    const announcement=document.createElement('div');announcement.className='sr-only pd-loading-announcement';announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');announcement.textContent=`Загрузка деталки ${entityTitle}…`;dialog.append(announcement);
    main=dialog.querySelector('.pd-main');main.addEventListener('scroll',syncAnchor,{passive:true});
    dialog.querySelectorAll('details').forEach(node=>node.addEventListener('toggle',syncAnchor));
    dialog.showModal();document.body.classList.add('pd-drawer-open');main.scrollTop=0;
    const source=document.getElementById('pd-insights-source');
    if(source&&options.createSelect){
      const values=[...new Set([...dialog.querySelectorAll('[data-pd-source]')].map(node=>node.dataset.pdSource))];
      selects.push(options.createSelect(source.id,{label:'Источники',options:values.map(value=>({value,label:value})),onChange:values=>{filters.insights.source=values[0] || '';filterRows('insights');}}));
    }
    window.BpmProcessMotion?.prepare(dialog);
    if(options.resumeState){
      toggleJourneyProcesses(options.resumeState.expanded);
      const summary=dialog.querySelector('#jd-observation-synthesis');
      if(summary){summary.hidden=Boolean(options.resumeState.summaryHidden);dialog.querySelector('[data-jd-show-summary]')?.setAttribute('aria-expanded',String(!summary.hidden));}
      for(const [id,isOpen] of options.resumeState.sections || []){
        const node=dialog.querySelector(`#${CSS.escape(id)}`);if(node)node.open=isOpen;
      }
      main.scrollTo({top:options.resumeState.scrollTop || 0,behavior:'instant'});
      dialog.querySelector(`[data-jd-process="${options.resumeState.processIndex}"]`)?.focus({preventScroll:true});
      syncAnchor();
    }
    if(options.skipLoading){
      dialog.classList.add('pd-has-entered');
      finishLoading(false);window.BpmProcessMotion?.finish(dialog);
    }else beginLoading();
  }
  function close(){
    if(!dialog?.open||closing)return;
    closing=true;clearTimeout(loadingTimer);window.BpmProcessMotion?.cancel(dialog);
    selects.forEach(select=>select.close());main.inert=true;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){dialog.close();return;}
    dialog.classList.add('pd-is-closing');
    const thisOpening=opening;
    closingTimer=setTimeout(()=>{if(thisOpening===opening&&closing)dialog.close();},280);
  }
  window.BpmProcessDrawer=Object.freeze({open,close});
})();

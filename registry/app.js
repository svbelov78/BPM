/* Sber BPM: standalone, offline-ready registry. Data is intentionally demonstrational. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const image = (name, cls = '') => `<img src="assets/${esc(name)}.svg" alt=""${cls ? ` class="${cls}"` : ''}>`;
  const favoriteIcon = (cls='',name='liked',label='В избранном') => `<span class="favorite-heart ${cls}" ${label?`role="img" aria-label="${esc(label)}"`:'aria-hidden="true"'}>${image(name)}</span>`;
  const data = window.BPM_DATA || [];
  const allRecords = [...data,...(window.BPM_STRUCTURE?.records || []),...(window.BPM_STRUCTURE_PATHS?.records || [])];
  const defaults = {from:'2001-08-21',to:'2026-09-13'};
  const state = {entity:'paths',view:'cards',query:'',filters:{status:[],block:[],division:[],process:[],owner:[]},sort:'id-asc',sorts:{cards:'id-asc',table:'id-asc'},from:defaults.from,to:defaults.to,page:1,size:20,favoritesOnly:false,top:false,favorites:new Set(['paths-1232','paths-1233'])};
  try { const saved = JSON.parse(localStorage.getItem('bpm-registry-favorites')); if (Array.isArray(saved)) state.favorites = new Set(saved.filter(id => allRecords.some(row => row.id === id))); } catch (_) { /* Storage may be unavailable for local files. */ }
  let structureMode=false, structure;
  const selects = {};
  let activeSelect = null, datePopup = null, actionMenu = null, tooltip = null, toastTimer;
  const LOADING_DURATION = 2000;
  let isLoading = false, loadingTimer;
  const normalize = value => String(value).toLocaleLowerCase('ru').replace(/ё/g,'е');
  const dateLabel = iso => iso ? iso.split('-').reverse().join('.') : 'Любая';
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => {$('toast').hidden = true;}, 3500); }
  function positionPopup(popup, anchor, minWidth = 260) {
    const r = anchor.getBoundingClientRect(), margin = 12;
    const width = Math.min(Math.max(r.width,minWidth),innerWidth-margin*2);
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(margin,Math.min(r.left,innerWidth-width-margin))}px`;
    const below = innerHeight-r.bottom-8-margin, above = r.top-8-margin;
    const useAbove = below < 180 && above > below;
    popup.style.maxHeight = `${Math.max(100,Math.min(340,useAbove ? above : below))}px`;
    popup.style.top = `${useAbove ? Math.max(margin,r.top-8-popup.offsetHeight) : r.bottom+8}px`;
  }
  class BpmSelect {
    constructor(id, config) {
      this.host = $(id); this.id = id; this.config = config; this.options = config.options; this.values = config.values || []; this.query = ''; this.active = -1;
      this.host.innerHTML = `<div class="bpm-select"><div class="field select-control"><div class="select-content"><label class="internal-label" for="${id}-input">${esc(config.label)}</label><input class="select-input" id="${id}-input" type="text" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-list" autocomplete="off" spellcheck="false"></div><button type="button" class="select-toggle" tabindex="-1" aria-label="Открыть список: ${esc(config.label)}">${image(config.icon || 'chevron-down-filter')}</button></div></div>`;
      this.input = $(`${id}-input`); this.control = this.host.querySelector('.select-control'); this.toggle = this.host.querySelector('.select-toggle');
      this.input.addEventListener('focus', () => {if (!this.suppressFocusOpen) this.open();});
      this.input.addEventListener('click', () => this.open());
      this.control.addEventListener('click', e => { if (!e.target.closest('.select-toggle')) this.input.focus(); });
      this.toggle.addEventListener('mousedown', e => e.preventDefault());
      this.toggle.addEventListener('click', e => {
        e.stopPropagation();
        if (this.config.multiple && this.values.length) {
          this.clear();
        } else if (this.popup) this.close();
        else { this.input.focus(); this.open(); }
      });
      this.input.addEventListener('input', () => { this.query = this.input.value; if (!this.popup) this.open(false); this.active = -1; this.renderOptions(); });
      this.input.addEventListener('keydown', e => this.keydown(e));
      this.refresh();
    }
    refresh() {
      const multiple = this.config.multiple, labels = this.values.map(value => this.options.find(o => o.value === value)?.label || value);
      const selected = !!multiple && this.values.length > 0;
      const summary = selected ? `Выбрано ${this.values.length}` : '';
      this.host.classList.toggle('has-selection',selected);
      if (!this.popup) this.input.value = multiple ? summary : labels[0] || '';
      this.input.placeholder = summary || this.config.placeholder || 'Все';
      this.input.setAttribute('aria-description', multiple ? `${summary || 'Выбраны все'}. Введите текст для поиска.` : 'Введите текст для поиска.');
      this.toggle.classList.toggle('is-clear',selected);
      this.toggle.tabIndex = selected ? 0 : -1;
      this.toggle.setAttribute('aria-label',`${selected ? 'Очистить' : 'Открыть список'}: ${this.config.label}`);
      this.toggle.innerHTML = image(selected ? 'close' : this.config.icon || 'chevron-down-filter');
      if (this.popup) { this.renderOptions(); positionPopup(this.popup,this.control,this.config.minPopupWidth ?? (this.config.multiple ? 300 : 260)); }
    }
    set(values, notify = false) { this.values = values; this.query = ''; this.refresh(); if (notify) this.config.onChange(values); }
    clear() {this.values=[];this.query='';this.input.value='';this.close();this.changed();this.suppressFocusOpen=true;this.input.focus({preventScroll:true});this.suppressFocusOpen=false;}
    setOptions(options) { this.options = options; this.refresh(); }
    open(clear = true) {
      if (this.popup) return;
      closeDate(); closeAction(); if (activeSelect) activeSelect.close();
      activeSelect = this; if (clear) this.query = ''; this.input.value = this.query;
      this.popup = document.createElement('div'); this.popup.className = `select-popup${this.config.popupClass?' '+this.config.popupClass:''}`; this.popup.id = `${this.id}-list`; this.popup.setAttribute('role','listbox'); this.popup.setAttribute('aria-label',this.config.label);
      if (this.config.multiple) this.popup.setAttribute('aria-multiselectable','true');
      (this.host.closest('dialog[open]') || document.body).append(this.popup); this.input.setAttribute('aria-expanded','true'); this.control.classList.add('is-open'); this.active = -1;
      this.popup.addEventListener('mousedown',e => e.preventDefault());
      this.popup.addEventListener('click',e => { const option=e.target.closest('[data-option]'); if (option) this.choose(option.dataset.option); });
      this.renderOptions(); positionPopup(this.popup,this.control,this.config.minPopupWidth ?? (this.config.multiple ? 300 : 260));
    }
    close() { if (!this.popup) return; this.popup.remove(); this.popup = null; this.query = ''; this.input.setAttribute('aria-expanded','false'); this.input.removeAttribute('aria-activedescendant'); this.control.classList.remove('is-open'); if (activeSelect === this) activeSelect = null; this.refresh(); }
    renderOptions() {
      if (!this.popup) return;
      const all = this.config.allowAll === false ? [] : [{value:'',label:'Все'}];
      this.visible = [...all,...this.options].filter(o => normalize(o.label).includes(normalize(this.query)));
      this.active = Math.min(this.active,this.visible.length-1);
      this.popup.innerHTML = this.visible.length ? this.visible.map((o,i) => {
        const selected = o.value ? this.values.includes(o.value) : !this.values.length;
        return `<div role="option" id="${this.id}-option-${i}" class="select-option${i === this.active ? ' active' : ''}" data-option="${esc(o.value)}" aria-selected="${selected}">${this.config.multiple ? `<span class="option-check" aria-hidden="true">${selected ? image('tick') : ''}</span>` : ''}<span class="option-label">${esc(o.label)}</span>${selected && !this.config.multiple ? image('tick','selected-tick') : ''}</div>`;
      }).join('') : '<div class="popup-empty">Ничего не найдено</div>';
      if (this.active >= 0) this.input.setAttribute('aria-activedescendant',`${this.id}-option-${this.active}`); else this.input.removeAttribute('aria-activedescendant');
      positionPopup(this.popup,this.control,this.config.minPopupWidth ?? (this.config.multiple ? 300 : 260));
    }
    choose(value) {
      if (!value) this.values = [];
      else if (this.config.multiple) this.values = this.values.includes(value) ? this.values.filter(v => v !== value) : [...this.values,value];
      else this.values = [value];
      this.query = ''; this.input.value = ''; this.changed();
      if (!this.config.multiple) this.close();
    }
    changed() { this.refresh(); this.config.onChange(this.values); }
    keydown(e) {
      if (e.key === 'Escape') { if (this.popup) {e.preventDefault();e.stopPropagation();this.close();} return; }
      if (e.key === 'Tab') {this.close();return;}
      if (!this.popup && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) this.open();
      if (e.key === 'Backspace' && this.config.multiple && !this.input.value && this.values.length) { this.values.pop();this.changed();return; }
      if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
        if (!this.popup && (e.key === 'Home' || e.key === 'End')) return;
        e.preventDefault();this.open(); const n=this.visible.length; if (!n) return;
        this.active=e.key==='Home'?0:e.key==='End'?n-1:e.key==='ArrowDown'?(this.active+1)%n:this.active<0?n-1:(this.active-1+n)%n;
        this.renderOptions();$(`${this.id}-option-${this.active}`)?.scrollIntoView({block:'nearest'});return;
      }
      if (e.key === 'Enter') {e.preventDefault();if (!this.popup) this.open();else if (this.visible.length) this.choose(this.visible[Math.max(0,this.active)].value);}
    }
  }
  function optionsFor(key) { return [...new Set(data.filter(row=>row.entity===state.entity).map(row=>row[key]))].sort((a,b)=>a.localeCompare(b,'ru')).map(value=>({value,label:value})); }
  const sortCollator = new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
  function setSort(sort) {
    state.sort=sort;state.sorts[state.view]=sort;
    if(state.view==='cards')selects.sort.set([sort]);
  }
  function compareRows(a,b,sort=state.sort) {
    const [key,direction]=sort.split('-');
    let comparison;
    if(key==='id')comparison=a.number-b.number;
    else if(key==='eff')comparison=a.efficiency-b.efficiency;
    else if(key==='tags')comparison=sortCollator.compare(a.tags.join(', '),b.tags.join(', '));
    else comparison=sortCollator.compare(a[key]||'',b[key]||'');
    return (direction==='desc'?-comparison:comparison)||a.number-b.number;
  }
  function filteredRows() {
    const query=normalize(state.query.trim()).replace(/^(?:кп|п)\s*(?=\d)/,'');
    return data.filter(row=>row.entity===state.entity && (!query || normalize(`${row.number} ${row.title} ${row.owner} ${row.block} ${row.division}`).includes(query)) && Object.entries(state.filters).every(([key,values])=>!values.length || values.includes(row[key])) && (!state.from || row.date>=state.from) && (!state.to || row.date<=state.to) && (!state.favoritesOnly || state.favorites.has(row.id)) && (!state.top || row.efficiency>=85)).sort((a,b)=>{
      return compareRows(a,b);
    });
  }
  function selectedPage(rows = filteredRows()) {return rows.slice((state.page-1)*state.size,state.page*state.size);}
  function owner(row) { return `<div class="owner"><span class="avatar">${image('person')}</span><span class="owner-name" title="${esc(row.owner)}">${esc(row.owner)}</span></div>`; }
  function efficiency(row, table = false) {
    return window.BpmCardVisuals.efficiency(row,table);
  }
  function status(row) {const color={'Исполняется':'#34c759','На согласовании':'#0088ff','Черновик':'#7f7f7f','Завершён':'#7f7f7f'}[row.status]||'#7f7f7f';return `<span class="status-dot" style="background:${color}"></span><span class="status-copy">${esc(row.status)}</span>`;}
  function metadata(row) {return `<button class="id-badge" data-copy="${esc(row.id)}" aria-label="Скопировать ID ${row.entity==='paths'?'КП':'П'} ${row.number}">${row.entity==='paths'?'КП':'П'} ${row.number}${image('copy')}</button>${row.count?`<span class="count-badge">${row.count} ${row.entity==='paths'?(row.count===3?'процесса':'процессов'):'варианта'}${image('info')}</span>`:''}`;}
  function renderCard(row) {return `<article class="entity-card" data-record="${esc(row.id)}"><button class="card-more" data-menu="${esc(row.id)}" aria-label="Действия с ${row.entity==='paths'?'КП':'процессом'} ${row.number}" aria-haspopup="menu">${image('more')}</button><div class="card-header"><div class="card-id">${state.favorites.has(row.id)?favoriteIcon():''}${metadata({...row,count:0})}</div><div class="status">${status(row)}<span aria-hidden="true">|</span><time datetime="${row.date}">${dateLabel(row.date)}</time></div><div class="card-count">${row.count?`<span class="count-badge">${row.count} ${row.entity==='paths'?(row.count===3?'процесса':'процессов'):'варианта'}${image('info')}</span>`:''}</div></div><div class="card-body"><button class="card-title" data-detail="${esc(row.id)}">${esc(row.title)}</button><p class="card-description">Блок «${esc(row.block)}» / Дивизион «${esc(row.division)}»</p>${row.entity==='processes'?`<div class="card-tags"><span class="tag">${esc(row.type)}</span>${row.tags.map(tag=>`<span class="tag">${esc(tag)}</span>`).join('')}</div>`:''}</div><div class="card-footer">${owner(row)}${efficiency(row)}</div></article>`;}
  function tableHeader(label,key) {
    const active=state.sort.startsWith(`${key}-`),descending=active&&state.sort.endsWith('-desc');
    const nextDirection=active&&!descending?'по убыванию':'по возрастанию';
    const action=`${label}: сортировать ${key==='id'?'по ID ':''}${nextDirection}`;
    const wrappedLabel=label==='Эффективность'?'Эф\u00adфек\u00adтив\u00adность':label;
    return `<th scope="col"${active?` aria-sort="${descending?'descending':'ascending'}"`:''}><button type="button" class="table-sort-button" data-sort="${key}" data-active="${active}" aria-label="${esc(action)}"><span>${esc(wrappedLabel)}</span>${image('arrow-down',`table-sort-arrow${descending?' is-reversed':''}`)}</button></th>`;
  }
  function renderTable(rows, loading = false) {
    const process=state.entity==='processes';
    return `<div class="table-scroll" tabindex="0" role="region" aria-label="Таблица реестра; прокручивайте по горизонтали для остальных столбцов"><table class="registry-table${process?' processes-table':''}"><caption class="sr-only">${process?'Процессы':'Клиентские пути'}</caption><colgroup><col><col style="width:240px"><col style="width:200px">${process?'<col style="width:168px">':''}<col style="width:188px"></colgroup><thead class="table-header"><tr>${tableHeader(process?'Процесс':'Клиентский путь','id')}${tableHeader('Владелец','owner')}${tableHeader('Статус','status')}${process?tableHeader('Теги','tags'):''}${tableHeader('Эффективность','eff')}</tr></thead><tbody>${loading?window.BpmLoading.tableRows(rows.length||6,process):rows.map(row=>`<tr data-record="${esc(row.id)}"><td class="description-cell"><div class="metadata">${state.favorites.has(row.id)?favoriteIcon('inline-bookmark'):''}${metadata(row)}${process?`<span class="tag">${esc(row.type)}</span>`:''}</div><button class="card-title table-title" data-detail="${esc(row.id)}">${esc(row.title)}</button><p class="card-description">Блок «${esc(row.block)}» / Дивизион «${esc(row.division)}»</p></td><td>${owner(row)}</td><td><div class="table-status"><div class="status">${status(row)}</div><time datetime="${row.date}">${dateLabel(row.date)}</time></div></td>${process?`<td><div class="table-tags">${row.tags.map(tag=>`<span class="tag">${esc(tag)}</span>`).join('')}</div></td>`:''}<td><div class="efficiency-stack">${efficiency(row,true)}${row.delta?`<span class="table-delta">${row.delta>0?'+':''}${row.delta} п. п. ${row.delta>0?'↑':'↓'}</span>`:''}</div></td></tr>`).join('')}</tbody></table></div>`;
  }
  function hasFilters() {return state.query.trim() || Object.values(state.filters).some(v=>v.length) || state.from!==defaults.from || state.to!==defaults.to || state.favoritesOnly || state.top;}
  function renderSelectedFilters() {
    const groups=Object.entries(state.filters).filter(([,values])=>values.length).map(([key,values])=>({key,label:key==='owner'?(state.entity==='paths'?'Владельцы КП':'Владельцы П'):labels[key],values}));
    if(state.query.trim())groups.unshift({key:'query',label:'Поиск',values:[state.query]});
    if(state.from!==defaults.from||state.to!==defaults.to)groups.push({key:'date',label:'Дата создания',values:[`${dateLabel(state.from)} → ${dateLabel(state.to)}`]});
    if(state.favoritesOnly)groups.push({key:'favorites',label:'Список',values:['Избранное']});
    if(state.top)groups.push({key:'top',label:'Рейтинг',values:['TOP КП']});
    $('selected-filters').hidden=!groups.length;
    $('selected-filter-groups').innerHTML=groups.map(group=>`<div class="applied-filter-group" role="group" aria-label="${esc(group.label)}"><span class="applied-filter-label">${esc(group.label)}</span>${group.values.map(value=>`<span class="chip applied-filter-chip" title="${esc(value)}"><span class="chip-text">${esc(value)}</span><button data-filter-key="${group.key}" data-filter-value="${esc(value)}" aria-label="Убрать фильтр: ${esc(value)}">${image('close-16')}</button></span>`).join('')}</div>`).join('');
  }
  function renderResults(page = selectedPage(), animateEfficiency = false) {
    const results=$('results'),scrollLeft=results.querySelector('.table-scroll')?.scrollLeft||0;
    window.BpmCardVisuals.cancelCounters(results);
    const scrollFocused=document.activeElement===results.querySelector('.table-scroll');
    const focusedSort=results.contains(document.activeElement)?document.activeElement.closest('[data-sort]')?.dataset.sort:null;
    results.setAttribute('aria-busy',String(isLoading));
    results.classList.toggle('is-loading',isLoading);
    if(isLoading)results.innerHTML=state.view==='cards'?window.BpmLoading.cards(page.length||4):renderTable(page,true);
    else {
    $('results').innerHTML=page.length?(state.view==='cards'?`<div class="cards-grid">${page.map(renderCard).join('')}</div>`:renderTable(page)):'<div class="empty-state">'+image('search-filter')+'<h2>Ничего не найдено</h2><p>Попробуйте изменить запрос или сбросить фильтры.</p><button class="button secondary-button" data-reset>Сбросить фильтры</button></div>';
    }
    const tableScroll=results.querySelector('.table-scroll');
    if(tableScroll)tableScroll.scrollLeft=scrollLeft;
    if(focusedSort)results.querySelector(`[data-sort="${focusedSort}"]`)?.focus({preventScroll:true});
    else if(scrollFocused)tableScroll?.focus({preventScroll:true});
    if(animateEfficiency&&!isLoading)window.BpmCardVisuals.animateCounters(results);
  }
  function announceResults() {
    const count=filteredRows().length,pages=Math.max(1,Math.ceil(count/state.size));
    $('result-announcement').textContent=isLoading?'Загрузка реестра…':`${state.entity==='paths'?'Клиентские пути':'Процессы'}: найдено ${count}. Страница ${state.page} из ${pages}.`;
  }
  function loadResults() {
    if(structureMode){structure.reload();return;}
    clearTimeout(loadingTimer);
    closeAction();
    isLoading=true;
    render();
    loadingTimer=setTimeout(()=>{
      isLoading=false;
      renderResults(undefined,true);
      announceResults();
    },LOADING_DURATION);
  }
  function render() {
    if(structureMode){structure.refresh();return;}
    document.body.classList.toggle('table-view',state.view==='table');
    $('sort-select').hidden=state.view==='table';
    const rows=filteredRows(), pages=Math.max(1,Math.ceil(rows.length/state.size)); state.page=Math.min(state.page,pages);
    const page=selectedPage(rows);
    renderResults(page);
    renderSelectedFilters();$('result-tools').hidden=!hasFilters();$('results-count').textContent=`Найдено: ${rows.length}${state.top?' · TOP КП':''}`;
    const filterCount=Object.values(state.filters).filter(v=>v.length).length+(state.from!==defaults.from||state.to!==defaults.to?1:0);
    $('mobile-filters-label').textContent=`Фильтры${filterCount?' · '+filterCount:''}`;
    $('favorite-count').textContent=data.filter(row=>row.entity===state.entity && state.favorites.has(row.id)).length;
    $('favorites').setAttribute('aria-pressed',String(state.favoritesOnly));
    $('clear-search').hidden=!state.query;$('pagination').hidden=!rows.length;
    $('page-range').textContent=rows.length?`${(state.page-1)*state.size+1}–${Math.min(state.page*state.size,rows.length)} из ${rows.length}`:'';
    const pageNumbers=[...new Set([1,state.page-1,state.page,state.page+1,pages].filter(n=>n>0&&n<=pages))].sort((a,b)=>a-b);
    let last=0;
    $('page-buttons').innerHTML=`<button class="page-button" data-page="${state.page-1}" aria-label="Предыдущая страница" ${state.page===1?'disabled':''}>${image('chevron-left')}</button>`+pageNumbers.map(n=>{const gap=last&&n-last>1?'<span class="page-button" aria-hidden="true">…</span>':'';last=n;return gap+`<button class="page-button${n===state.page?' active':''}" data-page="${n}" aria-label="Страница ${n}" ${n===state.page?'aria-current="page"':''}>${n}</button>`;}).join('')+`<button class="page-button" data-page="${state.page+1}" aria-label="Следующая страница" ${state.page===pages?'disabled':''}>${image('chevron-right')}</button>`;
    announceResults();
  }
  function changed(load = true) {state.page=1;if(load)loadResults();else render();}
  function reset() {state.query='';$('registry-search').value='';Object.keys(state.filters).forEach(key=>{state.filters[key]=[];selects[key].set([]);});state.from=defaults.from;state.to=defaults.to;state.favoritesOnly=false;state.top=false;$('date-summary').textContent=`${dateLabel(state.from)} → ${dateLabel(state.to)}`;changed();}
  function closeDate(focus = false) {const controller=datePopup;datePopup=null;controller?.close(focus);}
  function openDate() {
    if (datePopup) {closeDate();return;} activeSelect?.close();closeAction();
    datePopup=window.BpmCalendar.open({anchor:$('date-filter'),from:state.from,to:state.to,onApply:({from,to})=>{state.from=from||defaults.from;state.to=to||defaults.to;$('date-summary').textContent=`${dateLabel(state.from)} → ${dateLabel(state.to)}`;changed();},onClose:()=>{datePopup=null;}});
  }
  let actionAnchor;
  function closeAction(focus = false) {if (!actionMenu) return;actionMenu.remove();actionMenu=null;actionAnchor?.setAttribute('aria-expanded','false');if(focus)actionAnchor?.focus();}
  function favorite(row) {
    const add=!state.favorites.has(row.id);if(add)state.favorites.add(row.id);else state.favorites.delete(row.id);
    try{localStorage.setItem('bpm-registry-favorites',JSON.stringify([...state.favorites]));}catch(_){}
    render();toast(add?'Добавлено в избранное':'Удалено из избранного');
  }
  async function copyId(row) {
    const value=row.numberSimulated?row.code:`${row.entity==='paths'?'КП':'П'} ${row.number}`;
    try {await navigator.clipboard.writeText(value);toast(`Скопировано: ${value}`);} catch (_) {
      const area=document.createElement('textarea');area.value=value;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();const ok=document.execCommand('copy');area.remove();toast(ok?`Скопировано: ${value}`:`ID: ${value}`);
    }
  }
  function openAction(row, anchor) {
    closeAction();activeSelect?.close();closeDate();actionAnchor=anchor;actionMenu=document.createElement('div');actionMenu.className='action-menu';actionMenu.setAttribute('role','menu');actionMenu.setAttribute('aria-label',`Действия с ${row.number}`);
    anchor.setAttribute('aria-expanded','true');
    actionMenu.innerHTML=`<button role="menuitem" data-favorite>${favoriteIcon('',state.favorites.has(row.id)?'dont-like':'liked','')}${state.favorites.has(row.id)?'Удалить из избранного':'Добавить в избранное'}</button>`;
    document.body.append(actionMenu);positionPopup(actionMenu,anchor,236);
    actionMenu.addEventListener('click',e=>{if(e.target.closest('[data-favorite]')){closeAction();favorite(row);(structureMode?$('structure-list').querySelector(`[data-structure-menu="${row.id}"]`)||$('favorites'):$('results').querySelector(`[data-menu="${row.id}"]`)||$('favorites')).focus({preventScroll:true});}});
    actionMenu.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const buttons=[...actionMenu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}if(e.key==='Tab')closeAction(true);});
    actionMenu.querySelector('button').focus({preventScroll:true});
  }
  function openDetail(row, trigger = document.activeElement) {
    if(!row)return;
    activeSelect?.close();closeDate();closeAction();hideTooltip();
    if(row.entity==='processes'||row.entity==='paths'){
      window.BpmProcessDrawer.open(row,{trigger,isFavorite:record=>state.favorites.has(record.id),toggleFavorite:favorite,createSelect:(id,config)=>new BpmSelect(id,config)});
      return;
    }
    $('detail-title').textContent=row.title;
    $('detail-content').innerHTML=`<p class="secondary">${row.entity==='paths'?'Клиентский путь':'Процесс'} · ${esc(row.numberSimulated?row.code:row.number)}</p><dl><dt>Блок</dt><dd>${esc(row.block)}</dd><dt>Дивизион</dt><dd>${esc(row.division)}</dd><dt>Владелец</dt><dd>${owner(row)}</dd><dt>Статус</dt><dd>${esc(row.status)}</dd><dt>Дата создания</dt><dd>${row.date?dateLabel(row.date):'Не указана'}</dd><dt>Эффективность</dt><dd>${row.efficiency===null?'Нет оценки':efficiency(row)}</dd>${row.linkedProcesses?`<dt>Связанных процессов</dt><dd>${row.linkedProcesses.length}</dd>`:''}</dl><p class="demo-note">${row.numberSimulated?'Название и связи — из Excel. ID КП и эффективность — демонстрационные.':'Демонстрационная запись.'} Редактирование и сохранение на сервер не подключены.</p><div class="modal-actions"><button class="button secondary-button" id="detail-favorite">${state.favorites.has(row.id)?'Удалить из избранного':'В избранное'}</button></div>`;
    $('detail-favorite').addEventListener('click',()=>{favorite(row);$('detail-favorite').textContent=state.favorites.has(row.id)?'Удалить из избранного':'В избранное';});
    $('detail-dialog').showModal();
  }
  const labels={status:'Статусы',block:'Блок',division:'Подразделение',process:'Процесс',owner:'Владельцы КП'};
  Object.keys(state.filters).forEach(key=>{selects[key]=new BpmSelect(`${key}-select`,{label:labels[key],options:optionsFor(key),multiple:true,onChange:values=>{state.filters[key]=[...values];changed();}});});
  const sortOptions=[{value:'id-asc',label:'По ID ↑'},{value:'id-desc',label:'По ID ↓'},{value:'title-asc',label:'По названию'},{value:'eff-desc',label:'Эффективность ↓'},{value:'eff-asc',label:'Эффективность ↑'},{value:'date-desc',label:'Сначала новые'}];
  selects.sort=new BpmSelect('sort-select',{label:'Сортировка',options:sortOptions,values:[state.sort],allowAll:false,icon:'sort',onChange:values=>{setSort(values[0]);changed(false);}});
  const sizeOptions=()=> (state.view==='cards'?[20,40,60,80]:[25,50,75,100]).map(value=>({value:String(value),label:String(value)}));
  selects.size=new BpmSelect('size-select',{label:'Показывать',options:sizeOptions(),values:[String(state.size)],allowAll:false,onChange:values=>{state.size=Number(values[0]);changed();}});
  function changeView(view) {
    if(structureMode)setStructure(false);
    if(view===state.view)return;
    activeSelect?.close();closeDate();state.view=view;state.sort=state.sorts[view];state.size=view==='cards'?20:25;state.page=1;selects.size.setOptions(sizeOptions());selects.size.set([String(state.size)]);
    if(view==='cards')selects.sort.set([state.sort]);
    ['table','cards'].forEach(value=>{$(`${value}-view`).classList.toggle('selected',value===view);$(`${value}-view`).setAttribute('aria-pressed',String(value===view));});loadResults();
  }
  function changeEntity(entity) {
    if(structureMode)setStructure(false);
    activeSelect?.close();state.entity=entity;state.top=false;
    if(entity==='paths'&&state.sorts.table.startsWith('tags-')){state.sorts.table='id-asc';if(state.view==='table')state.sort='id-asc';}
    ['paths','processes'].forEach(value=>{$(`${value}-tab`).classList.toggle('active',value===entity);$(`${value}-tab`).setAttribute('aria-pressed',String(value===entity));});
    Object.keys(state.filters).forEach(key=>{const options=optionsFor(key);state.filters[key]=state.filters[key].filter(value=>options.some(o=>o.value===value));selects[key].setOptions(options);selects[key].set(state.filters[key]);});selects.owner.host.querySelector('label').textContent=entity==='paths'?'Владельцы КП':'Владельцы П';changed();
  }
  $('registry-search').addEventListener('input',e=>{state.query=e.target.value;changed();});
  $('clear-search').addEventListener('click',()=>{state.query='';$('registry-search').value='';changed();$('registry-search').focus();});
  $('reset-filters').addEventListener('click',()=>{reset();$('registry-search').focus({preventScroll:true});});
  $('selected-filter-groups').addEventListener('click',e=>{
    const button=e.target.closest('[data-filter-key]');if(!button)return;
    const key=button.dataset.filterKey,value=button.dataset.filterValue;
    const index=[...$('selected-filter-groups').querySelectorAll('button')].indexOf(button);
    if(key==='query'){state.query='';$('registry-search').value='';}
    else if(key==='date'){state.from=defaults.from;state.to=defaults.to;$('date-summary').textContent=`${dateLabel(state.from)} → ${dateLabel(state.to)}`;}
    else if(key==='favorites')state.favoritesOnly=false;
    else if(key==='top')state.top=false;
    else{state.filters[key]=state.filters[key].filter(v=>v!==value);selects[key].set(state.filters[key]);}
    changed();const remaining=$('selected-filter-groups').querySelectorAll('button');(remaining[Math.min(index,remaining.length-1)]||$('registry-search')).focus({preventScroll:true});
  });
  $('favorites').addEventListener('click',()=>{if(structureMode){structure.toggleFavorites();return;}state.favoritesOnly=!state.favoritesOnly;changed();});
  $('date-filter').addEventListener('click',openDate);
  $('table-view').addEventListener('click',()=>changeView('table'));
  $('cards-view').addEventListener('click',()=>changeView('cards'));
  document.querySelectorAll('[data-entity]').forEach(button=>button.addEventListener('click',()=>changeEntity(button.dataset.entity)));
  $('results').addEventListener('click',e=>{
    const resetButton=e.target.closest('[data-reset]');if(resetButton){reset();return;}
    const sort=e.target.closest('[data-sort]');if(sort){const sortKey=sort.dataset.sort;setSort(`${sortKey}-${state.sort===`${sortKey}-asc`?'desc':'asc'}`);changed(false);$('results').querySelector(`[data-sort="${sortKey}"]`)?.focus({preventScroll:true});return;}
    const button=e.target.closest('[data-copy],[data-detail],[data-menu]');
    if(!button){
      if(e.target.closest('button,a,input,select,textarea') || window.getSelection()?.toString())return;
      const card=e.target.closest('[data-record]');const record=card&&data.find(item=>item.id===card.dataset.record);
      if(record)openDetail(record,card.querySelector('[data-detail]'));
      return;
    }
    const row=data.find(item=>item.id===(button.dataset.copy||button.dataset.detail||button.dataset.menu));if(!row)return;
    if(button.hasAttribute('data-copy'))copyId(row);else if(button.hasAttribute('data-detail'))openDetail(row,button);else openAction(row,button);
  });
  $('page-buttons').addEventListener('click',e=>{const button=e.target.closest('[data-page]');if(!button||button.disabled)return;state.page=Number(button.dataset.page);loadResults();$('results').scrollIntoView({block:'start',behavior:'instant'});const current=$('page-buttons').querySelector('[aria-current]');current?.focus({preventScroll:true});});
  document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  document.querySelectorAll('dialog:not(#process-drawer)').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}}));
  $('export').addEventListener('click',()=>{
    activeSelect?.close();
    const radio=$('export-form').querySelector('[value="page"]');
    radio.parentElement.lastChild.textContent=structureMode?'Только раскрытые таблицы':'Только текущая страница';
    radio.disabled=structureMode&&!structure.exportRecords('page').length;
    if(radio.disabled&&radio.checked)$('export-form').querySelector('[value="filtered"]').checked=true;
    $('export-dialog').showModal();
  });
  $('export-form').addEventListener('submit',e=>{
    e.preventDefault();const scope=new FormData(e.currentTarget).get('export-scope');const rows=structureMode?structure.exportRecords(scope):scope==='page'?selectedPage():filteredRows();
    const cell=value=>{let text=String(value??'');if(/^[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    const header=['Тип','ID','Название','Блок','Дивизион','Владелец','Статус','Дата создания','Эффективность, %','Динамика, п. п.'];
    const csv='\uFEFF'+[header,...rows.map(row=>[row.entity==='paths'?'Клиентский путь':'Процесс',row.numberSimulated?row.code:row.number,row.title,row.block,row.division,row.owner,row.status,row.date?dateLabel(row.date):'',row.efficiency===null?'':String(row.efficiency).replace('.',','),row.delta])].map(row=>row.map(cell).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=`Sber-BPM-${structureMode?'structure':state.entity}-${new Date().toISOString().slice(0,10)}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);$('export-dialog').close();toast(`Экспортировано записей: ${rows.length}`);
  });
  let menuPreference='auto', menuPeekDismissed=false, keyboardMode=false, previousMobile=null;
  try {const saved=localStorage.getItem('bpm-registry-menu');if(['expanded','collapsed'].includes(saved))menuPreference=saved;} catch (_) {}
  function menuIsCollapsed(width, preference) {return preference==='collapsed'||(preference!=='expanded'&&width<=1440);}
  function setMenuPeek(open) {
    const collapsed=document.body.classList.contains('menu-collapsed');
    document.body.classList.toggle('menu-peek',!!open&&collapsed&&innerWidth>=768);
    const peek=document.body.classList.contains('menu-peek');
    $('collapse-menu').setAttribute('aria-expanded',String(innerWidth<768?document.body.classList.contains('mobile-menu-open'):!collapsed||peek));
    $('collapse-menu').setAttribute('aria-label',innerWidth<768?'Закрыть меню':peek?'Закрыть раскрытое меню':collapsed?'Раскрыть меню поверх страницы':'Свернуть меню');
    $('collapse-menu').querySelector('img').src=`assets/${collapsed&&!peek&&innerWidth>=768?'menu-right':'collapse-menu'}.svg`;
    $('pin-menu').hidden=!(peek||(innerWidth<768&&document.body.classList.contains('mobile-menu-open')&&menuPreference!=='expanded'));
    hideTooltip();
  }
  function setMenuPreference(value) {
    menuPreference=value;menuPeekDismissed=value==='collapsed';
    try {localStorage.setItem('bpm-registry-menu',value);} catch (_) {}
    activeSelect?.close();closeDate();closeAction();syncMenu();
  }
  function syncMenu() {
    const mobile=innerWidth<768;
    document.body.classList.toggle('menu-collapsed',menuIsCollapsed(innerWidth,menuPreference));
    document.body.classList.toggle('menu-pinned',menuPreference==='expanded');
    if(!mobile)closeMobile();
    else if(menuPreference==='expanded'&&previousMobile!==true)openMobile();
    previousMobile=mobile;
    setMenuPeek(false);
    $('sidebar').inert=mobile&&!document.body.classList.contains('mobile-menu-open');
  }
  function openMobile() {document.body.classList.add('mobile-menu-open');$('sidebar-backdrop').hidden=false;$('mobile-menu').setAttribute('aria-expanded','true');$('sidebar').inert=false;setMenuPeek(false);$('collapse-menu').focus({preventScroll:true});}
  function closeMobile(focus=false) {document.body.classList.remove('mobile-menu-open');$('sidebar-backdrop').hidden=true;$('mobile-menu').setAttribute('aria-expanded','false');$('sidebar').inert=innerWidth<768;setMenuPeek(false);if(focus)$('mobile-menu').focus();}
  $('mobile-menu').addEventListener('click',()=>{if(document.body.classList.contains('mobile-menu-open'))closeMobile(true);else{openMobile();$('collapse-menu').focus();}});
  $('sidebar-backdrop').addEventListener('click',()=>closeMobile(true));
  $('mobile-filters-toggle').addEventListener('click',()=>{const open=!document.body.classList.contains('mobile-filters-open');document.body.classList.toggle('mobile-filters-open',open);$('mobile-filters-toggle').setAttribute('aria-expanded',String(open));if(!open){activeSelect?.close();closeDate();}});
  $('collapse-menu').addEventListener('click',()=>{if(innerWidth<768){if(menuPreference==='expanded')setMenuPreference('collapsed');closeMobile(true);return;}if(document.body.classList.contains('menu-collapsed')){const open=!document.body.classList.contains('menu-peek');menuPeekDismissed=!open;setMenuPeek(open);}else setMenuPreference('collapsed');});
  $('pin-menu').addEventListener('click',()=>{setMenuPreference('expanded');if(innerWidth<768)openMobile();$('collapse-menu').focus({preventScroll:true});});
  $('sidebar').addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'&&!menuPeekDismissed)setMenuPeek(true);});
  $('sidebar').addEventListener('pointerleave',()=>{menuPeekDismissed=false;if(!keyboardMode||!$('sidebar').contains(document.activeElement))setMenuPeek(false);});
  $('sidebar').addEventListener('focusin',e=>{if(keyboardMode&&!menuPeekDismissed)setMenuPeek(true);});
  $('sidebar').addEventListener('focusout',e=>{if(!$('sidebar').contains(e.relatedTarget)){menuPeekDismissed=false;setMenuPeek(false);}});
  [['paths-nav','paths-submenu'],['gemba-nav','gemba-submenu']].forEach(([buttonId,menuId])=>{$(buttonId).addEventListener('click',()=>{if(innerWidth>=768&&document.body.classList.contains('menu-collapsed')&&!document.body.classList.contains('menu-peek')){menuPeekDismissed=false;setMenuPeek(true);return;}const open=$(buttonId).getAttribute('aria-expanded')!=='true';$(buttonId).setAttribute('aria-expanded',String(open));$(menuId).hidden=!open;$(buttonId).querySelector('.nav-chevron').src=`assets/chevron-${open?'up':'down'}.svg`;});});
  $('top-paths').addEventListener('click',()=>{reset();changeEntity('paths');state.top=true;setSort('eff-desc');changed();closeMobile();window.scrollTo({top:0,behavior:'instant'});});
  document.querySelector('.subitem.current').addEventListener('click',()=>{if(structureMode)setStructure(false);reset();closeMobile();});
  document.querySelectorAll('.nav-item').forEach(button=>button.setAttribute('aria-label',button.dataset.tooltip || button.textContent.trim()));
  document.querySelectorAll('[data-service]').forEach(button=>button.addEventListener('click',()=>toast(`«${button.dataset.service}» — раздел вне демонстрационного реестра.`)));
  $('global-search').addEventListener('click',()=>{const input=$(structureMode?'structure-search':'registry-search');input.scrollIntoView({block:'center'});input.focus({preventScroll:true});});
  $('notifications').addEventListener('click',()=>toast('Счётчик взят из макета. Сервис уведомлений не подключён.'));
  $('profile').addEventListener('click',()=>toast('Демонстрационный профиль. Авторизация не подключена.'));
  document.addEventListener('pointerdown',e=>{keyboardMode=false;if(!$('sidebar').contains(e.target))setMenuPeek(false);if(activeSelect&&!activeSelect.host.contains(e.target)&&!activeSelect.popup?.contains(e.target))activeSelect.close();if(actionMenu&&!actionMenu.contains(e.target)&&!e.target.closest('[data-menu]'))closeAction();});
  document.addEventListener('focusin',e=>{if(activeSelect&&!activeSelect.host.contains(e.target)&&!activeSelect.popup?.contains(e.target))activeSelect.close();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Tab')keyboardMode=true;
    if(e.key==='Escape'){if(actionMenu){e.preventDefault();closeAction(true);}if(document.body.classList.contains('mobile-menu-open'))closeMobile(true);if(document.body.classList.contains('menu-peek')){menuPeekDismissed=true;setMenuPeek(false);$('collapse-menu').focus({preventScroll:true});}hideTooltip();}
    if(e.key==='Tab'&&document.body.classList.contains('mobile-menu-open')){const focusables=[...$('sidebar').querySelectorAll('button,a')].filter(el=>el.getClientRects().length);const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  function hideTooltip(){tooltip?.remove();tooltip=null;}
  function showTooltip(target){hideTooltip();if(!target||target.closest('.sidebar')||document.querySelector('dialog[open]'))return;tooltip=document.createElement('div');tooltip.className='tooltip';tooltip.textContent=target.dataset.tooltip;document.body.append(tooltip);const r=target.getBoundingClientRect();tooltip.style.left=`${Math.max(8,Math.min(innerWidth-tooltip.offsetWidth-8,r.left+r.width/2-tooltip.offsetWidth/2))}px`;tooltip.style.top=`${r.top>tooltip.offsetHeight+12?r.top-tooltip.offsetHeight-8:r.bottom+8}px`;}
  document.addEventListener('mouseover',e=>{const target=e.target.closest('[data-tooltip]');if(target&&!target.contains(e.relatedTarget))showTooltip(target);});
  document.addEventListener('mouseout',e=>{const target=e.target.closest('[data-tooltip]');if(target&&!target.contains(e.relatedTarget))hideTooltip();});
  document.addEventListener('focusin',e=>showTooltip(e.target.closest('[data-tooltip]')));
  document.addEventListener('focusout',hideTooltip);
  document.addEventListener('scroll',e=>{hideTooltip();if(activeSelect&&e.target!==activeSelect.popup)positionPopup(activeSelect.popup,activeSelect.control,activeSelect.config.minPopupWidth??(activeSelect.config.multiple?300:260));},true);
  window.addEventListener('resize',()=>{syncMenu();activeSelect?.close();closeAction();hideTooltip();});
  function openSharedDetail(){
    const match=location.hash.match(/^#(process|journey|path)=(.+)$/);if(!match)return;
    let id;try{id=decodeURIComponent(match[2]);}catch(_){return;}
    const entity=match[1]==='process'?'processes':'paths';
    let row=allRecords.find(record=>record.entity===entity&&record.id===id);
    // Included demo processes are supplied by the journey renderer, while Excel
    // processes already live in allRecords. Both retain reloadable share links.
    if(!row&&entity==='processes'&&window.BpmJourneyDetails?.getProcesses){
      for(const journey of allRecords.filter(record=>record.entity==='paths')){
        row=window.BpmJourneyDetails.getProcesses(journey).find(record=>record.id===id);
        if(row)break;
      }
    }
    if(!row)return;
    if(row.source==='xlsx'){
      if(!structureMode)setStructure(true);
      if(structure.getEntity()!==entity)document.querySelector(`[data-structure-entity="${entity}"]`)?.click();
    }else{
      if(structureMode)setStructure(false);
      if(state.entity!==entity)changeEntity(entity);
    }
    openDetail(row,$(structureMode?'structure-toggle':`${entity}-tab`));
  }
  function setStructure(value) {
    if(value===structureMode)return;
    activeSelect?.close();closeDate();closeAction();hideTooltip();clearTimeout(loadingTimer);isLoading=false;
    window.BpmCardVisuals.cancelCounters($('results'));
    structureMode=value;document.body.classList.toggle('structure-mode',value);
    $('structure-toggle').setAttribute('aria-pressed',String(value));
    $('structure-mode').hidden=!value;$('structure-search-wrap').hidden=!value;$('registry-search-wrap').hidden=value;
    $('structure-entity-tabs').hidden=!value;
    ['cards','table'].forEach(view=>{const selected=!value&&state.view===view;$(`${view}-view`).classList.toggle('selected',selected);$(`${view}-view`).setAttribute('aria-pressed',String(selected));});
    if(value){document.body.classList.remove('table-view');structure.enter();}
    else {structure.leave();loadResults();}
  }
  structure=window.BpmStructure.create({
    createSelect:(id,config)=>new BpmSelect(id,config),isFavorite:row=>state.favorites.has(row.id),
    detail:openDetail,copy:copyId,menu:openAction,
    onChange:info=>{if(structureMode){$('favorites').setAttribute('aria-pressed',String(info.favoritesOnly));$('favorite-count').textContent=info.favoritesCount;}}
  });
  $('structure-toggle').addEventListener('click',()=>setStructure(!structureMode));
  window.addEventListener('hashchange',openSharedDetail);
  syncMenu();loadResults();openSharedDetail();
})();

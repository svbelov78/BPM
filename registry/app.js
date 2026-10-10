/* Sber BPM: standalone, offline-ready registry. Data is intentionally demonstrational. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Typography belongs to displayed copy; source names, values and IDs stay intact.
  const formatCopy = value => String(value ?? '').replace(/"([^"\n]+)"|“([^”\n]+)”/g, (match, straight, curly, offset, text) => {
    const depth = [...text.slice(0, offset)].reduce((level, character) => character === '«' ? level + 1 : character === '»' ? Math.max(0, level - 1) : level, 0);
    const content = straight ?? curly;
    return depth ? '„' + content + '“' : '«' + content + '»';
  });
  window.BpmCopyTypography = Object.freeze({format:formatCopy});
  const copy = value => esc(formatCopy(value));
  const image = (name, cls = '') => `<img src="assets/${esc(name)}.svg" alt=""${cls ? ` class="${cls}"` : ''}>`;
  const fieldIcon = (name = 'field-chevron-down-16') => image(name, ['field-chevron-down-16','field-chevron-disabled-16','field-clear-16','chevron-down-pagination'].includes(name) ? 'field-action-icon' : '');
  const favoriteIcon = (cls='',name='liked',label='В избранном') => `<span class="favorite-heart ${cls}" ${label?`role="img" aria-label="${esc(label)}"`:'aria-hidden="true"'}>${image(name)}</span>`;
  const data = window.BPM_DATA || [];
  const allRecords = [...data,...(window.BPM_STRUCTURE?.records || []),...(window.BPM_STRUCTURE_PATHS?.records || []),...(window.BPM_CABINET_DATA?.entities || []),...(window.BPM_TOP_KP?.records || [])];
  const defaults = {from:'2001-08-21',to:'2026-09-13'};
  const state = {entity:'paths',view:'cards',query:'',filters:{status:[],block:[],division:[],process:[],owner:[]},sort:'id-asc',sorts:{cards:'id-asc',table:'id-asc'},from:defaults.from,to:defaults.to,page:1,size:20,favoritesOnly:false,top:false,favorites:new Set(['paths-1232','paths-1233'])};
  try { const saved = JSON.parse(localStorage.getItem('bpm-registry-favorites')); if (Array.isArray(saved)) state.favorites = new Set(saved.filter(id => allRecords.some(row => row.id === id))); } catch (_) { /* Storage may be unavailable for local files. */ }
  let structureMode=false, structure, tasksMode=false, tasks, cabinetMode=false, cabinet, topKpMode=false, topKp, insightsMode=false, insights, resumeStructure=false;
  const selects = {};
  let activeSelect = null, datePopup = null, actionMenu = null, tooltip = null, toastTimer, toastExitTimer, toastRevision=0, toastResize, toastAnnouncement;
  const LOADING_DURATION = 2000;
  let isLoading = false, loadingTimer;
  const normalize = value => String(value).toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[«»„“”]/g,'"');
  const dateLabel = iso => iso ? iso.split('-').reverse().join('.') : 'Любая';
  function smoothToastCorners(element) {
    // Circular arc + tangent Beziers: radius 16, iOS corner smoothing 60%.
    // Geometry: https://www.figma.com/blog/desperately-seeking-squircles/
    const width=element.offsetWidth,height=element.offsetHeight;
    if(!width||!height)return;
    const radius=Math.min(16,width/2,height/2),smooth=Math.min(.6,Math.min(width,height)/(2*radius)-1);
    const p=(1+smooth)*radius,angle=smooth*Math.PI/4;
    const arc=Math.sin((1-smooth)*Math.PI/4)*radius*Math.SQRT2;
    const c=radius*Math.tan(angle/2)*Math.cos(angle),d=c*Math.tan(angle);
    const b=(p-arc-c-d)/3,a=2*b,x=a+b+c;
    const turns=[[width-p,0,1,0],[width,height-p,0,1],[p,height,-1,0],[0,p,0,-1]];
    const segments=turns.map(([left,top,cos,sin],index)=>{
      const point=(u,v)=>`${(left+u*cos-v*sin).toFixed(3)} ${(top+u*sin+v*cos).toFixed(3)}`;
      return `${index?'L':'M'} ${point(0,0)} C ${point(a,0)} ${point(a+b,0)} ${point(x,d)} A ${radius} ${radius} 0 0 1 ${point(x+arc,d+arc)} C ${point(x+arc+d,d+arc+c)} ${point(x+arc+d,d+arc+b+c)} ${point(p,p)}`;
    });
    element.style.setProperty('--toast-shape',`path("${segments.join(' ')} Z")`);
  }
  function finishToast(element,revision) {
    if(revision!==toastRevision)return;
    clearTimeout(toastTimer);clearTimeout(toastExitTimer);
    if(typeof element.hidePopover==='function'&&element.matches(':popover-open'))element.hidePopover();
    toastAnnouncement?.remove();toastAnnouncement=null;
    element.hidden=true;element.classList.remove('is-entering','is-leaving');element.dataset.phase='hidden';
  }
  function toast(message,{success=false}={}) {
    const element=$('toast'),revision=++toastRevision;
    clearTimeout(toastTimer);clearTimeout(toastExitTimer);
    if(typeof element.hidePopover==='function'&&element.matches(':popover-open'))element.hidePopover();
    toastAnnouncement?.remove();toastAnnouncement=null;
    element.classList.remove('is-entering','is-leaving');
    const text=document.createElement('span');text.className='toast-message';text.textContent=formatCopy(message);
    element.replaceChildren(text);element.classList.toggle('is-success',success);
    if(success){const icon=document.createElement('img');icon.src='assets/dropdown-tick-green.svg';icon.alt='';icon.width=24;icon.height=24;element.prepend(icon);}
    element.hidden=false;
    // A manual popover enters the native top layer without taking keyboard focus.
    if(typeof element.showPopover==='function')element.showPopover();
    // Native modals make outside live regions inert, even when a popover paints above them.
    // Announce inside the active modal; keep a single visual toast in the top layer.
    const focusedModal=document.activeElement?.closest('dialog');
    const modal=focusedModal?.matches(':modal')?focusedModal:[...document.querySelectorAll('dialog[open]')].reverse().find(node=>node.matches(':modal'));
    // Exactly one live region is exposed, including browsers that retain a popover in AX.
    element.setAttribute('aria-hidden',modal?'true':'false');
    if(modal){
      const announcement=document.createElement('div');
      announcement.className='sr-only toast-announcement';announcement.setAttribute('role','status');
      announcement.setAttribute('aria-live','polite');announcement.setAttribute('aria-atomic','true');
      modal.append(announcement);toastAnnouncement=announcement;
      requestAnimationFrame(()=>{if(revision===toastRevision&&announcement.isConnected)announcement.textContent=text.textContent;});
    }
    smoothToastCorners(element);
    if(!toastResize&&typeof ResizeObserver==='function'){
      toastResize=new ResizeObserver(()=>smoothToastCorners(element));toastResize.observe(element);
    }
    void element.offsetWidth; // Restart the entrance when a visible toast is replaced.
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.dataset.phase=reduced?'visible':'entering';
    if(!reduced)element.classList.add('is-entering');
    element.onanimationend=event=>{
      if(event.target!==element||revision!==toastRevision)return;
      if(event.animationName==='toast-enter')element.dataset.phase='visible';
      if(event.animationName==='toast-exit')finishToast(element,revision);
    };
    toastTimer=setTimeout(()=>{
      if(revision!==toastRevision)return;
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){finishToast(element,revision);return;}
      element.classList.remove('is-entering');element.classList.add('is-leaving');element.dataset.phase='leaving';
      toastExitTimer=setTimeout(()=>finishToast(element,revision),280);
    },4000);
  }
  window.BpmToast=Object.freeze({show:toast});
  function positionPopup(popup, anchor, minWidth = 260, placement = 'auto') {
    const r = anchor.getBoundingClientRect(), margin = 12;
    const width = Math.min(Math.max(r.width,minWidth),innerWidth-margin*2);
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(margin,Math.min(r.left,innerWidth-width-margin))}px`;
    const below = innerHeight-r.bottom-8-margin, above = r.top-8-margin;
    const useAbove = placement === 'above' || (below < 180 && above > below);
    popup.style.maxHeight = `${Math.max(placement==='above'?0:100,Math.min(340,useAbove ? above : below))}px`;
    popup.dataset.placement=useAbove?'above':'below';
    popup.style.top = `${useAbove ? Math.max(margin,r.top-8-popup.offsetHeight) : r.bottom+8}px`;
  }
  class BpmSelect {
    constructor(id, config) {
      this.host = $(id); this.id = id; this.config = config; this.options = config.options; this.values = config.values || []; this.query = ''; this.active = -1;
      this.shown = config.visibility?.shown !== false; this.disabled = !!config.visibility && !this.shown;
      this.host.innerHTML = `<div class="bpm-select"><div class="field select-control">${config.visibility ? '<button type="button" class="select-visibility"></button>' : ''}<div class="select-content"><label class="internal-label" for="${id}-input">${copy(config.label)}</label><input class="select-input" id="${id}-input" type="text" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-list" autocomplete="off" spellcheck="false"></div><button type="button" class="select-toggle" tabindex="-1" aria-label="Открыть список: ${copy(config.label)}">${fieldIcon(config.icon)}</button></div></div>`;
      this.input = $(`${id}-input`); this.control = this.host.querySelector('.select-control'); this.toggle = this.host.querySelector('.select-toggle');
      this.visibilityButton = this.host.querySelector('.select-visibility');
      this.visibilityButton?.addEventListener('click', e => {
        e.stopPropagation();
        this.close();
        this.setVisibility(!this.shown);
        this.config.visibility.onChange?.(this.shown);
      });
      this.input.addEventListener('focus', () => {if (!this.suppressFocusOpen) this.open();});
      this.input.addEventListener('click', () => this.open());
      this.control.addEventListener('click', e => { if (!this.disabled && !e.target.closest('.select-toggle, .select-visibility')) this.input.focus(); });
      this.toggle.addEventListener('mousedown', e => e.preventDefault());
      this.toggle.addEventListener('click', e => {
        e.stopPropagation();
        if (this.disabled) return;
        if (this.config.multiple && this.values.length) {
          this.clear();
        } else if (this.popup) this.close();
        else { this.input.focus(); this.open(); }
      });
      this.input.addEventListener('input', () => { if (this.disabled) return; this.query = this.input.value; if (!this.popup) this.open(false); this.active = -1; this.renderOptions(); });
      this.input.addEventListener('keydown', e => this.keydown(e));
      if (config.visibility) this.setVisibility(this.shown);
      this.refresh();
    }
    refresh() {
      const multiple = this.config.multiple, labels = this.values.map(value => this.config.valueLabel?.(value) ?? this.options.find(o => o.value === value)?.label ?? value);
      const selected = !!multiple && this.values.length > 0;
      const summary = selected ? `Выбрано ${this.values.length}` : '';
      this.host.classList.toggle('has-selection',selected);
      if (!this.popup) this.input.value = multiple ? summary : formatCopy(labels[0] || '');
      this.input.placeholder = summary || this.config.placeholder || 'Все';
      this.input.setAttribute('aria-description', multiple ? `${summary || 'Выбраны все'}. Введите текст для поиска.` : 'Введите текст для поиска.');
      this.toggle.classList.toggle('is-clear',selected);
      this.toggle.tabIndex = selected && !this.disabled ? 0 : -1;
      this.toggle.setAttribute('aria-label',`${selected ? 'Очистить' : 'Открыть список'}: ${this.config.label}`);
      this.toggle.innerHTML = fieldIcon(this.disabled ? 'field-chevron-disabled-16' : selected ? 'field-clear-16' : this.config.icon);
      if (this.popup) { this.renderOptions(); positionPopup(this.popup,this.control,this.config.minPopupWidth ?? (this.config.multiple ? 300 : 260),this.config.placement); }
    }
    setVisibility(shown) {
      if (!this.visibilityButton) return;
      this.shown = !!shown; this.config.visibility.shown = this.shown; this.disabled = !this.shown;
      if (this.disabled) this.close();
      this.input.disabled = this.disabled; this.toggle.disabled = this.disabled;
      this.control.classList.toggle('is-disabled',this.disabled); this.host.classList.toggle('is-disabled',this.disabled);
      const action = `${this.shown ? 'Скрыть' : 'Показать'} уровень «${this.config.visibility.label || this.config.label}»`;
      this.visibilityButton.setAttribute('aria-pressed',String(this.shown));
      this.visibilityButton.setAttribute('aria-label',action); this.visibilityButton.title = action;
      this.visibilityButton.innerHTML = image(this.shown ? 'structure-eye' : 'structure-eye-off');
      this.refresh();
    }
    set(values, notify = false) { this.values = values; this.query = ''; this.refresh(); if (notify) this.config.onChange(values); }
    clear() {if(this.disabled)return;this.values=[];this.query='';this.input.value='';this.close();this.changed();this.suppressFocusOpen=true;this.input.focus({preventScroll:true});this.suppressFocusOpen=false;}
    setOptions(options) { this.options = options; this.refresh(); }
    open(clear = true) {
      if (this.disabled || this.popup) return;
      closeDate(); closeAction(); if (activeSelect) activeSelect.close();
      activeSelect = this; if (clear) this.query = ''; this.input.value = this.query;
      this.popup = document.createElement('div'); this.popup.className = `select-popup${this.config.popupClass?' '+this.config.popupClass:''}`; this.popup.id = `${this.id}-list`; this.popup.setAttribute('role','listbox'); this.popup.setAttribute('aria-label',this.config.label);
      if (this.config.multiple) this.popup.setAttribute('aria-multiselectable','true');
      (this.host.closest('dialog[open]') || document.body).append(this.popup); this.input.setAttribute('aria-expanded','true'); this.control.classList.add('is-open'); this.active = -1;
      this.popup.addEventListener('mousedown',e => e.preventDefault());
      this.popup.addEventListener('click',e => { const option=e.target.closest('[data-option]'); if (option) this.choose(option.dataset.option); });
      this.renderOptions(); positionPopup(this.popup,this.control,this.config.minPopupWidth ?? (this.config.multiple ? 300 : 260),this.config.placement);
    }
    close() { if (!this.popup) return; this.popup.remove(); this.popup = null; this.query = ''; this.input.setAttribute('aria-expanded','false'); this.input.removeAttribute('aria-activedescendant'); this.control.classList.remove('is-open'); if (activeSelect === this) activeSelect = null; this.refresh(); }
    renderOptions() {
      if (!this.popup) return;
      const all = this.config.allowAll === false ? [] : [{value:'',label:'Все'}];
      this.visible = [...all,...this.options].filter(o => normalize(o.label).includes(normalize(this.query)));
      this.active = Math.min(this.active,this.visible.length-1);
      this.popup.innerHTML = this.visible.length ? this.visible.map((o,i) => {
        const selected = o.value ? this.values.includes(o.value) : !this.values.length;
        return `<div role="option" id="${this.id}-option-${i}" class="select-option${i === this.active ? ' active' : ''}" data-option="${esc(o.value)}" aria-selected="${selected}">${this.config.multiple ? `<span class="option-check" aria-hidden="true">${selected ? image('tick') : ''}</span>` : ''}<span class="option-label">${copy(o.label)}</span>${selected && !this.config.multiple ? image('tick','selected-tick') : ''}</div>`;
      }).join('') : '<div class="popup-empty">Ничего не найдено</div>';
      if (this.active >= 0) this.input.setAttribute('aria-activedescendant',`${this.id}-option-${this.active}`); else this.input.removeAttribute('aria-activedescendant');
      positionPopup(this.popup,this.control,this.config.minPopupWidth ?? (this.config.multiple ? 300 : 260),this.config.placement);
    }
    choose(value) {
      if (this.disabled) return;
      if (!value) this.values = [];
      else if (this.config.multiple) this.values = this.values.includes(value) ? this.values.filter(v => v !== value) : [...this.values,value];
      else this.values = [value];
      this.query = ''; this.input.value = ''; this.changed();
      if (!this.config.multiple) this.close();
    }
    changed() { this.refresh(); this.config.onChange(this.values); }
    keydown(e) {
      if (this.disabled) return;
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
  function ownerName(row) { return window.BpmAvatars.displayName(row.owner,`${row.id}:owner`); }
  function optionsFor(key) { return [...new Set(data.filter(row=>row.entity===state.entity).map(row=>key==='owner'?ownerName(row):row[key]))].sort((a,b)=>a.localeCompare(b,'ru')).map(value=>({value,label:value})); }
  const sortCollator = new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
  function setSort(sort) {
    state.sort=sort;state.sorts[state.view]=sort;
    if(state.view==='cards')selects.sort.set([sort]);
  }
  function compareRows(a,b,sort=state.sort) {
    const [key,direction]=sort.split('-');
    let comparison;
    if(key==='id')comparison=a.number-b.number;
    else if(key==='eff'){
      // An unavailable score is not zero; keep it after assessed rows in either direction.
      if(a.efficiency==null||b.efficiency==null)return Number(a.efficiency==null)-Number(b.efficiency==null)||a.number-b.number;
      comparison=a.efficiency-b.efficiency;
    }
    else if(key==='tags')comparison=sortCollator.compare(a.tags.join(', '),b.tags.join(', '));
    else if(key==='owner')comparison=sortCollator.compare(ownerName(a),ownerName(b));
    else comparison=sortCollator.compare(a[key]||'',b[key]||'');
    return (direction==='desc'?-comparison:comparison)||a.number-b.number;
  }
  function filteredRows() {
    const query=normalize(state.query.trim()).replace(/^(?:кп|п)\s*(?=\d)/,'');
    return data.filter(row=>row.entity===state.entity && (!query || normalize(`${row.number} ${row.title} ${row.owner} ${ownerName(row)} ${row.block} ${row.division}`).includes(query)) && Object.entries(state.filters).every(([key,values])=>!values.length || values.includes(key==='owner'?ownerName(row):row[key])) && (!state.from || row.date>=state.from) && (!state.to || row.date<=state.to) && (!state.favoritesOnly || state.favorites.has(row.id)) && (!state.top || row.efficiency>=85)).sort((a,b)=>{
      return compareRows(a,b);
    });
  }
  function selectedPage(rows = filteredRows()) {return rows.slice((state.page-1)*state.size,state.page*state.size);}
  function owner(row) { const name=ownerName(row);return `<div class="owner"><span class="avatar">${window.BpmAvatars.portrait(name)}</span><span class="owner-name" title="${esc(name)}">${esc(name)}</span></div>`; }
  function efficiency(row, table = false) {
    return window.BpmCardVisuals.efficiency(row,table);
  }
  function status(row) {const color={'Исполняется':'#34c759','На согласовании':'#0088ff','Черновик':'#7f7f7f','Завершён':'#7f7f7f'}[row.status]||'#7f7f7f';return `<span class="status-dot" style="background:${color}"></span><span class="status-copy">${esc(row.status)}</span>`;}
  function metadata(row) {return `<button class="id-badge" data-copy="${esc(row.id)}" aria-label="Скопировать ID ${row.entity==='paths'?'КП':'П'} ${row.number}">${row.entity==='paths'?'КП':'П'} ${row.number}${image('copy')}</button>${row.count?`<span class="count-badge">${row.count} ${row.entity==='paths'?(row.count===3?'процесса':'процессов'):'варианта'}${image('info')}</span>`:''}`;}
  function renderCard(row) {return `<article class="entity-card" data-record="${esc(row.id)}"><button class="card-more" data-menu="${esc(row.id)}" aria-label="Действия с ${row.entity==='paths'?'КП':'процессом'} ${row.number}" aria-haspopup="menu">${image('more')}</button><div class="card-header"><div class="card-id">${state.favorites.has(row.id)?favoriteIcon():''}${metadata({...row,count:0})}</div><div class="status">${status(row)}<span aria-hidden="true">|</span><time datetime="${row.date}">${dateLabel(row.date)}</time></div><div class="card-count">${row.count?`<span class="count-badge">${row.count} ${row.entity==='paths'?(row.count===3?'процесса':'процессов'):'варианта'}${image('info')}</span>`:''}</div></div><div class="card-body"><button class="card-title" data-detail="${esc(row.id)}">${copy(row.title)}</button><p class="card-description">Блок «${copy(row.block)}» / Дивизион «${copy(row.division)}»</p>${row.entity==='processes'?`<div class="card-tags"><span class="tag">${esc(row.type)}</span>${row.tags.map(tag=>`<span class="tag">${esc(tag)}</span>`).join('')}</div>`:''}</div><div class="card-footer">${owner(row)}${efficiency(row)}</div></article>`;}
  function tableHeader(label,key) {
    const active=state.sort.startsWith(`${key}-`),descending=active&&state.sort.endsWith('-desc');
    const nextDirection=active&&!descending?'по убыванию':'по возрастанию';
    const action=`${label}: сортировать ${key==='id'?'по ID ':''}${nextDirection}`;
    const wrappedLabel=label==='Эффективность'?'Эф\u00adфек\u00adтив\u00adность':label;
    return `<th scope="col"${active?` aria-sort="${descending?'descending':'ascending'}"`:''}><button type="button" class="table-sort-button" data-sort="${key}" data-active="${active}" aria-label="${esc(action)}"><span>${esc(wrappedLabel)}</span>${image('arrow-down',`table-sort-arrow${descending?' is-reversed':''}`)}</button></th>`;
  }
  function renderTable(rows, loading = false) {
    const process=state.entity==='processes';
    return `<div class="table-scroll" tabindex="0" role="region" aria-label="Таблица реестра; прокручивайте по горизонтали для остальных столбцов"><table class="registry-table${process?' processes-table':''}"><caption class="sr-only">${process?'Процессы':'Клиентские пути'}</caption><colgroup><col><col style="width:240px"><col style="width:188px"></colgroup><thead class="table-header"><tr>${tableHeader(process?'Процесс':'Клиентский путь','id')}${tableHeader('Владелец','owner')}${tableHeader('Эффективность','eff')}</tr></thead><tbody>${loading?window.BpmLoading.tableRows(rows.length||6):rows.map(row=>`<tr data-record="${esc(row.id)}"><td class="description-cell"><div class="metadata">${state.favorites.has(row.id)?favoriteIcon('inline-bookmark'):''}${metadata(row)}${process?`<span class="tag">${esc(row.type)}</span>`:''}</div><button class="card-title table-title" data-detail="${esc(row.id)}">${copy(row.title)}</button><p class="card-description">Блок «${copy(row.block)}» / Дивизион «${copy(row.division)}»</p></td><td>${owner(row)}</td><td><div class="efficiency-stack">${efficiency(row,true)}${row.delta?`<span class="table-delta">${row.delta>0?'+':''}${row.delta} п. п. ${row.delta>0?'↑':'↓'}</span>`:''}</div></td></tr>`).join('')}</tbody></table></div>`;
  }
  function hasFilters() {return state.query.trim() || Object.values(state.filters).some(v=>v.length) || state.from!==defaults.from || state.to!==defaults.to || state.favoritesOnly || state.top;}
  function renderSelectedFilters() {
    const groups=Object.entries(state.filters).filter(([,values])=>values.length).map(([key,values])=>({key,label:key==='owner'?(state.entity==='paths'?'Владельцы КП':'Владельцы П'):labels[key],values}));
    if(state.query.trim())groups.unshift({key:'query',label:'Поиск',values:[state.query]});
    if(state.from!==defaults.from||state.to!==defaults.to)groups.push({key:'date',label:'Дата создания',values:[`${dateLabel(state.from)} → ${dateLabel(state.to)}`]});
    if(state.favoritesOnly)groups.push({key:'favorites',label:'Список',values:['Избранное']});
    if(state.top)groups.push({key:'top',label:'Рейтинг',values:['TOP КП']});
    $('selected-filters').hidden=!groups.length;
    $('selected-filter-groups').innerHTML=groups.map(group=>`<div class="applied-filter-group" role="group" aria-label="${esc(group.label)}"><span class="applied-filter-label">${esc(group.label)}</span>${group.values.map(value=>`<span class="chip applied-filter-chip" title="${copy(value)}"><span class="chip-text">${copy(value)}</span><button data-filter-key="${group.key}" data-filter-value="${esc(value)}" aria-label="Убрать фильтр: ${copy(value)}">${image('close-16')}</button></span>`).join('')}</div>`).join('');
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
    if(tasksMode||cabinetMode||topKpMode||insightsMode)return;
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
    if(tasksMode||cabinetMode||topKpMode||insightsMode)return;
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
    render();if(cabinetMode)cabinet.refresh();toast(add?'Добавлено в избранное':'Удалено из избранного');
  }
  async function copyId(row) {
    const value=row.numberSimulated?row.code:`${row.entity==='paths'?'КП':'П'} ${row.number}`;
    return copyText(value);
  }
  async function copyText(value) {
    value=String(value??'');
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
    if(row.source==='top-kp')row=window.BpmTopKp.detailRecord(row);
    if(row.entity==='processes'||row.entity==='paths'){
      window.BpmProcessDrawer.open(row,{trigger,isFavorite:record=>state.favorites.has(record.id),toggleFavorite:favorite,createSelect:(id,config)=>new BpmSelect(id,config),createTask});
      return;
    }
    $('detail-title').textContent=formatCopy(row.title);
    $('detail-content').innerHTML=`<p class="secondary">${row.entity==='paths'?'Клиентский путь':'Процесс'} · ${esc(row.numberSimulated?row.code:row.number)}</p><dl><dt>Блок</dt><dd>${copy(row.block)}</dd><dt>Дивизион</dt><dd>${copy(row.division)}</dd><dt>Владелец</dt><dd>${owner(row)}</dd><dt>Статус</dt><dd>${esc(row.status)}</dd><dt>Дата создания</dt><dd>${row.date?dateLabel(row.date):'Не указана'}</dd><dt>Эффективность</dt><dd>${row.efficiency===null?'Нет оценки':efficiency(row)}</dd>${row.linkedProcesses?`<dt>Связанных процессов</dt><dd>${row.linkedProcesses.length}</dd>`:''}</dl><p class="demo-note">${row.numberSimulated?'Название и связи — из Excel. ID КП и эффективность — демонстрационные.':'Демонстрационная запись.'} Редактирование и сохранение на сервер не подключены.</p><div class="modal-actions"><button class="button secondary-button" id="detail-favorite">${state.favorites.has(row.id)?'Удалить из избранного':'В избранное'}</button></div>`;
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
  let menuPreference='auto', topKpMenuPreference=null, menuPeekDismissed=false, keyboardMode=false, previousMobile=null;
  try {const saved=localStorage.getItem('bpm-registry-menu');if(['expanded','collapsed'].includes(saved))menuPreference=saved;} catch (_) {}
  // ТОП-КП starts with more room for the map, without changing the saved menu
  // preference of other sections. Manual changes last for this TOP visit only.
  function effectiveMenuPreference() {return topKpMode ? topKpMenuPreference || 'collapsed' : menuPreference;}
  function menuIsCollapsed(width, preference) {return preference==='collapsed'||(preference!=='expanded'&&width<=1440);}
  function setMenuPeek(open) {
    const collapsed=document.body.classList.contains('menu-collapsed');
    document.body.classList.toggle('menu-peek',!!open&&collapsed&&innerWidth>=768);
    const peek=document.body.classList.contains('menu-peek');
    $('collapse-menu').setAttribute('aria-expanded',String(innerWidth<768?document.body.classList.contains('mobile-menu-open'):!collapsed||peek));
    $('collapse-menu').setAttribute('aria-label',innerWidth<768?'Закрыть меню':peek?'Закрыть раскрытое меню':collapsed?'Раскрыть меню поверх страницы':'Свернуть меню');
    $('collapse-menu').querySelector('img').src=`assets/${collapsed&&!peek&&innerWidth>=768?'menu-right':'collapse-menu'}.svg`;
    $('pin-menu').hidden=!(peek||(innerWidth<768&&document.body.classList.contains('mobile-menu-open')&&effectiveMenuPreference()!=='expanded'));
    hideTooltip();
  }
  function setMenuPreference(value) {
    if(topKpMode)topKpMenuPreference=value;
    else {
      menuPreference=value;
      try {localStorage.setItem('bpm-registry-menu',value);} catch (_) {}
    }
    menuPeekDismissed=value==='collapsed';
    activeSelect?.close();closeDate();closeAction();syncMenu();
  }
  function syncMenu() {
    const mobile=innerWidth<768, preference=effectiveMenuPreference();
    document.body.classList.toggle('menu-collapsed',menuIsCollapsed(innerWidth,preference));
    document.body.classList.toggle('menu-pinned',preference==='expanded');
    if(!mobile)closeMobile();
    else if(!topKpMode&&location.hash!=='#top-kp'&&preference==='expanded'&&previousMobile!==true)openMobile();
    previousMobile=mobile;
    setMenuPeek(false);
    $('sidebar').inert=mobile&&!document.body.classList.contains('mobile-menu-open');
  }
  function openMobile() {document.body.classList.add('mobile-menu-open');$('sidebar-backdrop').hidden=false;$('mobile-menu').setAttribute('aria-expanded','true');$('sidebar').inert=false;setMenuPeek(false);$('collapse-menu').focus({preventScroll:true});}
  function closeMobile(focus=false) {document.body.classList.remove('mobile-menu-open');$('sidebar-backdrop').hidden=true;$('mobile-menu').setAttribute('aria-expanded','false');$('sidebar').inert=innerWidth<768;setMenuPeek(false);if(focus)$('mobile-menu').focus();}
  $('mobile-menu').addEventListener('click',()=>{if(document.body.classList.contains('mobile-menu-open'))closeMobile(true);else{openMobile();$('collapse-menu').focus();}});
  $('sidebar-backdrop').addEventListener('click',()=>closeMobile(true));
  $('mobile-filters-toggle').addEventListener('click',()=>{const open=!document.body.classList.contains('mobile-filters-open');document.body.classList.toggle('mobile-filters-open',open);$('mobile-filters-toggle').setAttribute('aria-expanded',String(open));if(!open){activeSelect?.close();closeDate();}});
  $('collapse-menu').addEventListener('click',()=>{if(innerWidth<768){if(effectiveMenuPreference()==='expanded')setMenuPreference('collapsed');closeMobile(true);return;}if(document.body.classList.contains('menu-collapsed')){const open=!document.body.classList.contains('menu-peek');menuPeekDismissed=!open;setMenuPeek(open);}else setMenuPreference('collapsed');});
  $('pin-menu').addEventListener('click',()=>{setMenuPreference('expanded');if(innerWidth<768)openMobile();$('collapse-menu').focus({preventScroll:true});});
  $('sidebar').addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'&&!menuPeekDismissed)setMenuPeek(true);});
  $('sidebar').addEventListener('pointerleave',()=>{menuPeekDismissed=false;if(!keyboardMode||!$('sidebar').contains(document.activeElement))setMenuPeek(false);});
  $('sidebar').addEventListener('focusin',e=>{if(keyboardMode&&!menuPeekDismissed)setMenuPeek(true);});
  $('sidebar').addEventListener('focusout',e=>{if(!$('sidebar').contains(e.relatedTarget)){menuPeekDismissed=false;setMenuPeek(false);}});
  [['paths-nav','paths-submenu'],['gemba-nav','gemba-submenu']].forEach(([buttonId,menuId])=>{$(buttonId).addEventListener('click',()=>{if(innerWidth>=768&&document.body.classList.contains('menu-collapsed')&&!document.body.classList.contains('menu-peek')){menuPeekDismissed=false;setMenuPeek(true);return;}const open=$(buttonId).getAttribute('aria-expanded')!=='true';$(buttonId).setAttribute('aria-expanded',String(open));$(menuId).hidden=!open;$(buttonId).querySelector('.nav-chevron').src=`assets/chevron-${open?'up':'down'}.svg`;});});
  $('top-paths').addEventListener('click',e=>{e.preventDefault();navigateService('top-kp');});
  $('registry-nav').addEventListener('click',e=>{e.preventDefault();navigateRegistry(state.entity);});
  $('tasks-nav').addEventListener('click',e=>{e.preventDefault();navigateService('tasks');});
  $('insights-nav').addEventListener('click',e=>{e.preventDefault();navigateService('insights');});
  $('cabinet-nav').addEventListener('click',()=>navigateService('cabinet'));
  // Capture also supersedes the portable document's legacy brand-reload handler.
  document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();navigateService('cabinet');},true);
  document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();$('main').focus({preventScroll:true});$('main').scrollIntoView({block:'start'});});
  document.querySelectorAll('.nav-item').forEach(button=>button.setAttribute('aria-label',button.dataset.tooltip || button.textContent.trim()));
  document.querySelectorAll('[data-service]').forEach(button=>button.addEventListener('click',()=>toast(`«${button.dataset.service}» — раздел вне демонстрационного реестра.`)));
  $('notifications').addEventListener('click',()=>toast('Счётчик взят из макета. Сервис уведомлений не подключён.'));
  $('profile').innerHTML=window.BpmAvatars.portrait(window.BpmTaskStore.currentUser,'profile');
  $('profile').addEventListener('click',()=>toast('Демонстрационный профиль. Авторизация не подключена.'));
  document.addEventListener('pointerdown',e=>{keyboardMode=false;if(!$('sidebar').contains(e.target))setMenuPeek(false);if(activeSelect&&!activeSelect.host.contains(e.target)&&!activeSelect.popup?.contains(e.target))activeSelect.close();if(actionMenu&&!actionMenu.contains(e.target)&&!e.target.closest('[data-menu]'))closeAction();});
  document.addEventListener('focusin',e=>{if(activeSelect&&!activeSelect.host.contains(e.target)&&!activeSelect.popup?.contains(e.target))activeSelect.close();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Tab')keyboardMode=true;
    if(e.key==='Escape'){if(actionMenu){e.preventDefault();closeAction(true);}if(document.body.classList.contains('mobile-menu-open'))closeMobile(true);if(document.body.classList.contains('menu-peek')){menuPeekDismissed=true;setMenuPeek(false);$('collapse-menu').focus({preventScroll:true});}hideTooltip();}
    if(e.key==='Tab'&&document.body.classList.contains('mobile-menu-open')){const focusables=[...$('sidebar').querySelectorAll('button,a')].filter(el=>el.getClientRects().length);const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  let tooltipTarget=null;
  function hideTooltip(){
    if(tooltipTarget){const descriptions=(tooltipTarget.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!=='bpm-tooltip');if(descriptions.length)tooltipTarget.setAttribute('aria-describedby',descriptions.join(' '));else tooltipTarget.removeAttribute('aria-describedby');}
    tooltip?.remove();tooltip=null;tooltipTarget=null;
  }
  function showTooltip(target){
    hideTooltip();if(!target||target.closest('.sidebar')||document.querySelector('dialog[open]'))return;
    tooltipTarget=target;tooltip=document.createElement('div');tooltip.className='tooltip';tooltip.id='bpm-tooltip';tooltip.setAttribute('role','tooltip');tooltip.textContent=formatCopy(target.dataset.tooltip);
    if(target.hasAttribute('data-heading-full'))tooltip.classList.add('top-kp-heading-tooltip');
    document.body.append(tooltip);
    target.setAttribute('aria-describedby',`${target.getAttribute('aria-describedby')||''} bpm-tooltip`.trim());
    const r=target.getBoundingClientRect(),left=Math.max(8,Math.min(innerWidth-tooltip.offsetWidth-8,r.left+r.width/2-tooltip.offsetWidth/2)),above=r.top>tooltip.offsetHeight+12;
    tooltip.dataset.placement=above?'above':'below';tooltip.style.left=`${left}px`;
    tooltip.style.top=`${Math.max(8,Math.min(innerHeight-tooltip.offsetHeight-8,above?r.top-tooltip.offsetHeight-8:r.bottom+8))}px`;
    tooltip.style.setProperty('--tooltip-arrow-left',`${Math.max(12,Math.min(tooltip.offsetWidth-20,r.left+r.width/2-left-4))}px`);
  }
  document.addEventListener('mouseover',e=>{const target=e.target.closest('[data-tooltip]');if(target&&!target.contains(e.relatedTarget))showTooltip(target);});
  document.addEventListener('mouseout',e=>{const target=e.target.closest('[data-tooltip]');if(target&&!target.contains(e.relatedTarget))hideTooltip();});
  document.addEventListener('focusin',e=>showTooltip(e.target.closest('[data-tooltip]')));
  document.addEventListener('focusout',hideTooltip);
  document.addEventListener('scroll',e=>{hideTooltip();if(activeSelect&&e.target!==activeSelect.popup)positionPopup(activeSelect.popup,activeSelect.control,activeSelect.config.minPopupWidth??(activeSelect.config.multiple?300:260),activeSelect.config.placement);},true);
  window.addEventListener('resize',()=>{syncMenu();activeSelect?.close();closeAction();hideTooltip();});
  function openSharedDetail(){
    if(!location.hash||location.hash==='#cabinet'){setService('cabinet');return;}
    if(location.hash==='#tasks'){setService(true);return;}
    if(location.hash==='#insights'){setService('insights');return;}
    if(location.hash==='#top-kp'){setService('top-kp');return;}
    if(location.hash==='#main'){setService(false);return;}
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
    if(row.source==='top-kp'){
      setService('top-kp');
      openDetail(row,$('top-paths'));
      return;
    }
    if(tasksMode||cabinetMode||topKpMode||insightsMode)setService(false);
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
    detail:openDetail,copy:copyId,copyText,menu:openAction,
    onChange:info=>{if(structureMode){$('favorites').setAttribute('aria-pressed',String(info.favoritesOnly));$('favorite-count').textContent=info.favoritesCount;}}
  });
  window.BpmStructureToolbar.mount();
  tasks=window.BpmTasks.create({
    createSelect:(id,config)=>new BpmSelect(id,config),toast,createTask,
    closePopups:()=>{activeSelect?.close();closeDate();closeAction();hideTooltip();},
    openProcess:openTaskProcess
  });
  window.BpmTaskFlow.configure({createSelect:(id,config)=>new BpmSelect(id,config),toast,closePopups,openProcess:openTaskProcess,onBack:createTask,onCreated:task=>{
    navigateService('tasks');tasks.showCreated(task.id);toast('Задача создана',{success:true});
  }});
  window.BpmSpecialTaskFlow.configure({createSelect:(id,config)=>new BpmSelect(id,config),toast,closePopups,openProcess:openTaskProcess,onBack:createTask,onCreated:task=>{
    navigateService('tasks');tasks.showCreated(task.id);toast('Задача создана',{success:true});
  }});
  cabinet=window.BpmCabinet.create({
    toast,closePopups,openDetail,copyText,
    isFavorite:row=>state.favorites.has(row.id),toggleFavorite:favorite,
    openTasks:()=>navigateService('tasks'),navigateRegistry,createTask,
    openInsights:()=>navigateService('insights'),openInsight:(id,trigger)=>insights.openCabinetInsight(id,trigger),createInsight:trigger=>insights.openCreate(trigger)
  });
  topKp=window.BpmTopKp.create({openDetail,copyText,toast,closePopups,hideTooltip,createSelect:(id,config)=>new BpmSelect(id,config)});
  insights=window.BpmInsights.create({createSelect:(id,config)=>new BpmSelect(id,config),toast,copyText,closePopups,openProcess:openTaskProcess,
    openSection:()=>navigateService('insights'),
    createTask:({insightId,processId,trigger,takeInWork=false}) => {
      const insight=window.BpmInsightStore.get(insightId);
      const available=record=>record && (takeInWork ? window.BpmInsightWorkflow.canDecideTeam(record) : window.BpmInsightWorkflow.canonicalize(record.status)==='В работе');
      if(!available(insight)){toast(takeInWork?'Взятие инсайта в работу недоступно или решение уже принято.':'Создание задачи доступно только для инсайта в статусе «В работе».');return;}
      closePopups();window.BpmSpecialTaskFlow.open({typeId:'insight-work',mode:'create',insightId,processId,trigger,
        // Opening a form is not a decision. Check the latest record again before
        // creating a task, including changes arriving from another browser tab.
        beforeCreate:payload=>{
          if(payload.insightId!==insightId||!available(window.BpmInsightStore.get(insightId)))throw new Error('Состояние инсайта изменилось. Закройте форму и проверьте его состояние.');
        },
        onCreated:task=>{
          const latest=window.BpmInsightStore.get(insightId);
          if(!latest){toast('Задача создана, но связанный инсайт больше недоступен.');return;}
          try{
            const accepted=takeInWork && window.BpmInsightWorkflow.canDecideTeam(latest);
            if(!accepted && window.BpmInsightWorkflow.canonicalize(latest.status)!=='В работе'){
              // A late external decision must not be overwritten by the form.
              toast('Задача создана. Решение по инсайту изменилось в другой вкладке.');return;
            }
            const patch=accepted?window.BpmInsightWorkflow.decideTeam(latest,{decision:'accept',taskId:task.id}):{};
            const detail={...(patch.detail||latest.detail||{})};
            const linked=window.BpmTaskStore.list().filter(record=>record.insightId===insightId).map(record=>record.id);
            detail.taskIds=[...new Set([...(detail.taskIds||[]),...linked,task.id])];
            if(!accepted)detail.history=[{date:new Date().toLocaleDateString('ru-RU'),text:`Создана задача по инсайту: ${task.id}`},...(detail.history||[])];
            window.BpmInsightStore.update(insightId,{...patch,detail});
            insights.taskCreated(insightId,task.id);
            toast(accepted?'Задача создана. Инсайт взят в работу.':'Задача создана',{success:true});
          }catch(error){toast(error.message||'Не удалось связать созданную задачу с инсайтом.');}
        }
      });
    },
    openTask:(id,trigger) => {
      const task=window.BpmTaskStore.get(id);
      if(!task){toast('Задача не найдена в прототипе.');return;}
      closePopups();
      if(window.BpmSpecialTaskFlow.supports(task))window.BpmSpecialTaskFlow.open({mode:'view',taskId:id,trigger});
      else window.BpmTaskFlow.open({mode:'view',taskId:id,trigger});
    }
  });
  function closePopups(){activeSelect?.close();closeDate();closeAction();hideTooltip();}
  function openTaskProcess(id,trigger){const row=allRecords.find(record=>record.entity==='processes'&&record.id===id);if(row)openDetail(row,trigger);else toast('Деталка связанного процесса пока не представлена в данных.');}
  function closeServiceDialogs(){
    insights?.closeCabinetDrawer({immediate:true,restoreFocus:false});
    window.BpmTaskFlow.close({restoreFocus:false});
    window.BpmSpecialTaskFlow.close({restoreFocus:false});
    window.BpmProcessDrawer.close();window.BpmTaskDrawer.close({immediate:true,restoreFocus:false});
    document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  }
  function createTask(trigger){
    closePopups();
    const previousNotice=$('task-drawer')?.querySelector('.task-choice-notice');
    if(previousNotice){clearTimeout(previousNotice._hideTimer);previousNotice.hidden=true;}
    window.BpmTaskDrawer.open({trigger,closePopups,onChoose:({id,label})=>{
      if(id==='standard'){
        window.BpmTaskDrawer.close({immediate:true,restoreFocus:false});
        window.BpmTaskFlow.open({mode:'create',trigger});
        return;
      }
      window.BpmTaskDrawer.close({immediate:true,restoreFocus:false});
      window.BpmSpecialTaskFlow.open({typeId:id,mode:'create',trigger});
    }});
  }
  function focusMain(){window.scrollTo({top:0,behavior:'instant'});$('main').focus({preventScroll:true});}
  function navigateService(service){
    const hash=service==='registry'?'#main':`#${service}`;
    if(location.hash!==hash)history.pushState(null,'',hash);
    setService(service);focusMain();
  }
  function navigateRegistry(entity='paths'){
    setService(false);if(structureMode)setStructure(false);reset();
    changeEntity(entity==='processes'?'processes':'paths');
    navigateService('registry');
  }
  function setService(value){
    // Keep the original boolean registry/tasks callers compatible with sections.
    const service=value===true?'tasks':value===false?'registry':value;
    const previous=tasksMode?'tasks':cabinetMode?'cabinet':topKpMode?'top-kp':insightsMode?'insights':'registry';
    closePopups();closeMobile();closeServiceDialogs();
    if(service!==previous){
      if(previous==='registry'){
        resumeStructure=structureMode;if(structureMode)setStructure(false);
        clearTimeout(loadingTimer);isLoading=false;window.BpmCardVisuals.cancelCounters($('results'));
      }else if(previous==='tasks')tasks.leave();
      else if(previous==='cabinet')cabinet.leave();
      else if(previous==='insights')insights.leave();
      else topKp.leave();
      tasksMode=service==='tasks';cabinetMode=service==='cabinet';topKpMode=service==='top-kp';insightsMode=service==='insights';
      if(topKpMode||previous==='top-kp'){
        topKpMenuPreference=topKpMode?'collapsed':null;
        menuPeekDismissed=topKpMode;
        syncMenu();
      }
      $('registry-panel').hidden=service!=='registry';
      $('tasks-panel').hidden=!tasksMode;$('cabinet-panel').hidden=!cabinetMode;$('top-kp-panel').hidden=!topKpMode;$('insights-panel').hidden=!insightsMode;
      document.body.classList.remove('table-view');
      if(tasksMode)tasks.enter();
      else if(cabinetMode)cabinet.enter();
      else if(topKpMode)topKp.enter();
      else if(insightsMode)insights.enter();
      else if(resumeStructure){resumeStructure=false;setStructure(true);}
      else loadResults();
    }
    document.body.classList.toggle('tasks-mode',tasksMode);
    document.body.classList.toggle('cabinet-mode',cabinetMode);
    document.body.classList.toggle('top-kp-mode',topKpMode);
    document.body.classList.toggle('insights-mode',insightsMode);
    document.title=cabinetMode?'Мой кабинет — Sber BPM':tasksMode?'Задачи — Sber BPM':topKpMode?'ТОП-КП — Sber BPM':insightsMode?'Инсайты — Sber BPM':'Реестр КП и П — Sber BPM';
    $('main').setAttribute('aria-labelledby',cabinetMode?'cabinet-title':tasksMode?'tasks-title':topKpMode?'top-kp-title':insightsMode?'insights-title':'page-title');
    [['cabinet-nav',cabinetMode],['tasks-nav',tasksMode],['top-paths',topKpMode],['insights-nav',insightsMode],['registry-nav',!tasksMode&&!cabinetMode&&!topKpMode&&!insightsMode]].forEach(([id,current])=>{$(id).classList.toggle('current',current);if(current)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');});
  }
  $('structure-toggle').addEventListener('click',()=>setStructure(!structureMode));
  window.addEventListener('hashchange',()=>{openSharedDetail();if(!document.querySelector('dialog[open]'))focusMain();});
  syncMenu();loadResults();openSharedDetail();
})();

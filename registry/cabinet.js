/* Personal dashboard, composed from the existing Cards, Tabs, Dropdown,
 * Efficiency, Table/Empty and Drawer implementations. No server mutations. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asset = (name, shared=false) => {
    const path = `assets/${shared ? '' : 'cabinet/'}${name}.svg`;
    return window.BPMEmbeddedAsset ? window.BPMEmbeddedAsset(path) : path;
  };
  const img = (name, shared=false) => `<img src="${asset(name,shared)}" alt="" aria-hidden="true">`;
  const linkIcon = () => `<span class="cabinet-link-icon" aria-hidden="true">${img('link')}<span class="cabinet-link-layer">${img('link-shape')}</span></span>`;
  const labels = {insights:'Инсайты',tasks:'Мои задачи',paths:'Клиентские пути',processes:'Процессы',research:'Исследования',gemba:'Гемба'};
  const menus = {
    insights:[{key:'status',label:'По статусу',options:['Новый','В работе']},{key:'type',label:'По типу',options:['SberBPM','Голос территорий','ПроМнение','Гемба','Сбербуст']}],
    tasks:[{key:'date',label:'По дате создания',options:['сначала новые','сначала старые']},{key:'status',label:'По статусу',options:['Новая','На доработке']},{key:'type',label:'По типу задачи',options:['Комплаенс','Неприменимость метрик','Согласование варианта']}],
    entities:[{key:'efficiency',label:'По эффективности',options:['От низкой к высокой эффективности','От высокой к низкой эффективности','Без эффективности']},{key:'execution',label:'По статусу исполнения',options:['Исполняется','Приостановлен','Не исполняется']},{key:'status',label:'По статусу в реестре',options:['Подтверждён','Черновик','Черновик (изменён)','К архивации']},{key:'monitoring',label:'По статусу в мониторинге',options:['На мониторинге','Не на мониторинге']}]
  };
  const normalize = value => String(value ?? '').toLocaleLowerCase('ru').replace(/ё/g,'е');
  function create(api) {
    const root=document.getElementById('cabinet-panel'), data=window.BPM_CABINET_DATA;
    const cards=window.BpmCabinetCards;
    const state={query:'',taskTab:'incoming',filters:{insights:{},tasks:{date:'сначала новые'},paths:{},processes:{}},expanded:new Set()};
    let active=false,loading=false,timer,searchTimer,popup,anchor,tooltip,tipTimer,tipTrigger,suppressTipFocus=false,history=[],itemFavorites=new Set();
    try{const saved=JSON.parse(localStorage.getItem('bpm-cabinet-item-favorites'));if(Array.isArray(saved))itemFavorites=new Set(saved.filter(id=>[...data.tasks,...data.insights].some(row=>row.id===id)));}catch(_){}
    try{const saved=JSON.parse(localStorage.getItem('bpm-cabinet-searches'));if(Array.isArray(saved))history=saved.filter(x=>typeof x==='string').slice(0,6);}catch(_){}
    const rowById=id=>[...data.entities,...data.tasks,...data.insights].find(row=>row.id===id);
    function iconButton(action,key,icon,label,extra=''){
      return `<button type="button" class="cabinet-icon-button" id="cabinet-${action}-${key}" data-cabinet-${action}="${key}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${img(icon)}</button>`;
    }
    function header(key,count,{feed=false,soon=false}={}){
      const heading=`${labels[key]}${count === null ? '' : ` <span class="cabinet-count">${count}</span>`}`;
      return `<div class="cabinet-widget-header"><h2 id="cabinet-heading-${key}">${soon ? heading : `<button class="cabinet-heading-link" data-cabinet-nav="${key}" aria-label="Открыть раздел ${labels[key]}"><span>${heading}</span>${linkIcon()}</button>`}</h2><div class="cabinet-actions">${feed ? iconButton('create',key,'plus',key==='tasks'?'Создать задачу':'Создать инсайт') : ''}${iconButton('filter',key,'filter',`Фильтры: ${labels[key]}`,soon?'disabled':`aria-haspopup="menu" aria-expanded="false"`)}${feed ? iconButton('expand',key,'widget',state.expanded.has(key)?'Вернуть размер ленты':`Развернуть ленту: ${labels[key]}`,`aria-expanded="${state.expanded.has(key)}"`) : ''}</div></div>`;
    }
    function empty(key,filtered=false){
      const copy={
        insights:['Ваша лента инсайтов пока пуста','Дождитесь входящих инсайтов, либо создайте инсайт самостоятельно','Создать инсайт'],
        tasks:['Ваша лента задач пока пуста','Дождитесь входящих задач либо создайте задачу самостоятельно','Создать задачу'],
        paths:['Избранных Клиентских путей пока нет','Добавьте Клиентский путь в избранное','Добавить Клиентский путь'],
        processes:['Процессов пока нет','Добавьте Процесс в избранное','Добавить процесс']
      }[key];
      return `<div class="cabinet-empty">${img('empty')}<p class="cabinet-empty-title">${filtered?'По выбранным условиям ничего не найдено':copy[0]}</p><p class="cabinet-empty-description">${filtered?'Измените фильтры или поисковый запрос.':copy[1]}</p><button class="text-button" data-cabinet-${filtered?'reset':key==='tasks'||key==='insights'?'create':'nav'}="${key}">${filtered?'Сбросить фильтры':copy[2]}${filtered?'':img('plus')}</button></div>`;
    }
    function matchesQuery(row){return !state.query || normalize([row.title,row.code,row.id,row.description,row.owner,row.initiator].join(' ')).includes(normalize(state.query));}
    function filtered(key){
      const f=state.filters[key];
      let rows=(key==='insights'?data.insights:key==='tasks'?data.tasks.filter(row=>row[state.taskTab]):data.entities.filter(row=>row.entity===key)).filter(matchesQuery);
      rows=rows.filter(row=>{
        if(f.status && (row.filterStatus||row.status)!==f.status)return false;
        if(f.type && (key==='insights'?row.source:row.filterType)!==f.type)return false;
        if(f.execution && row.executionStatus!==f.execution)return false;
        if(f.monitoring && row.monitoring!==(f.monitoring==='На мониторинге'))return false;
        if(f.efficiency==='Без эффективности' && row.efficiency!==null)return false;
        return true;
      });
      if(f.efficiency && f.efficiency!=='Без эффективности')rows.sort((a,b)=>(f.efficiency==='От низкой к высокой эффективности'?1:-1)*((a.efficiency??-1)-(b.efficiency??-1)));
      if(f.date)rows.sort((a,b)=>(f.date==='сначала новые'?-1:1)*a.created.localeCompare(b.created));
      return rows;
    }
    function feed(key){
      const rows=filtered(key), tasks=key==='tasks';
      const body=loading?Array.from({length:3},()=>cards.skeleton(key)).join(''):rows.map(row=>tasks?cards.task(row):cards.insight(row)).join('')||empty(key,!!state.query||Object.keys(state.filters[key]).length>0);
      const tabs=tasks?`<div class="cabinet-task-tabs"><div class="entity-tabs" role="tablist" aria-label="Направление задач">${['incoming','outgoing'].map(tab=>`<button id="cabinet-tab-${tab}" type="button" role="tab" data-cabinet-tab="${tab}" class="${state.taskTab===tab?'active':''}" aria-selected="${state.taskTab===tab}" aria-controls="cabinet-feed-tasks" tabindex="${state.taskTab===tab?0:-1}">${tab==='incoming'?'Входящие':'Исходящие'} ${data.tasks.filter(row=>row[tab]).length}</button>`).join('')}</div></div>`:'';
      return `<section class="cabinet-widget cabinet-feed-widget${tasks?' cabinet-task-widget':''}${state.expanded.has(key)?' is-expanded':''}" data-cabinet-section="${key}" aria-labelledby="cabinet-heading-${key}">${header(key,tasks?data.tasks.length:rows.length,{feed:true})}${tabs}<div class="cabinet-feed" id="cabinet-feed-${key}" ${tasks?`role="tabpanel" aria-labelledby="cabinet-tab-${state.taskTab}"`:`role="region" aria-label="Лента инсайтов"`} tabindex="0" aria-busy="${loading}">${body}</div></section>`;
    }
    function entitySection(key){
      const rows=filtered(key);
      return `<section class="cabinet-widget cabinet-entity-widget" data-cabinet-section="${key}" aria-labelledby="cabinet-heading-${key}">${header(key,rows.length)}<div class="cabinet-entity-grid" aria-busy="${loading}" aria-label="${labels[key]}">${loading?Array.from({length:key==='paths'?4:3},()=>cards.skeleton('entity')).join(''):rows.map(row=>cards.entity({...row,favorite:api.isFavorite(row)})).join('')||empty(key,!!state.query||Object.keys(state.filters[key]).length>0)}</div></section>`;
    }
    function soon(key){
      return `<section class="cabinet-widget cabinet-soon" data-cabinet-section="${key}" aria-labelledby="cabinet-heading-${key}">${header(key,null,{soon:true})}<div class="cabinet-empty">${img('soon')}<p class="cabinet-empty-title">${key==='research'?'Исследования LeanLab — скоро на главной!':'Gemba — скоро на главной!'}</p><p class="cabinet-empty-description">${key==='research'?'Мы работаем над разработкой раздела по исследованиям. В скором времени здесь появятся первые отчёты об исследованиях Lean Lab':'Мы работаем над разработкой раздела Gemba! В скором времени здесь появятся первые отчёты о проводимых Gemba'}</p></div></section>`;
    }
    function render({animate=false}={}){
      if(!active)return;
      window.BpmCardVisuals.cancelCounters(root);
      const scrolls=[...root.querySelectorAll('.cabinet-feed,.cabinet-entity-grid')].map(el=>[el.closest('[data-cabinet-section]').dataset.cabinetSection,el.scrollTop]);
      // Stable section order, regardless of which feed was expanded first.
      const expanded=['insights','tasks'].filter(key=>state.expanded.has(key));
      root.innerHTML=`<h1 id="cabinet-title" class="sr-only">Мой кабинет</h1><div class="cabinet-layout"${expanded.length?` data-expanded="${expanded.join(' ')}" data-expanded-count="${expanded.length}"`:''}><div class="cabinet-left">${feed('insights')}${feed('tasks')}</div><div class="cabinet-right">${entitySection('paths')}${entitySection('processes')}${soon('research')}${soon('gemba')}</div></div>`;
      scrolls.forEach(([key,top])=>{const el=root.querySelector(`[data-cabinet-section="${key}"] .cabinet-feed,[data-cabinet-section="${key}"] .cabinet-entity-grid`);if(el)el.scrollTop=top;});
      Object.entries(state.filters).forEach(([key,f])=>{const filtered=Object.entries(f).some(([name,value])=>value&&!(name==='date'&&value==='сначала новые'));root.querySelector(`#cabinet-filter-${key}`)?.classList.toggle('has-filter',filtered);});
      if(!loading&&animate)window.BpmCardVisuals.animateCounters(root);
    }
    function closePopup(focus=false){
      const previous=anchor;popup?.remove();popup=null;anchor=null;previous?.setAttribute('aria-expanded','false');if(focus&&previous?.isConnected)previous.focus({preventScroll:true});
    }
    function placePopup(){
      if(!popup||!anchor?.isConnected)return;
      const rect=anchor.getBoundingClientRect(),width=Math.min(popup.classList.contains('cabinet-context')?300:329,innerWidth-24);
      popup.style.width=`${width}px`;popup.style.left=`${Math.max(12,Math.min(rect.right-width,innerWidth-width-12))}px`;
      const below=innerHeight-rect.bottom-20,above=rect.top-20,useAbove=below<220&&above>below;
      popup.style.maxHeight=`${Math.min(826,Math.max(120,useAbove?above:below))}px`;
      popup.style.top=`${useAbove?Math.max(12,rect.top-popup.offsetHeight-8):rect.bottom+8}px`;
    }
    function makePopup(trigger,label,className=''){
      api.closePopups();closePopup();hideTip();anchor=trigger;anchor.setAttribute('aria-expanded','true');
      popup=document.createElement('div');popup.className=`select-popup cabinet-menu ${className}`;popup.setAttribute('role','menu');popup.setAttribute('aria-label',label);document.body.append(popup);
      popup.addEventListener('keydown',event=>{
        const items=[...popup.querySelectorAll('button:not(:disabled)')],index=items.indexOf(document.activeElement);
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const target=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[target]?.focus();}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePopup(true);}
        if(event.key==='Tab')closePopup();
      });
      return popup;
    }
    function showFilter(key,trigger){
      if(popup&&anchor===trigger){closePopup();return;}
      const menu=makePopup(trigger,`Фильтры: ${labels[key]}`),groups=menus[key]||menus.entities;
      const draw=()=>{menu.innerHTML=groups.map(group=>`<div role="group" aria-label="${group.label}"><div class="cabinet-menu-group">${group.label}</div>${group.options.map(option=>`<button class="select-option" type="button" role="menuitemradio" aria-checked="${state.filters[key][group.key]===option}" data-group="${group.key}" data-value="${esc(option)}"><span class="option-label">${esc(option)}</span>${state.filters[key][group.key]===option?`<span class="selected-tick">${img('tick')}</span>`:''}</button>`).join('')}</div>`).join('')+`<button type="button" class="select-option cabinet-menu-reset" role="menuitem" data-clear>Сбросить фильтры</button>`;};
      draw();placePopup();menu.querySelector('button')?.focus({preventScroll:true});
      menu.addEventListener('click',event=>{
        const button=event.target.closest('button');if(!button)return;
        const top=menu.scrollTop;
        if(button.hasAttribute('data-clear'))state.filters[key]={};
        else{const group=button.dataset.group,value=button.dataset.value;if(state.filters[key][group]===value)delete state.filters[key][group];else state.filters[key][group]=value;}
        render();anchor=root.querySelector(`#cabinet-filter-${key}`);anchor.setAttribute('aria-expanded','true');draw();placePopup();menu.scrollTop=top;
        const next=[...menu.querySelectorAll('button')].find(x=>x.dataset.value===button.dataset.value&&x.dataset.group===button.dataset.group);next?.focus({preventScroll:true});
        document.getElementById('result-announcement').textContent=`${labels[key]}: найдено ${filtered(key).length}`;
      });
    }
    function showContext(row,trigger){
      const menu=makePopup(trigger,'Действия с карточкой','cabinet-context'),favorite=row.entity?api.isFavorite(row):itemFavorites.has(row.id);
      menu.innerHTML=`<button type="button" class="select-option" role="menuitem">${img(favorite?'liked':'dont-like',true)}<span>${favorite?'Удалить из избранных':'Добавить в избранное'}</span></button>`;
      menu.querySelector('button').addEventListener('click',()=>{closePopup();if(row.entity)api.toggleFavorite(row);else{if(favorite)itemFavorites.delete(row.id);else itemFavorites.add(row.id);try{localStorage.setItem('bpm-cabinet-item-favorites',JSON.stringify([...itemFavorites]));}catch(_){}api.toast(favorite?'Удалено из избранного':'Добавлено в избранное');}root.querySelector(`[data-cabinet-menu="${row.id}"]`)?.focus({preventScroll:true});});placePopup();menu.querySelector('button').focus();
    }
    function hideTip(restoreFocus=false){const previous=tipTrigger,previousTip=tooltip;clearTimeout(tipTimer);tooltip=null;tipTrigger=null;previousTip?.remove();root.querySelectorAll('[aria-describedby="cabinet-efficiency-tip"]').forEach(el=>el.removeAttribute('aria-describedby'));if(restoreFocus&&previous?.isConnected){suppressTipFocus=true;previous.focus({preventScroll:true});suppressTipFocus=false;}}
    function showTip(row,trigger,interactive=false){
      if(loading||!row)return;hideTip();tipTrigger=trigger;tooltip=document.createElement('div');tooltip.className='cabinet-efficiency-tip';tooltip.id='cabinet-efficiency-tip';tooltip.setAttribute('role',interactive?'dialog':'tooltip');if(interactive)tooltip.setAttribute('aria-label','Эффективность и динамика');
      tooltip.innerHTML=`<h3>Эффективность и динамика</h3><p>АВГ: ${esc(String(row.efficiency).replace('.',','))}% +1 пп ↑ (текущая)</p><p>ИЮН: 42% −1 пп ↓</p><p>МАЙ: 42% +7 пп ↑</p><p>АПР: 35% −4 пп ↓</p><p>МАР: 39% −1 пп ↓</p><button type="button">Подробнее</button>`;
      document.body.append(tooltip);trigger.setAttribute('aria-describedby',tooltip.id);
      const rect=trigger.getBoundingClientRect(),width=tooltip.offsetWidth,height=tooltip.offsetHeight;
      if(rect.left>width+20){tooltip.style.left=`${rect.left-width-12}px`;tooltip.style.top=`${Math.max(12,Math.min(rect.top+rect.height/2-height/2,innerHeight-height-12))}px`;}
      else{tooltip.classList.add('is-below');tooltip.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-width-12))}px`;tooltip.style.top=`${Math.max(12,Math.min(rect.bottom+12,innerHeight-height-12))}px`;}
      tooltip.addEventListener('pointerenter',()=>clearTimeout(tipTimer));tooltip.addEventListener('pointerleave',()=>{if(!tooltip?.contains(document.activeElement))tipTimer=setTimeout(hideTip,150);});
      tooltip.addEventListener('focusout',event=>{if(!tooltip?.contains(event.relatedTarget)&&event.relatedTarget!==tipTrigger)hideTip();});
      tooltip.querySelector('button').addEventListener('click',()=>{hideTip();api.openDetail(row,trigger);});
      if(interactive)tooltip.querySelector('button').focus({preventScroll:true});
    }
    function navigate(key){closePopup();hideTip();if(key==='tasks')api.openTasks();else if(key==='paths'||key==='processes')api.navigateRegistry(key);else api.toast('Реестр инсайтов ещё не подключён к прототипу.');}
    root.addEventListener('click',event=>{
      const button=event.target.closest('button,[data-cabinet-open]');if(!button)return;
      const d=button.dataset;
      if(d.cabinetRelated){api.toast('Связанные элементы инсайта пока не подключены к прототипу.');return;}
      if(d.cabinetFilter){showFilter(d.cabinetFilter,button);return;}
      if(d.cabinetNav){navigate(d.cabinetNav);return;}
      if(d.cabinetCreate){closePopup();if(d.cabinetCreate==='tasks')api.createTask(button);else api.toast('Создание инсайта будет доступно после добавления макета формы.');return;}
      if(d.cabinetExpand){
        closePopup();
        if(state.expanded.has(d.cabinetExpand))state.expanded.delete(d.cabinetExpand);
        else state.expanded.add(d.cabinetExpand);
        render();
        root.querySelector(`#cabinet-expand-${d.cabinetExpand}`)?.focus({preventScroll:true});
        return;
      }
      if(d.cabinetTab){state.taskTab=d.cabinetTab;render();root.querySelector(`#cabinet-tab-${state.taskTab}`)?.focus({preventScroll:true});return;}
      if(d.cabinetReset){state.filters[d.cabinetReset]={};state.query='';search.value='';render();root.querySelector(`#cabinet-filter-${d.cabinetReset}`)?.focus();return;}
      const copy=d.cabinetCopy||d.taskCopy;if(copy){api.copyText(copy);return;}
      const row=rowById(d.cabinetMenu||d.cabinetEfficiency||d.cabinetOpen||d.taskId);
      if(!row)return;
      if(d.cabinetMenu){showContext(row,button);return;}
      if(d.cabinetEfficiency){showTip(row,button,true);return;}
      if(row.kind==='tasks'){api.openTasks();return;}
      if(row.kind==='insights'){api.toast('Деталка инсайта пока не добавлена в прототип.');return;}
      hideTip();api.openDetail(row,button);
    });
    root.addEventListener('keydown',event=>{
      const tab=event.target.closest('[data-cabinet-tab]');if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();state.taskTab=event.key==='Home'?'incoming':event.key==='End'?'outgoing':state.taskTab==='incoming'?'outgoing':'incoming';render();root.querySelector(`#cabinet-tab-${state.taskTab}`)?.focus();}
    });
    root.addEventListener('pointerover',event=>{const el=event.target.closest('[data-cabinet-efficiency]');if(el&&!el.contains(event.relatedTarget)){const row=rowById(el.dataset.cabinetEfficiency);if(row)showTip(row,el);}});
    root.addEventListener('pointerout',event=>{const el=event.target.closest('[data-cabinet-efficiency]');if(el&&!el.contains(event.relatedTarget)&&!tooltip?.contains(document.activeElement))tipTimer=setTimeout(hideTip,150);});
    root.addEventListener('focusin',event=>{const el=event.target.closest('[data-cabinet-efficiency]');if(el&&!suppressTipFocus)showTip(rowById(el.dataset.cabinetEfficiency),el);});
    root.addEventListener('focusout',event=>{if(!tooltip?.contains(event.relatedTarget))hideTip();});
    document.addEventListener('pointerdown',event=>{if(popup&&!popup.contains(event.target)&&!anchor?.contains(event.target))closePopup();if(tooltip&&!tooltip.contains(event.target)&&!event.target.closest('[data-cabinet-efficiency]'))hideTip();});
    document.addEventListener('keydown',event=>{if(active&&event.key==='Escape'){closePopup(true);hideTip(true);}});
    window.addEventListener('resize',()=>{if(active){closePopup();hideTip();}});
    document.addEventListener('scroll',event=>{if(active&&event.target!==popup&&!popup?.contains(event.target)){placePopup();hideTip();}},true);
    const searchWrap=document.createElement('div');searchWrap.className='field search-field cabinet-header-search';searchWrap.innerHTML=`${img('search',true)}<input type="search" id="cabinet-search" aria-label="Поиск в моём кабинете" placeholder="Поиск ID, названия, процесса, имени…" autocomplete="off"><button type="button" class="small-icon" id="cabinet-search-history" aria-label="История поиска" aria-haspopup="menu" aria-expanded="false">${img('history')}</button>`;
    document.querySelector('.header-actions').before(searchWrap);const search=searchWrap.querySelector('input');
    search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=search.value.trim();closePopup();render();},120);});
    function saveSearch(){const q=search.value.trim();if(!q)return;history=[q,...history.filter(x=>x!==q)].slice(0,6);try{localStorage.setItem('bpm-cabinet-searches',JSON.stringify(history));}catch(_){}}
    search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveSearch();}});search.addEventListener('change',saveSearch);
    searchWrap.querySelector('button').addEventListener('click',event=>{
      const trigger=event.currentTarget;if(anchor===trigger){closePopup();return;}const menu=makePopup(trigger,'История поиска','cabinet-history');
      menu.innerHTML=history.length?history.map((q,i)=>`<button class="select-option" role="menuitem" data-query-index="${i}">${esc(q)}</button>`).join(''):'<p class="popup-empty">История поиска пока пуста</p>';
      menu.addEventListener('click',e=>{const button=e.target.closest('[data-query-index]');if(button){search.value=history[Number(button.dataset.queryIndex)];state.query=search.value;closePopup();render();search.focus();}});placePopup();menu.querySelector('button')?.focus();
    });
    const whatsNew=document.createElement('button');whatsNew.className='button cabinet-whats-new';whatsNew.innerHTML=`${img('tick',true)}Что нового?`;whatsNew.addEventListener('click',()=>api.toast('В прототип добавлен «Мой кабинет»: инсайты, задачи, КП и процессы.'));document.getElementById('profile').before(whatsNew);
    return Object.freeze({
      enter(){active=true;root.hidden=false;loading=true;render();clearTimeout(timer);timer=setTimeout(()=>{if(!active)return;loading=false;render({animate:true});document.getElementById('result-announcement').textContent='Мой кабинет загружен';},2000);},
      leave(){active=false;loading=false;clearTimeout(timer);clearTimeout(searchTimer);closePopup();hideTip();window.BpmCardVisuals.cancelCounters(root);root.hidden=true;},
      refresh(){render();}
    });
  }
  window.BpmCabinet=Object.freeze({create});
})();

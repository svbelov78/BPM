/* Tasks 1102:2: independent registry controller; shared select/calendar/menu components. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const img=(name,base='assets')=>`<img src="${base}/${name}.svg" alt="">`;
  const date=value=>value?value.slice(0,10).split('-').reverse().join('.'):'Любая';
  const normalized=value=>String(value).toLocaleLowerCase('ru').replace(/ё/g,'е');
  const collator=new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
  const labels={block:'Блоки',division:'Структурные подразделения',status:'Статусы',type:'Типы задач',initiator:'Инициаторы',assignees:'Исполнители'};
  const sorts=[['created','По дате создания'],['processTitle','По процессам'],['title','По задачам (Тип, ID)'],['status','По статусу'],['deadline','По сроку задачи'],['assignees','По ответственным'],['initiator','По инициаторам']];
  function create(api){
    const data=window.BPM_TASK_DATA||[],panel=$('tasks-panel');
    const state={view:'table',tab:'incoming',query:'',filters:Object.fromEntries(Object.keys(labels).map(key=>[key,[]])),from:'',to:'',page:1,size:50,sorts:{cards:{key:'created',dir:'desc'},table:{key:'title',dir:'asc'}}};
    let active=false,loading=false,timer,calendar=null;
    const selects={};
    panel.innerHTML=`<div class="title-row"><h1 id="tasks-title">Задачи <span class="tasks-count" id="tasks-count"></span><button class="tasks-completed" id="tasks-completed" data-tooltip="Показать завершённые задачи"></button></h1><div class="view-controls" role="group" aria-label="Вид реестра задач"><button id="tasks-export" class="icon-button" aria-label="Экспортировать задачи" data-tooltip="Экспорт">${img('download')}</button><button id="tasks-table" class="icon-button selected" aria-label="Табличный вид задач" aria-pressed="true" data-tooltip="Таблица">${img('table')}</button><button id="tasks-cards" class="icon-button" aria-label="Карточный вид задач" aria-pressed="false" data-tooltip="Карточки">${img('cards')}</button></div></div>
      <div class="tasks-filters"><div class="tasks-primary"><button id="tasks-create" class="button primary-button tasks-create">${img('plus-white','assets/tasks')}Создать задачу</button><div class="field search-field tasks-search"><input id="tasks-search" type="search" aria-label="Поиск задач по ID, названию, процессу, ответственному или инициатору" placeholder="Введите ID, название, процесс, ответственный, инициатор…" autocomplete="off"><button id="tasks-clear-search" class="small-icon" aria-label="Очистить поиск задач" hidden>${img('close')}</button>${img('search')}</div><div class="tasks-tabs" role="group" aria-label="Направление задач"><button data-task-tab="incoming" aria-pressed="true">Входящие <span>${data.filter(r=>r.incoming).length}</span></button><button data-task-tab="outgoing" aria-pressed="false">Исходящие <span>${data.filter(r=>r.outgoing).length}</span></button><button data-task-tab="all" aria-pressed="false">Все</button></div><div id="tasks-sort" class="select-host" hidden></div></div><div class="tasks-fields">${Object.keys(labels).map(key=>`<div id="tasks-${key}" class="select-host"></div>`).join('')}<button id="tasks-date" class="field tasks-date" aria-expanded="false" aria-haspopup="dialog"><span class="field-content"><span class="internal-label">Срок задач</span><span class="single-value" id="tasks-date-summary">Все</span></span>${img('calendar')}</button></div></div>
      <section class="applied-filters" id="tasks-selected" aria-label="Применённые фильтры задач" hidden><div class="applied-filter-groups" id="tasks-chips"></div><button class="clear-all-filters" id="tasks-reset" aria-label="Сбросить все фильтры задач">${img('close')}</button></section><div id="tasks-results" aria-label="Результаты реестра задач"></div><div class="pagination" id="tasks-pagination" hidden><div id="tasks-size" class="select-host"></div><nav id="tasks-pages" aria-label="Страницы задач"></nav><span class="page-range" id="tasks-range"></span></div><div id="tasks-announcement" class="sr-only" role="status" aria-live="polite"></div>`;
    const exportDialog=document.createElement('dialog');exportDialog.id='task-export-dialog';exportDialog.className='modal task-export';exportDialog.setAttribute('aria-labelledby','task-export-title');
    exportDialog.innerHTML=`<form id="task-export-form"><div class="modal-heading"><h2 id="task-export-title">Экспорт задач</h2><button type="button" class="icon-button" data-task-export-close aria-label="Закрыть экспорт задач">${img('close')}</button></div><div class="task-export-scopes"><label class="radio-row"><input type="radio" name="task-export-scope" value="all" checked>Все задачи</label><label class="radio-row"><input type="radio" name="task-export-scope" value="filtered">Выбранные параметры</label></div><div class="task-export-divider"></div><h2>Экспорт вариантов результата процесса</h2><label class="radio-row task-export-variants"><input type="radio" name="task-export-scope" value="variants">Все варианты</label><div class="modal-actions"><button type="button" class="button secondary-button" data-task-export-close>Отмена</button><button class="button primary-button" type="submit">Скачать</button></div></form>`;
    document.body.append(exportDialog);
    function closeDate(focus=false){const old=calendar;calendar=null;old?.close(focus);}
    function closePopups(){closeDate();api.closePopups();}
    function choices(key){return [...new Set(data.flatMap(row=>Array.isArray(row[key])?row[key]:[row[key]]))].sort(collator.compare).map(value=>({value,label:value}));}
    Object.keys(labels).forEach(key=>{selects[key]=api.createSelect(`tasks-${key}`,{label:labels[key],multiple:true,options:choices(key),onChange:values=>{state.filters[key]=[...values];changed();}});});
    selects.sort=api.createSelect('tasks-sort',{label:'Сортировка',allowAll:false,icon:'sort',minPopupWidth:300,valueLabel:key=>({created:'Создано',processTitle:'Процесс',title:'Тип, ID',status:'Статус',deadline:'Срок задачи',assignees:'Ответственные',initiator:'Инициатор'}[key]),options:sorts.map(([value,label])=>({value,label})),values:['created'],onChange:values=>{state.sorts.cards={key:values[0],dir:values[0]==='created'?'desc':'asc'};state.page=1;render();}});
    selects.size=api.createSelect('tasks-size',{label:'Показывать',allowAll:false,options:[25,50,75,100].map(n=>({value:String(n),label:String(n)})),values:['50'],onChange:values=>{state.size=Number(values[0]);changed();}});
    function filterRows(){
      const query=normalized(state.query.trim());
      const filtered=data.filter(row=>(state.tab==='all'||row[state.tab])&&(!query||normalized([row.id,row.title,row.description,row.processCode,row.processTitle,row.initiator,...row.assignees].join(' ')).includes(query))&&Object.entries(state.filters).every(([key,values])=>!values.length||values.some(value=>Array.isArray(row[key])?row[key].includes(value):row[key]===value))&&(!state.from||row.deadline>=state.from)&&(!state.to||row.deadline<=state.to));
      const {key,dir}=state.sorts[state.view];
      return filtered.sort((a,b)=>{const va=key==='title'?`${a.type} ${a.id}`:Array.isArray(a[key])?a[key].join(', '):a[key];const vb=key==='title'?`${b.type} ${b.id}`:Array.isArray(b[key])?b[key].join(', '):b[key];return collator.compare(va||'',vb||'')*(dir==='desc'?-1:1)||a.number-b.number;});
    }
    function empty(){return `<div class="tasks-empty">${img('empty','assets/tasks')}<p>Ваша лента задач пока пуста</p><small>Дождитесь входящих задач либо создайте задачу самостоятельно</small><button class="button" data-task-create>Создать задачу${img('plus-blue','assets/tasks')}</button></div>`;}
    function selectedFilters(){
      const groups=Object.entries(state.filters).filter(([,values])=>values.length).map(([key,values])=>({key,label:labels[key],values}));
      if(state.query.trim())groups.unshift({key:'query',label:'Поиск',values:[state.query]});
      if(state.from||state.to)groups.push({key:'date',label:'Срок задач',values:[`${date(state.from)} → ${date(state.to)}`]});
      $('tasks-selected').hidden=!groups.length;
      $('tasks-chips').innerHTML=groups.map(g=>`<div class="applied-filter-group"><span class="applied-filter-label">${esc(g.label)}</span>${g.values.map(v=>`<span class="chip applied-filter-chip" title="${esc(v)}"><span class="chip-text">${esc(v)}</span><button data-task-filter-key="${g.key}" data-task-filter-value="${esc(v)}" aria-label="Убрать фильтр: ${esc(v)}">${img('close-16')}</button></span>`).join('')}</div>`).join('');
    }
    function render(){
      if(!active)return;
      const rows=filterRows(),pageSize=rows.length<=50?50:state.size,pages=Math.max(1,Math.ceil(rows.length/pageSize));state.page=Math.min(state.page,pages);
      const page=rows.slice((state.page-1)*pageSize,state.page*pageSize),results=$('tasks-results'),scroll=results.querySelector('.table-scroll')?.scrollLeft||0;
      const focusedSort=results.contains(document.activeElement)?document.activeElement.closest('[data-task-sort]')?.dataset.taskSort:null;
      results.setAttribute('aria-busy',String(loading));
      const visual=window.BpmTaskVisuals;
      if(state.view==='table'){
        results.innerHTML=visual.table(loading?(page.length?page:data.slice(0,5)):page,{sortKey:state.sorts.table.key,sortDir:state.sorts.table.dir,loading});
        if(!loading&&!rows.length){const tbody=results.querySelector('tbody');if(tbody)tbody.innerHTML=`<tr class="tasks-table-empty"><td colspan="7" style="padding:0;height:auto">${empty()}</td></tr>`;}
      }else results.innerHTML=loading?`<div class="tasks-grid">${Array.from({length:page.length||4},()=>visual.skeletonCard()).join('')}</div>`:page.length?`<div class="tasks-grid">${page.map(visual.card).join('')}</div>`:empty();
      const scroller=results.querySelector('.table-scroll');if(scroller)scroller.scrollLeft=scroll;
      if(focusedSort)results.querySelector(`[data-task-sort="${focusedSort}"]`)?.focus({preventScroll:true});
      $('tasks-count').textContent=data.filter(r=>r.status!=='Завершено').length;
      const completed=data.filter(r=>r.status==='Завершено').length;$('tasks-completed').textContent=`+${completed} завершенные`;
      $('tasks-completed').hidden=!completed;
      $('tasks-sort').hidden=state.view==='table';
      ['table','cards'].forEach(view=>{$(`tasks-${view}`).setAttribute('aria-pressed',String(view===state.view));$(`tasks-${view}`).classList.toggle('selected',view===state.view);});
      panel.querySelectorAll('[data-task-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.taskTab===state.tab)));
      $('tasks-clear-search').hidden=!state.query;
      $('tasks-date-summary').textContent=state.from||state.to?`${date(state.from)} → ${date(state.to)}`:'Все';
      selectedFilters();
      $('tasks-pagination').hidden=rows.length<=50;
      $('tasks-range').textContent=rows.length?`${(state.page-1)*pageSize+1}–${Math.min(state.page*pageSize,rows.length)} из ${rows.length}`:'';
      $('tasks-pages').innerHTML=pages<=1?'':`<button class="page-button" data-task-page="${state.page-1}" aria-label="Предыдущая страница задач" ${state.page===1?'disabled':''}>${img('chevron-left')}</button>`+Array.from({length:pages},(_,i)=>i+1).filter(n=>n===1||n===pages||Math.abs(n-state.page)<=1).map((n,i,list)=>(i&&n-list[i-1]>1?'<span class="page-button">…</span>':'')+`<button class="page-button${n===state.page?' active':''}" data-task-page="${n}" ${n===state.page?'aria-current="page"':''}>${n}</button>`).join('')+`<button class="page-button" data-task-page="${state.page+1}" aria-label="Следующая страница задач" ${state.page===pages?'disabled':''}>${img('chevron-right')}</button>`;
      $('tasks-announcement').textContent=loading?'Загрузка задач…':`Найдено задач: ${rows.length}.`;
    }
    function load(){clearTimeout(timer);if(!active)return;loading=true;render();timer=setTimeout(()=>{if(!active)return;loading=false;render();},2000);}
    function changed(){state.page=1;load();}
    function reset(){state.query='';$('tasks-search').value='';state.from='';state.to='';Object.keys(labels).forEach(key=>{state.filters[key]=[];selects[key].set([]);});changed();}
    function chooseType(trigger){closePopups();const previousNotice=$('task-drawer')?.querySelector('.task-choice-notice');if(previousNotice){clearTimeout(previousNotice._hideTimer);previousNotice.hidden=true;}window.BpmTaskDrawer.open({trigger,closePopups,onChoose:({label})=>{
      const dialog=$('task-drawer');let note=dialog?.querySelector('.task-choice-notice');if(!note&&dialog){note=document.createElement('div');note.className='toast task-choice-notice';note.setAttribute('role','status');dialog.append(note);}if(note){note.textContent=`Выбран тип «${label}». Форма создания будет добавлена после получения макета.`;note.hidden=false;clearTimeout(note._hideTimer);note._hideTimer=setTimeout(()=>{note.hidden=true;},4500);}
    }});}
    async function copy(value){try{await navigator.clipboard.writeText(value);api.toast(`Скопировано: ${value}`);}catch(_){const el=document.createElement('textarea');el.value=value;el.style.cssText='position:fixed;opacity:0';document.body.append(el);el.select();const ok=document.execCommand('copy');el.remove();api.toast(ok?`Скопировано: ${value}`:`ID: ${value}`);}}
    panel.addEventListener('click',e=>{
      const createButton=e.target.closest('#tasks-create,[data-task-create]');if(createButton){chooseType(createButton);return;}
      const tab=e.target.closest('[data-task-tab]');if(tab&&tab.dataset.taskTab!==state.tab){closePopups();state.tab=tab.dataset.taskTab;changed();return;}
      const sort=e.target.closest('[data-task-sort]');if(sort){const key=sort.dataset.taskSort,old=state.sorts.table;state.sorts.table={key,dir:old.key===key&&old.dir==='asc'?'desc':'asc'};render();return;}
      const copyButton=e.target.closest('[data-task-copy]');if(copyButton){copy(copyButton.dataset.taskCopy);return;}
      const process=e.target.closest('[data-task-process]');if(process){closePopups();api.openProcess(process.dataset.taskProcess,process);return;}
      const chip=e.target.closest('[data-task-filter-key]');if(chip){const key=chip.dataset.taskFilterKey;if(key==='query'){state.query='';$('tasks-search').value='';}else if(key==='date'){state.from='';state.to='';}else{state.filters[key]=state.filters[key].filter(v=>v!==chip.dataset.taskFilterValue);selects[key].set(state.filters[key]);}changed();$('tasks-search').focus({preventScroll:true});return;}
      const page=e.target.closest('[data-task-page]');if(page&&!page.disabled){state.page=Number(page.dataset.taskPage);load();return;}
      const task=e.target.closest('[data-task-id]');if(task&&!loading&&!window.getSelection()?.toString())api.toast('Макет деталки задачи пока не передан. Доступны реестр и выбор типа новой задачи.');
    });
    panel.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-task-id]:not(button)')){e.preventDefault();e.target.click();}});
    $('tasks-search').addEventListener('input',e=>{state.query=e.target.value;changed();});
    $('tasks-clear-search').addEventListener('click',()=>{state.query='';$('tasks-search').value='';changed();$('tasks-search').focus();});
    $('tasks-reset').addEventListener('click',()=>{reset();$('tasks-search').focus();});
    $('tasks-completed').addEventListener('click',()=>{state.tab='all';state.filters.status=['Завершено'];selects.status.set(['Завершено']);changed();});
    ['table','cards'].forEach(view=>$(`tasks-${view}`).addEventListener('click',()=>{if(state.view===view)return;closePopups();state.view=view;state.page=1;load();}));
    $('tasks-date').addEventListener('click',()=>{if(calendar){closeDate();return;}api.closePopups();calendar=window.BpmCalendar.open({anchor:$('tasks-date'),from:state.from,to:state.to,onApply:({from,to})=>{state.from=from;state.to=to;changed();},onClose:()=>{calendar=null;}});});
    // Shared comboboxes close our date popup before opening their lists.
    panel.addEventListener('focusin',e=>{if(e.target.matches('.select-input'))closeDate();});
    $('tasks-export').addEventListener('click',()=>{closePopups();exportDialog.showModal();});
    exportDialog.querySelectorAll('[data-task-export-close]').forEach(button=>button.addEventListener('click',()=>exportDialog.close()));
    exportDialog.addEventListener('click',e=>{if(e.target!==exportDialog)return;const r=exportDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)exportDialog.close();});
    $('task-export-form').addEventListener('submit',e=>{
      e.preventDefault();const scope=new FormData(e.currentTarget).get('task-export-scope'),rows=scope==='filtered'?filterRows():data;
      const headings=['Тип','ID','Задача','Описание','ID процесса','Процесс','Блок','Подразделение','Инициатор','Ответственные','Создано','Срок задачи','Статус'];
      const line=row=>[row.type,row.id,row.title,row.description,row.processCode,row.processTitle,row.block,row.division,row.initiator,row.assignees.join(', '),row.created,date(row.deadline),row.status];
      const lines=scope==='variants'?rows.flatMap(row=>row.variants.map(variant=>[...line(row),variant])):rows.map(line);
      const cell=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,"'$&").replace(/"/g,'""')+'"';
      const csv='\uFEFF'+[scope==='variants'?[...headings,'Вариант результата процесса']:headings,...lines].map(row=>row.map(cell).join(';')).join('\r\n');
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),link=document.createElement('a');link.href=url;link.download=`Sber-BPM-tasks-${scope}-${new Date().toISOString().slice(0,10)}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);exportDialog.close();api.toast(`Экспортировано строк: ${lines.length}`);
    });
    return {enter(){active=true;panel.hidden=false;load();},leave(){active=false;clearTimeout(timer);loading=false;closePopups();window.BpmTaskDrawer.close();if(exportDialog.open)exportDialog.close();panel.hidden=true;},focusSearch(){$('tasks-search').scrollIntoView({block:'center'});$('tasks-search').focus({preventScroll:true});},getRows:()=>filterRows().map(row=>({...row})),isActive:()=>active};
  }
  window.BpmTasks=Object.freeze({create});
})();

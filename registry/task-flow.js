/* Typical task lifecycle. Products BPM 73:6302 — linked Nordic components.
 * Local prototype only; the store does not send assignments or notifications. */
(() => {
  'use strict';
  const V = window.BpmTaskVisuals, esc = V.escape;
  const assets = {
    backlink:'assets/task-flow/backlink.svg',close:'assets/task-flow/close.svg',
    calendar:'assets/task-flow/calendar.svg',clock:'assets/task-flow/clock.svg',placeholderClock:'assets/task-flow/clock-placeholder.svg',
    reset:'assets/task-flow/reset.svg',tick:'assets/task-flow/tick-white.svg',
    erase:'assets/task-flow/erase.svg',copy:'assets/task-flow/copy.svg',
    reject:'assets/task-flow/reject-orange.svg',exit:'assets/task-flow/exit-white.svg',
    completed:'assets/task-flow/completed.svg',overdue:'assets/task-flow/overdue.svg',
    new:'assets/task-flow/status-new.svg',done:'assets/task-flow/status-done.svg',
    neutral:'assets/tasks/status-neutral.svg'
  };
  const img = (name,size=24) => `<img src="${assets[name]}" alt="" width="${size}" height="${size}">`;
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const store = () => window.BpmTaskStore;
  const today = () => { const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const terminal = task => ['Завершено','Отклонена','Отозвана'].includes(task?.status);
  const owned = task => Boolean(task && (task.initiator===store().currentUser || task.outgoing));
  const editableTask = task => owned(task) && !['Отклонена','Отозвана'].includes(task?.status);
  const assigned = task => Boolean(task && (task.incoming || task.assignees.includes(store().currentUser)));
  const button = (action,label,kind='',icon='',disabled=false) => `<button type="button" class="button tf-button ${kind}" data-tf-action="${action}"${action==='reset'?` aria-label="${esc(label)}" title="${esc(label)}"`:''}${disabled?' disabled':''}><span class="tf-button-label">${esc(label)}</span>${icon?img(icon):''}</button>`;
  const badge = id => `<button type="button" class="task-id-badge" data-tf-copy="${esc(id)}" aria-label="Скопировать ID ${esc(id)}"><span>${esc(id)}</span>${img('copy',16)}</button>`;
  let api={}, dialog, task=null, draft=null, initial=null, creationDraft=null;
  let mode='create', trigger=null, calendar=null, selects=[], sheet=null, sheetTrigger=null, closeTimer=null, closing=false, restoreOnClose=true;
  const scrollGate=window.BpmDrawerScroll.create(), sheetScrollGate=window.BpmDrawerScroll.create();
  let scrollMode=null;
  function configure(configuration){api={...api,...configuration};}
  function processList(){
    const unique=new Map();
    [...(window.BPM_DATA||[]),...(window.BPM_STRUCTURE?.records||[])].filter(r=>r.entity==='processes').forEach(r=>unique.set(r.id,r));
    return [...unique.values()];
  }
  function people(){
    const all=[store().currentUser,...store().list().flatMap(r=>[r.initiator,...r.assignees]),...processList().map(r=>r.owner)];
    return [...new Set(all.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  }
  function emptyDraft(){return {title:'',description:'',deadline:'',processId:'',processCode:'',processTitle:'',block:'',division:'',insightId:'',insightTitle:'',insightCode:'',resultVariant:'',assignees:[],variants:[],initiator:store().currentUser};}
  function model(record){return {...emptyDraft(),...clone(record)};}
  function hidePopups(){selects.forEach(s=>s.close());const old=calendar;calendar=null;old?.close(false);api.closePopups?.();}
  function setup(){
    dialog=document.createElement('dialog');dialog.id='task-flow';dialog.className='task-drawer task-flow';
    dialog.setAttribute('aria-labelledby','tf-heading');document.body.append(dialog);
    dialog.addEventListener('click',event=>{
      if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();return;}
      const copy=event.target.closest('[data-tf-copy]');if(copy){copyText(copy.dataset.tfCopy);return;}
      const edit=event.target.closest('[data-tf-edit]');if(edit){editTask(edit.dataset.tfEdit);return;}
      const action=event.target.closest('[data-tf-action]');if(action&&!action.disabled)act(action.dataset.tfAction,action);
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(sheet)closeSheet();else close();});
    dialog.addEventListener('close',cleanup);
    dialog.addEventListener('keydown',event=>{
      if(event.key==='Escape' && !event.defaultPrevented && selects.some(s=>s.popup)){
        event.preventDefault();hidePopups();return;
      }
      if(sheet&&event.key==='Tab'){
        const focusable=[...sheet.querySelectorAll('button:not(:disabled),textarea')];
        const first=focusable[0],last=focusable.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    dialog.addEventListener('animationend',event=>{if(event.target===dialog&&event.animationName==='task-drawer-slide-in')dialog.classList.add('has-entered');});
  }
  function open(configuration={}){
    if(!dialog)setup();
    hidePopups();clearTimeout(closeTimer);closing=false;dialog.inert=false;dialog.classList.remove('is-closing');
    trigger=configuration.trigger||document.activeElement;restoreOnClose=true;mode=configuration.mode||'create';
    task=mode==='create'?null:store().get(configuration.taskId);
    if(mode!=='create'&&!task){api.toast?.('Задача не найдена.');return;}
    scrollGate.begin();scrollMode=mode;
    draft=mode==='create'?clone(creationDraft||emptyDraft()):model(task);initial=mode==='create'?emptyDraft():clone(draft);
    // A linked process can be above an existing task view. Re-enter the native
    // top layer so the new form is above that process, not hidden underneath it.
    // cleanup ignores the queued close event once this dialog is open again.
    if(dialog.open)dialog.close();
    dialog.classList.remove('has-entered');
    render();dialog.showModal();document.body.classList.add('task-drawer-open');
    requestAnimationFrame(()=>{if(!dialog.open)return;if(mode==='create')$('tf-title').focus({preventScroll:true});else dialog.querySelector('[data-tf-action="close"]').focus({preventScroll:true});});
  }
  function cleanup(){
    if(dialog.open)return;
    scrollGate.end();sheetScrollGate.end();scrollMode=null;
    clearTimeout(closeTimer);hidePopups();sheet=null;dialog.inert=false;closing=false;
    dialog.classList.remove('is-closing','has-entered');
    if(!document.querySelector('.task-drawer[open]'))document.body.classList.remove('task-drawer-open');
    if(restoreOnClose){
      if(trigger?.isConnected&&!trigger.closest('dialog:not([open])'))trigger.focus({preventScroll:true});
      else {
        const cabinet=document.body.classList.contains('cabinet-mode');
        const panel=$(cabinet?'cabinet-panel':'tasks-panel');
        const card=task?panel?.querySelector(`button[data-task-id="${CSS.escape(task.id)}"],button[data-cabinet-open="${CSS.escape(task.id)}"]`):null;
        const fallback=cabinet?panel?.querySelector('[data-cabinet-create="tasks"]'):$('tasks-create');
        (card||fallback)?.focus({preventScroll:true});
      }
    }
    trigger=null;
  }
  function close({restoreFocus=true,immediate=false}={}){
    if(!dialog?.open||closing)return;
    if(mode==='create')creationDraft=clone(draft);
    restoreOnClose=restoreFocus;
    hidePopups();closing=true;
    if(immediate||matchMedia('(prefers-reduced-motion: reduce)').matches){dialog.close();return;}
    dialog.inert=true;dialog.classList.add('is-closing');closeTimer=setTimeout(()=>dialog.close(),260);
  }
  function render(){
    if(scrollMode!==mode){scrollGate.begin();scrollMode=mode;}
    sheetScrollGate.end();
    hidePopups();selects=[];sheet=null;
    const form=mode==='create'||mode==='edit';
    dialog.dataset.mode=mode;
    dialog.innerHTML=`<div class="tf-shell">${header()}<div class="tf-content">${form?formMarkup():viewMarkup()}</div>${footer()}</div><div class="sr-only tf-live" role="status" aria-live="polite"></div>`;
    if(form)bindForm();
    // Selects contribute to the actual form height; measure only once their
    // controls exist, including when an already-open drawer enters edit mode.
    scrollGate.bind({root:dialog,scroll:dialog.querySelector('.tf-content'),buttons:[...dialog.querySelectorAll('.tf-footer [data-tf-action="save"],.tf-footer [data-tf-action="complete"]')],form:dialog.querySelector('#tf-form')});
  }
  function header(){
    const closeButton=`<button type="button" class="task-drawer-close" data-tf-action="close" aria-label="Закрыть задачу" title="Закрыть (Esc)">${img('close')}</button>`;
    if(mode==='create')return `<header class="tf-header"><div class="tf-title-row"><div class="tf-title-group"><button type="button" class="tf-back" data-tf-action="back">${img('backlink')}Типы задач</button><h2 id="tf-heading">Типовая задача</h2></div>${closeButton}</div></header>`;
    const editable=mode==='view'&&editableTask(task);
    const status=task.status==='Завершено'?'Выполнена':task.status==='Создана'?'Новая':task.status;
    const statusDate=task.completedAt||task.rejectedAt||task.withdrawnAt||task.created;
    return `<header class="tf-header"><div class="tf-title-row"><div class="tf-meta"><h2 id="tf-heading">Задача</h2>${badge(task.id)}${V.typeTag('Типовая')}</div>${closeButton}</div><h2 class="tf-task-title">${editable?`<button type="button" class="tf-edit-title" data-tf-edit="title" aria-label="Редактировать задачу: ${esc(task.title)}" title="Редактировать задачу">${esc(task.title)}</button>`:esc(task.title)}</h2><div class="tf-status">${img(task.status==='Завершено'?'done':terminal(task)?'neutral':'new',12)}<span>${esc(status)} | ${task.status==='Создана'?'создана ':''}${esc(V.date(statusDate))}</span></div></header>`;
  }
  function field(id,label,value,placeholder='',textarea=false){
    return `<div><label class="field ${textarea?'tf-textarea':'tf-field'}" for="tf-${id}"><span class="internal-label">${esc(label)}</span>${textarea?`<textarea id="tf-${id}" name="${id}" placeholder="${esc(placeholder)}" maxlength="10000">${esc(value)}</textarea>`:`<input id="tf-${id}" name="${id}" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="250" autocomplete="off">`}</label><p class="field-error" id="tf-${id}-error" hidden></p></div>`;
  }
  function formMarkup(){
    return `<form id="tf-form" class="tf-form" novalidate>${mode==='create'?'<div id="tf-insight" class="select-host"></div>':''}${field('title','Название',draft.title,'Введите название задачи')}<div class="tf-deadline-row"><div class="tf-date-wrap"><label class="field tf-field" for="tf-deadline"><span class="field-content"><span class="internal-label">Срок задачи</span><input id="tf-deadline" name="deadline" value="${esc(draft.deadline?V.date(draft.deadline):'')}" placeholder="ДД.ММ.ГГГГ" inputmode="numeric" autocomplete="off" maxlength="10"></span><button type="button" class="select-toggle" data-tf-action="calendar" aria-label="Выбрать срок задачи" aria-haspopup="dialog" aria-expanded="false">${img('calendar')}</button></label><p class="field-error" id="tf-deadline-error" hidden></p></div><span class="tf-deadline-note" id="tf-deadline-note">${deadlineMarkup(draft)}</span></div><div id="tf-process" class="select-host"></div><div id="tf-variant" class="select-host"></div>${field('description','Описание',draft.description,'Введите описание задачи',true)}<div class="tf-assignees"><div id="tf-assignees" class="select-host"></div><p class="field-error" id="tf-assignees-error" hidden></p><div class="tf-avatar-group" id="tf-assignee-avatars">${avatars(draft.assignees)}</div></div></form>`;
  }
  function avatars(names){return names.map(name=>`<span class="tf-avatar" title="${esc(name)}" aria-label="${esc(name)}">${esc(V.initials(name))}</span>`).join('');}
  function bindForm(){
    const add=(id,config)=>{const options=config.multiple?config.options:[{value:'',label:'Не выбрано'},...config.options];const select=api.createSelect(id,{allowAll:false,placeholder:'Выберите',...config,options});selects.push(select);return select;};
    if(mode==='create'){
      const insights=window.BPM_CABINET_DATA?.insights||[];
      add('tf-insight',{label:'Инсайт',values:draft.insightId?[draft.insightId]:[],options:insights.map(r=>({value:r.id,label:`${r.code} ${r.title}`})),onChange:values=>{const row=insights.find(r=>r.id===values[0]);Object.assign(draft,{insightId:row?.id||'',insightTitle:row?.title||'',insightCode:row?.code||''});changed();}});
    }
    const processes=processList();
    const variantsFor=id=>{
      const row=processes.find(r=>r.id===id);
      const known=store().list().filter(t=>t.processId===id).flatMap(t=>t.variants||[]);
      return [...new Set([...(Array.isArray(row?.variants)?row.variants:[]),...known,...(id===draft.processId?draft.variants:[])].filter(v=>typeof v==='string'&&v))];
    };
    let variantSelect;
    add('tf-process',{label:'Процесс',values:draft.processId?[draft.processId]:[],options:processes.map(r=>({value:r.id,label:`${r.code||r.id} ${r.title}`})),onChange:values=>{
      const row=processes.find(r=>r.id===values[0]);const variants=variantsFor(row?.id);
      Object.assign(draft,{processId:row?.id||'',processCode:row?.code||row?.id||'',processTitle:row?.title||'',block:row?.block||'',division:row?.division||'',resultVariant:'',variants});
      variantSelect.set([]);variantSelect.setOptions([{value:'',label:'Не выбрано'},...variants.map(value=>({value,label:value}))]);changed();
    }});
    variantSelect=add('tf-variant',{label:'Вариант предоставления результата процесса (опционально)',placeholder:draft.processId?'Выберите вариант':'Сначала выберите процесс',values:draft.resultVariant?[draft.resultVariant]:[],options:variantsFor(draft.processId).map(value=>({value,label:value})),onChange:values=>{draft.resultVariant=values[0]||'';changed();}});
    add('tf-assignees',{label:'Ответственные',multiple:true,placement:'above',values:draft.assignees,options:people().map(value=>({value,label:value})),onChange:values=>{draft.assignees=[...values];$('tf-assignee-avatars').innerHTML=avatars(values);clearError('assignees');changed();}});
    ['title','description'].forEach(key=>$(`tf-${key}`).addEventListener('input',event=>{draft[key]=event.target.value;clearError(key);changed();}));
    $('tf-deadline').addEventListener('input',event=>{const value=parseDate(event.target.value);draft.deadline=value||'';clearError('deadline');$('tf-deadline-note').innerHTML=deadlineMarkup(draft);changed();});
    $('tf-form').addEventListener('submit',event=>{event.preventDefault();save();});
    updateButtons();
  }
  function parseDate(value){
    const match=String(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);if(!match)return null;
    const [,d,m,y]=match,year=Number(y);if(year<1800||year>2200)return null;
    const check=new Date(year,Number(m)-1,Number(d),12);
    return check.getFullYear()===year&&check.getMonth()===Number(m)-1&&check.getDate()===Number(d)?`${y}-${m}-${d}`:null;
  }
  function deadlineMarkup(record){
    if(!record.deadline)return `${img('placeholderClock',32)}<span class="tf-placeholder">количество дней</span>`;
    if(record.status==='Завершено'){
      const late=record.deadline<V.day(record.completedAt);
      return `${img(late?'overdue':'completed',32)}<span>${late?'Превышен срок':'Закрыта в срок'}</span>`;
    }
    const count=Math.round((new Date(`${record.deadline}T12:00:00`)-new Date(`${today()}T12:00:00`))/86400000);
    const n=Math.abs(count),word=n%10===1&&n%100!==11?'день':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'дня':'дней';
    return `${mode==='create'||mode==='edit'?img('clock',32):''}<span>${count===0?'Срок — сегодня':`Срок: ${n} ${word}`}</span>`;
  }
  function readonly(label,content,key=''){
    const editable=key&&editableTask(task);
    return `<div class="tf-readonly"><span class="internal-label">${esc(label)}</span>${editable?`<button type="button" class="tf-value tf-editable" data-tf-edit="${key}" aria-label="Редактировать: ${esc(label)}" title="Редактировать">${content}</button>`:`<div class="tf-value">${content}</div>`}</div>`;
  }
  function person(label,name){return `<div class="tf-person">${avatars([name])}${readonly(label,esc(name))}</div>`;}
  function viewMarkup(){
    const due=`<div class="tf-deadline-row">${readonly('Срок задачи',esc(task.deadline?V.date(task.deadline):'Без срока'),'deadline')}<span class="tf-deadline-note">${deadlineMarkup(task)}</span></div>`;
    const process=`<div class="tf-readonly"><span class="internal-label">Процесс</span><div class="tf-process-value">${task.processId?badge(task.processCode||task.processId):''}${task.processId?`<button type="button" class="tf-value tf-editable" data-tf-action="process" title="Открыть процесс">${esc(task.processTitle)}</button>`:'—'}</div></div>`;
    const variant=task.resultVariant?readonly('Вариант предоставления результата процесса',esc(task.resultVariant),'process'):'';
    const description=readonly('Описание',esc(task.description||'—'),'description');
    const initiator=person('Инициатор',task.initiator);
    const responsible=`<div class="tf-assignees">${readonly('Ответственные',`Выбрано ${task.assignees.length}`,'assignees')}<div class="tf-avatar-group">${avatars(task.assignees)}</div></div>`;
    const comments=(task.comments||[]).length?`<section class="tf-comments"><h3>Комментарии</h3>${task.comments.map(c=>`<article class="tf-comment"><p class="tf-comment-author">${esc(c.author)} | ${esc(V.date(c.created))}</p><p class="tf-value">${esc(c.text)}</p></article>`).join('')}</section>`:'';
    return due+(terminal(task)?initiator+responsible+process+variant+description:process+variant+description+initiator+responsible)+(task.executor?person('Исполнитель',task.executor):'')+comments;
  }
  function footer(){
    if(mode==='create'||mode==='edit')return `<footer class="tf-footer tf-footer--form">${button('cancel','Отменить')}${button('reset','Сбросить','is-text',mode==='create'?'reset':'erase')}${button('save',mode==='create'?'Создать':'Сохранить','is-primary','tick',mode==='edit')}</footer>`;
    if(terminal(task))return `<footer class="tf-footer"><span class="tf-spacer"></span>${button('close','Закрыть')}</footer>`;
    if(assigned(task)||!owned(task))return `<footer class="tf-footer">${button('reject','Отклонить','','reject')}<span class="tf-spacer"></span>${button('complete','Завершить','is-primary','tick')}</footer>`;
    return `<footer class="tf-footer">${button('withdraw','Отозвать')}<span class="tf-spacer"></span>${button('close','Закрыть')}</footer>`;
  }
  function changed(){if(mode==='create')creationDraft=clone(draft);updateButtons();}
  function updateButtons(){
    const dirty=JSON.stringify(draft)!==JSON.stringify(initial);
    const reset=dialog.querySelector('[data-tf-action="reset"]');if(reset)reset.hidden=!dirty;
    const saveButton=dialog.querySelector('[data-tf-action="save"]');if(saveButton)scrollGate.setDisabled(saveButton,mode==='edit'&&!dirty);
  }
  function error(key,message){
    const output=$(`tf-${key}-error`);if(output){output.textContent=message;output.hidden=false;}
    const input=$(`tf-${key}`)?.matches('input,textarea')?$(`tf-${key}`):$(`tf-${key}`)?.querySelector('input');
    input?.setAttribute('aria-invalid','true');input?.setAttribute('aria-describedby',`tf-${key}-error`);
  }
  function clearError(key){const output=$(`tf-${key}-error`);if(output)output.hidden=true;const input=$(`tf-${key}`)?.matches('input,textarea')?$(`tf-${key}`):$(`tf-${key}`)?.querySelector('input');input?.removeAttribute('aria-invalid');input?.removeAttribute('aria-describedby');}
  function save(){
    if(closing||!['create','edit'].includes(mode)||!scrollGate.allow())return;
    const errors=[];
    if(!draft.title.trim()){error('title','Введите название задачи.');errors.push('title');}
    if($('tf-deadline').value&&!parseDate($('tf-deadline').value)){error('deadline','Укажите существующую дату в формате ДД.ММ.ГГГГ.');errors.push('deadline');}
    if(!draft.assignees.length){error('assignees','Выберите хотя бы одного ответственного.');errors.push('assignees');}
    if(errors.length){const target=$(`tf-${errors[0]}`);(target.matches('input')?target:target.querySelector('input'))?.focus();return;}
    hidePopups();
    const created=mode==='create';
    // Only form fields are editable. Never write a stale status or comment log
    // back over changes made in another browser tab while this form was open.
    const editableFields=['title','description','deadline','processId','processCode','processTitle','block','division','insightId','insightCode','insightTitle','resultVariant','assignees','variants'];
    const fields=Object.fromEntries(editableFields.map(key=>[key,draft[key]]));
    Object.assign(fields,{title:draft.title.trim(),description:draft.description.trim(),overdue:Boolean(draft.deadline&&draft.deadline<today())});
    if(!created){
      const latest=store().get(task.id);
      if(!editableTask(latest)){task=latest;mode='view';render();dialog.querySelector('.tf-live').textContent='Состояние задачи изменилось. Редактирование недоступно.';return;}
    }
    try{task=created?store().create(fields):store().update(task.id,fields);}catch(error){dialog.querySelector('.tf-live').textContent=error.message;api.toast?.(error.message);return;}
    if(!task){api.toast?.('Не удалось сохранить задачу.');return;}
    creationDraft=null;mode='view';
    if(created){
      const createdTask=task;
      // Finish on the registry, after the existing drawer exit animation.
      // Do not render the detail state or keep the submitted creation draft.
      dialog.addEventListener('close',()=>api.onCreated?.(createdTask),{once:true});
      close({restoreFocus:false});return;
    }
    render();dialog.querySelector('[data-tf-action="close"]').focus({preventScroll:true});
    dialog.querySelector('.tf-live').textContent='Изменения сохранены.'+(store().isPersistent?.()===false?' Хранилище браузера недоступно: изменения останутся только до перезагрузки.':'');
  }
  function editTask(focus='title'){
    if(!editableTask(task))return;
    mode='edit';draft=model(task);initial=clone(draft);render();
    const node=$(`tf-${focus}`);(node?.matches('input,textarea')?node:node?.querySelector('input'))?.focus();
  }
  function openSheet(kind,source){
    if(terminal(task))return;
    sheetScrollGate.begin();
    hidePopups();sheetTrigger=source;
    const rejecting=kind==='reject';
    const title=rejecting?'Отклонение задачи':'Завершение задачи';
    const copy=rejecting?'Вы отклоняете задачу,\nвнесите обоснование по отклонению задачи.':'Вы завершаете задачу\nПри необходимости, внесите финальный комментарий по задаче.';
    const overlay=document.createElement('div');overlay.className='tf-sheet-overlay';
    overlay.innerHTML=`<section class="tf-sheet" role="dialog" aria-modal="true" aria-labelledby="tf-sheet-title" aria-describedby="tf-sheet-copy" data-kind="${kind}"><div class="tf-sheet-heading"><h2 id="tf-sheet-title">${title}</h2><button type="button" class="task-drawer-close" data-tf-action="sheet-cancel" aria-label="Закрыть ${rejecting?'отклонение':'завершение'} задачи">${img('close')}</button></div><div class="tf-sheet-content"><p class="tf-sheet-copy" id="tf-sheet-copy">${copy}</p>${field('comment',rejecting?'Обоснование':'Комментарий','','Введите текст комментария',true)}</div><div class="tf-sheet-actions">${button('sheet-cancel','Отменить')}<span class="tf-spacer"></span>${button('sheet-submit',rejecting?'Отклонить':'Завершить задачу','is-primary',rejecting?'exit':'tick')}</div></section>`;
    dialog.querySelector('.tf-shell').inert=true;dialog.append(overlay);sheet=overlay.querySelector('.tf-sheet');
    sheetScrollGate.bind({root:sheet,scroll:sheet.querySelector('.tf-sheet-content'),buttons:[sheet.querySelector('[data-tf-action="sheet-submit"]')]});
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeSheet();});
    $('tf-comment').addEventListener('input',()=>clearError('comment'));$('tf-comment').focus({preventScroll:true});
  }
  function closeSheet(){if(!sheet)return;sheetScrollGate.end();sheet.closest('.tf-sheet-overlay').remove();sheet=null;dialog.querySelector('.tf-shell').inert=false;sheetTrigger?.focus({preventScroll:true});sheetTrigger=null;}
  function submitSheet(){
    if(!sheet||!sheetScrollGate.allow())return;
    const latest=store().get(task.id);
    if(!latest||terminal(latest)){closeSheet();if(latest){task=latest;mode='view';render();}return;}
    task=latest;
    const kind=sheet.dataset.kind,text=$('tf-comment').value.trim();
    if(kind==='reject'&&!text){error('comment','Укажите обоснование отклонения.');$('tf-comment').focus();return;}
    const now=new Date().toISOString();
    const fields=kind==='reject'?{status:'Отклонена',rejectedAt:now,rejectionReason:text}:{status:'Завершено',completedAt:now,executor:store().currentUser,completionComment:text,progress:100,overdue:Boolean(task.deadline&&task.deadline<today())};
    fields.comments=[...(task.comments||[]),...(text?[{author:store().currentUser,text,created:now,kind}]:[])];
    task=store().update(task.id,fields);closeSheet();mode='view';render();dialog.querySelector('[data-tf-action="close"]').focus({preventScroll:true});
  }
  function act(action,source){
    if(action==='close'){close();return;}
    if(action==='back'){creationDraft=clone(draft);const original=trigger;close({immediate:true,restoreFocus:false});api.onBack?.(original);return;}
    if(action==='cancel'){if(mode==='create'){creationDraft=null;draft=emptyDraft();close();}else{mode='view';render();dialog.querySelector('[data-tf-action="close"]').focus();}return;}
    if(action==='reset'){draft=mode==='create'?emptyDraft():clone(initial);creationDraft=mode==='create'?clone(draft):creationDraft;render();$('tf-title').focus();return;}
    if(action==='save'){save();return;}
    if(action==='calendar'){
      if(calendar){hidePopups();return;}
      hidePopups();calendar=window.BpmCalendar.open({anchor:source,mode:'single',from:draft.deadline,onApply:({from})=>{draft.deadline=from;$('tf-deadline').value=from?V.date(from):'';clearError('deadline');$('tf-deadline-note').innerHTML=deadlineMarkup(draft);changed();},onClose:()=>{calendar=null;}});return;
    }
    if(action==='reject'||action==='complete'){if(action==='complete'&&!scrollGate.allow())return;openSheet(action,source);return;}
    if(action==='sheet-cancel'){closeSheet();return;}
    if(action==='sheet-submit'){submitSheet();return;}
    if(action==='withdraw'){
      const latest=store().get(task.id);if(!latest||terminal(latest)){if(latest){task=latest;render();}return;}
      task=store().update(task.id,{status:'Отозвана',withdrawnAt:new Date().toISOString()});render();dialog.querySelector('[data-tf-action="close"]').focus();return;
    }
    if(action==='process'&&task.processId){api.openProcess?.(task.processId,source);}
  }
  async function copyText(value){
    let success=false;
    const focused=document.activeElement;
    try{await navigator.clipboard.writeText(value);success=true;}catch{
      const area=document.createElement('textarea');area.value=value;area.className='sr-only';dialog.append(area);area.select();success=document.execCommand('copy');area.remove();focused?.focus({preventScroll:true});
    }
    dialog.querySelector('.tf-live').textContent=success?'ID скопирован.':'Не удалось скопировать ID.';
  }
  window.BpmTaskFlow=Object.freeze({configure,open,close});
})();

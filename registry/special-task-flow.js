/* PDF task flows, Products BPM 112:16738–112:16745. Local prototype only.
 * Definitions describe domain fields; this controller owns dialog lifetime,
 * persistence, validation and accessible shared Nordic controls. */
(() => {
  'use strict';
  const V=window.BpmTaskVisuals, esc=V.escape, clone=value=>JSON.parse(JSON.stringify(value));
  const $=id=>document.getElementById(id), store=()=>window.BpmTaskStore;
  const assets={back:'assets/task-flow/backlink.svg',close:'assets/task-flow/close.svg',calendar:'assets/task-flow/calendar.svg',clock:'assets/task-flow/clock.svg',emptyClock:'assets/task-flow/clock-placeholder.svg',tick:'assets/task-flow/tick-white.svg',reject:'assets/task-flow/reject-orange.svg',reset:'assets/task-flow/reset.svg',copy:'assets/task-flow/copy.svg',info:'assets/task-types/info-16.svg',lightning:'assets/task-types/lightning-16.svg',check:'assets/task-types/tick-16.svg',ring:'assets/task-types/radio-ring.svg',ringOff:'assets/task-types/radio-off.svg',dot:'assets/task-types/radio-dot.svg',chevron:'assets/field-chevron-down-16.svg',plus:'assets/tasks/plus-blue.svg',completed:'assets/task-flow/completed.svg'};
  const img=(name,size=24)=>`<img src="${assets[name]||window.BpmTaskTypeAssets?.[name]||assets.info}" alt="" width="${size}" height="${size}">`;
  const terminal=t=>['Завершено','Отклонена','Отозвана','Отменено'].includes(t?.status);
  const dateISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const commonKeys=['title','description','deadline','processId','processCode','processTitle','block','division','assignees','insightId','insightCode','insightTitle','initiator','resultVariant'];
  const bindingTargets=new Map();
  let api={},dialog,definition,task,draft,initial,trigger,mode='create',selects=[],calendar,sheet,closing=false,closeTimer,returnFocus=true;
  const drafts=new Map();
  function context(){
    const unique=new Map();
    [...(window.BPM_DATA||[]),...(window.BPM_STRUCTURE?.records||[])].filter(r=>r.entity==='processes').forEach(r=>unique.set(r.id,{...r,code:r.code||(r.number?`П${r.number}`:r.id)}));
    const processes=[...unique.values()];
    const people=[...new Set([store().currentUser,...store().list().flatMap(t=>[t.initiator,...t.assignees]),...processes.map(p=>p.owner)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    return {processes,people,insights:window.BPM_CABINET_DATA?.insights||[],currentUser:store().currentUser,task,mode,draft};
  }
  function empty(){return {title:'',description:'',deadline:'',processId:'',processCode:'',processTitle:'',block:'',division:'',assignees:[],insightId:'',insightCode:'',insightTitle:'',initiator:store().currentUser,...definition.initial?.(context())};}
  function fromTask(record){return {...empty(),...clone(record),...clone(record.flowData||{})};}
  function configure(options){api={...api,...options};}
  function setup(){
    dialog=document.createElement('dialog');dialog.id='special-task-flow';dialog.className='task-drawer task-flow special-task-flow';dialog.setAttribute('aria-labelledby','stf-heading');document.body.append(dialog);
    dialog.addEventListener('click',event=>{
      if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();return;}
      const copy=event.target.closest('[data-stf-copy]');if(copy){copyText(copy.dataset.stfCopy);return;}
      const action=event.target.closest('[data-stf-action]');if(action&&!action.disabled)act(action.dataset.stfAction,action);
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(sheet)closeSheet();else close();});
    dialog.addEventListener('close',cleanup);
    dialog.addEventListener('animationend',event=>{if(event.target===dialog&&event.animationName==='task-drawer-slide-in')dialog.classList.add('has-entered');});
    dialog.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&selects.some(s=>s.popup)){event.preventDefault();event.stopPropagation();hidePopups();return;}
      if(sheet&&event.key==='Tab'){
        const nodes=[...sheet.element.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(n=>n.getClientRects().length);
        const first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    });
  }
  function hidePopups(){selects.forEach(s=>s.close());const old=calendar;calendar=null;old?.close(false);api.closePopups?.();}
  function open(options={}){
    if(!dialog)setup();
    hidePopups();clearTimeout(closeTimer);closing=false;returnFocus=true;trigger=options.trigger||document.activeElement;
    mode=options.mode||'create';task=mode==='create'?null:store().get(options.taskId);
    definition=window.BpmTaskTypes?.[options.typeId||task?.flowType];
    if(!definition||mode!=='create'&&!task){api.toast?.('Задача не найдена.');return;}
    initial=mode==='create'?empty():fromTask(task);
    draft=mode==='create'?clone(drafts.get(definition.id)||initial):clone(initial);
    if(mode==='create'&&options.processId&&!draft.processId){setProcess(options.processId);initial=clone(draft);}
    if(dialog.open)dialog.close();
    dialog.inert=false;dialog.classList.remove('is-closing','has-entered');render();dialog.showModal();document.body.classList.add('task-drawer-open');
    requestAnimationFrame(()=>{if(dialog.open)(mode==='create'?$('stf-title'):dialog.querySelector('[data-stf-action="close"]'))?.focus({preventScroll:true});});
  }
  function cleanup(){
    if(dialog.open)return;
    clearTimeout(closeTimer);hidePopups();sheet=null;closing=false;dialog.inert=false;dialog.classList.remove('is-closing','has-entered');
    if(!document.querySelector('.task-drawer[open]'))document.body.classList.remove('task-drawer-open');
    if(returnFocus){
      const valid=trigger?.isConnected&&!trigger.closest('dialog:not([open])');
      const cabinet=document.body.classList.contains('cabinet-mode'),panel=$(cabinet?'cabinet-panel':'tasks-panel');
      const card=task?panel?.querySelector(`button[data-task-id="${CSS.escape(task.id)}"],button[data-cabinet-open="${CSS.escape(task.id)}"]`):null;
      const fallback=cabinet?panel?.querySelector('[data-cabinet-create="tasks"]'):$('tasks-create');
      (valid?trigger:card||fallback)?.focus({preventScroll:true});
    }
    trigger=null;
  }
  function close({restoreFocus=true,immediate=false}={}){
    if(!dialog?.open||closing)return;
    if(mode==='create')drafts.set(definition.id,clone(draft));
    returnFocus=restoreFocus;hidePopups();closing=true;
    if(immediate||matchMedia('(prefers-reduced-motion: reduce)').matches){dialog.close();return;}
    dialog.inert=true;dialog.classList.add('is-closing');closeTimer=setTimeout(()=>dialog.close(),260);
  }
  function button(action,label,kind='',icon='',disabled=false){return `<button type="button" class="button tf-button ${kind==='primary'?'is-primary':kind==='text'?'is-text':''}" data-stf-action="${esc(action)}" aria-label="${esc(label)}"${disabled?' disabled':''}><span class="tf-button-label">${esc(label)}</span>${icon?img(icon):''}</button>`;}
  function badge(id){return `<button type="button" class="task-id-badge" data-stf-copy="${esc(id)}" aria-label="Скопировать ID ${esc(id)}"><span>${esc(id)}</span>${img('copy',16)}</button>`;}
  function avatar(name){return `<span class="tf-avatar" title="${esc(name)}">${esc(name==='Система'?'SYS':V.initials(name))}</span>`;}
  function header(){
    const exit=`<button type="button" class="task-drawer-close" data-stf-action="close" aria-label="Закрыть задачу">${img('close')}</button>`;
    if(mode==='create')return `<header class="tf-header"><div class="tf-title-row"><div class="tf-title-group"><button type="button" class="tf-back" data-stf-action="back">${img('back')}Типы задач</button><h2 id="stf-heading">${esc(definition.formTitle?.(draft)||definition.label)}</h2></div>${exit}</div></header>`;
    return `<header class="tf-header"><div class="tf-title-row"><div class="tf-meta"><h2 id="stf-heading">Задача</h2>${badge(task.id)}${V.typeTag(definition.tag||definition.label)}</div>${exit}</div><h2 class="tf-task-title">${mode==='view'&&!terminal(task)?`<button type="button" class="tf-edit-title" data-stf-action="edit" title="Редактировать задачу">${esc(task.title)}</button>`:esc(task.title)}</h2>${V.status(task,true)}</header>`;
  }
  function fields(){return (mode==='view'?(definition.viewFields||definition.fields):definition.fields)(draft,context()).filter(Boolean);}
  function render(preserve=false){
    const scroll=preserve?dialog.querySelector('.tf-content')?.scrollTop||0:0;
    hidePopups();selects=[];bindingTargets.clear();sheet=null;dialog.dataset.mode=mode;dialog.dataset.type=definition.id;
    const list=fields();
    dialog.innerHTML=`<div class="tf-shell">${header()}<div class="tf-content"><form id="stf-form" class="tf-form" novalidate>${renderFields(list,draft,'stf',mode!=='view')}${mode==='view'?comments():''}</form></div>${footer()}</div><div class="sr-only stf-live" role="status" aria-live="polite"></div>`;
    bindFields(list,draft,'stf',mode!=='view');
    list.filter(f=>['metrics','variants'].includes(f.kind)).forEach(f=>window.BpmTaskCollections.bind(f,draft,'stf',collectionContext()));
    $('stf-form').addEventListener('submit',event=>{event.preventDefault();if(mode!=='view')save();});
    dialog.querySelector('.tf-content').scrollTop=scroll;updateButtons();
  }
  function fieldValue(field,data){return field.value!==undefined?field.value:data[field.key];}
  function renderFields(list,data,prefix,editing){
    let output='';
    for(let i=0;i<list.length;i++){
      const f=list[i];
      if(f.group){const group=[f];while(list[i+1]?.group===f.group)group.push(list[++i]);output+=`<div data-group="${esc(f.group)}" class="stf-field-group${f.columns===2?' stf-two-columns':''}${f.card||f.group==='scope'?' stf-card':''}${['success','danger'].includes(f.tone)?` stf-card--${f.tone}`:''}">${f.groupLabel?`<h3>${esc(f.groupLabel)}</h3>`:''}${f.groupHelp?`<p class="stf-help">${esc(f.groupHelp)}</p>`:''}${group.map(item=>renderField(item,data,prefix,editing)).join('')}</div>`;}
      else output+=renderField(f,data,prefix,editing);
    }
    return output;
  }
  function renderField(f,data,prefix,editing){
    if(f.previousValue!==undefined){const next={...f};delete next.previousValue;return `<div class="stf-comparison${editing?'':' stf-comparison--view'}"><div class="stf-previous"><span class="internal-label">${esc(f.previousLabel||'Текущее значение')}</span><div class="tf-value${f.previousTone==='link'?' stf-link-value':''}">${esc(f.previousValue)}</div></div>${renderField(next,data,prefix,editing)}</div>`;}
    const key=f.key||'',id=`${prefix}-${key}`,value=fieldValue(f,data),writable=(editing||f.interactive)&&!f.disabled;
    const err=`<p class="field-error" id="${id}-error" hidden></p>`;
    const help=f.help?`<p class="stf-help">${esc(f.help)}</p>`:'';
    if(f.kind==='heading')return `<h3 class="stf-heading${f.tone?` stf-heading--${esc(f.tone)}`:''}">${esc(f.text||f.label)}</h3>`;
    if(f.kind==='note')return `<div class="stf-note stf-note--${esc(f.tone||'info')}">${f.tone==='plain'?'':img(f.tone==='warning'?'warningInfo16':'lightning',16)}<span>${esc(f.text||f.value||'')}</span></div>`;
    if(f.kind==='accordion')return `<details class="stf-accordion"${f.open?' open':''}><summary>${esc(f.label)}${img('chevron',16)}</summary><div>${esc(f.text)}</div></details>`;
    if(f.kind==='person')return `<div class="tf-person">${avatar(value||'—')}<div class="tf-readonly"><span class="internal-label">${esc(f.label)}</span><span class="tf-value">${esc(value||'—')}</span></div></div>`;
    if(f.kind==='checklist')return `<fieldset class="stf-options stf-checklist" id="${id}"><legend>${esc(f.label||'')}</legend>${f.options.map((o,i)=>choice(`${id}-${i}`,key,o.value,o.label,'checkbox',(value||[]).includes(o.value),!writable,prefix,o.help||o.label)).join('')}${err}</fieldset>`;
    if(f.kind==='variants'||f.kind==='metrics')return collection(f,data,prefix,writable)+err;
    if(f.kind==='radio'||f.kind==='checkbox'||f.kind==='switch'){
      const multiple=f.kind==='checkbox'&&f.options;
      const options=f.options||[{value:true,label:f.label}];
      return `<fieldset class="stf-options${f.kind==='switch'?' stf-switch-field':''}${f.inlineLabel?' stf-options--inline':''}${f.appearance==='segmented'?' stf-options--segmented':''}" id="${id}">${f.sectionLabel?`<h3 class="stf-heading">${esc(f.sectionLabel)}</h3>`:''}${f.options?`<legend${f.hideLabel||f.inlineLabel?' class="sr-only"':''}>${esc(f.label)}</legend>${f.inlineLabel?`<span class="stf-options-label">${esc(f.label)}</span>`:''}`:''}${f.appearance==='segmented'?'<span class="stf-segments">':''}${options.map((o,i)=>choice(`${id}-${i}`,key,o.value,o.label,f.kind,multiple?(value||[]).includes(o.value):f.kind==='radio'?value===o.value:Boolean(value),!writable,prefix)).join('')}${f.appearance==='segmented'?'</span>':''}${help}${err}</fieldset>`;
    }
    if((!editing&&!writable)||f.kind==='readonly'){
      let text=value;
      if(f.kind==='process'){const row=context().processes.find(p=>p.id===value);return `<div class="tf-readonly"><span class="internal-label">${esc(f.label||'Процесс')}</span><div class="tf-process-value">${value?badge(row?.code||data.processCode||value):''}${value?`<button class="tf-value tf-editable" type="button" data-stf-action="process" data-process-id="${esc(value)}">${esc(row?.title||data.processTitle||value)}</button>`:'—'}</div>${err}</div>`;}
      if(f.kind==='date')return `<div class="tf-deadline-row"><div class="tf-readonly"><span class="internal-label">${esc(f.label)}</span><span class="tf-value">${value?esc(V.date(value)):'Без срока'}</span></div>${key==='deadline'?`<span class="tf-deadline-note">${deadline(value)}</span>`:''}</div>`;
      if(f.kind==='people')return `<div class="tf-assignees"><div class="tf-readonly"><span class="internal-label">${esc(f.label)}</span><span class="tf-value">Выбрано ${(value||[]).length}</span></div><div class="tf-avatar-group">${(value||[]).map(avatar).join('')}</div>${err}</div>`;
      if(f.kind==='multiselect')return `<div class="tf-readonly"><span class="internal-label">${esc(f.label)}</span><div class="stf-readonly-chips">${(value||[]).map(v=>`<span class="chip">${esc(f.options?.find(o=>o.value===v)?.label||v)}</span>`).join('')||'—'}</div>${help}${err}</div>`;
      if(f.options){text=Array.isArray(value)?value.map(v=>f.options.find(o=>o.value===v)?.label||v).join(', '):f.options.find(o=>o.value===value)?.label||value;}
      return `<div class="tf-readonly"><span class="internal-label">${esc(f.label||'')}</span><div class="tf-value${f.tone==='link'?' stf-link-value':''}">${esc(Array.isArray(text)?text.join(', '):text??'—')}</div>${help}${err}</div>`;
    }
    if(['select','multiselect','process','people','insight'].includes(f.kind))return `<div class="stf-select-field" data-field="${esc(key)}"><div id="${id}" class="select-host"></div>${f.kind==='people'?`<div class="tf-avatar-group" id="${id}-avatars">${(value||[]).map(avatar).join('')}</div>`:''}${help}${err}</div>`;
    if(f.kind==='date')return `<div class="tf-deadline-row${key==='deadline'?'':' stf-period-date'}"><div class="tf-date-wrap"><label class="field stf-date-field${f.disabled?' is-disabled':''}"><span class="tf-field-content"><span class="internal-label">${esc(f.label)}</span><input id="${id}" data-stf-key="${esc(key)}" data-prefix="${prefix}" inputmode="numeric" placeholder="ДД.ММ.ГГГГ" value="${value?esc(V.date(value)):''}" autocomplete="off"${f.disabled?' disabled':''}></span><button type="button" data-stf-action="calendar" data-field="${esc(key)}" data-prefix="${prefix}" aria-label="Выбрать дату"${f.disabled?' disabled':''}>${img('calendar')}</button></label>${err}</div>${key==='deadline'?`<span class="tf-deadline-note" id="${id}-note">${deadline(value)}</span>`:''}</div>`;
    const textarea=f.kind==='textarea';
    return `<div class="stf-input-field${f.card?' stf-card':''}">${f.previousValue!==undefined?`<p class="stf-previous">${esc(f.previousValue)}</p>`:''}<div class="field ${textarea?'tf-textarea':'tf-field'}"><label><span class="internal-label">${esc(f.label)}${f.required?' *':''}</span>${textarea?`<textarea id="${id}" data-stf-key="${esc(key)}" data-prefix="${prefix}" placeholder="${esc(f.placeholder||'Введите текст')}" maxlength="20000">${esc(value||'')}</textarea>`:`<input id="${id}" data-stf-key="${esc(key)}" data-prefix="${prefix}" value="${esc(value||'')}" placeholder="${esc(f.placeholder||'Введите текст')}" maxlength="20000" autocomplete="off">`}</label></div>${help}${err}</div>`;
  }
  function choice(id,key,value,label,kind,checked,disabled,prefix,help=''){
    const type=kind==='radio'?'radio':'checkbox';
    const graphic=kind==='switch'?`<span class="stf-switch-graphic">${img(checked?'switchOn':'switchOff')}</span>`:kind==='radio'?`<span class="stf-radio-graphic">${img(checked?'ring':'ringOff',20)}${checked?img('dot',10):''}</span>`:`<span class="stf-check-graphic">${checked?img('check',16):''}</span>`;
    return `<label class="stf-choice${kind==='switch'?' stf-choice--switch':''}"><input id="${id}" type="${type}" name="${prefix}-${esc(key)}" data-stf-key="${esc(key)}" data-prefix="${prefix}" data-choice="true" value="${esc(value)}"${checked?' checked':''}${disabled?' disabled':''}>${graphic}<span>${esc(label)}</span>${help?`<span class="stf-help-icon" tabindex="0" title="${esc(help)}" aria-label="${esc(help)}">${img('info',16)}</span>`:''}</label>`;
  }
  function deadline(value){
    if(!value)return `${img('emptyClock',32)}<span class="tf-placeholder">количество дней</span>`;
    const count=Math.abs(Math.round((new Date(`${value}T12:00:00`)-new Date(`${dateISO()}T12:00:00`))/86400000));
    const word=count%10===1&&count%100!==11?'день':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'дня':'дней';
    return `${img(terminal(task)?'completed':'clock',32)}<span>${count===0?'Срок — сегодня':`Срок: ${count} ${word}`}</span>`;
  }
  function collectionContext(){return {mode,terminal:terminal(task),esc,img,badge,renderFields,bindFields,changed,rerender:()=>render(true)};}
  function collection(f,data,prefix){return window.BpmTaskCollections.render(f,data,prefix,collectionContext());}
  function bindFields(list,data,prefix,editing){
    bindingTargets.set(prefix,data);
    for(const f of list){
      const writable=(editing||f.interactive)&&!f.disabled;
      if(!writable&&!(editing&&['select','multiselect','process','people','insight'].includes(f.kind)))continue;
      const id=`${prefix}-${f.key}`;
      if(['select','multiselect','process','people','insight'].includes(f.kind)){
        const ctx=context(),multiple=['people','multiselect'].includes(f.kind);
        const options=f.kind==='process'?ctx.processes.map(p=>({value:p.id,label:`${p.code||p.id} ${p.title}`})):f.kind==='people'?ctx.people.map(p=>({value:p,label:p})):f.kind==='insight'?ctx.insights.map(i=>({value:i.id,label:`${i.code} ${i.title}`})):f.options||[];
        const select=api.createSelect(id,{label:f.label,placeholder:f.placeholder||'Выберите',allowAll:false,multiple,placement:f.kind==='people'?'above':undefined,options:multiple?options:[{value:'',label:'Не выбрано'},...options],values:multiple?data[f.key]||[]:data[f.key]?[data[f.key]]:[],onChange:values=>{
          const previousValue=data[f.key];
          data[f.key]=multiple?[...values]:values[0]||'';
          if(prefix==='stf'&&f.kind==='process'&&previousValue!==data[f.key]){setProcess(data[f.key]);Object.assign(data,{resultVariant:'',selectedVariantId:'',beforeVariant:null,businessDescriptionId:'',metrics:[],proposedVariants:[]});}
          if(f.kind==='insight'){const row=ctx.insights.find(i=>i.id===data[f.key]);Object.assign(data,{insightCode:row?.code||'',insightTitle:row?.title||''});}
          clearError(id);changed();
          // Select's own close operation must finish before replacing its host.
          if(!multiple)setTimeout(()=>{if(dialog.open&&!closing&&!sheet)render(true);},0);
          else if(f.kind==='people')$(`${id}-avatars`).innerHTML=(data[f.key]||[]).map(avatar).join('');
        }});if(f.disabled){select.disabled=true;select.input.disabled=true;select.toggle.disabled=true;select.control.classList.add('is-disabled');}selects.push(select);
      }
    }
    const root=prefix==='sts'?sheet?.element:dialog.querySelector('#stf-form');
    root?.querySelectorAll(`[data-stf-key][data-prefix="${prefix}"]`).forEach(input=>{
      const f=list.find(x=>x.key===input.dataset.stfKey);if(!f)return;
      input.addEventListener(input.dataset.choice?'change':'input',()=>{
        if(input.dataset.choice){
          if(f.kind==='radio')data[f.key]=f.options.find(o=>String(o.value)===input.value)?.value;
          else if(f.options){const old=data[f.key]||[],v=f.options.find(o=>String(o.value)===input.value)?.value;data[f.key]=input.checked?[...new Set([...old,v])]:old.filter(x=>x!==v);}
          else data[f.key]=input.checked;
        }else data[f.key]=f.kind==='date'?parseDate(input.value)||'':input.value;
        clearError(`${prefix}-${f.key}`);changed();
        if(f.kind==='date'){const note=$(`${prefix}-${f.key}-note`);if(note)note.innerHTML=deadline(data[f.key]);}
        if(input.dataset.choice){if(prefix==='sts'&&sheet)renderSheetBody();else render(true);}
      });
    });

  }
  function setProcess(id){const row=context().processes.find(p=>p.id===id);Object.assign(draft,{processId:row?.id||'',processCode:row?.code||row?.id||'',processTitle:row?.title||'',block:row?.block||'',division:row?.division||''});}
  function parseDate(value){const match=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);if(!match)return null;const [,d,m,y]=match,dt=new Date(+y,+m-1,+d,12);return +y>=1800&&+y<=2200&&dt.getFullYear()===+y&&dt.getMonth()+1===+m&&dt.getDate()===+d?`${y}-${m}-${d}`:null;}
  function changed(){if(mode==='create')drafts.set(definition.id,clone(draft));updateButtons();}
  function updateButtons(){
    if(!dialog?.open&& !dialog?.innerHTML)return;
    const dirty=JSON.stringify(draft)!==JSON.stringify(initial),reset=dialog.querySelector('[data-stf-action="reset"]'),save=dialog.querySelector('[data-stf-action="save"]');
    if(reset)reset.hidden=!dirty;if(save)save.disabled=mode==='edit'&&!dirty;
  }
  function actions(){return definition.actions?.(task,{...context(),draft})||[];}
  function footer(){
    if(mode!=='view')return `<footer class="tf-footer tf-footer--form">${button('cancel','Отменить')}${button('reset','Сбросить','text','reset')}${button('save',mode==='create'?'Создать':'Сохранить','primary','tick')}</footer>`;
    const available=actions();
    const controls=available.map(a=>button(`lifecycle:${a.id}`,a.label,a.kind,a.icon,Boolean(a.disabled)));
    let content;
    if(!available.length)content=`<span class="tf-spacer"></span>${button('close','Закрыть')}`;
    else if(available.length===1&&available[0].kind==='primary')content=`${button('close','Закрыть')}<span class="tf-spacer"></span>${controls[0]}`;
    else if(available.length===1)content=`${controls[0]}<span class="tf-spacer"></span>${button('close','Закрыть')}`;
    else content=`${controls.slice(0,-1).join('')}<span class="tf-spacer"></span>${controls.at(-1)}`;
    return `<footer class="tf-footer stf-footer">${content}</footer>`;
  }
  function comments(){return (task.comments||[]).length?`<section class="tf-comments"><h3>Комментарии</h3>${task.comments.map(c=>`<article class="tf-comment"><p class="tf-comment-author">${esc(c.author)} | ${esc(V.date(c.created))}</p><p class="tf-value">${esc(c.text)}</p></article>`).join('')}</section>`:'';}
  function clearError(id){$(`${id}-error`)?.setAttribute('hidden','');const n=$(id);(n?.matches('input,textarea')?n:n?.querySelector('input'))?.removeAttribute('aria-invalid');}
  function showErrors(errors,prefix='stf'){
    const entries=Object.entries(errors||{});if(!entries.length)return false;
    for(const [key,message] of entries){const id=`${prefix}-${key}`,out=$(`${id}-error`);if(out){out.textContent=message;out.hidden=false;}const n=$(id);(n?.matches('input,textarea')?n:n?.querySelector('input'))?.setAttribute('aria-invalid','true');}
    const first=$(`${prefix}-${entries[0][0]}`);first?.scrollIntoView({block:'center'});(first?.matches('input,textarea')?first:first?.querySelector('input,button'))?.focus({preventScroll:true});
    dialog.querySelector('.stf-live').textContent=entries.map(([,message])=>message).join(' ');return true;
  }
  function validate(list,data,prefix='stf'){
    const errors={};
    for(const f of list){if(f.disabled)continue;const v=data[f.key];if(f.required&&(v===undefined||v===null||v===''||Array.isArray(v)&&!v.length))errors[f.key]=`Заполните поле «${f.label}».`;
      if(f.kind==='date'){const raw=$(`${prefix}-${f.key}`)?.value;if(raw&&!parseDate(raw))errors[f.key]='Укажите существующую дату в формате ДД.ММ.ГГГГ.';}
    }
    return errors;
  }
  function payload(data){
    const fields=Object.fromEntries(commonKeys.filter(k=>data[k]!==undefined).map(k=>[k,clone(data[k])]));
    const extras={};const recordKeys=new Set([...commonKeys,'flowData','flowType','id','number','type','created','createdISO','incoming','outgoing','status','local','comments','updatedAt','completedAt','rejectedAt','withdrawnAt','progress','overdue','highlight','executor','variants','relatedCount']);
    for(const [key,value] of Object.entries(data))if(!recordKeys.has(key)&&value!==undefined)extras[key]=clone(value);
    return {...fields,title:String(fields.title||'').trim(),description:String(fields.description||'').trim(),flowType:definition.id,flowData:extras,overdue:Boolean(fields.deadline&&fields.deadline<dateISO())};
  }
  function save(){
    if(closing||mode==='view')return;
    const createPatch=mode==='create'?definition.onCreate?.(draft,context())||{}:{};
    const errors={...validate(fields(),draft),...definition.validate?.(draft,context())};if(!(createPatch.title||draft.title)?.trim())errors.title='Введите название задачи.';
    if(showErrors(errors))return;
    if(mode==='edit'){const latest=store().get(task.id);if(!latest||terminal(latest)){if(latest){task=latest;draft=fromTask(task);mode='view';render();}return;}}
    try{
      const created=mode==='create';const data=payload({...draft,...createPatch});
      task=created?store().create(data):store().update(task.id,data);drafts.delete(definition.id);mode='view';
      if(created){const record=task;dialog.addEventListener('close',()=>api.onCreated?.(record),{once:true});close({restoreFocus:false});}
      else {draft=fromTask(task);initial=clone(draft);render();api.toast?.('Изменения сохранены');}
    }catch(error){api.toast?.(error.message);dialog.querySelector('.stf-live').textContent=error.message;}
  }
  function openSheet(config){
    hidePopups();const overlay=document.createElement('div');overlay.className='tf-sheet-overlay';
    overlay.innerHTML=`<section class="tf-sheet stf-sheet" role="dialog" aria-modal="true" aria-labelledby="stf-sheet-title"><div class="tf-sheet-heading"><h2 id="stf-sheet-title">${esc(config.title)}</h2><button type="button" class="task-drawer-close" data-stf-action="sheet-cancel" aria-label="Закрыть окно">${img('close')}</button></div><div class="stf-sheet-content"></div><div class="tf-sheet-actions">${button('sheet-cancel','Отменить')}<span class="tf-spacer"></span>${config.delete?button('item-delete','Удалить'):''}${button('sheet-save',config.confirmLabel||'Сохранить','primary',config.icon||'tick')}</div></section>`;
    sheet={...config,element:overlay.querySelector('section'),trigger:document.activeElement};dialog.querySelector('.tf-shell').inert=true;dialog.append(overlay);overlay.addEventListener('click',event=>{if(event.target===overlay)closeSheet();});renderSheetBody();sheet.element.querySelector('input,textarea,button')?.focus({preventScroll:true});
  }
  function renderSheetBody(){
    const list=typeof sheet.fields==='function'?sheet.fields(sheet.data):sheet.fields;
    sheet.element.querySelector('.stf-sheet-content').innerHTML=`${sheet.copy?`<p class="tf-sheet-copy">${esc(sheet.copy)}</p>`:''}<div class="tf-form">${renderFields(list,sheet.data,'sts',true)}</div>`;
    bindFields(list,sheet.data,'sts',true);
  }
  function closeSheet(){if(!sheet)return;hidePopups();const focus=sheet.trigger;sheet.element.closest('.tf-sheet-overlay').remove();sheet=null;dialog.querySelector('.tf-shell').inert=false;focus?.isConnected&&focus.focus({preventScroll:true});}
  function itemSheet(f,index){
    const existing=index!==undefined?(draft[f.key]||[])[index]:null;
    const metric=f.kind==='metrics';
    const data=clone(existing||{title:'',reason:'',indefinite:true,periodFrom:'',periodTo:'',approved:true});
    const base=metric?[{key:'value',kind:'select',label:'Метрика',required:true,options:(f.options||[]).filter(o=>existing||!(draft[f.key]||[]).some(item=>item.value===o.value))},{key:'reason',kind:'textarea',label:'Обоснование неприменимости',required:f.reasonRequired!==false}]:f.itemFields||[{key:'title',kind:'text',label:'Название',required:true}];
    openSheet({title:metric?(existing?'Редактирование метрики':'Добавление метрики'):(existing?'Редактирование варианта':'Добавление варианта'),confirmLabel:existing?'Сохранить':metric?'Добавить метрику':'Добавить вариант',data,delete:Boolean(existing)&&f.allowDelete!==false,field:f,index,fields:d=>[...base,...(metric&&f.period?[{key:'indefinite',kind:'switch',label:'Бессрочно'},...(!d.indefinite?[{key:'periodFrom',kind:'date',label:'Начало периода',required:true},{key:'periodTo',kind:'date',label:'Окончание периода',required:true}]:[])]:[])],save:values=>{
      const enriched=metric?{...(f.options||[]).find(o=>o.value===values.value),...values}:values;
      const next=[...(draft[f.key]||[])];if(index!==undefined)next[index]=enriched;else next.push(enriched);draft[f.key]=next;
    }});
  }
  function transition(action,comment=''){
    const latest=store().get(task.id);if(!latest)return;
    // Do not overwrite another tab's status, comments or type-specific payload.
    if(latest.status!==task.status){task=latest;draft=fromTask(task);mode='view';closeSheet();render();api.toast?.('Задача изменена в другой вкладке. Проверьте её состояние.');return;}
    const patch=typeof action.patch==='function'?action.patch(draft,latest):action.patch||{};
    const now=new Date().toISOString();
    const changedData=payload({...draft,...patch});
    const updatedData={...(latest.flowData||{}),...changedData.flowData,...(patch.flowData||{})};
    const update={...changedData,...patch,flowData:updatedData,status:action.nextStatus||patch.status||latest.status,comments:[...(latest.comments||[]),...(comment?[{author:store().currentUser,text:comment,created:now,kind:action.id}]:[])]};
    if(['Завершено','Выполнена'].includes(update.status))Object.assign(update,{executor:store().currentUser,completedAt:now,completionComment:comment});
    if(update.status==='Отозвана')update.withdrawnAt=now;if(update.status==='Отклонена'){update.rejectedAt=now;update.rejectionReason=comment;}
    try{task=store().update(latest.id,update);closeSheet();definition.afterTransition?.(action,task,store());task=store().get(task.id);draft=fromTask(task);initial=clone(draft);render();api.toast?.('Задача обновлена',{success:true});}catch(error){api.toast?.(error.message);if(sheet)sheet.busy=false;}
  }
  function act(action,source){
    if(closing)return;
    if(action==='close'){close();return;}
    if(action==='back'){drafts.set(definition.id,clone(draft));const t=trigger;close({immediate:true,restoreFocus:false});api.onBack?.(t);return;}
    if(action==='cancel'){if(mode==='edit'){mode='view';draft=fromTask(task);render();}else{drafts.delete(definition.id);draft=clone(initial);mode='view';close();}return;}
    if(action==='reset'){draft=clone(initial);changed();render();$('stf-title')?.focus();return;}
    if(action==='save'){save();return;}
    if(action==='edit'){if(!terminal(task)){mode='edit';draft=fromTask(task);initial=clone(draft);render();$('stf-title')?.focus();}return;}
    if(action==='process'){api.openProcess?.(source.dataset.processId||draft.processId,source);return;}
    if(action==='calendar'){
      hidePopups();const key=source.dataset.field,prefix=source.dataset.prefix,data=bindingTargets.get(prefix)||draft;
      calendar=window.BpmCalendar.open({anchor:source,mode:'single',from:data[key],onApply:({from})=>{data[key]=from;$(`${prefix}-${key}`).value=from?V.date(from):'';clearError(`${prefix}-${key}`);const note=$(`${prefix}-${key}-note`);if(note)note.innerHTML=deadline(from);changed();},onClose:()=>{calendar=null;}});return;
    }
    if(action==='sheet-cancel'){closeSheet();return;}
    if(action==='item-add'||action==='item-edit'){const f=fields().find(f=>f.key===source.dataset.field);itemSheet(f,action==='item-edit'?Number(source.dataset.index):undefined);return;}
    if(action.startsWith('existing:')){const [,key,i]=action.split(':'),f=fields().find(f=>f.key===key);draft[key]=[clone(f.existing[Number(i)])];changed();render(true);return;}
    if(action==='item-delete'){draft[sheet.field.key]=(draft[sheet.field.key]||[]).filter((_,i)=>i!==sheet.index);closeSheet();changed();render(true);return;}
    if(action==='sheet-save'){
      if(!sheet||sheet.busy)return;
      const list=typeof sheet.fields==='function'?sheet.fields(sheet.data):sheet.fields,errors=validate(list,sheet.data,'sts');
      if(sheet.data.periodFrom&&sheet.data.periodTo&&sheet.data.periodFrom>sheet.data.periodTo)errors.periodTo='Окончание периода не может быть раньше начала.';
      if(showErrors(errors,'sts'))return;
      if(sheet.action){sheet.busy=true;transition(sheet.action,String(sheet.data.comment||'').trim());}
      else {sheet.save(sheet.data);closeSheet();changed();render(true);}return;
    }
    if(action.startsWith('lifecycle:')){
      const a=actions().find(a=>a.id===action.slice(10));if(!a||a.disabled||showErrors(a.validate?.(draft,context())||{}))return;
      if(a.immediate){transition(a);return;}
      openSheet({title:a.sheetTitle||a.label,copy:a.copy||'При необходимости добавьте комментарий.',action:a,data:{comment:''},confirmLabel:a.confirmLabel||a.label,icon:a.icon,fields:[{key:'comment',kind:'textarea',label:a.commentLabel||(a.commentRequired?'Обоснование':'Комментарий'),required:Boolean(a.commentRequired)}]});
    }
  }
  async function copyText(value){let success=false;try{await navigator.clipboard.writeText(value);success=true;}catch{const area=document.createElement('textarea');area.value=value;area.className='sr-only';dialog.append(area);area.select();success=document.execCommand('copy');area.remove();}dialog.querySelector('.stf-live').textContent=success?'ID скопирован.':'Не удалось скопировать ID.';}
  window.BpmSpecialTaskFlow=Object.freeze({configure,open,close,supports:record=>Boolean(window.BpmTaskTypes?.[record?.flowType])});
})();

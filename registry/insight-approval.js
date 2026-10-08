/* Insight view/approval drawer. Products-BPM 312:48421 + Nordic Approval/Block.
 * Native stacked dialogs keep the creation draft and page inert below previews. */
(() => {
  'use strict';
  const esc = value => window.BpmTaskVisuals.escape(value);
  const ui = () => window.BpmInsightPresentation;
  const workflow = () => window.BpmInsightWorkflow;
  const assets = {
    close:'assets/insight-create/form-imgIcon24Exit.svg', copy:'assets/insight-detail/imgIcon16Copy.svg',
    back:'assets/insight-tabs/back.svg',
    approved:'assets/insight-approval/approved.svg', loading:'assets/insight-approval/loading.svg',
    rejected:'assets/insight-approval/rejected.svg', pending:'assets/insight-approval/pending.png',
    stop:'assets/insight-approval/stop.svg', empty:'assets/insight-approval/empty.svg',
    arrow:'assets/insight-detail/imgIcon24ArrowRight2.svg', summaryArrow:'assets/insight-detail/imgIcon24ArrowRight.svg',
    ringer:'assets/insight-detail/imgIcon24Ringer.svg', file:'assets/insight-detail/imgFileIcon.svg',
    person:'assets/insight-detail/imgIcon24Person.svg', star:'assets/insight-detail/imgIcon24StarOff.svg',
    chevron:'assets/insight-detail/imgIcon16ChevronDown.svg'
  };
  const img = (name,size=24,cls='') => `<img src="${assets[name]}" width="${size}" height="${size}" class="${cls}" alt="" aria-hidden="true">`;
  const label = (name,content) => `<div class="ia-value"><span class="internal-label">${esc(name)}</span>${content}</div>`;
  // Keep the stage disk stationary; only the original white DS loading arc rotates.
  const stageIcon = state => state==='current'
    ? `<span class="ia-stage-current" role="img" aria-label="На согласовании">${img('loading',24,'ia-stage-loader')}</span>`
    : img(state,state==='pending'?23:24);
  const accordion = (key,title,body,open=true) => `<details class="ia-accordion" data-ia-section="${key}"${open?' open':''}><summary>${esc(title)}${img('chevron',16)}</summary><div class="ia-accordion-body">${body}</div></details>`;
  function tracker(row) {
    const model = workflow().getWorkflow(row);
    const items = (model.stages || []).flatMap(stage => {
      const decisions = (stage.decisions || []).map(decision => ({state:decision.decision==='approve'?'approved':'rejected',role:decision.role,person:decision.actorName,date:decision.date,comment:decision.comment}));
      if (model.stage !== 'complete' && ['current','next'].includes(stage.status)) {
        const remaining=(stage.actors || []).filter(actor => !(stage.decisions || []).some(d=>d.actorId===actor.id));
        decisions.push({state:stage.status==='current'?'current':'pending',role:remaining.map(a=>a.role).join(' / ') || stage.title,person:remaining.map(a=>a.name).join(' / '),due:stage.status==='current'?stage.dueDate:''});
      }
      return decisions;
    });
    if (!items.length) return '';
    return `<aside class="ia-tracker"><h3>${workflow().canonicalize(row.status)==='Новый'?'Ход согласования':'История согласования'}</h3><ol>${items.map(item=>`<li class="ia-stage" data-stage-state="${item.state}"><span class="ia-stage-rail">${stageIcon(item.state)}</span><div class="ia-stage-copy">${item.due?`<small class="ia-stage-deadline">до ${esc(ui().date(item.due))}</small>`:''}<strong>${esc(item.role)}</strong><small>${esc(item.person)}${item.date?` | ${esc(ui().date(item.date))}`:''}</small>${item.comment?`<p>${esc(item.comment)}</p>`:''}</div></li>`).join('')}</ol></aside>`;
  }
  function create({api={},getRow,onChange,onOpenTab}) {
    let rowId=null, returnFocus=null, afterClose=null, preview=false, closingTimer, decision=null;
    const scrollGate=window.BpmDrawerScroll.create();
    const dialog=document.createElement('dialog');
    dialog.id='insight-approval-drawer';dialog.className='task-drawer ia-drawer';dialog.setAttribute('aria-labelledby','ia-title');
    dialog.innerHTML='<div class="ia-shell"><header class="ia-header"></header><div class="ia-scroll" tabindex="-1"></div><footer class="ia-footer"></footer><span class="sr-only" role="status" aria-live="polite" data-ia-announcement></span></div>';
    document.body.append(dialog);
    const confirmation=document.createElement('dialog');confirmation.id='insight-approval-confirm';confirmation.className='modal ia-confirm';confirmation.setAttribute('aria-labelledby','ia-confirm-title');document.body.append(confirmation);
    const get=()=>getRow(rowId);
    const badge=value=>`<button type="button" class="task-id-badge ia-badge" data-ia-copy="${esc(value)}" aria-label="Скопировать ${esc(value)}">${esc(value)}${img('copy',16)}</button>`;
    function render() {
      const row=get();if(!row)return;
      const detail=window.BpmInsightDetail.initialDetail(row), model=workflow().getWorkflow(row), process=row.related?.[0];
      const path=(window.BPM_DATA||[]).find(item=>item.entity==='paths'&&item.title===row.path);
      const scroll=dialog.querySelector('.ia-scroll'), top=scroll.scrollTop;
      const expanded=new Map([...scroll.querySelectorAll('details')].map(item=>[item.dataset.iaSection,item.open]));
      dialog.querySelector('.ia-header').innerHTML=`<div>${preview?`<button type="button" class="ia-backlink" data-ia-back>${img('back')}<span>Все совпадения</span></button>`:''}<span class="internal-label">Инсайт</span><h2 id="ia-title">${esc(row.title)}</h2><div class="ia-meta">${ui().sourceBadge(row,'tag')}${badge(row.id)}${ui().status(row,true)}</div></div><button class="task-drawer-close" type="button" data-ia-close aria-label="Закрыть просмотр инсайта">${img('close')}</button>`;
      const links=(process?.variants||[]).map(value=>`<button type="button" class="ia-link" data-ia-process="${esc(process.id)}">${esc(value)}</button>`).join('')||'<p class="secondary">Не указаны</p>';
      const files=row.attachments||[];
      const effects=detail.effects.map((effect,index)=>`<article class="ia-effect"><span class="ia-effect-number">${index+1}</span><div><h3>${esc(effect.title||effect.name)}</h3><p>${esc(effect.description)}</p><div class="ia-effect-values">${label('Тип эффекта',`<strong>${esc(effect.type)}</strong>`)}${img('summaryArrow')}${effect.type==='Количественный'?`${label('Текущее значение',`<strong>${esc(effect.baselineCurrent??effect.current)} ${esc(effect.unit)}</strong>`)}${label('Целевое значение',`<strong>${esc(effect.baselineTarget??effect.target)} ${esc(effect.unit)}</strong>`)}`:''}${label('Периодичность',`<strong>${esc(effect.period)}</strong>`)}</div></div></article>`).join('');
      const tasks=(window.BpmTaskStore?.list?.()||[]).filter(task=>(detail.taskIds||[]).includes(task.id)||task.insightId===row.id||task.sourceInsightId===row.id);
      const taskBody=tasks.length?tasks.map(task=>`<button class="ia-task" type="button" data-ia-task="${esc(task.id)}"><span class="task-id-badge">${esc(task.id)}</span><strong>${esc(task.title)}</strong></button>`).join(''):`<div class="ia-empty">${img('empty',40)}<p>Нет ни одной задачи</p><small>К данному инсайту не заведено ни одной задачи</small></div>`;
      scroll.innerHTML=`<div class="ia-overview"><div class="ia-description-column"><div class="ia-context">${label('Клиентский путь',`${path?badge(`КП${path.number}`):''}<p>${esc(row.path||'Не указан')}</p>`)}${label('Процесс',`${process?`${badge(process.code)}<button type="button" class="ia-process-name" data-ia-process="${esc(process.id)}">${esc(process.title)}</button>`:'<p>Не указан</p>'}`)}</div><section class="ia-description"><h3>Описание инсайта</h3>${label('Проблема / наблюдение',`<p>${esc(detail.problem||row.description)}</p>`)}${label('Корневые причины',`<p>${esc(detail.causes||'Не указаны')}</p>`)}${label('Предложение/решение',`<p>${esc(detail.proposal||'Не указано')}</p>`)}</section></div>${tracker(row)}</div>
        <div class="ia-pair">${accordion('relations','Связи процесса',`${label('Варианты предоставления результата процесса',`<div class="ia-links">${links}</div>`)}${label('Продукты ЕКОУ',`<p>${esc(row.products?.join(', ')||row.product||'Не указаны')}</p>`)}`)}${accordion('files',`Вложения ${files.length}`,files.length?files.map(file=>`<button type="button" class="ia-file" data-ia-file>${img('file')}<span>${esc(file.name)}</span></button>`).join(''):'<p class="secondary">Вложения отсутствуют</p>')}</div>
        <section class="ia-effects"><h2>Ожидаемые эффекты</h2>${effects||'<p class="secondary">Эффекты не указаны</p>'}</section>
        ${accordion('tasks',`Задачи ${tasks.length}`,taskBody)}
        <section class="ia-participants"><h3>Участники инсайта</h3><div>${[['Владелец процесса',row.owner||'Не назначен'],['Автор',row.author]].map(([role,name])=>`<div class="ia-person"><span class="avatar">${img('person',18)}</span>${label(role,`<p>${esc(name)}</p>`)}</div>`).join('')}</div></section>
        ${accordion('comments',`Комментарии ${detail.comments.length}`,`<div class="ia-comments">${detail.comments.map(comment=>`<article><small>${esc(comment.author)} | ${esc(comment.date)}</small><p>${esc(comment.text)}</p></article>`).join('')}</div><form class="ia-comment-form"><label class="field"><span class="field-content"><span class="internal-label">Комментарий</span><input name="comment" aria-label="Комментарий к инсайту" placeholder="Введите текст комментария" maxlength="1000" required></span></label><button type="submit" class="button secondary-button">Отправить</button></form>`)}
        <section class="ia-rating">${label('Моя оценка',`<div class="ia-stars">${[1,2,3,4,5].map(value=>`<button type="button" data-ia-rating="${value}" aria-label="Оценка ${value} из 5" aria-pressed="${detail.userRating===value}" class="${value<=detail.userRating?'is-rated':''}">${img('star')}</button>`).join('')}<strong>${Number(detail.userRating||0).toFixed(1).replace('.',',')}</strong></div>`)}${label('Средняя',`<strong class="ia-average">${Number(row.rating||0).toFixed(1).replace('.',',')}</strong>`)}</section>
        ${accordion('history',`История изменений ${detail.history.length}`,`<ol class="ia-history">${detail.history.map(item=>`<li><time>${esc(item.date)}</time><span>${esc(item.text)}</span></li>`).join('')}</ol>`,false)}`;
      if(preview){
        scroll.querySelector('.ia-comment-form')?.remove();
        scroll.querySelectorAll('[data-ia-rating]').forEach(button=>{button.disabled=true;});
      }
      scroll.querySelectorAll('details').forEach(item=>{if(expanded.has(item.dataset.iaSection))item.open=expanded.get(item.dataset.iaSection);});scroll.scrollTop=top;
      const mayApprove=!preview&&workflow().canApprove(row), currentStage=model.stages?.find(stage=>stage.status==='current');
      dialog.querySelector('.ia-footer').innerHTML=mayApprove?`<button class="button secondary-button" type="button" data-ia-decision="reject">${img('stop')}Отклонить</button><span class="ia-deadline">${img('ringer')}до ${esc(ui().date(currentStage?.dueDate))}</span><button class="button primary-button" type="button" data-ia-decision="approve">Согласовать${img('arrow')}</button>`:`<button class="button secondary-button" type="button" data-ia-close>${preview?'Вернуться к созданию':'Закрыть'}</button><span class="ia-footer-state">${ui().status(row)}</span>${!preview?'<button class="button primary-button" type="button" data-ia-tab>Открыть во вкладке</button>':''}`;
      scrollGate.bind({root:dialog,scroll,buttons:mayApprove?[dialog.querySelector('[data-ia-decision="approve"]')]:[]});
    }
    function open(id,options={}) {
      if(!getRow(id)){api.toast?.('Инсайт не найден');return;}
      clearTimeout(closingTimer);scrollGate.begin();dialog.querySelector('.ia-scroll').scrollTop=0;rowId=id;preview=!!options.preview;afterClose=options.onReturn||null;returnFocus=options.trigger||document.activeElement;
      dialog.classList.remove('is-closing');dialog.inert=false;render();dialog.querySelector('.ia-scroll').scrollTop=0;
      if(!dialog.open){dialog.classList.remove('has-entered');dialog.showModal();}
      scrollGate.refresh();
      document.body.classList.add('ia-drawer-open');dialog.querySelector('[data-ia-back],[data-ia-close]')?.focus({preventScroll:true});
    }
    function cleanup() {
      if(dialog.open)return;
      scrollGate.end();
      document.body.classList.remove('ia-drawer-open');dialog.classList.remove('is-closing','has-entered');dialog.inert=false;
      const callback=afterClose;afterClose=null;
      if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null;callback?.();
    }
    function close(options={}) {
      if(!dialog.open)return;
      if(confirmation.open)confirmation.close();
      if(options.restoreFocus===false)returnFocus=null;
      if(options.silent)afterClose=null;
      if(options.immediate||matchMedia('(prefers-reduced-motion: reduce)').matches){dialog.close();cleanup();return;}
      dialog.classList.add('is-closing');dialog.inert=true;clearTimeout(closingTimer);closingTimer=setTimeout(()=>{dialog.close();cleanup();},260);
    }
    function confirmDecision(value) {
      if(value==='approve'&&!scrollGate.allow())return;
      const row=get();if(preview||!workflow().canApprove(row)){api.toast?.('Решение по инсайту недоступно');render();return;}
      decision=value;const reject=value==='reject';
      confirmation.innerHTML=`<form class="ia-confirm-form"><div class="modal-heading"><h2 id="ia-confirm-title">${reject?'Отклонить инсайт?':'Согласовать инсайт?'}</h2><button type="button" class="task-drawer-close" data-ia-confirm-close aria-label="Закрыть подтверждение">${img('close')}</button></div><p>${reject?'Внесите комментарий для обоснования отклонения.':'Комментарий к согласованию необязателен.'}</p><label class="ia-comment-field"><span class="internal-label">Комментарий${reject?' · обязательно':''}</span><textarea name="decisionComment" aria-label="Комментарий к решению" maxlength="1000" ${reject?'required':''}></textarea></label><p class="ia-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary-button" data-ia-confirm-close>Отмена</button><button type="submit" class="button primary-button">${reject?'Отклонить':'Согласовать'}</button></div></form>`;
      confirmation.showModal();confirmation.querySelector('textarea').focus();
    }
    confirmation.addEventListener('click',event=>{if(event.target.closest('[data-ia-confirm-close]'))confirmation.close();});
    confirmation.addEventListener('submit',event=>{
      event.preventDefault();const text=confirmation.querySelector('textarea').value.trim();
      try{const patch=workflow().decide(get(),{decision,comment:text});onChange(rowId,patch);confirmation.close();render();const message=decision==='approve'?'Инсайт согласован':'Решение об отклонении сохранено';dialog.querySelector('[data-ia-announcement]').textContent=message;api.toast?.(message,{success:true});dialog.querySelector('[data-ia-close]')?.focus({preventScroll:true});}
      catch(error){const target=confirmation.querySelector('.ia-error');target.textContent=error.message;target.hidden=false;}
    });
    dialog.addEventListener('click',event=>{
      if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();return;}
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-ia-close')||button.hasAttribute('data-ia-back'))close();
      else if(button.hasAttribute('data-ia-copy'))api.copyText?.(button.dataset.iaCopy);
      else if(button.hasAttribute('data-ia-process'))api.openProcess?.(button.dataset.iaProcess,button);
      else if(button.hasAttribute('data-ia-task'))api.openTask?.(button.dataset.iaTask,button);
      else if(button.hasAttribute('data-ia-file'))api.toast?.('Демонстрационное вложение: в прототипе сохранено только название файла.');
      else if(button.hasAttribute('data-ia-tab')){const id=rowId;close({immediate:true,restoreFocus:false});onOpenTab?.(id);}
      else if(button.hasAttribute('data-ia-decision'))confirmDecision(button.dataset.iaDecision);
      else if(!preview&&button.hasAttribute('data-ia-rating')){const row=get(), detail=window.BpmInsightDetail.initialDetail(row);detail.userRating=Number(button.dataset.iaRating);detail.ratingTouched=true;onChange(rowId,{detail});render();dialog.querySelector(`[data-ia-rating="${detail.userRating}"]`)?.focus({preventScroll:true});}
    });
    dialog.addEventListener('submit',event=>{
      if(!event.target.matches('.ia-comment-form'))return;event.preventDefault();
      if(preview)return;
      const input=event.target.elements.comment, text=input.value.trim();if(!text){input.focus();return;}
      const row=get(), detail=window.BpmInsightDetail.initialDetail(row), date=new Date().toLocaleDateString('ru-RU');
      detail.comments.unshift({author:workflow().getWorkflow(row).currentActor?.name||window.BpmInsightStore.currentUser,date,text});detail.history.unshift({date,text:'Добавлен комментарий'});
      onChange(rowId,{detail,comments:detail.comments.length});render();dialog.querySelector('.ia-comment-form input').focus({preventScroll:true});api.toast?.('Комментарий добавлен',{success:true});
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',cleanup);
    dialog.addEventListener('animationend',event=>{if(event.target===dialog&&event.animationName==='task-drawer-slide-in')dialog.classList.add('has-entered');});
    return {open,close,isOpen:()=>dialog.open};
  }
  window.BpmInsightApproval=Object.freeze({create,tracker});
})();

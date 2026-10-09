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
  function tracker(row,{completionPreview=false}={}) {
    if (row?.source !== 'ТБ') return '';
    const model = workflow().getWorkflow(row);
    const ownId = model.currentActor?.id;
    const hasOwnApproval = !!ownId && (model.stages || []).some(stage => (stage.decisions || []).some(decision => decision.actorId===ownId && decision.decision==='approve'));
    if (!completionPreview && workflow().canonicalize(row.status)!=='Новый' && !hasOwnApproval) return '';
    const mayApprove = workflow().canApprove(row);
    const items = (model.stages || []).flatMap(stage => {
      const decisions = (stage.decisions || []).map(decision => ({state:decision.decision==='approve'?'approved':'rejected',role:decision.role,person:decision.actorName,date:decision.date,comment:decision.comment,own:decision.decision==='approve'&&decision.actorId===ownId}));
      if (model.stage !== 'complete' && ['current','next'].includes(stage.status)) {
        const remaining=(stage.actors || []).filter(actor => !(stage.decisions || []).some(d=>d.actorId===actor.id));
        decisions.push({state:stage.status==='current'?'current':'pending',role:remaining.map(a=>a.role).join(' / ') || stage.title,person:remaining.map(a=>a.name).join(' / '),due:stage.status==='current'?stage.dueDate:'',own:mayApprove&&stage.status==='current'&&remaining.some(actor=>actor.id===ownId)});
      }
      return decisions;
    });
    if (!items.length) return '';
    return `<aside class="ia-tracker"><h3>Ход согласования</h3><ol>${items.map((item,index)=>`<li class="ia-stage" data-stage-state="${item.state}"${item.own?' data-ia-own-stage':''}><span class="ia-stage-rail">${stageIcon(item.state)}</span><div class="ia-stage-copy">${item.due?`<div class="ia-stage-date-line"><small class="ia-stage-deadline">до ${esc(ui().date(item.due))}</small>${item.own?'<span class="ia-stage-own">Ваше согласование</span>':''}</div>`:''}<strong>${esc(item.role)}</strong><small>${esc(window.BpmAvatars.displayName(item.person,`${row.id}:approval:${index}`))}${item.date&&!item.own?` | ${esc(ui().date(item.date))}`:''}</small>${item.date&&item.own?`<div class="ia-stage-date-line"><small>${esc(ui().date(item.date))}</small><span class="ia-stage-own">Ваше согласование</span></div>`:''}${item.comment?`<p>${esc(item.comment)}</p>`:''}</div></li>`).join('')}</ol></aside>`;
  }
  // The flight is a visual projection of an already committed decision. It
  // never changes permissions, stages or storage and never fakes success.
  function createApprovalMotion({root,getScroll,onScroll=()=>{}}) {
    let epoch=0, layer=null, hiddenTracker=null, frame=null;
    const timers=new Map(), animations=new Set();
    root.classList.add('ia-approval-motion-root');
    function cancel() {
      epoch++; if(frame!==null)cancelAnimationFrame(frame);frame=null;
      timers.forEach((resolve,timer)=>{clearTimeout(timer);resolve(false);});timers.clear();
      animations.forEach(animation=>animation.cancel());animations.clear();
      hiddenTracker?.classList.remove('is-approval-flight-source');hiddenTracker=null;
      layer?.remove();layer=null;root.removeAttribute('data-ia-approval-phase');
      window.removeEventListener('resize',cancel);
      onScroll();
    }
    const wait=milliseconds=>new Promise(resolve=>{const timer=setTimeout(()=>{timers.delete(timer);resolve(true);},milliseconds);timers.set(timer,resolve);});
    async function animate(node,keyframes,options) {
      const animation=node.animate(keyframes,{fill:'forwards',...options});animations.add(animation);
      try{await animation.finished;return true;}catch{return false;}finally{animations.delete(animation);}
    }
    function capture(button,row) {
      const source=root.querySelector('.ia-tracker'),scroll=getScroll();
      if(!source||!button||!workflow().canApprove(row))return null;
      return {markup:source.outerHTML,rect:source.getBoundingClientRect(),button:button.getBoundingClientRect(),footer:button.closest('footer')?.getBoundingClientRect(),top:scroll?.scrollTop||0,rowId:row.id};
    }
    async function play(snapshot,row) {
      cancel();
      if(!snapshot||snapshot.rowId!==row.id||!root.isConnected||root.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      const completed=tracker(row,{completionPreview:true});
      if(!completed)return;
      const scroll=getScroll();if(!scroll)return;
      const ownEpoch=epoch, live=()=>ownEpoch===epoch&&root.isConnected&&!root.hidden;
      const view=root.getBoundingClientRect();
      layer=document.createElement('div');layer.className='ia-approval-flight-layer';layer.setAttribute('aria-hidden','true');layer.inert=true;
      layer.innerHTML=snapshot.markup;root.append(layer);
      const card=layer.firstElementChild;card.classList.add('ia-tracker--flight');
      const width=Math.min(snapshot.rect.width,Math.max(0,view.width-24));
      card.style.width=`${width}px`;
      const anchorTop=snapshot.footer?.top||snapshot.button.top;
      card.style.maxHeight=`${Math.max(120,anchorTop-view.top-24)}px`;
      const height=card.getBoundingClientRect().height;
      const left=Math.max(12,Math.min(snapshot.button.right-view.left-width,view.width-width-12));
      let top=Math.max(12,anchorTop-view.top-height-12);
      card.style.left=`${left}px`;card.style.top=`${top}px`;
      hiddenTracker=root.querySelector('.ia-tracker:not(.ia-tracker--flight)');hiddenTracker?.classList.add('is-approval-flight-source');
      window.addEventListener('resize',cancel,{once:true});root.dataset.iaApprovalPhase='appearing';
      if(!await animate(card,[{opacity:0,transform:'translateY(24px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'})||!live())return;
      if(!await wait(200)||!live())return;
      const holder=document.createElement('div');holder.innerHTML=completed;
      card.innerHTML=holder.firstElementChild.innerHTML;root.dataset.iaApprovalPhase='completed';
      // A saved comment may make the completed route taller. Keep its bottom
      // anchored above the actions rather than letting the new copy cover them.
      top=Math.max(12,anchorTop-view.top-card.getBoundingClientRect().height-12);
      card.style.top=`${top}px`;
      const ownIcon=card.querySelector('[data-ia-own-stage][data-stage-state="approved"] .ia-stage-rail > img');
      if(ownIcon)void animate(ownIcon,[{transform:'scale(.65)',opacity:.35},{transform:'scale(1.16)',opacity:1},{transform:'scale(1)',opacity:1}],{duration:360,easing:'ease-out'});
      if(!await wait(650)||!live())return;
      root.dataset.iaApprovalPhase='returning';
      const destination=hiddenTracker?.getBoundingClientRect()||snapshot.rect;
      const targetLeft=destination.left-view.left;
      // The tracker lives at the beginning of this same scrollable content.
      // Scroll only that content while returning; the page/footer stay fixed.
      const naturalTop=destination.top-view.top+(hiddenTracker?scroll.scrollTop:snapshot.top);
      const scrollView=scroll.getBoundingClientRect();
      const targetTop=Math.max(scrollView.top-view.top,Math.min(naturalTop,scrollView.bottom-view.top-card.getBoundingClientRect().height-12));
      // On a narrow layout the real slot follows the long description. Keep
      // that slot visible instead of scrolling it back below the viewport.
      const finalScroll=Math.max(0,naturalTop-targetTop);
      const initialTop=scroll.scrollTop,start=performance.now(),duration=800;
      const scrollFrame=now=>{if(!live())return;const progress=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-progress,3);scroll.scrollTop=initialTop+(finalScroll-initialTop)*ease;onScroll();if(progress<1)frame=requestAnimationFrame(scrollFrame);else frame=null;};
      frame=requestAnimationFrame(scrollFrame);
      const returned=await animate(card,[{transform:'translate(0,0)',boxShadow:'0 16px 48px #1a1a1a38, 0 4px 12px #1a1a1a24'},{transform:`translate(${targetLeft-left}px,${targetTop-top}px)`,boxShadow:'0 4px 6px #1a1a1a1f'}],{duration,easing:'cubic-bezier(.22,.61,.36,1)'});
      if(!returned||!live())return;
      scroll.scrollTop=finalScroll;onScroll();
      if(!hiddenTracker){root.dataset.iaApprovalPhase='finishing';if(!await animate(card,[{opacity:1},{opacity:0}],{duration:180})||!live())return;}
      cancel();
    }
    return {capture,play,cancel,destroy(){cancel();root.classList.remove('ia-approval-motion-root');}};
  }
  function create({api={},getRow,onChange,onOpenTab}) {
    let rowId=null, returnFocus=null, afterClose=null, preview=false, closingTimer, decision=null;
    const scrollGate=window.BpmDrawerScroll.create();
    const dialog=document.createElement('dialog');
    dialog.id='insight-approval-drawer';dialog.className='task-drawer ia-drawer';dialog.setAttribute('aria-labelledby','ia-title');
    dialog.innerHTML='<div class="ia-shell"><header class="ia-header"></header><div class="ia-scroll" tabindex="-1"></div><footer class="ia-footer"></footer><span class="sr-only" role="status" aria-live="polite" data-ia-announcement></span></div>';
    document.body.append(dialog);
    const approvalMotion=createApprovalMotion({root:dialog.querySelector('.ia-shell'),getScroll:()=>dialog.querySelector('.ia-scroll'),onScroll:()=>scrollGate.refresh()});
    const confirmation=document.createElement('dialog');confirmation.id='insight-approval-confirm';confirmation.className='modal ia-confirm';confirmation.setAttribute('aria-labelledby','ia-confirm-title');document.body.append(confirmation);
    const get=()=>getRow(rowId);
    const badge=value=>`<button type="button" class="task-id-badge ia-badge" data-ia-copy="${esc(value)}" aria-label="Скопировать ${esc(value)}">${esc(value)}${img('copy',16)}</button>`;
    function render() {
      const row=get();if(!row)return;
      approvalMotion.cancel();
      const detail=window.BpmInsightDetail.initialDetail(row), model=workflow().getWorkflow(row), process=row.related?.[0];
      const path=(window.BPM_DATA||[]).find(item=>item.entity==='paths'&&item.title===row.path);
      const scroll=dialog.querySelector('.ia-scroll'), top=scroll.scrollTop;
      const expanded=new Map([...scroll.querySelectorAll('details')].map(item=>[item.dataset.iaSection,item.open]));
      dialog.querySelector('.ia-header').innerHTML=`<div>${preview?`<button type="button" class="ia-backlink" data-ia-back>${img('back')}<span>Все совпадения</span></button>`:''}<span class="internal-label">Инсайт</span><h2 id="ia-title">${esc(row.title)}</h2><div class="ia-meta">${ui().sourceBadge(row,'tag')}${badge(row.id)}${ui().status(row,true)}</div></div><button class="task-drawer-close" type="button" data-ia-close aria-label="Закрыть просмотр инсайта">${img('close')}</button>`;
      const links=(process?.variants||[]).map(value=>`<button type="button" class="ia-link" data-ia-process="${esc(process.id)}">${esc(value)}</button>`).join('')||'<p class="secondary">Не указаны</p>';
      const files=row.attachments||[];
      const effects=detail.effects.map((effect,index)=>{
        const summary=window.BpmInsightDetail.effectTableModel(row,effect,index);
        const qualitative=window.BpmInsightDetail.isQualitativeEffect(effect);
        return `<article class="ia-effect"><span class="ia-effect-number">${index+1}</span><div><h3>${esc(effect.title||effect.name)} <span class="secondary ia-effect-counts">(Актуальных ${summary.active}, Неактуальных ${summary.inactive})</span></h3><p>${esc(effect.description)}</p><div class="ia-effect-values">${label('Тип эффекта',`<strong>${esc(effect.type)}</strong>`)}${qualitative?'':label('Периодичность',`<strong>${esc(effect.period)}</strong>`)}</div><div class="ia-effects-table-scroll" tabindex="0" role="region" aria-label="Показатели эффекта ${index+1}"><table class="ia-effects-table${qualitative?' ia-effects-table--qualitative':''}"><colgroup>${'<col>'.repeat(qualitative?3:6)}</colgroup><thead><tr><th>${esc(summary.bankHeading)}</th><th>Актуальность</th>${qualitative?'':'<th>Текущее</th><th>Целевое</th><th>Ед. изм.</th>'}<th>Комментарий</th></tr></thead><tbody>${summary.rows.map(response=>`<tr${response.isAuthor?' class="ia-effect-author-row" data-ia-effect-author':''}><td><strong>${esc(response.bank)}</strong><small${response.isAuthor?' class="ia-effect-author-label"':''}>${esc(response.isAuthor?'Автор инсайта':window.BpmAvatars.displayName(response.person,`${row.id}:opinion:${response.bank}`))}</small></td><td>${response.effect.applicable?'Да':'Нет'}</td>${qualitative?'':`<td>${esc(response.effect.current||'—')}</td><td>${esc(response.effect.target||'—')}</td><td>${esc(response.effect.unit||'—')}</td>`}<td>${esc(response.effect.comment||'—')}</td></tr>`).join('')}</tbody></table></div></div></article>`;
      }).join('');
      const tasks=(window.BpmTaskStore?.list?.()||[]).filter(task=>(detail.taskIds||[]).includes(task.id)||task.insightId===row.id||task.sourceInsightId===row.id);
      const taskBody=tasks.length?tasks.map(task=>`<button class="ia-task" type="button" data-ia-task="${esc(task.id)}"><span class="task-id-badge">${esc(task.id)}</span><strong>${esc(task.title)}</strong></button>`).join(''):`<div class="ia-empty">${img('empty',40)}<p>Нет ни одной задачи</p><small>К данному инсайту не заведено ни одной задачи</small></div>`;
      scroll.innerHTML=`<div class="ia-overview"><div class="ia-description-column"><div class="ia-context">${label('Клиентский путь',`${path?badge(`КП${path.number}`):''}<p>${esc(row.path||'Не указан')}</p>`)}${label('Процесс',`${process?`${badge(process.code)}<button type="button" class="ia-process-name" data-ia-process="${esc(process.id)}">${esc(process.title)}</button>`:'<p>Не указан</p>'}`)}</div><section class="ia-description"><h3>Описание инсайта</h3>${label('Проблема / наблюдение',`<p>${esc(detail.problem||row.description)}</p>`)}${label('Корневые причины',`<p>${esc(detail.causes||'Не указаны')}</p>`)}${label('Предложение/решение',`<p>${esc(detail.proposal||'Не указано')}</p>`)}</section></div>${tracker(row)}</div>
        <div class="ia-pair">${accordion('relations','Связи процесса',`${label('Варианты предоставления результата процесса',`<div class="ia-links">${links}</div>`)}${label('Продукты ЕКОУ',`<p>${esc(row.products?.join(', ')||row.product||'Не указаны')}</p>`)}`)}${accordion('files',`Вложения ${files.length}`,files.length?files.map(file=>`<button type="button" class="ia-file" data-ia-file>${img('file')}<span>${esc(file.name)}</span></button>`).join(''):'<p class="secondary">Вложения отсутствуют</p>')}</div>
        <section class="ia-effects"><h2>Ожидаемые эффекты</h2>${effects||'<p class="secondary">Эффекты не указаны</p>'}</section>
        ${accordion('tasks',`Задачи ${tasks.length}`,taskBody)}
        <section class="ia-participants"><h3>Участники инсайта</h3><div>${workflow().getParticipants(row).map(({role,name},index)=>{const key=`${row.id}:${role==='Владелец процесса'?'owner':role==='Автор'?'author':`${role}:${index}`}`,displayName=window.BpmAvatars.displayName(name,key);return `<div class="ia-person"><span class="avatar">${displayName==='Система'||displayName==='SYS'?'SYS':window.BpmAvatars.portrait(displayName,key)}</span>${label(role,`<p>${esc(displayName)}</p>`)}</div>`;}).join('')}</div></section>
        ${accordion('comments',`Комментарии ${detail.comments.length}`,`<div class="ia-comments">${detail.comments.map((comment,index)=>`<article><small>${esc(window.BpmAvatars.displayName(comment.author,`${row.id}:comment:${index}:author`))} | ${esc(comment.date)}</small><p>${esc(comment.text)}</p></article>`).join('')}</div><form class="ia-comment-form"><label class="field"><span class="field-content"><span class="internal-label">Комментарий</span><input name="comment" aria-label="Комментарий к инсайту" placeholder="Введите текст комментария" maxlength="1000" required></span></label><button type="submit" class="button secondary-button">Отправить</button></form>`)}
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
      approvalMotion.cancel();
      scrollGate.end();
      document.body.classList.remove('ia-drawer-open');dialog.classList.remove('is-closing','has-entered');dialog.inert=false;
      const callback=afterClose;afterClose=null;
      if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null;callback?.();
    }
    function close(options={}) {
      if(!dialog.open)return;
      approvalMotion.cancel();
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
      confirmation.innerHTML=`<form class="ia-confirm-form"><div class="modal-heading"><h2 id="ia-confirm-title">${reject?'Отклонить инсайт?':'Согласование инсайта'}</h2><button type="button" class="task-drawer-close" data-ia-confirm-close aria-label="Закрыть подтверждение">${img('close')}</button></div><p>${reject?'Внесите комментарий для обоснования отклонения.':'В случае принятия решения «согласовать» введение комментария не обязательно.'}</p><label class="ia-comment-field"><span class="internal-label">Комментарий${reject?' · обязательно':''}</span><textarea name="decisionComment" aria-label="Комментарий к решению" maxlength="1000" ${reject?'required':''}></textarea></label><p class="ia-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary-button" data-ia-confirm-close>Отмена</button><button type="submit" class="button primary-button">${reject?'Отклонить':'Согласовать'}</button></div></form>`;
      confirmation.showModal();confirmation.querySelector('textarea').focus();
    }
    confirmation.addEventListener('click',event=>{if(event.target.closest('[data-ia-confirm-close]'))confirmation.close();});
    confirmation.addEventListener('submit',event=>{
      event.preventDefault();const text=confirmation.querySelector('textarea').value.trim();
      if(!dialog.open||preview||decision==='approve'&&!scrollGate.allow())return;
      try{const before=get(),snapshot=decision==='approve'?approvalMotion.capture(dialog.querySelector('[data-ia-decision="approve"]'),before):null;const patch=workflow().decide(before,{decision,comment:text});onChange(rowId,patch);confirmation.close();render();const message=decision==='approve'?'Инсайт согласован':'Решение об отклонении сохранено';dialog.querySelector('[data-ia-announcement]').textContent=message;api.toast?.(message,{success:true});dialog.querySelector('[data-ia-close]')?.focus({preventScroll:true});if(snapshot)void approvalMotion.play(snapshot,get()||{...before,...patch});}
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
  window.BpmInsightApproval=Object.freeze({create,tracker,createApprovalMotion});
})();

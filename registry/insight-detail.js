/* Insight detail · Products-BPM 305:46304. Shared tab / cabinet-drawer content.
 * Data supplied by the registry; only the user's bank row is editable.
 * All mutations are delegated to the caller's demonstration store. */
(() => {
  'use strict';
  const esc = value => window.BpmTaskVisuals.escape(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const formatDate = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0,10).split('-').reverse().join('.') : String(value || '');
  const today = () => new Date().toLocaleDateString('ru-RU');
  const number = value => Number(value || 0).toFixed(1).replace('.', ',');
  // Literal paths are embedded by the standalone builder. Original SVG geometry
  // is preserved, including the switch's shadow outside its 48 × 24 hit area.
  const assets = {
    star:'assets/insight-detail/imgIcon24StarOff.svg', starOn:'assets/insight-detail/imgIcon24StarOn.svg', deadline:'assets/insight-detail/imgDeadlineIndicatorPdfSource.svg',
    copy:'assets/insight-detail/imgIcon16Copy.svg', off:'assets/insight-detail/imgToneNeutralSize24StateDefault.svg', on:'assets/insight-detail/imgToneGreenSize24StateDefault.svg',
    arrow:'assets/insight-detail/imgIcon24ArrowRight.svg', ringer:'assets/insight-detail/imgIcon24Ringer.svg', dot:'assets/insight-detail/imgDot.svg',
    file:'assets/insight-detail/imgFileIcon.svg', info:'assets/insight-detail/imgIcon16Info.svg', purpleArrow:'assets/insight-detail/imgIcon24ArrowRight1.svg',
    tick:'assets/insight-detail/imgIcon24Tick.svg', chevronDown:'assets/insight-detail/imgIcon16ChevronDown.svg',
    plus:'assets/insight-detail/imgAddIcon.svg', chevronUp:'assets/insight-detail/imgChevron.svg', taskDot:'assets/insight-detail/imgDot1.svg',
    direction:'assets/insight-detail/imgRelatedDirection.svg', person:'assets/insight-detail/imgIcon24Person.svg',
    historyChevron:'assets/insight-detail/imgChevron1.svg', reject:'assets/insight-approval/stop.svg', actionArrow:'assets/insight-detail/imgIcon24ArrowRight2.svg', close:'assets/insight-create/form-imgIcon24Exit.svg',
    statusBlue:'assets/insights/241-1742-dot.svg', statusRed:'assets/insights/241-2705-dot.svg', statusOrange:'assets/insights/241-2705-dot1.svg'
  };
  const img = name => `<img src="${assets[name]}" alt="" aria-hidden="true">`;
  const workflow = () => window.BpmInsightWorkflow;
  const canonicalStatus = row => workflow()?.canonicalize?.(row.status) || ({'Выполняется':'В работе','Выполнено':'Реализовано','Выполнен':'Реализовано','Завершено':'Реализовано','Отклонён':'Отклонено','Отклонен':'Отклонено'}[row.status] || row.status || 'Новый');
  const terminal = row => ['В работе','Реализовано','Отклонено'].includes(canonicalStatus(row));
  const statusMarkup = row => {
    if (window.BpmInsightPresentation?.status) return window.BpmInsightPresentation.status(row,true);
    const status = canonicalStatus(row), tone = status === 'Новый' ? 'info' : status === 'Реализовано' ? 'positive' : status === 'Отклонено' ? 'danger' : 'indigo';
    return `<span class="id-detail-status-dot id-detail-status-dot--${tone}" aria-hidden="true"></span>${esc(status)} | ${formatDate(row.created)}`;
  };
  const observation = 'Суть инсайта в том, что скорость согласования обратно пропорциональна количеству допущений. Чем быстрее мы хотим закрыть вопрос, тем больше невысказанных контекстов мы оставляем за скобками. Мы экономим секунды на формулировке, но теряем дни на устранение последствий непонимания. Я заметил: в 90% случаев, когда проект «поехал не туда», виноват не кривой код, а кривое зеркало восприятия.';
  const proposal = 'Лекарство банально и сложно одновременно. Это правило «Пустого экрана». Перед тем как ответить, сбросьте в чат ровно то, что вы поняли, своими словами, без интерпретаций. Не «я думаю, ты имел в виду», а «я услышал, что ты просишь». Это займёт лишние 30 секунд.';
  const reproductionLabels = ['Не воспроизводится','Частично','Воспроизводится','Без оценки'];
  const opinionSummaryLabels = ['Воспроизводится','Частично','Не воспроизводится','Без оценки'];
  function initialDetail(row) {
    const example = row.id === 'INS-000067';
    const defaults = {
      problem:example ? observation : row.description,
      causes:row.rootCauses || (example ? observation : row.local ? '' : 'Повторный ввод данных и дополнительные ручные проверки увеличивают время выполнения процесса.'),
      proposal:row.solution || (example ? proposal : row.local ? '' : 'Упростить повторяющиеся действия и использовать данные, уже доступные участникам процесса.'),
      reproduction:row.local ? 'Без оценки' : 'Воспроизводится', reproductionComment:row.local ? '' : 'Полностью воспроизводится, у нас доля доработок даже выше.',
      effects:[
        {id:'external', title:'Повышение клиентского опыта (внешний клиент)', applicable:true, current:'321', target:'', unit:'мин', comment:'Укажите отличия эффекта в вашем ТБ', period:'Год'},
        {id:'internal', title:'Повышение клиентского опыта (внутренний клиент)', applicable:false, current:'', target:'', unit:'мин', comment:'', period:'Единоразово'}
      ],
      comments:[
        {author:'Царёв Кирилл Александрович', date:'01.05.2026', text:'Последний комментарий: комплексный анализ эффектов и проблем эквайринга'},
        {author:'Петров Игорь Иванович', date:'01.05.2026', text:'Первый комментарий'}
      ],
      userRating:row.local ? 0 : 3, averageRating:row.rating || (row.local ? 0 : 4.2),
      history:[
        {date:formatDate(row.created), text:'Инсайт создан'},
        {date:formatDate(row.created), text:'Указаны связанные процессы'},
        {date:formatDate(row.created), text:'Добавлены ожидаемые эффекты'},
        {date:'01.05.2026', text:'Добавлен комментарий'},
        {date:'12.09.2026', text:'Получены мнения территориальных банков'},
        {date:'12.09.2026', text:'Уточнены показатели ожидаемого эффекта'}
      ]
    };
    const effectSource = row.detail?.effects || row.effects || (row.local ? [] : defaults.effects);
    const suppliedEffects = effectSource.map((effect,index) => ({...effect,id:effect.id || `effect-${index}`, title:effect.title || effect.name || `Эффект ${index + 1}`, type:effect.type || 'Количественный', description:effect.description ?? (row.local ? '' : 'Время заполнения реестра сотрудников клиентом (компания 50+ человек).'), applicable:typeof effect.applicable === 'boolean' ? effect.applicable : true, current:String(effect.current ?? ''), target:String(effect.target ?? ''), unit:effect.unit ?? 'мин', baselineUnit:effect.baselineUnit ?? effect.unit ?? 'мин', comment:effect.comment || '', period:effect.frequency === 'Регулярно' ? effect.period || 'Год' : effect.frequency || effect.period || '—', baselineCurrent:String(effect.baselineCurrent ?? effect.current ?? ''), baselineTarget:String(effect.baselineTarget ?? effect.target ?? '')}));
    const suppliedComments = Array.isArray(row.commentsDraft) ? row.commentsDraft.map(comment => ({author:comment.author || row.author,date:comment.date || formatDate(row.created),text:comment.text || ''})) : null;
    return {...defaults, ...clone(row.detail || {}), effects:clone(suppliedEffects), comments:clone(row.detail?.comments || suppliedComments || (row.local ? [] : defaults.comments)), history:clone(row.detail?.history || (row.local ? [{date:formatDate(row.created),text:'Инсайт создан'}] : defaults.history))};
  }
  function create({mount, api = {}, getRow, onChange = () => {}}) {
    const host = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!host) throw new Error('Insight detail requires a mount element.');
    let id = null, row = null, draft = null, active = false, selects = [], decision = null, opinionDirty = false, opinionSelected = false, pendingReset = null, presentation = 'tab';
    const opened = new Map(), sessions = new Map();
    const confirmation = document.createElement('dialog');
    confirmation.id = 'insight-detail-approval-confirm'; confirmation.className = 'modal ia-confirm';
    confirmation.setAttribute('aria-labelledby','id-approval-confirm-title'); document.body.append(confirmation);
    let approvalDecision = null;
    const session = () => {
      if (!sessions.has(id)) sessions.set(id,{gate:window.BpmDrawerScroll.create(),top:0});
      return sessions.get(id);
    };
    const gate = () => sessions.get(id)?.gate;
    function suspend() {
      const current = sessions.get(id);
      if (current) {if (active && !host.hidden) current.top = host.querySelector('.id-detail-scroll')?.scrollTop || 0; current.gate.bind({});}
      if (confirmation.open) confirmation.close();
    }
    host.classList.add('insight-detail');
    function applyPresentation() {
      const drawer = presentation === 'drawer', header = host.querySelector('.id-detail-header'), scroll = host.querySelector('.id-detail-scroll');
      host.classList.toggle('is-drawer',drawer);
      if (!header || !scroll) return;
      if (drawer) scroll.before(header); else scroll.prepend(header);
      header.querySelector('.id-detail-drawer-actions').hidden = !drawer;
      const back = host.querySelector('.id-detail-footer [data-id-return]');
      if (back && canEditOpinion()) back.textContent = drawer ? 'Выйти' : 'К реестру';
      gate()?.refresh();
    }
    const flow = () => workflow()?.getWorkflow?.(row) || row.detail?.workflow || {};
    const actor = () => flow().currentActor || {name:window.BpmInsightStore?.currentUser || 'Иванов Иван Васильевич',bank:'Поволжский банк'};
    const canEditOpinion = () => !terminal(row) && (workflow()?.canEditOpinion ? workflow().canEditOpinion(row) : ['Согласовано','Мнения собраны'].includes(canonicalStatus(row)) && !!actor().bank && actor().bank !== row.bank);
    const canEditEffects = () => canEditOpinion() && ['Воспроизводится','Частично'].includes(draft.reproduction);
    const canDecide = () => !!workflow()?.canDecideTeam?.(row);
    const canApprove = () => !!workflow()?.canApprove?.(row);
    const responses = () => flow().opinions?.responses || [];
    function loadDraft() {
      draft = initialDetail(row);
      const own = responses().find(response => response.bank === actor().bank);
      opinionSelected = !!own;
      if (flow().opinions) {
        draft.reproduction = own?.reproduction || 'Без оценки';
        draft.reproductionComment = own?.comment || '';
        draft.effects = draft.effects.map((effect,index) => {
          const answer = own?.effects?.find(item => item.id === effect.id) || own?.effects?.[index];
          return {...effect,baselineUnit:effect.baselineUnit || effect.unit,current:answer?.current || '',target:answer?.target || '',unit:answer?.unit || effect.baselineUnit || effect.unit,comment:answer?.comment || '',applicable:!!answer?.applicable};
        });
      }
      opinionDirty = false;
    }
    function markOpinionChanged() {
      opinionDirty = true;
      const submit = host.querySelector('[data-id-send-opinion]');
      if (submit) gate()?.setDisabled(submit,!!pendingReset || !['Воспроизводится','Частично','Не воспроизводится'].includes(draft.reproduction));
    }
    function resetConfirmation() {
      if (!pendingReset) return '';
      const message = pendingReset.kind === 'reproduction' ? 'Инсайт не воспроизводится, оценки воспроизводимости эффектов будут удалены, продолжить?' : 'Эффект не актуален, значения будут удалены, продолжить?';
      return `<div class="id-detail-reset-confirmation" role="alertdialog" aria-label="Подтвердите изменение оценки"><p>${message}</p><div class="id-detail-decision-actions"><button type="button" class="button secondary-button" data-id-reset-cancel>Отменить</button><button type="button" class="button primary-button" data-id-reset-confirm>Продолжить</button></div></div>`;
    }
    const badge = value => `<button type="button" class="task-id-badge id-detail-badge" data-id-copy="${esc(value)}" aria-label="Скопировать ${esc(value)}">${esc(value)}${img('copy')}</button>`;
    const alert = text => `<div class="id-detail-alert">${img('info')}<p>${esc(text)}</p></div>`;
    const label = (text, content) => `<div class="id-detail-value"><span class="internal-label">${esc(text)}</span>${content}</div>`;
    const field = ({name,value = '',label:caption,placeholder = 'Введите...',disabled = false,numeric = false}) => `<label class="field id-detail-field${disabled ? ' is-disabled' : ''}"><span class="field-content"><span class="internal-label">${esc(caption)}</span><input data-id-field="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(caption)}" ${numeric ? 'inputmode="decimal"' : ''} ${disabled ? 'disabled' : ''}></span></label>`;
    function accordion(key,title,body,extra = '') {
      const isOpen = opened.has(`${id}:${key}`) ? opened.get(`${id}:${key}`) : key !== 'history';
      return `<section class="id-detail-accordion"><div class="id-detail-accordion-header"><button type="button" data-id-accordion="${key}" aria-expanded="${isOpen}" aria-controls="id-detail-${key}"><span>${title}</span></button>${extra}${['relations','attachments'].includes(key) ? '' : `<button type="button" class="icon-button" data-id-accordion="${key}" aria-label="${isOpen ? 'Свернуть' : 'Развернуть'}: ${esc(title.replace(/<[^>]*>/g,''))}" aria-expanded="${isOpen}" aria-controls="id-detail-${key}">${img(isOpen ? 'chevronUp' : 'historyChevron')}</button>`}</div><div class="id-detail-accordion-body" id="id-detail-${key}" ${isOpen ? '' : 'hidden'}>${body}</div></section>`;
    }
    function save(message, patch = {}) {
      if (!row || !draft) return;
      const detail = clone(draft);
      // Opinion drafts stay local until their own submit action. Comments and
      // ratings must never overwrite the author's baseline effect values.
      if (flow().opinions) {const authored = initialDetail(row); detail.effects = authored.effects; detail.reproduction = authored.reproduction; detail.reproductionComment = authored.reproductionComment;}
      onChange(id,{...patch,detail});
      row = getRow(id) || {...row,...patch};
      const historyTitle = host.querySelector('[data-id-accordion="history"] span');
      if (historyTitle) historyTitle.textContent = `История изменений ${draft.history.length}`;
      const historyList = host.querySelector('.id-detail-history');
      if (historyList) historyList.innerHTML = historyMarkup();
      if (message) api.toast?.(message,{success:true});
    }
    function history(text) {draft.history.unshift({date:today(),text});}
    function historyMarkup() {return draft.history.map(item => `<li><time>${esc(item.date)}</time><span>${esc(item.text)}</span></li>`).join('');}
    function closeSelects() {selects.forEach(select => select.close?.()); selects = [];}
    function getTasks() {
      const available = window.BpmTaskStore?.list?.() || window.BPM_TASK_DATA || [];
      if (Array.isArray(draft.taskIds)) return draft.taskIds.map(taskId => available.find(task => task.id === taskId)).filter(Boolean);
      const explicitlyLinked = available.filter(task => task.insightId === id || task.sourceInsightId === id);
      if (explicitlyLinked.length) return explicitlyLinked;
      if (row.local) return [];
      return available.slice(0,4);
    }
    function opinionView() {
      const ownBank = actor().bank;
      let rows = responses();
      // This projection is deliberately not assigned to draft.workflow or the
      // store. Only "Отправить мнение" persists the current bank's response.
      if (canEditOpinion() && opinionSelected) {
        const own = rows.find(item => item.bank === ownBank) || {};
        rows = [{...own,bank:ownBank,person:actor().name,reproduction:draft.reproduction,comment:draft.reproductionComment},...rows.filter(item => item.bank !== ownBank)];
      }
      rows = rows.map(item => ({...item,reproduction:opinionSummaryLabels.includes(item.reproduction) ? item.reproduction : 'Без оценки'}))
        .sort((a,b) => Number(b.bank === ownBank) - Number(a.bank === ownBank));
      const counts = opinionSummaryLabels.map(value => ({value,count:rows.filter(item => item.reproduction === value).length})).filter(item => item.count);
      return {rows,ownBank,summary:counts.length ? `(${counts.map(item => `${item.value} ${item.count}`).join(', ')})` : ''};
    }
    function opinionRowsMarkup(model) {
      return model.rows.map(item => `<tr${item.bank === model.ownBank ? ' data-id-opinion-own' : ''}><td><strong>${esc(item.bank)}</strong><small class="${item.bank === model.ownBank ? 'id-detail-you' : ''}">${esc(item.bank === model.ownBank ? 'Вы' : item.person || '')}</small></td><td>${esc(item.reproduction)}</td><td>${esc(item.comment || '—')}</td></tr>`).join('');
    }
    function opinionsContent(model) {
      return `<p class="id-detail-opinions-heading id-detail-subheading">Мнения территориальных банков <span class="secondary id-detail-opinion-total">${model.rows.length}</span> <span class="secondary id-detail-opinion-summary">${esc(model.summary)}</span></p>${model.rows.length ? `<div id="id-detail-opinions-table" class="id-detail-table-scroll" tabindex="0" role="region" aria-label="Мнения территориальных банков"><table class="id-detail-table id-detail-opinions-table"><colgroup><col><col><col></colgroup><thead><tr><th>Территориальный банк</th><th>Оценка</th><th>Комментарий</th></tr></thead><tbody>${opinionRowsMarkup(model)}</tbody></table></div>` : '<p class="secondary">Мнения территориальных банков пока не получены.</p>'}`;
    }
    function opinions() {return `<div class="id-detail-opinions">${opinionsContent(opinionView())}</div>`;}
    function refreshOpinions() {
      const container = host.querySelector('.id-detail-opinions');
      if (!container) return;
      const model = opinionView(), body = container.querySelector('tbody');
      if (!body || !model.rows.length) {container.innerHTML = opinionsContent(model); return;}
      container.querySelector('.id-detail-opinion-total').textContent = String(model.rows.length);
      container.querySelector('.id-detail-opinion-summary').textContent = model.summary;
      // Keep both the container and horizontal scroll viewport in place while
      // typing; only the derived row text changes, never the active textarea.
      body.innerHTML = opinionRowsMarkup(model);
    }
    function effects() {
      if (!draft.effects.length) return '<p class="secondary">Ожидаемые эффекты пока не добавлены.</p>';
      return draft.effects.map((effect,index) => {
        const baselineCurrent = effect.baselineCurrent || '—', baselineTarget = effect.baselineTarget || '—';
        const description = effect.description ?? 'Время заполнения реестра сотрудников клиентом (компания 50+ человек).';
        const sourceUnit = effect.baselineUnit ?? effect.unit ?? '';
        const feedback = responses().map(response => ({...response,effect:response.effects?.find(item => item.id === effect.id) || response.effects?.[index]})).filter(response => response.effect);
        const editable = canEditEffects(), visibleFeedback = feedback.filter(response => !editable || response.bank !== actor().bank);
        const counts = feedback.length ? ` <span class="secondary id-detail-regular">(Актуальных ${feedback.filter(item => item.effect.applicable).length}, Неактуальных ${feedback.filter(item => !item.effect.applicable).length})</span>` : '';
        return `<section class="id-detail-effect" data-id-effect="${index}"><div class="id-detail-effect-heading"><span class="id-detail-effect-number">${index + 1}</span><div><h3>${esc(effect.title)}${counts}</h3><p>${esc(description)}</p><div class="id-detail-effect-values">${label('Тип эффекта',`<strong>${esc(effect.type || 'Количественный')}</strong>`)}${img('arrow')}${label('Текущее значение',`<strong>${esc(baselineCurrent)} <span class="id-detail-regular">${esc(sourceUnit)}</span></strong>`)}${label('Целевое значение',`<strong>${esc(baselineTarget)} <span class="id-detail-regular">${esc(sourceUnit)}</span></strong>`)}${label('Периодичность',`<strong>${esc(effect.period)}</strong>`)}</div></div></div>
          ${editable || visibleFeedback.length ? `<div class="id-detail-table-scroll" tabindex="0" role="region" aria-label="Показатели эффекта ${index + 1}"><table class="id-detail-table id-detail-effects-table"><colgroup><col><col><col><col><col><col></colgroup><thead><tr><th>Территориальный банк</th><th>Актуальность</th><th>Текущее</th><th>Целевое</th><th>Ед. изм.</th><th>Комментарий</th></tr></thead><tbody>${editable ? `<tr class="id-detail-edit-row"><td><strong>Актуален ли эффект<br>для вашего банка?</strong><small>${esc(actor().bank)}</small></td><td><div class="id-detail-applicability"><button type="button" class="id-detail-switch" role="switch" aria-checked="${effect.applicable}" aria-label="Актуальность эффекта ${index + 1}" data-id-applicable="${index}"><span>${img(effect.applicable ? 'on' : 'off')}</span></button><strong data-id-applicable-label>${effect.applicable ? 'Да' : 'Нет'}</strong></div></td><td>${field({name:`effect:${index}:current`,value:effect.current,label:'Текущее значение',disabled:!effect.applicable,numeric:true})}</td><td>${field({name:`effect:${index}:target`,value:effect.target,label:'Целевое значение',disabled:!effect.applicable,numeric:true})}</td><td><div id="id-detail-unit-${index}" class="id-detail-unit select-host"></div></td><td>${field({name:`effect:${index}:comment`,value:effect.comment,label:'Ваш комментарий',placeholder:'Укажите отличия эффекта в вашем ТБ',disabled:!effect.applicable})}</td></tr>` : ''}${visibleFeedback.map(response => `<tr><td><strong>${esc(response.bank)}</strong><small>${esc(response.person || '')}</small></td><td>${response.effect.applicable ? 'Да' : 'Нет'}</td><td>${esc(response.effect.current || '—')}</td><td>${esc(response.effect.target || '—')}</td><td>${esc(response.effect.unit || '—')}</td><td>${esc(response.effect.comment || '—')}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>`;
      }).join('');
    }
    function taskList(tasks) {
      return `<div class="id-detail-tasks">${tasks.map((task,index) => `<article class="id-detail-task"><div class="id-detail-task-meta"><span class="id-detail-status">${img('taskDot')}${esc(task.status || 'Новая')}</span><div class="id-detail-task-tags"><span class="tag">${esc(task.type || 'Доступы')}</span>${badge(task.id)}${img('direction')}${badge(task.processCode || row.related?.[0]?.code || 'П0800')}</div></div><div class="id-detail-task-body"><div><button type="button" class="id-detail-task-title" data-id-task="${esc(task.id)}">${esc(task.title)}</button><small>${esc(task.initiator || row.author)}</small></div><span class="id-detail-deadline">${img('deadline')}до ${formatDate(task.deadline || '2026-09-21')}</span></div></article>`).join('')}</div>`;
    }
    function commentList() {
      return `<div class="id-detail-comment-list">${draft.comments.map(comment => `<article><small>${esc(comment.author)} | ${esc(comment.date)}</small><p>${esc(comment.text)}</p></article>`).join('')}</div><form class="id-detail-comment-form" data-id-comment-form>${field({name:'newComment',label:'Комментарий',placeholder:'Введите текст комментария'})}<button type="submit" class="button secondary-button">Отправить</button></form>`;
    }
    function footer() {
      const back = '<button type="button" class="button secondary-button" data-id-return>К реестру</button>';
      if (canApprove()) {
        const due = flow().stages?.find(stage => stage.status === 'current')?.dueDate;
        return `<footer class="id-detail-footer"><button type="button" class="button secondary-button" data-id-approval="reject">${img('reject')}Отклонить</button>${due ? `<span class="id-detail-deadline">${img('ringer')}до ${esc(formatDate(due))}</span>` : ''}<button type="button" class="button primary-button" data-id-approval="approve">Согласовать${img('actionArrow')}</button></footer>`;
      }
      if (canDecide()) return `<footer class="id-detail-footer">${decision === 'reject' ? '<button type="button" class="button secondary-button" data-id-decision-cancel>Отменить</button><button type="submit" form="id-detail-decision-form" class="button primary-button" disabled data-id-decision-submit>Подтвердить отклонение</button>' : `<button type="button" class="button secondary-button" data-id-reject>${img('reject')}Отклонить</button><button type="button" class="button primary-button" data-id-take>Взять в работу${img('actionArrow')}</button>`}</footer>`;
      if (canEditOpinion()) return `<footer class="id-detail-footer">${back}<button type="button" class="button primary-button" data-id-send-opinion ${!opinionDirty || draft.reproduction === 'Без оценки' || pendingReset ? 'disabled' : ''}>Отправить мнение</button></footer>`;
      return `<footer class="id-detail-footer id-detail-footer--readonly"><span class="id-detail-status">${window.BpmInsightPresentation.status(row)}</span><button type="button" class="button secondary-button" data-id-return>Выйти</button></footer>`;
    }
    function render() {
      if (!active || !row) return;
      const current = session(), oldScroll = host.querySelector('.id-detail-scroll');
      if (oldScroll && host.dataset.insightId === id) current.top = oldScroll.scrollTop;
      current.gate.bind({});
      closeSelects();
      const tasks = getTasks(), process = row.related?.[0];
      const editable = canEditOpinion(), opinionDue = flow().opinions?.dueDate;
      const showOpinions = canonicalStatus(row) !== 'Новый' && (row.source === 'ТБ' || !!opinionDue);
      const path = (window.BPM_DATA || []).find(item => item.entity === 'paths' && item.title === row.path);
      const links = (process?.variants || (row.local ? [] : ['Выдача автокредита с кредитным потенциалом','Оформление кредитной документации и выдача кредита на приобретение ТС'])).map(value => `<button type="button" class="id-detail-relation" data-id-process="${esc(process?.id || '')}">${esc(value)}</button>`).join('');
      const products = row.products?.length ? row.products.map(value => esc(typeof value === 'string' ? value : value.name || value.title)).join(', ') : row.local ? 'Не указаны' : 'Система SberBPM';
      const relations = `${label('Варианты предоставления результата процесса',`<div class="id-detail-relation-list">${links || '<p class="secondary">Не указаны</p>'}</div>`)}${label('Продукты ЕКОУ',`<div class="id-detail-product">${row.local ? '' : badge('ID0000')}<span>${products}</span></div>`)}`;
      const fileList = row.attachments || (row.local ? [] : [{name:'file_name1.pdf'},{name:'file_name long naming 2.pdf'}]);
      const attachments = fileList.length ? fileList.map(file => `<button type="button" class="id-detail-file" data-id-file="${esc(file.name)}">${img('file')}<span>${esc(file.name)}</span></button>`).join('') : '<p class="secondary">Вложения отсутствуют.</p>';
      const tracker = window.BpmInsightApproval.tracker(row);
      host.dataset.insightId = id;
      host.innerHTML = `<div class="id-detail-scroll" tabindex="-1"><header class="id-detail-header"><div class="id-detail-drawer-actions" hidden><button type="button" class="id-detail-link" data-id-open-tab>Открыть во вкладке</button><button type="button" class="task-drawer-close" data-id-drawer-close aria-label="Закрыть инсайт">${img('close')}</button></div><span class="internal-label">Инсайт</span><h2 id="insight-detail-title">${esc(row.title)}</h2><div class="id-detail-meta">${window.BpmInsightPresentation.sourceBadge(row,'tag')}${badge(row.id)}<span class="id-detail-status">${statusMarkup(row)}</span></div></header>
        <div class="id-detail-overview${tracker ? ' has-tracker' : ''}"><div class="id-detail-description-column"><div class="id-detail-context">${label('Клиентский путь',`${path ? `<div>${badge(`КП${path.number}`)}</div>` : ''}<p>${esc(row.path || 'Не указан')}</p>`)}${label('Процесс',`${process ? `<div>${badge(process.code)}</div><button type="button" class="id-detail-process-name" data-id-process="${esc(process.id)}">${esc(process.title)}</button>` : '<p>Не указан</p>'}`)}</div>
        <section class="id-detail-description"><h3>Описание инсайта</h3>${label('Проблема / наблюдение',`<p>${esc(draft.problem)}</p>`)}${label('Корневые причины',`<p>${esc(draft.causes)}</p>`)}${label('Предложение/решение',`<p>${esc(draft.proposal)}</p>`)}</section></div>${tracker}</div>
        <div class="id-detail-pair">${accordion('relations','Связи процесса',relations)}${accordion('attachments',`Вложения ${fileList.length}`,attachments)}</div>
        ${showOpinions ? `<section class="id-detail-reproduction"><div class="id-detail-section-heading"><h3>Оценка воспроизводительности в ТБ</h3>${canonicalStatus(row) === 'Согласовано' && opinionDue ? `<span class="id-detail-deadline">${img('ringer')}до ${formatDate(opinionDue)}</span>` : ''}</div>${editable ? `<div class="id-detail-reproduction-alert" data-id-reproduction-alert ${opinionSelected ? 'hidden' : ''}>${alert(`Оцените инсайт и его эффекты применительно к своему территориальному банку — ${actor().bank}`)}</div><div class="id-detail-opinion-form"><strong class="id-detail-opinion-label">Ваша оценка ${img('purpleArrow')}</strong><div><div class="id-detail-reproduction-buttons" role="group" aria-label="Ваша оценка воспроизводительности">${reproductionLabels.map(value => `<button type="button" class="button secondary-button" data-id-reproduction="${value}" aria-pressed="${value === draft.reproduction}">${value}<span class="id-detail-reproduction-check" ${value === draft.reproduction ? '' : 'hidden'}>${img('tick')}</span></button>`).join('')}</div><label class="field id-detail-textarea"><span class="internal-label">Комментарий</span><textarea data-id-field="reproductionComment" maxlength="1000" aria-label="Комментарий к воспроизводительности">${esc(draft.reproductionComment)}</textarea></label></div></div>` : ''}${opinions()}</section>` : ''}
        <section class="id-detail-effects"><h3>Ожидаемые эффекты</h3>${resetConfirmation()}${editable ? alert(draft.reproduction === 'Не воспроизводится' ? 'Инсайт не воспроизводится в вашем банке — эффекты не оцениваются.' : 'Отметьте, какие эффекты актуальны для вашего банка, и укажите свои значения, если они у вас есть.') : ''}${effects()}</section>
        ${accordion('tasks',`Задачи ${tasks.length}`,taskList(tasks),`<button type="button" class="id-detail-link" data-id-create-task>Создать задачу${img('plus')}</button>`)}
        <section class="id-detail-participants"><h4>Участники инсайта</h4><div>${[['Владелец процесса',row.owner || 'Не назначен'],['Автор',row.author || 'Не указан']].map(([role,name]) => `<div class="id-detail-participant"><span class="avatar">${img('person')}</span><div><small>${esc(role)}</small><p>${esc(name)}</p></div></div>`).join('')}</div></section>
        ${accordion('comments',`Комментарии ${draft.comments.length}`,commentList())}<section class="id-detail-rating" aria-label="Оценка инсайта"><div>${label('Моя оценка',`<div class="id-detail-stars" role="group" aria-label="Ваша оценка инсайта">${[1,2,3,4,5].map(value => `<button type="button" data-id-rating="${value}" aria-label="Оценка ${value} из 5" aria-pressed="${draft.userRating === value}" class="${value <= draft.userRating ? 'is-rated' : ''}">${img(value <= draft.userRating ? 'starOn' : 'star')}</button>`).join('')}<strong data-id-rating-value>${number(draft.userRating)}</strong></div>`)}${label('Средняя',`<div class="id-detail-average"><strong>${number(draft.averageRating)}</strong></div>`)}</div></section>
        ${accordion('history',`История изменений ${draft.history.length}`,`<ol class="id-detail-history">${historyMarkup()}</ol>`)}
        ${canDecide() && decision === 'reject' ? `<form id="id-detail-decision-form" class="id-detail-decision" data-id-decision-form><h3>Отклонить инсайт</h3><label class="field id-detail-textarea"><span class="internal-label">Причина отклонения · обязательно</span><textarea name="decisionComment" maxlength="1000" required aria-label="Причина отклонения" placeholder="Укажите причину отклонения"></textarea></label><p class="field-error" data-id-decision-error hidden>Комментарий обязателен</p></form>` : ''}
        </div>${footer()}<p class="sr-only" role="status" aria-live="polite" data-id-announcement></p>`;
      draft.effects.forEach((effect,index) => {
        if (!host.querySelector(`#id-detail-unit-${index}`)) return;
        const select = api.createSelect?.(`id-detail-unit-${index}`,{label:`Ед. изм. эффекта ${index + 1}`,allowAll:false,placeholder:'Ед. изм.',values:effect.unit ? [effect.unit] : [],options:[...new Set([effect.unit,'мин','час','день','балл','%','руб.','шт.'])].filter(Boolean).map(value => ({value,label:value})),onChange:values => {if (!canEditEffects()) return; draft.effects[index].unit = values[0] || 'мин'; markOpinionChanged();}});
        if (select) {selects[index] = select; select.input.setAttribute('aria-label',`Единица измерения эффекта ${index + 1}`); setEffectEnabled(index,effect.applicable);}
      });
      applyPresentation();
      const scroll = host.querySelector('.id-detail-scroll');
      scroll.scrollTop = current.top;
      current.gate.bind({root:host,scroll,buttons:host.querySelectorAll('.id-detail-footer .primary-button'),form:host.querySelector('[data-id-decision-form]')});
    }
    function setEffectEnabled(index,enabled) {
      const section = host.querySelector(`[data-id-effect="${index}"]`), select = selects[index];
      if (!section) return;
      const editable = enabled && canEditEffects();
      section.querySelectorAll('[data-id-field]').forEach(input => {input.disabled = !editable; input.closest('.field').classList.toggle('is-disabled',!editable);});
      const toggle = section.querySelector('[data-id-applicable]');
      if (toggle) {toggle.disabled = !canEditEffects(); toggle.setAttribute('aria-checked',String(enabled)); toggle.querySelector('span').innerHTML = img(enabled ? 'on' : 'off'); section.querySelector('[data-id-applicable-label]').textContent = enabled ? 'Да' : 'Нет';}
      if (select) {select.disabled = !editable; select.input.disabled = !editable; select.toggle.disabled = !editable; select.control.classList.toggle('is-disabled',!editable); select.host.classList.toggle('is-disabled',!editable); if (!editable) select.close();}
    }
    function announce(text) {const element = host.querySelector('[data-id-announcement]'); if (element) element.textContent = text;}
    function applyWorkflowPatch(patch,message) {
      onChange(id,patch);
      row = getRow(id) || {...row,...patch};
      loadDraft(); decision = null; pendingReset = null; render();
      api.toast?.(message,{success:true}); announce(message);
    }
    function decideTeam(value,comment = '') {
      if (!gate()?.allow()) return;
      row = getRow(id) || row;
      if (!canDecide()) {decision = null; render(); api.toast?.('Решение по этому инсайту уже принято или недоступно для вашей роли.'); return;}
      try {applyWorkflowPatch(workflow().decideTeam(row,{decision:value,comment}),value === 'reject' ? 'Инсайт отклонён' : 'Инсайт взят в работу');}
      catch (error) {api.toast?.(error.message || 'Не удалось сохранить решение.');}
    }
    function confirmApproval(value) {
      if (value === 'approve' && !gate()?.allow()) return;
      row = getRow(id) || row;
      if (!canApprove()) {render(); api.toast?.('Решение по инсайту уже принято или согласование недоступно.'); return;}
      approvalDecision = {id,value};
      const reject = value === 'reject';
      confirmation.innerHTML = `<form class="ia-confirm-form"><div class="modal-heading"><h2 id="id-approval-confirm-title">${reject ? 'Отклонить инсайт?' : 'Согласовать инсайт?'}</h2><button type="button" class="task-drawer-close" data-id-approval-close aria-label="Закрыть подтверждение">${img('close')}</button></div><p>${reject ? 'Внесите комментарий для обоснования отклонения.' : 'Комментарий к согласованию необязателен.'}</p><label class="ia-comment-field"><span class="internal-label">Комментарий${reject ? ' · обязательно' : ''}</span><textarea name="decisionComment" aria-label="Комментарий к решению" maxlength="1000" ${reject ? 'required' : ''}></textarea></label><p class="ia-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary-button" data-id-approval-close>Отмена</button><button type="submit" class="button primary-button">${reject ? 'Отклонить' : 'Согласовать'}</button></div></form>`;
      confirmation.showModal(); confirmation.querySelector('textarea').focus();
    }
    confirmation.addEventListener('click',event => {if (event.target.closest('[data-id-approval-close]')) confirmation.close();});
    confirmation.addEventListener('close',() => {if (active) host.querySelector(`[data-id-approval="${approvalDecision?.value}"]`)?.focus({preventScroll:true});});
    confirmation.addEventListener('submit',event => {
      event.preventDefault();
      if (!active || approvalDecision?.id !== id || approvalDecision.value === 'approve' && !gate()?.allow()) return;
      try {
        row = getRow(id) || row;
        const patch = workflow().decide(row,{decision:approvalDecision.value,comment:confirmation.querySelector('textarea').value.trim()});
        const message = approvalDecision.value === 'approve' ? 'Инсайт согласован' : 'Решение об отклонении сохранено';
        confirmation.close(); applyWorkflowPatch(patch,message);
      } catch (error) {const target = confirmation.querySelector('.ia-error'); target.textContent = error.message || 'Не удалось сохранить решение.'; target.hidden = false;}
    });
    function handleClick(event) {
      if (!active) return;
      const button = event.target.closest('button'); if (!button || button.disabled) return;
      if (button.hasAttribute('data-id-drawer-close')) {api.closeDetail?.(); return;}
      if (button.hasAttribute('data-id-open-tab')) {api.openInTab?.(id); return;}
      if (button.hasAttribute('data-id-return')) {api.closeDetail?.(); return;}
      if (button.hasAttribute('data-id-approval')) {confirmApproval(button.dataset.idApproval); return;}
      if (button.hasAttribute('data-id-copy')) {api.copyText?.(button.dataset.idCopy); return;}
      if (button.hasAttribute('data-id-process')) {if (button.dataset.idProcess) api.openProcess?.(button.dataset.idProcess,button); else api.toast?.('Связь с процессом показана как пример.'); return;}
      if (button.hasAttribute('data-id-file')) {api.toast?.('Демонстрационное вложение: файл PDF не загружен в прототип.'); return;}
      if (button.hasAttribute('data-id-accordion')) {
        const key = button.dataset.idAccordion, body = host.querySelector(`#id-detail-${key}`), isOpen = body.hidden;
        body.hidden = !isOpen; opened.set(`${id}:${key}`,isOpen);
        host.querySelectorAll(`[data-id-accordion="${key}"]`).forEach(control => {control.setAttribute('aria-expanded',String(isOpen)); if (control.classList.contains('icon-button')) control.innerHTML = img(isOpen ? 'chevronUp' : 'historyChevron');}); return;
      }
      if (button.hasAttribute('data-id-reproduction')) {
        if (!canEditOpinion()) return;
        if (button.dataset.idReproduction === 'Не воспроизводится' && draft.effects.some(effect => effect.applicable || effect.current || effect.target || effect.comment)) {pendingReset = {kind:'reproduction'}; render(); host.querySelector('[data-id-reset-cancel]')?.focus(); return;}
        pendingReset = null;
        draft.reproduction = button.dataset.idReproduction;
        opinionSelected = true;
        markOpinionChanged(); render(); return;
      }
      if (button.hasAttribute('data-id-applicable')) {if (!canEditEffects()) return; const index = Number(button.dataset.idApplicable), effect = draft.effects[index]; if (effect.applicable && (effect.current || effect.target || effect.comment)) {pendingReset = {kind:'effect',index}; render(); host.querySelector('[data-id-reset-cancel]')?.focus(); return;} effect.applicable = !effect.applicable; setEffectEnabled(index,effect.applicable); markOpinionChanged(); return;}
      if (button.hasAttribute('data-id-reset-cancel')) {pendingReset = null; render(); return;}
      if (button.hasAttribute('data-id-reset-confirm')) {if (!pendingReset || !canEditOpinion()) return; const cleared = effect => ({...effect,applicable:false,current:'',target:'',comment:''}); if (pendingReset.kind === 'reproduction') {draft.reproduction = 'Не воспроизводится'; opinionSelected = true; draft.effects = draft.effects.map(cleared);} else draft.effects[pendingReset.index] = cleared(draft.effects[pendingReset.index]); pendingReset = null; markOpinionChanged(); render(); return;}
      if (button.hasAttribute('data-id-send-opinion')) {
        if (!gate()?.allow()) return;
        row = getRow(id) || row;
        if (!canEditOpinion()) {loadDraft(); render(); api.toast?.('Сбор мнений завершён: решение команды уже принято.'); return;}
        const invalid = host.querySelector('[aria-invalid="true"]'); if (invalid) {invalid.focus(); api.toast?.('Исправьте значение показателя перед отправкой.'); return;}
        try {applyWorkflowPatch(workflow().saveOpinion(row,{reproduction:draft.reproduction,comment:draft.reproductionComment,effects:draft.effects.map(effect => ({id:effect.id,applicable:effect.applicable,current:effect.current,target:effect.target,unit:effect.unit,comment:effect.comment}))}),'Мнение вашего банка сохранено');}
        catch (error) {api.toast?.(error.message || 'Не удалось сохранить мнение.');} return;
      }
      if (button.hasAttribute('data-id-rating')) {draft.userRating = Number(button.dataset.idRating); draft.ratingTouched = true; host.querySelectorAll('[data-id-rating]').forEach(control => {const filled = Number(control.dataset.idRating) <= draft.userRating; control.setAttribute('aria-pressed',String(Number(control.dataset.idRating) === draft.userRating)); control.classList.toggle('is-rated',filled); control.querySelector('img').src = assets[filled ? 'starOn' : 'star'];}); host.querySelector('[data-id-rating-value]').textContent = number(draft.userRating); history('Обновлена ваша оценка инсайта'); save('Ваша оценка сохранена'); return;}
      if (button.hasAttribute('data-id-create-task')) {if (api.createTask) api.createTask({insightId:id,processId:row.related?.[0]?.id,trigger:button}); else api.toast?.('Создание связанной задачи подключается отдельным действием.'); return;}
      if (button.hasAttribute('data-id-task')) {if (api.openTask) api.openTask(button.dataset.idTask,button); else api.toast?.('Деталка связанной задачи недоступна в этом режиме.'); return;}
      if (button.hasAttribute('data-id-reject')) {if (!canDecide()) return; decision = 'reject'; render(); host.querySelector('[name="decisionComment"]')?.focus(); return;}
      if (button.hasAttribute('data-id-decision-cancel')) {decision = null; render(); host.querySelector('[data-id-reject]')?.focus(); return;}
      if (button.hasAttribute('data-id-take')) {decideTeam('accept'); return;}
    }
    function handleChange(event) {
      if (!active || !event.target.matches('[data-id-field]')) return;
      const input = event.target, key = input.dataset.idField;
      if (key === 'newComment') return;
      if (!canEditOpinion()) return;
      if (key.startsWith('effect:')) {
        if (!canEditEffects()) return;
        const [,index,fieldName] = key.split(':');
        if (!draft.effects[Number(index)].applicable) return;
        if (['current','target'].includes(fieldName) && input.value.trim() && !/^-?\d+(?:[.,]\d+)?$/.test(input.value.trim())) {input.setAttribute('aria-invalid','true'); input.closest('.field').classList.add('error'); api.toast?.('Введите число для показателя эффекта.'); return;}
        input.removeAttribute('aria-invalid'); input.closest('.field').classList.remove('error'); draft.effects[Number(index)][fieldName] = input.value.trim();
      } else draft[key] = input.value;
      markOpinionChanged();
      if (key === 'reproductionComment') refreshOpinions();
    }
    function handleInput(event) {
      if (!active) return;
      if (event.target.matches('[data-id-field]') && event.target.dataset.idField !== 'newComment') {
        if (canEditOpinion()) {
          if (event.target.dataset.idField === 'reproductionComment') {draft.reproductionComment = event.target.value; refreshOpinions();}
          markOpinionChanged();
        }
        return;
      }
      if (!event.target.matches('[name="decisionComment"]')) return;
      const empty = !event.target.value.trim();
      gate()?.setDisabled(host.querySelector('[data-id-decision-submit]'),empty);
      event.target.setAttribute('aria-invalid',String(empty));
      host.querySelector('[data-id-decision-error]').hidden = !empty;
    }
    function handleSubmit(event) {
      if (event.target.matches('[data-id-decision-form]')) {event.preventDefault(); if (!gate()?.allow()) return; const input = event.target.querySelector('textarea'), comment = input.value.trim(); if (!comment) {input.setAttribute('aria-invalid','true'); host.querySelector('[data-id-decision-error]').hidden = false; input.focus(); return;} decideTeam('reject',comment); return;}
      if (!event.target.matches('[data-id-comment-form]')) return;
      event.preventDefault(); const input = event.target.querySelector('input'), text = input.value.trim();
      if (!text) {input.focus(); api.toast?.('Введите текст комментария.'); return;}
      draft.comments.unshift({author:actor().name || window.BpmInsightStore?.currentUser || 'Иванов Иван Васильевич',date:today(),text}); history('Добавлен комментарий');
      save('Комментарий добавлен',{comments:Number(row.comments || 0) + 1});
      const body = host.querySelector('#id-detail-comments'); body.innerHTML = commentList();
      const title = host.querySelector('[data-id-accordion="comments"] span'); if (title) title.textContent = `Комментарии ${draft.comments.length}`;
      body.querySelector('input').focus();
    }
    host.addEventListener('click',handleClick); host.addEventListener('change',handleChange); host.addEventListener('input',handleInput); host.addEventListener('submit',handleSubmit);
    return {
      show(value,options = {}) {const keepDraft = options.preserveDraft && id === value && draft && row && JSON.stringify(row) === JSON.stringify(getRow(value)); suspend(); closeSelects(); id = value; row = getRow(id); if (!row) {active = false; host.hidden = true; return false;} if (!keepDraft) {loadDraft(); decision = null; pendingReset = null;} active = true; host.hidden = false; host.removeAttribute('data-insight-id'); render(); return true;},
      setPresentation(value) {presentation = value === 'drawer' ? 'drawer' : 'tab'; applyPresentation();},
      hide() {suspend(); closeSelects(); active = false; host.hidden = true;},
      close(value) {const current = sessions.get(value); current?.gate.end(); sessions.delete(value); if (value === id) {host.removeAttribute('data-insight-id'); if (confirmation.open) confirmation.close();}},
      getScrollTop() {return host.querySelector('.id-detail-scroll')?.scrollTop || 0;},
      setScrollTop(value) {const scroll = host.querySelector('.id-detail-scroll'); if (scroll) {scroll.scrollTop = Math.max(0,Number(value) || 0); session().top = scroll.scrollTop; gate()?.refresh();}},
      refresh() {if (!active || !id) return; row = getRow(id); if (row) {loadDraft(); decision = null; pendingReset = null; render();}},
      destroy() {suspend(); closeSelects(); sessions.forEach(current => current.gate.end()); sessions.clear(); confirmation.remove(); host.removeEventListener('click',handleClick); host.removeEventListener('change',handleChange); host.removeEventListener('input',handleInput); host.removeEventListener('submit',handleSubmit); host.replaceChildren(); active = false;},
      isActive:() => active,
      getId:() => id
    };
  }
  window.BpmInsightDetail = Object.freeze({create,initialDetail});
})();

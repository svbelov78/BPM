/* Insight detail · Products-BPM 305:46304. Shared tab / cabinet-drawer content.
 * Data supplied by the registry; only the user's bank row is editable.
 * All mutations are delegated to the caller's demonstration store. */
(() => {
  'use strict';
  const esc = value => window.BpmTaskVisuals.escape(value);
  const copy = value => esc(window.BpmCopyTypography?.format(value) ?? value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const formatDate = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0,10).split('-').reverse().join('.') : String(value || '');
  const today = () => new Date().toLocaleDateString('ru-RU');
  const number = value => Number(value || 0).toFixed(1).replace('.', ',');
  // Literal paths are embedded by the standalone builder.
  const assets = {
    star:'assets/insight-detail/imgIcon24StarOff.svg', starOn:'assets/insight-detail/imgIcon24StarOn.svg', deadline:'assets/insight-detail/imgDeadlineIndicatorPdfSource.svg',
    copy:'assets/insight-detail/imgIcon16Copy.svg',
    arrow:'assets/insight-detail/imgIcon24ArrowRight.svg', ringer:'assets/insight-detail/imgIcon24Ringer.svg', dot:'assets/insight-detail/imgDot.svg',
    file:'assets/insight-detail/imgFileIcon.svg', info:'assets/insight-detail/imgIcon16Info.svg', purpleArrow:'assets/insight-detail/imgIcon24ArrowRight1.svg',
    tick:'assets/insight-detail/imgIcon24Tick.svg', chevronDown:'assets/insight-detail/imgIcon16ChevronDown.svg',
    plus:'assets/insight-detail/imgAddIcon.svg', chevronUp:'assets/insight-detail/imgChevron.svg', taskDot:'assets/insight-detail/imgDot1.svg',
    direction:'assets/insight-detail/imgRelatedDirection.svg', person:'assets/insight-detail/imgIcon24Person.svg',
    historyChevron:'assets/insight-detail/imgChevron1.svg', reject:'assets/insight-approval/stop.svg', emptyTasks:'assets/insight-approval/empty.svg', actionArrow:'assets/insight-detail/imgIcon24ArrowRight2.svg', close:'assets/insight-create/form-imgIcon24Exit.svg',
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
  const reproductionLabels = ['Не воспроизводится','Частично','Воспроизводится'];
  const opinionSummaryLabels = ['Воспроизводится','Частично','Не воспроизводится','Без оценки'];
  const isQualitativeEffect = effect => String(effect?.type || '').trim() === 'Качественный';
  // Legacy qualitative records can still carry numeric values from old forms.
  // They are not inputs in the revised qualitative assessment and cannot make
  // its empty comment look like a destructive edit.
  const hasEffectValues = effect => !!effect.comment || !isQualitativeEffect(effect) && !!(effect.current || effect.target);
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
  // A display-only projection shared by tabs and preview/approval drawers.
  // The author's original metrics never come from the current bank's draft.
  function effectTableModel(row,effect,index,{own = null} = {}) {
    const originals = initialDetail(row).effects;
    const original = originals.find(item => item.id === effect.id) || originals[index] || effect;
    const authorBank = String(row.bank || '').trim();
    const bankKey = value => String(value || '').trim().toLocaleLowerCase('ru-RU');
    const author = {bank:authorBank || row.source || 'Источник не указан',isAuthor:true,effect:{
      applicable:true,current:original.baselineCurrent ?? original.current,
      target:original.baselineTarget ?? original.target,unit:original.baselineUnit ?? original.unit,
      comment:original.baselineComment ?? original.comment ?? ''
    }};
    const model = workflow()?.getWorkflow?.(row) || row.detail?.workflow || {};
    const rows = [author], seen = new Set(authorBank ? [bankKey(authorBank)] : []);
    if (own?.bank && !seen.has(bankKey(own.bank))) {rows.push({...own,isOwn:true}); seen.add(bankKey(own.bank));}
    for (const response of model.opinions?.responses || []) {
      const answer = response.effects?.find(item => item.id === effect.id) || response.effects?.[index];
      const key = bankKey(response.bank);
      if (!answer || !key || seen.has(key)) continue;
      rows.push({...response,effect:answer}); seen.add(key);
    }
    return {rows,bankHeading:authorBank ? 'Территориальный банк' : 'Территориальный банк / источник',
      active:rows.filter(item => item.effect.applicable === true).length,inactive:rows.filter(item => item.effect.applicable === false).length};
  }
  function create({mount, api = {}, getRow, onChange = () => {}}) {
    const host = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!host) throw new Error('Insight detail requires a mount element.');
    let id = null, row = null, draft = null, active = false, selects = [], decision = null, opinionDirty = false, opinionSelected = false, pendingReset = null, presentation = 'tab', tasksLoadingId = null, tasksLoadingTimer = null, tasksLoadingFrame = null;
    const opened = new Map(), sessions = new Map(), taskViews = new Map(), taskSnapshot = new Map(), pendingWithdrawals = new Map();
    const taskMotionTimers = new Map(), taskMotionAnimations = new Set();
    let taskMotionEpoch = 0, taskMotionRunning = false, taskMotionFrame = null;
    const confirmation = document.createElement('dialog');
    confirmation.id = 'insight-detail-approval-confirm'; confirmation.className = 'modal ia-confirm';
    confirmation.setAttribute('aria-labelledby','id-approval-confirm-title'); document.body.append(confirmation);
    let approvalDecision = null;
    const session = () => {
      if (!sessions.has(id)) sessions.set(id,{gate:window.BpmDrawerScroll.create(),top:0});
      return sessions.get(id);
    };
    const gate = () => sessions.get(id)?.gate;
    const approvalMotion = window.BpmInsightApproval.createApprovalMotion({root:host,getScroll:() => host.querySelector('.id-detail-scroll'),onScroll:() => {const scroll=host.querySelector('.id-detail-scroll');if (scroll && sessions.has(id)) sessions.get(id).top=scroll.scrollTop;gate()?.refresh();}});
    function clearTaskLoading() {
      if (tasksLoadingTimer !== null) window.clearTimeout(tasksLoadingTimer);
      if (tasksLoadingFrame !== null) window.cancelAnimationFrame(tasksLoadingFrame);
      tasksLoadingTimer = null; tasksLoadingFrame = null; tasksLoadingId = null;
    }
    function clearTaskWithdrawal() {
      taskMotionEpoch += 1; taskMotionRunning = false;
      if (taskMotionFrame !== null) window.cancelAnimationFrame(taskMotionFrame);
      taskMotionFrame = null;
      taskMotionTimers.forEach((resolve,timer) => {window.clearTimeout(timer); resolve(false);}); taskMotionTimers.clear();
      taskMotionAnimations.forEach(animation => animation.cancel()); taskMotionAnimations.clear();
      pendingWithdrawals.clear();
      host.querySelectorAll('.id-detail-task.is-withdrawing').forEach(card => {
        card.classList.remove('is-withdrawing','is-dissolving'); card.inert = false; card.removeAttribute('data-id-task-phase');
      });
      const body = host.querySelector('#id-detail-tasks');
      if (body) {body.classList.remove('is-task-collapsing'); body.removeAttribute('data-id-task-phase'); body.style.height = ''; body.style.overflow = '';}
    }
    function suspend() {
      approvalMotion.cancel();
      clearTaskLoading();
      clearTaskWithdrawal(); taskSnapshot.clear();
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
    const missingEffectAnswer = () => canEditEffects() && draft.effects.some(effect => typeof effect.applicable !== 'boolean');
    const opinionIncomplete = () => !!pendingReset || !reproductionLabels.includes(draft.reproduction) || missingEffectAnswer();
    const canDecide = () => !!workflow()?.canDecideTeam?.(row);
    const canApprove = () => !!workflow()?.canApprove?.(row);
    const canUseTasks = () => canonicalStatus(row) === 'В работе';
    const responses = () => flow().opinions?.responses || [];
    const opinionSent = () => !opinionDirty && reproductionLabels.includes(responses().find(response => response.bank === actor().bank)?.reproduction);
    function loadDraft() {
      draft = initialDetail(row);
      const own = responses().find(response => response.bank === actor().bank);
      opinionSelected = reproductionLabels.includes(own?.reproduction);
      if (flow().opinions || canEditOpinion()) {
        draft.reproduction = own?.reproduction || 'Без оценки';
        draft.reproductionComment = own?.comment || '';
        draft.effects = draft.effects.map((effect,index) => {
          const answer = own?.effects?.find(item => item.id === effect.id) || own?.effects?.[index];
          return {...effect,baselineUnit:effect.baselineUnit || effect.unit,current:answer?.current || '',target:answer?.target || '',unit:answer?.unit || effect.baselineUnit || effect.unit,comment:answer?.comment || '',applicable:typeof answer?.applicable === 'boolean' ? answer.applicable : null};
        });
      }
      opinionDirty = false;
    }
    function markOpinionChanged() {
      opinionDirty = true;
      const submit = host.querySelector('[data-id-send-opinion]');
      if (submit) {
        // Text/metric edits keep their input nodes and the review gate intact.
        // Only the sent footer's caption/navigation return to the draft state.
        const footer = submit.closest('.id-detail-footer'), wasSent = footer.classList.contains('id-detail-footer--opinion-sent'), back = footer.querySelector('[data-id-close], [data-id-return]');
        footer.classList.remove('id-detail-footer--opinion-sent');
        if (back) {back.removeAttribute('data-id-close'); back.setAttribute('data-id-return',''); back.textContent = presentation === 'drawer' ? 'Выйти' : 'К реестру';}
        submit.querySelector('[data-id-opinion-submit-label]').textContent = 'Отправить мнение';
        const disabled = opinionIncomplete();
        if (wasSent) {
          submit.disabled = disabled;
          gate()?.bind({root:host,scroll:host.querySelector('.id-detail-scroll'),buttons:footer.querySelectorAll('.primary-button')});
        } else gate()?.setDisabled(submit,disabled);
      }
      draft.effects.forEach((effect,index) => {
        const counts = host.querySelector(`[data-id-effect="${index}"] [data-id-effect-counts]`);
        if (!counts) return;
        const model = effectTableModel(row,effect,index,{own:canEditEffects() ? {bank:actor().bank,effect} : null});
        counts.textContent = `(Актуальных ${model.active}, Неактуальных ${model.inactive})`;
      });
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
      const linkedIds = new Set(Array.isArray(draft.taskIds) ? draft.taskIds : []);
      // Explicit links and the task store are complementary. In particular an
      // empty demo taskIds array must not hide a newly created linked task.
      available.forEach(task => {if (task.insightId === id || task.sourceInsightId === id) linkedIds.add(task.id);});
      return [...linkedIds].map(taskId => available.find(task => task.id === taskId)).filter(Boolean);
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
      return model.rows.map(item => `<tr${item.bank === model.ownBank ? ' data-id-opinion-own' : ''}><td><strong>${esc(item.bank)}</strong><small class="${item.bank === model.ownBank ? 'id-detail-you' : ''}">${esc(item.bank === model.ownBank ? 'Вы' : window.BpmAvatars.displayName(item.person,`${row.id}:opinion:${item.bank}`))}</small></td><td>${esc(item.reproduction)}</td><td>${esc(item.comment || '—')}</td></tr>`).join('');
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
        const description = effect.description ?? 'Время заполнения реестра сотрудников клиентом (компания 50+ человек).';
        const editable = canEditEffects(), qualitative = isQualitativeEffect(effect);
        const model = effectTableModel(row,effect,index,{own:editable ? {bank:actor().bank,effect} : null});
        const counts = ` <span class="secondary id-detail-regular" data-id-effect-counts>(Актуальных ${model.active}, Неактуальных ${model.inactive})</span>`;
        const bank = actor().bank || '', bankGenitive = bank.replace(/(?:ый|ий) банк$/u,'ого банка');
        const bankQuestion = bankGenitive !== bank ? `<strong>Актуален ли эффект<br>для ${esc(bankGenitive)}?</strong>` : `<strong>Актуален ли эффект<br>для вашего банка?</strong><small>${esc(bank)}</small>`;
        const applicableChoice = effect.applicable === true ? 'yes' : effect.applicable === false ? 'no' : 'none';
        const applicability = `<div class="id-detail-applicability" role="group" aria-label="Актуальность эффекта ${index + 1} — обязательный выбор" data-choice="${applicableChoice}">${[[true,'Да'],[false,'Нет']].map(([value,caption]) => `<button type="button" data-id-applicable="${index}" data-id-value="${value}" aria-pressed="${effect.applicable === value}">${caption}</button>`).join('')}</div>`;
        const rows = model.rows.map(response => response.isOwn
          ? `<tr class="id-detail-edit-row"><td>${bankQuestion}</td><td class="id-detail-effect-applicability-cell">${applicability}</td>${qualitative ? '' : `<td>${field({name:`effect:${index}:current`,value:effect.current,label:'Текущее значение',disabled:effect.applicable !== true,numeric:true})}</td><td>${field({name:`effect:${index}:target`,value:effect.target,label:'Целевое значение',disabled:effect.applicable !== true,numeric:true})}</td><td><div id="id-detail-unit-${index}" class="id-detail-unit select-host"></div></td>`}<td class="id-detail-effect-comment-cell">${field({name:`effect:${index}:comment`,value:effect.comment,label:'Ваш комментарий',placeholder:'Укажите отличия эффекта в вашем ТБ',disabled:!canEditEffects()})}</td></tr>`
          : `<tr${response.isAuthor ? ' class="id-detail-author-row" data-id-effect-author' : ''}><td><strong>${esc(response.bank)}</strong><small${response.isAuthor ? ' class="id-detail-author-label"' : ''}>${esc(response.isAuthor ? 'Автор инсайта' : window.BpmAvatars.displayName(response.person,`${row.id}:opinion:${response.bank}`))}</small></td><td class="id-detail-effect-applicability-cell">${response.effect.applicable === true ? '<strong>Да</strong>' : response.effect.applicable === false ? 'Нет' : '—'}</td>${qualitative ? '' : `<td>${esc(response.effect.current || '—')}</td><td>${esc(response.effect.target || '—')}</td><td>${esc(response.effect.unit || '—')}</td>`}<td class="id-detail-effect-comment-cell">${esc(response.effect.comment || '—')}</td></tr>`).join('');
        return `<section class="id-detail-effect" data-id-effect="${index}"><div class="id-detail-effect-heading"><span class="id-detail-effect-number">${index + 1}</span><div><h3>${esc(effect.title)}${counts}</h3><p>${esc(description)}</p><div class="id-detail-effect-values">${label('Тип эффекта',`<strong>${esc(effect.type || 'Количественный')}</strong>`)}${qualitative ? '' : label('Периодичность',`<strong>${esc(effect.period)}</strong>`)}</div></div></div>
          <div class="id-detail-table-scroll" tabindex="0" role="region" aria-label="Показатели эффекта ${index + 1}"><table class="id-detail-table id-detail-effects-table${qualitative ? ' id-detail-effects-table--qualitative' : ''}"><colgroup>${'<col>'.repeat(qualitative ? 3 : 6)}</colgroup><thead><tr><th>${esc(model.bankHeading)}</th><th class="id-detail-effect-applicability-cell">Актуальность</th>${qualitative ? '' : '<th>Текущее</th><th>Целевое</th><th>Ед. изм.</th>'}<th class="id-detail-effect-comment-cell">Комментарий</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
      }).join('');
    }
    const isWithdrawnTask = task => task?.status === 'Отозвана';
    function taskCard(task) {
      const processCode = task.processCode || row.related?.[0]?.code;
      const initiator = typeof task.initiator === 'object' ? task.initiator?.name || task.initiator?.label : task.initiator;
      const awaitingWithdrawal = pendingWithdrawals.has(task.id);
      return `<article class="id-detail-task${awaitingWithdrawal ? ' is-withdrawing' : ''}" role="button" tabindex="${awaitingWithdrawal ? '-1' : '0'}" aria-label="Открыть задачу ${esc(task.id)}: ${esc(task.title)}" data-id-task="${esc(task.id)}" data-id-linked-task="${esc(task.id)}" data-id-task-card="${esc(task.id)}"${awaitingWithdrawal ? ' data-id-task-phase="status" aria-disabled="true"' : ''}><div class="id-detail-task-meta">${window.BpmTaskVisuals.status(task)}<div class="id-detail-task-tags">${window.BpmTaskVisuals.typeTag(task.type || 'Задача к инсайту')}<span class="task-id-badge id-detail-badge">${esc(task.id)}</span>${processCode ? `${img('direction')}${badge(processCode)}` : ''}</div></div><div class="id-detail-task-body"><div><strong class="id-detail-task-title">${esc(task.title)}</strong><small>${esc(window.BpmAvatars.displayName(initiator,`${task.id}:initiator`))}</small></div>${task.deadline ? window.BpmTaskVisuals.deadline(task) : '<span class="id-detail-task-no-deadline secondary">Без срока</span>'}</div></article>`;
    }
    function taskList(tasks,view = 'active') {
      if (tasksLoadingId === id) return `<div class="id-detail-tasks id-detail-tasks--loading" aria-busy="true"><p class="id-detail-task-loading" role="status" aria-live="polite"><span class="id-detail-task-loader" aria-hidden="true"></span>Загружаем задачи…</p><article class="id-detail-task id-detail-task-skeleton" aria-hidden="true"><div class="id-detail-task-meta"><span class="skeleton-shape skeleton-status"></span><div class="id-detail-task-tags"><span class="skeleton-shape skeleton-tag"></span><span class="skeleton-shape skeleton-tag"></span></div></div><span class="skeleton-shape id-detail-task-skeleton-title"></span><span class="skeleton-shape skeleton-line"></span></article></div>`;
      if (!tasks.length) {
        const hasTasks = getTasks().length > 0;
        const title = view === 'withdrawn' ? 'Нет отозванных задач' : hasTasks ? 'Нет актуальных задач' : 'Нет ни одной задачи';
        const description = view === 'withdrawn' ? 'У данного инсайта нет отозванных задач' : hasTasks ? 'Все задачи инсайта отозваны' : 'К данному инсайту не заведено ни одной задачи';
        return `<div class="id-detail-tasks" aria-busy="false"><div class="id-detail-tasks-empty">${img('emptyTasks')}<div><p>${title}</p><small>${description}</small></div></div></div>`;
      }
      return `<div class="id-detail-tasks" aria-busy="false">${tasks.map(taskCard).join('')}</div>`;
    }
    function tasksContent(tasks) {
      // A task remains in the current view for its visible withdrawal sequence;
      // the archived view appears only after the card has actually dissolved.
      const withdrawn = tasks.filter(task => isWithdrawnTask(task) && !pendingWithdrawals.has(task.id));
      const current = tasks.filter(task => !isWithdrawnTask(task) || pendingWithdrawals.has(task.id));
      const view = withdrawn.length && taskViews.get(id) === 'withdrawn' ? 'withdrawn' : 'active';
      taskViews.set(id,view);
      const prefix = `${host.id || 'insight-detail'}-${id}-tasks`.replace(/[^\w-]/g,'-'), panelId = `${prefix}-panel`;
      const tabs = withdrawn.length ? `<div class="id-detail-task-filters" role="tablist" aria-label="Задачи инсайта">${[['active','Актуальные',current.length],['withdrawn','Отозванные',withdrawn.length]].map(([value,caption,count]) => `<button type="button" role="tab" id="${prefix}-${value}" data-id-task-filter="${value}" aria-selected="${value === view}" aria-controls="${panelId}" tabindex="${value === view ? '0' : '-1'}">${caption} <span>${count}</span></button>`).join('')}</div>` : '';
      return `<div class="id-detail-task-content">${tabs}<div class="id-detail-task-panel"${withdrawn.length ? ` role="tabpanel" id="${panelId}" aria-labelledby="${prefix}-${view}" tabindex="0"` : ''}>${taskList(view === 'withdrawn' ? withdrawn : current,view)}</div></div>`;
    }
    function rememberTasks(tasks = getTasks()) {
      taskSnapshot.clear(); tasks.forEach(task => taskSnapshot.set(task.id,clone(task)));
    }
    function refreshTasks({restoreFocus = true,refreshGate = true} = {}) {
      if (!active || !row || !canUseTasks() || host.hidden) return;
      const body = host.querySelector('#id-detail-tasks'); if (!body) return;
      const focused = body.contains(document.activeElement) ? document.activeElement : null;
      const focusFilter = focused?.dataset.idTaskFilter, focusTask = focused?.dataset.idTask;
      const tasks = getTasks();
      host.querySelectorAll('[data-id-accordion="tasks"]').forEach(button => {if (!button.classList.contains('icon-button')) button.querySelector('span').textContent = `Задачи ${tasks.length}`;});
      body.innerHTML = tasksContent(tasks);
      if (restoreFocus && focused) {
        const target = focusFilter ? body.querySelector(`[data-id-task-filter="${focusFilter}"]`) : focusTask ? body.querySelector(`[data-id-task="${CSS.escape(focusTask)}"]`) : null;
        (target || body.querySelector('[data-id-task-filter="active"]') || host.querySelector('[data-id-create-task]'))?.focus({preventScroll:true});
      }
      if (refreshGate) gate()?.refresh();
    }
    function taskDrawerBlocksMotion() {
      return [...document.querySelectorAll('dialog.task-flow[open]')].some(dialog => !dialog.contains(host));
    }
    function taskMotionCurrent(epoch,insightId) {
      return taskMotionEpoch === epoch && active && id === insightId && !host.hidden && !!host.querySelector('#id-detail-tasks');
    }
    function taskMotionDelay(duration,epoch,insightId) {
      return new Promise(resolve => {
        const timer = window.setTimeout(() => {taskMotionTimers.delete(timer); resolve(taskMotionCurrent(epoch,insightId));},duration);
        taskMotionTimers.set(timer,resolve);
      });
    }
    async function playTaskAnimation(element,frames,options) {
      const animation = element.animate(frames,options);
      taskMotionAnimations.add(animation);
      try {await animation.finished;} catch (_) { /* Switching insights cancels the decorative animation. */ }
      taskMotionAnimations.delete(animation);
    }
    async function withdrawTaskCard(taskId) {
      const epoch = taskMotionEpoch, insightId = id, body = host.querySelector('#id-detail-tasks');
      const card = body?.querySelector(`[data-id-task-card="${CSS.escape(taskId)}"]`);
      if (!card || body.hidden || taskViews.get(id) === 'withdrawn') {
        pendingWithdrawals.delete(taskId); refreshTasks(); scheduleTaskWithdrawals(); return;
      }
      taskMotionRunning = true;
      card.classList.add('is-withdrawing'); card.dataset.idTaskPhase = 'status';
      if (card.contains(document.activeElement)) host.querySelector('[data-id-create-task]')?.focus({preventScroll:true});
      card.inert = true;
      announce(`Задача ${taskId} отозвана.`);
      // Readable status phase is retained even with reduced motion enabled.
      if (!await taskMotionDelay(450,epoch,insightId)) return;
      if (taskDrawerBlocksMotion()) {card.inert = false; taskMotionRunning = false; scheduleTaskWithdrawals(); return;}
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced && typeof card.animate === 'function') {
        // Fade the actual card into a soft blue mist. Its layout area is kept
        // intact until the fade finishes, then the accordion closes the gap.
        card.classList.add('is-dissolving'); card.dataset.idTaskPhase = 'dissolve';
        await playTaskAnimation(card,[
          {offset:0,opacity:1,filter:'blur(0px)',transform:'translateY(0) scale(1)'},
          {offset:.5,opacity:.55,filter:'blur(4px)',transform:'translateY(-2px) scale(1.005)'},
          {offset:1,opacity:0,filter:'blur(10px)',transform:'translateY(-4px) scale(1.01)'}
        ],{duration:820,easing:'ease-in-out',fill:'forwards'});
        if (!taskMotionCurrent(epoch,insightId)) return;
      }
      const oldHeight = body.getBoundingClientRect().height;
      pendingWithdrawals.delete(taskId);
      // Replacing only this accordion preserves opinion inputs and the fixed
      // insight footer. The actual TaskStore record/link is never deleted.
      refreshTasks({restoreFocus:false,refreshGate:false});
      const newHeight = body.getBoundingClientRect().height;
      if (!reduced && oldHeight > newHeight + 1 && typeof body.animate === 'function') {
        body.classList.add('is-task-collapsing'); body.dataset.idTaskPhase = 'collapse';
        body.style.height = `${newHeight}px`; body.style.overflow = 'hidden';
        await playTaskAnimation(body,[{height:`${oldHeight}px`},{height:`${newHeight}px`}],{duration:300,easing:'ease-in-out'});
        if (!taskMotionCurrent(epoch,insightId)) return;
        body.style.height = ''; body.style.overflow = ''; body.classList.remove('is-task-collapsing'); body.removeAttribute('data-id-task-phase');
      }
      if (!taskMotionCurrent(epoch,insightId)) return;
      taskMotionRunning = false; gate()?.refresh();
      announce(`Задача ${taskId} перемещена в отозванные. Актуальных задач: ${getTasks().filter(task => !isWithdrawnTask(task)).length}.`);
      scheduleTaskWithdrawals();
    }
    function scheduleTaskWithdrawals() {
      if (taskMotionRunning || taskMotionFrame !== null || !pendingWithdrawals.size || !active || host.hidden || tasksLoadingId === id || taskDrawerBlocksMotion()) return;
      taskMotionFrame = window.requestAnimationFrame(() => {
        taskMotionFrame = null;
        if (!active || host.hidden || taskDrawerBlocksMotion() || taskMotionRunning) return;
        const next = pendingWithdrawals.keys().next().value;
        const epoch = taskMotionEpoch, insightId = id;
        if (next) withdrawTaskCard(next).catch(() => {
          if (!taskMotionCurrent(epoch,insightId)) return;
          clearTaskWithdrawal(); refreshTasks();
        });
      });
    }
    function handleTaskStoreChange() {
      if (!active || host.hidden || !row || !draft || !canUseTasks()) return;
      const tasks = getTasks(), changed = tasks.filter(task => JSON.stringify(taskSnapshot.get(task.id)) !== JSON.stringify(task));
      if (!changed.length && tasks.length === taskSnapshot.size) return;
      changed.forEach(task => {
        const previous = taskSnapshot.get(task.id);
        if (previous && !isWithdrawnTask(previous) && isWithdrawnTask(task)) pendingWithdrawals.set(task.id,{insightId:id});
        const card = host.querySelector(`[data-id-task-card="${CSS.escape(task.id)}"]`);
        if (card && taskMotionRunning) {
          const status = card.querySelector('.task-status');
          if (status) status.outerHTML = window.BpmTaskVisuals.status(task);
        }
      });
      rememberTasks(tasks);
      if (tasksLoadingId === id) return;
      if (!taskMotionRunning) refreshTasks();
      scheduleTaskWithdrawals();
    }
    function handleTaskDrawerClose(event) {
      if (event.target.matches?.('dialog.task-flow')) scheduleTaskWithdrawals();
    }
    function switchTaskView(value,{focus = true} = {}) {
      if (!['active','withdrawn'].includes(value) || !canUseTasks()) return;
      clearTaskWithdrawal(); taskViews.set(id,value); refreshTasks({restoreFocus:false});
      const tab = host.querySelector(`[data-id-task-filter="${value}"]`);
      if (focus) tab?.focus({preventScroll:true});
      announce(`${value === 'withdrawn' ? 'Отозванные' : 'Актуальные'} задачи: ${host.querySelectorAll('[data-id-task-card]').length}.`);
    }
    function commentList() {
      return `<div class="id-detail-comment-list">${draft.comments.map((comment,index) => `<article><small>${esc(window.BpmAvatars.displayName(comment.author,`${row.id}:comment:${index}:author`))} | ${esc(comment.date)}</small><p>${esc(comment.text)}</p></article>`).join('')}</div><form class="id-detail-comment-form" data-id-comment-form>${field({name:'newComment',label:'Комментарий',placeholder:'Введите текст комментария'})}<button type="submit" class="button secondary-button">Отправить</button></form>`;
    }
    function footer() {
      const back = '<button type="button" class="button secondary-button" data-id-return>К реестру</button>';
      if (canApprove()) {
        const due = flow().stages?.find(stage => stage.status === 'current')?.dueDate;
        return `<footer class="id-detail-footer id-detail-footer--approval"><button type="button" class="button secondary-button" data-id-approval="reject">${img('reject')}Отклонить</button>${due ? `<span class="id-detail-deadline">${img('ringer')}до ${esc(formatDate(due))}</span>` : ''}<button type="button" class="button primary-button" data-id-approval="approve">Согласовать${img('actionArrow')}</button></footer>`;
      }
      if (canDecide()) return `<footer class="id-detail-footer">${decision === 'reject' ? '<button type="button" class="button secondary-button" data-id-decision-cancel>Отменить</button><button type="submit" form="id-detail-decision-form" class="button primary-button" disabled data-id-decision-submit>Подтвердить отклонение</button>' : `<button type="button" class="button secondary-button" data-id-reject>${img('reject')}Отклонить</button><button type="button" class="button primary-button" data-id-take>Взять в работу${img('actionArrow')}</button>`}</footer>`;
      if (canEditOpinion()) {
        const sent = opinionSent();
        return `<footer class="id-detail-footer${sent ? ' id-detail-footer--opinion-sent' : ''}">${sent ? '<button type="button" class="button secondary-button" data-id-close>Закрыть</button>' : back}<button type="button" class="button primary-button" data-id-send-opinion ${!opinionDirty || opinionIncomplete() ? 'disabled' : ''}><span data-id-opinion-submit-label>${sent ? 'Мнение отправлено' : 'Отправить мнение'}</span></button></footer>`;
      }
      if (canUseTasks()) return `<footer class="id-detail-footer id-detail-footer--readonly id-detail-footer--in-work"><p class="id-detail-work-note">Работа над инсайтом производится в задаче</p><span class="id-detail-status">${window.BpmInsightPresentation.status(row)}</span><button type="button" class="button secondary-button" data-id-close>Закрыть</button></footer>`;
      const rejected = canonicalStatus(row) === 'Отклонено';
      return `<footer class="id-detail-footer id-detail-footer--readonly"><span class="id-detail-status">${window.BpmInsightPresentation.status(row)}</span><button type="button" class="button secondary-button" ${rejected ? 'data-id-close' : 'data-id-return'}>${rejected ? 'Закрыть' : 'Выйти'}</button></footer>`;
    }
    function render() {
      if (!active || !row) return;
      approvalMotion.cancel();
      clearTaskWithdrawal();
      const current = session(), oldScroll = host.querySelector('.id-detail-scroll');
      if (oldScroll && host.dataset.insightId === id) current.top = oldScroll.scrollTop;
      current.gate.bind({});
      closeSelects();
      const tasks = getTasks(), process = row.related?.[0];
      const editable = canEditOpinion(), opinionDue = flow().opinions?.dueDate;
      const showOpinions = canonicalStatus(row) !== 'Новый' && (row.source === 'ТБ' || !!opinionDue);
      const path = (window.BPM_DATA || []).find(item => item.entity === 'paths' && item.title === row.path);
      const links = (process?.variants || (row.local ? [] : ['Выдача автокредита с кредитным потенциалом','Оформление кредитной документации и выдача кредита на приобретение ТС'])).map(value => `<button type="button" class="id-detail-relation" data-id-process="${esc(process?.id || '')}">${esc(value)}</button>`).join('');
      const products = row.products?.length ? row.products.map(value => copy(typeof value === 'string' ? value : value.name || value.title)).join(', ') : row.local ? 'Не указаны' : 'Система SberBPM';
      const relations = `${label('Варианты предоставления результата процесса',`<div class="id-detail-relation-list">${links || '<p class="secondary">Не указаны</p>'}</div>`)}${label('Продукты ЕКОУ',`<div class="id-detail-product">${row.local ? '' : badge('ID0000')}<span>${products}</span></div>`)}`;
      const fileList = row.attachments || (row.local ? [] : [{name:'file_name1.pdf'},{name:'file_name long naming 2.pdf'}]);
      const attachments = fileList.length ? fileList.map(file => `<button type="button" class="id-detail-file" data-id-file="${esc(file.name)}">${img('file')}<span>${esc(file.name)}</span></button>`).join('') : '<p class="secondary">Вложения отсутствуют.</p>';
      const tracker = window.BpmInsightApproval.tracker(row);
      host.dataset.insightId = id;
      host.innerHTML = `<div class="id-detail-scroll" tabindex="-1"><header class="id-detail-header"><div class="id-detail-drawer-actions" hidden><button type="button" class="id-detail-link" data-id-open-tab>Открыть во вкладке</button><button type="button" class="task-drawer-close" data-id-drawer-close aria-label="Закрыть инсайт">${img('close')}</button></div><span class="internal-label">Инсайт</span><h2 id="insight-detail-title">${esc(row.title)}</h2><div class="id-detail-meta">${window.BpmInsightPresentation.sourceBadge(row,'tag')}${badge(row.id)}<span class="id-detail-status">${statusMarkup(row)}</span></div></header>
        <div class="id-detail-overview${tracker ? ' has-tracker' : ''}"><div class="id-detail-description-column"><div class="id-detail-context">${label('Клиентский путь',`${path ? `<div>${badge(`КП${path.number}`)}</div>` : ''}<p>${copy(row.path || 'Не указан')}</p>`)}${label('Процесс',`${process ? `<div>${badge(process.code)}</div><button type="button" class="id-detail-process-name" data-id-process="${esc(process.id)}">${copy(process.title)}</button>` : '<p>Не указан</p>'}`)}</div>
        <section class="id-detail-description"><h3>Описание инсайта</h3>${label('Проблема / наблюдение',`<p>${esc(draft.problem)}</p>`)}${label('Корневые причины',`<p>${esc(draft.causes)}</p>`)}${label('Предложение/решение',`<p>${esc(draft.proposal)}</p>`)}</section></div>${tracker}</div>
        <div class="id-detail-pair">${accordion('relations','Связи процесса',relations)}${accordion('attachments',`Вложения ${fileList.length}`,attachments)}</div>
        ${showOpinions ? `<section class="id-detail-reproduction"><div class="id-detail-section-heading"><h3>Оценка воспроизводимости в ТБ</h3>${canonicalStatus(row) === 'Согласовано' && opinionDue ? `<span class="id-detail-deadline">${img('ringer')}до ${formatDate(opinionDue)}</span>` : ''}</div>${editable ? `<div class="id-detail-reproduction-alert" data-id-reproduction-alert ${opinionSelected ? 'hidden' : ''}>${alert(`Оцените инсайт и его эффекты применительно к своему территориальному банку — ${actor().bank}`)}</div><div class="id-detail-opinion-form"><strong class="id-detail-opinion-label${opinionSelected ? ' is-selected' : ''}">Ваша оценка ${img(opinionSelected ? 'arrow' : 'purpleArrow')}</strong><div><div class="id-detail-reproduction-buttons" role="group" aria-label="Ваша оценка воспроизводимости">${reproductionLabels.map(value => `<button type="button" class="button secondary-button" data-id-reproduction="${value}" aria-pressed="${value === draft.reproduction}">${value}<span class="id-detail-reproduction-check" ${value === draft.reproduction ? '' : 'hidden'}>${img('tick')}</span></button>`).join('')}</div><label class="field id-detail-textarea"><span class="internal-label">Комментарий</span><textarea data-id-field="reproductionComment" maxlength="1000" aria-label="Комментарий к воспроизводимости">${esc(draft.reproductionComment)}</textarea></label></div></div>` : ''}${opinions()}</section>` : ''}
        <section class="id-detail-effects"><h3>Ожидаемые эффекты</h3>${resetConfirmation()}${editable ? alert(draft.reproduction === 'Не воспроизводится' ? 'Инсайт не воспроизводится в вашем банке — эффекты не оцениваются.' : 'Для каждого эффекта обязательно выберите «Да» или «Нет» и укажите свои значения, если они у вас есть. Повторное нажатие снимает выбор.') : ''}${effects()}</section>
        ${canUseTasks() ? accordion('tasks',`Задачи ${tasks.length}`,tasksContent(tasks),`<button type="button" class="id-detail-link" data-id-create-task>Создать задачу${img('plus')}</button>`) : ''}
        <section class="id-detail-participants"><h4>Участники инсайта</h4><div>${workflow().getParticipants(row).map(({role,name},index) => {const key=`${row.id}:${role==='Владелец процесса'?'owner':role==='Автор'?'author':`${role}:${index}`}`,displayName=window.BpmAvatars.displayName(name,key);return `<div class="id-detail-participant"><span class="avatar">${displayName==='Система'||displayName==='SYS'?'SYS':window.BpmAvatars.portrait(displayName,key)}</span><div><small>${esc(role)}</small><p>${esc(displayName)}</p></div></div>`;}).join('')}</div></section>
        ${accordion('comments',`Комментарии ${draft.comments.length}`,commentList())}<section class="id-detail-rating" aria-label="Оценка инсайта"><div>${label('Моя оценка',`<div class="id-detail-stars" role="group" aria-label="Ваша оценка инсайта">${[1,2,3,4,5].map(value => `<button type="button" data-id-rating="${value}" aria-label="Оценка ${value} из 5" aria-pressed="${draft.userRating === value}" class="${value <= draft.userRating ? 'is-rated' : ''}">${img(value <= draft.userRating ? 'starOn' : 'star')}</button>`).join('')}<strong data-id-rating-value>${number(draft.userRating)}</strong></div>`)}${label('Средняя',`<div class="id-detail-average"><strong>${number(draft.averageRating)}</strong></div>`)}</div></section>
        ${accordion('history',`История изменений ${draft.history.length}`,`<ol class="id-detail-history">${historyMarkup()}</ol>`)}
        ${canDecide() && decision === 'reject' ? `<form id="id-detail-decision-form" class="id-detail-decision" data-id-decision-form><h3>Отклонить инсайт</h3><label class="field id-detail-textarea"><span class="internal-label">Причина отклонения · обязательно</span><textarea name="decisionComment" maxlength="1000" required aria-label="Причина отклонения" placeholder="Укажите причину отклонения"></textarea></label><p class="field-error" data-id-decision-error hidden>Комментарий обязателен</p></form>` : ''}
        </div>${footer()}<p class="sr-only" role="status" aria-live="polite" data-id-announcement></p>`;
      draft.effects.forEach((effect,index) => {
        if (host.querySelector(`#id-detail-unit-${index}`)) {
          const units = window.BpmInsightUnits;
          const select = api.createSelect?.(`id-detail-unit-${index}`,{label:'Ед. изм.',allowAll:false,placeholder:'Введите...',values:effect.unit ? [units.canonicalize(effect.unit)] : [],options:units.catalog,onChange:values => {if (!canEditEffects() || draft.effects[index].applicable !== true) return; draft.effects[index].unit = units.canonicalize(values[0] || ''); markOpinionChanged();}});
          units.enhanceSelect(select);
          if (select) {selects[index] = select; select.input.setAttribute('aria-label',`Единица измерения эффекта ${index + 1}`);}
        }
        setEffectEnabled(index,effect.applicable);
      });
      applyPresentation();
      const scroll = host.querySelector('.id-detail-scroll');
      scroll.scrollTop = current.top;
      // A persisted, unchanged opinion is already sent: its disabled caption
      // must not imply another review is needed. Editing rebinds this same gate.
      current.gate.bind({root:host,scroll,buttons:host.querySelectorAll('.id-detail-footer:not(.id-detail-footer--opinion-sent) .primary-button'),form:host.querySelector('[data-id-decision-form]')});
      rememberTasks(tasks);
    }
    function setEffectEnabled(index,enabled) {
      const section = host.querySelector(`[data-id-effect="${index}"]`), select = selects[index];
      if (!section) return;
      const editable = canEditEffects(), metricsEditable = enabled === true && editable;
      // A bank may explain why an effect is not applicable. Only metric fields
      // follow an explicit Yes; the comment follows workflow access.
      section.querySelectorAll('[data-id-field]').forEach(input => {
        const fieldEditable = input.dataset.idField.endsWith(':comment') ? editable : metricsEditable;
        input.disabled = !fieldEditable; input.closest('.field').classList.toggle('is-disabled',!fieldEditable);
      });
      const group = section.querySelector('.id-detail-applicability');
      if (group) {
        group.dataset.choice = enabled === true ? 'yes' : enabled === false ? 'no' : 'none';
        group.removeAttribute('aria-invalid');
        group.querySelectorAll('[data-id-applicable]').forEach(button => {button.disabled = !editable; button.setAttribute('aria-pressed',String(enabled === (button.dataset.idValue === 'true')));});
      }
      if (select) {select.disabled = !metricsEditable; select.input.disabled = !metricsEditable; select.toggle.disabled = !metricsEditable; select.control.classList.toggle('is-disabled',!metricsEditable); select.host.classList.toggle('is-disabled',!metricsEditable); if (!metricsEditable) select.close();}
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
      confirmation.innerHTML = `<form class="ia-confirm-form"><div class="modal-heading"><h2 id="id-approval-confirm-title">${reject ? 'Отклонить инсайт?' : 'Согласование инсайта'}</h2><button type="button" class="task-drawer-close" data-id-approval-close aria-label="Закрыть подтверждение">${img('close')}</button></div><p>${reject ? 'Внесите комментарий для обоснования отклонения.' : 'В случае принятия решения «согласовать» введение комментария не обязательно.'}</p><label class="ia-comment-field"><span class="internal-label">Комментарий${reject ? ' · обязательно' : ''}</span><textarea name="decisionComment" aria-label="Комментарий к решению" maxlength="1000" ${reject ? 'required' : ''}></textarea></label><p class="ia-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary-button" data-id-approval-close>Отмена</button><button type="submit" class="button primary-button">${reject ? 'Отклонить' : 'Согласовать'}</button></div></form>`;
      confirmation.showModal(); confirmation.querySelector('textarea').focus();
    }
    confirmation.addEventListener('click',event => {if (event.target.closest('[data-id-approval-close]')) confirmation.close();});
    confirmation.addEventListener('close',() => {if (active) host.querySelector(`[data-id-approval="${approvalDecision?.value}"]`)?.focus({preventScroll:true});});
    confirmation.addEventListener('submit',event => {
      event.preventDefault();
      if (!active || approvalDecision?.id !== id || approvalDecision.value === 'approve' && !gate()?.allow()) return;
      try {
        row = getRow(id) || row;
        const snapshot = approvalMotion.capture(host.querySelector(`[data-id-approval="${approvalDecision.value}"]`),row);
        const patch = workflow().decide(row,{decision:approvalDecision.value,comment:confirmation.querySelector('textarea').value.trim()});
        const message = approvalDecision.value === 'approve' ? 'Инсайт согласован' : 'Решение об отклонении сохранено';
        confirmation.close(); applyWorkflowPatch(patch,message);
        if (snapshot) void approvalMotion.play(snapshot,row);
      } catch (error) {const target = confirmation.querySelector('.ia-error'); target.textContent = error.message || 'Не удалось сохранить решение.'; target.hidden = false;}
    });
    function openLinkedTask(card) {
      if (!active || !canUseTasks() || !card || card.inert || card.getAttribute('aria-disabled') === 'true') return;
      if (api.openTask) api.openTask(card.dataset.idTask,card);
      else api.toast?.('Деталка связанной задачи недоступна в этом режиме.');
    }
    function handleClick(event) {
      if (!active) return;
      const button = event.target.closest('button');
      if (!button) {openLinkedTask(event.target.closest('[data-id-task-card][data-id-task]')); return;}
      if (button.disabled) return;
      if (button.hasAttribute('data-id-drawer-close')) {api.closeDetail?.(); return;}
      if (button.hasAttribute('data-id-open-tab')) {api.openInTab?.(id); return;}
      if (button.hasAttribute('data-id-close')) {api.closeInsightTab ? api.closeInsightTab(id) : api.closeDetail?.(); return;}
      if (button.hasAttribute('data-id-return')) {api.closeDetail?.(); return;}
      if (button.hasAttribute('data-id-approval')) {confirmApproval(button.dataset.idApproval); return;}
      if (button.hasAttribute('data-id-copy')) {api.copyText?.(button.dataset.idCopy); return;}
      if (button.hasAttribute('data-id-process')) {if (button.dataset.idProcess) api.openProcess?.(button.dataset.idProcess,button); else api.toast?.('Связь с процессом показана как пример.'); return;}
      if (button.hasAttribute('data-id-file')) {api.toast?.('Демонстрационное вложение: файл PDF не загружен в прототип.'); return;}
      if (button.hasAttribute('data-id-task-filter')) {switchTaskView(button.dataset.idTaskFilter); return;}
      if (button.hasAttribute('data-id-accordion')) {
        const key = button.dataset.idAccordion, body = host.querySelector(`#id-detail-${key}`), isOpen = body.hidden;
        body.hidden = !isOpen; opened.set(`${id}:${key}`,isOpen);
        host.querySelectorAll(`[data-id-accordion="${key}"]`).forEach(control => {control.setAttribute('aria-expanded',String(isOpen)); if (control.classList.contains('icon-button')) control.innerHTML = img(isOpen ? 'chevronUp' : 'historyChevron');}); return;
      }
      if (button.hasAttribute('data-id-reproduction')) {
        if (!canEditOpinion()) return;
        const value = button.dataset.idReproduction;
        if (!reproductionLabels.includes(value)) return;
        // Clearing a choice only suspends this local draft. Keep the user's
        // metrics/comment and any submitted response until an explicit save.
        if (opinionSelected && draft.reproduction === value) {
          pendingReset = null;
          draft.reproduction = 'Без оценки';
          opinionSelected = false;
          markOpinionChanged(); render(); host.querySelector(`[data-id-reproduction="${value}"]`)?.focus({preventScroll:true}); return;
        }
        if (value === 'Не воспроизводится' && draft.effects.some(effect => effect.applicable || hasEffectValues(effect))) {pendingReset = {kind:'reproduction'}; render(); host.querySelector('[data-id-reset-cancel]')?.focus(); return;}
        pendingReset = null;
        draft.reproduction = value;
        opinionSelected = true;
        markOpinionChanged(); render(); host.querySelector(`[data-id-reproduction="${value}"]`)?.focus({preventScroll:true}); return;
      }
      if (button.hasAttribute('data-id-applicable')) {
        if (!canEditEffects() || !['true','false'].includes(button.dataset.idValue)) return;
        const index = Number(button.dataset.idApplicable), effect = draft.effects[index];
        if (!effect) return;
        const selected = button.dataset.idValue === 'true', next = effect.applicable === selected ? null : selected;
        // Deselecting only suspends the answer: keep the local values/comment.
        // A direct filled Yes → No keeps the existing destructive-change warning.
        if (effect.applicable === true && next === false && hasEffectValues(effect)) {pendingReset = {kind:'effect',index}; render(); host.querySelector('[data-id-reset-cancel]')?.focus(); return;}
        pendingReset = null;
        effect.applicable = next;
        setEffectEnabled(index,next); markOpinionChanged(); return;
      }
      if (button.hasAttribute('data-id-reset-cancel')) {pendingReset = null; render(); return;}
      if (button.hasAttribute('data-id-reset-confirm')) {if (!pendingReset || !canEditOpinion()) return; const cleared = effect => ({...effect,applicable:false,current:'',target:'',comment:''}); if (pendingReset.kind === 'reproduction') {draft.reproduction = 'Не воспроизводится'; opinionSelected = true; draft.effects = draft.effects.map(cleared);} else draft.effects[pendingReset.index] = cleared(draft.effects[pendingReset.index]); pendingReset = null; markOpinionChanged(); render(); return;}
      if (button.hasAttribute('data-id-send-opinion')) {
        if (!gate()?.allow()) return;
        row = getRow(id) || row;
        if (!canEditOpinion()) {loadDraft(); render(); api.toast?.('Сбор мнений завершён: решение команды уже принято.'); return;}
        if (missingEffectAnswer()) {
          draft.effects.forEach((effect,index) => {if (typeof effect.applicable !== 'boolean') host.querySelector(`[data-id-effect="${index}"] .id-detail-applicability`)?.setAttribute('aria-invalid','true');});
          host.querySelector('.id-detail-applicability[aria-invalid="true"] button')?.focus();
          api.toast?.('Оцените актуальность каждого эффекта: выберите «Да» или «Нет».'); return;
        }
        const invalid = host.querySelector('input:not(:disabled)[aria-invalid="true"], textarea:not(:disabled)[aria-invalid="true"]'); if (invalid) {invalid.focus(); api.toast?.('Исправьте значение показателя перед отправкой.'); return;}
        try {applyWorkflowPatch(workflow().saveOpinion(row,{reproduction:draft.reproduction,comment:draft.reproductionComment,effects:draft.effects.map(effect => ({id:effect.id,applicable:effect.applicable,comment:effect.comment,...(isQualitativeEffect(effect) ? {} : {current:effect.current,target:effect.target,unit:window.BpmInsightUnits.canonicalize(effect.unit)})}))}),'Мнение вашего банка сохранено');}
        catch (error) {api.toast?.(error.message || 'Не удалось сохранить мнение.');} return;
      }
      if (button.hasAttribute('data-id-rating')) {draft.userRating = Number(button.dataset.idRating); draft.ratingTouched = true; host.querySelectorAll('[data-id-rating]').forEach(control => {const filled = Number(control.dataset.idRating) <= draft.userRating; control.setAttribute('aria-pressed',String(Number(control.dataset.idRating) === draft.userRating)); control.classList.toggle('is-rated',filled); control.querySelector('img').src = assets[filled ? 'starOn' : 'star'];}); host.querySelector('[data-id-rating-value]').textContent = number(draft.userRating); history('Обновлена ваша оценка инсайта'); save('Ваша оценка сохранена'); return;}
      if (button.hasAttribute('data-id-create-task')) {if (!canUseTasks()) return; if (api.createTask) api.createTask({insightId:id,processId:row.related?.[0]?.id,trigger:button,takeInWork:false}); else api.toast?.('Создание связанной задачи подключается отдельным действием.'); return;}
      if (button.hasAttribute('data-id-reject')) {if (!canDecide()) return; decision = 'reject'; render(); host.querySelector('[name="decisionComment"]')?.focus(); return;}
      if (button.hasAttribute('data-id-decision-cancel')) {decision = null; render(); host.querySelector('[data-id-reject]')?.focus(); return;}
      if (button.hasAttribute('data-id-take')) {
        if (!gate()?.allow()) return;
        row = getRow(id) || row;
        if (!canDecide()) {decision = null; render(); api.toast?.('Решение по этому инсайту уже принято или недоступно для вашей роли.'); return;}
        if (api.createTask) api.createTask({insightId:id,processId:row.related?.[0]?.id,trigger:button,takeInWork:true});
        else api.toast?.('Создание связанной задачи недоступно в этом режиме.');
        return;
      }
    }
    function handleChange(event) {
      if (!active || !event.target.matches('[data-id-field]')) return;
      const input = event.target, key = input.dataset.idField;
      if (key === 'newComment') return;
      if (!canEditOpinion()) return;
      if (key.startsWith('effect:')) {
        if (!canEditEffects()) return;
        const [,index,fieldName] = key.split(':');
        if (fieldName !== 'comment' && draft.effects[Number(index)].applicable !== true) return;
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
    function handleTaskFilterKeydown(event) {
      const card = event.target.closest('[data-id-task-card][data-id-task]');
      if (card && event.target === card && ['Enter',' '].includes(event.key)) {event.preventDefault(); if (!event.repeat) openLinkedTask(card); return;}
      const tab = event.target.closest('[data-id-task-filter]');
      if (!tab || !active || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[data-id-task-filter]')], index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      switchTaskView(next.dataset.idTaskFilter);
    }
    host.addEventListener('click',handleClick); host.addEventListener('change',handleChange); host.addEventListener('input',handleInput); host.addEventListener('submit',handleSubmit); host.addEventListener('keydown',handleTaskFilterKeydown);
    document.addEventListener('close',handleTaskDrawerClose,true);
    const unsubscribeTasks = window.BpmTaskStore?.subscribe?.(handleTaskStoreChange);
    return {
      show(value,options = {}) {const keepDraft = options.preserveDraft && id === value && draft && row && JSON.stringify(row) === JSON.stringify(getRow(value)); suspend(); closeSelects(); id = value; row = getRow(id); if (!row) {active = false; host.hidden = true; return false;} if (!keepDraft) {loadDraft(); decision = null; pendingReset = null;} active = true; host.hidden = false; host.removeAttribute('data-insight-id'); render(); return true;},
      setPresentation(value) {presentation = value === 'drawer' ? 'drawer' : 'tab'; applyPresentation();},
      hide() {suspend(); closeSelects(); active = false; host.hidden = true;},
      close(value) {const current = sessions.get(value); current?.gate.end(); sessions.delete(value); taskViews.delete(value); if (value === id) {approvalMotion.cancel();clearTaskLoading(); clearTaskWithdrawal(); taskSnapshot.clear(); host.removeAttribute('data-insight-id'); if (confirmation.open) confirmation.close();}},
      getScrollTop() {return host.querySelector('.id-detail-scroll')?.scrollTop || 0;},
      setScrollTop(value) {const scroll = host.querySelector('.id-detail-scroll'); if (scroll) {scroll.scrollTop = Math.max(0,Number(value) || 0); session().top = scroll.scrollTop; gate()?.refresh();}},
      refresh() {if (!active || !id) return; row = getRow(id); if (row) {loadDraft(); decision = null; pendingReset = null; render();}},
      taskCreated(value,taskId) {
        // A task can finish saving after another tab/drawer was opened. Never
        // let its delayed loading state mutate that unrelated current detail.
        if (!active || value !== id) return;
        row = getRow(id) || row;
        if (!canUseTasks()) return;
        clearTaskLoading(); clearTaskWithdrawal(); taskViews.set(id,'active'); loadDraft(); decision = null; pendingReset = null;
        opened.set(`${id}:tasks`,true); tasksLoadingId = id;
        render();
        const loadingInsight = id;
        const isCurrent = () => active && id === loadingInsight && tasksLoadingId === loadingInsight && !host.hidden;
        const scrollToTasks = () => {
          const scroll = host.querySelector('.id-detail-scroll'), section = host.querySelector('#id-detail-tasks')?.closest('.id-detail-accordion');
          if (!scroll || !section) return;
          // Move only insight content: the parent page and fixed footer stay put.
          scroll.scrollTop += section.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 16;
          session().top = scroll.scrollTop; gate()?.refresh();
        };
        scrollToTasks();
        // Let the opened accordion and its skeleton reach the viewport before
        // counting the loading window, including the reduced-motion path.
        tasksLoadingFrame = window.requestAnimationFrame(() => {
          tasksLoadingFrame = null;
          if (!isCurrent()) return;
          scrollToTasks();
          tasksLoadingFrame = window.requestAnimationFrame(() => {
            tasksLoadingFrame = null;
            if (!isCurrent()) return;
            scrollToTasks();
            tasksLoadingTimer = window.setTimeout(() => {
              if (!isCurrent()) return;
              tasksLoadingTimer = null; tasksLoadingId = null;
              row = getRow(id) || row; loadDraft(); render();
              const arrived = host.querySelector(`[data-id-linked-task="${CSS.escape(taskId)}"]`);
              const scroll = host.querySelector('.id-detail-scroll');
              if (arrived && scroll) {
                const view = scroll.getBoundingClientRect();
                if (arrived.getBoundingClientRect().bottom > view.bottom - 16)
                  scroll.scrollTop += arrived.getBoundingClientRect().bottom - view.bottom + 16;
                if (arrived.getBoundingClientRect().top < view.top + 16)
                  scroll.scrollTop += arrived.getBoundingClientRect().top - view.top - 16;
                session().top = scroll.scrollTop; gate()?.refresh();
              }
              if (arrived && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                arrived.classList.add('is-just-created');
                arrived.addEventListener('animationend',() => arrived.classList.remove('is-just-created'),{once:true});
              }
              announce(`Задача ${taskId} создана. ${getTasks().length} задач связано с инсайтом.`);
              host.querySelector('[data-id-create-task]')?.focus({preventScroll:true});
            },1800);
          });
        });
      },
      destroy() {suspend(); approvalMotion.destroy(); closeSelects(); unsubscribeTasks?.(); document.removeEventListener('close',handleTaskDrawerClose,true); sessions.forEach(current => current.gate.end()); sessions.clear(); taskViews.clear(); confirmation.remove(); host.removeEventListener('click',handleClick); host.removeEventListener('change',handleChange); host.removeEventListener('input',handleInput); host.removeEventListener('submit',handleSubmit); host.removeEventListener('keydown',handleTaskFilterKeydown); host.replaceChildren(); active = false;},
      isActive:() => active,
      getId:() => id
    };
  }
  window.BpmInsightDetail = Object.freeze({create,initialDetail,effectTableModel,isQualitativeEffect});
})();

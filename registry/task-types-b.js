/* Missing task types — Products BPM, page «Задачи».
 * Figma sections 112:16742–112:16745. Data and workflow changes stay local.
 * Declarative definitions: shared drawer/select/calendar primitives are rendered
 * by the special-task engine; this file never mutates the store or the DOM.
 */
(() => {
  'use strict';

  Object.assign(window.BpmTaskTypeAssets || (window.BpmTaskTypeAssets = {}), {
    switchOn:'assets/task-types-b/switch-on.svg',
    switchOff:'assets/task-types-b/switch-off.svg',
    switchReject:'assets/task-types-b/switch-reject.svg',
    chevronUp16:'assets/task-types-b/chevron-up-16.svg',
    warningInfo16:'assets/task-types-b/warning-info-16.svg'
  });

  const terminal = new Set(['Завершено','Отклонена','Отозвана','Отменено']);
  const list = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' ? value.trim() : '';
  const option = (value,label=value) => ({value,label});
  const ro = (key,label,value,extra={}) => ({key,label,kind:'readonly',value,...extra});
  const person = (key,label,name) => ({key,label,kind:'person',value:name || '—'});
  const heading = (key,value) => ({key,kind:'heading',text:value});
  const note = (key,value,tone='plain') => ({key,kind:'note',text:value,tone});
  const isoDate = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return false;
    const [,y,m,d] = match, date = new Date(Date.UTC(+y,+m-1,+d));
    return +y >= 1800 && +y <= 2200 && date.getUTCFullYear() === +y && date.getUTCMonth()+1 === +m && date.getUTCDate() === +d;
  };
  const displayDate = value => isoDate(value) ? value.split('-').reverse().join('.') : '—';
  const data = (d,ctx={}) => ({...(ctx.task?.flowData || {}),...(ctx.task || {}),...(d || {})});
  const currentProcess = (d,ctx) => list(ctx.processes).find(p => String(p.id) === String(d.processId));
  const processPatch = (d,ctx) => {
    const p = currentProcess(d,ctx);
    return p ? {processId:String(p.id),processCode:p.code || String(p.id),processTitle:p.title || '',block:p.block || '',division:p.division || ''} : {};
  };
  const participants = (d,ctx) => [
    person('initiator','Инициатор',d.initiator || ctx.task?.initiator || ctx.currentUser),
    {key:'assignees',label:'Ответственные',kind:'people',value:list(d.assignees)}
  ];
  const deadline = d => ({key:'deadline',label:'Срок задачи',kind:'date',value:d.deadline || ''});
  const ownerOnly = (task,ctx) => (task.outgoing || task.initiator === ctx.currentUser) && !task.incoming && !list(task.assignees).includes(ctx.currentUser);
  const withdraw = () => ({id:'withdraw',label:'Отозвать',kind:'secondary',nextStatus:'Отозвана',immediate:true});
  const reject = (patch) => ({
    id:'reject',label:'Отклонить',kind:'secondary',icon:'reject',nextStatus:'Отклонена',
    sheetTitle:'Отклонение задачи',copy:'Внесите причину отклонения',
    commentRequired:true,confirmLabel:'Отклонить задачу',...(patch ? {patch} : {})
  });
  const rework = (patch) => ({
    id:'rework',label:'На доработку',kind:'secondary',icon:'reset',nextStatus:'На доработке',
    sheetTitle:'Отправить на доработку',copy:'Внесите комментарий для доработки.',
    commentRequired:true,confirmLabel:'На доработку',...(patch ? {patch} : {})
  });
  const commonDraft = title => ({title,description:'',deadline:'',processId:'',assignees:[],resultVariant:''});
  function requiredCommon(d,ctx,{titleRequired=true,processRequired=true,peopleRequired=true}={}) {
    const errors = {};
    if (titleRequired && !text(d.title)) errors.title = 'Введите название задачи.';
    if (processRequired && !d.processId) errors.processId = 'Выберите процесс.';
    else if (processRequired && list(ctx.processes).length && !currentProcess(d,ctx)) errors.processId = 'Выберите доступный процесс из списка.';
    if (peopleRequired && !list(d.assignees).length) errors.assignees = 'Выберите хотя бы одного ответственного.';
    if (d.deadline && !isoDate(d.deadline)) errors.deadline = 'Укажите существующую дату в формате ДД.ММ.ГГГГ.';
    return errors;
  }
  function variants(d,ctx) {
    const source = [...list(currentProcess(d,ctx)?.variants),...list(d.variants)];
    if (d.resultVariant) source.push(d.resultVariant);
    const labels = source.map(v => typeof v === 'string' ? v : v?.label || v?.title || v?.name).filter(Boolean);
    return [...new Set(labels)].map(v => option(v));
  }
  function resultField(d,ctx,editable=false) {
    if (!editable) return ro('resultVariant','Вариант предоставления результата процесса',d.resultVariant || '—');
    const options = variants(d,ctx);
    return {key:'resultVariant',label:'Вариант предоставления результата процесса',kind:'select',options,
      disabled:!d.processId || !options.length,placeholder:!d.processId ? 'Сначала выберите процесс' : options.length ? 'Выберите' : 'Варианты не указаны'};
  }

  // Names follow the supplied layouts; catalog properties are illustrative,
  // rather than purported production monitoring measurements.
  const metricOptions = [
    {value:'duration-deviation',label:'Отклонение по длительности',code:'М001',description:'Отклонение длительности выполнения процесса от целевого значения',unit:'%',target:'≤ 10'},
    {value:'technical-error-share',label:'Доли технических ошибок',code:'М002',description:'Доля операций, завершившихся с технической ошибкой',unit:'%',target:'≤ 1'},
    {value:'request-count',label:'Количество обращений',code:'М003',description:'Количество обращений по процессу за период мониторинга',unit:'шт.',target:'План периода'},
    {value:'duration',label:'Длительность',code:'М004',description:'Время предоставления результата процесса',unit:'мин.',target:'План процесса'}
  ];
  const metricName = row => row.label || metricOptions.find(m => m.value === row.value)?.label || 'Метрика';
  const metricRows = d => list(d.metrics).filter(m => m && typeof m === 'object');
  function periodError(d) {
    if (d.indefinite) return '';
    if (!isoDate(d.periodFrom) || !isoDate(d.periodTo)) return 'Укажите даты начала и окончания периода.';
    return d.periodTo < d.periodFrom ? 'Дата окончания не может быть раньше даты начала.' : '';
  }
  function validateMetrics(d) {
    const rows = metricRows(d);
    if (!rows.length) return {metrics:'Добавьте хотя бы одну метрику.'};
    const seen = new Set();
    for (const row of rows) {
      if (!metricOptions.some(m => m.value === row.value)) return {metrics:'Выберите метрику из списка.'};
      if (seen.has(row.value)) return {metrics:'Одна и та же метрика не должна повторяться.'};
      seen.add(row.value);
      if (!text(row.reason)) return {metrics:`Укажите обоснование для метрики «${metricName(row)}».`};
      const invalid = periodError(row);
      if (invalid) return {metrics:`«${metricName(row)}»: ${invalid}`};
    }
    return {};
  }
  const decisions = d => metricRows(d).map(row => ({...row,approved:row.approved !== false}));
  const metricsDescriptor = (editable,interactive=false,label='Ваши метрики') => ({
    key:'metrics',label,kind:'metrics',options:metricOptions,editable,interactive,
    reasonRequired:true,period:true,periodHelp:'После окончания периода метрики автоматически возвращаются в мониторинг.',
    emptyTitle:'Предложите метрики',emptyText:'Добавьте метрики и обоснуйте их неприменимость для выбранного процесса.',
    addLabel:'Добавить метрику',decisionLabels:{approved:'Согласован',rejected:'Отклонен'}
  });
  const metricInapplicability = {
    id:'metric-inapplicability',label:'Неприменимость метрик',tag:'Неприменимость',prefix:'ТЗ',
    initial:() => ({...commonDraft('Неприменимость метрик'),metrics:[]}),
    fields:(d,ctx) => [
      {key:'title',label:'Название',kind:'text',required:true},deadline(d),
      {key:'processId',label:'Процесс',kind:'process',required:true},resultField(d,ctx,true),
      metricsDescriptor(true),{key:'assignees',label:'Ответственные',kind:'people',required:true}
    ],
    viewFields:(d,ctx) => {
      const v = data(d,ctx),status = ctx.task?.status || v.status;
      const reviewing = !terminal.has(status) && status !== 'На доработке' && !ownerOnly(ctx.task || v,ctx);
      return [deadline(v),...participants(v,ctx),{key:'processId',label:'Процесс',kind:'process'},resultField(v,ctx),
        ...(reviewing ? [heading('metric-proposal','Предложенные метрики к неприменимости'),
          note('metric-instruction','Необходимо выбрать метрики для согласования'),
          note('metric-warning','Обратите внимание! Невыбранные метрики будут автоматически отклонены.','warning')] : []),
        metricsDescriptor(status === 'На доработке',reviewing || status === 'На доработке',reviewing ? '' : status === 'На доработке' ? 'Ваши метрики' : 'Метрики к неприменимости'),
        ...(v.executor ? [person('executor','Исполнитель',v.executor)] : [])];
    },
    validate:(d,ctx) => ({...requiredCommon(d,ctx),...validateMetrics(d)}),
    onCreate:(d,ctx) => ({...processPatch(d,ctx),metrics:decisions(d)}),
    actions:(task,ctx) => {
      if (terminal.has(task.status)) return [];
      if (task.status === 'На доработке') return [{id:'resubmit',label:'Выполнить',kind:'primary',icon:'tick',nextStatus:'Создана',
        immediate:true,validate:validateMetrics,patch:d => ({metrics:decisions(d)})}];
      if (ownerOnly(task,ctx)) return [withdraw()];
      return [reject(d => ({metrics:metricRows(d).map(m => ({...m,approved:false}))})),rework(d => ({metrics:decisions(d)})),
        {id:'approve',label:'Согласовать',kind:'primary',icon:'tick',nextStatus:'Завершено',sheetTitle:'Согласование',
          copy:'Внесите финальный комментарий по задаче.',commentRequired:false,confirmLabel:'Согласовать',
          validate:d => decisions(d).some(m => m.approved) ? {} : {metrics:'Выберите хотя бы одну метрику для согласования.'},
          patch:d => ({metrics:decisions(d),executor:ctx.currentUser})}];
    }
  };

  const channelOptions = [option('ВСП'),option('МП СБОЛ'),option('СБОЛ'),option('Контактный центр')];
  const scopeGroups = [
    {key:'scopeMonitoring',label:'Мониторинг',options:[option('pm','На мониторинге в PM'),option('no-pm','Не на мониторинге в PM')]},
    {key:'scopeProcessType',label:'Тип процесса',options:[option('service','Услуга'),option('rule','Управляющее воздействие или правило')]},
    {key:'scopeClientType',label:'Тип клиента',options:[option('external','Внешний'),option('internal','Внутренний')]},
    {key:'scopeFrequency',label:'Частотность процесса',options:[option('high','Высокочастотный'),option('low','Низкочастотный')]}
  ];
  const joined = (values,options) => list(values).map(value => options.find(o => o.value === value)?.label || value).join(', ') || '—';
  function periodFields(d) {
    return [
      {key:'indefinite',label:'Бессрочно',kind:'switch',sectionLabel:'Период неприменимости'},
      note('period-help','После окончания периода метрики автоматически возвращаются в мониторинг.'),
      {key:'periodFrom',label:'Дата начала',kind:'date',required:!d.indefinite,disabled:Boolean(d.indefinite),group:'period',columns:2},
      {key:'periodTo',label:'Дата окончания',kind:'date',required:!d.indefinite,disabled:Boolean(d.indefinite),group:'period',columns:2}
    ];
  }
  const bulkInapplicability = {
    id:'bulk-metric-inapplicability',label:'Массовая неприменимость метрик',tag:'Массовая неприменимость',prefix:'ТЗ',createStatus:'Завершено',
    initial:() => ({...commonDraft('Массовая неприменимость метрик'),channels:[],metricIds:[],scopeMode:'custom',
      scopeMonitoring:['pm'],scopeProcessType:['service'],scopeClientType:['external'],scopeFrequency:['high','low'],
      indefinite:false,periodFrom:'',periodTo:'',reason:''}),
    fields:d => [
      {key:'title',label:'Название',kind:'text',required:true},
      {key:'channels',label:'Каналы',kind:'multiselect',options:channelOptions,required:true},
      {key:'metricIds',label:'Метрики',kind:'multiselect',options:metricOptions,required:true},
      {key:'scopeMode',label:'Охват процессов',kind:'radio',appearance:'segmented',options:[option('all','Все процессы'),option('custom','Настроить')],inlineLabel:true},
      ...(d.scopeMode === 'custom' ? scopeGroups.map(g => ({...g,kind:'checkbox',group:'scope',columns:2,groupLabel:'Настройка охвата',
        groupHelp:'После окончания периода метрики автоматически возвращаются в мониторинг.'})) : []),
      ...periodFields(d),{key:'reason',label:'Обоснование',kind:'textarea',required:true,placeholder:'Введите текст обоснования',height:160}
    ],
    viewFields:(d,ctx) => {
      const v = data(d,ctx);
      return [person('initiator','Инициатор',v.initiator || ctx.currentUser),
        {key:'channels',label:'Каналы',kind:'multiselect',options:channelOptions,value:list(v.channels)},
        {key:'metricIds',label:'Метрики',kind:'multiselect',options:metricOptions,value:list(v.metricIds)},
        ...(v.scopeMode === 'all' ? [ro('scopeMode','Охват процессов','Все процессы',{group:'scope-summary',groupLabel:'Охват процессов'})]
          : scopeGroups.map(g => ro(g.key,g.label,joined(v[g.key],g.options),{group:'scope-summary',columns:2,groupLabel:'Охват процессов'}))),
        ro('period','Период неприменимости',v.indefinite ? 'Бессрочно' : `${displayDate(v.periodFrom)} — ${displayDate(v.periodTo)}`),
        ro('reason','Обоснование',v.reason || '—'),
        ...(v.restoredBy ? [person('restoredBy','Ответственный от ДПСС',v.restoredBy)] : [])];
    },
    validate:(d,ctx) => {
      const e = requiredCommon(d,ctx,{processRequired:false,peopleRequired:false});
      if (!list(d.channels).length) e.channels = 'Выберите хотя бы один канал.';
      if (!list(d.metricIds).length) e.metricIds = 'Выберите хотя бы одну метрику.';
      if (!['all','custom'].includes(d.scopeMode)) e.scopeMode = 'Выберите охват процессов.';
      if (d.scopeMode === 'custom') for (const group of scopeGroups) if (!list(d[group.key]).length) e[group.key] = `Выберите значение в группе «${group.label}».`;
      const p = periodError(d);if (p) e.periodFrom = p;
      if (!text(d.reason)) e.reason = 'Укажите обоснование неприменимости.';
      return e;
    },
    onCreate:d => ({description:text(d.reason),applicability:'not-applicable'}),
    actions:(task,ctx) => task.status === 'Завершено' && task.flowData?.applicability !== 'applicable' && task.applicability !== 'applicable' ? [{
      id:'restore',label:'Вернуть применимость',kind:'secondary',icon:'tick',nextStatus:'Отменено',
      sheetTitle:'Вернуть применимость',copy:'Внесите финальный комментарий по задаче.',
      commentLabel:'Обоснование',commentRequired:true,confirmLabel:'Вернуть применимость',
      patch:{applicability:'applicable',restoredBy:ctx.currentUser}
    }] : []
  };

  const businessCopy = 'Вам необходимо подготовить новую версию БО (с указанием к архивации старого БО), пройти согласование и закрыть задачу с указанием регистрационного номера из SberDocs';
  function businessOptions(d,ctx) {
    const p = currentProcess(d,ctx), provided = list(p?.businessDescriptions);
    if (provided.length) return provided.map(b => typeof b === 'string' ? option(b) : option(b.id || b.number || b.title,b.label || b.title || b.number));
    // A selectable document, not a fabricated remote ARIS/SberDocs address.
    const name = `№ 2391-7 ${p?.code || 'П0001'} — ${p?.title || 'Приобретение ЦФА'}`;
    return [option('demo-business-description',name)];
  }
  function businessInfo(d,ctx,editable=false) {
    const options = businessOptions(d,ctx), doc = options.find(o => o.value === d.businessDescriptionId);
    return [
      {key:'processId',label:'Процесс',kind:'process',required:editable},
      editable ? {key:'businessDescriptionId',label:'Название и реквизиты утверждения бизнес-описания',kind:'select',options,required:true,disabled:!d.processId}
        : ro('businessDescriptionTitle','Название и реквизиты утверждения бизнес-описания',doc?.label || d.businessDescriptionTitle || '—'),
      ro('businessApprovalDate','Дата утверждения ВНД',displayDate(d.businessApprovalDate),{group:'business-meta',columns:2}),
      ro('businessArisLabel','Ссылка на описание в ARIS',d.businessArisLabel || 'БО1',{tone:'link',group:'business-meta',columns:2})
    ];
  }
  function answerFields(d,interactive) {
    if (!interactive) return [heading('business-outcome',d.businessOutcome === 'not-updated' ? 'Не актуализировано' : 'Актуализировано'),
      ...(d.businessOutcome !== 'not-updated' ? [ro('registrationNumber','Регистрационный номер описания процесса/документа в SberDocs',d.registrationNumber || '—')] : [])];
    return [heading('business-instruction-heading','Актуализируйте бизнес-описание процесса'),note('business-instruction',businessCopy),
      {key:'businessOutcome',label:'Результат актуализации',kind:'radio',appearance:'segmented',interactive:true,hideLabel:true,options:[option('updated','Актуализировано'),option('not-updated','Не актуализировано')]},
      ...(d.businessOutcome !== 'not-updated' ? [{key:'registrationNumber',label:'Регистрационный номер описания процесса/документа в SberDocs',kind:'text',interactive:true,required:true,placeholder:'Введите регистрационный номер'}] : [])];
  }
  const answerErrors = d => !['updated','not-updated'].includes(d.businessOutcome)
    ? {businessOutcome:'Выберите результат актуализации.'}
    : d.businessOutcome === 'updated' && !text(d.registrationNumber) ? {registrationNumber:'Введите регистрационный номер в SberDocs.'} : {};
  const businessUpdate = {
    id:'business-description-update',label:'Актуализация Бизнес-описания',tag:'Бизнес-описание',prefix:'ТЗ',
    initial:() => ({...commonDraft('Актуализация Бизнес-описания'),businessDescriptionId:'',businessDescriptionTitle:'',businessApprovalDate:'2024-03-28',businessArisLabel:'БО1',
      businessOutcome:'updated',registrationNumber:'',sourceTaskLabel:'Задача по самопроверке актуальности бизнес-описания процесса: П4135'}),
    fields:(d,ctx) => [...businessInfo(d,ctx,true),deadline(d),
      {key:'description',label:'Обоснование',kind:'textarea',required:true,placeholder:'Введите обоснование актуализации'},
      {key:'assignees',label:'Ответственные',kind:'people',required:true}],
    viewFields:(d,ctx) => {
      const v = data(d,ctx),status = ctx.task?.status || v.status;
      const answering = ['Создана','Выполняется','На доработке'].includes(status);
      return [deadline(v),person('initiator','Инициатор',v.initiator || ctx.currentUser),
        {key:'assignees',label:'Ответственные',kind:'people',value:list(v.assignees),interactive:answering},
        ...businessInfo(v,ctx),ro('sourceTaskLabel','На основании связанной задачи',v.sourceTaskLabel || '—',{tone:'link'}),
        ...answerFields(v,answering),...(v.executor ? [person('executor','Исполнитель',v.executor)] : []),
        ...(v.businessReviewer ? [person('businessReviewer','Ответственный от ДПСС',v.businessReviewer)] : [])];
    },
    validate:(d,ctx) => {
      const e = requiredCommon(d,ctx);
      if (!d.businessDescriptionId) e.businessDescriptionId = 'Выберите бизнес-описание.';
      if (!text(d.description)) e.description = 'Укажите обоснование актуализации.';
      return e;
    },
    onCreate:(d,ctx) => ({...processPatch(d,ctx),businessDescriptionTitle:businessOptions(d,ctx).find(o => o.value === d.businessDescriptionId)?.label || ''}),
    actions:(task,ctx) => {
      if (terminal.has(task.status)) return [];
      if (['Выполнена','На согласовании'].includes(task.status)) return [
        rework({businessReviewer:ctx.currentUser}),
        {id:'approve',label:'Согласовать',kind:'primary',icon:'tick',nextStatus:'Завершено',immediate:true,
          patch:d => ({businessOutcome:d.businessOutcome,registrationNumber:d.businessOutcome === 'not-updated' ? '' : text(d.registrationNumber),businessReviewer:ctx.currentUser})}];
      return [{id:'submit',label:'Отправить',kind:'primary',icon:'tick',nextStatus:'Выполнена',
        sheetTitle:'Отправить',copy:'Внесите комментарий для отправки решения.',commentRequired:false,confirmLabel:'Отправить',
        validate:answerErrors,patch:d => ({businessOutcome:d.businessOutcome,registrationNumber:d.businessOutcome === 'not-updated' ? '' : text(d.registrationNumber),assignees:list(d.assignees),executor:ctx.currentUser})}];
    }
  };

  function insightLinks(d,ctx) {
    const i = list(ctx.insights).find(i => String(i.id) === String(d.insightId));
    const explicitId = i?.processId || list(i?.processIds)[0];
    const p = list(ctx.processes).find(p => String(p.id) === String(explicitId || d.processId));
    return {insight:i,process:p};
  }
  function insightContextFields(d,ctx) {
    const {insight,process:p} = insightLinks(d,ctx);
    const label = p ? `${p.code || p.id} ${p.title || ''}` : 'Связанный процесс не указан';
    const result = insight?.resultVariant || d.resultVariant || '—';
    return [ro('insightProcess','Процесс',label),ro('insightResult','Вариант предоставления результата процесса',result),
      {key:'processLinks',label:'Связи процесса',kind:'accordion',open:true,
        text:'Информация о инсайте автоматически подтягивается в карточки связанных объектов, для доступности другим командам.'}];
  }
  const insightTask = {
    id:'insight',label:'Задача к инсайту',tag:'Задача к инсайту',prefix:'ТЗ',
    initial:() => ({...commonDraft(''),insightId:'',insightTitle:'',insightCode:''}),
    fields:(d,ctx) => [
      {key:'title',label:'Название',kind:'text',required:true,placeholder:'Введите название задачи'},deadline(d),
      {key:'insightId',label:'Инсайт',kind:'insight',required:true},...insightContextFields(d,ctx),
      {key:'description',label:'Описание',kind:'textarea',placeholder:'Введите описание задачи'},
      {key:'assignees',label:'Ответственные',kind:'people',required:true}
    ],
    viewFields:(d,ctx) => {
      const v = data(d,ctx), i = insightLinks(v,ctx).insight;
      return [deadline(v),ro('insightLabel','Инсайт',`${i?.code || v.insightCode || ''} ${i?.title || v.insightTitle || '—'}`.trim()),
        ...insightContextFields(v,ctx),ro('description','Описание',v.description || '—'),...participants(v,ctx),
        ...(v.executor ? [person('executor','Исполнитель',v.executor)] : [])];
    },
    validate:(d,ctx) => {
      const e = requiredCommon(d,ctx,{processRequired:false});
      if (!d.insightId) e.insightId = 'Выберите инсайт.';
      else if (list(ctx.insights).length && !list(ctx.insights).some(i => String(i.id) === String(d.insightId))) e.insightId = 'Выберите доступный инсайт из списка.';
      return e;
    },
    onCreate:(d,ctx) => {
      const {insight:i,process:p} = insightLinks(d,ctx);
      return {insightId:d.insightId,insightCode:i?.code || '',insightTitle:i?.title || '',
        ...(p ? {processId:String(p.id),processCode:p.code || String(p.id),processTitle:p.title || '',block:p.block || '',division:p.division || ''} : {}),
        resultVariant:i?.resultVariant || d.resultVariant || ''};
    },
    actions:(task,ctx) => {
      if (terminal.has(task.status)) return [];
      if (ownerOnly(task,ctx)) return [withdraw()];
      return [reject(),{id:'complete',label:'Завершить',kind:'primary',icon:'tick',nextStatus:'Завершено',
        sheetTitle:'Завершение задачи',copy:'При необходимости, внесите финальный комментарий по задаче',
        commentRequired:false,confirmLabel:'Завершить задачу',patch:{executor:ctx.currentUser}}];
    }
  };

  Object.assign(window.BpmTaskTypes || (window.BpmTaskTypes = {}), {
    [metricInapplicability.id]:metricInapplicability,
    [bulkInapplicability.id]:bulkInapplicability,
    [businessUpdate.id]:businessUpdate,
    [insightTask.id]:insightTask
  });
})();

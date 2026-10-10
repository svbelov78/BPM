/* Insights registry · Products-BPM and BRD-007 v57, 08.10.2026.
 * Six original IDs plus ten synthetic territorial-bank scenarios. Names,
 * assignments, values and decisions are demonstration data, not BRD identities.
 * The counter uses actual records. Cabinet data is untouched.
 */
(() => {
  'use strict';
  const processes = (window.BPM_DATA || []).filter(row => row.entity === 'processes');
  const paths = (window.BPM_DATA || []).filter(row => row.entity === 'paths');
  const workflowApi = window.BpmInsightWorkflow;
  const deepFreeze = value => {
    if (value && typeof value === 'object') {Object.values(value).forEach(deepFreeze); Object.freeze(value);}
    return value;
  };
  const seeds = [
    {id:'INS-000078', title:'Аномальный rework-цикл в согласовании', description:'По итогам 2026 года продуктом не достигнуто целевое значение КПЭ «Точность решений мониторинга». Повторные согласования увеличивают время обработки заявки.', owner:'Горбачёва Нина Александровна', author:'Гослинг Райан Томас', created:'2026-04-09', status:'Отклонено', source:'SberBPM ЦА', comments:2, rating:4.3, rejection:'Предложение уже учтено в плане улучшений процесса.', problem:true},
    {id:'INS-000067', title:'Снижение времени ввода данных своих сотрудников в СберБизнесе', description:'При приёме на работу нового сотрудника и для перечисления ему выплат в рамках зарплатного проекта необходимо повторно вводить данные в СберБизнесе. Предлагается использовать уже заполненные сведения.', owner:'', author:'Петров Игорь Иванович', created:'2026-03-26', status:'В работе', source:'Process mining', comments:5, rating:3.6, previousRating:5},
    {id:'INS-000044', title:'Оптимизация процесса перевода остатка при закрытии счёта', description:'При закрытии счёта перевод остатка требует дополнительного обращения. Объединение шагов сократит время клиента и количество ручных операций.', owner:'Минаева Анна Валерьевна', author:'Иванов Иван Васильевич', created:'2026-02-05', status:'В работе', source:'ТБ', comments:12, rating:3},
    {id:'INS-000042', title:'Перевод объёмов бизнеса в ГО по Республике Крым', description:'По итогам 2023 года продуктом не достигнуто целевое значение КПЭ «Точность решений мониторинга» — 16,4% при плане 20%.', owner:'Писемский Дмитрий Николаевич', author:'Горбачёва Нина Александровна', created:'2026-01-26', status:'Реализовано', source:'Гемба', comments:17, rating:5},
    {id:'INS-000016', title:'Опросная кампания', description:'По итогам общебанковского опроса за второй квартал 2025 года сформирован отчёт. Выявлены ключевые зоны развития процесса.', owner:'Александров Андрей Олегович', author:'Минаева Анна Валерьевна', created:'2026-01-13', status:'Реализовано', source:'ПроМнение', comments:0, rating:4},
    {id:'INS-000009', title:'Аномальный rework-цикл при согласовании заявок сотрудников', description:'Повторное согласование одних и тех же данных увеличивает срок исполнения. Предлагается исключить дублирующие проверки и уведомлять ответственного об изменениях.', owner:'Гослинг Райан Томас', author:'Александров Андрей Олегович', created:'2026-01-03', status:'Новый', source:'SberBPM ЦА', comments:23, rating:4.3},
    {id:'INS-000060',scenario:'directors',title:'Один пакет документов для открытия расчётного счёта',description:'Клиент повторно приносит одни и те же документы в соседние подразделения. Единый пакет сократит число обращений и время открытия счёта.',solution:'Сохранять проверенный комплект в карточке клиента и запрашивать только изменившиеся сведения.',created:'2026-10-07',bank:'Северо-Западный банк',author:'Крылова Дарья Олеговна',status:'Новый',rating:4.2},
    {id:'INS-000059',scenario:'first-reject',title:'Предзаполнение заявки на подключение эквайринга',description:'Сотрудник вручную переносит реквизиты клиента в заявку на эквайринг, хотя они уже проверены в профиле компании.',solution:'Подставлять реквизиты из профиля и подсвечивать поля, которые нужно подтвердить.',created:'2026-10-05',bank:'Уральский банк',author:'Жуков Павел Сергеевич',status:'Новый',rating:3.8},
    {id:'INS-000058',scenario:'chair',title:'Проверка полномочий без повторного запроса доверенности',description:'На каждом этапе обслуживания требуется отдельная проверка одинаковой доверенности. Клиент ожидает, пока сотрудник повторно сверяет документ.',solution:'Использовать единый результат проверки до истечения срока действия доверенности.',created:'2026-10-01',bank:'Сибирский банк',author:'Орлова Ирина Денисовна',status:'Новый',rating:4.5},
    {id:'INS-000057',scenario:'one-stage',title:'Маршрут обработки нестандартного обращения в офисе',description:'Обращения без типовой категории проходят через несколько очередей, прежде чем попадают к нужному специалисту.',solution:'Добавить быстрый маршрут с назначением ответственного по сути обращения.',created:'2026-10-04',bank:'Волго-Вятский банк',author:'Лебедев Алексей Сергеевич',status:'Новый',rating:4.1},
    {id:'INS-000056',scenario:'auto',title:'Единый стандарт сопровождения малого бизнеса',description:'В соседних подразделениях предпринимателю дают разные списки шагов для одного продукта. Это увеличивает число уточняющих обращений.',solution:'Показывать сотруднику актуальный общий список шагов из карточки продукта.',created:'2026-10-06',bank:'Дальневосточный банк',author:'Воронов Андрей Михайлович',status:'Согласовано',rating:4.8},
    {id:'INS-000055',scenario:'opinions',title:'Уведомление о готовности документов в СберБизнесе',description:'Клиент звонит в офис, чтобы узнать, подготовлены ли документы. Уведомление о готовности поможет избежать лишних звонков.',solution:'Автоматически отправлять уведомление после проверки и подготовки комплекта.',created:'2026-09-28',bank:'Московский банк',author:'Смирнова Полина Андреевна',status:'Согласовано',rating:4.4},
    {id:'INS-000054',scenario:'collected',title:'Проверка реквизитов до отправки платёжного поручения',description:'Ошибки в реквизитах обнаруживаются после отправки поручения. Возврат на исправление задерживает исполнение платежа.',solution:'Проверять заполнение обязательных реквизитов перед подтверждением платежа.',created:'2026-09-20',bank:'Байкальский банк',author:'Фролов Артём Николаевич',status:'Мнения собраны',rating:4.6},
    {id:'INS-000053',scenario:'rejected',title:'Повторное подтверждение заявки при изменении тарифа',description:'После изменения тарифа заявка полностью возвращается клиенту на повторное заполнение, даже если остальные условия не изменились.',solution:'Сохранять заполненные поля и повторно подтверждать только изменённые условия.',created:'2026-09-24',bank:'Центрально-Черноземный банк',author:'Егорова Анна Максимовна',status:'Отклонено',rating:3.2,rejection:'Сценарий уже входит в согласованное изменение тарифного сервиса.'},
    {id:'INS-000052',scenario:'in-work',title:'Единая очередь запросов на изменение данных клиента',description:'Запросы на обновление профиля поступают через несколько каналов. Ответственные вручную проверяют, не выполняется ли тот же запрос.',solution:'Объединить обращения в одну очередь и показывать действующий запрос в профиле.',created:'2026-09-12',bank:'Среднерусский банк',author:'Кузнецов Роман Валерьевич',status:'В работе',rating:4.7},
    {id:'INS-000051',scenario:'realized',title:'Автоматическая проверка комплектности кредитного досье',description:'До автоматизации сотрудник вручную сопоставлял документы в досье со списком обязательных вложений.',solution:'Проверять комплектность по типу продукта и показывать отсутствующие документы.',created:'2026-08-25',bank:'Юго-Западный банк',author:'Морозова Светлана Ильинична',status:'Реализовано',rating:4.9}
  ];
  function makeDetail(row,scenario,index) {
    const authorRole = scenario === 'one-stage' ? 'Директор ПСС ТБ' : scenario === 'auto' ? 'Председатель ТБ' : 'Сотрудник ПСС ТБ';
    const workflow = workflowApi.createWorkflow(row,{authorRole});
    const directors = workflow.stages.find(stage => stage.id === 'directors'), chair = workflow.stages.find(stage => stage.id === 'chair');
    const history = [{date:row.created.split('-').reverse().join('.'),text:'Инсайт создан'}], comments = [];
    const recordDecision = (stage,decision,date,comment = '',actorIndex = 0) => {
      const actor = stage.actors[actorIndex];
      stage.decisions.push({actorId:actor.id,actorName:actor.name,role:actor.role,decision,date,comment});
      history.unshift({date:date.split('-').reverse().join('.'),text:`${decision === 'approve' ? 'Согласовано' : 'Отклонено'}: ${actor.name} (${actor.role})`});
      if (comment) comments.push({author:actor.name,date:date.split('-').reverse().join('.'),text:comment,kind:'decision'});
    };
    const closeStage = (stage,status,date) => {stage.status = status; stage.completedAt = date;};
    if (scenario === 'directors') workflow.currentActor = directors.actors[0];
    if (scenario === 'first-reject') {
      recordDecision(directors,'reject','2026-10-06','Нужно уточнить, какие поля доступны из профиля компании.');
      workflow.currentActor = directors.actors[1];
    }
    if (scenario === 'chair' || ['opinions','collected','rejected','in-work','realized'].includes(scenario) || (row.source === 'ТБ' && !scenario)) {
      recordDecision(directors,'approve',workflowApi.addDays(row.created,1),'Подтверждаю проблему и ожидаемый эффект.');
      closeStage(directors,'approved',workflowApi.addDays(row.created,1));
      chair.status = 'current'; chair.dueDate = workflowApi.addDays(row.created,8); workflow.stage = 'chair';
      workflow.currentActor = chair.actors[0];
      if (scenario !== 'chair') {
        const approved = scenario !== 'rejected', date = workflowApi.addDays(row.created,2);
        recordDecision(chair,approved ? 'approve' : 'reject',date,approved ? 'Передать другим банкам для оценки.' : row.rejection);
        closeStage(chair,approved ? 'approved' : 'rejected',date); workflow.stage = 'complete';
        if (approved) workflow.opinions.dueDate = workflowApi.addDays(date,7);
      }
    }
    if (scenario === 'one-stage') workflow.currentActor = chair.actors[1];
    if (scenario === 'auto') history.unshift({date:row.created.split('-').reverse().join('.'),text:'Согласование не требуется: автор — председатель ТБ'});
    const opinionCases = ['auto','opinions','collected','in-work','realized'];
    if (opinionCases.includes(scenario)) {
      const respondent = {id:`${row.id}:respondent`,name:'Васильева Ольга Александровна',role:'Ответственный от ТБ',bank:'Поволжский банк'};
      workflow.currentActor = respondent;
      const responseBanks = ['Уральский банк','Сибирский банк','Среднерусский банк'];
      workflow.opinions.responses = responseBanks.filter(bank => bank !== row.bank).map((bank,i) => ({bank,person:['Тихонов Денис Олегович','Котова Ирина Петровна','Серов Михаил Андреевич'][i],actorId:`${row.id}:opinion-${i}`,reproduction:i === 1 ? 'Частично' : 'Воспроизводится',comment:i === 1 ? 'Подтверждаем для части операций в офисах.' : 'Проблема воспроизводится, ожидаемый эффект подтверждаем.',createdAt:workflowApi.addDays(row.created,3 + i),updatedAt:workflowApi.addDays(row.created,3 + i),effects:[
        {id:'time',applicable:true,current:String(90 + 15 * i),target:'30',unit:'мин.',comment:'Расчёт для типового обращения.'},
        {id:'quality',applicable:true,comment:'Ожидаемый эффект для нашего банка подтверждаем.'}
      ]}));
      if (scenario === 'opinions') workflow.opinions.dueDate = '2026-10-12';
      if (scenario === 'collected') workflow.opinions.dueDate = '2026-10-02';
    }
    if (['collected','in-work','realized'].includes(scenario) || (row.source !== 'ТБ' && row.status === 'Новый')) {
      workflow.currentActor = {id:`${row.id}:owner`,name:row.owner,role:'Владелец процесса',bank:'',processIds:row.related.map(item => item.id)};
    }
    if (['В работе','Реализовано'].includes(row.status)) {
      workflow.stage = 'complete';
      workflow.teamDecision = {actorId:`${row.id}:owner`,actorName:row.owner || 'Владелец процесса',role:'Владелец процесса',decision:'accept',comment:'Изменение включено в план команды процесса.',date:workflowApi.addDays(row.created,10)};
      history.unshift({date:workflowApi.addDays(row.created,10).split('-').reverse().join('.'),text:'Инсайт взят в работу командой процесса'});
    }
    if (row.status === 'Реализовано') history.unshift({date:workflowApi.addDays(row.created,30).split('-').reverse().join('.'),text:'Связанные задачи завершены, изменение реализовано'});
    const current = String(120 + index * 10), target = String(40 + index * 2);
    return {workflow,problem:row.description,causes:'Информация хранится в разных системах, повторные проверки и ручной ввод не связаны между собой.',proposal:row.solution || 'Объединить повторяющиеся действия и использовать уже проверенные данные клиента.',
      effects:[
        {id:'time',name:'Сокращение операционных расходов без ФОТ',title:'Сокращение операционных расходов без ФОТ',type:'Количественный',description:'Снижение затрат времени на обработку одного типового обращения за счёт повторного использования проверенных данных.',current,target,baselineCurrent:current,baselineTarget:target,unit:'мин.',frequency:'Регулярно',period:'Год',applicable:false,comment:''},
        {id:'quality',name:'Повышение клиентского опыта внешнего клиента',title:'Повышение клиентского опыта внешнего клиента',type:'Качественный',description:'Клиент решает вопрос за одно обращение и получает понятный статус без дополнительных звонков.',current:'',target:'',baselineCurrent:'',baselineTarget:'',unit:'',frequency:'Регулярно',period:'Год',applicable:false,comment:''}
      ],comments,history,reproduction:'Без оценки',reproductionComment:'',taskIds:[]};
  }
  window.BPM_INSIGHT_DATA = deepFreeze(seeds.map((seed, index) => {
    const {scenario,...values} = seed;
    const related = [0, 1, 2].map(offset => processes[(index + offset) % processes.length]).filter(Boolean).map((process, offset) => Object.freeze({
      id:process.id, code:`П${process.number}`, title:process.title,
      variants:Object.freeze(offset ? ['Основной вариант предоставления результата'] : ['Дистанционное обслуживание', 'Обслуживание в офисе'])
    }));
    const process = processes[index % processes.length];
    const path = paths[index % paths.length];
    const row = {...values,source:seed.source || 'ТБ',owner:seed.owner ?? 'Белов Никита Андреевич',comments:seed.comments || 0,code:seed.id, kind:'insights', block:process?.block || 'B2C', division:process?.division || 'Повседневные финансы',
      product:['СберБизнес','Платежи и переводы','Расчётный счёт'][index % 3], path:path?.title || 'Обслуживание клиента',
      process:Object.freeze(related.map(item => item.title)), related:Object.freeze(related),
      bank:(seed.source || 'ТБ') === 'ТБ' ? seed.bank || ['Московский банк','Северо-Западный банк','Юго-Западный банк'][index % 3] : ''};
    row.detail = makeDetail(row,scenario,index);
    row.rootCauses = row.detail.causes; row.solution = row.detail.proposal;
    row.comments = row.detail.comments.length;
    row.needsApproval = workflowApi.canApprove(row); row.needsOpinion = workflowApi.needsOpinion(row);
    return row;
  }));
})();

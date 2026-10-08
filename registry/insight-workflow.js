/* BRD-007 v57 local demonstration model. Roles and decisions are synthetic;
 * this browser model is not a substitute for server-side authorization. */
(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const statuses = Object.freeze(['Новый','Согласовано','Мнения собраны','Отклонено','В работе','Реализовано']);
  const tones = ['blue','indigo','indigo','red','indigo','green'];
  const statusMetadata = Object.freeze(Object.fromEntries(statuses.map((label,index) => [label,Object.freeze({label,tone:tones[index]})])));
  const aliases = Object.freeze({'Выполняется':'В работе','Выполнено':'Реализовано','Выполнен':'Реализовано','Завершено':'Реализовано','Отклонён':'Отклонено','Отклонен':'Отклонено'});
  const canonicalize = status => Object.prototype.hasOwnProperty.call(aliases,status) ? aliases[status] : status;
  const displayDate = date => String(date || '').slice(0,10).split('-').reverse().join('.');
  const today = () => new Date().toISOString().slice(0,10);
  function decisionDate(value) {
    const date = String(value || today()).slice(0,10), parsed = new Date(`${date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) throw new Error('Некорректная дата решения.');
    return date;
  }
  function addDays(value,days) {
    const date = new Date(`${String(value || today()).slice(0,10)}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0,10);
  }
  function participants(bank, key = 'demo') {
    return {
      directors:[
        {id:`${key}:pss`,name:'Лебедев Алексей Сергеевич',role:'Директор ПСС ТБ',bank},
        {id:`${key}:crue`,name:'Соколова Марина Игоревна',role:'Директор ЦРиУЭ',bank}
      ],
      chair:[
        {id:`${key}:chair`,name:'Воронов Андрей Михайлович',role:'Председатель ТБ',bank},
        {id:`${key}:deputy`,name:'Миронова Елена Павловна',role:'Заместитель председателя ТБ',bank}
      ]
    };
  }
  function routeForRole(role) {
    if (['Председатель ТБ','Заместитель председателя ТБ','Пред','Зампред'].includes(role)) return 'auto';
    if (['Директор ПСС ТБ','Директор ПСС','Директор ЦРиУЭ','Управляющий ГОСБ'].includes(role)) return 'one-stage';
    return 'two-stage';
  }
  function createWorkflow(row, options = {}) {
    const authorRole = options.authorRole || 'Сотрудник ПСС ТБ';
    const route = row.source === 'ТБ' ? routeForRole(authorRole) : 'none';
    const date = String(options.now || row.created || today()).slice(0,10);
    const assigned = participants(row.bank || '',row.id || 'local');
    const stage = (id,title,actors,current) => ({id,title,status:current ? 'current' : 'next',dueDate:current ? addDays(date,7) : '',completedAt:'',actors,decisions:[]});
    const stages = route === 'two-stage'
      ? [stage('directors','Директора ПСС / ЦРиУЭ',assigned.directors,true),stage('chair','Председатель / заместитель председателя ТБ',assigned.chair,false)]
      : route === 'one-stage' ? [stage('chair','Председатель / заместитель председателя ТБ',assigned.chair,true)] : [];
    return {
      version:1,route,authorRole,stage:stages[0]?.id || 'complete',stages,
      currentActor:clone(options.currentActor || {id:'current-user',name:row.author || '',role:authorRole,bank:row.bank || ''}),
      opinions:{dueDate:route === 'auto' ? addDays(date,7) : '',expectedBanks:10,responses:[]},
      teamDecision:null
    };
  }
  function getWorkflow(row) {
    if (row?.detail?.workflow && typeof row.detail.workflow === 'object' && !Array.isArray(row.detail.workflow)) return clone(row.detail.workflow);
    // Legacy rows have no trustworthy approval participants. Preserve their
    // content and business status, without inventing permission to approve.
    return {version:1,route:'none',authorRole:'',stage:'complete',stages:[],currentActor:null,opinions:{dueDate:'',expectedBanks:10,responses:[]},teamDecision:null};
  }
  function activeStage(workflow) {return (workflow.stages || []).find(stage => stage.id === workflow.stage && stage.status === 'current');}
  function resolveActor(workflow, actor) {return actor || workflow.currentActor;}
  function canApprove(row, actor) {
    if (!row || row.source !== 'ТБ' || canonicalize(row.status) !== 'Новый') return false;
    const workflow = getWorkflow(row), current = activeStage(workflow), user = resolveActor(workflow,actor);
    return !!(current && user?.id && user.bank === row.bank && current.actors?.some(item => item.id === user.id && item.bank === row.bank) && !current.decisions?.some(item => item.actorId === user.id));
  }
  function isOpinionOpen(row) {return row?.source === 'ТБ' && ['Согласовано','Мнения собраны'].includes(canonicalize(row.status)) && !getWorkflow(row).teamDecision;}
  function canGiveOpinion(row, actor) {
    if (!isOpinionOpen(row)) return false;
    const workflow = getWorkflow(row), user = resolveActor(workflow,actor);
    return !!(user?.bank && user.bank !== row.bank && user.role === 'Ответственный от ТБ');
  }
  function needsOpinion(row) {
    const workflow = getWorkflow(row);
    return canGiveOpinion(row) && !(workflow.opinions?.responses || []).some(item => item.bank === workflow.currentActor.bank);
  }
  function canDecideTeam(row,actor) {
    if (!row || canonicalize(row.status) !== (row.source === 'ТБ' ? 'Мнения собраны' : 'Новый')) return false;
    const workflow = getWorkflow(row), user = resolveActor(workflow,actor);
    if (!user || workflow.teamDecision || !['Владелец процесса','Эксперт процесса','Расширенные права на процесс'].includes(user.role)) return false;
    const linked = (row.related || []).map(item => item.id);
    return !!(user.processIds?.some(id => linked.includes(id)) || (user.role === 'Владелец процесса' && row.owner && user.name === row.owner));
  }
  function canEditAuthor(row,actor) {
    const workflow = getWorkflow(row), user = resolveActor(workflow,actor);
    return !!(user && user.name === row.author && canonicalize(row.status) === 'Новый' && !(workflow.stages || []).some(stage => stage.decisions?.length));
  }
  function initialize(row, options = {}) {
    const workflow = createWorkflow(row,options), status = workflow.route === 'auto' ? 'Согласовано' : 'Новый';
    const next = {...row,status,detail:{...(row.detail || {}),workflow}};
    return {status,needsApproval:canApprove(next),needsOpinion:needsOpinion(next),detail:{workflow}};
  }
  function decisionValues(options, accepted) {
    if (!accepted.includes(options.decision)) throw new Error('Выберите решение по инсайту.');
    if (options.comment != null && typeof options.comment !== 'string') throw new Error('Некорректный комментарий.');
    const comment = (options.comment || '').trim();
    if (options.decision === 'reject' && !comment) throw new Error('Комментарий обязателен');
    if (comment.length > 20000) throw new Error('Комментарий слишком длинный.');
    const date = decisionDate(options.now);
    return {comment,date};
  }
  function patchForDecision(row, workflow, status, user, decision, comment, date, historyText) {
    const comments = clone(row.detail?.comments || []);
    if (comment) comments.push({author:user.name,date:displayDate(date),text:comment,kind:'decision'});
    const history = [{date:displayDate(date),text:historyText},...clone(row.detail?.history || [])];
    const detail = {...clone(row.detail || {}),workflow,comments,history};
    const next = {...row,status,detail};
    return {status,needsApproval:canApprove(next),needsOpinion:needsOpinion(next),comments:(Number.isSafeInteger(row.comments) ? row.comments : comments.length - (comment ? 1 : 0)) + (comment ? 1 : 0),
      ...(status === 'Отклонено' && decision === 'reject' ? {rejection:comment} : {}),detail};
  }
  function decide(row, options = {}) {
    const {comment,date} = decisionValues(options,['approve','reject']);
    if (!canApprove(row,options.actor)) throw new Error('Решение по инсайту уже принято или согласование недоступно');
    const workflow = getWorkflow(row), current = activeStage(workflow), user = resolveActor(workflow,options.actor);
    current.decisions.push({actorId:user.id,actorName:user.name,role:user.role,decision:options.decision,comment,date});
    let status = 'Новый';
    if (current.id === 'directors') {
      if (options.decision === 'approve') {
        current.status = 'approved'; current.completedAt = date;
        const next = workflow.stages.find(item => item.id === 'chair');
        if (!next) throw new Error('Не найден следующий этап согласования.');
        next.status = 'current'; next.dueDate = addDays(date,7); workflow.stage = 'chair';
      } else if (current.actors.every(actor => current.decisions.some(item => item.actorId === actor.id && item.decision === 'reject'))) {
        current.status = 'rejected'; current.completedAt = date; workflow.stage = 'complete'; status = 'Отклонено';
      }
    } else {
      current.status = options.decision === 'approve' ? 'approved' : 'rejected';
      current.completedAt = date; workflow.stage = 'complete'; status = options.decision === 'approve' ? 'Согласовано' : 'Отклонено';
      if (status === 'Согласовано') workflow.opinions = {...workflow.opinions,dueDate:addDays(date,7)};
    }
    const action = options.decision === 'approve' ? 'Согласовано' : 'Отклонено';
    const suffix = current.id === 'directors' && current.status === 'current' ? '. Ожидается решение второго директора' : '';
    return patchForDecision(row,workflow,status,user,options.decision,comment,date,`${action}: ${user.name} (${user.role}). ${current.title}${suffix}`);
  }
  function decideTeam(row, options = {}) {
    const {comment,date} = decisionValues(options,['accept','reject']);
    if (!canDecideTeam(row,options.actor)) throw new Error('Решение команды по инсайту недоступно или уже принято');
    const workflow = getWorkflow(row), user = resolveActor(workflow,options.actor);
    workflow.teamDecision = {actorId:user.id,actorName:user.name,role:user.role,decision:options.decision,comment,date};
    const status = options.decision === 'accept' ? 'В работе' : 'Отклонено';
    return patchForDecision(row,workflow,status,user,options.decision,comment,date,`${options.decision === 'accept' ? 'Инсайт взят в работу' : 'Инсайт отклонён командой процесса'}: ${user.name}`);
  }
  function saveOpinion(row, options = {}) {
    if (!canGiveOpinion(row,options.actor)) throw new Error('Подача или изменение мнения по инсайту недоступны');
    if (!['Воспроизводится','Частично','Не воспроизводится'].includes(options.reproduction)) throw new Error('Выберите оценку воспроизводимости.');
    const comment = String(options.comment || '').trim();
    if (comment.length > 1000) throw new Error('Комментарий не должен превышать 1000 символов.');
    const workflow = getWorkflow(row), user = resolveActor(workflow,options.actor), date = decisionDate(options.now);
    const effects = options.reproduction === 'Не воспроизводится' ? [] : (options.effects || []).map(effect => {
      const own = {id:String(effect.id || ''),applicable:effect.applicable === true,current:'',target:'',unit:'',comment:String(effect.comment || '').trim()};
      if (own.comment.length > 1000) throw new Error('Комментарий к эффекту не должен превышать 1000 символов.');
      if (own.applicable) {
        own.current = String(effect.current ?? '').trim(); own.target = String(effect.target ?? '').trim(); own.unit = String(effect.unit || '').trim();
        for (const value of [own.current,own.target]) if (value && !Number.isFinite(Number(value.replace(',','.')))) throw new Error('Введите числовое значение.');
        if ((own.current || own.target) && !own.unit) throw new Error('Укажите единицу измерения.');
        if (own.unit.length > 20) throw new Error('Единица измерения не должна превышать 20 символов.');
        if (own.current && own.target && Number(own.current.replace(',','.')) === Number(own.target.replace(',','.'))) throw new Error('Целевое значение совпадает с текущим – эффекта нет.');
      }
      return own;
    });
    const responses = workflow.opinions?.responses || [], previous = responses.find(item => item.bank === user.bank);
    const response = {bank:user.bank,person:user.name,actorId:user.id,reproduction:options.reproduction,comment,effects,createdAt:previous?.createdAt || date,updatedAt:date};
    workflow.opinions = {...workflow.opinions,responses:previous ? responses.map(item => item.bank === user.bank ? response : item) : [...responses,response]};
    const collected = workflow.opinions.responses.length >= workflow.opinions.expectedBanks || (workflow.opinions.dueDate && date >= workflow.opinions.dueDate);
    const status = collected ? 'Мнения собраны' : canonicalize(row.status);
    const detail = {...clone(row.detail || {}),workflow,reproduction:options.reproduction,reproductionComment:comment,
      history:[{date:displayDate(date),text:`${previous ? 'Мнение обновлено' : 'Мнение отправлено'}: ${user.bank}, ${user.name}`},...clone(row.detail?.history || [])]};
    return {status,needsApproval:false,needsOpinion:false,detail};
  }
  window.BpmInsightWorkflow = Object.freeze({statuses,statusMetadata,canonicalize,getWorkflow,createWorkflow,initialize,canApprove,decide,canDecideTeam,decideTeam,isOpinionOpen,canGiveOpinion,canEditOpinion:canGiveOpinion,needsOpinion,saveOpinion,canEditAuthor,addDays,participants});
})();

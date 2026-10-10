/* Local insight state. Demo seeds are immutable; attachments retain metadata only.
 * Text is data, not HTML. Consumers must escape it at their rendering boundary. */
(() => {
  'use strict';
  const storageKey = 'bpm-insight-store:v1', version = 1;
  const currentUser = typeof window.BpmTaskStore?.currentUser === 'string' ? window.BpmTaskStore.currentUser : 'Иванов Иван Васильевич';
  const limits = {rows:2000, record:262144, snapshot:4000000, text:20000, array:1000, depth:8, nodes:20000};
  const forbidden = new Set(['__proto__','constructor','prototype']);
  const reserved = new Set(['id','code','kind','created','createdAt','updatedAt','local']);
  const textFields = new Set(['title','description','solution','rootCauses','source','bank','path','owner','author','block','division','product','rejection']);
  const booleanFields = new Set(['problem','needsApproval','needsOpinion']);
  const listeners = new Set();
  const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonicalStatus = value => window.BpmInsightWorkflow?.canonicalize(value) || ({'Выполняется':'В работе','Выполнено':'Реализовано','Отклонён':'Отклонено','Отклонен':'Отклонено'}[value] || value);
  function fail(message) {throw new TypeError(message || 'Некорректные данные инсайта.');}
  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  // Inspect descriptors before reading values: accessors and dangerous keys are
  // never executed or copied, including in deeply nested detail/effect payloads.
  function entries(value) {
    if (!plain(value)) fail('Ожидался объект полей инсайта.');
    const keys = Reflect.ownKeys(value);
    if (keys.length > 100) fail('Слишком много полей инсайта.');
    return keys.map(key => {
      if (typeof key !== 'string' || !key || key.length > 80 || forbidden.has(key)) fail('Недопустимое поле инсайта.');
      const descriptor = Object.getOwnPropertyDescriptor(value,key);
      if (!descriptor.enumerable || !own(descriptor,'value')) fail('Поля инсайта должны содержать обычные значения.');
      return [key,descriptor.value];
    });
  }
  function text(value, max = limits.text) {
    if (typeof value !== 'string' || value.length > max) fail('Некорректное текстовое поле инсайта.');
    return value;
  }
  function json(value, depth = 0, state = {nodes:0,ancestors:new Set()}) {
    if (++state.nodes > limits.nodes || depth > limits.depth) fail('Слишком сложные данные инсайта.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {if (!Number.isFinite(value)) fail(); return value;}
    if (typeof value === 'string') return text(value);
    if (!value || typeof value !== 'object' || state.ancestors.has(value)) fail();
    state.ancestors.add(value);
    let result;
    if (Array.isArray(value)) {
      if (value.length > limits.array || Reflect.ownKeys(value).length !== value.length + 1) fail('Некорректный список инсайта.');
      result = Array.from({length:value.length}, (_,index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value,String(index));
        if (!descriptor || !own(descriptor,'value')) fail('Некорректный элемент списка инсайта.');
        return json(descriptor.value,depth + 1,state);
      });
    } else result = Object.fromEntries(entries(value).map(([key,item]) => [key,json(item,depth + 1,state)]));
    state.ancestors.delete(value);
    return result;
  }
  function listOfText(value, max = 200) {
    const result = json(value);
    if (!Array.isArray(result) || result.length > max || !result.every(item => typeof item === 'string')) fail('Некорректный список названий.');
    return result;
  }
  function related(value) {
    const result = json(value);
    if (!Array.isArray(result) || result.length > 200) fail('Некорректный список связанных процессов.');
    return result.map(item => {
      if (!plain(item) || !text(item.id,200) || !text(item.code,200) || !text(item.title,2000)) fail('Некорректный связанный процесс.');
      return {...item,variants:listOfText(item.variants || [])};
    });
  }
  function attachments(value) {
    if (!Array.isArray(value) || value.length > 50 || Reflect.ownKeys(value).length !== value.length + 1) fail('Некорректный список вложений.');
    return Array.from({length:value.length}, (_,index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value,String(index));
      if (!descriptor || !own(descriptor,'value')) fail();
      const metadata = {};
      for (const [key,item] of entries(descriptor.value)) {
        // Contents remain in the creation draft only. Never serialize data URLs,
        // object URLs or file bodies into either snapshots or the in-memory store.
        if (key === 'dataUrl') {if (typeof item !== 'string') fail(); continue;}
        if (['id','name','type'].includes(key)) metadata[key] = text(item,key === 'name' ? 1000 : 300);
        else if (key === 'size' || key === 'lastModified') {
          if (!Number.isSafeInteger(item) || item < 0) fail('Некорректные метаданные файла.');
          metadata[key] = item;
        } else fail('Вложение может содержать только метаданные файла.');
      }
      if (!metadata.name?.trim()) fail('Укажите название вложения.');
      return metadata;
    });
  }
  function detail(value) {
    if (!plain(value)) fail('Некорректные подробности инсайта.');
    const result = json(value);
    for (const key of ['effects','comments','history','taskIds']) {
      if (own(result,key) && !Array.isArray(result[key])) fail(`Некорректный список detail.${key}.`);
    }
    if (own(result,'effects') && !result.effects.every(item => plain(item) && (!own(item,'applicable') || typeof item.applicable === 'boolean'))) fail('Некорректные показатели эффекта.');
    if (own(result,'workflow') && (!plain(result.workflow) || !Array.isArray(result.workflow.stages))) fail('Некорректный маршрут согласования.');
    for (const key of ['comments','history']) {
      if (own(result,key) && !result[key].every(item => plain(item) && typeof item.text === 'string')) fail(`Некорректные записи detail.${key}.`);
    }
    for (const key of ['userRating','averageRating']) {
      if (own(result,key)) rating(result[key]);
    }
    return result;
  }
  function draftComments(value) {
    // Accept the earlier text-only draft shape as well as the creation drawer's
    // current list, without losing either shape when restoring a local snapshot.
    if (typeof value === 'string') return text(value);
    const result = json(value);
    if (!Array.isArray(result) || !result.every(item => plain(item) && typeof item.text === 'string' && typeof item.author === 'string' && (!own(item,'id') || typeof item.id === 'string'))) fail('Некорректные комментарии черновика.');
    return result;
  }
  function rating(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 5) fail('Оценка должна быть числом от 0 до 5.');
    return value;
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Некорректная дата инсайта.');
    const parsed = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) fail('Некорректная дата инсайта.');
    return value;
  }
  function timestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail('Некорректная отметка времени.');
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) fail('Некорректная отметка времени.');
    return value;
  }
  function fields(input, snapshot = false) {
    const result = {};
    for (const [key,value] of entries(input)) {
      // Identity and timestamps are assigned by the store, never by a form patch.
      if (reserved.has(key)) {if (snapshot) result[key] = json(value); continue;}
      if (textFields.has(key)) result[key] = key === 'source' && value === 'Голос территорий' ? 'ТБ' : text(value,key === 'title' ? 500 : limits.text);
      else if (booleanFields.has(key)) {if (typeof value !== 'boolean') fail(); result[key] = value;}
      else if (key === 'status') {result.status = canonicalStatus(text(value,100)); if (!value.trim()) fail('Укажите статус инсайта.');}
      else if (key === 'comments') {if (!Number.isSafeInteger(value) || value < 0) fail('Некорректное число комментариев.'); result.comments = value;}
      else if (key === 'commentsDraft') result.commentsDraft = draftComments(value);
      else if (key === 'rating') result.rating = rating(value);
      else if (key === 'previousRating') result.previousRating = value === null ? null : rating(value);
      else if (key === 'related') result.related = related(value);
      else if (key === 'process') result.process = listOfText(value);
      else if (key === 'attachments') result.attachments = attachments(value);
      else if (key === 'detail') result.detail = detail(value);
      else if (key === 'effects' || key === 'products') {
        if (!Array.isArray(value) && !(key === 'effects' && plain(value))) fail(`Некорректный список ${key}.`);
        result[key] = json(value);
      } else fail(`Неизвестное поле инсайта: ${key}.`);
    }
    if (own(result,'title') && !result.title.trim()) fail('Укажите название инсайта.');
    return result;
  }
  function record(input) {
    const result = fields(input,true);
    if (!/^INS-\d{6}$/.test(result.id || '') || result.code !== result.id || result.kind !== 'insights' || !result.title?.trim() || !result.status || !own(result,'comments') || !own(result,'rating')) fail('Некорректная запись инсайта.');
    date(result.created);
    if (own(result,'createdAt')) timestamp(result.createdAt);
    if (own(result,'updatedAt')) timestamp(result.updatedAt);
    if (own(result,'local') && typeof result.local !== 'boolean') fail();
    if (JSON.stringify(result).length > limits.record) fail('Слишком много данных в одном инсайте.');
    return result;
  }
  function validateRows(value) {
    if (!Array.isArray(value) || value.length > limits.rows) fail('Некорректное число инсайтов.');
    const result = value.map(record);
    if (new Set(result.map(row => row.id)).size !== result.length) fail('Повторяющиеся ID инсайтов.');
    return result;
  }
  const seed = validateRows(window.BPM_INSIGHT_DATA || []);
  function completeLegacyDemoEffects(row,example) {
    // The old demo supplied only "time" for every bank. Repair that exact seed
    // response only, never infer an assessment from a user's partial answer or
    // from effects whose authored definition has since changed. Loading remains
    // read-only: the corrected in-memory row is persisted by an explicit edit.
    if (row.local || !Array.isArray(example?.detail?.effects) || row.source !== example.source || row.bank !== example.bank ||
        JSON.stringify(row.detail?.effects) !== JSON.stringify(example.detail.effects)) return row;
    const opinions = row.detail?.workflow?.opinions;
    const examples = example.detail.workflow?.opinions?.responses;
    if (!Array.isArray(opinions?.responses) || !Array.isArray(examples)) return row;
    let changed = false;
    const responses = opinions.responses.map(response => {
      const expected = examples.find(item => item.actorId === response.actorId && item.bank === response.bank);
      if (!Array.isArray(expected?.effects) || !expected.effects.some(effect => effect.id === 'quality')) return response;
      const legacy = {...expected,effects:expected.effects.filter(effect => effect.id !== 'quality')};
      if (JSON.stringify(response) !== JSON.stringify(legacy)) return response;
      changed = true;
      return clone(expected);
    });
    return changed ? record({...row,detail:{...row.detail,workflow:{...row.detail.workflow,opinions:{...opinions,responses}}}}) : row;
  }
  function mergeDemoRows(saved) {
    const byId = new Map(seed.map(row => [row.id,row]));
    const merged = saved.map(row => {
      const example = byId.get(row.id);
      // Add only missing model metadata to pre-BRD demo records. User text,
      // comments, metrics, statuses and locally created rows keep precedence.
      if (!row.local && !row.detail?.workflow && example?.detail?.workflow) {
        return record({...row,detail:{...(row.detail || {}),workflow:clone(example.detail.workflow)}});
      }
      return completeLegacyDemoEffects(row,example);
    });
    const ids = new Set(merged.map(row => row.id));
    const additions = seed.filter(row => !ids.has(row.id));
    // Legacy snapshots may already be at the explicit store limit.
    return [...merged,...clone(additions.slice(0,Math.max(0,limits.rows - merged.length)))].map(row => window.BpmInsightWorkflow
      ? {...row,needsApproval:window.BpmInsightWorkflow.canApprove(row),needsOpinion:window.BpmInsightWorkflow.needsOpinion(row)} : row);
  }
  function readSaved(value) {
    if (typeof value !== 'string' || value.length > limits.snapshot) fail('Слишком большой снимок инсайтов.');
    const saved = JSON.parse(value);
    const keys = entries(saved).map(([key]) => key);
    if (saved.version !== version || keys.some(key => !['version','rows'].includes(key))) fail('Неподдерживаемое хранилище инсайтов.');
    return mergeDemoRows(validateRows(saved.rows));
  }
  let rows = clone(seed), persistent = true;
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {try {rows = readSaved(saved);} catch (_) {/* Preserve corrupt data until an intentional change. */}}
  } catch (_) {persistent = false;}
  const list = () => clone(rows);
  function get(id) {const row = rows.find(item => item.id === id); return row ? clone(row) : null;}
  function notify(type,id) {
    for (const listener of listeners) {
      try {listener(list(),{type,id});} catch (_) {/* Subscribers cannot undo a successful change. */}
    }
  }
  function commit(next,type,id) {
    const serialized = JSON.stringify({version,rows:next});
    if (serialized.length > limits.snapshot) fail('Достигнут лимит локального хранилища инсайтов.');
    rows = next;
    try {window.localStorage.setItem(storageKey,serialized); persistent = true;}
    catch (_) {persistent = false; /* The session remains usable if storage is blocked or full. */}
    notify(type,id);
  }
  function create(input) {
    const values = fields(input);
    if (!values.title?.trim()) fail('Укажите название инсайта.');
    if (rows.length >= limits.rows) throw new RangeError('Достигнут лимит количества инсайтов.');
    const serial = rows.reduce((max,row) => Math.max(max,Number(row.id.slice(4))),0) + 1;
    if (serial > 999999) throw new RangeError('Достигнут лимит ID инсайтов.');
    const id = `INS-${String(serial).padStart(6,'0')}`, now = new Date();
    const created = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const row = {
      title:'',description:'',solution:'',rootCauses:'',commentsDraft:[],source:'SberBPM ЦА',bank:'',path:'',owner:'',author:currentUser,
      block:'',division:'',product:'',products:[],related:[],effects:[],attachments:[],comments:0,rating:0,needsApproval:false,needsOpinion:false,
      ...values,id,code:id,kind:'insights',created,createdAt:now.toISOString(),updatedAt:now.toISOString(),status:'Новый',local:true
    };
    row.process = values.process || row.related.map(item => item.title);
    row.detail = {...(values.detail || {})};
    if (!own(row.detail,'effects')) row.detail.effects = Array.isArray(row.effects) ? clone(row.effects) : [clone(row.effects)];
    const displayDate = created.split('-').reverse().join('.');
    if (!own(row.detail,'comments')) {
      const comments = Array.isArray(row.commentsDraft) ? row.commentsDraft : row.commentsDraft.trim() ? [{author:row.author,text:row.commentsDraft}] : [];
      row.detail.comments = comments.map(comment => ({...comment,date:comment.date || displayDate}));
    }
    if (!own(values,'comments')) row.comments = row.detail.comments.length;
    if (!own(row.detail,'history')) row.detail.history = [{date:displayDate,text:'Инсайт создан'}];
    if (window.BpmInsightWorkflow) {
      const initialized = window.BpmInsightWorkflow.initialize(row,{authorRole:row.detail.workflow?.authorRole});
      row.status = initialized.status; row.needsApproval = initialized.needsApproval; row.needsOpinion = initialized.needsOpinion;
      row.detail.workflow = initialized.detail.workflow;
      if (row.status === 'Согласовано') row.detail.history.unshift({date:displayDate,text:'Согласование не требуется: автор — председатель или заместитель председателя ТБ'});
    }
    const checked = record(row);
    commit([checked,...rows],'create',id);
    return clone(checked);
  }
  function update(id,input) {
    const index = rows.findIndex(row => row.id === id);
    if (index < 0) return null;
    const values = fields(input), previous = rows[index];
    const row = {...previous,...values,updatedAt:new Date().toISOString()};
    if (own(values,'detail')) row.detail = {...(previous.detail || {}),...values.detail};
    if (own(values,'related') && !own(values,'process')) row.process = values.related.map(item => item.title);
    const checked = record(row);
    commit(rows.map((item,i) => i === index ? checked : item),'update',id);
    return clone(checked);
  }
  function resetDemo() {
    const examples = new Map(seed.map(row => [row.id,row]));
    const restored = [];
    // Explicit prototype replay, not a filter reset. Restore the complete
    // scenario so statuses, decisions, bank responses and counters agree.
    // Locally created records (including legacy ID collisions) are untouched.
    const next = rows.map(row => {
      const example = examples.get(row.id);
      if (!example || row.local === true) return row;
      restored.push(row.id);
      return clone(example);
    });
    if (restored.length) commit(next,'reset-demo',null);
    return restored;
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') fail('Ожидался обработчик изменений инсайтов.');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  window.addEventListener('storage',event => {
    if (event.key !== storageKey && event.key !== null) return;
    if (event.storageArea) {try {if (event.storageArea !== window.localStorage) return;} catch (_) {return;}}
    try {rows = event.newValue === null ? clone(seed) : readSaved(event.newValue);} catch (_) {return;}
    notify('sync',null);
  });
  window.BpmInsightStore = Object.freeze({list,get,create,update,resetDemo,subscribe,currentUser,persistenceAvailable:() => persistent,isPersistent:() => persistent});
})();

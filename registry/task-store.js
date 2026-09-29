/* Local task state. The immutable demo seed is never edited. */
(() => {
  'use strict';
  const currentUser='Иванов Иван Васильевич';
  const storageKey='bpm-task-store:v1',version=1;
  const statuses=new Set(['Создана','Выполняется','На согласовании','На доработке','Выполнена','Завершено','Отклонена','Отозвана','Отменено']);
  const textFields=['title','description','processId','processCode','processTitle','block','division','deadline','insightId','insightCode','insightTitle','initiator','executor','resultVariant','completionComment','rejectionReason','withdrawalReason','completedAt','rejectedAt','withdrawnAt','updatedAt'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const isText=value=>typeof value==='string'&&value.length<=20000;
  const isList=value=>Array.isArray(value)&&value.length<=200&&value.every(isText);
  const isDate=value=>typeof value==='string'&&!!value&&!Number.isNaN(Date.parse(value));
  const isDeadline=value=>{
    if(value==='')return true;
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match)return false;
    const [,year,month,day]=match,date=new Date(Number(year),Number(month)-1,Number(day),12);
    return Number(year)>=1800&&Number(year)<=2200&&date.getFullYear()===Number(year)&&date.getMonth()+1===Number(month)&&date.getDate()===Number(day);
  };
  const listeners=new Set();
  // Version 1 remains readable: special-task payloads are additive, not a reset
  // of the user's existing locally created typical tasks.
  function flowData(value,depth=0){
    if(depth>8)throw new TypeError('Слишком сложные данные задачи.');
    if(value===null||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))return value;
    if(isText(value))return value;
    if(Array.isArray(value)&&value.length<=200)return value.map(item=>flowData(item,depth+1));
    if(isObject(value)&&Object.keys(value).length<=100){
      const result={};
      for(const [key,item] of Object.entries(value)){
        if(!/^[\w-]{1,80}$/.test(key)||['__proto__','constructor','prototype'].includes(key))throw new TypeError('Некорректное поле сценария.');
        result[key]=flowData(item,depth+1);
      }
      return result;
    }
    throw new TypeError('Некорректные данные сценария задачи.');
  }

  function fields(input){
    if(!isObject(input))throw new TypeError('Ожидались поля задачи.');
    const result={};
    if('flowType' in input){
      if(!isText(input.flowType)||!Object.prototype.hasOwnProperty.call(window.BpmTaskTypes||{},input.flowType))throw new TypeError('Неизвестный тип задачи.');
      result.flowType=input.flowType;
    }
    if('flowData' in input){
      result.flowData=flowData(input.flowData);
      if(JSON.stringify(result.flowData).length>100000)throw new TypeError('Слишком много данных задачи.');
    }
    textFields.forEach(key=>{
      if(!Object.prototype.hasOwnProperty.call(input,key))return;
      if(!isText(input[key]))throw new TypeError(`Некорректное поле задачи: ${key}.`);
      result[key]=input[key];
    });
    if('deadline' in result&&!isDeadline(result.deadline))throw new TypeError('Некорректный срок задачи.');
    ['assignees','variants'].forEach(key=>{
      if(!Object.prototype.hasOwnProperty.call(input,key))return;
      if(!isList(input[key]))throw new TypeError(`Некорректный список: ${key}.`);
      result[key]=[...new Set(input[key])];
    });
    if(Object.prototype.hasOwnProperty.call(input,'status')){
      if(!statuses.has(input.status))throw new TypeError('Некорректный статус задачи.');
      result.status=input.status;
    }
    ['overdue','highlight','local'].forEach(key=>{
      if(typeof input[key]==='boolean')result[key]=input[key];
    });
    ['progress','relatedCount'].forEach(key=>{
      if(Number.isFinite(input[key])&&input[key]>=0)result[key]=input[key];
    });
    if(Object.prototype.hasOwnProperty.call(input,'comments')){
      if(!Array.isArray(input.comments)||input.comments.length>1000||!input.comments.every(comment=>isObject(comment)&&isText(comment.author)&&isText(comment.text)&&isDate(comment.created)&&(!('kind' in comment)||isText(comment.kind))))throw new TypeError('Некорректные комментарии задачи.');
      result.comments=input.comments.map(({author,text,created,kind})=>({author,text,created,...(kind===undefined?{}:{kind})}));
    }
    return result;
  }

  function record(input){
    if(!isObject(input)||!isText(input.id)||!input.id||!Number.isSafeInteger(input.number)||input.number<1||!isText(input.type)||!input.type||!isText(input.title)||!input.title.trim()||!statuses.has(input.status)||!isList(input.assignees)||!isList(input.variants)||!isDate(input.created)||typeof input.incoming!=='boolean'||typeof input.outgoing!=='boolean')throw new TypeError('Некорректная запись задачи.');
    const createdISO=input.createdISO===undefined?input.created:input.createdISO;
    if(!isDate(createdISO))throw new TypeError('Некорректная дата создания задачи.');
    return {...fields(input),id:input.id,number:input.number,type:input.type,created:input.created,createdISO,incoming:input.incoming,outgoing:input.outgoing};
  }

  const seed=(window.BPM_TASK_DATA||[]).map(record);
  function readSaved(value){
    const saved=JSON.parse(value);
    if(!isObject(saved)||saved.version!==version||!Array.isArray(saved.rows)||!saved.rows.length||saved.rows.length>2000)throw new TypeError('Неподдерживаемое локальное хранилище задач.');
    const next=saved.rows.map(record);
    if(new Set(next.map(row=>row.id)).size!==next.length)throw new TypeError('Повторяющиеся ID задач.');
    return next;
  }
  let rows=clone(seed),persistenceAvailable=true;
  try{const saved=localStorage.getItem(storageKey);if(saved){try{rows=readSaved(saved);}catch(_){/* An invalid snapshot falls back to the demo seed. */}}}catch(_){persistenceAvailable=false;}
  function list(){return clone(rows);}
  function get(id){const row=rows.find(item=>item.id===id);return row?clone(row):null;}
  function publish(type,id){
    try{localStorage.setItem(storageKey,JSON.stringify({version,rows}));persistenceAvailable=true;}catch(_){persistenceAvailable=false;/* The current session remains usable without persistence. */}
    listeners.forEach(listener=>{try{listener(list(),{type,id});}catch(_){/* A subscriber cannot undo a saved task. */}});
  }
  function create(input){
    const values=fields(input);
    if(!values.title?.trim())throw new TypeError('Укажите название задачи.');
    if(rows.length>=2000)throw new RangeError('Достигнут лимит локального хранилища задач.');
    const definition=values.flowType?window.BpmTaskTypes[values.flowType]:null;
    const prefix=definition?.prefix||'ТЗ';
    const now=new Date(),year=now.getFullYear(),pattern=new RegExp(`^${prefix}-${year}-(\\d+)$`);
    const serial=rows.reduce((max,row)=>Math.max(max,Number(pattern.exec(row.id)?.[1]||0)),0)+1;
    const createdISO=now.toISOString();
    const row={description:'',processId:'',processCode:'',processTitle:'',block:'',division:'',deadline:'',assignees:[],variants:[],initiator:currentUser,comments:[],relatedCount:0,progress:0,overdue:false,highlight:false,...values,id:`${prefix}-${year}-${String(serial).padStart(6,'0')}`,number:rows.reduce((max,item)=>Math.max(max,item.number),0)+1,type:definition?.label||'Типовая',status:definition?.createStatus||'Создана',created:createdISO,createdISO,local:true,outgoing:true};
    row.incoming=row.assignees.includes(currentUser);
    rows=[row,...rows];publish('create',row.id);return clone(row);
  }
  function update(id,input){
    const index=rows.findIndex(row=>row.id===id);if(index<0)return null;
    const values=fields(input);
    if('title' in values&&!values.title.trim())throw new TypeError('Укажите название задачи.');
    const previous=rows[index],row={...previous,...values,updatedAt:new Date().toISOString()};
    if('assignees' in values)row.incoming=row.assignees.includes(currentUser);
    if(['Завершено','Отклонена','Отозвана','Отменено'].includes(row.status)){row.overdue=false;row.highlight=false;}
    if(row.status==='Завершено')row.progress=100;
    rows=rows.map((item,i)=>i===index?row:item);publish('update',id);return clone(row);
  }
  function subscribe(listener){
    if(typeof listener!=='function')throw new TypeError('Ожидался обработчик изменений задач.');
    listeners.add(listener);return()=>listeners.delete(listener);
  }
  window.addEventListener('storage',event=>{
    if(event.key!==storageKey)return;
    try{rows=event.newValue?readSaved(event.newValue):clone(seed);}catch(_){return;}
    listeners.forEach(listener=>{try{listener(list(),{type:'sync',id:null});}catch(_){/* Keep other subscribers current. */}});
  });
  window.BpmTaskStore=Object.freeze({list,get,create,update,subscribe,currentUser,isPersistent:()=>persistenceAvailable});
})();

/* Products BPM / Чек-лист, 119:7558, 119:7753, 119:8275, 119:8420.
 * Business-document records are explicitly demo data, not remote ARIS links. */
(() => {
  'use strict';
  const questions=[
    'Реальное исполнение процесса отличается от утвержденного?',
    'Изменились условия обработки персональных данных (ПДн) в процессе?',
    'Произошли изменения используемых справочных элементов, влияющие на исполнение процесса?',
    'Изменилось взаимодействие со смежными процессами, влияющее на исполнение процесса?',
    'Изменились требования регулятора, законодательства, профильных стандартов, влияющие на процесс?',
    'Изменились внутренние требования банка, влияющие на процесс?',
    'БО в статусе «на валидации»?',
    'Имеются новые документы/БО по сценарию процесса?'
  ];
  const instruction='Вам необходимо ответить на вопросы и поставить галочку, если вопрос применим к процессу и ответ «ДА». Рядом с каждым вопросом есть значок-подсказка. После ответов на вопросы появится рекомендация по актуализации БО.\nВам необходимо будет принять решение, ответив на вопрос «Актуализация бизнес-описания необходима?».\n\nЕсли Вы ответите «Требуется», в ЛК будет автоматически создана задача на актуализацию БО.\n\nЕсли Вы ответите «Не требуется», то задача по Чек-листу закроется как выполненная без создания других задач и снова будет выставлена по этому БО через 12 месяцев.\n\nСрок исполнения задачи по Чек-листу — 1 месяц. Если задача не будет закрыта в указанный срок, то по умолчанию считается, что актуализация БО требуется и «Задача на актуализацию БО» будет назначена автоматически.\n\nПо задаче на актуализацию БО срок исполнения автоматически устанавливается 6 месяцев до утверждения и публикации в Эталонной базе нового БО.\n\nПросим Вас отвечать на вопросы взвешенно. Ответы на вопросы будут сохраняться в системе.';
  const hints=[
    'Сопоставьте фактические шаги процесса с утверждённым бизнес-описанием.',
    'Проверьте состав, цели и условия обработки персональных данных.',
    'Учитывайте изменения справочников, используемых при исполнении процесса.',
    'Проверьте входы, выходы и взаимодействия со смежными процессами.',
    'Сопоставьте описание с действующими внешними требованиями.',
    'Проверьте изменения внутренних нормативных документов.',
    'Уточните текущий статус бизнес-описания.',
    'Проверьте, появились ли новые документы по данному сценарию.'
  ];
  function documents(d,ctx){const p=ctx.processes.find(p=>p.id===d.processId);return [{value:'demo-business-description',label:`№ 2391-7 ${p?.code||'П0001'} — ${p?.title||'Приобретение ЦФА'}`}];}
  function meta(d,ctx,edit){return [
    {key:'processId',kind:'process',label:'Процесс',required:true},
    edit?{key:'businessDescriptionId',kind:'select',label:'Название и реквизиты утверждения бизнес-описания',required:true,disabled:!d.processId,options:documents(d,ctx)}:{key:'businessDescriptionTitle',kind:'readonly',label:'Название и реквизиты утверждения бизнес-описания',value:d.businessDescriptionTitle||documents(d,ctx)[0].label},
    {key:'approvedDate',kind:'readonly',label:'Дата утверждения ВНД',value:d.businessDescriptionId?'28.03.2024':'—',group:'bo-meta',columns:2},
    {key:'arisLink',kind:'readonly',label:'Ссылка на описание в ARIS',value:d.businessDescriptionId?'БО1 · демонстрационные данные':'—',tone:'link',group:'bo-meta',columns:2}
  ];}
  const terminal=t=>['Завершено','Отклонена','Отозвана','Отменено'].includes(t?.status);
  const type={
    id:'business-description-checklist',label:'Чек-лист самопроверки актуальности Бизнес-описания',tag:'Чек-лист',prefix:'ТЗ',
    initial:()=>({title:'',description:'',deadline:'',processId:'',assignees:[],businessDescriptionId:'',answers:[],decision:''}),
    fields:(d,ctx)=>[
      {key:'title',kind:'text',label:'Название',required:true},...meta(d,ctx,true),
      {key:'deadline',kind:'date',label:'Срок задачи'},
      {key:'description',kind:'textarea',label:'Обоснование',required:true},
      {key:'assignees',kind:'people',label:'Ответственные',required:true}
    ],
    viewFields:(d,ctx)=>{
      const done=terminal(ctx.task),count=(d.answers||[]).length;
      return [{key:'deadline',kind:'date',label:'Срок задачи'},
        {key:'initiator',kind:'person',label:'Инициатор',value:d.initiator||ctx.currentUser},
        {key:'assignees',kind:'people',label:'Ответственные'},...meta(d,ctx,false),
        {key:'description',kind:'readonly',label:'Обоснование'},
        {key:'questions-title',kind:'heading',text:'Пройдите чек-лист самопроверки актуальности бизнес-описания'},
        {key:'questions-intro',kind:'note',tone:'plain',text:'Просим принять решение о необходимости актуализации бизнес-описания процесса. Для этого необходимо проанализировать процесс по следующим аспектам:'},
        {key:'instruction',kind:'accordion',label:'Инструкция',text:instruction},
        {key:'answers',kind:'checklist',interactive:!done,options:questions.map((label,i)=>({value:String(i+1),label,help:hints[i]}))},
        {key:'recommendation',kind:'note',tone:count>3?'danger':count?'info':'warning',text:count>3?'Настоятельно рекомендуем актуализировать бизнес-описание процесса':count?'Рекомендуем актуализировать бизнес-описание процесса':'Рекомендуем проверить актуальность бизнес-описания процесса'},
        {key:'decision',kind:'radio',label:'Выберите решение по актуализации',interactive:!done,options:[{value:'required',label:'Требуется'},{value:'not-required',label:'Не требуется'}]},
        ...(d.executor?[{key:'executor',kind:'person',label:'Исполнитель',value:d.executor}]:[]),
        ...(d.followUpTaskId?[{key:'followUpTaskId',kind:'readonly',label:'Создана задача на актуализацию БО',value:d.followUpTaskId,tone:'link'}]:[])
      ];
    },
    validate:d=>({...(d.businessDescriptionId?{}:{businessDescriptionId:'Выберите бизнес-описание.'})}),
    onCreate:(d,ctx)=>({businessDescriptionTitle:documents(d,ctx).find(x=>x.value===d.businessDescriptionId)?.label||''}),
    actions:(task,ctx)=>terminal(task)?[]:[{id:'complete-checklist',label:'Завершить задачу',kind:'primary',icon:'tick',nextStatus:'Завершено',sheetTitle:'Завершение задачи',copy:'Внесите комментарий по принятому решению.',commentRequired:true,confirmLabel:'Завершить задачу',validate:d=>['required','not-required'].includes(d.decision)?{}:{decision:'Выберите решение по актуализации.'}}],
    afterTransition(action,task,store){
      if(action.id!=='complete-checklist'||task.flowData.decision!=='required'||task.flowData.followUpTaskId)return;
      const deadline=new Date();deadline.setMonth(deadline.getMonth()+6);
      const followUp=store.create({flowType:'business-description-update',title:'Актуализация Бизнес-описания',processId:task.processId,processCode:task.processCode,processTitle:task.processTitle,block:task.block,division:task.division,assignees:task.assignees,initiator:'Система',deadline:deadline.toISOString().slice(0,10),description:'Создана по результатам чек-листа самопроверки.',flowData:{businessDescriptionId:task.flowData.businessDescriptionId,businessDescriptionTitle:task.flowData.businessDescriptionTitle,sourceChecklistId:task.id,sourceTaskLabel:`Задача по самопроверке актуальности бизнес-описания процесса: ${task.id}`,businessOutcome:'updated',registrationNumber:''}});
      store.update(task.id,{flowData:{...task.flowData,followUpTaskId:followUp.id}});
    }
  };
  Object.assign(window.BpmTaskTypes||(window.BpmTaskTypes={}),{[type.id]:type});
})();

/* Products BPM / «Мой кабинет», 29:4418 (25.09.2026).
 * Demonstration content from the design, not a connected personal account.
 * IDs are unique internally even where Figma repeats the same example code. */
(() => {
  'use strict';
  const entities = ['paths','processes'].flatMap(entity => Array.from({length:entity === 'paths' ? 4 : 3}, (_,i) => ({
    id:`cabinet-${entity === 'paths' ? 'path' : 'process'}-${i+1}`, entity, kind:entity,
    number:1232, code:entity === 'paths' ? 'КП1232' : 'П1232',
    title:'Название клиентского пути или процесса максимум две строки…',
    description:'Блок "B2C" / Дивизион "Кошелек клиента" максимум в две строки…',
    block:'B2C', division:'Кошелек клиента', process:'Обслуживание клиентов',
    owner:'Иванов Иван Васильевич', status:'Подтверждён', date:'2026-01-21', created:'2026-01-21',
    executionStatus:i === 2 ? 'Приостановлен' : 'Исполняется', monitoring:i !== 2,
    efficiency:entity === 'paths' && i === 3 ? 25 : 89.3, delta:1,
    highlight:entity === 'paths' ? i === 0 ? 'positive' : i === 3 ? 'problem' : '' : '',
    count:entity === 'paths' ? 3 : 0, tags:['AI','ТОП200'], source:'cabinet-demo'
  })));
  const insights = Array.from({length:10}, (_,i) => ({
    id:`cabinet-insight-${i+1}`, code:`INS-${String(42+i).padStart(6,'0')}`, kind:'insights',
    title:'Аномальный rework-цикл в согласовании вторая строка…',
    description:'По итогам 2026 года продуктом не достигнуто целевое значение КПЭ…',
    owner:'Иванов Иван Васильевич', status:'Создан', filterStatus:'Новый', source:'SberBPM',
    created:'2026-01-21', rating:4.3, previousRating:i === 0 ? 5 : null,
    ratingActive:i === 0, comments:23
  }));
  const tasks = Array.from({length:5}, (_,i) => ({
    id:`К-2026-${String(i+2).padStart(4,'0')}`, kind:'tasks', type:'Тип задачи',
    filterType:['Комплаенс','Неприменимость метрик','Согласование варианта','Комплаенс','Согласование варианта'][i],
    title:'Согласование доступа к процессу в две строки а затем многоточие…',
    description:'При приеме на работу нового сотрудника и для перечислений максимум в две строки…',
    status:'Создана', filterStatus:'Новая', created:'2026-01-21', deadline:'2026-09-21',
    processId:'cabinet-process-1', processCode:'П1232', initiator:'Мария Иванова',
    assignees:['Мария Иванова','Алексей Орлов','Дмитрий Козлов','Анна Петрова','Ирина Смирнова','Пётр Сидоров'],
    incoming:i < 4, outgoing:i === 4, complete:i === 0, highlight:i === 0
  }));
  window.BPM_CABINET_DATA = Object.freeze({entities, insights, tasks});
})();

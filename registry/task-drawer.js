/* Task creation · type choice only (Figma 1105:422). */
(() => {
  'use strict';

  const accessDescription = 'Предоставления расширенного доступа к процессу сотрудникам, которые не являются владельцами или экспертами процесса';
  const types = [
    {id:'standard',label:'Типовая',description:'Организация управления клиентскими путями и процессами путем постановки задач сотрудникам, не зависимо от роли'},
    {id:'extended-access',label:'Согласование расширенного доступа к процессу',description:accessDescription},
    {id:'metric-inapplicability',label:'Неприменимость метрик',description:accessDescription},
    {id:'bulk-metric-inapplicability',label:'Массовая неприменимость метрик',description:accessDescription},
    {id:'process-result-approval',label:'Согласование варианта предоставления результата процесса',description:accessDescription},
    {id:'business-description-checklist',label:'Чек-лист самопроверки актуальности Бизнес-описания',description:'Для ежегодного аудита актуальности существующих бизнес-описаний (БО) процессов'},
    {id:'business-description-update',label:'Актуализация Бизнес-описания',description:'Для актуализации бизнес-описаний (БО) процессов'},
    {id:'insight',label:'Задача к инсайту',description:'Нацелена на улучшения по процессному производству'}
  ];
  let dialog, content, returnFocus, onChoose, closingTimer, closing = false;
  const esc = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

  function titleWithArrow(label) {
    const lastSpace = label.lastIndexOf(' ');
    const prefix = lastSpace < 0 ? '' : `${label.slice(0,lastSpace)} `;
    const lastWord = label.slice(lastSpace + 1);
    return `${esc(prefix)}<span class="task-type-last-word">${esc(lastWord)}<img class="task-type-arrow" src="assets/tasks/arrow-right-24.svg" alt="" width="24" height="24"></span>`;
  }

  function cleanup() {
    if (dialog.open) return;
    clearTimeout(closingTimer);
    closing = false;
    dialog.inert = false;
    dialog.classList.remove('is-closing','has-entered');
    document.body.classList.remove('task-drawer-open');
    onChoose = null;
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    returnFocus = null;
  }

  function setup() {
    dialog = document.createElement('dialog');
    dialog.id = 'task-drawer';
    dialog.className = 'task-drawer';
    dialog.setAttribute('aria-labelledby','task-drawer-title');
    dialog.innerHTML = `<header class="task-drawer-header"><h2 id="task-drawer-title">Создание задачи</h2><button type="button" class="task-drawer-close" aria-label="Закрыть создание задачи" title="Закрыть (Esc)" autofocus><img src="assets/close.svg" alt="" width="24" height="24"></button></header><div class="task-drawer-content"><h3 id="task-drawer-prompt">Выберите тип задачи</h3><div class="task-type-choices" role="group" aria-labelledby="task-drawer-prompt">${types.map(type => `<button type="button" class="task-type-choice" data-task-type="${type.id}" aria-pressed="false" aria-labelledby="task-type-${type.id}-title" aria-describedby="task-type-${type.id}-description"><span class="task-type-title" id="task-type-${type.id}-title">${titleWithArrow(type.label)}</span><span class="task-type-description" id="task-type-${type.id}-description">${esc(type.description)}</span></button>`).join('')}</div></div>`;
    content = dialog.querySelector('.task-drawer-content');
    dialog.querySelector('.task-drawer-close').addEventListener('click',close);
    dialog.addEventListener('click',event => {
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
        return;
      }
      const button = event.target.closest('[data-task-type]');
      if (!button || closing) return;
      const type = types.find(item => item.id === button.dataset.taskType);
      dialog.querySelectorAll('[data-task-type]').forEach(choice => choice.setAttribute('aria-pressed',String(choice === button)));
      onChoose?.({id:type.id,label:type.label});
    });
    dialog.addEventListener('cancel',event => {event.preventDefault();close();});
    dialog.addEventListener('close',cleanup);
    dialog.addEventListener('animationend',event => {
      if (event.target !== dialog) return;
      if (event.animationName === 'task-drawer-slide-in' && !closing) dialog.classList.add('has-entered');
      if (event.animationName === 'task-drawer-slide-out' && closing) dialog.close();
    });
    document.body.append(dialog);
  }

  function open(configuration = {}) {
    if (!dialog) setup();
    const trigger = configuration.trigger || (dialog.open ? returnFocus : document.activeElement);
    configuration.closePopups?.();
    clearTimeout(closingTimer);
    closing = false;
    dialog.inert = false;
    dialog.classList.remove('is-closing');
    if (!dialog.open) dialog.classList.remove('has-entered');
    returnFocus = trigger;
    onChoose = configuration.onChoose;
    dialog.querySelectorAll('[data-task-type]').forEach(button => button.setAttribute('aria-pressed','false'));
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('task-drawer-open');
    content.scrollTop = 0;
    dialog.querySelector('.task-drawer-close').focus({preventScroll:true});
  }

  function close() {
    if (!dialog?.open || closing) return;
    closing = true;
    dialog.inert = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.close();
      return;
    }
    dialog.classList.add('is-closing');
    closingTimer = setTimeout(() => {if (dialog.open && closing) dialog.close();},280);
  }

  window.BpmTaskDrawer = Object.freeze({open,close});
})();

/* Tasks page: Figma 1105:21363 cards, 137:12975 table, 1113:5061 type tags.
 * A shared HTML renderer for both registry views; interaction is delegated by the page. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const asset = name => `assets/tasks/${name}.svg`;
  const icon = (name, className = '') => `<img class="${className}" src="${asset(name)}" alt="" aria-hidden="true">`;
  // Status/Success (276:7) and Status/Info (276:10), with exact labels.
  // In particular, «Выполняется» is an in-progress status, never completed.
  const statusAssets = Object.freeze({
    'создана':'status-green','создано':'status-green','новая':'status-green','новое':'status-green',
    'завершено':'status-green','завершена':'status-green','выполнено':'status-green','выполнена':'status-green',
    'согласовано':'status-green','согласована':'status-green',
    'выполняется':'status-neutral','на доработке':'status-neutral','на согласовании':'status-neutral'
  });
  const day = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(!match)return '';
    if(String(value).includes('T')){
      const parsed=new Date(value);
      if(!Number.isNaN(parsed.getTime()))return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
    }
    return match[0];
  };
  const date = value => day(value) ? day(value).split('-').reverse().join('.') : String(value || '—');
  const initials = name => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('ru');
  const nameOf = person => typeof person === 'object' && person !== null ? person.name || person.label || '' : String(person || '');
  const displayName = (person,key) => window.BpmAvatars.displayName(nameOf(person),key);
  function typeTag(type = 'Тип задачи') {
    const label = String(type || 'Тип задачи');
    // Registry records carry the full type name; drawers use its short tag.
    // Both forms resolve to the same approved Figma label and palette.
    const rules = [
      [/доступ/i, 'access', 'Доступы'],
      [/управление ролями|^роли$/i, 'role', 'Роли'],
      [/массовая неприменимость/i, 'inapplicable', 'Массовая неприменимость'],
      [/непримен/i, 'inapplicable', 'Неприменимость'],
      [/вариант/i, 'variant', 'Варианты'],
      [/чек[-\s‑–]?лист|самопроверки актуальности/i, 'default', 'Чек-лист'],
      [/актуализация бизнес[-\s]описания|^бизнес[-\s]описание$/i, 'default', 'Бизнес-описание'],
      [/^задача к инсайту$/i, 'default', 'Задача к инсайту'],
      [/типов/i, 'standard', 'Типовая']
    ];
    const match = rules.find(([pattern]) => pattern.test(label));
    const [, tone = 'default', shortLabel = label] = match || [];
    return `<span class="task-type-tag task-type-${tone}" title="${escape(label)}">${escape(shortLabel)}</span>`;
  }
  function idBadge(value, {label = value, className = ''} = {}) {
    return `<button class="task-id-badge ${className}" type="button" data-task-copy="${escape(value)}" aria-label="Скопировать ID ${escape(value)}" title="Скопировать ID ${escape(value)}"><span>${escape(label)}</span>${icon('copy')}</button>`;
  }
  function status(task, withDate = false) {
    const label = task.status || 'Создана';
    const dot = statusAssets[String(label).trim().toLocaleLowerCase('ru')] || 'status-neutral';
    const statusDate = task.completedAt || task.rejectedAt || task.withdrawnAt || task.created;
    return `<span class="task-status">${icon(dot)}<span>${escape(label)}${withDate ? ` <span class="task-status-date">| ${escape(date(statusDate))}</span>` : ''}</span></span>`;
  }
  function deadline(task, {withPrefix = true} = {}) {
    if (task.status === 'Завершено' && task.completedAt) {
      const late = Boolean(task.deadline && task.deadline < day(task.completedAt));
      const source = late ? 'assets/task-flow/overdue.svg' : 'assets/task-flow/completed.svg';
      return `<span class="task-deadline${late ? ' is-overdue' : ''}" title="${late ? 'Превышен срок' : 'Закрыта в срок'}"><img src="${source}" alt="" aria-hidden="true"><span>${escape(date(task.completedAt))}</span></span>`;
    }
    const late = Boolean(task.overdue);
    return `<span class="task-deadline${late ? ' is-overdue' : ''}"${late ? ' title="Срок задачи истёк"' : ''}>${icon(late ? 'deadline-overdue' : 'deadline-ontime')}<span>${task.deadline ? `${late || !withPrefix ? '' : '<span class="task-deadline-prefix">до </span>'}${escape(date(task.deadline))}` : 'Без срока'}</span></span>`;
  }
  function avatar(person, {fallbackKey = 'task-person'} = {}) {
    const name = displayName(person,fallbackKey);
    return `<span class="task-avatar" title="${escape(name)}" aria-label="${escape(name)}">${name === 'Система' || name === 'SYS' ? 'SYS' : window.BpmAvatars.portrait(name,fallbackKey)}</span>`;
  }
  function assignees(people = [], compact = false, fallbackKey = 'task-assignees') {
    const names = people.map(nameOf).filter(Boolean).map((name,index)=>displayName(name,`${fallbackKey}:${index}`));
    if (!names.length) return `<span class="task-unassigned">${escape(displayName('',`${fallbackKey}:0`))}</span>`;
    if (compact) return `<span class="task-avatar task-avatar-overflow" title="${escape(names.join(', '))}" aria-label="Исполнители: ${escape(names.join(', '))}">+${names.length}</span>`;
    return `<span class="task-avatar-group" aria-label="Исполнители: ${escape(names.join(', '))}">${names.slice(0, 3).map((person,index) => avatar(person,{fallbackKey:`${fallbackKey}:${index}`})).join('')}${names.length > 3 ? `<span class="task-avatar task-avatar-overflow" title="${escape(names.slice(3).join(', '))}">+${names.length - 3}</span>` : ''}</span>`;
  }
  function tableAssignees(people = [], fallbackKey = 'task-assignees') {
    return `<span class="task-assignees-wide">${assignees(people,false,fallbackKey)}</span>`;
  }
  function card(task) {
    const processCode = task.processCode || task.processId;
    const process = task.processId ? `${icon('direction-related', 'task-direction')}${idBadge(processCode, {label:task.relatedCount ? `+${task.relatedCount}` : processCode})}` : '';
    return `<article class="task-card${task.highlight ? ' task-highlight' : ''}" data-task-id="${escape(task.id)}" aria-label="${escape(task.title)}">
      <div class="task-card-header">${status(task, true)}<div class="task-card-tags">${typeTag(task.type)}${idBadge(task.id)}${process}</div></div>
      <div class="task-card-body"><button type="button" class="task-card-title" data-task-id="${escape(task.id)}" title="${escape(task.title)}">${escape(task.title)}</button><p class="task-card-description">${escape(task.description)}</p></div>
      <div class="task-card-footer"><span class="task-participant-route">${avatar(task.initiator,{fallbackKey:`${task.id}:initiator`})}${icon('direction-flow', 'task-direction')}${assignees(task.assignees,true,`${task.id}:assignee`)}</span>${deadline(task)}</div>
    </article>`;
  }
  const shape = (className = '', style = '') => `<span class="skeleton-shape ${className}"${style ? ` style="${style}"` : ''}></span>`;
  function skeletonCard() {
    return `<article class="task-card task-skeleton-card" aria-hidden="true"><div class="task-card-header"><div class="task-skeleton-status">${shape('task-skeleton-dot')}${shape('skeleton-status')}</div><div class="task-card-tags">${shape('skeleton-tag')}${shape('skeleton-tag', 'width:120px')}${shape('skeleton-tag', 'width:56px')}</div></div><div class="task-card-body task-skeleton-body">${shape('task-skeleton-title')}${shape('skeleton-line')}${shape('skeleton-line', 'width:75%')}</div><div class="task-card-footer"><span class="task-participant-route">${shape('skeleton-avatar')}${shape('skeleton-avatar')}</span><span class="task-deadline">${shape('skeleton-avatar')}${shape('skeleton-date')}</span></div></article>`;
  }
  const columns = [
    {key:'title', label:'Тип, ID, Задача', width:326},
    {key:'processTitle', label:'Процесс', width:328},
    {key:'initiator', label:'Инициатор', width:248},
    {key:'assignees', label:'Ответственные', width:129},
    {key:'created', label:'Создано', width:132},
    {key:'deadline', label:'Срок задачи', width:161},
    {key:'status', label:'Статус', width:161}
  ];
  function header(sortKey, sortDir) {
    return `<thead><tr>${columns.map(column => `<th scope="col" class="task-col-${column.key}" aria-sort="${sortKey === column.key ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}"><button type="button" class="task-sort-button${sortKey === column.key ? ' is-sorted' : ''}" data-task-sort="${column.key}"><span>${column.label}</span>${icon('table-sort', `task-sort-icon${sortKey === column.key && sortDir === 'desc' ? ' is-descending' : ''}`)}</button></th>`).join('')}</tr></thead>`;
  }
  function tableRow(task) {
    const createdTime = String(task.created || '').match(/[T ](\d{2}:\d{2})/)?.[1] || '';
    const processLink = task.processId ? `<button type="button" class="task-process-link" data-task-process="${escape(task.processId)}" title="Открыть процесс ${escape(task.processId)}">${escape(task.processTitle || task.processId)}</button>` : '<span class="task-muted">—</span>';
    return `<tr class="task-table-row${task.highlight ? ' task-highlight' : ''}" data-task-id="${escape(task.id)}">
      <td class="task-table-task"><div class="task-table-tags">${typeTag(task.type)}${idBadge(task.id)}</div><button type="button" class="task-table-title" data-task-id="${escape(task.id)}" title="${escape(task.title)}">${escape(task.title)}</button><p class="task-table-description">${escape(task.description)}</p></td>
      <td class="task-table-process">${task.processId ? idBadge(task.processCode || task.processId) : ''}${processLink}</td>
      <td class="task-table-initiator"><span class="task-owner">${avatar(task.initiator,{fallbackKey:`${task.id}:initiator`})}<span class="task-owner-name">${escape(displayName(task.initiator,`${task.id}:initiator`))}</span></span></td>
      <td class="task-table-assignees">${tableAssignees(task.assignees,`${task.id}:assignee`)}</td>
      <td class="task-table-created"><time datetime="${escape(task.created)}">${escape(date(task.created))}${createdTime ? `<br>${escape(createdTime)}` : ''}</time></td>
      <td class="task-table-deadline">${deadline(task, {withPrefix:false})}</td>
      <td class="task-table-status">${status(task)}</td>
    </tr>`;
  }
  function skeletonRow() {
    return `<tr class="task-table-row task-skeleton-row" aria-hidden="true"><td class="task-table-task"><div class="task-table-tags">${shape('skeleton-tag', 'width:88px')}${shape('skeleton-tag', 'width:120px')}</div><div class="task-skeleton-lines">${shape('skeleton-line')}${shape('skeleton-line', 'width:88%')}${shape('skeleton-line')}${shape('skeleton-line', 'width:75%')}</div></td><td class="task-table-process">${shape('skeleton-tag', 'width:80px')}<div class="task-skeleton-lines">${shape('skeleton-line')}${shape('skeleton-line', 'width:75%')}</div></td><td class="task-table-initiator"><span class="task-owner">${shape('skeleton-avatar')}<span class="task-skeleton-lines">${shape('skeleton-line')}${shape('skeleton-line', 'width:70%')}</span></span></td><td class="task-table-assignees"><span class="task-avatar-group">${shape('skeleton-avatar')}${shape('skeleton-avatar')}${shape('skeleton-avatar')}</span></td><td class="task-table-created"><span class="task-skeleton-lines">${shape('skeleton-date')}${shape('skeleton-line', 'width:48px')}</span></td><td class="task-table-deadline"><span class="task-deadline">${shape('skeleton-avatar')}${shape('skeleton-date')}</span></td><td class="task-table-status">${shape('skeleton-status', 'width:110px')}</td></tr>`;
  }
  function table(rows = [], {sortKey = 'created', sortDir = 'desc', loading = false} = {}) {
    const content = loading ? Array.from({length:5}, skeletonRow).join('') : rows.map(tableRow).join('');
    return `<div class="tasks-table-scroll table-scroll" tabindex="0" role="region" aria-label="Список задач, таблица"${loading ? ' aria-busy="true"' : ''}><table class="tasks-table"><colgroup>${columns.map(column => `<col class="task-col-${column.key}" style="--task-column-width:${column.width / 1485 * 100}%">`).join('')}</colgroup>${header(sortKey, sortDir)}<tbody>${content || '<tr><td colspan="7" class="task-table-empty">Задачи не найдены</td></tr>'}</tbody></table></div>`;
  }
  window.BpmTaskVisuals = Object.freeze({card, table, skeletonCard, typeTag, idBadge, status, deadline, initials, date, day, escape});
})();

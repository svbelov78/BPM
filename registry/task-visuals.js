/* Tasks page: Figma 1105:21363 cards, 1105:20723 table, 1113:5061 type tags.
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
  const date = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || '—');
  };
  const initials = name => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('ru');
  const nameOf = person => typeof person === 'object' && person !== null ? person.name || person.label || '' : String(person || '');
  function typeTag(type = 'Тип задачи') {
    const label = String(type || 'Тип задачи');
    const tone = /доступ/i.test(label) ? 'access' : /непримен/i.test(label) ? 'inapplicable' : /вариант/i.test(label) ? 'variant' : /типов/i.test(label) ? 'standard' : 'default';
    const shortLabel = {access:'Доступы',inapplicable:'Неприменимость',variant:'Варианты',standard:'Типовая'}[tone] || label;
    return `<span class="task-type-tag task-type-${tone}" title="${escape(label)}">${escape(shortLabel)}</span>`;
  }
  function idBadge(value, {label = value, className = ''} = {}) {
    return `<button class="task-id-badge ${className}" type="button" data-task-copy="${escape(value)}" aria-label="Скопировать ID ${escape(value)}" title="Скопировать ID ${escape(value)}"><span>${escape(label)}</span>${icon('copy')}</button>`;
  }
  function status(task, withDate = false) {
    const label = task.status || 'Создана';
    const dot = statusAssets[String(label).trim().toLocaleLowerCase('ru')] || 'status-neutral';
    return `<span class="task-status">${icon(dot)}<span>${escape(label)}${withDate ? ` <span class="task-status-date">| ${escape(date(task.created))}</span>` : ''}</span></span>`;
  }
  function deadline(task) {
    const late = Boolean(task.overdue);
    return `<span class="task-deadline${late ? ' is-overdue' : ''}"${late ? ' title="Срок задачи истёк"' : ''}>${icon(late ? 'deadline-overdue' : 'deadline-ontime')}<span>${task.deadline ? `${late ? '' : 'до '}${escape(date(task.deadline))}` : 'Без срока'}</span></span>`;
  }
  function avatar(person, {personIcon = false} = {}) {
    const name = nameOf(person);
    return `<span class="task-avatar" title="${escape(name)}" aria-label="${escape(name)}">${personIcon || !name ? icon('person') : escape(initials(name))}</span>`;
  }
  function assignees(people = [], compact = false) {
    const names = people.map(nameOf).filter(Boolean);
    if (!names.length) return '<span class="task-unassigned">Не назначены</span>';
    if (compact) return `<span class="task-avatar task-avatar-overflow" title="${escape(names.join(', '))}" aria-label="Исполнители: ${escape(names.join(', '))}">+${names.length}</span>`;
    return `<span class="task-avatar-group" aria-label="Исполнители: ${escape(names.join(', '))}">${names.slice(0, 3).map(person => avatar(person, {personIcon:true})).join('')}${names.length > 3 ? `<span class="task-avatar task-avatar-overflow" title="${escape(names.slice(3).join(', '))}">+${names.length - 3}</span>` : ''}</span>`;
  }
  function tableAssignees(people = []) {
    const names = people.map(nameOf).filter(Boolean);
    return `<span class="task-assignees-wide">${assignees(people)}</span><span class="task-assignees-compact" title="${escape(names.join(', '))}" aria-label="Исполнители: ${escape(names.join(', ') || 'не назначены')}">${names.length === 1 ? avatar(names[0], {personIcon:true}) : `<span class="task-assignee-count">${names.length || '—'}</span>`}</span>`;
  }
  function card(task) {
    const processCode = task.processCode || task.processId;
    const process = task.processId ? `${icon('direction-related', 'task-direction')}${idBadge(processCode, {label:task.relatedCount ? `+${task.relatedCount}` : processCode})}` : '';
    return `<article class="task-card${task.highlight ? ' task-highlight' : ''}" data-task-id="${escape(task.id)}" aria-label="${escape(task.title)}">
      <div class="task-card-header">${status(task, true)}<div class="task-card-tags">${typeTag(task.type)}${idBadge(task.id)}${process}</div></div>
      <div class="task-card-body"><button type="button" class="task-card-title" data-task-id="${escape(task.id)}" title="${escape(task.title)}">${escape(task.title)}</button><p class="task-card-description">${escape(task.description)}</p></div>
      <div class="task-card-footer"><span class="task-participant-route">${avatar(task.initiator)}${icon('direction-flow', 'task-direction')}${assignees(task.assignees, true)}</span>${deadline(task)}</div>
    </article>`;
  }
  const shape = (className = '', style = '') => `<span class="skeleton-shape ${className}"${style ? ` style="${style}"` : ''}></span>`;
  function skeletonCard() {
    return `<article class="task-card task-skeleton-card" aria-hidden="true"><div class="task-card-header"><div class="task-skeleton-status">${shape('task-skeleton-dot')}${shape('skeleton-status')}</div><div class="task-card-tags">${shape('skeleton-tag')}${shape('skeleton-tag', 'width:120px')}${shape('skeleton-tag', 'width:56px')}</div></div><div class="task-card-body task-skeleton-body">${shape('task-skeleton-title')}${shape('skeleton-line')}${shape('skeleton-line', 'width:75%')}</div><div class="task-card-footer"><span class="task-participant-route">${shape('skeleton-avatar')}${shape('skeleton-avatar')}</span><span class="task-deadline">${shape('skeleton-avatar')}${shape('skeleton-date')}</span></div></article>`;
  }
  const columns = [
    {key:'title', label:'Тип, ID, Задача', width:326},
    {key:'processTitle', label:'Процесс', width:328},
    {key:'initiator', label:'Инициатор', compactLabel:'Инициа-<br>тор', width:248},
    {key:'assignees', label:'Ответствен-<br>ные', compactLabel:'Отв.', width:140},
    {key:'created', label:'Создано', compactLabel:'Созда-<br>но', width:124},
    {key:'deadline', label:'Срок задачи', width:176},
    {key:'status', label:'Статус', width:143}
  ];
  function header(sortKey, sortDir) {
    return `<thead><tr>${columns.map(column => `<th scope="col" class="task-col-${column.key}" aria-sort="${sortKey === column.key ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}"><button type="button" class="task-sort-button${sortKey === column.key ? ' is-sorted' : ''}" data-task-sort="${column.key}"><span${column.compactLabel ? ' class="task-heading-wide"' : ''}>${column.label}</span>${column.compactLabel ? `<span class="task-heading-compact">${column.compactLabel}</span>` : ''}${icon('sort', `task-sort-icon${sortKey === column.key && sortDir === 'desc' ? ' is-descending' : ''}`)}</button></th>`).join('')}</tr></thead>`;
  }
  function tableRow(task) {
    const createdTime = String(task.created || '').match(/[T ](\d{2}:\d{2})/)?.[1] || '';
    const processLink = task.processId ? `<button type="button" class="task-process-link" data-task-process="${escape(task.processId)}" title="Открыть процесс ${escape(task.processId)}">${escape(task.processTitle || task.processId)}</button>` : '<span class="task-muted">—</span>';
    return `<tr class="task-table-row${task.highlight ? ' task-highlight' : ''}" data-task-id="${escape(task.id)}">
      <td class="task-table-task"><div class="task-table-tags">${typeTag(task.type)}${idBadge(task.id)}</div><button type="button" class="task-table-title" data-task-id="${escape(task.id)}" title="${escape(task.title)}">${escape(task.title)}</button><p class="task-table-description">${escape(task.description)}</p></td>
      <td class="task-table-process">${task.processId ? idBadge(task.processCode || task.processId) : ''}${processLink}</td>
      <td class="task-table-initiator"><span class="task-owner">${avatar(task.initiator, {personIcon:true})}<span class="task-owner-name">${escape(nameOf(task.initiator))}</span></span></td>
      <td class="task-table-assignees">${tableAssignees(task.assignees)}</td>
      <td class="task-table-created"><time datetime="${escape(task.created)}">${escape(date(task.created))}${createdTime ? `<br>${escape(createdTime)}` : ''}</time></td>
      <td class="task-table-deadline">${deadline(task)}</td>
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
  window.BpmTaskVisuals = Object.freeze({card, table, skeletonCard, typeTag, idBadge, status, deadline, initials, date, escape});
})();

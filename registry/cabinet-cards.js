/* My cabinet cards: Figma 47:19353, 47:19378, 52:21782, 53:21940, 53:21988.
 * Rendering only. Cabinet interactions are delegated by the page controller. */
(() => {
  'use strict';
  const escape = value => window.BpmTaskVisuals.escape(value);
  // The portable builder already embeds literal paths, while template paths
  // still need resolving. Accept both without a second lookup of data URLs.
  const asset = path => path.startsWith('data:') ? path : window.BPMEmbeddedAsset ? window.BPMEmbeddedAsset(path) : path;
  const image = (name, className = '') => `<img${className ? ` class="${className}"` : ''} src="${asset(`assets/cabinet/${name}.svg`)}" alt="" aria-hidden="true">`;
  const embed = markup => window.BPMEmbeddedAsset ? markup.replace(/src="(assets\/[^"<>]+)"/g, (_, path) => `src="${asset(path)}"`) : markup;
  const personName = person => typeof person === 'object' && person !== null ? person.name || person.label || '' : String(person || '');
  const number = value => String(value ?? '—').replace('.', ',');
  const date = value => window.BpmTaskVisuals.date(value);
  const highlight = row => row.highlight === 'problem' ? ' cabinet-card-problem' : row.highlight === 'positive' || row.highlight === true ? ' cabinet-card-positive' : '';
  const open = row => `data-cabinet-open="${escape(row.id)}"`;

  function idBadge(value, label = value) {
    return embed(window.BpmTaskVisuals.idBadge(value, {label, className:'cabinet-id-badge'})).replaceAll('data-task-copy=', 'data-cabinet-copy=');
  }
  function more(row) {
    return `<button class="card-more cabinet-card-more" type="button" data-cabinet-menu="${escape(row.id)}" aria-label="Действия: ${escape(row.title)}" aria-haspopup="menu" aria-expanded="false"><img src="${asset('assets/more.svg')}" alt="" aria-hidden="true"></button>`;
  }
  function body(row, task = false) {
    return `<div class="${task ? 'task-card-body' : 'card-body'}"><button type="button" class="${task ? 'task-card-title' : 'card-title'}" ${open(row)} title="${escape(row.title)}">${escape(row.title)}</button><p class="${task ? 'task-card-description' : 'card-description'}">${escape(row.description)}</p></div>`;
  }
  function avatar(person, initials = false) {
    const name = personName(person);
    return `<span class="task-avatar cabinet-avatar" title="${escape(name)}" aria-label="${escape(name)}">${initials && name ? escape(window.BpmTaskVisuals.initials(name)) : image('person')}</span>`;
  }
  function owner(row) {
    const name = personName(row.owner);
    return `<div class="owner">${avatar(row.owner)}<span class="owner-name" title="${escape(name)}">${escape(name)}</span></div>`;
  }
  function status(row, type) {
    const label = row.status || (type === 'insight' ? 'Создан' : 'Подтверждён');
    const info = type === 'insight' || /созда|доработ|согласовани|выполня/i.test(label);
    const text = `${label}${row.created ? ` | ${date(row.created)}` : ''}`;
    return `<span class="status cabinet-status" title="${escape(text)}">${image(info ? 'status-info' : 'status-success')}<span class="status-copy">${escape(text)}</span></span>`;
  }
  function tags(row) {
    const values = Array.isArray(row.tags) ? row.tags : ['AI', 'ТОП200'];
    const count = Number(row.processCount ?? row.count ?? 3);
    const countText = row.countLabel || `${count} ${count % 100 >= 11 && count % 100 <= 14 ? 'процессов' : count % 10 === 1 ? 'процесс' : count % 10 >= 2 && count % 10 <= 4 ? 'процесса' : 'процессов'}`;
    const processes = row.kind === 'paths' ? `<button class="count-badge" type="button" ${open(row)} aria-label="Открыть ${escape(countText)}"><span>${escape(countText)}</span>${image('count-link')}</button>` : '';
    return `<div class="card-tags">${processes}${values.map(value => `<span class="tag">${escape(value)}</span>`).join('')}</div>`;
  }
  function entity(row) {
    const trend = row.highlight === 'problem' || Number(row.delta) < 0 ? 'negative' : 'positive';
    return `<article class="entity-card cabinet-card cabinet-entity-card${highlight(row)}" ${open(row)} data-cabinet-kind="${row.kind === 'paths' ? 'paths' : 'processes'}" aria-label="${escape(row.title)}">
      ${more(row)}<div class="card-header"><div class="metadata">${idBadge(row.code || row.id)}${status(row, 'entity')}</div>${tags(row)}</div>
      ${body(row)}<div class="card-footer">${owner(row)}<button type="button" class="cabinet-efficiency cabinet-trend-${trend}" data-cabinet-efficiency="${escape(row.id)}" aria-label="Подробнее об эффективности: ${row.efficiency == null ? 'не оценивалась' : `${escape(number(row.efficiency))}%`}">${window.BpmCardVisuals.efficiency(row)}</button></div>
    </article>`;
  }
  function insight(row) {
    const rating = `${row.previousRating != null ? `${number(row.previousRating)} → ` : ''}${number(row.rating)}`;
    return `<article class="entity-card cabinet-card cabinet-insight-card${highlight(row)}" ${open(row)} data-cabinet-kind="insights" aria-label="${escape(row.title)}">
      ${more(row)}<div class="card-header">${status(row, 'insight')}<div class="card-tags cabinet-insight-tags"><span class="tag cabinet-source-tag">${escape(row.source || 'SberBPM')}</span>${idBadge(row.code || row.id)}${image('direction-related', 'task-direction')}<button type="button" class="count-badge cabinet-related-more" data-cabinet-related="${escape(row.id)}" aria-label="Связанные элементы">...</button></div></div>
      ${body(row)}<div class="card-footer">${owner(row)}<div class="cabinet-feedback"><span class="cabinet-feedback-item" title="Оценка ${escape(rating)}">${image(row.ratingActive === false ? 'rating-outline' : 'rating')}<span>${escape(rating)}</span></span><span class="cabinet-feedback-item" title="Комментарии: ${escape(row.comments ?? 0)}">${image('comments')}<span>${escape(row.comments ?? 0)}</span></span></div></div>
    </article>`;
  }
  function participants(row) {
    const people = Array.isArray(row.assignees) ? row.assignees : [];
    const names = people.map(personName);
    const extra = people.length > 3 ? `<span class="task-avatar task-avatar-overflow" title="${escape(names.slice(3).join(', '))}">+${people.length - 3}</span>` : '';
    const group = people.length ? `<span class="task-avatar-group" aria-label="Исполнители: ${escape(names.join(', '))}">${people.slice(0, 3).map(person => avatar(person, true)).join('')}${extra}</span>` : '<span class="task-unassigned">Не назначены</span>';
    return `<span class="task-participant-route">${avatar(row.initiator, true)}${image('direction-flow', 'task-direction')}${group}</span>`;
  }
  function isComplete(row) {
    return row.complete === true || row.completed === true || /^(завершен[ао]?|завершён[ао]?|выполнен[ао]?|согласован[ао]?)$/i.test(String(row.status || '').trim());
  }
  function deadline(row) {
    if (!isComplete(row)) return embed(window.BpmTaskVisuals.deadline(row));
    return `<span class="task-deadline cabinet-deadline-completed" title="Задача завершена">${image('deadline-completed')}<span>${escape(date(row.completedAt || row.deadline))}</span></span>`;
  }
  function task(row) {
    const processCode = row.processCode || row.processId;
    const related = processCode ? `${image('direction-related', 'task-direction')}${idBadge(processCode)}` : '';
    return `<article class="task-card cabinet-card cabinet-task-card${highlight(row)}" ${open(row)} data-cabinet-kind="tasks" aria-label="${escape(row.title)}">
      ${more(row)}<div class="task-card-header">${embed(window.BpmTaskVisuals.status(row, true))}<div class="task-card-tags">${window.BpmTaskVisuals.typeTag(row.type)}${idBadge(row.id)}${related}</div></div>
      ${body(row, true)}<div class="task-card-footer">${participants(row)}${deadline(row)}</div>
    </article>`;
  }
  function skeleton(kind = 'entity') {
    const isInsight = kind === 'insight' || kind === 'insights';
    return `<article class="entity-card cabinet-card cabinet-skeleton${isInsight ? ' cabinet-insight-card' : ''}" aria-hidden="true"><div class="card-header"><span class="skeleton-shape cabinet-skeleton-status"></span><div class="card-tags"><span class="skeleton-shape cabinet-skeleton-tag"></span><span class="skeleton-shape cabinet-skeleton-tag"></span></div></div><div class="card-body"><span class="skeleton-shape cabinet-skeleton-title"></span><span class="skeleton-shape cabinet-skeleton-title cabinet-skeleton-short"></span><span class="skeleton-shape cabinet-skeleton-line"></span><span class="skeleton-shape cabinet-skeleton-line cabinet-skeleton-short"></span></div><div class="card-footer"><span class="skeleton-shape cabinet-skeleton-avatar"></span><span class="skeleton-shape cabinet-skeleton-owner"></span><span class="skeleton-shape cabinet-skeleton-metric"></span></div></article>`;
  }
  window.BpmCabinetCards = Object.freeze({
    insight, task, entity, skeleton, idBadge, isComplete,
    animateCounters: root => window.BpmCardVisuals.animateCounters(root),
    cancelCounters: root => window.BpmCardVisuals.cancelCounters(root)
  });
})();

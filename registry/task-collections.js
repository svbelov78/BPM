/* Reusable task collections. Nordic controls are rendered/bound by the shared
 * task controller; this module only owns collection cards and their local state.
 * Figma: variants 121:21805/121:21972; metrics 119:19739/119:20091. */
(() => {
  'use strict';
  Object.assign(window.BpmTaskTypeAssets || (window.BpmTaskTypeAssets = {}), {
    collectionMore: 'assets/task-types-a/more-24.svg',
    collectionEmpty: 'assets/tasks/empty.svg',
    collectionSwitchOn: 'assets/task-types-b/switch-on.svg',
    collectionSwitchReject: 'assets/task-types-b/switch-reject.svg'
  });

  const array = value => Array.isArray(value) ? value : [];
  const itemsOf = (field, data) => array(data[field.key] ?? field.value);
  const canEdit = (f, ctx) => !ctx.terminal && !f.disabled && f.editable !== false && (ctx.mode !== 'view' || f.editable === true && f.interactive);
  const canDecide = (f, ctx) => !ctx.terminal && !f.disabled && ctx.mode === 'view' && f.interactive && !canEdit(f, ctx);
  const formatDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value.split('-').reverse().join('.') : '—';
  const collectionId = (f, prefix) => `${prefix}-${f.key}`;
  const itemName = (item, metrics) => item.title || item.label || item.name || (metrics ? 'Метрика' : 'Вариант результата');
  const metricView = (item, f) => {
    const option = array(f.options).find(entry => entry.value === item.value);
    return {...item, ...option, ...(option ? {title: option.label} : {})};
  };

  function metricFields(f, item, allItems) {
    const choices = array(f.options).filter(option => option.value === item.value || !allItems.some(other => other !== item && other.value === option.value));
    return [
      {key: 'value', label: 'Метрика', kind: 'select', required: true, options: choices, placeholder: 'Выберите'},
      ...(f.period ? [
        {key: 'indefinite', label: 'Бессрочно', sectionLabel: 'Период неприменимости', kind: 'switch'},
        {key: 'period-help', kind: 'note', tone: 'plain', text: f.periodHelp || 'После окончания периода метрики автоматически возвращаются в мониторинг.'},
        {key: 'periodFrom', label: 'Дата начала', kind: 'date', required: !item.indefinite, disabled: Boolean(item.indefinite), group: 'period', columns: 2},
        {key: 'periodTo', label: 'Дата окончания', kind: 'date', required: !item.indefinite, disabled: Boolean(item.indefinite), group: 'period', columns: 2}
      ] : []),
      {key: 'reason', label: 'Обоснование', kind: 'textarea', required: f.reasonRequired !== false,
        placeholder: 'Введите обоснование неприменимости', height: 140}
    ];
  }

  function readonly(label, value, ctx, tone = '') {
    return `<div class="tf-readonly"><span class="internal-label">${ctx.esc(label)}</span><div class="tf-value${tone === 'link' ? ' stf-link-value' : ''}">${ctx.esc(value ?? '—')}</div></div>`;
  }

  function metadata(item, f, ctx) {
    const order = ['service', 'segment', 'channel', 'businessDescription'];
    const fields = array(f.itemFields).filter(field => field.key !== 'title').sort((a, b) => {
      const first = order.indexOf(a.key), second = order.indexOf(b.key);
      return (first < 0 ? order.length : first) - (second < 0 ? order.length : second);
    });
    return `<div class="stf-variant-metadata">${fields.map(field => {
      const value = array(field.options).find(option => option.value === item[field.key])?.label || item[field.key];
      return readonly(field.label, value || '—', ctx, field.key === 'businessDescription' ? 'link' : '');
    }).join('')}</div>`;
  }

  function decision(f, item, index, prefix, ctx) {
    const approved = item.approved !== false;
    const name = itemName(item, f.kind === 'metrics');
    const label = `Согласовать «${name}»`;
    const id = `${prefix}-${f.key}-${index}-approve`;
    // The source switch SVG is 58×44 including its shadow; the control itself
    // occupies a 48×24 wrapper. Do not stretch the exported asset into 24×24.
    const source = window.BpmTaskTypeAssets[approved ? 'collectionSwitchOn' : 'collectionSwitchReject'];
    return `<label class="stf-choice stf-choice--switch stf-item-decision" title="${ctx.esc(label)}"><input id="${ctx.esc(id)}" type="checkbox" role="switch" data-stfc-decision="${index}" aria-label="${ctx.esc(label)}"${approved ? ' checked' : ''}><span class="stf-switch-graphic"><img src="${ctx.esc(source)}" alt="" width="58" height="44"></span><span class="sr-only">${ctx.esc(label)}</span></label>`;
  }

  function decisionText(f, item, ctx) {
    if (item.approved === undefined && !item.decision) return '';
    const rejected = item.decision === 'rejected' || item.approved === false;
    const label = f.decisionLabels?.[rejected ? 'rejected' : 'approved'] || (rejected ? 'Отклонен' : 'Согласован');
    return `<span class="stf-decision${rejected ? ' is-rejected' : ''}">${ctx.esc(label)}</span>`;
  }

  function itemMenu(f, item, index, ctx) {
    const title = ctx.esc(itemName(item, false));
    return `<details class="stf-item-menu"><summary class="stf-icon-button" aria-label="Действия варианта «${title}»">${ctx.img('collectionMore', 24)}</summary><div class="stf-item-menu-popover" role="group" aria-label="Действия варианта"><button type="button" data-stf-action="item-edit" data-field="${ctx.esc(f.key)}" data-index="${index}">Редактировать</button>${f.allowDelete !== false ? `<button type="button" data-stfc-delete="${index}" aria-label="Удалить вариант «${title}»">Удалить</button>` : ''}</div></details>`;
  }

  function metricCard(f, item, index, data, prefix, ctx) {
    const editable = canEdit(f, ctx), value = metricView(item, f), selecting = canDecide(f, ctx);
    const title = editable ? 'Метрика к неприменимости' : itemName(value, true);
    const rejected = item.decision === 'rejected' || item.approved === false;
    const stateClass = ctx.terminal && item.approved !== undefined ? rejected ? ' is-rejected' : ' is-approved' : '';
    const header = `<div class="stf-item-heading"><div><h3>${ctx.esc(title)}</h3></div>${editable && f.allowDelete !== false ? `<button class="stf-icon-button" type="button" data-stfc-delete="${index}" aria-label="Удалить метрику «${ctx.esc(itemName(value, true))}»">${ctx.img('close', 24)}</button>` : selecting ? decision(f, value, index, prefix, ctx) : ctx.terminal ? decisionText(f, item, ctx) : ''}</div>`;
    const body = editable ? `<div class="tf-form" id="metric-${index}-fields">${ctx.renderFields(metricFields(f, item, itemsOf(f, data)), item, `metric-${index}`, true)}</div>`
      : `${readonly('Обоснование', value.reason || '—', ctx)}${f.period ? readonly('Срок неприменимости', value.indefinite ? 'Бессрочно' : `${formatDate(value.periodFrom)} — ${formatDate(value.periodTo)}`, ctx) : ''}`;
    return `<article class="stf-card stf-item stf-metric${stateClass}" data-item-index="${index}" data-collection-key="${ctx.esc(f.key)}">${header}${body}</article>`;
  }

  function variantCard(f, item, index, prefix, ctx) {
    const rejected = item.decision === 'rejected' || item.approved === false;
    const stateClass = ctx.terminal && item.approved !== undefined ? rejected ? ' is-rejected' : ' is-approved' : '';
    const control = canEdit(f, ctx) ? itemMenu(f, item, index, ctx) : canDecide(f, ctx) ? decision(f, item, index, prefix, ctx) : ctx.terminal ? decisionText(f, item, ctx) : '';
    return `<article class="stf-card stf-item stf-variant${stateClass}" data-item-index="${index}" data-collection-key="${ctx.esc(f.key)}"><div class="stf-item-heading"><div>${item.code ? ctx.badge(item.code) : ''}<h3>${ctx.esc(itemName(item, false))}</h3></div>${control}</div>${metadata(item, f, ctx)}</article>`;
  }

  function existing(f, prefix, ctx) {
    if (!array(f.existing).length) return '';
    const title = f.existingLabel || 'Существующие варианты процесса';
    return `<details class="stf-accordion stf-existing-accordion"${f.existingOpen ? ' open' : ''}><summary>${ctx.esc(title)} <span>${f.existing.length}</span>${ctx.img('chevron', 16)}</summary><div class="stf-existing">${f.existing.map((item, index) => `<article class="stf-card"><h3>${ctx.esc(itemName(item, false))}</h3>${metadata(item, f, ctx)}${f.selectExisting && canEdit(f, ctx) ? `<button class="button" type="button" data-stf-action="existing:${ctx.esc(f.key)}:${index}">Выбрать</button>` : ''}</article>`).join('')}</div></details>`;
  }

  function render(f, data, prefix, ctx) {
    const id = collectionId(f, prefix), items = itemsOf(f, data), metrics = f.kind === 'metrics';
    const previous = !metrics && (canEdit(f, ctx) || f.existingOnly) ? existing(f, prefix, ctx) : '';
    if (f.existingOnly) return `<section class="stf-collection" id="${ctx.esc(id)}">${previous}</section>`;
    const add = canEdit(f, ctx) ? `<button type="button" class="tf-back" data-stf-action="item-add" data-field="${ctx.esc(f.key)}">${ctx.img('plus', 24)}${ctx.esc(f.addLabel || (metrics ? 'Добавить метрику' : 'Добавить вариант'))}</button>` : '';
    const heading = f.label || add ? `<div class="stf-collection-heading">${f.label ? `<h3>${ctx.esc(f.label)}</h3>` : ''}${add}</div>` : '';
    const cards = items.map((item, index) => metrics ? metricCard(f, item, index, data, prefix, ctx) : variantCard(f, item, index, prefix, ctx)).join('');
    const emptyTitle = f.emptyTitle || (metrics ? 'Предложите метрики' : f.emptyText || 'Предложите варианты');
    const emptyHelp = f.emptyHelp || (f.emptyTitle ? f.emptyText : '') || '';
    const empty = `<div class="stf-empty">${ctx.img('collectionEmpty', 40)}<h3>${ctx.esc(emptyTitle)}</h3>${emptyHelp ? `<p>${ctx.esc(emptyHelp)}</p>` : ''}</div>`;
    return `<section class="stf-collection" id="${ctx.esc(id)}" data-collection="${ctx.esc(f.kind)}">${previous}${heading}${cards || empty}</section>`;
  }

  function bind(f, data, prefix, ctx) {
    const root = document.getElementById(collectionId(f, prefix));
    if (!root) return;
    const items = itemsOf(f, data);
    if (canEdit(f, ctx) && f.kind === 'metrics') {
      let refreshed = false;
      items.forEach((item, index) => {
        // Selecting a different metric replaces only its catalogue metadata;
        // the user's period and explanation stay attached to the card.
        const source = array(f.options).find(option => option.value === item.value);
        if (source) for (const key of ['label', 'code', 'description', 'unit', 'target']) {
          const next = source[key] || '';
          if (item[key] !== next) {item[key] = next; refreshed = true;}
        }
        ctx.bindFields(metricFields(f, item, items), item, `metric-${index}`, true);
      });
      if (refreshed) ctx.changed();
    }
    root.querySelectorAll('[data-stfc-decision]').forEach(input => input.addEventListener('change', () => {
      if (!canDecide(f, ctx)) return;
      const item = items[Number(input.dataset.stfcDecision)];
      if (!item) return;
      item.approved = input.checked;
      delete item.decision;
      ctx.changed();
      ctx.rerender();
      document.getElementById(input.id)?.focus({preventScroll: true});
    }));
    root.querySelectorAll('[data-stfc-delete]').forEach(button => button.addEventListener('click', event => {
      if (!canEdit(f, ctx) || f.allowDelete === false) return;
      event.preventDefault();
      const index = Number(button.dataset.stfcDelete);
      if (!Number.isInteger(index) || !items[index]) return;
      data[f.key] = items.filter((_, itemIndex) => itemIndex !== index);
      ctx.changed();
      ctx.rerender();
      const focus = document.getElementById(collectionId(f, prefix))?.querySelector('[data-stf-action="item-add"]');
      focus?.focus({preventScroll: true});
    }));
    root.querySelectorAll('.stf-item-menu').forEach(menu => {
      menu.addEventListener('toggle', () => {
        if (menu.open) root.querySelectorAll('.stf-item-menu[open]').forEach(other => {if (other !== menu) other.open = false;});
      });
      menu.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !menu.open) return;
        event.preventDefault();event.stopPropagation();menu.open = false;menu.querySelector('summary')?.focus();
      });
      menu.addEventListener('focusout', event => {if (!menu.contains(event.relatedTarget)) menu.open = false;});
    });
  }

  window.BpmTaskCollections = {render, bind};
})();

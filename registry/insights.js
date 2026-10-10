/* Insights workspace: registry, internal record tabs and creation drawer.
 * Shared Nordic fields, calendar, card typography and offline assets. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => window.BpmTaskVisuals.escape(value);
  const copy = value => esc(window.BpmCopyTypography?.format(value) ?? value);
  const normalize = value => String(value ?? '').toLocaleLowerCase('ru').replace(/ё/g,'е');
  const collator = new Intl.Collator('ru', {numeric:true, sensitivity:'base'});
  const date = iso => iso ? iso.split('-').reverse().join('.') : 'Любая';
  const number = value => String(value).replace('.', ',');
  // Literal paths are automatically embedded by build-standalone.cjs.
  const assets = {
    download:'assets/insights/241-1742-icon24-download.svg', table:'assets/insights/241-1742-icon24-table-view.svg', cards:'assets/insights/241-1742-icon24-cards-view.svg',
    info:'assets/insights/241-1742-icon16-info.svg', plus:'assets/insights/241-1742-icon24-plus-add.svg', search:'assets/insights/241-1742-icon24-search.svg',
    calendar:'assets/insights/241-1742-icon24-one-date.svg', copy:'assets/insights/241-1742-icon16-copy.svg', direction:'assets/insights/241-1742-related-direction.svg',
    person:'assets/insights/241-1742-icon24-person.svg', star:'assets/insights/241-1742-rating-icon.svg', comments:'assets/insights/241-1742-comments-icon.svg',
    starOutline:'assets/insights/241-2705-rating-icon.svg', sort:'assets/tasks/table-sort.svg', ratingArrow:'assets/arrow-down.svg', avatar:'assets/insights/241-2705-owner-avatar.png',
    blue:'assets/insights/241-1742-dot.svg', red:'assets/insights/241-2705-dot.svg', orange:'assets/insights/241-2705-dot1.svg', green:'assets/insights/241-2705-dot2.svg',
    exit:'assets/insights/245-5699-icon24-exit.svg', arrow:'assets/insights/245-5700-arrow.svg', close:'assets/close-16.svg',
    back:'assets/insight-tabs/back.svg', tabClose:'assets/insight-tabs/exit.svg'
  };
  const img = (name, size = 24, className = '') => `<img src="${assets[name]}" width="${size}" height="${size}" class="${className}" alt="" aria-hidden="true">`;
  const labels = {block:'Блоки', division:'Структурные подразделения', product:'Продукты', path:'Клиентские пути', process:'Процессы', source:'Источники', bank:'Тер. банки', owner:'Владельцы', author:'Авторы', status:'Статус'};
  const attentionTooltips = {
    approval:'Инсайты вашего ТБ, где требуется ваше согласование',
    opinion:'Инсайты других ТБ — нужно оценить, воспроизводится ли инсайт у вас',
    decision:'Инсайт прошел согласование и оценку воспроизводимости – нужно решить, брать ли его в работу'
  };
  const sortChoices = [{value:'id-desc',label:'ID, инсайт ↓'}, {value:'id-asc',label:'ID, инсайт ↑'}, {value:'title-asc',label:'Название А–Я'}, {value:'title-desc',label:'Название Я–А'}, {value:'created-desc',label:'Сначала новые'}, {value:'created-asc',label:'Сначала старые'}, {value:'rating-desc',label:'Высокая оценка'}, {value:'rating-asc',label:'Низкая оценка'}, {value:'comments-desc',label:'Больше комментариев'}, {value:'comments-asc',label:'Меньше комментариев'}, {value:'owner-asc',label:'Владелец А–Я'}, {value:'owner-desc',label:'Владелец Я–А'}, {value:'status-asc',label:'Статус А–Я'}, {value:'status-desc',label:'Статус Я–А'}];
  const referencePeriod = {from:'2001-08-21', to:'2026-09-13'};
  const LOADING_DURATION = 2000;
  const shape = name => `<span class="skeleton-shape ${name}"></span>`;

  function skeletonRows(count) {
    const row = `<tr class="insights-skeleton-row" aria-hidden="true"><td class="insights-main-cell"><div class="insights-skeleton-copy">${shape('insights-skeleton-title')}${shape('skeleton-line')}${shape('skeleton-line insights-skeleton-short')}<div class="insights-meta">${shape('skeleton-tag')}${shape('skeleton-tag')}${shape('skeleton-tag')}</div></div></td><td class="owner-cell"><div class="skeleton-owner">${shape('skeleton-avatar')}<div class="skeleton-owner-copy">${shape('skeleton-line')}${shape('skeleton-line')}</div></div></td><td class="date-cell">${shape('skeleton-date')}</td><td class="status-cell">${shape('skeleton-status')}</td><td class="comment-cell">${shape('insights-skeleton-score')}</td><td class="rating-cell">${shape('insights-skeleton-score')}</td></tr>`;
    return Array.from({length:count},() => row).join('');
  }

  function create(api) {
    const panel = $('insights-panel');
    const store = window.BpmInsightStore;
    let data = store.list();
    // Keep locally created insights visible after a reload as well. The design's
    // fixed sample end-date predates records created during a later demo session.
    const defaultPeriod = {...referencePeriod,to:data.reduce((latest,row) => row.created > latest ? row.created : latest,referencePeriod.to)};
    const state = {view:'cards', query:'', filters:Object.fromEntries(Object.keys(labels).map(key => [key, []])), ...defaultPeriod, attention:'', sort:'id-desc'};
    // Demo names are a view projection, never an assignment or source mutation.
    function displayValue(row,key) {
      return key === 'owner' || key === 'author'
        ? window.BpmAvatars.displayName(row[key],`${row.id}:${key}`) : row[key];
    }
    function ownerDisplayName(row) {return displayValue(row,'owner');}
    const selects = {};
    let processOptionLabels = new Map();
    const openTabs = [], tabScroll = new Map();
    let activeId = null, registryScroll = 0, restoreRecordFocus = null;
    let active = false, loading = false, loadingTimer, calendar = null, relationAnchor = null, relations = null, suppressRelationFocus = false;
    panel.innerHTML = `<div class="insights-title-row"><h1 id="insights-title"><button type="button" id="insights-back" aria-label="Вернуться к реестру инсайтов"><span id="insights-back-icon" hidden>${img('back')}</span><span id="insights-title-label">Инсайты</span><span class="insights-total" id="insights-count"></span></button></h1><div id="insights-tabs" class="insights-tabs" role="tablist" aria-label="Открытые инсайты" hidden></div><div class="insights-view-controls" role="group" aria-label="Вид реестра инсайтов">
      <button type="button" id="insights-export" class="icon-button" aria-label="Экспортировать инсайты" data-tooltip="Экспорт">${img('download')}</button><button type="button" id="insights-table" class="icon-button" aria-label="Табличный вид инсайтов" aria-pressed="false" data-tooltip="Таблица">${img('table')}</button><button type="button" id="insights-cards" class="icon-button selected" aria-label="Карточный вид инсайтов" aria-pressed="true" data-tooltip="Карточки">${img('cards')}</button></div></div>
      <div id="insights-registry-view"><div class="insights-filters"><div class="insights-alert">${img('info',16)}<span>Несколько инсайтов ожидают вашего <button type="button" data-insight-attention="approval" data-tooltip="${esc(attentionTooltips.approval)}">согласования ${data.filter(row => row.needsApproval).length}</button> и <button type="button" data-insight-attention="opinion" data-tooltip="${esc(attentionTooltips.opinion)}">мнения ${data.filter(row => row.needsOpinion).length}</button></span></div>
      <div class="insights-primary"><button type="button" id="insights-create" class="button primary-button insights-create">${img('plus')}Создать инсайт</button><div class="field search-field insights-search"><input id="insights-search" type="search" aria-label="Поиск инсайтов по ID, названию, процессу или автору" placeholder="Введите ID, название, процесс, автора..." autocomplete="off"><button type="button" id="insights-clear-search" class="small-icon" aria-label="Очистить поиск инсайтов" hidden>${img('close',16)}</button>${img('search')}</div><div id="insights-status" class="select-host"></div><button type="button" id="insights-date" class="field insights-date" aria-expanded="false" aria-haspopup="dialog"><span class="field-content"><span class="internal-label">Даты создания</span><span id="insights-date-summary" class="single-value"></span></span>${img('calendar')}</button><div id="insights-sort" class="select-host"></div></div>
      <div class="insights-filter-grid">${Object.keys(labels).filter(key => key !== 'status').map(key => `<div id="insights-${key}" class="select-host"></div>`).join('')}</div></div>
      <section id="insights-applied" class="applied-filters" aria-label="Применённые фильтры инсайтов" hidden><div id="insights-chips" class="applied-filter-groups"></div><button type="button" id="insights-reset" class="clear-all-filters" aria-label="Сбросить все фильтры инсайтов">${img('exit')}</button></section>
      <div id="insights-results" aria-label="Результаты реестра инсайтов" aria-busy="false"></div></div><section id="insights-detail-view" class="insights-detail-view" role="tabpanel" tabindex="-1" hidden></section><div id="insights-announcement" class="sr-only" role="status" aria-live="polite"></div>`;

    // One detail instance travels between the cabinet drawer and registry tab.
    // Sharing the actual host keeps field drafts, handlers and scroll review intact.
    const detailHost = $('insights-detail-view');
    const cabinetDrawer = document.createElement('dialog');
    cabinetDrawer.id = 'cabinet-insight-drawer'; cabinetDrawer.className = 'task-drawer cabinet-insight-drawer';
    cabinetDrawer.setAttribute('aria-labelledby','insight-detail-title'); document.body.append(cabinetDrawer);
    let cabinetDrawerId = null, cabinetTrigger = null, drawerClosingTimer;
    const detail = window.BpmInsightDetail.create({mount:detailHost,api:{...api,closeDetail:() => cabinetDrawerId ? closeCabinetDrawer() : showRegistry(),closeInsightTab:id => {
      const fromCabinet = !!cabinetDrawerId;
      // Restore the shared host before closing its tab. Selecting the neighbor
      // offscreen must not navigate away from the user's Cabinet.
      if (fromCabinet) closeCabinetDrawer({immediate:true});
      closeTab(id,{activate:!fromCabinet});
    },openInTab:() => {
      closeCabinetDrawer({immediate:true,restoreFocus:false}); api.openSection?.();
    }},getRow:id => store.get(id),onChange:(id,patch) => store.update(id,patch)});
    function finishCabinetDrawer() {
      if (cabinetDrawer.open || !cabinetDrawerId) return;
      clearTimeout(drawerClosingTimer);
      detail.hide(); detail.setPresentation('tab');
      $('insights-announcement').before(detailHost);
      detailHost.setAttribute('role','tabpanel');
      cabinetDrawerId = null;
      cabinetDrawer.classList.remove('is-closing','has-entered'); cabinetDrawer.inert = false;
      document.body.classList.remove('cabinet-insight-drawer-open'); renderTabs();
      const trigger = cabinetTrigger; cabinetTrigger = null;
      if (trigger?.isConnected && !trigger.closest('[hidden]')) trigger.focus({preventScroll:true});
    }
    function closeCabinetDrawer(options = {}) {
      if (!cabinetDrawerId) return;
      // Closed dialogs have no layout; read the viewport before close() hides it.
      if (cabinetDrawer.open && !cabinetDrawer.inert) tabScroll.set(cabinetDrawerId,detail.getScrollTop());
      if (options.restoreFocus === false) cabinetTrigger = null;
      if (options.immediate || matchMedia('(prefers-reduced-motion: reduce)').matches || !cabinetDrawer.open) {
        cabinetDrawer.close(); finishCabinetDrawer(); return;
      }
      cabinetDrawer.classList.add('is-closing'); cabinetDrawer.inert = true;
      clearTimeout(drawerClosingTimer); drawerClosingTimer = setTimeout(() => {cabinetDrawer.close();finishCabinetDrawer();},260);
    }
    function openCabinetInsight(id,trigger) {
      if (!store.get(id)) {api.toast('Инсайт не найден.'); return;}
      closeCabinetDrawer({immediate:true,restoreFocus:false}); closePopups(); api.closePopups?.();
      if (!openTabs.includes(id)) openTabs.push(id);
      activeId = id; renderTabs();
      cabinetDrawerId = id; cabinetTrigger = trigger || document.activeElement;
      cabinetDrawer.append(detailHost); detailHost.setAttribute('role','region'); detailHost.setAttribute('aria-labelledby','insight-detail-title');
      detail.setPresentation('drawer');
      cabinetDrawer.classList.remove('is-closing','has-entered'); cabinetDrawer.inert = false;
      document.body.classList.add('cabinet-insight-drawer-open'); cabinetDrawer.showModal();
      detail.show(id,{preserveDraft:true}); detail.setScrollTop(tabScroll.get(id) || 0);
      detailHost.querySelector('[data-id-drawer-close]')?.focus({preventScroll:true});
    }
    cabinetDrawer.addEventListener('cancel',event => {event.preventDefault();closeCabinetDrawer();});
    cabinetDrawer.addEventListener('scroll',event => {
      if (cabinetDrawerId && cabinetDrawer.open && !cabinetDrawer.inert && event.target.matches('.id-detail-scroll')) tabScroll.set(cabinetDrawerId,event.target.scrollTop);
    },true);
    cabinetDrawer.addEventListener('close',finishCabinetDrawer);
    cabinetDrawer.addEventListener('animationend',event => {if(event.target === cabinetDrawer && event.animationName === 'task-drawer-slide-in') cabinetDrawer.classList.add('has-entered');});
    const approval = window.BpmInsightApproval.create({api,getRow:id => store.get(id),onChange:(id,patch) => store.update(id,patch),onOpenTab:openInsight});
    const creator = window.BpmInsightCreate.create({api,getRows:() => store.list(),onOpenInsight:openInsight,onPreviewInsight:(id,options) => approval.open(id,{...options,preview:true}),onCreate:draft => {
      const process = [...(window.BPM_DATA || []),...(window.BPM_STRUCTURE?.records || [])].find(item => item.id === draft.related[0]?.id);
      const row = store.create({...draft,block:process?.block || '',division:process?.division || '',product:draft.products[0] || process?.product || ''});
      if (row.created > defaultPeriod.to) defaultPeriod.to = row.created;
      state.query = ''; state.attention = ''; state.from = ''; state.to = '';
      $('insights-search').value = '';
      Object.keys(labels).forEach(key => {state.filters[key] = []; selects[key].set([]);});
      appliedFilters();
      api.toast(store.persistenceAvailable() ? 'Инсайт создан и сохранён в этом браузере' : 'Инсайт создан. Хранилище браузера недоступно: запись сохранена только до перезагрузки.',{success:true});
      return row;
    }});

    const exportDialog = document.createElement('dialog');
    exportDialog.id = 'insights-export-dialog';
    exportDialog.className = 'modal insights-export';
    exportDialog.setAttribute('aria-labelledby','insights-export-title');
    exportDialog.innerHTML = `<form id="insights-export-form"><div class="insights-export-heading"><h2 id="insights-export-title">Экспорт инсайтов</h2><button type="button" class="icon-button" data-insight-export-close aria-label="Закрыть экспорт инсайтов">${img('exit')}</button></div><div class="insights-export-section insights-export-scopes"><label class="radio-row"><input type="radio" name="insights-export-scope" value="all" checked>Все инсайты</label><label class="radio-row"><input type="radio" name="insights-export-scope" value="filtered">Выбранные параметры фильтра реестра</label></div><div class="insights-export-section insights-export-variants"><h3>Экспорт вариантов результата процесса</h3><label class="radio-row"><input type="radio" name="insights-export-scope" value="variants">Все варианты</label></div><div class="insights-export-actions"><button type="button" class="button secondary-button" data-insight-export-close>Отмена</button><button type="submit" class="button primary-button">Скачать</button></div></form>`;
    document.body.append(exportDialog);

    function choices(key) {
      if (key === 'status') return window.BpmInsightWorkflow.statuses.map(value => ({value,label:value}));
      const values = data.flatMap(row => {const value=displayValue(row,key);return Array.isArray(value) ? value : [value];});
      const unique = [...new Set(values)].filter(Boolean).sort(collator.compare);
      if (key === 'process') {
        const records = [...(window.BPM_DATA || []),...(window.BPM_STRUCTURE?.records || [])].filter(row => row.entity === 'processes');
        const byId = new Map(records.map(row => [row.id,row]));
        const codesByTitle = new Map();
        [...data.flatMap(row => row.related || []),...records].forEach(item => {
          const record = byId.get(item.id);
          const number = record?.number ?? item.number ?? String(item.code || record?.code || '').match(/^П\s*(\d+)$/i)?.[1]
            ?? String(item.id || '').match(/^(?:processes-|П\s*)(\d+)$/i)?.[1];
          if (!item.title || !/^\d+$/.test(String(number ?? ''))) return;
          if (!codesByTitle.has(item.title)) codesByTitle.set(item.title,new Set());
          codesByTitle.get(item.title).add(`П ${String(number).padStart(4,'0')}`);
        });
        processOptionLabels = new Map(unique.map(value => {
          const codes = [...(codesByTitle.get(value) || [])].sort(collator.compare);
          return [value,codes.length ? `${codes.join(', ')} — ${value}` : value];
        }));
      }
      return unique.map(value => ({value,label:key === 'process' ? processOptionLabels.get(value) : value}));
    }
    Object.keys(labels).forEach(key => {
      selects[key] = api.createSelect(`insights-${key}`, {label:labels[key], multiple:true, options:choices(key), onChange:values => {
        state.filters[key] = [...values];
        if(key === 'source' && !values.includes('ТБ')) {state.filters.bank=[];selects.bank.set([]);}
        load();
      }});
    });
    const renderProcessOptions = selects.process.renderOptions.bind(selects.process);
    selects.process.renderOptions = function() {
      const query = this.query;
      // Accept the original compact code as well as its spaced display form.
      this.query = query.trim().replace(/^п\s*(?=\d)/i,'П ');
      try {renderProcessOptions();} finally {this.query = query;}
    };
    selects.sort = api.createSelect('insights-sort', {label:'Сортировка', allowAll:false, icon:'sort', options:sortChoices, values:[state.sort], minPopupWidth:260,
      valueLabel:value => ({id:'ID, инсайт',title:'Название',created:value.endsWith('desc') ? 'Сначала новые' : 'Сначала старые',rating:'Оценка',comments:'Комментарии',owner:'Владелец',status:'Статус'}[value.split('-')[0]]),
      onChange:values => {state.sort = values[0] || 'id-desc'; load();}});

    function renderTabs() {
      const tabs = $('insights-tabs');
      const focused = tabs.contains(document.activeElement) ? document.activeElement.dataset.insightTab || document.activeElement.dataset.insightTabClose : null;
      const scrollLeft = tabs.scrollLeft;
      tabs.hidden = !openTabs.length;
      tabs.innerHTML = openTabs.map((id,index) => {
        const row = store.get(id), selected = id === activeId;
        return `<div class="insights-tab${selected ? ' is-active' : ''}" role="presentation"><button type="button" role="tab" id="insight-tab-${esc(id)}" data-insight-tab="${esc(id)}" aria-selected="${selected}" aria-controls="insights-detail-view" tabindex="${selected || !activeId && !index ? '0' : '-1'}" title="${esc(row?.title || id)}">${esc(id)}</button><button type="button" class="insights-tab-close" data-insight-tab-close="${esc(id)}" aria-label="Закрыть вкладку ${esc(id)}" tabindex="${selected ? '0' : '-1'}">${img('tabClose')}</button></div>`;
      }).join('');
      tabs.scrollLeft = scrollLeft;
      if (focused) tabs.querySelector(`[data-insight-tab="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
      $('insights-back-icon').hidden = !activeId;
      $('insights-registry-view').hidden = !!activeId;
      $('insights-detail-view').hidden = !activeId;
      panel.classList.toggle('has-insight-tabs',!!openTabs.length);
      panel.classList.toggle('is-insight-detail',!!activeId);
      document.body.classList.toggle('insight-tab-open',active && !!activeId);
      window.BpmInsightTabsDock?.refresh();
      if (activeId) {
        $('insights-detail-view').setAttribute('aria-labelledby',`insight-tab-${activeId}`);
        $('insights-count').textContent = String(data.length);
      } else $('insights-detail-view').removeAttribute('aria-labelledby');
    }
    function openInsight(id) {
      if (!store.get(id)) {api.toast('Инсайт не найден.'); return;}
      if (cabinetDrawerId) closeCabinetDrawer({immediate:true,restoreFocus:false});
      if (!active) api.openSection?.();
      if (activeId === id) {focusTab(id); return;}
      closePopups();
      if (activeId) tabScroll.set(activeId,detail.getScrollTop()); else registryScroll = window.scrollY;
      clearTimeout(loadingTimer); loading = false;
      $('insights-results').setAttribute('aria-busy','false');
      $('insights-results').classList.remove('is-loading');
      if (!openTabs.includes(id)) openTabs.push(id);
      activeId = id;
      renderTabs();
      window.scrollTo({top:0,behavior:'instant'});
      detail.show(id);
      requestAnimationFrame(() => {if (activeId !== id || !active) return; detail.setScrollTop(tabScroll.get(id) || 0); focusTab(id);});
      $('insights-announcement').textContent = `Открыт инсайт ${id}: ${store.get(id).title}`;
    }
    function openRecord(id) {openInsight(id);}
    const attentionMatches = (row,kind) => kind==='approval' ? window.BpmInsightWorkflow.canApprove(row) : kind==='decision' ? window.BpmInsightWorkflow.canDecideTeam(row) : row.needsOpinion;
    function updateAttention() {
      const names={approval:'согласования',opinion:'мнения',decision:'решения'};
      const items=Object.entries(names).map(([kind,label])=>({kind,label,count:data.filter(row=>attentionMatches(row,kind)).length})).filter(item=>item.count);
      const alert=panel.querySelector('.insights-alert');alert.hidden=!items.length;
      alert.querySelector('span').innerHTML=`Ожидают вашего ${items.map(item=>`<button type="button" data-insight-attention="${item.kind}" data-tooltip="${esc(attentionTooltips[item.kind])}" aria-pressed="${state.attention===item.kind}">${item.label} ${item.count}</button>`).join(', ')}`;
    }
    function focusTab(id) {
      const tab = panel.querySelector(`[data-insight-tab="${CSS.escape(id)}"]`);
      tab?.focus({preventScroll:true});
      if (tab) {
        const track = $('insights-tabs'), bounds = track.getBoundingClientRect();
        const item = tab.closest('.insights-tab').getBoundingClientRect();
        if (item.left < bounds.left + 8) track.scrollLeft += item.left - bounds.left - 8;
        else if (item.right > bounds.right - 8) track.scrollLeft += item.right - bounds.right + 8;
      }
    }
    function showRegistry(options = {}) {
      closePopups();
      if (activeId) {tabScroll.set(activeId,detail.getScrollTop()); restoreRecordFocus = options.focus === false ? null : activeId;}
      activeId = null; detail.hide(); renderTabs(); load();
      if (options.focus !== false) $('insights-title').setAttribute('tabindex','-1');
      requestAnimationFrame(() => {if (!activeId && active) {window.scrollTo({top:options.scrollTop ?? registryScroll,behavior:'instant'}); if (options.focus !== false) $('insights-title').focus({preventScroll:true});}});
    }
    function closeTab(id,options = {}) {
      const index = openTabs.indexOf(id); if (index < 0) return;
      openTabs.splice(index,1);
      if (activeId === id) {
        const next = openTabs[index] || openTabs[index - 1];
        if (options.activate === false) {activeId = next || null; renderTabs();}
        else if (next) openInsight(next); else showRegistry();
      } else {renderTabs(); if (activeId && options.activate !== false) focusTab(activeId);}
      tabScroll.delete(id); detail.close(id);
    }
    // The prototype heading replays the original demo scenarios, rather than
    // only navigating back. User-created records and open tabs are retained.
    $('insights-back').addEventListener('click',() => {
      closePopups();
      if (activeId) tabScroll.set(activeId,detail.getScrollTop());
      activeId = null; restoreRecordFocus = null; detail.hide();
      const restored = store.resetDemo();
      restored.forEach(id => {detail.close(id); tabScroll.delete(id);});
      // Include retained local records created in another view/browser tab,
      // not only those created through this controller's own drawer.
      defaultPeriod.to = data.reduce((latest,row) => row.created > latest ? row.created : latest,referencePeriod.to);
      state.sort = 'id-desc'; selects.sort.set([state.sort]);
      renderTabs(); reset();
      registryScroll = 0;
      requestAnimationFrame(() => {if (!activeId && active) window.scrollTo({top:0,behavior:'instant'});});
      api.toast(store.persistenceAvailable() ? 'Демосценарии восстановлены. Созданные вами инсайты сохранены.' : 'Демосценарии восстановлены для текущего сеанса. Созданные вами инсайты сохранены.',{success:true});
    });
    $('insights-tabs').addEventListener('pointerdown',() => {
      $('insights-tabs').querySelectorAll('.is-keyboard-active').forEach(tab => tab.classList.remove('is-keyboard-active'));
    });
    $('insights-tabs').addEventListener('focusout',event => {
      const tab = event.target.closest('.insights-tab');
      if (tab && !tab.contains(event.relatedTarget)) tab.classList.remove('is-keyboard-active');
    });
    $('insights-tabs').addEventListener('keydown',event => {
      // Keep the close control laid out during the label → close focus transfer.
      // A pure :focus-visible rule would hide it between blur and focus events.
      event.target.closest('.insights-tab')?.classList.add('is-keyboard-active');
      const tab = event.target.closest('[data-insight-tab]'); if (!tab) return;
      const index = openTabs.indexOf(tab.dataset.insightTab);
      const next = event.key === 'ArrowRight' ? openTabs[(index + 1) % openTabs.length] : event.key === 'ArrowLeft' ? openTabs[(index + openTabs.length - 1) % openTabs.length] : event.key === 'Home' ? openTabs[0] : event.key === 'End' ? openTabs.at(-1) : null;
      if (next) {event.preventDefault(); openInsight(next); focusTab(next);}
      if (event.key === 'Delete') {event.preventDefault(); closeTab(tab.dataset.insightTab);}
    });
    store.subscribe(rows => {
      data = rows;
      Object.keys(labels).forEach(key => selects[key].setOptions(choices(key)));
      updateAttention();
      if (!active) return;
      renderTabs();
      // Never replace the focused editable detail when its own fields change.
      if (!activeId) render();
    });

    function filteredRows() {
      const query = normalize(state.query.trim());
      const [key, direction] = state.sort.split('-');
      return data.filter(row => {
        const searchable = [row.id,row.title,row.description,displayValue(row,'author'),ownerDisplayName(row),row.path,...row.related.flatMap(item => [item.code,item.title])].join(' ');
        return (!query || normalize(searchable).includes(query)) && Object.entries(state.filters).every(([field, values]) => {const projected=displayValue(row,field);return !values.length || values.some(value => Array.isArray(projected) ? projected.includes(value) : projected === value);})
          && (!state.from || row.created >= state.from) && (!state.to || row.created <= state.to)
          && (!state.attention || attentionMatches(row,state.attention));
      }).sort((a,b) => {const first=displayValue(a,key),second=displayValue(b,key);return (typeof first === 'number' ? first - second : collator.compare(first || '',second || '')) * (direction === 'desc' ? -1 : 1) || collator.compare(b.id,a.id);});
    }
    function status(row, withDate = false) {
      return `<span class="insights-status${withDate ? ' cabinet-status' : ''}">${window.BpmInsightPresentation.status(row,withDate)}${row.rejection && !withDate ? `<button type="button" class="insights-rejection" data-tooltip="${esc(row.rejection)}" aria-label="Причина отклонения">${img('info',16)}</button>` : ''}</span>`;
    }
    const idBadge = (value, className = '') => `<button type="button" class="insights-id task-id-badge ${className}" data-insight-copy="${esc(value)}" aria-label="Скопировать ${esc(value)}"><span>${esc(value)}</span>${img('copy',16)}</button>`;
    const relatedButton = row => `<button type="button" class="count-badge cabinet-related-more" data-insight-related="${esc(row.id)}" aria-haspopup="dialog" aria-expanded="false" aria-label="Связанные процессы: ${row.related.length}">...</button>`;
    function metadata(row, card = false) {
      const first = row.related[0];
      return `<div class="insights-meta${card ? ' card-tags cabinet-insight-tags' : ''}">${window.BpmInsightPresentation.sourceBadge(row,'insights-source tag cabinet-source-tag')}${idBadge(row.id)}${img('direction',16,'insights-relation-arrow')}${card ? relatedButton(row) : `${first ? idBadge(first.code) : ''}${row.related.length > 1 ? relatedButton(row) : ''}`}</div>`;
    }
    const rating = row => `${row.previousRating != null ? `${number(row.previousRating)} ↓ ` : ''}${number(row.rating)}`;
    const ownerName = row => {const name=ownerDisplayName(row);return `<span class="insights-owner-name" title="${esc(name)}">${name.split(/\s+/).map(word => `<span>${esc(word)}</span>`).join(' ')}</span>`;};
    const ownerPortrait = row => {const name=ownerDisplayName(row);return name==='Система'||name==='SYS'?'SYS':window.BpmAvatars.portrait(name,`${row.id}:owner`);};
    const ownerAvatar = row => `<span class="${row.owner?'insights-owner-avatar avatar':'task-avatar cabinet-avatar'}" aria-hidden="true">${ownerPortrait(row)}</span>`;
    function tableRating(row) {
      const own = row.detail?.userRating ?? row.previousRating;
      if (!(own > 0)) return `<span>${number(row.rating)}</span>`;
      return `<span class="insights-rating-values" role="img" aria-label="Моя оценка: ${number(own)}; общая оценка: ${number(row.rating)}"><span aria-hidden="true">${number(own)}</span><span class="insights-rating-arrow" aria-hidden="true">${img('ratingArrow',16)}</span><span aria-hidden="true">${number(row.rating)}</span></span>`;
    }
    function card(row) {
      const owner = ownerDisplayName(row);
      return `<article class="entity-card cabinet-card cabinet-insight-card insights-card" data-insight-id="${esc(row.id)}" aria-label="${esc(row.title)}">
        <div class="card-header">${status(row,true)}${metadata(row,true)}</div><div class="card-body"><button type="button" class="card-title" data-insight-open="${esc(row.id)}" title="${esc(row.title)}">${esc(row.title)}</button><p class="card-description">${esc(row.description)}</p></div>
        <div class="card-footer"><div class="owner"><span class="task-avatar cabinet-avatar" aria-hidden="true">${ownerPortrait(row)}</span><span class="owner-name" title="${esc(owner)}">${esc(owner)}</span></div><div class="cabinet-feedback"><span class="cabinet-feedback-item" title="Оценка ${esc(rating(row))}">${img('star')}<span>${esc(rating(row))}</span></span><span class="cabinet-feedback-item" title="Комментарии: ${row.comments}">${img('comments')}<span>${row.comments}</span></span></div></div></article>`;
    }
    function table(rows, isLoading = false) {
      const columns = [['id','ID, Инсайт, источник, процесс'],['owner','Владелец КП / процесса'],['created','Дата создания'],['status','Статус'],['comments','Комментарии'],['rating','Рейтинг']];
      const [sortKey, direction] = state.sort.split('-');
      return `<div class="insights-table-wrap" tabindex="0" role="region" aria-label="Таблица инсайтов; на узком экране прокручивается горизонтально"><table class="insights-table"><colgroup><col><col style="width:240px"><col style="width:136px"><col style="width:153px"><col style="width:100px"><col style="width:100px"></colgroup><thead><tr>${columns.map(([key,label],index) => `<th scope="col"${sortKey === key ? ` aria-sort="${direction === 'desc' ? 'descending' : 'ascending'}"` : ''}><button type="button" data-insight-sort="${key}" aria-label="Сортировать: ${label}">${index === 4 ? img('comments') : index === 5 ? img('starOutline') : index === 1 ? '<span>Владелец<br>КП / процесса</span>' : copy(label)}${index < 4 && sortKey === key ? img('sort',16, direction === 'asc' ? 'is-ascending' : '') : ''}</button></th>`).join('')}</tr></thead><tbody>${isLoading ? skeletonRows(rows.length || Math.min(data.length,6) || 4) : rows.map(row => `<tr data-insight-id="${esc(row.id)}" class="insights-table-row${row.problem ? ' is-problem' : ''}"><td class="insights-main-cell"><button type="button" class="insights-row-title" data-insight-open="${esc(row.id)}">${esc(row.title)}</button><p class="insights-row-description">${esc(row.description)}</p>${metadata(row)}</td><td class="owner-cell"><div class="insights-owner">${ownerAvatar(row)}${ownerName(row)}</div></td><td class="date-cell"><time datetime="${row.created}">${date(row.created)}</time></td><td class="status-cell">${status(row)}</td><td class="comment-cell"><span class="insights-score">${img('comments')}<span>${row.comments}</span></span></td><td class="rating-cell"><span class="insights-score">${img('starOutline')}${tableRating(row)}</span></td></tr>`).join('')}</tbody></table></div>`;
    }
    function appliedFilters() {
      const groups = Object.entries(state.filters).filter(([,values]) => values.length).map(([key,values]) => ({key,label:labels[key],values}));
      if (state.query.trim()) groups.unshift({key:'query', label:'Поиск', values:[state.query]});
      if (state.from !== defaultPeriod.from || state.to !== defaultPeriod.to) groups.push({key:'date',label:'Даты создания',values:[state.from || state.to ? `${date(state.from)} → ${date(state.to)}` : 'Все даты']});
      if (state.attention) groups.push({key:'attention', label:'Ожидают', values:[state.attention === 'approval' ? 'Вашего согласования' : state.attention === 'decision' ? 'Вашего решения' : 'Вашего мнения']});
      $('insights-applied').hidden = !groups.length;
      $('insights-chips').innerHTML = groups.map(group => `<div class="applied-filter-group"><span class="applied-filter-label">${esc(group.label)}</span>${group.values.map(value => {
        const label = group.key === 'process' ? processOptionLabels.get(value) || value : value;
        return `<span class="chip applied-filter-chip"><span class="chip-text"${group.key === 'process' ? ` title="${copy(label)}"` : ''}>${copy(label)}</span><button type="button" data-insight-filter-key="${group.key}" data-insight-filter-value="${esc(value)}" aria-label="Убрать фильтр: ${copy(label)}">${img('close',16)}</button></span>`;
      }).join('')}</div>`).join('');
    }
    function render() {
      if (!active || activeId) return;
      closeRelations();
      updateAttention();
      $('insights-bank').hidden = !state.filters.source.includes('ТБ');
      const results = $('insights-results');
      const sortFocus = results.contains(document.activeElement) ? document.activeElement.closest('[data-insight-sort]')?.dataset.insightSort : null;
      const scrollFocus = document.activeElement === results.querySelector('.insights-table-wrap');
      const scrollLeft = results.querySelector('.insights-table-wrap')?.scrollLeft || 0;
      const rows = filteredRows();
      results.setAttribute('aria-busy',String(loading));
      results.classList.toggle('is-loading',loading);
      panel.classList.toggle('is-table',state.view === 'table');
      $('insights-sort').hidden = state.view === 'table';
      ['cards','table'].forEach(view => {$(`insights-${view}`).classList.toggle('selected',state.view === view); $(`insights-${view}`).setAttribute('aria-pressed',String(state.view === view));});
      $('insights-count').textContent = rows.length === data.length ? String(data.length) : `${rows.length} / ${data.length}`;
      $('insights-clear-search').hidden = !state.query;
      $('insights-date-summary').textContent = state.from || state.to ? `${date(state.from)} → ${date(state.to)}` : 'Все';
      panel.querySelectorAll('[data-insight-attention]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.insightAttention === state.attention)));
      if (loading) results.innerHTML = state.view === 'table' ? table(rows,true) : `<div class="cards-grid insights-grid skeleton-grid">${Array.from({length:rows.length || Math.min(data.length,6) || 4},() => window.BpmCabinetCards.skeleton('insights')).join('')}</div>`;
      else results.innerHTML = rows.length ? state.view === 'cards' ? `<div class="cards-grid insights-grid">${rows.map(card).join('')}</div>` : table(rows) : `<div class="insights-empty"><h2>Инсайты не найдены</h2><p>Измените поисковый запрос или сбросьте фильтры.</p><button type="button" class="button secondary-button" data-insight-reset>Сбросить фильтры</button></div>`;
      const tableScroll = results.querySelector('.insights-table-wrap');
      if (tableScroll) {tableScroll.scrollLeft = scrollLeft; if (sortFocus) results.querySelector(`[data-insight-sort="${sortFocus}"]`)?.focus({preventScroll:true}); else if (scrollFocus) tableScroll.focus({preventScroll:true});}
      // Criteria are updated at the start, not on completion: keep any chip
      // the user has focused during loading in the document.
      if (loading) appliedFilters();
      $('insights-announcement').textContent = loading ? 'Загрузка инсайтов…' : `Найдено инсайтов: ${rows.length}.`;
      if (!loading && restoreRecordFocus) {
        const target = results.querySelector(`[data-insight-open="${CSS.escape(restoreRecordFocus)}"]`);
        if (document.activeElement === $('insights-title')) (target || $('insights-search')).focus({preventScroll:true});
        restoreRecordFocus = null;
      }
    }
    function load() {
      clearTimeout(loadingTimer);
      if (!active || activeId) return;
      loading = true;
      render();
      // Match the existing registries; the latest filter/search restarts the
      // same timer, so an earlier request cannot replace newer results.
      loadingTimer = setTimeout(() => {
        if (!active) return;
        loading = false;
        render();
      },LOADING_DURATION);
    }
    function reset() {
      state.query = ''; state.attention = ''; Object.assign(state,defaultPeriod);
      $('insights-search').value = '';
      Object.keys(labels).forEach(key => {state.filters[key] = []; selects[key].set([]);});
      load();
    }
    function closeDate() {const previous = calendar; calendar = null; previous?.close(false);}
    function closePopups() {closeDate(); closeRelations(); api.closePopups();}
    function closeRelations(restoreFocus = false) {
      if (!relations) return;
      const anchor = relationAnchor;
      relations.remove(); relations = null; relationAnchor = null;
      anchor?.setAttribute('aria-expanded','false'); anchor?.removeAttribute('aria-controls');
      if (restoreFocus && anchor?.isConnected) {
        suppressRelationFocus = true;
        anchor.focus({preventScroll:true});
        suppressRelationFocus = false;
      }
    }
    function showRelations(anchor, focus = false) {
      if (loading) return;
      if (relationAnchor === anchor) {if (focus) relations?.querySelector('button')?.focus(); return;}
      closeRelations();
      const row = data.find(item => item.id === anchor.dataset.insightRelated);
      if (!row) return;
      relationAnchor = anchor;
      relations = document.createElement('div');
      relations.id = 'insights-relations-tooltip'; relations.className = 'insights-relations-tooltip'; relations.setAttribute('role','dialog'); relations.setAttribute('aria-label','Связанные процессы');
      relations.innerHTML = `<p>Связан с ${row.related.length} процессами:</p>${row.related.map(item => `<div class="insights-related-row">${idBadge(item.code)}<button type="button" data-insight-process="${esc(item.id)}" title="${copy(item.title)}">${copy(item.title)}</button></div>`).join('')}<img class="insights-tooltip-arrow" src="${assets.arrow}" width="24" height="8" alt="">`;
      document.body.append(relations); anchor.setAttribute('aria-expanded','true'); anchor.setAttribute('aria-controls',relations.id);
      const rect = anchor.getBoundingClientRect(), box = relations.getBoundingClientRect(), margin = 12;
      const top = rect.top - box.height - 8 >= margin;
      const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - box.width / 2, innerWidth - box.width - margin));
      relations.style.left = `${left}px`; relations.style.top = `${top ? rect.top - box.height - 8 : Math.min(rect.bottom + 8, innerHeight - box.height - margin)}px`;
      relations.classList.toggle('is-below',!top);
      relations.style.setProperty('--insights-arrow-left', `${Math.max(20,Math.min(box.width - 44,rect.left + rect.width / 2 - left - 12))}px`);
      relations.addEventListener('click',event => {
        const copy = event.target.closest('[data-insight-copy]');
        if (copy) {api.copyText(copy.dataset.insightCopy); return;}
        const process = event.target.closest('[data-insight-process]');
        if (process) {const trigger = relationAnchor; const id = process.dataset.insightProcess; closePopups(); api.openProcess(id,trigger);}
      });
      relations.addEventListener('pointerleave',event => {if (!relationAnchor?.contains(event.relatedTarget) && !relations?.contains(document.activeElement)) closeRelations();});
      if (focus) relations.querySelector('button')?.focus({preventScroll:true});
    }
    panel.addEventListener('click',event => {
      const tabClose = event.target.closest('[data-insight-tab-close]'); if (tabClose) {closeTab(tabClose.dataset.insightTabClose); return;}
      const tab = event.target.closest('[data-insight-tab]'); if (tab) {openInsight(tab.dataset.insightTab); return;}
      const copy = event.target.closest('[data-insight-copy]'); if (copy) {api.copyText(copy.dataset.insightCopy); return;}
      const related = event.target.closest('[data-insight-related]'); if (related) {showRelations(related,true); return;}
      const attention = event.target.closest('[data-insight-attention]'); if (attention) {state.attention = state.attention === attention.dataset.insightAttention ? '' : attention.dataset.insightAttention; load(); return;}
      const sort = event.target.closest('[data-insight-sort]'); if (sort) {const key = sort.dataset.insightSort; state.sort = `${key}-${state.sort === `${key}-asc` ? 'desc' : 'asc'}`; selects.sort.set([state.sort]); load(); return;}
      const chip = event.target.closest('[data-insight-filter-key]'); if (chip) {
        const key = chip.dataset.insightFilterKey;
        if (key === 'query') {state.query = ''; $('insights-search').value = '';}
        else if (key === 'date') Object.assign(state,defaultPeriod);
        else if (key === 'attention') state.attention = '';
        else {state.filters[key] = state.filters[key].filter(value => value !== chip.dataset.insightFilterValue); selects[key].set(state.filters[key]);if(key==='source'&&!state.filters.source.includes('ТБ')){state.filters.bank=[];selects.bank.set([]);}}
        load(); $('insights-search').focus({preventScroll:true}); return;
      }
      if (event.target.closest('[data-insight-reset]')) {reset(); return;}
      const create = event.target.closest('#insights-create'); if (create) {closePopups(); creator.open(create); return;}
      const open = event.target.closest('[data-insight-open]');
      const record = event.target.closest('.insights-card, .insights-table-row');
      if (open || record && !event.target.closest('button,a,input,select,textarea') && !window.getSelection()?.toString()) openRecord(open?.dataset.insightOpen || record.dataset.insightId);
    });
    panel.addEventListener('pointerover',event => {const anchor = event.target.closest('[data-insight-related]'); if (anchor && !anchor.contains(event.relatedTarget)) showRelations(anchor);});
    panel.addEventListener('pointerout',event => {const anchor = event.target.closest('[data-insight-related]'); if (anchor && !anchor.contains(event.relatedTarget) && !relations?.contains(event.relatedTarget) && !relations?.contains(document.activeElement)) closeRelations();});
    panel.addEventListener('focusin',event => {if (event.target.matches('.select-input')) {closeDate(); closeRelations();} const anchor = event.target.closest('[data-insight-related]'); if (anchor && !suppressRelationFocus) showRelations(anchor);});
    document.addEventListener('focusin',event => {if (relations && !relations.contains(event.target) && !relationAnchor?.contains(event.target)) closeRelations();});
    document.addEventListener('pointerdown',event => {if (relations && !relations.contains(event.target) && !relationAnchor?.contains(event.target)) closeRelations();});
    document.addEventListener('keydown',event => {if (event.key === 'Escape' && relations) {event.preventDefault(); closeRelations(true);}});
    window.addEventListener('scroll',() => closeRelations(),true);
    window.addEventListener('resize',() => closeRelations());
    $('insights-search').addEventListener('input',event => {state.query = event.target.value; load();});
    $('insights-clear-search').addEventListener('click',() => {state.query = ''; $('insights-search').value = ''; load(); $('insights-search').focus();});
    $('insights-reset').addEventListener('click',() => {reset(); $('insights-search').focus();});
    ['cards','table'].forEach(view => $(`insights-${view}`).addEventListener('click',() => {if (activeId) {state.view = view; showRegistry();} else if (state.view !== view) {closePopups(); state.view = view; load();}}));
    $('insights-date').addEventListener('click',() => {
      if (calendar) {closeDate(); return;}
      api.closePopups(); closeRelations();
      calendar = window.BpmCalendar.open({anchor:$('insights-date'), from:state.from, to:state.to, onApply:period => {Object.assign(state,period); load();}, onClose:() => {calendar = null;}});
    });
    $('insights-export').addEventListener('click',() => {closePopups(); exportDialog.showModal();});
    exportDialog.querySelectorAll('[data-insight-export-close]').forEach(button => button.addEventListener('click',() => exportDialog.close()));
    exportDialog.addEventListener('click',event => {if (event.target !== exportDialog) return; const r = exportDialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) exportDialog.close();});
    $('insights-export-form').addEventListener('submit',event => {
      event.preventDefault();
      const scope = new FormData(event.currentTarget).get('insights-export-scope');
      const rows = scope === 'filtered' ? filteredRows() : [...data];
      const headers = ['ID','Инсайт','Описание','Источник','Процессы','Владелец','Автор','Блок','Подразделение','Продукт','Клиентский путь','Тер. банк','Дата создания','Статус','Комментарии','Оценка'];
      const cells = row => [row.id,row.title,row.description,row.source,row.related.map(item => `${item.code} ${item.title}`).join('; '),row.owner,row.author,row.block,row.division,row.product,row.path,row.bank,date(row.created),row.status,row.comments,number(row.rating)];
      const lines = scope === 'variants' ? rows.flatMap(row => row.related.flatMap(process => process.variants.map(variant => [...cells(row),process.code,process.title,variant]))) : rows.map(cells);
      if (scope === 'variants') headers.push('ID процесса','Процесс','Вариант результата процесса');
      const cell = value => '"' + String(value ?? '').replace(/^[\s]*[=+@-]/,"'$&").replace(/"/g,'""') + '"';
      const csv = '\uFEFF' + [headers,...lines].map(row => row.map(cell).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
      const link = document.createElement('a'); link.href = url; link.download = `Sber-BPM-insights-${scope}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),5000);
      exportDialog.close(); api.toast(`Экспортировано строк: ${lines.length}`,{success:true});
    });
    return {
      enter() {
        closeCabinetDrawer({immediate:true,restoreFocus:false});
        data = store.list(); active = true; panel.hidden = false; renderTabs();
        if (activeId) {
          window.scrollTo({top:0,behavior:'instant'}); detail.show(activeId,{preserveDraft:true});
          detail.setScrollTop(tabScroll.get(activeId) || 0);
        } else load();
      },
      leave() {
        if (activeId) tabScroll.set(activeId,detail.getScrollTop());
        detail.hide(); active = false; document.body.classList.remove('insight-tab-open');
        clearTimeout(loadingTimer); loading = false;
        $('insights-results').setAttribute('aria-busy','false'); $('insights-results').classList.remove('is-loading');
        closePopups(); approval.close({immediate:true,restoreFocus:false,silent:true});creator.close({immediate:true,restoreFocus:false});
        if (exportDialog.open) exportDialog.close(); panel.hidden = true;
        window.BpmInsightTabsDock?.refresh();
      },
      focusSearch() {if (activeId) showRegistry({focus:false}); $('insights-search').scrollIntoView({block:'center'}); $('insights-search').focus({preventScroll:true});},
      getRows:filteredRows, isActive:() => active, openInsight, openCabinetInsight, closeCabinetDrawer,
      taskCreated(id,taskId) {detail.taskCreated(id,taskId);renderTabs();},
      openCreate(trigger) {closePopups();creator.open(trigger);}
    };
  }
  window.BpmInsights = Object.freeze({create});
})();

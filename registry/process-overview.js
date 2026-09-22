(function () {
  'use strict';

  // Process Details/Content (894:6): composition from the corrected Figma library.
  function render(row, u) {
    const { esc, icon, tag, section } = u;
    const sourceRecord=row.source==='xlsx';
    const favorite = typeof u.isFavorite === 'function' ? u.isFavorite(row) : Boolean(u.isFavorite);
    const recordId = `П${row.number || '0067'}`;
    const title = row.title || 'Изменение лимита кредита по кредитной карте по инициативе клиента';
    const field = (label, value) => `<div class="pd-overview-field"><p class="pd-field-label">${esc(label)}</p><div>${value}</div></div>`;
    const demo = (text, message = 'Этот переход показан в макете. Подключение сервиса пока не настроено.') => `<button type="button" class="pd-inline-link" data-pd-demo="${esc(message)}">${esc(text)}</button>`;
    const dot = '<span class="pd-status-dot" aria-hidden="true"></span>';
    const person = (name, position, training = false) => `<div class="pd-person"><span class="pd-person-avatar">${icon('imgIcon24Person')}</span><div class="pd-person-copy"><p>${esc(name)}</p><p class="pd-person-position">${esc(position)}</p>${training ? tag('Обучение пройдено', 'green', 'imgIcon') : ''}</div></div>`;
    const date = row.date ? new Date(`${row.date}T12:00:00`).toLocaleDateString('ru-RU') : sourceRecord?'Не указана':'26.11.2018';
    const period = (kind, label) => `<div class="pd-period" data-pd-period="${kind}"><button type="button" class="pd-period-button" data-pd-action="period-prev" data-pd-period-kind="${kind}" aria-label="Предыдущий ${kind === 'month' ? 'месяц' : 'год'}">${icon('imgChevronLeft', 'pd-chevron-left')}</button><span data-pd-period-label>${label}</span><button type="button" class="pd-period-button" data-pd-action="period-next" data-pd-period-kind="${kind}" aria-label="Следующий ${kind === 'month' ? 'месяц' : 'год'}">${icon('imgChevronRight', 'pd-chevron-right')}</button></div>`;

    const heading = `<header class="pd-process-heading"><div class="pd-heading-labels"><button type="button" class="pd-id-badge" data-pd-action="copy" data-pd-copy="${esc(recordId)}" aria-label="Скопировать ID ${esc(recordId)}">${esc(recordId)}${icon('imgIcon16Copy', 'pd-icon-16')}</button>${(row.tags || ['ТОП 200', 'AI']).map(value => tag(value)).join('')}</div><div class="pd-title-actions"><h1 id="pd-title">${esc(title)}</h1><div class="pd-process-actions"><button type="button" class="pd-action-button pd-favorite-button" data-pd-action="favorite" aria-pressed="${favorite}" aria-label="${favorite ? 'Удалить из избранного' : 'Добавить в избранное'}">${icon(favorite ? 'liked' : 'dont-like')}</button><button type="button" class="pd-action-button" data-pd-action="export" aria-label="Сохранить деталку в PDF">pdf ↓</button><button type="button" class="pd-action-button" data-pd-action="print">${icon('imgIcon24Print')}<span>Печать</span></button></div></div></header>`;

    const alerts = `<div class="pd-overview-notices"><div class="pd-ai-summary"><span class="pd-ai-badge">${icon('imgAiStars')}</span><p>Процесс демонстрирует рост эффективности на 6% ↑, в то время как КП1253 и КП00714 — снижение на 5% ↓ и 7% ↓ соответственно.</p></div><div class="pd-context-warning">${icon('imgIcon16Info1', 'pd-icon-16')}<p>Не для всех <a class="pd-inline-link" href="#pd-documents">бизнес-описаний ↓</a> выделен вариант предоставления результата. Для каждого БО должен быть выделен хотя бы один вариант. <a class="pd-inline-link" href="#pd-monitoring">Добавьте новый вариант ↓</a> или привяжите бизнес-описание к существующему варианту.</p></div><div class="pd-context-warning">${icon('imgIcon16Info1', 'pd-icon-16')}<p>Вам <a class="pd-inline-link" href="#pd-monitoring">необходимо подтвердить</a>, что выделены все варианты предоставления результата процесса, покрывающие 100% экземпляров процесса</p></div></div>`;

    const organization = `<article class="pd-overview-panel pd-organization">${field('Подразделение', sourceRecord?`${esc(row.block)}<br>${esc(row.division)}`:`Блок «${esc(row.block || 'Транзакционный банкинг B2C')}»<br>Дивизион «${esc(row.division || 'Кредитные карты')}»`)}${field('Статус в реестре', sourceRecord?'Не указан в источнике':`<span class="pd-field-status">${dot}<span>Подтвержден, создан ${esc(date)}</span></span>`)}${field('Статус исполнения', sourceRecord?'Не указан в источнике':`<span class="pd-field-status">${dot}<span>${esc(row.status || 'Исполняется')}, установлен ${esc(date)}</span></span>`)}${field('Актуальность бизнес-описания', sourceRecord?'Не указана в источнике':`<span class="pd-field-status">${dot}<span>Подписан, 01.02.2026<br>Иванов Сергей Иванович</span></span>`)}<p class="pd-small-muted">Процесс ПАО Сбербанк</p></article>`;
    const metadata = `<article class="pd-overview-panel pd-metadata-panel">${field('Документ, утвердивший выделение', '1/КП/Пот 13.01.2026')}${field('Тип результата', esc(row.type || 'Услуга'))}${field('Тип клиента', 'Внешний')}${field('Технологический процесс', `<div class="pd-overview-tags">${Array.from({ length: 11 }, (_, i) => tag(`ТП${i + 1}`)).join('')}</div>`)}${field('Вид информации', 'КТ, БТ, ДСП, ПДН')}<p class="pd-info-caption">${icon('imgIcon16Info', 'pd-icon-16')}<span>Присутствуют регуляторные риски</span></p><p class="pd-info-caption">${icon('imgIcon16Info', 'pd-icon-16')}<span>Инсайдерская информация отсутствует</span></p></article>`;
    const efficiency = `<article class="pd-overview-panel pd-efficiency-widget" data-pd-motion-group="efficiency"><div class="pd-widget-heading"><p>Эффективность</p><p class="pd-widget-value"><span data-pd-motion-number="50%">50%</span></p></div><div class="pd-sphere-viewport" role="img" aria-label="Эффективность 50 процентов"><div class="pd-large-sphere">${icon('imgSphereFixedPosition', 'pd-sphere-image')}<div class="pd-sphere-curtain"></div></div></div>${period('month', 'Сентябрь, 2026')}</article>`;
    const bars = [22, 59, 101, 46, 59, 59, 59, 93, 101, 29.5, 68.251, 3];
    const dynamics = `<article class="pd-overview-panel pd-dynamics-widget" data-pd-motion-group="dynamics"><div class="pd-widget-heading"><p>Динамика</p><p class="pd-widget-value pd-dynamics-value"><span data-pd-motion-number="0,5%">0,5%</span>${icon('imgTrend')}</p></div><div class="pd-dynamics-plot" role="img" aria-label="Динамика эффективности за 2026 год, 12 месяцев; изменение 0,5 процента"><div class="pd-dynamics-bars">${bars.map((height, i) => `<span class="pd-dynamics-bar ${i === 0 ? 'pd-dynamics-negative' : i === 3 ? 'pd-dynamics-warning' : i > 8 ? 'pd-dynamics-empty' : ''}" style="height:${height}px;--pd-bar-index:${i}"></span>`).join('')}</div><div class="pd-dynamics-labels"><span>янв</span><span>сен</span></div></div>${period('year', '2026')}</article>`;

    const starts = [
      'Идентифицированный и/или аутентифицированный клиент обратился для изменения лимита кредита по кредитной карте',
      'Идентифицированный и/или аутентифицированный Клиент обратился для активации лимита кредита по кредитной карте',
      'Прошло 30 календарных дней с даты принятия Банком кредитного решения по заявке (Дополнительное соглашение не подписано)'
    ];
    const ends = ['Лимит кредита по кредитной карте изменен', 'Лимит кредита по кредитной карте не изменен', 'Заявка на изменение лимита кредита оформлена'];
    const boundaryList = (label, entries) => `<div><h4>${label}</h4><ol class="pd-boundary-list">${entries.map((entry, index) => `<li>${index + 1}. ${esc(entry)}</li>`).join('')}</ol></div>`;
    const roles = [
      ['Клиент-физическое лицо', 'Клиентские роли'],
      ['Наименование роли, участвующей в процессе с длинным названием в несколько строк размещается вот таким образом', 'Клиентские роли'],
      ['Специалист, обслуживающий клиентов в физической сети', 'Обобщённая роль']
    ];
    const about = `<section class="pd-about-panel" aria-label="О процессе"><div class="pd-people-grid"><div><h3>Владелец</h3>${person(row.owner || 'Бондарь Леонид Васильевич', 'Начальник отдела')}</div><div class="pd-experts"><h3>Эксперты</h3><div class="pd-experts-grid">${person('Иванец Анна Владимировна', 'Руководитель направления')}${person('Шаститко Татьяна Владимировна', 'Инженер')}</div></div><div><h3>Аналитики ProcessMining</h3>${person('Иванов Иван Иванович', 'Начальник отдела', true)}</div></div><div class="pd-about-group"><h3>Границы процесса</h3><p class="pd-muted">Вход процесса — событие, с которого начинается процесс. Выход процесса — событие, которым завершается процесс и фиксируется результат.</p><div class="pd-boundaries-grid">${boundaryList('Начало', starts)}${boundaryList('Окончание', ends)}</div></div><div class="pd-about-group"><h3>Роли, участвующие в исполнении процесса <span class="pd-counter">3</span></h3><p class="pd-muted">Роль — совокупность компетенций, обладая которыми исполнитель процесса может выполнять свои функции</p><div class="pd-roles">${roles.map(([name, group]) => `<div class="pd-role-row"><p>${esc(name)}</p><p class="pd-muted">${esc(group)}</p></div>`).join('')}</div></div><div class="pd-about-group"><h3>Связи с клиентскими путями</h3><div class="pd-related-journey"><button type="button" class="pd-id-badge" data-pd-action="copy" data-pd-copy="КП00308" aria-label="Скопировать ID КП00308">КП00308${icon('imgIcon16Copy', 'pd-icon-16')}</button>${demo('Кредитная карта')}</div></div></section>`;

    const systems = [
      ['ЕФС ФЛ СБОЛ Про', 'ЕФС.ФЛ.Группа каналов УКО', 'ЕФС.ФЛ.СБОЛпро.ФП БИПО', 'ЕФС.ФЛ.УКО.БИПО', 'ЕФС.DBL.Профиль ФЛ', 'ЕФС.ФЛ.СБОЛпро.ФП БИПО'],
      ['ППК Навигатор', 'ППРБ Единый кредитный портфель', 'ППРБ РБ Управление согласиями клиентов', 'Транзакционные кредитные продукты']
    ];
    const ai = [
      ['imgAiHeading2', 'Название модели 1 строка'],
      ['imgAiHeading2', 'Извлечения Авансов и отсрочек из тендерной документации при помощи LLM v2'],
      ['imgAiHeading3', 'Название агента в 1 строку'],
      ['imgAiHeading3', 'Сервис для построения промптов для GigaChat для оценки планов работ ЗНИ']
    ];
    const operations = [['imgLegendDot', 'Автоматические', '82.05%'], ['imgLegendDot1', 'Пользовательские', '13.68%'], ['imgDot', 'Ручные', '4.27%']];
    const technology = `<div class="pd-technology-grid"><div class="pd-technology-systems"><h3>АС, задействованные в процессе <span class="pd-counter">21</span></h3><div class="pd-system-columns">${systems.map(list => `<ul class="pd-technology-list">${list.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`).join('')}</div></div><div class="pd-technology-ai"><h3 class="pd-ai-list-heading"><span>AI –</span>${icon('imgAiHeading2')}<span>модели <span class="pd-counter">2</span></span><span>и</span>${icon('imgAiHeading3')}<span>агенты <span class="pd-counter">2</span></span></h3><ul class="pd-technology-list pd-ai-list">${ai.map(([glyph, text]) => `<li>${icon(glyph)}<span>${esc(text)}</span></li>`).join('')}</ul></div><div class="pd-technology-operations"><h3>Операции <span class="pd-counter">234</span></h3><div class="pd-operation-chart" role="img" aria-label="Операции: автоматические 82,05%, пользовательские 13,68%, ручные 4,27%"><span class="pd-operation-auto"></span><span class="pd-operation-user"></span><span class="pd-operation-manual"></span></div><ul class="pd-technology-list pd-operation-legend">${operations.map(([glyph, name, value]) => `<li>${icon(glyph, 'pd-legend-dot')}<span>${name} <span class="pd-muted">|</span> ${value}</span></li>`).join('')}</ul></div></div>`;

    return `<div id="pd-about" class="pd-overview-block">${heading}${alerts}<div class="pd-overview-grid">${organization}${metadata}${efficiency}${dynamics}</div>${about}</div>${section('technology', 'Технологические компоненты процесса', null, technology, { className: 'pd-technology-section' })}`;
  }

  window.BpmProcessOverview = { render };
}());

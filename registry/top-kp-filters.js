/* ТОП-КП filter model. Excel names and hierarchy remain authoritative.
 * The workbook has no organisational blocks or metric/maturity metadata:
 * those fields are deterministic, explicitly synthetic prototype examples.
 * Demo blocks are single labels (B2B/B2C are not inferred parent categories).
 * Internal metrics are normalised quality scores, not counts of errors/calls.
 * Efficiency is supplied by the existing ТОП-КП score renderer, never copied
 * into or recomputed from the immutable Excel records by this module.
 */
(() => {
  'use strict';

  const blockNames = [
    'B2B',
    'B2C',
    'Блок "Сервисы"',
    'Блок "Сеть продаж"',
    'Блок "Транзакционный банкинг B2C"',
    'Подразделения вне блоков экосистемы B2C',
    'Блок "Управление благосостоянием"',
    'Блок "Развитие клиентского опыта B2C"',
    'Блок "Корпоративно-инвестиционный бизнес"',
    'Подразделения вне блоков',
    'Блок "Финансы"',
    'Блок "Технологии"',
    'Блок "GR, правовые вопросы, комплаенс и ДЗО"',
    'Блок "Люди и культура"',
    'Блок "Риски"',
    'Блок "Стратегия и развитие"',
    'Блок "Технологическое развитие"',
    'Прямое подчинение Президенту',
    'Блок "Sberbank International"',
    'Блок "Строительство"'
  ];
  const sspNames = [
    'Банковские счета',
    'Безопасность',
    'Бренд и маркетинг',
    'Документооборот и архив',
    'Закупки',
    'Здания, сооружения, ТМЦ',
    'Карты',
    'Контакт-центр',
    'Кредиты',
    'ЛиК',
    'Лояльность',
    'Обслуживание УС',
    'Привлечение денежных средств',
    'Проблемные активы',
    'Рекомендательные системы',
    'Риски',
    'Розничный бизнес',
    'Стратегия и модель управления',
    'Технологии',
    'Транзакции',
    'Управление благосостоянием',
    'Управление клиентами',
    'Физические каналы',
    'Финансы',
    'Цифровой канал',
    'ЮЛ',
    'GR'
  ];
  const options = rows => Object.freeze(rows.map(row => Object.freeze(
    typeof row === 'string' ? {value: row, label: row} : row
  )));
  const statuses = options([
    {value:'leader', label:'Лидер'},
    {value:'on-track', label:'On track'},
    {value:'lagging', label:'Есть отставания'},
    {value:'critical', label:'Критическое отставание'},
    {value:'no-data', label:'Нет данных'}
  ]);
  const availability = options([{value:'yes', label:'Есть'}, {value:'no', label:'Нет'}]);
  const fields = Object.freeze([
    {key:'block', label:'Блоки', group:'structure', options:options(blockNames)},
    {key:'ssp', label:'ССП', group:'structure', options:options(sspNames)},
    {key:'efficiency', label:'Эффективность', group:'efficiency', options:statuses},
    {key:'csat', label:'CSAT/CSI', group:'internal', options:statuses},
    {key:'techErrors', label:'Технические ошибки', group:'internal', options:statuses},
    {key:'appeals', label:'Обращения', group:'internal', options:statuses},
    {key:'variability', label:'Вариативность', group:'internal', options:statuses},
    {key:'pm', label:'PM', group:'maturity', options:availability},
    {key:'benchmarking', label:'Бенчмаркинг', group:'maturity', options:availability},
    {key:'gemba', label:'Гемба', group:'maturity', options:availability}
  ].map(Object.freeze));
  const allowed = new Map(fields.map(field => [field.key, new Set(field.options.map(option => option.value))]));

  const normalise = value => String(value ?? '').trim().replace(/\s+/g, ' ').replace(/[–—-]/g, ' ').replace(/ё/g, 'е').toLocaleLowerCase('ru');
  const canonicalSsp = new Map(sspNames.map(name => [normalise(name), name]));
  // Resolve the workbook's spelling variants for matching only. Neither its
  // visible headings nor sourceName, division or group fields are rewritten.
  canonicalSsp.set(normalise('Физически каналы'), 'Физические каналы');
  canonicalSsp.set(normalise('Управление багосостоянием'), 'Управление благосостоянием');
  canonicalSsp.set(normalise('Превлечение денежных средств'), 'Привлечение денежных средств');
  const sspLabel = value => canonicalSsp.get(normalise(value)) || String(value).trim();

  function hash(value) {
    let result = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 0x01000193);
    }
    // Mix the low bits too, so independently salted yes/no fields do not
    // accidentally become identical/complementary for every source record.
    result ^= result >>> 16;
    result = Math.imul(result, 0x7feb352d);
    result ^= result >>> 15;
    result = Math.imul(result, 0x846ca68b);
    return (result ^ (result >>> 16)) >>> 0;
  }
  const cache = new WeakMap();
  const sampleScores = Object.freeze([null, 27, 52, 74, 93]);
  function metadata(record) {
    if (!record || typeof record !== 'object') throw new TypeError('ТОП-КП metadata requires a record');
    if (cache.has(record)) return cache.get(record);
    const identity = String(record.id || record.sourceCell || record.title || 'unknown');
    const seed = field => hash(`top-kp-filters:v1:${identity}:${field}`);
    const metric = field => sampleScores[seed(field) % sampleScores.length];
    const present = field => seed(field) % 2 ? 'yes' : 'no';
    const result = Object.freeze({
      block: blockNames[seed('block') % blockNames.length],
      ssp: Object.freeze([...new Set([record.division, record.group].filter(Boolean).map(sspLabel))]),
      csat: metric('csat'),
      techErrors: metric('techErrors'),
      appeals: metric('appeals'),
      variability: metric('variability'),
      pm: present('pm'),
      benchmarking: present('benchmarking'),
      gemba: present('gemba'),
      synthetic: true
    });
    cache.set(record, result);
    return result;
  }

  function statusFor(score) {
    if (score == null || (typeof score === 'string' && !score.trim())) return 'no-data';
    const value = typeof score === 'number' || typeof score === 'string' ? Number(score) : NaN;
    if (!Number.isFinite(value)) return 'no-data';
    return value >= 85 ? 'leader' : value >= 65 ? 'on-track' : value >= 45 ? 'lagging' : 'critical';
  }

  function matches(record, state = {}, efficiency = record?.efficiency) {
    if (!record || typeof record !== 'object') return false;
    let meta;
    return fields.every(field => {
      const selected = state?.[field.key];
      if (selected == null || selected === '') return true;
      if (!allowed.get(field.key).has(selected)) return false;
      if (field.key === 'efficiency') return statusFor(efficiency) === selected;
      meta ||= metadata(record);
      if (field.key === 'ssp') return meta.ssp.includes(selected);
      if (field.group === 'internal') return statusFor(meta[field.key]) === selected;
      return meta[field.key] === selected;
    });
  }

  window.BpmTopKpFilters = Object.freeze({fields, metadata, matches, statusFor});
})();

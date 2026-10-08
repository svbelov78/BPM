/* BRD-007 p.69 → Nordic semantic status tokens. Shared by all insight views. */
(() => {
  'use strict';
  const esc = value => window.BpmTaskVisuals.escape(value);
  const date = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0,10).split('-').reverse().join('.') : String(value || '');
  const source = row => row.source === 'ТБ' ? `ТБ · ${row.bank || 'Банк не указан'}` : row.source || 'Источник не указан';
  const sourceBadge = (row, className = '', id = '') => {
    const text = esc(source(row));
    return `<span class="${esc(className)} insight-source-badge"${id ? ` id="${esc(id)}"` : ''} title="${text}"><span class="insight-source-text">${text}</span></span>`;
  };
  function status(row, includeDate = false) {
    const label = window.BpmInsightWorkflow.canonicalize(row.status);
    const tone = window.BpmInsightWorkflow.statusMetadata[label]?.tone || 'blue';
    return `<span class="insight-status" data-insight-status="${esc(label)}"><span class="insight-status-dot insight-status-${esc(tone)}" aria-hidden="true"></span><span>${esc(label)}${includeDate ? ` | ${esc(date(row.created))}` : ''}</span></span>`;
  }
  window.BpmInsightPresentation = Object.freeze({status,source,sourceBadge,date});
})();

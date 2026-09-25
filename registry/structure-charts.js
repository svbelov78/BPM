/* Structure Chart 1 / 2, Figma 994:4939 and 993:4666 (23.09.2026).
 * Rendering stays independent of the registry state. The registry owns viewport
 * observation and updates data-structure-number / data-fill during animation.
 */
(() => {
  'use strict';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const format = value => Number(value).toLocaleString('ru-RU');
  const count = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const colors = [
    {label: 'Лидеры · >85%', color: '#34c759'},
    {label: 'On track · >65–85%', color: 'var(--efficiency-on-track-gradient)'},
    {label: 'Есть отставания · >45–65%', color: '#ffcc00'},
    {label: 'Критическое отставание · ≤45%', color: '#ff383c'},
    {label: 'Не оценивались', color: 'var(--efficiency-unrated-fill)'}
  ];

  function layout(buckets, maxima, type = '1') {
    const normalized = String(type) === '2';
    const counts = Array.from({length: 5}, (_, index) => count(buckets?.[index]));
    const leaders = Array.from({length: 5}, (_, index) => count(maxima?.[index]));
    const gap = normalized ? 4 : 8, plotWidth = normalized ? 364 : 363;
    const total = counts.reduce((sum, value) => sum + value, 0);
    const maximumSum = leaders.reduce((sum, value) => sum + value, 0);
    const indices = counts.map((_, index) => index).filter(index => !normalized || counts[index] > 0);
    const available = plotWidth - gap * Math.max(0, indices.length - 1);

    return {plotWidth, gap, segments: indices.map(index => ({
      index,
      count: counts[index],
      width: normalized
        ? available * counts[index] / total
        : maximumSum ? available * leaders[index] / maximumSum : available / indices.length,
      ratio: normalized ? 1 : leaders[index] ? Math.min(1, counts[index] / leaders[index]) : 0
    }))};
  }

  function render({id, buckets, maxima, type = '1', colors: palette = colors, entity = 'processes', total, done = false, ariaLabel} = {}) {
    type = String(type) === '2' ? '2' : '1';
    const counts = Array.from({length: 5}, (_, index) => count(buckets?.[index]));
    const value = total == null ? counts.reduce((sum, item) => sum + item, 0) : count(total);
    const label = ariaLabel || `${type === '2' ? 'Соотношение эффективности, доли от суммы' : 'Сравнение с лидером, общий масштаб'}. Всего ${entity === 'paths' ? 'клиентских путей' : 'процессов'}: ${value}. ${counts.map((item, index) => `${palette[index]?.label || colors[index].label}: ${item}`).join('; ')}.`;
    const segments = layout(counts, maxima, type).segments.map(({index, count: amount, width, ratio}) => {
      // Figma's normalized gradient transform, evaluated at the current track's
      // aspect ratio. Both chart types now use 22 px bars. scaleX below preserves
      // the same normalized gradient in the shorter, animated foreground fill.
      const angle = 180 + Math.atan(0.49416935443878174 * 22 / (1.0028730630874634 * Math.max(width, Number.EPSILON))) * 180 / Math.PI;
      const color = index === 1
        ? `linear-gradient(${angle}deg,var(--efficiency-on-track-start) 16.697%,var(--efficiency-on-track-end) 83.495%)`
        : palette[index]?.color || colors[index].color;
      const progress = done ? ratio : 0;
      return `<span class="structure-segment" data-count="${amount}" data-bucket="${index}" style="flex:0 0 ${width}px;--segment-color:${escape(color)}" title="${escape(palette[index]?.label || colors[index].label)}: ${amount}"><span class="structure-segment-count" data-structure-number="${amount}">${done ? format(amount) : '0'}</span><span class="structure-track"${index === 4 ? ` style="--structure-fill-ratio:${progress}"` : ''}><span class="structure-fill" data-fill="${ratio}" style="transform:scaleX(${progress})"></span></span></span>`;
    }).join('');
    return `<span class="structure-chart-scroll"><span class="structure-chart" data-chart="${escape(id)}" data-chart-type="${type}" role="img" aria-label="${escape(label)}"><strong class="structure-total" data-structure-number="${value}" aria-hidden="true">${done ? format(value) : '0'}</strong><span class="structure-bars" aria-hidden="true">${segments}</span></span></span>`;
  }

  // Use the same filtered, unique entities that form the five segments. Averaging
  // child-node averages would count multi-product processes more than once.
  // Missing scores are not zero; actual zero scores are valid observations.
  function average(records = []) {
    const seen = new Set();
    const unique = records.filter(row => {
      if (!row || typeof row !== 'object') return false;
      if (row.id == null) return true;
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
    const assessed = unique.filter(row => Number.isFinite(row.efficiency) && row.efficiency >= 0 && row.efficiency <= 100);
    const value = assessed.length ? assessed.reduce((sum, row) => sum + row.efficiency, 0) / assessed.length : null;
    return {value, score: value === null ? null : Math.round(value), assessed: assessed.length, total: unique.length, unassessed: unique.length - assessed.length};
  }

  function renderAverage({id, records = [], done = false} = {}) {
    const result = average(records), available = result.score !== null;
    const score = available && done ? result.score : 0;
    // Classification uses the raw mean, not the rounded/animated display value.
    // Keep the same method boundaries as the adjacent distribution chart.
    const tone = !available ? 'unrated' : result.value > 85 ? 'green' : result.value > 65 ? 'gray' : result.value > 45 ? 'yellow' : 'red';
    const description = available
      ? `Средняя эффективность: ${format(result.score)}%. Оценено ${format(result.assessed)} из ${format(result.total)}; без оценки: ${format(result.unassessed)}.`
      : 'Средняя эффективность: нет оценённых сущностей.';
    const sphere = window.BpmCardVisuals.glyph(result.value, false, {color: tone === 'gray' ? 'blue' : tone});
    return `<span class="structure-average efficiency${available ? '' : ' is-unrated'}" data-average-chart="${escape(id)}" data-average-value="${result.score ?? ''}" data-average-tone="${tone}" role="img" aria-label="${escape(description)}" title="${escape(description)}">${sphere}<span class="efficiency-value" aria-hidden="true"><span data-average-number>${available ? format(score) : '—'}</span>${available ? '<span class="percent">%</span>' : ''}</span></span>`;
  }

  function writeAverage(chart, progress) {
    if (chart.dataset.averageValue === '') return;
    const value = Number(chart.dataset.averageValue) * Math.max(0, Math.min(1, progress));
    chart.querySelector('[data-average-number]').textContent = format(Math.round(value));
  }

  window.BPMStructureCharts = Object.freeze({layout, render, average, renderAverage, writeAverage});
})();

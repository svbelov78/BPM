/* Skeleton geometry from Cards/Process, State=Loading (Figma 578:374). */
(() => {
  'use strict';
  const shape = name => `<span class="skeleton-shape skeleton-${name}"></span>`;
  const efficiency = () => `<div class="skeleton-efficiency">${shape('avatar')}${shape('id')}</div>`;
  function card() {
    return `<div class="entity-card skeleton-card" aria-hidden="true"><div class="skeleton-card-content"><div class="skeleton-header">${shape('id')}${shape('status')}</div><div class="skeleton-body">${shape('title')}${shape('line')}${shape('line')}</div><div class="skeleton-footer">${shape('avatar')}${efficiency()}</div></div></div>`;
  }
  function cards(count) {return `<div class="cards-grid skeleton-grid">${Array.from({length:count},card).join('')}</div>`;}
  function tableRows(count) {
    const row = `<tr class="skeleton-row" aria-hidden="true"><td><div class="skeleton-table-description"><div class="skeleton-header">${shape('id')}${shape('status')}</div>${shape('title')}${shape('line')}</div></td><td><div class="skeleton-owner">${shape('avatar')}<div class="skeleton-owner-copy">${shape('line')}${shape('line')}</div></div></td><td>${efficiency()}</td></tr>`;
    return Array.from({length:count},()=>row).join('');
  }
  window.BpmLoading = Object.freeze({cards,tableRows});
})();

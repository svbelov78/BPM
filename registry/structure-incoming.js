/* Figma 1166:6766 — related entities inside an expanded structure row.
 * Stateless on purpose: structure.js owns ordering, paging, expansion and actions.
 * render(node, {rows, pagination, isFavorite}) accepts already selected rows and
 * the existing paginationMarkup HTML. It never modifies source relationships.
 */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name, size) => `<img src="assets/${name}.svg" width="${size}" height="${size}" alt="">`;

  function label(row, entity) {
    if (row.numberSimulated && row.code) return row.code;
    if (row.number !== null && row.number !== undefined && row.number !== '') return `${entity === 'paths' ? 'КП' : 'П'} ${row.number}`;
    return row.code || 'ID не указан';
  }

  function renderRow(row, isFavorite, entity) {
    const id = esc(row.id), code = esc(label(row, entity));
    const owners = Array.isArray(row.owners) ? row.owners.filter(Boolean) : [];
    const name = row.owner || owners.join(', ') || 'Владелец не указан';
    const role = row.ownerRole || '';
    const tags = Array.isArray(row.tags) ? row.tags : [];
    const favorite = isFavorite(row) ? `<span class="favorite-heart" role="img" aria-label="В избранном">${icon('liked', 24)}</span>` : '';
    const relationshipType = entity === 'processes' ? (row.relationshipType || row.type) : '';
    const relationship = relationshipType ? `<span class="tag structure-incoming-relationship${relationshipType === 'Основной' ? ' is-primary' : ''}"${row.relationshipSimulated ? ' title="Демонстрационный тип участия процесса в КП"' : ''}>${esc(relationshipType)}</span>` : '';
    // Card usage has a 24px glyph and no pill or trend in this compact insertion.
    const efficiency = window.BpmCardVisuals.efficiency({...row, delta:0}, false);
    return `<tr class="structure-incoming-row" data-structure-record="${id}" data-record-entity="${entity}"><td class="structure-incoming-process-cell"><div class="structure-incoming-process"><div class="structure-incoming-meta">${favorite}<button type="button" class="id-badge" data-structure-copy="${id}" aria-label="Скопировать ${code}">${code}${icon('copy', 16)}</button>${relationship}${tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div><button type="button" class="structure-incoming-title" data-structure-detail="${id}">${esc(row.title)}</button></div></td><td class="structure-incoming-owner-cell"><div class="structure-incoming-owner"${owners.length ? ` title="${esc(owners.join('; '))}"` : ''}><span class="avatar" aria-hidden="true"></span><span class="structure-incoming-owner-copy"><span class="structure-incoming-owner-name">${esc(name)}</span>${role ? `<span class="structure-incoming-owner-role">${esc(role)}</span>` : ''}</span></div></td><td class="structure-incoming-efficiency-cell"><div class="structure-incoming-efficiency">${efficiency}</div></td></tr>`;
  }

  function render(node, options = {}) {
    const rows = options.rows ?? node.records ?? [];
    const entity = node.recordEntity === 'paths' ? 'paths' : 'processes';
    const isPath = entity === 'paths';
    const isFavorite = options.isFavorite || (() => false);
    const name = node.name || '';
    const description = isPath ? `Клиентские пути${name ? ` процесса «${name}»` : ''}` : `Входящие процессы${name ? ` клиентского пути «${name}»` : ''}`;
    const body = rows.length ? rows.map(row => renderRow(row, isFavorite, entity)).join('') : `<tr class="structure-incoming-empty"><td colspan="3">${isPath ? 'Нет связанных клиентских путей' : 'Нет связанных процессов'}</td></tr>`;
    return `<div class="structure-incoming" data-structure-incoming="${esc(node.id)}"><div class="structure-table-scroll structure-incoming-scroll" tabindex="0" role="region" aria-label="${esc(description)}; таблицу можно прокручивать по горизонтали"><table class="structure-incoming-table" data-table-entity="${entity}"><caption class="sr-only">${esc(description)}</caption><colgroup><col class="structure-incoming-process-column"><col><col class="structure-incoming-efficiency-column"></colgroup><thead class="sr-only"><tr><th scope="col">${isPath ? 'ID, КП, описание' : 'ID, процесс, описание'}</th><th scope="col">${isPath ? 'Владелец клиентского пути' : 'Владелец процесса'}</th><th scope="col">Эффективность</th></tr></thead><tbody>${body}</tbody></table></div>${options.pagination || ''}</div>`;
  }

  window.BPMStructureIncoming = Object.freeze({render});
})();

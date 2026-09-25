/* Shared card columns: count from the available width, then cap each track.
 * A single template keeps partially filled rows the same size as full rows.
 * CSS provides --card-min-width, --card-max-width and --card-columns-limit.
 * Cabinet feeds/grids scroll only beyond two rows, sized from their own cards.
 */
(() => {
  'use strict';

  const columnSelector = '.cards-grid,.tasks-grid,.tasks-cards-grid,.cabinet-entity-grid,.cabinet-widget.is-expanded .cabinet-feed';
  const cabinetSelector = '.cabinet-feed,.cabinet-entity-grid';
  const selector = columnSelector + ',.cabinet-feed';
  const grids = new Map();
  let frame = 0;
  let needsDiscovery = false;

  const positiveNumber = (value, fallback) => {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  };

  function schedule(discovery = false) {
    if (discovery === true) needsDiscovery = true;
    if (!frame) frame = requestAnimationFrame(update);
  }

  const sizes = new ResizeObserver(entries => {
    let changed = false;
    for (const entry of entries) {
      const state = grids.get(entry.target);
      if (state && state.width !== entry.contentRect.width) {
        state.width = entry.contentRect.width;
        changed = true;
      }
    }
    // Changing columns can change height; height-only notifications need no work.
    if (changed) schedule();
  });

  function restoreColumns(grid, state) {
    if (state.template === null) return;
    if (state.originalColumns) {
      grid.style.setProperty('grid-template-columns', state.originalColumns, state.originalPriority);
    } else {
      grid.style.removeProperty('grid-template-columns');
    }
    state.template = null;
  }

  function discover() {
    const current = new Set(document.querySelectorAll(selector));
    for (const [grid, state] of grids) {
      if (current.has(grid)) continue;
      sizes.unobserve(grid);
      restoreColumns(grid, state);
      grid.removeAttribute('data-cabinet-rows');
      grid.removeAttribute('data-cabinet-scroll');
      grid.style.removeProperty('--cabinet-two-row-height');
      grids.delete(grid);
    }
    for (const grid of current) {
      if (grids.has(grid)) continue;
      grids.set(grid, {
        width: null,
        template: null,
        originalColumns: grid.style.getPropertyValue('grid-template-columns'),
        originalPriority: grid.style.getPropertyPriority('grid-template-columns')
      });
      sizes.observe(grid);
    }
  }

  function cabinetRows(grid, columns, style) {
    // Skeletons share .cabinet-card; empty-state content does not count as a row.
    const cards = [...grid.children].filter(child => child.matches('.cabinet-card'));
    const rows = Math.ceil(cards.length / columns);
    const rowValue = String(rows);
    const scrollValue = String(rows > 2);
    if (grid.getAttribute('data-cabinet-rows') !== rowValue) grid.setAttribute('data-cabinet-rows', rowValue);
    if (grid.getAttribute('data-cabinet-scroll') !== scrollValue) grid.setAttribute('data-cabinet-scroll', scrollValue);
    if (!cards.length) {
      grid.style.removeProperty('--cabinet-two-row-height');
      return;
    }

    // Grid rows take their tallest card; a collapsed flex feed has one per row.
    const heights = Array(Math.min(rows, 2)).fill(0);
    for (let index = 0; index < Math.min(cards.length, columns * 2); index++) {
      const row = Math.floor(index / columns);
      heights[row] = Math.max(heights[row], cards[index].getBoundingClientRect().height);
    }
    const gap = positiveNumber(style.rowGap, 0);
    const padding = positiveNumber(style.paddingTop, 0) + positiveNumber(style.paddingBottom, 0);
    const height = heights.reduce((sum, value) => sum + value, 0) + gap * (heights.length - 1) + padding;
    const value = `${Math.ceil(height * 1000) / 1000}px`;
    if (grid.style.getPropertyValue('--cabinet-two-row-height') !== value) {
      grid.style.setProperty('--cabinet-two-row-height', value);
    }
  }

  function update() {
    frame = 0;
    if (needsDiscovery) {
      needsDiscovery = false;
      discover();
    }
    for (const [grid, state] of grids) {
      const hasColumns = grid.matches(columnSelector);
      // Collapsing a feed restores flex even if its section is currently hidden.
      if (!hasColumns) restoreColumns(grid, state);
      // Wait for an actual content-box measurement, including after reveal.
      if (!(state.width > 0) || !grid.getClientRects().length) continue;
      const style = getComputedStyle(grid);
      let columns = 1;
      if (hasColumns) {
        const minimum = positiveNumber(style.getPropertyValue('--card-min-width'), 340);
        const maximum = positiveNumber(style.getPropertyValue('--card-max-width'), 420);
        const limit = Math.floor(positiveNumber(style.getPropertyValue('--card-columns-limit'), 0));
        const gap = positiveNumber(style.columnGap, 0);
        columns = Math.max(1, Math.floor((state.width + gap) / (minimum + gap)));
        if (limit > 0) columns = Math.min(columns, limit);
        const available = (state.width - gap * (columns - 1)) / columns;
        // Round down so serializing a fractional width cannot overflow the grid.
        const track = Math.floor(Math.min(maximum, available) * 1000) / 1000;
        const template = `repeat(${columns}, minmax(0, ${track}px))`;
        if (state.template !== template) {
          grid.style.setProperty('grid-template-columns', template);
          state.template = template;
        }
      }
      if (grid.matches(cabinetSelector)) cabinetRows(grid, columns, style);
    }
  }

  // Start immediately: deferred scripts may render cards before DOMContentLoaded.
  // Inline column writes are deliberately excluded from observed attributes.
  const mutations = new MutationObserver(records => {
    const changed = records.some(record => {
      if (record.type === 'childList') {
        // Animated counters replace text nodes frequently; they cannot add grids.
        return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE);
      }
      return grids.has(record.target) || record.target.matches(selector + ',.cabinet-widget') ||
        /(?:^|\s)cabinet-widget(?:\s|$)/.test(record.oldValue || '');
    });
    if (changed) schedule(true);
  });
  mutations.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true
  });
  window.addEventListener('resize', schedule, {passive: true});
  window.addEventListener('load', schedule, {once: true});
  discover();
})();

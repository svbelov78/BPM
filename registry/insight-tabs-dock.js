/* Keep the real insight tab strip in the free part of the global header.
 * A manual popover escapes the registry's CSS size-containment without moving
 * the DOM: IDs, focus, keyboard controls and delegated handlers stay intact. */
(() => {
  'use strict';
  let frame = 0, tabs = null, placeholder = null, docked = false;
  const schedule = () => {if (!frame) frame = requestAnimationFrame(() => {frame = 0; update();});};
  const set = (element,name,value) => {if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name,value);};
  function restore() {
    if (tabs && docked) {
      if (tabs.matches(':popover-open')) tabs.hidePopover();
      tabs.removeAttribute('popover');
      tabs.classList.remove('is-header-docked');
      ['--insight-dock-left','--insight-dock-top','--insight-dock-width'].forEach(name => tabs.style.removeProperty(name));
    }
    placeholder?.remove(); placeholder = null; docked = false;
    document.body.removeAttribute('data-insight-tabs-dock');
    document.documentElement.style.removeProperty('--insight-tabs-dock-bottom');
  }
  function update() {
    const panel = document.getElementById('insights-panel'), header = document.querySelector('.header');
    const current = document.getElementById('insights-tabs');
    if (tabs && current !== tabs) restore();
    tabs = current;
    const overlay = document.querySelector('dialog[open]') || document.body.matches('.mobile-menu-open,.mobile-filters-open,.task-drawer-open,.pd-drawer-open,.ic-drawer-open,.ia-drawer-open,.modal-open');
    if (!tabs || !panel || !header || panel.closest('[hidden]') || !panel.getClientRects().length || panel.classList.contains('is-insight-detail') || tabs.hidden || !tabs.children.length || overlay) {restore(); return;}
    // Without native top-layer positioning, retain the normal in-flow strip.
    if (typeof tabs.showPopover !== 'function') {restore(); return;}
    const headerRect = header.getBoundingClientRect();
    const natural = (placeholder || tabs).getBoundingClientRect();
    if (natural.bottom > headerRect.bottom + (docked ? 2 : 0)) {restore(); return;}
    const panelRect = panel.getBoundingClientRect();
    const logo = header.querySelector('.brand img')?.getBoundingClientRect();
    const actions = header.querySelector('.header-actions')?.getBoundingClientRect();
    let left = Math.max(panelRect.left,(logo?.right || headerRect.left) + 24);
    let right = Math.min(innerWidth - 16,(actions?.left || headerRect.right) - 16);
    const below = right - left < 240;
    if (below) {left = Math.max(12,panelRect.left); right = Math.min(innerWidth - 12,panelRect.right);}
    const height = natural.height || 66;
    const top = below ? headerRect.bottom : Math.max(headerRect.top,headerRect.top + (headerRect.height - height) / 2);
    if (!docked) {
      placeholder = document.createElement('div');
      placeholder.className = 'insight-tabs-dock-placeholder'; placeholder.setAttribute('aria-hidden','true');
      placeholder.style.setProperty('--insight-tabs-natural-width',`${natural.width}px`);
      placeholder.style.setProperty('--insight-tabs-natural-height',`${height}px`);
      tabs.before(placeholder);
      tabs.classList.add('is-header-docked'); tabs.setAttribute('popover','manual');
      docked = true;
    }
    set(tabs,'--insight-dock-left',`${left}px`);
    set(tabs,'--insight-dock-top',`${top}px`);
    set(tabs,'--insight-dock-width',`${Math.max(0,right-left)}px`);
    const mode = below ? 'below' : 'inline';
    if (document.body.dataset.insightTabsDock !== mode) document.body.dataset.insightTabsDock = mode;
    set(document.documentElement,'--insight-tabs-dock-bottom',`${top + height + 8}px`);
    if (!tabs.matches(':popover-open')) tabs.showPopover();
  }
  function start() {
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('pageshow',schedule);
    window.visualViewport?.addEventListener('resize',schedule,{passive:true});
    const sizes = new ResizeObserver(schedule);
    document.querySelectorAll('.header,.header .brand,.header-actions,#insights-panel,.insights-title-row').forEach(node => sizes.observe(node));
    const content = new MutationObserver(schedule);
    content.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open']});
    const state = new MutationObserver(schedule);
    state.observe(document.body,{attributes:true,attributeFilter:['class']});
    const panel = document.getElementById('insights-panel');
    if (panel) state.observe(panel,{attributes:true,attributeFilter:['class']});
    document.fonts?.ready.then(schedule);
    schedule();
  }
  window.BpmInsightTabsDock = Object.freeze({refresh:schedule});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();

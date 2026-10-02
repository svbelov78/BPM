/* Shared vertical overflow affordance. No wrappers, interceptors or overlays:
   card row measurement, native scrolling, pointer events and focus stay intact. */
(() => {
  'use strict';

  const selector = '.cabinet-feed,.cabinet-entity-grid,.navigation,.pd-main,.task-drawer-content,.tf-content,.top-kp-map-viewport';
  const surfaces = new Set();
  const measured = new Set();
  let frame = 0;
  let discoverNext = true;

  const header = document.querySelector('.header');
  function updateHeaderFade() {
    // Only page scrolling reveals this edge. Nested lists/drawers keep their
    // own fades; at the page top (including overscroll) the header has none.
    const scrolled = window.scrollY > 0;
    if (header && header.hasAttribute('data-page-scrolled') !== scrolled) {
      header.toggleAttribute('data-page-scrolled', scrolled);
    }
  }
  window.addEventListener('scroll', updateHeaderFade, {passive: true});
  window.addEventListener('pageshow', updateHeaderFade);
  window.addEventListener('load', updateHeaderFade, {once: true});
  updateHeaderFade();

  function schedule(discover = false) {
    if (discover === true) discoverNext = true;
    if (!frame) frame = requestAnimationFrame(update);
  }

  const sizes = new ResizeObserver(() => schedule());

  function discover() {
    const current = new Set(document.querySelectorAll(selector));
    for (const element of surfaces) {
      if (current.has(element)) continue;
      element.removeAttribute('data-scroll-fade');
      surfaces.delete(element);
    }
    current.forEach(element => surfaces.add(element));

    // Observe content as well as the viewport: a fixed-height list's scrollHeight
    // can change after text wrapping, font/image loading, filtering or editing.
    const targets = new Set();
    for (const element of surfaces) {
      targets.add(element);
      for (const child of element.children) targets.add(child);
    }
    for (const element of measured) {
      if (targets.has(element)) continue;
      sizes.unobserve(element);
      measured.delete(element);
    }
    for (const element of targets) {
      if (measured.has(element)) continue;
      measured.add(element);
      sizes.observe(element);
    }
  }

  function update() {
    frame = 0;
    if (discoverNext) {
      discoverNext = false;
      discover();
    }
    const states = [];
    for (const element of surfaces) {
      let state = 'none';
      const height = element.clientHeight;
      const overflow = element.scrollHeight - height;
      if (height > 0 && element.getClientRects().length && overflow > 1 &&
          /^(auto|scroll|overlay)$/.test(getComputedStyle(element).overflowY)) {
        // Clamp overscroll/bounce and tolerate fractional scroll rounding.
        const top = Math.max(0, Math.min(overflow, element.scrollTop));
        const above = top > 1;
        const below = overflow - top > 1;
        state = above && below ? 'both' : above ? 'top' : below ? 'bottom' : 'none';
      }
      states.push([element, state]);
    }
    for (const [element, state] of states) {
      if (element.dataset.scrollFade !== state) element.dataset.scrollFade = state;
    }
  }

  document.addEventListener('scroll', event => {
    if (surfaces.has(event.target)) schedule();
  }, {capture: true, passive: true});
  window.addEventListener('resize', () => schedule(), {passive: true});
  window.addEventListener('load', () => schedule(), {once: true});
  document.fonts?.ready.then(() => schedule());

  const mutations = new MutationObserver(records => {
    const elementsChanged = records.some(record => record.type === 'childList' &&
      [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE));
    if (elementsChanged) schedule(true);
    else if (records.some(record => record.type === 'attributes')) schedule();
  });
  mutations.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    // Own fade attributes and animated number/style writes never feed back.
    attributeFilter: ['class', 'hidden', 'open', 'data-cabinet-scroll', 'aria-busy']
  });
  schedule(true);
})();

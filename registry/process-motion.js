/* One motion session per Drawer opening. Loading is owned by process-drawer.js;
 * below-the-fold graphs wait for their first visible appearance after loading. */
(() => {
  'use strict';
  const sessions = new WeakMap();
  const COUNTER_DURATION = 1000;
  const ZERO_HOLD = 80;

  function numberRecord(element) {
    const final = element.dataset.pdMotionNumber || element.textContent;
    const match = final.match(/^([^\d]*)(\d+)(?:([.,])(\d+))?(.*)$/);
    if (!match) return null;
    const precision = (match[4] || '').length;
    return {
      element, final, prefix:match[1], separator:match[3] || ',', suffix:match[5], precision,
      magnitude:Number(`${match[2]}.${match[4] || '0'}`), scale:10 ** precision,
      minWidth:element.style.minWidth
    };
  }
  function writeNumber(counter, value) {
    const [whole, fraction] = value.toFixed(counter.precision).split('.');
    counter.element.textContent = `${counter.prefix}${whole}${fraction ? counter.separator + fraction : ''}${counter.suffix}`;
  }
  function restoreNumber(counter) {
    counter.element.textContent = counter.final;
    if (counter.minWidth) counter.element.style.minWidth = counter.minWidth;
    else counter.element.style.removeProperty('min-width');
  }
  function tableRecord(element) {
    const number = element.querySelector('[data-counter-number]');
    if (!number) return null;
    const integer = number.firstChild;
    const fraction = number.querySelector('.fraction');
    return {element, number, integer, fraction, whole:integer.nodeValue, decimal:fraction?.textContent};
  }
  function restoreTable(counter) {
    counter.integer.nodeValue = counter.whole;
    if (counter.fraction) counter.fraction.textContent = counter.decimal;
  }
  function stop(root) {
    const session = sessions.get(root);
    if (!session) return;
    // Delete first: every scheduled callback checks this identity before writing.
    sessions.delete(root);
    session.observer?.disconnect();
    session.frames.forEach(frame => cancelAnimationFrame(frame));
    session.frames.clear();
    session.motion.removeEventListener?.('change', session.onMotionChange);
    session.groups.forEach(group => {
      window.BpmCardVisuals?.cancelCounters(group.element);
      group.numbers.forEach(restoreNumber);
      group.tables.forEach(restoreTable);
      delete group.element.dataset.pdMotionState;
      if (group.addedHook) delete group.element.dataset.pdMotionGroup;
    });
  }
  function prepare(root) {
    stop(root);
    if (!root) return;
    const session = {root, groups:[], frames:new Set(), observer:null, started:false,
      motion:window.matchMedia('(prefers-reduced-motion: reduce)')};
    const addGroup = (element, kind, addedHook = false) => {
      const group = {element, kind, addedHook, started:false,
        numbers:[...element.querySelectorAll('[data-pd-motion-number]')].map(numberRecord).filter(Boolean),
        tables:[...element.querySelectorAll('.efficiency[data-efficiency-percent]')].map(tableRecord).filter(Boolean)};
      element.dataset.pdMotionGroup = kind;
      element.dataset.pdMotionState = 'pending';
      group.numbers.forEach(counter => writeNumber(counter, 0));
      group.tables.forEach(counter => {
        counter.integer.nodeValue = '0';
        if (counter.fraction) counter.fraction.textContent = counter.decimal.replace(/\d/g, '0');
      });
      session.groups.push(group);
    };
    root.querySelectorAll('[data-pd-motion-group]').forEach(element => addGroup(element, element.dataset.pdMotionGroup));
    root.querySelectorAll('.pd-technology-operations:not([data-pd-motion-group])').forEach(element => addGroup(element, 'operations', true));
    root.querySelectorAll('.pd-data-efficiency').forEach(element => {
      if (element.querySelector('[data-efficiency-percent]')) addGroup(element, 'table', true);
    });
    session.onMotionChange = event => { if (event.matches) stop(root); };
    sessions.set(root, session);
    session.motion.addEventListener?.('change', session.onMotionChange);
    if (session.motion.matches) stop(root);
  }
  function animateNumbers(session, group) {
    if (!group.numbers.length) return;
    // Measure the final string, then reserve its width while counting from zero.
    group.numbers.forEach(counter => {
      counter.element.textContent = counter.final;
      counter.element.style.minWidth = `${counter.element.getBoundingClientRect().width}px`;
      writeNumber(counter, 0);
    });
    const started = performance.now();
    const tick = now => {
      if (sessions.get(session.root) !== session) return;
      if (!session.root.isConnected) { stop(session.root); return; }
      const progress = Math.min(1, Math.max(0, (now - started - ZERO_HOLD) / (COUNTER_DURATION - ZERO_HOLD)));
      if (progress === 1) { group.numbers.forEach(restoreNumber); return; }
      const eased = 1 - (1 - progress) ** 3;
      group.numbers.forEach(counter => writeNumber(counter, Math.floor(counter.magnitude * eased * counter.scale) / counter.scale));
      queue();
    };
    const queue = () => {
      const frame = requestAnimationFrame(now => { session.frames.delete(frame); tick(now); });
      session.frames.add(frame);
    };
    queue();
  }
  function runGroup(session, group) {
    if (sessions.get(session.root) !== session || group.started) return;
    if (!session.root.isConnected) { stop(session.root); return; }
    group.started = true;
    group.element.dataset.pdMotionState = 'running';
    animateNumbers(session, group);
    if (group.tables.length) {
      // Reuse the registry's 80 ms zero hold, decimal formatting and easing.
      group.tables.forEach(restoreTable);
      window.BpmCardVisuals?.animateCounters(group.element);
    }
  }
  function start(root) {
    const session = sessions.get(root);
    if (!session || session.started) return;
    if (session.motion.matches) { stop(root); return; }
    session.started = true;
    const scrollRoot = root.matches('.pd-main') ? root : root.querySelector('.pd-main');
    if (!('IntersectionObserver' in window) || !scrollRoot) {
      session.groups.forEach(group => runGroup(session, group));
      return;
    }
    const groups = new Map(session.groups.map(group => [group.element, group]));
    session.observer = new IntersectionObserver(entries => {
      if (sessions.get(root) !== session) return;
      entries.forEach(entry => {
        if (!entry.isIntersecting || entry.intersectionRatio < .12) return;
        const group = groups.get(entry.target);
        if (group) runGroup(session, group);
        session.observer.unobserve(entry.target);
      });
    }, {root:scrollRoot, threshold:.12});
    session.groups.forEach(group => session.observer.observe(group.element));
  }
  window.BpmProcessMotion = Object.freeze({prepare, start, finish:stop, cancel:stop});
})();

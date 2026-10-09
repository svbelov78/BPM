/* One review gate per open drawer/form. A completed review is latched until
 * begin/end, independently of validation, async work and DOM re-renders. */
(() => {
  'use strict';
  const loader = 'assets/drawer-scroll-loading.svg';
  let sequence = 0;
  function create() {
    let root, scroll, form, entries = [], completed = false, progress = 0;
    let frame = 0, resize, mutation, hint;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); }); };
    function restore(entry) {
      const {button, disabled, title, description} = entry;
      button.disabled = disabled;
      button.removeAttribute('data-scroll-pending');
      button.removeAttribute('data-scroll-progress');
      button.style.removeProperty('--drawer-scroll-progress');
      if (title == null) button.removeAttribute('title'); else button.title = title;
      if (description == null) button.removeAttribute('aria-describedby'); else button.setAttribute('aria-describedby',description);
      entry.meter.remove();
    }
    function detach() {
      cancelAnimationFrame(frame); frame = 0;
      resize?.disconnect(); mutation?.disconnect();
      scroll?.removeEventListener('scroll',schedule);
      root?.removeEventListener('click',blockClick,true);
      root?.removeEventListener('submit',blockSubmit,true);
      window.removeEventListener('resize',schedule);
      entries.forEach(restore); entries = [];
      hint?.remove(); hint = null;
      root = scroll = form = null;
    }
    function begin() { detach(); completed = false; progress = 0; }
    function observeChildren() {
      resize?.disconnect();
      if (!scroll) return;
      resize.observe(scroll);
      [...scroll.children].forEach(child => resize.observe(child));
    }
    function bind(options) {
      detach();
      root = options.root; scroll = options.scroll; form = options.form || null;
      if (!root || !scroll) { root = scroll = form = null; return; }
      const buttons = [...(options.buttons || [])].filter(Boolean);
      if (!buttons.length) { root = scroll = form = null; return; }
      hint = document.createElement('span'); hint.className = 'sr-only';
      hint.id = `drawer-scroll-hint-${++sequence}`;
      hint.setAttribute('role','status'); hint.setAttribute('aria-live','polite');
      root.append(hint);
      entries = buttons.map(button => {
        const meter = document.createElement('span'); meter.className = 'scroll-cta-meter';
        meter.setAttribute('role','progressbar'); meter.setAttribute('aria-label','Просмотр формы');
        meter.setAttribute('aria-valuemin','0'); meter.setAttribute('aria-valuemax','100');
        const track = document.createElement('img'); track.src = loader; track.width = 24; track.height = 24; track.alt = ''; track.setAttribute('aria-hidden','true');
        const fill = track.cloneNode(); fill.className = 'scroll-cta-fill';
        track.className = 'scroll-cta-track'; meter.append(track,fill);
        const entry = {button,meter,disabled:button.disabled,title:button.getAttribute('title'),description:button.getAttribute('aria-describedby')};
        button.prepend(meter);
        button.setAttribute('aria-describedby',[entry.description,hint.id].filter(Boolean).join(' '));
        return entry;
      });
      root.addEventListener('click',blockClick,true);
      root.addEventListener('submit',blockSubmit,true);
      scroll.addEventListener('scroll',schedule,{passive:true});
      window.addEventListener('resize',schedule,{passive:true});
      resize = new ResizeObserver(schedule); observeChildren();
      mutation = new MutationObserver(() => { observeChildren(); schedule(); });
      mutation.observe(scroll,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['open','hidden']});
      // Do not unlock a hidden dialog before showModal gives it real geometry.
      paint(); refresh(); schedule();
    }
    function paint() {
      const percent = Math.round(progress * 100);
      for (const entry of entries) {
        const {button,meter} = entry;
        button.disabled = entry.disabled || !completed;
        button.dataset.scrollProgress = progress.toFixed(4);
        if (meter.hidden !== completed) meter.hidden = completed;
        meter.setAttribute('aria-valuenow',String(percent));
        if (!completed) {
          button.dataset.scrollPending = 'true';
          button.style.setProperty('--drawer-scroll-progress',String(progress));
          button.title = `Прокрутите форму до конца · ${percent}%`;
        } else {
          button.removeAttribute('data-scroll-pending');
          button.style.removeProperty('--drawer-scroll-progress');
          if (entry.title == null) button.removeAttribute('title'); else button.title = entry.title;
        }
      }
      if (hint) {
        const text = completed ? 'Форма просмотрена. Доступность действия зависит от заполнения полей.' : 'Чтобы продолжить, прокрутите форму до конца.';
        if (hint.textContent !== text) hint.textContent = text;
      }
    }
    function refresh() {
      if (!root || !scroll || !scroll.isConnected || !scroll.clientHeight || !scroll.getClientRects().length || scroll.closest('[inert]')) return;
      if (!completed) {
        const range = Math.max(0,scroll.scrollHeight - scroll.clientHeight);
        // The full ring represents the entire form, including the portion
        // already visible at the top, rather than only the remaining travel.
        progress = range <= 2 ? 1 : Math.max(0,Math.min(1,(scroll.scrollTop + scroll.clientHeight) / scroll.scrollHeight));
        if (range <= 2 || range - scroll.scrollTop <= 2) { completed = true; progress = 1; }
      }
      paint();
    }
    function allow() { refresh(); return !root || completed; }
    function blockClick(event) {
      const button = event.target.closest?.('button');
      if (entries.some(entry => entry.button === button) && !allow()) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
    function blockSubmit(event) {
      if (form && event.target === form && !allow()) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
    function setDisabled(button, disabled) {
      if (!button) return;
      const entry = entries.find(item => item.button === button);
      if (entry) { entry.disabled = Boolean(disabled); paint(); }
      else button.disabled = Boolean(disabled);
    }
    return Object.freeze({begin,bind,end:begin,allow,setDisabled,refresh});
  }
  window.BpmDrawerScroll = Object.freeze({create});
})();

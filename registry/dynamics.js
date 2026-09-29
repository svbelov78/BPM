/* Efficiency/Bar Hover (644:20), Efficiency/Dynamic (647:58).
 * Values are explicit Figma/demo data, never inferred from bar pixel heights. */
(() => {
  'use strict';
  let sequence = 0;
  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const shortMonths = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

  function render({year, months, labels}, esc) {
    const tooltipId = `dynamics-value-${++sequence}`;
    return `<div class="pd-dynamics-plot" role="group" aria-label="Демонстрационная динамика эффективности за ${esc(year)} год" data-dynamics-tooltip="${tooltipId}"><div class="pd-dynamics-bars">${months.map((month, index) => {
      const value = month.value == null ? '—' : String(month.value);
      const label = `${monthNames[index]} ${year}: ${month.value == null ? 'эффективность не указана' : value}`;
      const bar = `<span class="pd-dynamics-bar${month.tone ? ` pd-dynamics-${esc(month.tone)}` : ''}" style="height:${month.height}px;--pd-bar-index:${index}" aria-hidden="true"></span>`;
      return month.tone === 'empty'
        ? `<span class="pd-dynamics-item" aria-label="${esc(label)}">${bar}</span>`
        : `<button type="button" class="pd-dynamics-item pd-dynamics-hit" data-dynamics-value="${esc(value)}" data-dynamics-month="${shortMonths[index]}" aria-label="${esc(label)}">${bar}</button>`;
    }).join('')}</div><div class="pd-dynamics-labels" aria-hidden="true">${labels.map(label => `<span>${esc(label)}</span>`).join('')}</div><span id="${tooltipId}" class="pd-dynamics-hover-value" role="tooltip" hidden></span><span class="pd-dynamics-hover-month" aria-hidden="true" hidden></span></div>`;
  }

  // Bind all dynamics widgets in the current view, including future repeated widgets.
  // The label belongs to the plot, not to the animated/scaled bar or the page body.
  function bind(root) {
    let active = null;
    const listeners = [];
    const on = (node, type, handler, options) => {
      node.addEventListener(type, handler, options);
      listeners.push(() => node.removeEventListener(type, handler, options));
    };
    const hit = target => target instanceof Element ? target.closest('.pd-dynamics-hit') : null;
    function hide() {
      if (!active) return;
      active.classList.remove('is-active');
      active.removeAttribute('aria-describedby');
      const plot = active.closest('.pd-dynamics-plot');
      plot.querySelector('.pd-dynamics-hover-value').hidden = true;
      plot.querySelector('.pd-dynamics-hover-month').hidden = true;
      plot.classList.remove('has-active-month');
      active = null;
    }
    function position() {
      if (!active) return;
      const plot = active.closest('.pd-dynamics-plot');
      const label = plot.querySelector('.pd-dynamics-hover-value');
      const bounds = plot.getBoundingClientRect(), bar = active.getBoundingClientRect();
      // Let the compact label use the widget's inner padding at the edges.
      // Clamping a 96 px box to the plot moved January/February over March.
      label.style.left = `${bar.left - bounds.left + bar.width / 2}px`;
      label.style.top = `${bar.top - bounds.top - 32}px`;
      const month = plot.querySelector('.pd-dynamics-hover-month');
      month.style.left = `${bar.left - bounds.left + bar.width / 2}px`;
      month.style.top = `${bar.bottom - bounds.top + 4}px`;
    }
    function show(button) {
      if (!button || !root.contains(button) || button.closest('[inert]')) return;
      hide();
      active = button;
      const plot = button.closest('.pd-dynamics-plot');
      const label = plot.querySelector('.pd-dynamics-hover-value');
      label.textContent = button.dataset.dynamicsValue;
      label.hidden = false;
      const month = plot.querySelector('.pd-dynamics-hover-month');
      month.textContent = button.dataset.dynamicsMonth;
      month.hidden = false;
      plot.classList.add('has-active-month');
      button.classList.add('is-active');
      button.setAttribute('aria-describedby', label.id);
      position();
    }
    on(root, 'pointerover', event => {
      if (event.pointerType === 'touch') return;
      const button = hit(event.target);
      if (button && !button.contains(event.relatedTarget)) show(button);
    });
    on(root, 'pointerout', event => {
      if (event.pointerType === 'touch') return;
      const button = hit(event.target);
      if (button && button === active && !button.contains(event.relatedTarget)) hide();
    });
    on(root, 'focusin', event => show(hit(event.target)));
    on(root, 'focusout', event => { if (hit(event.target) === active) hide(); });
    on(root, 'click', event => { const button = hit(event.target); if (button) show(button); });
    on(document, 'pointerdown', event => { if (active && !active.contains(event.target)) hide(); }, true);
    on(root, 'keydown', event => {
      if (event.key === 'Escape' && active) {
        event.preventDefault(); event.stopPropagation(); hide(); return;
      }
      const button = hit(event.target);
      if (!button || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...button.closest('.pd-dynamics-plot').querySelectorAll('.pd-dynamics-hit')];
      const index = buttons.indexOf(button);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
      buttons[next].focus({preventScroll:true});
      show(buttons[next]);
    }, true);
    on(root, 'scroll', hide, {capture:true, passive:true});
    on(window, 'resize', hide, {passive:true});
    on(window, 'beforeprint', hide);
    return () => { hide(); listeners.forEach(remove => remove()); };
  }
  window.BpmDynamics = Object.freeze({render, bind});
})();

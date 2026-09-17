/* Native HTML counterpart of Figma Efficiency/Small Glyph (641:4221).
 * A backdrop-filter inside an SVG <img> cannot sample its sibling Sphere.
 * Keep the sphere and glass as HTML siblings, preserving the Figma geometry. */
(() => {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const percentValue = value => {
    const number = Number(String(value).replace(',', '.'));
    return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
  };
  function glyph(value, table = false) {
    const percent = percentValue(value);
    const color = percent < 45 ? 'red' : percent < 65 ? 'yellow' : percent < 85 ? 'blue' : 'green';
    const edge = Number((24 * percent / 100).toFixed(4));
    const curtain = percent === 0 ? -8 : edge + 1;
    const style = `--efficiency-edge:${edge}px;--efficiency-curtain:${curtain}px;--efficiency-curtain-width:${40-curtain}px`;
    return `<span class="efficiency-glyph bpm-efficiency-glyph efficiency-${color}${table?' efficiency-on-table':''}" style="${style}" data-efficiency="${percent}" aria-hidden="true"><span class="efficiency-sphere"></span>${percent < 100 ? `<span class="efficiency-curtain"><span class="efficiency-blur-fallback"></span></span>${percent > 0 ? '<span class="efficiency-curtain-edge"></span>' : ''}` : ''}</span>`;
  }
  function efficiency(row, table = false) {
    const percent = percentValue(row.efficiency);
    const [whole, fraction] = String(percent).split('.');
    const delta = Number(row.delta) || 0;
    const label = String(percent).replace('.', ',');
    return `<span class="efficiency${table?' table-efficiency':''}" data-efficiency-percent="${percent}" role="img" aria-label="Эффективность ${escape(label)} процентов${!table && delta ? (delta > 0?', рост':', снижение') : ''}">${glyph(percent, table)}<span class="efficiency-value" aria-hidden="true"><span class="efficiency-number" data-counter-number>${whole}${fraction ? `<span class="fraction">,${fraction}</span>` : ''}</span><span class="percent">%</span>${!table && delta ? `<span class="trend">${delta > 0?'↑':'↓'}</span>` : ''}</span></span>`;
  }
  const COUNTER_DURATION = 1000, ZERO_HOLD = 80;
  const activeCounters = new WeakMap();
  function cancelCounters(root) {activeCounters.get(root)?.finish();}
  function animateCounters(root) {
    cancelCounters(root);
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    if(motion.matches)return;
    const counters=[...root.querySelectorAll('.efficiency[data-efficiency-percent]')].map(element=>{
      const number=element.querySelector('[data-counter-number]');
      const target=percentValue(element.dataset.efficiencyPercent);
      const precision=(String(target).split('.')[1]||'').length;
      return {element,number,integer:number.firstChild,fraction:number.querySelector('.fraction'),target,precision,scale:10**precision,width:number.getBoundingClientRect().width};
    }).filter(counter=>counter.target>0);
    if(!counters.length)return;
    // Measure final widths before showing zero: the footer and its owner must not jump.
    const write=(counter,value)=>{
      const [whole,fraction]=value.toFixed(counter.precision).split('.');
      counter.integer.nodeValue=whole;
      if(counter.fraction)counter.fraction.textContent=`,${fraction}`;
    };
    counters.forEach(counter=>{
      counter.number.style.minWidth=`${counter.width}px`;
      counter.element.dataset.counting='true';
      write(counter,0);
    });
    let frame,finished=false;
    const finish=()=>{
      if(finished)return;
      finished=true;
      cancelAnimationFrame(frame);
      counters.forEach(counter=>{write(counter,counter.target);counter.number.style.removeProperty('min-width');delete counter.element.dataset.counting;});
      motion.removeEventListener?.('change',reduceMotion);
      activeCounters.delete(root);
    };
    const reduceMotion=event=>{if(event.matches)finish();};
    activeCounters.set(root,{finish});
    motion.addEventListener?.('change',reduceMotion);
    const started=performance.now();
    const tick=now=>{
      if(finished)return;
      if(!root.isConnected||now-started>=COUNTER_DURATION){finish();return;}
      const progress=Math.max(0,(now-started-ZERO_HOLD)/(COUNTER_DURATION-ZERO_HOLD));
      const eased=1-(1-progress)**3;
      counters.forEach(counter=>write(counter,Math.floor(counter.target*eased*counter.scale)/counter.scale));
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
  }
  window.BpmCardVisuals = Object.freeze({efficiency, glyph, animateCounters, cancelCounters});
})();

/* BPM Calendar: faithful calendar views from Figma 266:58, without native browser date popups. */
(() => {
  'use strict';
  const MONTHS = ['ЯНВ','ФЕВ','МАР','АПР','МАЙ','ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК'];
  const LONG_MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  const WEEKDAYS = ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'];
  const pad = value => String(value).padStart(2,'0');
  const iso = date => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  const date = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [year,month,day] = value.split('-').map(Number);
    const result = new Date(year,month-1,day,12);
    return iso(result) === value ? result : null;
  };
  const addDays = (value,amount) => { const result = new Date(value); result.setDate(result.getDate()+amount); return result; };
  const addMonths = (value,amount) => new Date(value.getFullYear(),value.getMonth()+amount,1,12);
  const img = name => `<img src="assets/${name}.svg" alt="">`;
  let current = null, sequence = 0;

  function open({anchor,from='',to='',onApply=()=>{},onClose=()=>{}} = {}) {
    if (!anchor || !anchor.getBoundingClientRect) throw new TypeError('Calendar requires an anchor element.');
    current?.close(false);
    const id = `bpm-calendar-${++sequence}`;
    const today = new Date(); today.setHours(12,0,0,0);
    let start = date(from) ? from : '', end = date(to) ? to : '';
    if (start && end && start > end) [start,end] = [end,start];
    const initialStart = date(start), initialEnd = date(end);
    const rangeSpansMonths = initialStart && initialEnd && start.slice(0,7) !== end.slice(0,7);
    let twoMonths = Boolean(rangeSpansMonths && innerWidth >= 704);
    let month = addMonths(initialEnd || initialStart || today, twoMonths ? -1 : 0);
    let selectingEnd = false, hover = '', activeDate = iso(initialEnd || initialStart || today);
    let closed = false, picker = null, pickerAnchor = null, pickerKind = '', pickerMonth = 0;
    let rememberedRange = {from:start,to:end};
    const element = document.createElement('div');
    element.className = 'bpm-calendar';
    element.id = id;
    element.setAttribute('role','dialog');
    element.setAttribute('aria-label','Выбор диапазона дат');
    element.setAttribute('aria-describedby',`${id}-instructions`);
    element.tabIndex = -1;
    document.body.append(element);
    anchor.setAttribute('aria-expanded','true');
    anchor.setAttribute('aria-controls',id);
    const controller = {element,close,reposition};
    current = controller;

    function close(restoreFocus = true) {
      if (closed) return;
      closed = true;
      closePicker(false);
      document.removeEventListener('pointerdown',outside,true);
      document.removeEventListener('keydown',keydown,true);
      window.removeEventListener('resize',resize);
      window.removeEventListener('scroll',onScroll,true);
      element.remove();
      anchor.setAttribute('aria-expanded','false');
      anchor.removeAttribute('aria-controls');
      if (current === controller) current = null;
      if (restoreFocus && anchor.isConnected) anchor.focus({preventScroll:true});
      onClose();
    }
    function apply(nextStart,nextEnd) {
      if ((nextStart && !date(nextStart)) || (nextEnd && !date(nextEnd))) return;
      if (nextStart && nextEnd && nextStart > nextEnd) [nextStart,nextEnd] = [nextEnd,nextStart];
      rememberedRange = {from:nextStart,to:nextEnd};
      onApply({...rememberedRange});
      close();
    }
    function chooseDay(value) {
      closePicker(false);
      if (!selectingEnd) {
        start = value; end = ''; hover = ''; selectingEnd = true; activeDate = value;
        render(value);
        const announcement = element.querySelector('[role="status"]');
        announcement.textContent = `Начало: ${date(value).toLocaleDateString('ru-RU')}. Выберите последний день периода.`;
      } else apply(start,value);
    }
    function render(focusDate) {
      element.classList.toggle('is-two-months',twoMonths);
      element.innerHTML = `<p class="bpm-calendar-sr" id="${id}-instructions">Выберите начало, затем конец периода. Стрелки перемещают по дням. Page Up и Page Down меняют месяц, с Shift — год. Escape отменяет незавершённый выбор.</p><span class="bpm-calendar-sr" role="status" aria-live="polite"></span><div class="bpm-calendar-quick" aria-label="Быстрые периоды"><button type="button" data-days="1">Сегодня</button><button type="button" data-days="7">7 дней</button><button type="button" data-days="14">14 дней</button><button type="button" data-days="30">30 дней</button><button type="button" class="bpm-calendar-clear" data-clear aria-label="Очистить период" title="Очистить период">${img('calendar-erase')}</button></div><div class="bpm-calendar-months">${monthMarkup(month,0)}${twoMonths ? monthMarkup(addMonths(month,1),1) : ''}</div>`;
      updateSelection();
      reposition();
      if (focusDate) findDay(focusDate)?.focus({preventScroll:true});
    }
    function monthMarkup(value,index) {
      const offset = (value.getDay()+6)%7, startOfGrid = addDays(value,-offset);
      const daysInMonth = new Date(value.getFullYear(),value.getMonth()+1,0).getDate();
      const count = Math.ceil((offset+daysInMonth)/7)*7;
      const caption = `${LONG_MONTHS[value.getMonth()]} ${value.getFullYear()}`;
      const days = Array.from({length:count},(_,i) => {
        const d = addDays(startOfGrid,i), key = iso(d), muted = d.getMonth() !== value.getMonth();
        return `<button type="button" class="bpm-calendar-day${muted?' is-muted':''}" role="gridcell" data-date="${key}" data-own-month="${!muted}" tabindex="${key===activeDate&&!muted?0:-1}" aria-label="${d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}">${d.getDate()}</button>`;
      }).join('');
      return `<section class="bpm-calendar-month" aria-label="${caption}"><div class="bpm-calendar-heading">${index===0?`<button class="bpm-calendar-nav" type="button" data-nav="-1" aria-label="Предыдущий месяц">${img('calendar-arrow-left')}</button>`:'<span></span>'}<div class="bpm-calendar-heading-label"><button type="button" data-picker="month" data-month-index="${index}" aria-haspopup="listbox" aria-expanded="false" aria-label="Выбрать месяц: ${caption}">${MONTHS[value.getMonth()]}</button><button type="button" data-picker="year" data-month-index="${index}" aria-haspopup="listbox" aria-expanded="false" aria-label="Выбрать год: ${value.getFullYear()}">${value.getFullYear()}</button></div>${index===(twoMonths?1:0)?`<button class="bpm-calendar-nav" type="button" data-nav="1" aria-label="Следующий месяц">${img('calendar-arrow-right')}</button>`:'<span></span>'}</div><div class="bpm-calendar-weekdays" aria-hidden="true">${WEEKDAYS.map(d=>`<span>${d}</span>`).join('')}</div><div class="bpm-calendar-days" role="grid" aria-label="${caption}">${days}</div></section>`;
    }
    function findDay(value) {
      return element.querySelector(`[data-date="${value}"][data-own-month="true"]`) || element.querySelector(`[data-date="${value}"]`);
    }
    function updateSelection() {
      let a = start, b = end || (selectingEnd ? hover : '');
      if (a && b && a > b) [a,b] = [b,a];
      element.querySelectorAll('[data-date]').forEach(button => {
        const value = button.dataset.date;
        const selected = Boolean((start && value===start) || (end && value===end));
        button.classList.toggle('is-selected',selected);
        button.classList.toggle('is-range',Boolean(a && b && value > a && value < b));
        button.setAttribute('aria-selected',String(selected || Boolean(a && b && value > a && value < b)));
        if (value===iso(today)) button.setAttribute('aria-current','date');
      });
    }
    function ensureVisible(value) {
      const selected = date(value);
      if (!selected) return;
      const first = iso(month).slice(0,7), last = iso(addMonths(month,twoMonths?1:0)).slice(0,7);
      if (value.slice(0,7)<first) month=addMonths(selected,0);
      if (value.slice(0,7)>last) month=addMonths(selected,twoMonths?-1:0);
      activeDate=value;
      render(value);
    }
    function reposition() {
      if (closed) return;
      const rect = anchor.getBoundingClientRect(), margin = 12;
      element.style.maxHeight = `${Math.max(180,innerHeight-24)}px`;
      const width = element.offsetWidth, height = element.offsetHeight;
      element.style.left = `${Math.max(margin,Math.min(rect.left,innerWidth-width-margin))}px`;
      const roomBelow = innerHeight - rect.bottom - margin - 2;
      const top = roomBelow >= height || roomBelow >= rect.top-margin ? rect.bottom+2 : rect.top-height-2;
      element.style.top = `${Math.max(margin,Math.min(top,innerHeight-height-margin))}px`;
      positionPicker();
    }
    function positionPicker() {
      if (!picker || !pickerAnchor) return;
      const rect=pickerAnchor.getBoundingClientRect(), width=picker.offsetWidth, height=picker.offsetHeight;
      picker.style.left=`${Math.max(12,Math.min(rect.left-6,innerWidth-width-12))}px`;
      picker.style.top=`${Math.max(12,Math.min(rect.bottom+2,innerHeight-height-12))}px`;
    }
    function closePicker(restore = true) {
      if (!picker) return;
      picker.remove(); picker=null;
      pickerAnchor?.setAttribute('aria-expanded','false');
      if (restore) pickerAnchor?.focus({preventScroll:true});
      pickerAnchor=null;
    }
    function openPicker(kind,index,button) {
      if (pickerAnchor===button) { closePicker();return; }
      closePicker(false); pickerAnchor=button;pickerKind=kind;pickerMonth=index;
      const visibleMonth=addMonths(month,index), selected=kind==='month'?visibleMonth.getMonth():visibleMonth.getFullYear();
      picker=document.createElement('div');
      picker.className=`bpm-calendar-picker is-${kind}-picker`;
      picker.setAttribute('role','listbox');picker.setAttribute('aria-label',kind==='month'?'Месяц':'Год');
      // The reference month picker runs down columns, starting at the visible month.
      const values=kind==='month'?Array.from({length:12},(_,i)=>(selected+i)%12):Array.from({length:401},(_,i)=>1800+i);
      picker.innerHTML=values.map(value=>`<button type="button" role="option" tabindex="${value===selected?0:-1}" data-picker-value="${value}" aria-selected="${value===selected}">${kind==='month'?MONTHS[value]:value}</button>`).join('');
      document.body.append(picker);button.setAttribute('aria-expanded','true');
      positionPicker();
      picker.addEventListener('click',e=>{const item=e.target.closest('[data-picker-value]');if(item)choosePicker(Number(item.dataset.pickerValue));});
      const focused=picker.querySelector('[aria-selected="true"]');
      if(kind==='year')picker.scrollTop=Math.max(0,focused.offsetTop-108);
      focused.focus({preventScroll:true});
    }
    function choosePicker(value) {
      const currentMonth=addMonths(month,pickerMonth);
      const next=pickerKind==='month'?new Date(currentMonth.getFullYear(),value,1,12):new Date(value,currentMonth.getMonth(),1,12);
      month=addMonths(next,-pickerMonth);activeDate=iso(next);
      closePicker(false);render(activeDate);
    }
    function outside(event) {
      if (element.contains(event.target) || picker?.contains(event.target) || anchor.contains(event.target)) return;
      close(false);
    }
    function onScroll(event) {if(!element.contains(event.target)&&!picker?.contains(event.target))reposition();}
    function resize() {
      const showTwo=Boolean(rangeSpansMonths&&innerWidth>=704);
      if(showTwo!==twoMonths){twoMonths=showTwo;closePicker(false);render();}else reposition();
    }
    function keydown(event) {
      if (closed) return;
      if(event.key==='Escape') {event.preventDefault();event.stopPropagation();if(picker)closePicker();else close();return;}
      const within=element.contains(event.target)||picker?.contains(event.target);
      if(!within)return;
      if(event.key==='Tab') {
        const scope=picker||element;
        const focusable=[...scope.querySelectorAll('button:not([disabled])')].filter(b=>b.tabIndex>=0);
        if(!focusable.length){event.preventDefault();element.focus();return;}
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
        return;
      }
      if(picker&&picker.contains(event.target)&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();const buttons=[...picker.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
        const offset=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:event.key==='ArrowRight'?(pickerKind==='month'?4:1):-(pickerKind==='month'?4:1);
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+offset));
        buttons.forEach(b=>b.tabIndex=-1);buttons[next].tabIndex=0;buttons[next].focus();return;
      }
      const button=event.target.closest('[data-date]');
      if(!button)return;
      const value=date(button.dataset.date);let next;
      if(event.key==='ArrowLeft')next=addDays(value,-1);
      if(event.key==='ArrowRight')next=addDays(value,1);
      if(event.key==='ArrowUp')next=addDays(value,-7);
      if(event.key==='ArrowDown')next=addDays(value,7);
      if(event.key==='Home')next=addDays(value,-((value.getDay()+6)%7));
      if(event.key==='End')next=addDays(value,6-((value.getDay()+6)%7));
      if(event.key==='PageUp'||event.key==='PageDown') {
        const target=addMonths(value,(event.key==='PageUp'?-1:1)*(event.shiftKey?12:1));
        target.setDate(Math.min(value.getDate(),new Date(target.getFullYear(),target.getMonth()+1,0).getDate()));next=target;
      }
      if(next){event.preventDefault();if(next.getFullYear()<1800||next.getFullYear()>2200)return;hover=iso(next);ensureVisible(iso(next));}
    }
    element.addEventListener('click',event=>{
      const day=event.target.closest('[data-date]');if(day){chooseDay(day.dataset.date);return;}
      const quick=event.target.closest('[data-days]');if(quick){apply(iso(addDays(today,1-Number(quick.dataset.days))),iso(today));return;}
      if(event.target.closest('[data-clear]')){apply('','');return;}
      const nav=event.target.closest('[data-nav]');if(nav){closePicker(false);month=addMonths(month,Number(nav.dataset.nav));activeDate=iso(month);render();element.querySelector(`[data-nav="${nav.dataset.nav}"]`)?.focus({preventScroll:true});return;}
      const pickerButton=event.target.closest('[data-picker]');if(pickerButton)openPicker(pickerButton.dataset.picker,Number(pickerButton.dataset.monthIndex),pickerButton);
    });
    element.addEventListener('pointerover',event=>{const day=event.target.closest('[data-date]');if(selectingEnd&&day){hover=day.dataset.date;updateSelection();}});
    element.addEventListener('pointerleave',()=>{if(selectingEnd){hover='';updateSelection();}});
    element.addEventListener('focusin',event=>{const day=event.target.closest('[data-date]');if(day){activeDate=day.dataset.date;element.querySelectorAll('[data-date]').forEach(b=>b.tabIndex=b===day?0:-1);}});
    document.addEventListener('pointerdown',outside,true);
    document.addEventListener('keydown',keydown,true);
    window.addEventListener('resize',resize);
    window.addEventListener('scroll',onScroll,true);
    render();
    const initial=findDay(activeDate)||element.querySelector('.bpm-calendar-day[data-own-month="true"]');
    if(initial){initial.tabIndex=0;initial.focus({preventScroll:true});}else element.focus({preventScroll:true});
    return controller;
  }
  window.BpmCalendar = {open};
})();

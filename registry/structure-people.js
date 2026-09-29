/* Compact people filter: Nordic button and existing multi-select list styling.
 * The tree owns selected identities; this controller only presents the popup. */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fold=value=>String(value).toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
  const roles={divisionLeader:'Руководитель подразделения',processOwner:'Владелец процесса',pathOwner:'Владелец клиентского пути'};
  function mount({button,people,getSelected,onToggle,onClear,beforeOpen}) {
    let popup=null,input=null,list=null,results=[],active=-1;
    function close(restoreFocus=false) {
      popup?.remove();popup=null;input=null;list=null;active=-1;
      button.setAttribute('aria-expanded','false');
      if(restoreFocus)button.focus({preventScroll:true});
    }
    function position() {
      if(!popup)return;
      const r=button.getBoundingClientRect(),v=window.visualViewport;
      const left=v?.offsetLeft||0,top=v?.offsetTop||0,width=v?.width||innerWidth,height=v?.height||innerHeight;
      if(!button.getClientRects().length||r.bottom<top||r.top>top+height){close();return;}
      const margin=12,below=top+height-r.bottom-8-margin,above=r.top-top-8-margin,useAbove=below<220&&above>below;
      popup.style.width=`${Math.min(380,width-margin*2)}px`;
      popup.style.left=`${Math.max(left+margin,Math.min(r.right-popup.offsetWidth,left+width-popup.offsetWidth-margin))}px`;
      popup.style.maxHeight=`${Math.max(100,Math.min(440,useAbove?above:below))}px`;
      popup.style.top=`${useAbove?Math.max(top+margin,r.top-8-popup.offsetHeight):r.bottom+8}px`;
    }
    function setActive(next) {
      active=next;
      list?.querySelectorAll('[role=option]').forEach((option,index)=>option.classList.toggle('active',index===active));
      const option=active>=0?list?.children[active]:null;
      if(option){input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}
      else input?.removeAttribute('aria-activedescendant');
    }
    function renderOptions() {
      if(!popup)return;
      const selected=getSelected(),tokens=fold(input.value).split(/\s+/).filter(Boolean),scroll=list.scrollTop;
      results=people.filter(person=>tokens.every(token=>fold(person.title).includes(token)));
      active=Math.min(active,results.length-1);
      list.innerHTML=results.map((person,index)=>`<div id="structure-person-option-${index}" class="select-option${active===index?' active':''}" role="option" aria-selected="${selected.has(person.id)}" data-structure-person="${esc(person.id)}"><span class="option-check" aria-hidden="true"></span><span class="option-label">${window.BPMStructureSearch.highlight(person.title,input.value)}<span class="structure-people-role">${person.roles.map(kind=>roles[kind]).join(' · ')}</span></span></div>`).join('')||'<p class="popup-empty">Люди не найдены</p>';
      list.scrollTop=scroll;
      popup.querySelector('[data-people-summary]').textContent=selected.size?`Выбрано: ${selected.size}`:'Все люди';
      popup.querySelector('#structure-people-clear').disabled=!selected.size;
      if(active>=0)input.setAttribute('aria-activedescendant',`structure-person-option-${active}`);else input.removeAttribute('aria-activedescendant');
      position();
    }
    function refresh() {
      const count=getSelected().size;
      button.classList.toggle('has-selection',count>0);
      button.dataset.selectedCount=String(count);
      button.title=count?`Фильтр по людям: выбрано ${count}`:'Фильтр по людям';
      button.setAttribute('aria-label',button.title);
      renderOptions();
    }
    function open() {
      if(popup)return;
      beforeOpen();
      popup=document.createElement('div');popup.id='structure-people-popup';popup.className='select-popup structure-people-popup';
      popup.setAttribute('role','dialog');popup.setAttribute('aria-labelledby','structure-people-title');
      popup.innerHTML='<h2 id="structure-people-title">Люди</h2><div class="field search-field structure-people-search"><img src="assets/search-suggest-search.svg" width="24" height="24" alt=""><input id="structure-people-search" type="search" placeholder="Поиск по ФИО" aria-label="Поиск людей по ФИО" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="true" aria-controls="structure-people-list" autocomplete="off" spellcheck="false"></div><div id="structure-people-list" class="structure-people-list" role="listbox" aria-label="Люди" aria-multiselectable="true"></div><div class="structure-people-footer"><span data-people-summary role="status"></span><button type="button" id="structure-people-clear" class="text-button">Сбросить</button></div>';
      document.body.append(popup);input=popup.querySelector('input');list=popup.querySelector('[role=listbox]');
      input.addEventListener('input',()=>{active=-1;list.scrollTop=0;renderOptions();});
      list.addEventListener('pointerdown',event=>event.preventDefault());
      list.addEventListener('click',event=>{const option=event.target.closest('[data-structure-person]');if(option){onToggle(option.dataset.structurePerson);refresh();}});
      popup.querySelector('#structure-people-clear').addEventListener('click',()=>{onClear();refresh();input.focus({preventScroll:true});});
      popup.addEventListener('keydown',event=>{
        if(event.isComposing)return;
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
        if(event.key==='Tab'){close(true);return;}
        if(event.target!==input)return;
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
          if((event.key==='Home'||event.key==='End')&&!event.altKey)return;
          event.preventDefault();if(!results.length)return;
          setActive(event.key==='Home'?0:event.key==='End'?results.length-1:event.key==='ArrowDown'?Math.min(results.length-1,active+1):active<0?results.length-1:Math.max(0,active-1));
        } else if(event.key==='Enter'){
          event.preventDefault();const person=results[active<0?0:active];if(person){onToggle(person.id);refresh();}
        }
      });
      button.setAttribute('aria-expanded','true');refresh();input.focus({preventScroll:true});
    }
    button.addEventListener('click',()=>popup?close():open());
    button.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();open();setActive(0);}});
    document.addEventListener('pointerdown',event=>{if(!button.contains(event.target)&&!popup?.contains(event.target))close();});
    document.addEventListener('focusin',event=>{if(!button.contains(event.target)&&!popup?.contains(event.target))close();});
    document.addEventListener('scroll',event=>{if(popup&&!popup.contains(event.target))position();},true);
    window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);
    new ResizeObserver(position).observe(button);
    refresh();return Object.freeze({close,refresh});
  }
  window.BPMStructurePeople=Object.freeze({mount});
})();

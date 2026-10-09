/* Products BPM 79:13889: grouped entity suggestions, ID + full name + match.
 * The tree owns filters; this component owns only the input's suggestion UI.
 */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fold = value => String(value).toLocaleLowerCase('ru').replace(/ё/g,'е');
  const groups = {product:'Продукты',paths:'Клиентские пути',processes:'Процессы',divisionLeader:'Руководители подразделений',processOwner:'Владельцы процессов',pathOwner:'Владельцы клиентских путей'};

  function highlight(value, query, compact=false) {
    const text=String(value), mask=Array(text.length).fill(false);
    let normalized='',indices=[];
    for(let index=0;index<text.length;index++) {
      if(compact&&!/[a-zа-я0-9]/.test(fold(text[index])))continue;
      normalized+=fold(text[index]);indices.push(index);
    }
    const words=compact?[fold(query).replace(/[^a-zа-я0-9]/g,'')]:fold(query).trim().split(/\s+/);
    for(const word of words.filter(Boolean)) {
      let start=normalized.indexOf(word);
      while(start!==-1){
        for(let index=indices[start];index<=indices[start+word.length-1];index++)mask[index]=true;
        start=normalized.indexOf(word,start+Math.max(1,word.length));
      }
    }
    let result='',start=0;
    while(start<text.length){let end=start+1;while(end<text.length&&mask[end]===mask[start])end++;const part=esc(text.slice(start,end));result+=mask[start]?`<mark>${part}</mark>`:part;start=end;}
    return result;
  }

  function mount({input,anchor,catalog,isSelected,onChoose,onCopy,isActive}) {
    let popup=null,results=[],activeIndex=-1,composing=false;
    const status=document.getElementById('structure-search-status');
    input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-haspopup','listbox');input.setAttribute('aria-expanded','false');
    input.setAttribute('aria-controls','structure-search-suggestions');

    function close() {
      popup?.remove();popup=null;results=[];activeIndex=-1;
      input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
    }
    function position() {
      if(!popup)return;
      const rect=anchor.getBoundingClientRect(), viewport=window.visualViewport;
      const bottom=viewport?viewport.offsetTop+viewport.height:innerHeight;
      if(!anchor.getClientRects().length||rect.bottom<0||rect.top>bottom){close();return;}
      const margin=8,below=bottom-rect.bottom-2-margin,above=rect.top-margin-2;
      const useAbove=below<150&&above>below;
      // The two-column mobile toolbar has a narrow search field. Let its
      // full-name suggestions use the viewport instead of clipping IDs.
      popup.style.width=`${Math.min(Math.max(rect.width,innerWidth<=520?280:rect.width),innerWidth-margin*2)}px`;
      popup.style.left=`${Math.max(margin,Math.min(rect.left,innerWidth-popup.offsetWidth-margin))}px`;
      popup.style.maxHeight=`${Math.max(50,Math.min(420,useAbove?above:below))}px`;
      popup.style.top=`${useAbove?Math.max(margin,rect.top-2-popup.offsetHeight):rect.bottom+2}px`;
      popup.dataset.placement=useAbove?'above':'below';
    }
    function setActive(index) {
      activeIndex=index;
      popup?.querySelectorAll('[role=option]').forEach((option,i)=>{
        option.classList.toggle('active',i===index);
        option.setAttribute('aria-selected',String(i===index));
      });
      const option=popup?.querySelector(`[data-search-index="${index}"]`);
      if(option){input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}
      else input.removeAttribute('aria-activedescendant');
    }
    function choose(index) {
      const entry=results[index];if(!entry)return;
      close();onChoose(entry);
    }
    function update() {
      if(composing||!isActive()||!input.value.trim()){close();return;}
      const all=catalog.search(input.value);
      results=all.filter(entry=>!isSelected(entry));activeIndex=-1;
      if(!popup){
        popup=document.createElement('div');popup.id='structure-search-suggestions';
        popup.className='select-popup structure-search-popup';popup.setAttribute('role','listbox');
        popup.setAttribute('aria-label','Найденные сущности — добавить в фильтры');
        popup.addEventListener('pointerdown',event=>event.preventDefault());
        popup.addEventListener('click',event=>{
          const option=event.target.closest('[data-search-index]');if(!option)return;
          const entry=results[Number(option.dataset.searchIndex)];
          if(event.target.closest('[data-search-copy]')){onCopy(entry);return;}
          choose(Number(option.dataset.searchIndex));
        });
        document.body.append(popup);
      }
      let index=0;
      popup.innerHTML=Object.entries(groups).map(([kind,label])=>{
        const entries=results.filter(entry=>entry.kind===kind);if(!entries.length)return '';
        return `<div class="structure-search-group" role="group" aria-label="${label}"><div class="structure-search-group-label" aria-hidden="true">${label}</div>${entries.map(entry=>{
          const itemIndex=index++;
          const displayTitle=entry.person?window.BpmAvatars.displayName(entry.title,`${entry.id}:owner`):entry.title;
          const leading=entry.person?`<span class="avatar structure-search-person-avatar" aria-hidden="true">${window.BpmAvatars.portrait(displayTitle)}</span>`:`<button type="button" tabindex="-1" class="id-badge structure-search-id" data-search-copy aria-label="Скопировать ${esc(entry.code)}" title="Скопировать ${esc(entry.code)}">${highlight(entry.code,input.value,true)}<img src="assets/search-suggest-copy.svg" width="16" height="16" alt=""></button>`;
          const label=[entry.code,displayTitle].filter(Boolean).join(' ');
          return `<div class="select-option structure-search-option${entry.person?' structure-search-person':''}" role="option" aria-selected="false" id="structure-search-option-${itemIndex}" data-search-kind="${kind}" data-search-id="${esc(entry.id)}" data-search-index="${itemIndex}" aria-label="Добавить в фильтры: ${esc(label)}">${leading}<span class="option-label">${highlight(displayTitle,input.value)}</span></div>`;
        }).join('')}</div>`;
      }).join('')||`<div class="popup-empty">${all.length?'Найденные сущности уже добавлены в фильтры.':'Ничего не найдено. Попробуйте другое название или ID.'}</div>`;
      // Match the grouped DOM order even if a future search implementation ranks globally.
      results=Object.keys(groups).flatMap(kind=>results.filter(entry=>entry.kind===kind));
      input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
      status.textContent=results.length?`Найдено: ${results.length}. Выберите сущность, чтобы добавить её в фильтры.`:(all.length?'Все найденные сущности уже в фильтрах.':'Ничего не найдено.');
      position();
    }
    input.addEventListener('input',update);
    input.addEventListener('compositionstart',()=>{composing=true;});
    input.addEventListener('compositionend',()=>{composing=false;update();});
    input.addEventListener('focus',update);
    input.addEventListener('click',()=>{if(!popup)update();});
    input.addEventListener('keydown',event=>{
      if(composing||event.isComposing)return;
      if(event.key==='Escape'){if(popup){event.preventDefault();event.stopPropagation();close();}return;}
      if(event.key==='Tab'){close();return;}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();if(!popup)update();if(!results.length)return;
        setActive(event.key==='ArrowDown'?Math.min(results.length-1,activeIndex+1):(activeIndex<0?results.length-1:Math.max(0,activeIndex-1)));
      } else if(event.key==='Enter'&&popup&&results.length){event.preventDefault();choose(activeIndex<0?0:activeIndex);}
    });
    document.addEventListener('pointerdown',event=>{if(!anchor.contains(event.target)&&!popup?.contains(event.target))close();});
    document.addEventListener('focusin',event=>{if(!anchor.contains(event.target)&&!popup?.contains(event.target))close();});
    document.addEventListener('scroll',event=>{if(popup&&!popup.contains(event.target))position();},true);
    window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);
    new ResizeObserver(position).observe(anchor);
    return Object.freeze({close,refresh:update});
  }
  window.BPMStructureSearch=Object.freeze({mount,highlight});
})();

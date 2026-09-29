/* Compact structure toolbar, Products BPM 132:17902.
 * Move, never clone, existing Nordic controls to preserve state/listeners. */
(() => {
  'use strict';
  function mount() {
    const toolbar=document.getElementById('structure-toolbar');
    const slot=toolbar.querySelector('.structure-sort-slot');
    toolbar.insertBefore(document.querySelector('.structure-level-filters'),document.getElementById('structure-people'));
    const sort=document.getElementById('structure-sort');
    slot.append(sort);
    sort.querySelector('input').setAttribute('aria-label','Сортировка структуры');
    const label=()=>{const title=`Сортировка: ${sort.querySelector('input').value}`;if(sort.title!==title)sort.title=title;};
    new MutationObserver(label).observe(sort,{attributes:true,subtree:true,attributeFilter:['title','aria-expanded']});
    document.querySelector('.structure-filters').remove();
    label();
  }
  window.BpmStructureToolbar=Object.freeze({mount});
})();

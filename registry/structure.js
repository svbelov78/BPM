/* Nested registry structure: processes/client paths, absolute/normalized charts. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<img src="assets/${name}.svg" alt="">`;
  const format = n => Number(n).toLocaleString('ru-RU');
  const normalize = value => String(value).toLocaleLowerCase('ru').replace(/ё/g,'е');
  const labels = {block:'Блоки',division:'Подразделения',owner:'Владельцы процессов',query:'Поиск',favorites:'Список'};
  const kindLabels = {block:'Блок',division:'Подразделение',product:'Продукт'};
  const PAGINATION_THRESHOLD = 50, DEFAULT_PAGE_SIZE = 50, PAGE_SIZES = [25,50,75,100], LOAD_MS = 2000, ANIMATION_MS = 1100;

  function chartLayout(buckets, maxima, type = '1') {
    return window.BPMStructureCharts.layout(buckets,maxima,type);
  }

  function create(api) {
    const models = {processes:window.BPM_STRUCTURE,paths:window.BPM_STRUCTURE_PATHS};
    let entity='processes', model=models.processes, chartType='2', showAverage=true;
    const list = $('structure-list');
    list.classList.toggle('has-average',showAverage);
    const baseNodes = new Map(model.nodes.map(node => [node.id,node]));
    const records = new Map(Object.values(models).flatMap(m=>m.records).map(row => [row.id,row]));
    // Keep reciprocal links outside the source records: paths already reference
    // processes, so writing paths back onto processes would create cycles.
    const processesByPath = new Map(), pathsByProcess = new Map();
    for(const path of models.paths.records) {
      const linked=[...new Map((path.linkedProcesses||[]).map(row=>[row.id,row])).values()]
        .sort((a,b)=>(a.number-b.number)||a.id.localeCompare(b.id));
      processesByPath.set(path.id,linked.map((row,index)=>{
        if(!pathsByProcess.has(row.id))pathsByProcess.set(row.id,[]);
        pathsByProcess.get(row.id).push(path);
        // Approved demo classification belongs to the relationship, not to the
        // process itself. Stable source-ID order makes it independent of UI sort.
        return {...row,relationshipType:index%4===3?'Дополнительный':'Основной',relationshipSimulated:true};
      }));
    }
    const filters = {block:[],division:[],owner:[]};
    const opened = new Set(), pages = new Map(), rowSorts = new Map(), animated = new Set();
    const pageSizes = new Map(), pageSelects = new Map();
    const openedPaths = new Set(), ownerFilters = {paths:[],processes:[]}, detailTables = new Map();
    const selects = {};
    let active=false, busy=false, query='', sort='count-desc', favoritesOnly=false;
    let timer, searchTimer, frame, tree=[], visibleNodes=new Map();
    const animations = new Map();
    const animationKey = chart => chart.hasAttribute('data-average-chart') ? `average:${chart.dataset.averageChart}` : chart.dataset.chart;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if(entry.isIntersecting) { observer.unobserve(entry.target); animateChart(entry.target); }
    }), {threshold:0.1});
    const alignmentObserver = new ResizeObserver(alignAverageMetrics);

    const options = values => [...new Set(values)].sort((a,b)=>a.localeCompare(b,'ru')).map(value=>({value,label:value}));
    for(const key of Object.keys(filters)) {
      const entries = key==='owner' ? options(model.records.flatMap(n=>n.owners||[n.owner])) : model.nodes.filter(n=>n.kind===key).map(n=>({value:n.id,label:n.name}));
      selects[key]=api.createSelect(`structure-${key}`,{label:labels[key],options:entries,multiple:true,onChange:values=>{filters[key]=[...values];if(key==='owner')ownerFilters[entity]=[...values];pages.clear();reload();}});
    }
    selects.sort=api.createSelect('structure-sort',{label:'Сортировка',allowAll:false,icon:'sort',values:[sort],options:[{value:'count-desc',label:'Количество ↓'},{value:'count-asc',label:'Количество ↑'},{value:'name-asc',label:'Название А–Я'},{value:'average-desc',label:'Средняя эффективность ↓'},{value:'average-asc',label:'Средняя эффективность ↑'}],onChange:values=>{sort=values[0];render();}});
    $('structure-path-count').textContent=format(models.paths.total);
    $('structure-process-count').textContent=format(models.processes.total);
    const invalid=model.sourceIssues.filter(issue=>issue.type==='invalid-process-code');
    const aliases=model.sourceIssues.filter(issue=>issue.type==='process-title-aliases');
    $('structure-source-issues').textContent=`${invalid.length} строк без корректного кода процесса не включены в счётчики (строки Excel: ${invalid.map(issue=>issue.row).join(', ')}). Для ${aliases.length} процессов встречаются варианты названий — показывается наиболее частый, все варианты сохранены. Продуктов с идентификатором: ${model.productCount}; служебных групп без установленного продукта: ${model.placeholderCount}. Отсутствующие в Excel статусы и даты не заполнены. Руководители блоков и подразделений в Excel не указаны — для макета используются демонстрационные ФИО. Владельцы продуктов и процессов сохранены из источника. Связи КП ↔ процессы сохранены из Excel; типы участия «Основной / Дополнительный» — демонстрационные, по согласованию с пользователем.`;
    const unique = rows => [...new Map(rows.map(row=>[row.id,row])).values()];

    function buildTree(sourceModel) {
      const needle=normalize(query.trim());
      const owners=sourceModel===model?filters.owner:ownerFilters[sourceModel===models.paths?'paths':'processes'];
      function visit(node,path=[]) {
        if(node.kind==='block' && filters.block.length && !filters.block.includes(node.id))return null;
        if(node.kind==='division' && filters.division.length && !filters.division.includes(node.id))return null;
        const names=[...path,node.name];
        let children=[], rows=[];
        if(node.kind==='product') {
          rows=node.records.filter(row=>(!owners.length||(row.owners||[row.owner]).some(name=>owners.includes(name)))&&(!favoritesOnly||api.isFavorite(row))&&(!needle||normalize(`${names.join(' ')} ${row.title} ${row.code||''} ${row.number} ${(row.owners||[row.owner]).join(' ')} ${row.products?.join(' ')||''}`).includes(needle)));
          const emptyProductMatch=!node.records.length&&!favoritesOnly&&!owners.length&&(!needle||normalize(names.join(' ')).includes(needle));
          if(!rows.length&&!emptyProductMatch)return null;
        } else {
          children=node.children.map(child=>visit(child,names)).filter(Boolean);
          if(!children.length)return null;
          rows=unique(children.flatMap(child=>child.records));
        }
        const buckets=[0,0,0,0,0];rows.forEach(row=>buckets[row.bucket]++);
        // Calculate once per filtered branch, never from rounded labels or
        // child averages (a process can belong to multiple products).
        const averageEfficiency=window.BPMStructureCharts.average(rows).value;
        return {...node,children,records:rows,total:rows.length,buckets,averageEfficiency};
      }
      const compare=(a,b)=>{
        const byName=()=>a.name.localeCompare(b.name,'ru');
        if(sort==='name-asc')return byName();
        if(sort==='average-asc'||sort==='average-desc') {
          const av=a.averageEfficiency,bv=b.averageEfficiency;
          // Missing evaluations are not zero and stay last in either direction.
          if(av===null||bv===null)return av===bv?byName()||a.id.localeCompare(b.id):av===null?1:-1;
          return (sort==='average-asc'?av-bv:bv-av)||byName()||a.id.localeCompare(b.id);
        }
        return (sort==='count-asc'?a.total-b.total:b.total-a.total)||byName();
      };
      const sortNodes=nodes=>nodes.sort(compare).map(node=>({...node,children:sortNodes(node.children)}));
      return sortNodes(sourceModel.roots.map(node=>visit(node)).filter(Boolean));
    }
    function filterTree() {
      tree=buildTree(model);
      visibleNodes=new Map();
      const index=nodes=>nodes.forEach(node=>{visibleNodes.set(node.id,node);index(node.children);});index(tree);
    }

    function chart(node) {
      return window.BPMStructureCharts.render({id:node.id,buckets:node.buckets,maxima:model.maxima,type:chartType,colors:model.colors,entity,total:node.total,done:animated.has(node.id)||motion.matches});
    }
    function averageChart(node) {
      return window.BPMStructureCharts.renderAverage({id:node.id,records:node.records,done:animated.has(`average:${node.id}`)||motion.matches});
    }
    function owner(name,owners=[],simulated=false) {const title=simulated?`Демонстрационный руководитель: ${name}`:owners.join('; ');return `<span class="structure-owner"${title?` title="${esc(title)}"`:''}>${name==='Руководитель не указан'?'':'<span class="avatar" aria-hidden="true"></span>'}<span>${esc(name)}</span></span>`;}
    function nodeMarkup(node) {
      const isOpen=opened.has(node.id);
      return `<article class="structure-node" data-kind="${node.kind}" data-node="${node.id}"><button class="structure-heading" id="heading-${node.id}" aria-expanded="${isOpen}" aria-controls="panel-${node.id}" data-expand="${node.id}"><span class="structure-title">${icon(node.kind)}<span class="structure-title-copy"><span class="structure-kind">${kindLabels[node.kind]}</span><span class="structure-name">${esc(node.name)}</span></span></span>${owner(node.owner,node.owners,node.ownerSimulated)}${showAverage?averageChart(node):''}${chart(node)}<span class="structure-chevron">${icon('chevron-down')}</span></button><div class="structure-children" id="panel-${node.id}" aria-labelledby="heading-${node.id}"${isOpen?'':' hidden'}>${isOpen?content(node):''}</div></article>`;
    }
    function content(node) {return node.kind==='product'?(node.total?table(node):`<div class="structure-empty"><p>${entity==='paths'?'В источнике нет связанного клиентского пути.':'В источнике нет связанного процесса с корректным кодом.'} Продукт сохранён в структуре.</p></div>`):node.children.map(nodeMarkup).join('');}
    function compareRows(a,b,key,direction) {
      let value=key==='id'?a.number-b.number:key==='efficiency'?(a.efficiency??-1)-(b.efficiency??-1):String(a[key]||'').localeCompare(String(b[key]||''),'ru');
      return (direction==='desc'?-value:value)||a.number-b.number;
    }
    function sortedRows(node) {
      const inherited=node.parentId?rowSorts.get(node.parentId):null;
      const sortValue=rowSorts.get(node.id)||(inherited&&/^(id|owner|efficiency)-/.test(inherited)?inherited:'id-asc');
      const [key,direction]=sortValue.split('-');
      return [...node.records].sort((a,b)=>compareRows(a,b,key,direction));
    }
    function relatedCountLabel(count,relatedEntity) {
      const last=count%10, lastTwo=count%100;
      const forms=relatedEntity==='paths'?['клиентский путь','клиентских пути','клиентских путей']:['процесс','процесса','процессов'];
      return `${format(count)} ${forms[last===1&&lastTwo!==11?0:last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?1:2]}`;
    }
    function rowMarkup(row, node) {
      const favorite=api.isFavorite(row);
      const isPath=row.entity==='paths', prefix=isPath?'КП':'П';
      const idLabel=row.numberSimulated?row.code:`${prefix} ${row.number}`;
      const drillId=`links-${node.id}-${row.id}`, pathOpen=openedPaths.has(drillId);
      const relatedEntity=isPath?'processes':'paths';
      const linked=(isPath?processesByPath:pathsByProcess).get(row.id)||[];
      // For client paths, count is the number of linked processes, not variants.
      const variantCount=row.variantCount??(isPath?0:row.count);
      const expansion=linked.length
        ? `<button class="structure-row-count" data-structure-related="${row.id}" data-structure-${isPath?'path':'process'}="${row.id}" data-product="${node.id}" aria-expanded="${pathOpen}" aria-controls="panel-${drillId}">${relatedCountLabel(linked.length,relatedEntity)} ${icon('chevron-down')}</button>`
        : `<span class="structure-row-count structure-no-efficiency">Нет связанных ${isPath?'процессов':'клиентских путей'}</span>`;
      const main=`<tr data-structure-record="${row.id}" data-record-entity="${row.entity}" data-expanded="${pathOpen}"><td><div class="structure-row-meta">${favorite?'<span class="favorite-heart" role="img" aria-label="В избранном">'+icon('liked')+'</span>':''}<button class="id-badge" data-structure-copy="${row.id}" aria-label="Скопировать ${esc(idLabel)}"${row.numberSimulated?' title="Демонстрационный ID: в исходном Excel идентификатор КП отсутствует"':''}>${esc(idLabel)}${icon('copy')}</button>${row.type?`<span class="tag">${esc(row.type)}</span>`:''}${variantCount?`<span class="count-badge">${variantCount} ${variantCount%10===1&&variantCount%100!==11?'вариант':variantCount%10>=2&&variantCount%10<=4&&(variantCount%100<12||variantCount%100>14)?'варианта':'вариантов'}${icon('info')}</span>`:''}</div><button class="structure-row-title" data-structure-detail="${row.id}">${esc(row.title)}</button>${expansion}</td><td>${owner(row.owner,row.owners)}</td><td><span class="structure-efficiency structure-bucket-${row.bucket}">${row.efficiency===null?'<span class="structure-no-efficiency">Нет оценки</span>':window.BpmCardVisuals.efficiency(row,true)}</span><button class="structure-row-more icon-button" data-structure-menu="${row.id}" aria-label="Действия с ${isPath?'клиентским путём':'процессом'} ${row.number}" aria-haspopup="menu">${icon('more')}</button></td></tr>`;
      if(!linked.length)return main;
      const linkedNode={id:drillId,parentId:node.id,name:row.title,records:linked,total:linked.length,recordEntity:relatedEntity};
      detailTables.set(drillId,linkedNode);
      return main+`<tr class="structure-linked-row"${pathOpen?'':' hidden'}><td colspan="3"><div class="structure-linked-processes" id="panel-${drillId}">${pathOpen?linkedContent(linkedNode):''}</div></td></tr>`;
    }
    function linkedContent(node) {
      const rows=sortedRows(node),paginate=rows.length>PAGINATION_THRESHOLD,size=pageSizes.get(node.id)||DEFAULT_PAGE_SIZE;
      const maxPage=Math.max(1,Math.ceil(rows.length/size)),page=paginate?Math.max(1,Math.min(pages.get(node.id)||1,maxPage)):1;
      pages.set(node.id,page);
      return window.BPMStructureIncoming.render(node,{rows:paginate?rows.slice((page-1)*size,page*size):rows,pagination:paginate?paginationMarkup(node,page,size,rows.length,maxPage):'',isFavorite:api.isFavorite});
    }
    function paginationMarkup(node,page,size,total,maxPage) {
      const numbers=[...new Set([1,page-1,page,page+1,maxPage].filter(n=>n>0&&n<=maxPage))].sort((a,b)=>a-b);
      const button=(target,label,body,extra='')=>`<button class="page-button${target===page&&!extra?' active':''}" data-structure-page="${node.id}" data-page="${target}" aria-label="${esc(label)}: ${esc(node.name)}" ${extra|| (target===page?'aria-current="page"':'')}>${body}</button>`;
      let last=0;
      const numbered=numbers.map(n=>{const gap=last&&n-last>1?'<span class="page-button" aria-hidden="true">…</span>':'';last=n;return gap+button(n,`Страница ${n}`,n);}).join('');
      const navigation=maxPage>1?`<nav aria-label="Страницы: ${esc(node.name)}">${button(page-1,'Предыдущая страница',icon('chevron-left'),`data-direction="previous"${page===1?' disabled':''}`)}${numbered}${button(page+1,'Следующая страница',icon('chevron-right'),`data-direction="next"${page===maxPage?' disabled':''}`)}</nav>`:'';
      return `<div class="pagination structure-pagination" data-structure-pagination="${node.id}" data-total="${total}"><div class="select-host structure-page-size" id="structure-size-${node.id}" data-structure-size="${node.id}"></div>${navigation}<span class="sr-only" role="status">${(page-1)*size+1}–${Math.min(page*size,total)} из ${format(total)}</span></div>`;
    }
    function table(node) {
      const tableEntity=node.recordEntity||entity;
      const rows=sortedRows(node), paginate=rows.length>PAGINATION_THRESHOLD, size=pageSizes.get(node.id)||DEFAULT_PAGE_SIZE;
      const maxPage=Math.max(1,Math.ceil(rows.length/size)), page=paginate?Math.max(1,Math.min(pages.get(node.id)||1,maxPage)):1;
      pages.set(node.id,page);
      const selected=paginate?rows.slice((page-1)*size,page*size):rows, sortValue=rowSorts.get(node.id)||'id-asc';
      const entityName=tableEntity==='paths'?'клиентские пути':'процессы';
      const headings=[[tableEntity==='paths'?'ID, КП':'ID, процесс','id'],['Владелец процесса','owner'],['Эффективность','efficiency']];
      const pagination=paginate?paginationMarkup(node,page,size,rows.length,maxPage):'';
      return `<div class="structure-table-scroll" tabindex="0" role="region" aria-label="${entityName}: ${esc(node.name)}; таблицу можно прокручивать по горизонтали"><table class="structure-table" data-table-entity="${tableEntity}"><caption class="sr-only">${esc(node.name)} — ${entityName}</caption><colgroup><col><col style="width:700px"><col style="width:184px"></colgroup><thead><tr>${headings.map(([label,key])=>{const active=sortValue.startsWith(`${key}-`),desc=active&&sortValue.endsWith('desc');return `<th scope="col"${active?` aria-sort="${desc?'descending':'ascending'}"`:''}><button class="table-sort-button" data-structure-sort="${node.id}" data-column="${key}" data-active="${active}" aria-label="${label}: по ${active&&!desc?'убыванию':'возрастанию'}"><span class="structure-column-label">${label==='Эффективность'?'Эф\u00adфек\u00adтив\u00adность':label}</span><img class="table-sort-arrow${desc?' is-reversed':''}" src="assets/arrow-down.svg" alt=""></button></th>`;}).join('')}</tr></thead><tbody>${selected.map(row=>rowMarkup(row,node)).join('')}</tbody></table></div>${pagination}`;
    }

    function disposePageSelects(root=list) {
      for(const [id,select] of pageSelects)if(root.contains(select.host)||!select.host.isConnected){select.close();pageSelects.delete(id);}
    }
    function mountPageSelects(root=list) {
      for(const [id,select] of pageSelects)if(!select.host.isConnected){select.close();pageSelects.delete(id);}
      root.querySelectorAll('[data-structure-size]').forEach(host=>{
        const id=host.dataset.structureSize;
        if(pageSelects.get(id)?.host===host)return;
        const select=api.createSelect(host.id,{label:'Показывать',placeholder:String(pageSizes.get(id)||DEFAULT_PAGE_SIZE),allowAll:false,icon:'chevron-down-pagination',popupClass:'table-page-size-popup',minPopupWidth:128,values:[String(pageSizes.get(id)||DEFAULT_PAGE_SIZE)],options:PAGE_SIZES.map(size=>({value:String(size),label:String(size)})),onChange:values=>{
          const size=Number(values[0]);if(!PAGE_SIZES.includes(size))return;
          pageSizes.set(id,size);pages.set(id,1);replaceTable(id);
          const next=pageSelects.get(id);if(next){next.suppressFocusOpen=true;next.input.focus({preventScroll:true});next.suppressFocusOpen=false;}
        }});
        pageSelects.set(id,select);
      });
    }

    function renderChips() {
      const groups=Object.entries(filters).filter(([,v])=>v.length).map(([key,values])=>({key,values}));
      if(query.trim())groups.unshift({key:'query',values:[query]});
      if(favoritesOnly)groups.push({key:'favorites',values:['Избранное']});
      $('structure-selected').hidden=!groups.length;
      $('structure-chips').innerHTML=groups.map(({key,values})=>`<div class="applied-filter-group"><span class="applied-filter-label">${labels[key]}</span>${values.map(value=>{const label=baseNodes.get(value)?.name||value;return `<span class="chip applied-filter-chip" title="${esc(label)}"><span class="chip-text">${esc(label)}</span><button data-structure-filter="${key}" data-value="${esc(value)}" aria-label="Убрать фильтр ${esc(label)}">${icon('close-16')}</button></span>`;}).join('')}</div>`).join('');
      $('structure-clear-search').hidden=!query;
    }
    function syncSummary() {
      const total=unique(tree.flatMap(n=>n.records)).length;
      for(const key of Object.keys(models)) {
        const count=key===entity?total:unique(buildTree(models[key]).flatMap(n=>n.records)).length;
        $(key==='paths'?'structure-path-count':'structure-process-count').textContent=format(count);
        const tab=$(`structure-${key}-tab`);tab.classList.toggle('active',key===entity);tab.setAttribute('aria-pressed',String(key===entity));
      }
      const entityLabel=entity==='paths'?'клиентских путей':'процессов';
      $('structure-mode').setAttribute('aria-label',`Структура ${entityLabel}`);
      $('structure-search').setAttribute('aria-label',`Поиск в структуре ${entityLabel}`);
      $('structure-data-note').textContent=`Структура, клиентские пути и процессы — из файла «15092026_структура для подготовки мока данных.xlsx».${entity==='paths'?' Идентификаторы КП-ДЕМО условные: в Excel ID клиентских путей отсутствуют.':''}`;
      $('structure-chart-note').textContent=chartType==='1'?'Сравнение с лидером · Structure Chart 1 — общий масштаб с подложками.':'Соотношение эффективности · Structure Chart 2 — сегменты заполняют 100% площади каждой диаграммы.';
      api.onChange?.({favoritesOnly,favoritesCount:model.records.filter(api.isFavorite).length});
      if(active)$('result-announcement').textContent=busy?`Загрузка структуры ${entityLabel}…`:`Структура: блоков ${tree.length}, ${entityLabel} ${total}.`;
    }
    function setEntity(next) {
      if(next===entity||!models[next])return;
      clearTimeout(searchTimer);Object.values(selects).forEach(select=>select.close());
      ownerFilters[entity]=[...filters.owner];entity=next;model=models[entity];filters.owner=[...ownerFilters[entity]];
      labels.owner=entity==='paths'?'Владельцы клиентских путей':'Владельцы процессов';
      selects.owner.config.label=labels.owner;
      selects.owner.host.querySelector('label').textContent=labels.owner;
      selects.owner.setOptions(options(model.records.flatMap(row=>row.owners||[row.owner])));
      selects.owner.set(filters.owner);
      opened.clear();openedPaths.clear();pages.clear();pageSizes.clear();rowSorts.clear();detailTables.clear();reload();
    }
    function setChartType(next) {
      if(next===chartType)return;
      chartType=next;
      $('structure-chart-toggle').checked=chartType==='1';
      $('structure-quantity-label').classList.toggle('is-active',chartType==='2');
      $('structure-comparison-label').classList.toggle('is-active',chartType==='1');
      observer.disconnect();cancelAnimationFrame(frame);animations.clear();animated.clear();
      if(active&&!busy) {
        list.querySelectorAll('[data-chart]').forEach(element=>{
          const node=visibleNodes.get(element.dataset.chart);
          if(node)element.closest('.structure-chart-scroll').outerHTML=chart(node);
        });
        observeCharts();
      }
      syncSummary();
    }
    function setAverageVisible(next) {
      showAverage=next;
      $('structure-average-toggle').setAttribute('aria-checked',String(next));
      list.classList.toggle('has-average',next);
      // Do not rebuild accordions: keep focus, expanded links, table pagination
      // and local scroll positions when toggling this optional metric.
      list.querySelectorAll('[data-average-chart]').forEach(chart=>{
        observer.unobserve(chart);animations.delete(chart);animated.delete(animationKey(chart));chart.remove();
      });
      if(next&&!busy)list.querySelectorAll('[data-expand]').forEach(heading=>{
        const node=visibleNodes.get(heading.dataset.expand);
        if(node)heading.querySelector('.structure-chart-scroll').insertAdjacentHTML('beforebegin',averageChart(node));
      });
      if(next)observeCharts();else watchAverageAlignment();
    }
    function alignAverageMetrics() {
      if(!active||busy||!showAverage)return;
      // Read all geometry before writing. The bar center excludes the labels,
      // scroll padding and any native horizontal scrollbar below the chart.
      const updates=[];
      list.querySelectorAll('[data-average-chart]').forEach(metric=>{
        const track=metric.parentElement.querySelector('.structure-track');
        if(!track||!metric.getClientRects().length)return;
        const averageBox=metric.getBoundingClientRect(),barBox=track.getBoundingClientRect();
        const delta=barBox.top+barBox.height/2-averageBox.top-averageBox.height/2;
        if(Math.abs(delta)>.01)updates.push([metric,(parseFloat(getComputedStyle(metric).top)||0)+delta]);
      });
      updates.forEach(([metric,offset])=>metric.style.setProperty('--average-align-y',`${offset.toFixed(3)}px`));
    }
    function watchAverageAlignment() {
      alignmentObserver.disconnect();
      if(!active||busy||!showAverage)return;
      alignAverageMetrics();
      alignmentObserver.observe(list);
      list.querySelectorAll('.structure-heading>.structure-chart-scroll').forEach(chart=>alignmentObserver.observe(chart,{box:'border-box'}));
    }
    function observeCharts(root=list) {
      root.querySelectorAll('[data-chart],[data-average-chart]').forEach(chart=>{if(!animated.has(animationKey(chart)))observer.observe(chart);});
      watchAverageAlignment();
    }
    function stopAnimations() {
      observer.disconnect();alignmentObserver.disconnect();cancelAnimationFrame(frame);animations.clear();
      window.BpmCardVisuals.cancelCounters(list);
    }
    function render() {
      if(!active)return;
      stopAnimations();disposePageSelects();filterTree();renderChips();syncSummary();
      list.setAttribute('aria-busy',String(busy));
      if(busy)list.innerHTML=Array.from({length:Math.min(tree.length||4,8)},()=>'<div class="structure-skeleton" aria-hidden="true"><span class="skeleton-shape skeleton-title"></span><span class="skeleton-shape skeleton-line"></span><span class="skeleton-shape skeleton-line"></span></div>').join('');
      else {
        list.innerHTML=tree.length?tree.map(nodeMarkup).join(''):'<div class="structure-empty"><h2>Ничего не найдено</h2><p>Измените запрос или сбросьте фильтры структуры.</p><button class="button secondary-button" data-structure-reset>Сбросить фильтры</button></div>';
        mountPageSelects();observeCharts();window.BpmCardVisuals.animateCounters(list);
      }
    }
    function reload() {
      if(!active)return;
      clearTimeout(timer);animated.clear();busy=true;render();
      timer=setTimeout(()=>{if(!active)return;busy=false;render();},LOAD_MS);
    }
    function writeChart(chart,progress) {
      if(chart.hasAttribute('data-average-chart')){window.BPMStructureCharts.writeAverage(chart,progress);return;}
      chart.querySelectorAll('[data-structure-number]').forEach(number=>number.textContent=format(Math.floor(Number(number.dataset.structureNumber)*progress)));
      chart.querySelectorAll('[data-fill]').forEach(fill=>{
        const ratio=Number(fill.dataset.fill)*progress;
        fill.style.transform=`scaleX(${ratio})`;
        if(fill.parentElement.parentElement.dataset.bucket==='4')fill.parentElement.style.setProperty('--structure-fill-ratio',ratio);
      });
    }
    function animateChart(chart) {
      if(animated.has(animationKey(chart))||motion.matches){writeChart(chart,1);animated.add(animationKey(chart));return;}
      animations.set(chart,performance.now());writeChart(chart,0);
      if(animations.size===1)frame=requestAnimationFrame(tick);
    }
    function tick(now) {
      for(const [chart,start] of animations) {
        if(!chart.isConnected||!chart.getClientRects().length){animations.delete(chart);continue;}
        const p=Math.max(0,Math.min(1,(now-start-70)/ANIMATION_MS));
        writeChart(chart,1-(1-p)**3);
        if(p===1){animated.add(animationKey(chart));animations.delete(chart);}
      }
      if(animations.size)frame=requestAnimationFrame(tick);
    }
    motion.addEventListener('change',e=>{if(e.matches){list.querySelectorAll('[data-chart],[data-average-chart]').forEach(chart=>{writeChart(chart,1);animated.add(animationKey(chart));});animations.clear();observer.disconnect();cancelAnimationFrame(frame);}});
    function reset() {
      clearTimeout(searchTimer);query='';favoritesOnly=false;$('structure-search').value='';
      Object.keys(filters).forEach(key=>{filters[key]=[];selects[key].set([]);});ownerFilters[entity]=[];opened.clear();openedPaths.clear();pages.clear();detailTables.clear();reload();
    }
    function replaceTable(id,focusSelector) {
      const panel=$(`panel-${id}`),node=visibleNodes.get(id)||detailTables.get(id);if(!panel||!node)return;
      window.BpmCardVisuals.cancelCounters(panel);disposePageSelects(panel);panel.innerHTML=node.recordEntity?linkedContent(node):table(node);mountPageSelects(panel);
      if(focusSelector)panel.querySelector(focusSelector)?.focus({preventScroll:true});
      window.BpmCardVisuals.animateCounters(panel);
    }
    list.addEventListener('click',e=>{
      const expand=e.target.closest('[data-expand]');
      if(expand){
        const id=expand.dataset.expand,node=visibleNodes.get(id),panel=$(`panel-${id}`),isOpen=!opened.has(id);
        if(!node)return;
        if(isOpen)opened.add(id);else opened.delete(id);
        expand.setAttribute('aria-expanded',String(isOpen));panel.hidden=!isOpen;
        if(isOpen){disposePageSelects(panel);panel.innerHTML=content(node);mountPageSelects(panel);observeCharts(panel);window.BpmCardVisuals.animateCounters(panel);}
        else {disposePageSelects(panel);panel.querySelectorAll('[data-chart],[data-average-chart]').forEach(chart=>{observer.unobserve(chart);animations.delete(chart);});window.BpmCardVisuals.cancelCounters(panel);}
        watchAverageAlignment();syncSummary();return;
      }
      const page=e.target.closest('[data-structure-page]');
      if(page){if(page.disabled||page.getAttribute('aria-current')==='page')return;pages.set(page.dataset.structurePage,Number(page.dataset.page));replaceTable(page.dataset.structurePage,'.structure-table-scroll');$(`panel-${page.dataset.structurePage}`)?.querySelector('.structure-table-scroll')?.scrollIntoView({block:'start',behavior:'instant'});return;}
      const sortButton=e.target.closest('[data-structure-sort]');
      if(sortButton){const id=sortButton.dataset.structureSort,key=sortButton.dataset.column;rowSorts.set(id,`${key}-${rowSorts.get(id)===`${key}-asc`||(!rowSorts.has(id)&&key==='id')?'desc':'asc'}`);replaceTable(id,`[data-column="${key}"]`);return;}
      if(e.target.closest('[data-structure-reset]')){reset();return;}
      const pathButton=e.target.closest('[data-structure-related]');
      if(pathButton){
        const id=`links-${pathButton.dataset.product}-${pathButton.dataset.structureRelated}`,node=detailTables.get(id),panel=$(`panel-${id}`);
        if(!node||!panel)return;
        const isOpen=!openedPaths.has(id);if(isOpen)openedPaths.add(id);else openedPaths.delete(id);
        pathButton.setAttribute('aria-expanded',String(isOpen));panel.closest('.structure-linked-row').hidden=!isOpen;
        pathButton.closest('[data-structure-record]').dataset.expanded=String(isOpen);
        window.BpmCardVisuals.cancelCounters(panel);disposePageSelects(panel);
        if(isOpen){panel.innerHTML=linkedContent(node);mountPageSelects(panel);window.BpmCardVisuals.animateCounters(panel);}return;
      }
      const action=e.target.closest('[data-structure-detail],[data-structure-copy],[data-structure-menu]');
      if(action){const row=records.get(action.dataset.structureDetail||action.dataset.structureCopy||action.dataset.structureMenu);if(!row)return;if(action.dataset.structureCopy)api.copy(row);else if(action.dataset.structureMenu)api.menu(row,action);else api.detail(row,action);return;}
      if(e.target.closest('button,a,input')||window.getSelection()?.toString())return;
      const tr=e.target.closest('[data-structure-record]');if(tr)api.detail(records.get(tr.dataset.structureRecord),tr.querySelector('[data-structure-detail]'));
    });
    $('structure-search').addEventListener('input',e=>{query=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{pages.clear();reload();},180);});
    $('structure-clear-search').addEventListener('click',()=>{clearTimeout(searchTimer);query='';$('structure-search').value='';reload();$('structure-search').focus();});
    $('structure-reset').addEventListener('click',reset);
    $('structure-entity-tabs').addEventListener('click',e=>{const tab=e.target.closest('[data-structure-entity]');if(tab)setEntity(tab.dataset.structureEntity);});
    $('structure-chart-toggle').addEventListener('change',e=>setChartType(e.target.checked?'1':'2'));
    $('structure-average-toggle').addEventListener('click',()=>setAverageVisible(!showAverage));
    $('structure-chips').addEventListener('click',e=>{
      const button=e.target.closest('[data-structure-filter]');if(!button)return;
      const key=button.dataset.structureFilter,value=button.dataset.value;
      if(key==='query'){query='';$('structure-search').value='';}
      else if(key==='favorites')favoritesOnly=false;
      else {filters[key]=filters[key].filter(v=>v!==value);selects[key].set(filters[key]);if(key==='owner')ownerFilters[entity]=[...filters[key]];}
      reload();$('structure-search').focus({preventScroll:true});
    });
    return {
      enter(){active=true;opened.clear();openedPaths.clear();pages.clear();detailTables.clear();reload();},
      leave(){active=false;clearTimeout(timer);clearTimeout(searchTimer);stopAnimations();disposePageSelects();Object.values(selects).forEach(select=>select.close());},
      reload,
      refresh(){render();},
      toggleFavorites(){favoritesOnly=!favoritesOnly;reload();},
      getEntity(){return entity;},
      exportRecords(scope='filtered') {
        if(scope==='page')return unique([...list.querySelectorAll('[data-structure-record]')].filter(el=>el.getClientRects().length).map(el=>records.get(el.dataset.structureRecord)).filter(row=>row?.entity===entity));
        return unique(tree.flatMap(n=>n.records));
      }
    };
  }
  window.BpmStructure=Object.freeze({create,chartLayout});
})();

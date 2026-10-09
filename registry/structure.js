/* Nested registry structure: processes/client paths, absolute/normalized charts. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<img src="assets/${name}.svg" alt="">`;
  const format = n => Number(n).toLocaleString('ru-RU');
  const normalize = value => String(value).toLocaleLowerCase('ru').replace(/ё/g,'е');
  const labels = {block:'Блоки',division:'Подразделения',query:'Поиск',favorites:'Список',product:'Продукты',paths:'Клиентские пути',processes:'Процессы',people:'Люди',divisionLeader:'Руководители подразделений',processOwner:'Владельцы процессов',pathOwner:'Владельцы клиентских путей'};
  const kindLabels = {block:'Блок',division:'Подразделение',product:'Продукт'};
  const PAGINATION_THRESHOLD = 50, DEFAULT_PAGE_SIZE = 50, PAGE_SIZES = [25,50,75,100], LOAD_MS = 2000, ANIMATION_MS = 1100;

  function chartLayout(buckets, maxima, type = '1') {
    return window.BPMStructureCharts.layout(buckets,maxima,type);
  }

  function create(api) {
    const models = {processes:window.BPM_STRUCTURE,paths:window.BPM_STRUCTURE_PATHS};
    let entity='processes', model=models.processes;
    const chartType='2', showAverage=true;
    const list = $('structure-list');
    list.classList.toggle('has-average',showAverage);
    const baseNodes = new Map(model.nodes.map(node => [node.id,node]));
    const records = new Map(Object.values(models).flatMap(m=>m.records).map(row => [row.id,row]));
    // Client paths disclose their processes. The reverse relationships remain
    // in the source/search models but are not an extra level in the process view.
    const processesByPath = new Map();
    for(const path of models.paths.records) {
      const linked=[...new Map((path.linkedProcesses||[]).map(row=>[row.id,row])).values()]
        .sort((a,b)=>(a.number-b.number)||a.id.localeCompare(b.id));
      processesByPath.set(path.id,linked.map((row,index)=>{
        // Approved demo classification belongs to the relationship, not to the
        // process itself. Stable source-ID order makes it independent of UI sort.
        return {...row,relationshipType:index%4===3?'Дополнительный':'Основной',relationshipSimulated:true};
      }));
    }
    const pathProcessDistributions = new Map([...processesByPath].map(([id,rows])=>{
      const buckets=[0,0,0,0,0];rows.forEach(row=>buckets[row.bucket]++);
      return [id,{buckets,total:rows.length}];
    }));
    const filters = {block:[],division:[]};
    const hiddenLevels = new Set();
    const emptyEntityFilters=()=>({product:[],paths:[],processes:[],people:[],divisionLeader:[],processOwner:[],pathOwner:[]});
    const entityFilters = emptyEntityFilters();
    const searchCatalog = window.BPMStructureSearchModel.create(models);
    const opened = new Set(), pages = new Map(), rowSorts = new Map(), animated = new Set();
    const pageSizes = new Map(), pageSelects = new Map();
    const openedPaths = new Set(), detailTables = new Map();
    const selects = {};
    let active=false, busy=false, query='', sort='count-desc', favoritesOnly=false;
    let timer, searchTimer, frame, tree=[], canonicalTree=[], visibleNodes=new Map(), revealSelection=false;
    let cachedQuery='', queryMatches=emptyEntityFilters();
    const animations = new Map();
    const animationKey = chart => chart.hasAttribute('data-average-chart') ? `average:${chart.dataset.averageChart}` : chart.dataset.chart;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if(entry.isIntersecting) { observer.unobserve(entry.target); animateChart(entry.target); }
    }), {threshold:0.1});
    const alignmentObserver = new ResizeObserver(alignAverageMetrics);

    const visibility = key => ({shown:!hiddenLevels.has(key),label:labels[key],onChange:shown=>{
      if(shown)hiddenLevels.delete(key);else hiddenLevels.add(key);
      // Visibility only changes grouping. Filters, expansion state and each
      // original table's pagination/sorting survive a hide/show round trip.
      render();
    }});
    for(const key of Object.keys(filters)) {
      const entries = model.nodes.filter(n=>n.kind===key).map(n=>({value:n.id,label:n.name}));
      selects[key]=api.createSelect(`structure-${key}`,{label:labels[key],options:entries,multiple:true,visibility:visibility(key),onChange:values=>{filters[key]=[...values];pages.clear();reload();}});
    }
    selects.product=api.createSelect('structure-product',{label:labels.product,options:model.nodes.filter(node=>node.kind==='product').map(node=>({value:node.id,label:node.name})),multiple:true,visibility:visibility('product'),onChange:values=>{entityFilters.product=[...values];pages.clear();reload();}});
    selects.sort=api.createSelect('structure-sort',{label:'Сортировка',allowAll:false,icon:'sort',values:[sort],options:[{value:'count-desc',label:'Количество ↓'},{value:'count-asc',label:'Количество ↑'},{value:'name-asc',label:'Название А–Я'},{value:'average-desc',label:'Средняя эффективность ↓'},{value:'average-asc',label:'Средняя эффективность ↑'}],onChange:values=>{sort=values[0];render();}});
    $('structure-path-count').textContent=format(models.paths.total);
    $('structure-process-count').textContent=format(models.processes.total);
    const invalid=model.sourceIssues.filter(issue=>issue.type==='invalid-process-code');
    const aliases=model.sourceIssues.filter(issue=>issue.type==='process-title-aliases');
    $('structure-source-issues').textContent=`${invalid.length} строк без корректного кода процесса не включены в счётчики (строки Excel: ${invalid.map(issue=>issue.row).join(', ')}). Для ${aliases.length} процессов встречаются варианты названий — показывается наиболее частый, все варианты сохранены. Продуктов с идентификатором: ${model.productCount}; служебных групп без установленного продукта: ${model.placeholderCount}. Отсутствующие в Excel статусы и даты не заполнены. Руководители блоков и подразделений в Excel не указаны — для макета используются демонстрационные ФИО. Владельцы продуктов и процессов сохранены из источника. Связи КП ↔ процессы сохранены из Excel; типы участия «Основной / Дополнительный» — демонстрационные, по согласованию с пользователем.`;
    const unique = rows => [...new Map(rows.map(row=>[row.id,row])).values()];
    const hasEntityFilters = () => Object.values(entityFilters).some(values=>values.length);
    const searchUI=window.BPMStructureSearch.mount({input:$('structure-search'),anchor:$('structure-search-wrap'),catalog:searchCatalog,
      isActive:()=>active,isSelected:entry=>entityFilters[entry.kind].includes(entry.id)||(entry.person&&entityFilters.people.includes(entry.id)),
      onCopy:entry=>api.copyText(entry.code),onChoose:entry=>{
        if(entityFilters[entry.kind].includes(entry.id))return;
        entityFilters[entry.kind].push(entry.id);
        if(entry.kind==='product')selects.product.set(entityFilters.product);
        clearTimeout(searchTimer);query='';$('structure-search').value='';
        revealSelection=true;opened.clear();openedPaths.clear();pages.clear();detailTables.clear();reload();
        $('structure-search-status').textContent=`Добавлен фильтр: ${[entry.code,entry.title].filter(Boolean).join(' ')}`;
        $('structure-search').focus({preventScroll:true});
      }});

    const peopleKeys=['people','divisionLeader','processOwner','pathOwner'];
    const selectedPeople=()=>new Set(peopleKeys.flatMap(key=>entityFilters[key]));
    const peopleChanged=()=>{revealSelection=hasEntityFilters();pages.clear();reload();};
    const peopleUI=window.BPMStructurePeople.mount({button:$('structure-people'),people:searchCatalog.people,getSelected:selectedPeople,
      beforeOpen:()=>{searchUI.close();Object.values(selects).forEach(select=>select.close());},
      onToggle:id=>{
        if(selectedPeople().has(id))peopleKeys.forEach(key=>{entityFilters[key]=entityFilters[key].filter(value=>value!==id);});
        else entityFilters.people.push(id);
        peopleChanged();
      },
      onClear:()=>{peopleKeys.forEach(key=>{entityFilters[key]=[];});peopleChanged();}
    });

    function buildTree(sourceModel) {
      const needle=normalize(query.trim());
      if(cachedQuery!==needle){
        cachedQuery=needle;queryMatches=emptyEntityFilters();
        searchCatalog.search(query).forEach(entry=>queryMatches[entry.kind].push(entry.id));
      }
      const sourceEntity=sourceModel===models.paths?'paths':'processes';
      const matchingEntity=(node,row)=>Object.entries(queryMatches).some(([kind,ids])=>ids.length&&searchCatalog.matches(node,row,sourceEntity,{[kind]:ids}));
      function visit(node,path=[]) {
        if(node.kind==='block' && filters.block.length && !filters.block.includes(node.id))return null;
        if(node.kind==='division' && filters.division.length && !filters.division.includes(node.id))return null;
        const names=[...path,node.name];
        let children=[], rows=[];
        if(node.kind==='product') {
          rows=node.records.filter(row=>searchCatalog.matches(node,row,sourceEntity,entityFilters)&&(!favoritesOnly||api.isFavorite(row))&&(!needle||matchingEntity(node,row)||normalize(`${names.join(' ')} ${row.title} ${row.code||''} ${row.number} ${(row.owners||[row.owner]).join(' ')} ${row.products?.join(' ')||''}`).includes(needle)));
          const emptyProductMatch=!node.records.length&&!favoritesOnly&&searchCatalog.matches(node,null,sourceEntity,entityFilters)&&(!needle||matchingEntity(node,null)||normalize(names.join(' ')).includes(needle));
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
      const sortNodes=nodes=>nodes.sort(compareNodes).map(node=>({...node,children:sortNodes(node.children)}));
      return sortNodes(sourceModel.roots.map(node=>visit(node)).filter(Boolean));
    }
    function compareNodes(a,b) {
        const byName=()=>a.name.localeCompare(b.name,'ru');
        if(sort==='name-asc')return byName();
        if(sort==='average-asc'||sort==='average-desc') {
          const av=a.averageEfficiency,bv=b.averageEfficiency;
          // Missing evaluations are not zero and stay last in either direction.
          if(av===null||bv===null)return av===bv?byName()||a.id.localeCompare(b.id):av===null?1:-1;
          return (sort==='average-asc'?av-bv:bv-av)||byName()||a.id.localeCompare(b.id);
        }
        return (sort==='count-asc'?a.total-b.total:b.total-a.total)||byName();
    }
    function filterTree() {
      canonicalTree=buildTree(model);
      const projected=window.BPMStructureLevels.project(canonicalTree,{hidden:hiddenLevels,compare:compareNodes,flatId:`structure-flat-${entity}`});
      tree=projected.roots;visibleNodes=projected.byId;
      list.style.setProperty('--max-level',String(Math.max(0,projected.maxDepth)));
      if(revealSelection){visibleNodes.forEach(node=>opened.add(node.id));revealSelection=false;}
    }

    function chart(node) {
      return window.BPMStructureCharts.render({id:node.id,buckets:node.buckets,maxima:model.maxima,type:chartType,colors:model.colors,entity,total:node.total,done:animated.has(node.id)||motion.matches});
    }
    function averageChart(node) {
      return window.BPMStructureCharts.renderAverage({id:node.id,records:node.records,done:animated.has(`average:${node.id}`)||motion.matches});
    }
    function pathProcessChart(row,node) {
      // A path can appear in several products. Each visible occurrence needs
      // its own animation key, but all use the same unique linked processes.
      const id=`path-processes-${node.id}-${row.id}`;
      const distribution=pathProcessDistributions.get(row.id)||{buckets:[0,0,0,0,0],total:0};
      // These are process counts, not path counts. Keep the existing, fixed
      // process leader scale in Chart 1; a path-specific scale would undermine
      // quantitative comparisons and the path model's maxima could clip bars.
      const markup=window.BPMStructureCharts.render({id,...distribution,maxima:models.processes.maxima,type:chartType,colors:models.processes.colors,entity:'processes',done:animated.has(id)||motion.matches});
      return `<span class="structure-path-process-chart" data-path-process-chart="${row.id}" data-product-chart="${node.id}">${markup}</span>`;
    }
    function owner(name,owners=[],simulated=false,fallbackKey='') {const displayName=window.BpmAvatars.displayName(name,fallbackKey);const title=simulated?`Демонстрационный руководитель: ${displayName}`:owners.join('; ');return `<span class="structure-owner"${title?` title="${esc(title)}"`:''}><span class="avatar" aria-hidden="true">${window.BpmAvatars.portrait(displayName)}</span><span>${esc(displayName)}</span></span>`;}
    function nodeMarkup(node) {
      if(node.synthetic)return `<div class="structure-flat" id="panel-${node.id}" role="region" aria-label="${entity==='paths'?'Все клиентские пути':'Все процессы'}">${table(node)}</div>`;
      const isOpen=opened.has(node.id);
      return `<article class="structure-node" data-kind="${node.kind}" data-node="${node.id}" style="--level:${node.depth}"><button class="structure-heading" id="heading-${node.id}" aria-expanded="${isOpen}" aria-controls="panel-${node.id}" data-expand="${node.id}"><span class="structure-title">${icon(node.kind)}<span class="structure-title-copy"><span class="structure-kind">${kindLabels[node.kind]}</span><span class="structure-name">${esc(node.name)}</span></span></span>${owner(node.owner,node.owners,node.ownerSimulated,`${node.id}:owner`)}${showAverage?averageChart(node):''}${chart(node)}<span class="structure-chevron">${icon('chevron-down')}</span></button><div class="structure-children" id="panel-${node.id}" aria-labelledby="heading-${node.id}"${isOpen?'':' hidden'}>${isOpen?content(node):''}</div></article>`;
    }
    function content(node) {return !node.children.length?(node.total?table(node):`<div class="structure-empty"><p>${entity==='paths'?'В источнике нет связанного клиентского пути.':'В источнике нет связанного процесса с корректным кодом.'} Группа сохранена в структуре.</p></div>`):node.children.map(nodeMarkup).join('');}
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
      const drillId=`links-${node.id}-${row.id}`, pathOpen=isPath&&openedPaths.has(drillId);
      const relatedEntity='processes';
      const linked=isPath?(processesByPath.get(row.id)||[]):[];
      // For client paths, count is the number of linked processes, not variants.
      const variantCount=row.variantCount??(isPath?0:row.count);
      const expansion=!isPath?'':linked.length
        ? `<button class="structure-row-count" data-structure-related="${row.id}" data-structure-path="${row.id}" data-product="${node.id}" aria-expanded="${pathOpen}" aria-controls="panel-${drillId}">${relatedCountLabel(linked.length,relatedEntity)} ${icon('chevron-down')}</button>`
        : '<span class="structure-row-count structure-no-efficiency">Нет связанных процессов</span>';
      const efficiency=`<span class="structure-efficiency structure-bucket-${row.bucket}">${row.efficiency===null?'<span class="structure-no-efficiency">Нет оценки</span>':window.BpmCardVisuals.efficiency(row,true)}</span>`;
      const more=`<button class="structure-row-more icon-button" data-structure-menu="${row.id}" aria-label="Действия с ${isPath?'клиентским путём':'процессом'} ${row.number}" aria-haspopup="menu">${icon('more')}</button>`;
      const metrics=isPath?`<td class="structure-path-efficiency-cell">${efficiency}</td><td class="structure-path-chart-cell">${pathProcessChart(row,node)}${more}</td>`:`<td class="structure-process-efficiency-cell">${efficiency}${more}</td>`;
      const main=`<tr data-structure-record="${row.id}" data-record-entity="${row.entity}" data-expanded="${pathOpen}"><td class="structure-row-title-cell"><div class="structure-row-meta">${favorite?'<span class="favorite-heart" role="img" aria-label="В избранном">'+icon('liked')+'</span>':''}<button class="id-badge" data-structure-copy="${row.id}" aria-label="Скопировать ${esc(idLabel)}"${row.numberSimulated?' title="Демонстрационный ID: в исходном Excel идентификатор КП отсутствует"':''}>${esc(idLabel)}${icon('copy')}</button>${row.type?`<span class="tag">${esc(row.type)}</span>`:''}${variantCount?`<span class="count-badge">${variantCount} ${variantCount%10===1&&variantCount%100!==11?'вариант':variantCount%10>=2&&variantCount%10<=4&&(variantCount%100<12||variantCount%100>14)?'варианта':'вариантов'}${icon('info')}</span>`:''}</div><button class="structure-row-title" data-structure-detail="${row.id}">${esc(row.title)}</button>${expansion}</td><td class="structure-row-owner-cell">${owner(row.owner,row.owners,false,`${row.id}:owner`)}</td>${metrics}</tr>`;
      if(!linked.length)return main;
      const linkedNode={id:drillId,parentId:node.id,name:row.title,records:linked,total:linked.length,recordEntity:relatedEntity};
      detailTables.set(drillId,linkedNode);
      return main+`<tr class="structure-linked-row"${pathOpen?'':' hidden'}><td colspan="${isPath?4:3}"><div class="structure-linked-processes" id="panel-${drillId}">${pathOpen?linkedContent(linkedNode):''}</div></td></tr>`;
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
      const isPathTable=tableEntity==='paths';
      const columns=isPathTable?'<col><col><col><col>':'<col><col><col>';
      return `<div class="structure-table-scroll" tabindex="0" role="region" aria-label="${entityName}: ${esc(node.name)}; таблицу можно прокручивать по горизонтали"><table class="structure-table ${isPathTable?'structure-path-table':'structure-process-table'}" data-table-entity="${tableEntity}"><caption class="sr-only">${esc(node.name)} — ${entityName}</caption><colgroup>${columns}</colgroup><thead><tr>${headings.map(([label,key])=>{const active=sortValue.startsWith(`${key}-`),desc=active&&sortValue.endsWith('desc');return `<th scope="col"${active?` aria-sort="${desc?'descending':'ascending'}"`:''}><button class="table-sort-button" data-structure-sort="${node.id}" data-column="${key}" data-active="${active}" aria-label="${label}: по ${active&&!desc?'убыванию':'возрастанию'}"><span class="structure-column-label">${label==='Эффективность'?'Эф\u00adфек\u00adтив\u00adность':label}</span><img class="table-sort-arrow${desc?' is-reversed':''}" src="assets/arrow-down.svg" alt=""></button></th>`;}).join('')}${isPathTable?'<th scope="col" class="structure-path-chart-heading"><span class="structure-column-label">Процессы</span></th>':''}</tr></thead><tbody>${selected.map(row=>rowMarkup(row,node)).join('')}</tbody></table></div>${pagination}`;
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
      peopleUI.refresh();
      const groups=Object.entries(filters).filter(([,v])=>v.length).map(([key,values])=>({key,values}));
      Object.entries(entityFilters).filter(([,v])=>v.length).forEach(([key,values])=>groups.push({key,values}));
      if(query.trim())groups.unshift({key:'query',values:[query]});
      if(favoritesOnly)groups.push({key:'favorites',values:['Избранное']});
      $('structure-selected').hidden=!groups.length;
      $('structure-chips').innerHTML=groups.map(({key,values})=>`<div class="applied-filter-group"><span class="applied-filter-label">${labels[key]}</span>${values.map(value=>{const entry=searchCatalog.get(key,value),label=entry?[entry.code,entry.title].filter(Boolean).join(' · '):baseNodes.get(value)?.name||value;return `<span class="chip applied-filter-chip" title="${esc(label)}"><span class="chip-text">${esc(label)}</span><button data-structure-filter="${key}" data-value="${esc(value)}" aria-label="Убрать фильтр ${esc(label)}">${icon('close-16')}</button></span>`;}).join('')}</div>`).join('');
      $('structure-clear-search').hidden=!query;
    }
    function syncSummary() {
      list.dataset.entity=entity;
      const total=unique(canonicalTree.flatMap(n=>n.records)).length;
      for(const key of Object.keys(models)) {
        const count=key===entity?total:unique(buildTree(models[key]).flatMap(n=>n.records)).length;
        $(key==='paths'?'structure-path-count':'structure-process-count').textContent=format(count);
        const tab=$(`structure-${key}-tab`);tab.classList.toggle('active',key===entity);tab.setAttribute('aria-pressed',String(key===entity));
        tab.setAttribute('aria-label',`${key==='paths'?'Клиентские пути':'Процессы'} ${format(count)}`);
      }
      const entityLabel=entity==='paths'?'клиентских путей':'процессов';
      $('structure-mode').setAttribute('aria-label',`Структура ${entityLabel}`);
      $('structure-search').setAttribute('aria-label','Поиск продукта, клиентского пути, процесса или человека');
      $('structure-data-note').textContent=`Структура, клиентские пути и процессы — из файла «15092026_структура для подготовки мока данных.xlsx».${entity==='paths'?' Идентификаторы КП-ДЕМО условные: в Excel ID клиентских путей отсутствуют.':''}`;
      $('structure-chart-note').textContent='Соотношение эффективности · Structure Chart 2 — сегменты заполняют 100% площади каждой диаграммы.';
      api.onChange?.({favoritesOnly,favoritesCount:model.records.filter(api.isFavorite).length});
      list.setAttribute('aria-label',hiddenLevels.size===3?'Единый список без группировки':'Дерево структуры');
      if(active)$('result-announcement').textContent=busy?`Загрузка структуры ${entityLabel}…`:`Структура: блоков ${canonicalTree.length}, ${entityLabel} ${total}.${hiddenLevels.size?` Скрыты уровни: ${[...hiddenLevels].map(key=>labels[key]).join(', ')}. Выбранные фильтры сохранены.`:''}`;
    }
    function setEntity(next) {
      if(next===entity||!models[next])return;
      clearTimeout(searchTimer);searchUI.close();peopleUI.close();Object.values(selects).forEach(select=>select.close());
      entity=next;model=models[entity];
      selects.product.setOptions(model.nodes.filter(node=>node.kind==='product').map(node=>({value:node.id,label:node.name})));
      opened.clear();openedPaths.clear();pages.clear();pageSizes.clear();rowSorts.clear();detailTables.clear();revealSelection=hasEntityFilters();reload();
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
      clearTimeout(searchTimer);searchUI.close();peopleUI.close();query='';favoritesOnly=false;$('structure-search').value='';
      Object.keys(entityFilters).forEach(key=>entityFilters[key]=[]);revealSelection=false;
      selects.product.set([]);
      Object.keys(filters).forEach(key=>{filters[key]=[];selects[key].set([]);});opened.clear();openedPaths.clear();pages.clear();detailTables.clear();reload();
    }
    function replaceTable(id,focusSelector) {
      const panel=$(`panel-${id}`),node=visibleNodes.get(id)||detailTables.get(id);if(!panel||!node)return;
      panel.querySelectorAll('[data-chart],[data-average-chart]').forEach(chart=>{observer.unobserve(chart);animations.delete(chart);});
      window.BpmCardVisuals.cancelCounters(panel);disposePageSelects(panel);panel.innerHTML=node.recordEntity?linkedContent(node):table(node);mountPageSelects(panel);
      if(focusSelector)panel.querySelector(focusSelector)?.focus({preventScroll:true});
      observeCharts(panel);window.BpmCardVisuals.animateCounters(panel);
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
    const searchChanged=()=>{query=$('structure-search').value;$('structure-clear-search').hidden=!query;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{pages.clear();reload();},180);};
    $('structure-search').addEventListener('input',e=>{if(!e.isComposing)searchChanged();});
    $('structure-search').addEventListener('compositionend',searchChanged);
    $('structure-clear-search').addEventListener('click',()=>{clearTimeout(searchTimer);searchUI.close();query='';$('structure-search').value='';reload();$('structure-search').focus();});
    $('structure-reset').addEventListener('click',reset);
    $('structure-entity-tabs').addEventListener('click',e=>{const tab=e.target.closest('[data-structure-entity]');if(tab)setEntity(tab.dataset.structureEntity);});
    $('structure-chips').addEventListener('click',e=>{
      const button=e.target.closest('[data-structure-filter]');if(!button)return;
      const key=button.dataset.structureFilter,value=button.dataset.value;
      if(key==='query'){query='';$('structure-search').value='';}
      else if(key==='favorites')favoritesOnly=false;
      else if(Object.hasOwn(entityFilters,key)){entityFilters[key]=entityFilters[key].filter(v=>v!==value);if(key==='product')selects.product.set(entityFilters.product);revealSelection=hasEntityFilters();pages.clear();}
      else {filters[key]=filters[key].filter(v=>v!==value);selects[key].set(filters[key]);}
      clearTimeout(searchTimer);searchUI.close();reload();$('structure-search').focus({preventScroll:true});
    });
    return {
      enter(){active=true;opened.clear();openedPaths.clear();pages.clear();detailTables.clear();revealSelection=hasEntityFilters();reload();},
      leave(){active=false;searchUI.close();peopleUI.close();clearTimeout(timer);clearTimeout(searchTimer);stopAnimations();disposePageSelects();Object.values(selects).forEach(select=>select.close());},
      reload,
      refresh(){render();},
      toggleFavorites(){favoritesOnly=!favoritesOnly;reload();},
      getEntity(){return entity;},
      exportRecords(scope='filtered') {
        if(scope==='page')return unique([...list.querySelectorAll('[data-structure-record]')].filter(el=>el.getClientRects().length).map(el=>records.get(el.dataset.structureRecord)).filter(row=>row?.entity===entity));
        return unique(canonicalTree.flatMap(n=>n.records));
      }
    };
  }
  window.BpmStructure=Object.freeze({create,chartLayout});
})();

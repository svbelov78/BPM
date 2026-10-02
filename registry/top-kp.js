/* Excel hierarchy rendered as a compact capability map. Leaf widths are global;
 * business data never comes from the placeholder labels in the Figma sample. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const data=window.BPM_TOP_KP, records=new Map(data.records.map(record=>[record.id,record]));
  const categories=new Map();
  data.blocks.forEach(block=>{categories.set(block.sourceCell,block);block.departments.forEach(dept=>{categories.set(dept.sourceCell,dept);dept.groups.forEach(group=>{if(group.sourceCell)categories.set(group.sourceCell,group);});});});
  // Stable prototype values, explicitly synthetic. Source efficiency stays null.
  const sampleValues=[93,79,88,58,96,72,39,86,91,68,52,99,84,31,90,77];
  function demoEfficiency(record) {return sampleValues[(Number.parseInt(record.sourceCell.replace(/\d/g,''),36)+Number(record.sourceCell.match(/\d+/)[0])) % sampleValues.length];}
  // TOP-КП legend 158:20244: 0–44 / 45–64 / 65–84 / 85–100.
  function band(value) {return value==null?'none':value<45?'red':value<65?'yellow':value<85?'gray':'green';}
  const score = record => record.efficiency == null ? demoEfficiency(record) : record.efficiency;
  const row=(...children)=>({kind:'row',children}), stack=(...children)=>({kind:'stack',children});
  const group=(cell,columns=1)=>({kind:'group',cell,columns});
  const block=(cell,child)=>({kind:'block',cell,children:[child]});
  const department=(cell,child)=>({kind:'department',cell,children:[child]});
  const plan=[
    row(
      block('A1',row(stack(group('A2',2),group('B2',2)),group('D2',2))),
      block('H1',stack(row(group('H2'),group('I2')),group('J2',2))),
      block('K1',row(stack(group('K2',2),group('K6',2)),stack(group('L2',2),group('M2',2))))
    ),
    block('A9',row(
      department('A10',row(stack(group('A11',2),group('B11',2)),stack(group('C11',3),group('D11',3)),stack(group('F11'),group('E18')))),
      department('G10',group('G11')),
      department('H10',row(group('H11'),group('I11'))),
      department('A21',row(stack(group('A22'),group('B22')),stack(group('C22'),group('D22')),group('F22'),group('G22')))
    )),
    block('K9',row(group('K10',2),group('L10',2),group('M10',2),group('N10'),stack(group('S10'),group('O10')),group('Q10',2),stack(group('R10',3),group('P10',3))))
  ];
  function cardsFor(item) {return item.cards || item.groups.flatMap(group=>group.cards);}
  // Card gutters are always 4px; SSP padding provides the other half of
  // the visible 16px horizontal separation between neighbouring groups.
  const supportingCells=new Set(['K10','L10','M10','N10','O10','P10','Q10','R10','S10']);
  let compactSpacing=false;
  function groupMetrics(node) {
    return {cardGap:4,left:['L2','M2','C11','D11'].includes(node.cell)?8:0,right:8,vertical:compactSpacing?4:8,labelGap:compactSpacing?4:supportingCells.has(node.cell)||['A2','B2','D2','G11'].includes(node.cell)?10:8};
  }
  const nodeGap=node=>node.gap??(node.kind==='row'&&node.children.every(child=>child.kind==='block')?16:8);
  // Intrinsic width of the unwrapped design; max across all three bands.
  function widthOf(node,width,spacing) {
    if(node.kind==='group'){const metric=groupMetrics(node);return node.columns*width+(node.columns-1)*metric.cardGap+metric.left+metric.right;}
    const widths=node.children.map(child=>widthOf(child,width,spacing));
    return node.kind==='row'?widths.reduce((a,b)=>a+b,0)+nodeGap(node)*(widths.length-1):Math.max(...widths);
  }
  const spacing={cardGap:4,groupPadding:8,sectionGap:8};
  const tiers=[{name:'large',height:72,minWidth:270},{name:'regular',height:60,minWidth:100},{name:'small',height:48,minWidth:80},{name:'compact',height:36,minWidth:48}];
  function frontier(states,maxWidth) {
    let best=Infinity;
    return states.filter(state=>state.width<=maxWidth).sort((a,b)=>a.width-b.width||a.height-b.height).filter(state=>{
      if(state.height>=best)return false;best=state.height;return true;
    });
  }
  function combine(a,b,kind,gap) {
    const children=a.node.kind===kind&&!a.node.cell&&nodeGap(a.node)===gap?[...a.node.children,b.node]:[a.node,b.node];
    return {width:kind==='row'?a.width+b.width+gap:Math.max(a.width,b.width),height:kind==='row'?Math.max(a.height,b.height):a.height+b.height+gap,node:{kind,children,gap}};
  }
  // Pareto packing: retain only layouts that improve width OR height. Each
  // candidate uses one shared leaf width; block/department membership is fixed.
  function layouts(node,cardWidth,cardHeight,available,forceRow=false) {
    if(node.kind==='group') {
      const item=categories.get(node.cell),count=cardsFor(item).length,states=[],metric=groupMetrics(node);
      for(let columns=1;columns<=count;columns++) {
        const width=columns*cardWidth+(columns-1)*metric.cardGap+metric.left+metric.right;if(width>available)break;
        const rows=Math.ceil(count/columns);
        states.push({width,height:metric.vertical*2+12+metric.labelGap+rows*cardHeight+(rows-1)*metric.cardGap,node:{...node,columns}});
      }
      return frontier(states,available);
    }
    let states=layouts(node.children[0],cardWidth,cardHeight,available);
    for(const child of node.children.slice(1)) {
      const next=layouts(child,cardWidth,cardHeight,available);
      const gap=forceRow?16:8;
      states=frontier(states.flatMap(a=>next.flatMap(b=>forceRow?[combine(a,b,'row',gap)]:[combine(a,b,'row',gap),combine(a,b,'stack',gap)])),available);
    }
    if(node.kind==='block'||node.kind==='department') {
      states=frontier(states.map(state=>({width:state.width,height:state.height+(node.kind==='block'||node.cell==='A21'?39:28),node:{...node,children:[state.node]}})),available);
    }
    return states;
  }
  function fitMap(cardWidth,tier,available,budget) {
    const floors=plan.map((node,index)=>layouts(node,cardWidth,tier.height,available,index===0));
    if(floors.some(states=>!states.length))return null;
    const picks=floors.map(states=>states.reduce((best,state)=>state.height<best.height?state:best));
    return picks.reduce((height,state)=>height+state.height,16)<=budget?picks.map(state=>state.node):null;
  }
  function chooseLayout(available,budget) {
    for(const tier of tiers) {
      let low=tier.minWidth,high=available,selected=fitMap(low,tier,available,budget);
      if(!selected)continue;
      // The finite column choices make the fit monotonic in shared card width.
      for(let step=0;step<12;step++) {
        const mid=(low+high)/2,candidate=fitMap(mid,tier,available,budget);
        if(candidate){low=mid;selected=candidate;}else high=mid;
      }
      return {tier,width:Math.floor(low*100)/100,plan:selected};
    }
    return null;
  }
  let api,root,active=false,observer,frame,hover,hoverTrigger,hoverTimer,restoringHoverFocus=false,lastSize='';
  const filterModel=window.BpmTopKpFilters,filters={},filterSelects=[];
  function applyFilters() {
    closeHover();
    let count=0;
    root.querySelectorAll('[data-top-kp-id]').forEach(button=>{
      const record=records.get(button.dataset.topKpId),matches=filterModel.matches(record,filters,score(record));
      button.disabled=!matches;
      button.classList.toggle('is-filtered-out',!matches);
      if(matches)count++;
    });
    const filtering=Object.values(filters).some(Boolean),counter=root.querySelector('.top-kp-count');
    root.querySelector('.top-kp-filter-toolbar').classList.toggle('has-active-filters',filtering);
    root.querySelector('.top-kp-reset-slot').hidden=!filtering;
    root.querySelector('.top-kp-reset').hidden=!filtering;
    counter.textContent=filtering?`${count} / ${records.size}`:String(records.size);
    counter.setAttribute('aria-label',filtering?`Соответствуют фильтрам ${count} из ${records.size}`:`Всего ${records.size}`);
    root.querySelector('.top-kp-filter-announcement').textContent=filtering?`Соответствуют фильтрам ${count} из ${records.size} клиентских путей. Остальные карточки недоступны.`:`Показаны все ${records.size} клиентских путей.`;
  }
  function code(record) {return window.BpmTopKpIdentifiers.codeFor(record);}
  // Project only prototype fields; never write invented values back to Excel data.
  function detailRecord(record) {
    return {...record,code:code(record),number:record.number||'',numberSimulated:!record.code,
      efficiency:score(record),efficiencySimulated:record.efficiency==null,
      owner:record.owner||'Не указан',ownerRole:record.ownerRole||'',linkedProcesses:record.linkedProcesses||[]};
  }
  function card(item) {
    const record=records.get(item.id),value=score(record),label=`${code(record)}. ${record.title}. Эффективность ${value}%, демонстрационная оценка. Открыть карточку`;
    return `<button type="button" class="top-kp-card" data-top-kp-id="${esc(record.id)}" data-band="${band(value)}" aria-label="${esc(label)}">${code(record)?`<span class="top-kp-card-code">${esc(code(record))}</span>`:''}<span class="top-kp-card-title">${esc(record.title)}</span></button>`;
  }
  function renderNode(node,maxColumns,spacing,cardWidth) {
    // max(row widths) is piecewise linear: evaluating at 0 and 1 would choose
    // the wrong widest child once a card grows. Use the actual shared width.
    const sizing=`width:${widthOf(node,cardWidth,spacing)}px;--top-node-gap:${nodeGap(node)}px`;
    if(node.kind==='row'||node.kind==='stack')return `<div class="top-kp-${node.kind}" style="${sizing}">${node.children.map(child=>renderNode(child,maxColumns,spacing,cardWidth)).join('')}</div>`;
    const item=categories.get(node.cell),headingId=`top-kp-heading-${item.key}`;
    if(node.kind==='group') {
      const columns=Math.min(maxColumns,node.columns),metric=groupMetrics(node);
      return `<section class="top-kp-group" data-source-category="${node.cell}" style="--top-columns:${columns};--top-gap:${metric.cardGap}px;--top-label-gap:${metric.labelGap}px;--top-group-left:${metric.left}px" aria-labelledby="${headingId}"><h4 class="top-kp-group-title" id="${headingId}" title="${esc(item.name)}">${esc(item.name)}</h4><div class="top-kp-cards">${cardsFor(item).map(card).join('')}</div></section>`;
    }
    const heading=node.kind==='block'?'h2':'h3';
    return `<section class="top-kp-${node.kind}${node.cell==='A21'?' top-kp-department--major':''}" style="${sizing}" data-source-category="${node.cell}" aria-labelledby="${headingId}"><${heading} id="${headingId}" title="${esc(item.name)}"><span>${esc(item.name)}</span></${heading}>${node.children.map(child=>renderNode(child,maxColumns,spacing,cardWidth)).join('')}</section>`;
  }
  function cancelHoverClose() {clearTimeout(hoverTimer);}
  function closeHover(restoreFocus=false) {
    cancelHoverClose();const trigger=hoverTrigger,popup=hover;
    // Removing a focused copy button fires focusout synchronously. Clear the
    // shared references first so that nested dismissal is harmless.
    hover=null;hoverTrigger=null;
    trigger?.removeAttribute('aria-controls');trigger?.removeAttribute('aria-expanded');
    popup?.remove();
    if(restoreFocus===true&&trigger?.isConnected){restoringHoverFocus=true;trigger.focus({preventScroll:true});restoringHoverFocus=false;}
  }
  function scheduleHoverClose() {cancelHoverClose();hoverTimer=setTimeout(()=>{if(!withinHover(document.activeElement))closeHover();},180);}
  function withinHover(target) {return target instanceof Node&&(hover?.contains(target)||hoverTrigger?.contains(target));}
  function positionHover() {
    const r=hoverTrigger.getBoundingClientRect(),b=hover.getBoundingClientRect(),margin=12,gap=2;
    const left=Math.max(margin,Math.min(innerWidth-b.width-margin,r.left+(r.width-b.width)/2));
    const above=r.top-gap-b.height>=margin;
    hover.dataset.placement=above?'above':'below';
    hover.style.left=`${left}px`;
    hover.style.top=`${Math.max(margin,Math.min(innerHeight-b.height-margin,above?r.top-gap-b.height:r.bottom+gap))}px`;
    hover.style.setProperty('--top-arrow-left',`${Math.max(16,Math.min(b.width-40,r.left+r.width/2-left-12))}px`);
  }
  function showHover(trigger) {
    cancelHoverClose();if(hoverTrigger===trigger&&hover)return;
    closeHover();if(!trigger||trigger.disabled||document.querySelector('dialog[open]'))return;
    const record=records.get(trigger.dataset.topKpId);if(!record)return;
    hoverTrigger=trigger;hover=document.createElement('div');hover.className='top-kp-hover';hover.id='top-kp-tooltip';
    // This tooltip has an actionable ID Counter, so expose a non-modal hover
    // card rather than putting an interactive control inside ARIA role=tooltip.
    hover.setAttribute('role','dialog');hover.setAttribute('aria-modal','false');
    hover.setAttribute('aria-labelledby','top-kp-tooltip-title');hover.setAttribute('aria-describedby','top-kp-tooltip-path');
    const hierarchy=[record.block,record.division,record.group].filter(Boolean).join(' / ');
    hover.innerHTML=`<div class="top-kp-hover-bubble"><div class="top-kp-hover-top"><button type="button" class="id-badge" data-top-copy aria-label="Скопировать ID ${esc(code(record))}"><span>${esc(code(record))}</span><img src="assets/top-kp/tooltip-copy.svg" width="16" height="16" alt=""></button>${window.BpmCardVisuals.efficiency({efficiency:score(record)})}</div><strong id="top-kp-tooltip-title">${esc(record.title)}</strong><p class="top-kp-hover-path" id="top-kp-tooltip-path">${esc(hierarchy)}</p></div><img class="top-kp-hover-arrow" src="assets/top-kp/tooltip-arrow.svg" width="24" height="8" alt="" aria-hidden="true">`;
    document.body.append(hover);
    trigger.setAttribute('aria-controls',hover.id);trigger.setAttribute('aria-expanded','true');
    positionHover();
    hover.addEventListener('pointerenter',cancelHoverClose);
    hover.addEventListener('pointerleave',event=>{if(!withinHover(event.relatedTarget))scheduleHoverClose();});
    hover.addEventListener('focusin',cancelHoverClose);
    hover.addEventListener('focusout',event=>{if(!withinHover(event.relatedTarget))closeHover();});
    hover.addEventListener('click',event=>{if(event.target.closest('[data-top-copy]'))api.copyText(code(record));});
    hover.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      if(event.shiftKey){event.preventDefault();hoverTrigger.focus({preventScroll:true});}
      else {closeHover(true);/* Native Tab then continues from the original card. */}
    });
  }
  function layout() {
    if(!active||root.hidden)return;
    const size=`${root.clientWidth}:${innerHeight}`;if(size===lastSize)return;
    lastSize=size;closeHover();
    compactSpacing=false;root.dataset.spacing='design';
    const styles=getComputedStyle(root),available=root.clientWidth-parseFloat(styles.paddingLeft)-parseFloat(styles.paddingRight);
    const map=root.querySelector('.top-kp-map'),focused=document.activeElement?.dataset.topKpId,scroll=root.querySelector('.top-kp-map-viewport').scrollTop;
    const heading=root.querySelector('.top-kp-heading');
    const documentTop=root.getBoundingClientRect().top+window.scrollY;
    const panelHeight=Math.max(200,innerHeight-documentTop-parseFloat(getComputedStyle(root.parentElement).paddingBottom));
    root.style.setProperty('--top-panel-height',`${panelHeight}px`);
    const heightBudget=()=>panelHeight-parseFloat(styles.paddingTop)-parseFloat(styles.paddingBottom)-heading.offsetHeight-parseFloat(getComputedStyle(heading).marginBottom)-2;
    let fitted=innerWidth>=1280?chooseLayout(available-2,heightBudget()):null;
    if(innerWidth>=1280&&(!fitted||fitted.tier!==tiers[0])) {
      compactSpacing=true;root.dataset.spacing='compact';
      const compact=chooseLayout(available-2,heightBudget());
      if(compact&&(!fitted||tiers.indexOf(compact.tier)<tiers.indexOf(fitted.tier)))fitted=compact;
      else {compactSpacing=false;root.dataset.spacing='design';}
    }
    root.dataset.fit=String(!!fitted);
    if(fitted) {
      root.style.setProperty('--top-card-width',`${fitted.width}px`);
      root.dataset.density=fitted.tier.name;
      map.innerHTML=fitted.plan.map(node=>renderNode(node,Infinity,spacing,fitted.width)).join('');
    } else {
      // Phones retain readable cards and native scroll; never scale the whole
      // map (which would also shrink its fixed 4/16px gutters and hit targets).
      const cardWidth=Math.max(80,Math.min(128,...plan.map(node=>(available-2-widthOf(node,0,spacing))/(widthOf(node,1,spacing)-widthOf(node,0,spacing)))));
      const maxColumns=Math.max(1,Math.floor((available-spacing.groupPadding*2+spacing.cardGap)/(cardWidth+spacing.cardGap)));
      root.style.setProperty('--top-card-width',`${Math.floor(cardWidth*100)/100}px`);
      root.dataset.density='compact';
      map.innerHTML=plan.map(node=>renderNode(node,maxColumns,spacing,cardWidth)).join('');
    }
    applyFilters();
    root.querySelector('.top-kp-map-viewport').scrollTop=scroll;
    if(focused)root.querySelector(`[data-top-kp-id="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
  }
  function scheduleLayout() {cancelAnimationFrame(frame);frame=requestAnimationFrame(layout);}
  function create(configuration) {
    api=configuration;root=document.getElementById('top-kp-panel');
    const groups=[['structure','Структура'],['efficiency',''],['internal','Внутренняя эффективность'],['maturity','Зрелость процессного управления']];
    const legend=[['red','0–44%'],['yellow','45–64%'],['gray','65–84%'],['green','85–100%'],['none','Нет данных']];
    root.innerHTML=`<div class="top-kp-heading"><div class="top-kp-title-row"><h1 id="top-kp-title">Топ клиентских путей <span class="top-kp-count">${records.size}</span></h1><div class="top-kp-legend" aria-label="Цвет границы — эффективность"><span class="top-kp-legend-title">Эффективность</span>${legend.map(([color,label])=>`<span><img src="assets/top-kp/legend-${color}.svg" width="16" height="16" alt="">${label}</span>`).join('')}</div></div><div class="top-kp-filter-toolbar"><div class="top-kp-filters" aria-label="Фильтры клиентских путей">${groups.map(([key,label])=>`<div class="top-kp-filter-group top-kp-filter-group--${key}" role="group" aria-label="${label||'Эффективность'}">${label?`<span class="top-kp-filter-caption">${label}</span>`:''}${filterModel.fields.filter(field=>field.group===key).map(field=>`<div id="top-filter-${field.key}" class="top-kp-filter"></div>`).join('')}</div>`).join('')}</div><div class="top-kp-reset-slot"><button type="button" class="icon-button top-kp-reset" aria-label="Сбросить все фильтры" title="Сбросить все фильтры" hidden><img src="assets/top-kp/erase.svg" width="24" height="24" alt=""></button></div></div></div><p class="sr-only top-kp-filter-announcement" aria-live="polite" aria-atomic="true"></p><div class="top-kp-map-viewport" role="region" aria-label="Карта ${records.size} клиентских путей" tabindex="0"><div class="top-kp-map"></div></div>`;
    root.querySelector('.top-kp-reset-slot').hidden=true;
    filterModel.fields.forEach(field=>{
      const select=api.createSelect(`top-filter-${field.key}`,{label:field.label,options:field.options,multiple:false,icon:'top-kp/filter-chevron',popupClass:'top-kp-filter-popup',minPopupWidth:field.key==='block'?460:field.key==='ssp'?360:280,onChange:values=>{
        filters[field.key]=values[0]||'';
        select.input.title=field.options.find(option=>option.value===values[0])?.label||'Все';
        applyFilters();
      }});
      select.input.title='Все';select.host.querySelector('.internal-label').title=field.label;
      filterSelects.push(select);
    });
    root.querySelector('.top-kp-reset').addEventListener('click',()=>{
      api.closePopups();
      for(const key of Object.keys(filters))delete filters[key];
      filterSelects.forEach(select=>{select.set([]);select.input.title='Все';});
      applyFilters();
      const first=filterSelects[0];
      first.suppressFocusOpen=true;first.input.focus({preventScroll:true});first.suppressFocusOpen=false;
    });
    root.addEventListener('click',event=>{const trigger=event.target.closest('[data-top-kp-id]');if(trigger&&!trigger.disabled){closeHover();api.openDetail(records.get(trigger.dataset.topKpId),trigger);}});
    root.addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const card=event.target.closest('[data-top-kp-id]');if(card&&!card.contains(event.relatedTarget))showHover(card);});
    root.addEventListener('pointerout',event=>{if(hoverTrigger&&!withinHover(event.relatedTarget))scheduleHoverClose();});
    root.addEventListener('focusin',event=>{const card=event.target.closest('[data-top-kp-id]');if(card&&!restoringHoverFocus)showHover(card);});
    root.addEventListener('focusout',event=>{if(!withinHover(event.relatedTarget))closeHover();});
    root.addEventListener('keydown',event=>{
      if(event.key==='Tab'&&!event.shiftKey&&event.target===hoverTrigger){const copy=hover?.querySelector('[data-top-copy]:not(:disabled)');if(copy){event.preventDefault();copy.focus();}}
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&hover){event.preventDefault();event.stopPropagation();closeHover(true);}},true);
    document.addEventListener('scroll',()=>closeHover(),true);
    observer=new ResizeObserver(scheduleLayout);observer.observe(root);
    window.addEventListener('resize',scheduleLayout);
    return {enter(){active=true;lastSize='';scheduleLayout();},leave(){active=false;cancelAnimationFrame(frame);closeHover();filterSelects.forEach(select=>select.close());},refresh(){lastSize='';scheduleLayout();}};
  }
  window.BpmTopKp=Object.freeze({create,detailRecord,score,band});
})();

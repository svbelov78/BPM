/* Excel hierarchy rendered as a compact capability map. Leaf widths are global;
 * business data never comes from the placeholder labels in the Figma sample. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = value => esc(window.BpmCopyTypography?.format(value) ?? value);
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
    row(block('A9',row(
      department('A10',row(stack(group('A11',2),group('B11',2)),stack(group('C11',3),group('D11',3)),stack(group('F11'),group('E18')))),
      department('G10',group('G11')),
      department('H10',row(group('H11'),group('I11')))
    )),
      department('A21',row(stack(group('A22'),group('B22')),stack(group('C22'),group('D22')),group('F22'),group('G22')))
    ),
    block('K9',row(group('K10',2),group('L10',2),group('M10',2),group('N10'),stack(group('S10'),group('O10')),group('Q10',2),stack(group('R10',3),group('P10',3))))
  ];
  function cardsFor(item) {return item.cards || item.groups.flatMap(group=>group.cards);}
  // Group gutters belong to the row/stack, not individual SSP padding.
  // Keep component-level card gutters independent from group separation.
  let compactSpacing=false;
  function groupMetrics(node) {
    const cell=node.cell;
    return {columnGap:cell==='N10'?10:['H2','I2','J2','B22','D22','F22','G22','O10'].includes(cell)?8:4,
      rowGap:['A11','F11','S10'].includes(cell)?10:['A2','J2','A22','C22'].includes(cell)?8:4,
      left:0,right:0,vertical:compactSpacing?4:8,
      labelGap:compactSpacing?4:['A2','B2','D2','G11','L10'].includes(cell)?10:8};
  }
  const isMajor=node=>node.kind==='block'||node.kind==='department'&&node.cell==='A21';
  const nodeGap=node=>node.gap??(node.kind==='row'&&node.children.every(isMajor)?16:8);
  // Intrinsic width of the unwrapped design; max across all three bands.
  function widthOf(node,width,spacing) {
    if(node.kind==='group'){const metric=groupMetrics(node);return node.columns*width+(node.columns-1)*metric.columnGap+metric.left+metric.right;}
    const widths=node.children.map(child=>widthOf(child,width,spacing));
    return node.kind==='row'?widths.reduce((a,b)=>a+b,0)+nodeGap(node)*(widths.length-1):Math.max(...widths);
  }
  const spacing={cardGap:4,groupPadding:8,sectionGap:8};
  const tiers=[
    {name:'large',lines:3,height:64,minWidth:270,twoLineHeight:48,twoLineWidth:320},
    {name:'regular',lines:3,height:54,minWidth:100,twoLineHeight:40,twoLineWidth:128},
    {name:'compact',lines:3,height:45,minWidth:80,twoLineHeight:34,twoLineWidth:100}
  ];
  const variants=tier=>[tier,{...tier,lines:2,height:tier.twoLineHeight,minWidth:tier.twoLineWidth}];
  const textRoom=layout=>(layout.width-16)*layout.tier.lines;
  function frontier(states,maxWidth,fill=false) {
    let best=Infinity,lastWidth=-1;
    return states.filter(state=>state.width<=maxWidth).sort((a,b)=>a.width-b.width||a.height-b.height).filter(state=>{
      // The sizing pass only needs the narrowest state at a given height.
      // The final fill pass also retains wider, equally short compositions.
      if(state.width===lastWidth||(fill?state.height>best:state.height>=best))return false;
      lastWidth=state.width;best=state.height;return true;
    });
  }
  function combine(a,b,kind,gap) {
    const children=a.node.kind===kind&&!a.node.cell&&nodeGap(a.node)===gap?[...a.node.children,b.node]:[a.node,b.node];
    return {width:kind==='row'?a.width+b.width+gap:Math.max(a.width,b.width),height:kind==='row'?Math.max(a.height,b.height):a.height+b.height+gap,node:{kind,children,gap}};
  }
  // Pareto packing: retain only layouts that improve width OR height. Each
  // candidate uses one shared leaf width; block/department membership is fixed.
  function layouts(node,cardWidth,cardHeight,available,forceRow=false,fill=false) {
    if(node.kind==='group') {
      const item=categories.get(node.cell),cards=cardsFor(item),count=cards.length,states=[],metric=groupMetrics(node);
      for(let columns=1;columns<=count;columns++) {
        const width=columns*cardWidth+(columns-1)*metric.columnGap+metric.left+metric.right;if(width>available)break;
        const rows=Math.ceil(count/columns);
        states.push({width,height:metric.vertical*2+12+metric.labelGap+rows*cardHeight+(rows-1)*metric.rowGap,node:{...node,columns}});
      }
      return frontier(states,available,fill);
    }
    let states=layouts(node.children[0],cardWidth,cardHeight,available,false,fill);
    for(const child of node.children.slice(1)) {
      const next=layouts(child,cardWidth,cardHeight,available,false,fill);
      const gap=nodeGap(node);
      states=frontier(states.flatMap(a=>next.flatMap(b=>forceRow?[combine(a,b,'row',gap)]:[combine(a,b,'row',gap),combine(a,b,'stack',gap)])),available,fill);
    }
    if(node.kind==='block'||node.kind==='department') {
      states=frontier(states.map(state=>({width:state.width,height:state.height+(isMajor(node)?24:28),node:{...node,children:[state.node]}})),available,fill);
    }
    return states;
  }
  function minimumMap(cardWidth,tier,available,keepFloors=true,fill=false) {
    const floors=plan.map(node=>layouts(node,cardWidth,tier.height,available,keepFloors&&node.kind==='row'&&node.children.every(isMajor),fill));
    if(floors.some(states=>!states.length))return null;
    const picks=floors.map(states=>states.reduce((best,state)=>state.height<best.height||fill&&state.height===best.height&&state.width>best.width?state:best));
    return {height:picks.reduce((height,state)=>height+state.height,16),plan:picks.map(state=>state.node)};
  }
  function fitMap(cardWidth,tier,available,budget) {
    const minimum=minimumMap(cardWidth,tier,available);
    return minimum&&minimum.height<=budget?minimum.plan:null;
  }
  function chooseLayout(available,budget) {
    for(const tier of tiers) {
      let best=null;
      for(const variant of variants(tier)) {
        let low=variant.minWidth,high=available,selected=fitMap(low,variant,available,budget);
        if(!selected)continue;
        // Every card uses the same two- or three-line height. A wider two-line
        // option is considered only when it has room for a useful title.
        for(let step=0;step<12;step++) {
          const mid=(low+high)/2,candidate=fitMap(mid,variant,available,budget);
          if(candidate){low=mid;selected=candidate;}else high=mid;
        }
        const candidate={tier:variant,width:Math.floor(low*100)/100,plan:selected};
        if(!best||textRoom(candidate)>textRoom(best))best=candidate;
      }
      if(best)return best;
    }
    return null;
  }
  // Width must be fluid even when vertical scrolling is necessary. Stretch the
  // selected composition as a whole, never a last row or an individual group:
  // every card on all three floors keeps exactly the same width and height.
  function stretchLayout(selected,available) {
    let low=selected.width,high=available;
    for(let step=0;step<24;step++) {
      const width=(low+high)/2;
      if(selected.plan.every(node=>widthOf(node,width,spacing)<=available))low=width;
      else high=width;
    }
    return {...selected,width:Math.floor(low*100)/100};
  }
  let api,root,active=false,observer,frame,hover,hoverTrigger,lastSize='';
  const filterModel=window.BpmTopKpFilters,filters={},filterSelects=[];
  function syncHeadingTooltips() {
    const selector='.top-kp-map h2,.top-kp-map h3,.top-kp-map h4,.top-kp-filter .internal-label,.top-kp-filter-caption';
    root.querySelectorAll(selector).forEach(heading=>{
      // h3 clips its block-level span; h2 clips the heading itself and its
      // inline span has no measurable clientWidth/scrollWidth.
      const text=heading.matches('h3')?heading.querySelector(':scope > span')||heading:heading;
      const full=heading.dataset.headingFull||heading.getAttribute('title')||heading.textContent.trim();
      heading.dataset.headingFull=full;
      heading.removeAttribute('title');
      const clipped=text.scrollWidth>text.clientWidth+.5;
      if(clipped){heading.dataset.tooltip=full;heading.tabIndex=0;}
      else {delete heading.dataset.tooltip;heading.removeAttribute('tabindex');}
    });
  }
  function applyFilters() {
    closeHover();api.hideTooltip();
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
    syncHeadingTooltips();
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
    return `<button type="button" class="top-kp-card" data-top-kp-id="${esc(record.id)}" data-top-kp-code="${esc(code(record))}" data-band="${band(value)}" aria-label="${copy(label)}"><span class="top-kp-card-title">${copy(record.title)}</span></button>`;
  }
  function renderNode(node,maxColumns,spacing,cardWidth) {
    // max(row widths) is piecewise linear: evaluating at 0 and 1 would choose
    // the wrong widest child once a card grows. Use the actual shared width.
    const sizing=`width:${widthOf(node,cardWidth,spacing)}px;--top-node-gap:${nodeGap(node)}px`;
    if(node.kind==='row'||node.kind==='stack')return `<div class="top-kp-${node.kind}" style="${sizing}">${node.children.map(child=>renderNode(child,maxColumns,spacing,cardWidth)).join('')}</div>`;
    const item=categories.get(node.cell),headingId=`top-kp-heading-${item.key}`;
    if(node.kind==='group') {
      const columns=Math.min(maxColumns,node.columns),metric=groupMetrics(node);
      return `<section class="top-kp-group" data-source-category="${node.cell}" style="--top-columns:${columns};--top-column-gap:${metric.columnGap}px;--top-row-gap:${metric.rowGap}px;--top-label-gap:${metric.labelGap}px;--top-group-right:${metric.right}px" aria-labelledby="${headingId}"><h4 class="top-kp-group-title" id="${headingId}" title="${copy(item.name)}">${copy(item.name)}</h4><div class="top-kp-cards">${cardsFor(item).map(card).join('')}</div></section>`;
    }
    const heading=node.kind==='block'?'h2':'h3';
    return `<section class="top-kp-${node.kind}${node.cell==='A21'?' top-kp-department--major':''}" style="${sizing}" data-source-category="${node.cell}" aria-labelledby="${headingId}"><${heading} id="${headingId}" title="${copy(item.name)}"><span>${copy(item.name)}</span></${heading}>${node.children.map(child=>renderNode(child,maxColumns,spacing,cardWidth)).join('')}</section>`;
  }
  function closeHover() {
    const trigger=hoverTrigger,popup=hover;
    hover=null;hoverTrigger=null;
    if(trigger&&popup){
      const descriptions=(trigger.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==popup.id);
      if(descriptions.length)trigger.setAttribute('aria-describedby',descriptions.join(' '));
      else trigger.removeAttribute('aria-describedby');
    }
    popup?.remove();
  }
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
    if(hoverTrigger===trigger&&hover)return;
    closeHover();api.hideTooltip();if(!trigger||trigger.disabled||document.querySelector('dialog[open]'))return;
    const record=records.get(trigger.dataset.topKpId);if(!record)return;
    hoverTrigger=trigger;hover=document.createElement('div');hover.className='top-kp-hover';hover.id='top-kp-tooltip';
    hover.setAttribute('role','tooltip');
    hover.setAttribute('aria-labelledby','top-kp-tooltip-title');hover.setAttribute('aria-describedby','top-kp-tooltip-path');
    const hierarchy=[record.block,record.division,record.group].filter(Boolean).join(' / ');
    hover.innerHTML=`<div class="top-kp-hover-bubble"><div class="top-kp-hover-top"><span class="id-badge"><span>${esc(code(record))}</span></span>${window.BpmCardVisuals.efficiency({efficiency:score(record)})}</div><strong id="top-kp-tooltip-title">${copy(record.title)}</strong><p class="top-kp-hover-path" id="top-kp-tooltip-path">${copy(hierarchy)}</p></div><img class="top-kp-hover-arrow" src="assets/top-kp/tooltip-arrow.svg" width="24" height="8" alt="" aria-hidden="true">`;
    document.body.append(hover);
    const descriptions=(trigger.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);
    trigger.setAttribute('aria-describedby',[...new Set([...descriptions,hover.id])].join(' '));
    positionHover();
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
    if(innerWidth>=1280&&(!fitted||fitted.tier.name!==tiers[0].name)) {
      compactSpacing=true;root.dataset.spacing='compact';
      const compact=chooseLayout(available-2,heightBudget());
      const rank=layout=>tiers.findIndex(tier=>tier.name===layout.tier.name);
      if(compact&&(!fitted||rank(compact)<rank(fitted)||rank(compact)===rank(fitted)&&textRoom(compact)>textRoom(fitted)))fitted=compact;
      else {compactSpacing=false;root.dataset.spacing='design';}
    }
    if(!fitted) {
      // Compare the total height of the two shared line modes. Do not shorten
      // individual cards: all 136 cards switch together at a layout change.
      if(innerWidth>=1280){compactSpacing=true;root.dataset.spacing='compact';}
      for(const tier of variants(tiers[2])) {
        const minimum=minimumMap(tier.minWidth,tier,available-2,innerWidth>=1280);
        if(!minimum)continue;
        const candidate=stretchLayout({tier,width:tier.minWidth,plan:minimum.plan,height:minimum.height},available);
        if(!fitted||candidate.height<fitted.height||candidate.height===fitted.height&&textRoom(candidate)>textRoom(fitted))fitted=candidate;
      }
      fitted||={tier:tiers[2],width:80,plan};
    }
    let fluid=stretchLayout(fitted,available);
    let filled=minimumMap(fluid.width,fluid.tier,available,innerWidth>=1280,true);
    if(filled)fluid=stretchLayout({...fluid,plan:filled.plan},available);
    // Different fixed gutters can leave an entire column unused on one floor
    // at a packing boundary. Check nearby shared widths, not individual rows,
    // and keep a fuller composition only if it is no taller than the first.
    const floorSlack=layout=>Math.max(...layout.plan.map(node=>available-widthOf(node,layout.width,spacing)));
    if(innerWidth>=1280&&filled&&floorSlack(fluid)>8) {
      const initialWidth=fluid.width,maxHeight=filled.height;
      for(const delta of [.25,.5,1,2,4]) {
        const width=initialWidth-delta;if(width<fluid.tier.minWidth)break;
        const candidate=minimumMap(width,fluid.tier,available,true,true);
        if(!candidate||candidate.height>maxHeight)continue;
        const stretched=stretchLayout({...fluid,width,plan:candidate.plan},available);
        if(floorSlack(stretched)<floorSlack(fluid)-.5){fluid=stretched;filled=candidate;}
        if(floorSlack(fluid)<=8)break;
      }
    }
    root.dataset.fit=String(innerWidth>=1280&&!!filled&&filled.height<=heightBudget());
    root.style.setProperty('--top-card-width',`${fluid.width}px`);
    root.style.setProperty('--top-card-height',`${fluid.tier.height}px`);
    root.style.setProperty('--top-card-lines',fluid.tier.lines);
    root.dataset.density=fluid.tier.name;
    root.dataset.lines=String(fluid.tier.lines);
    map.innerHTML=fluid.plan.map(node=>renderNode(node,Infinity,spacing,fluid.width)).join('');
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
        select.input.title=window.BpmCopyTypography.format(field.options.find(option=>option.value===values[0])?.label||'Все');
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
    root.addEventListener('pointerover',event=>{if(event.target.closest('[data-tooltip]'))closeHover();if(event.pointerType==='touch')return;const card=event.target.closest('[data-top-kp-id]');if(card&&!card.contains(event.relatedTarget))showHover(card);});
    root.addEventListener('pointerout',event=>{const card=event.target.closest('[data-top-kp-id]');if(card&&card===hoverTrigger&&!card.contains(event.relatedTarget))closeHover();});
    root.addEventListener('focusin',event=>{const card=event.target.closest('[data-top-kp-id]');if(card)showHover(card);});
    root.addEventListener('focusout',event=>{if(hoverTrigger&&!hoverTrigger.contains(event.relatedTarget))closeHover();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&hover){event.preventDefault();event.stopPropagation();closeHover();}},true);
    document.addEventListener('scroll',()=>closeHover(),true);
    observer=new ResizeObserver(scheduleLayout);observer.observe(root);
    window.addEventListener('resize',scheduleLayout);
    return {enter(){active=true;lastSize='';scheduleLayout();},leave(){active=false;cancelAnimationFrame(frame);closeHover();api.hideTooltip();filterSelects.forEach(select=>select.close());},refresh(){lastSize='';scheduleLayout();}};
  }
  window.BpmTopKp=Object.freeze({create,detailRecord,score,band});
})();

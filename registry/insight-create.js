/* Insight creation · Figma 293:35974 / 285:34578. Local demonstration, no remote service. */
(() => {
  'use strict';
  const assets = {
    close:'assets/insight-create/form-imgIcon24Exit.svg', remove:'assets/insight-create/form-imgIcon16Exit.svg',
    chevron:'assets/insight-create/form-imgChevron.svg', plus:'assets/insight-create/form-imgAddIcon.svg',
    addFile:'assets/insight-create/form-imgAddIcon1.svg', file:'assets/insight-create/form-imgFileIcon.svg',
    removeFile:'assets/insight-create/form-imgRemoveIcon.svg', person:'assets/insight-create/form-imgIcon24Person.svg',
    loading:'assets/insight-create/duplicate-imgIcon24Loading.svg', tick:'assets/insight-create/duplicate-imgIcon24Tick.svg',
    info:'assets/insight-create/duplicate-imgIcon16Info.svg', copy:'assets/insight-create/match-imgIcon16Copy.svg',
    dot:'assets/insight-create/match-imgDot.svg', direction:'assets/insight-create/match-imgRelatedDirection.svg',
    statusOrange:'assets/insights/241-2705-dot1.svg',statusGreen:'assets/insights/241-2705-dot2.svg',statusRed:'assets/insights/241-2705-dot.svg',
    matchClose:'assets/insight-create/match-imgIcon24Exit.svg'
  };
  const nativeSize = {remove:16,chevron:16,person:18,loading:16,info:16,copy:16,dot:12,direction:16,statusOrange:12,statusGreen:12,statusRed:12};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const displayText = value => esc(window.BpmCopyTypography?.format(value) ?? value);
  const icon = (name, className = '') => `<img src="${assets[name]}" alt="" width="${nativeSize[name] || 24}" height="${nativeSize[name] || 24}" class="${className}" aria-hidden="true">`;
  const normalize = value => String(value || '').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const stopWords = new Set('что это как для при или все тот эта они она оно его ему уже было будет были есть свои свой своих своей со на по из за мы вы об от не но до во и а в с к о у'.split(' '));
  const words = value => normalize(value).split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)).map(w => w.length > 5 ? w.slice(0,6) : w);
  function similarRows(draft, rows) {
    const queryWords = words(`${draft.title} ${draft.description}`), query = new Set(queryWords);
    if (draft.description.trim().length < 15 || query.size < 3) return [];
    const title = normalize(draft.title), description = normalize(draft.description);
    return rows.map(row => {
      const other = new Set(words(`${row.title} ${row.description}`));
      const overlap = [...query].filter(w => other.has(w)).length;
      const exactTitle = title.length > 10 && title === normalize(row.title);
      const otherDescription = normalize(row.description);
      const exactDescription = description.length > 35 && otherDescription.length > 35 && (otherDescription.includes(description) || description.includes(otherDescription));
      const score = exactTitle || exactDescription ? 1 : overlap / Math.sqrt(query.size * Math.max(1,other.size));
      return {row,score,overlap};
    }).filter(match => match.score >= .28 && (match.overlap >= 3 || match.score === 1))
      .sort((a,b) => b.score - a.score || String(a.row.id).localeCompare(String(b.row.id),'ru')).map(match => match.row);
  }
  const choices = values => [...new Set(values.filter(Boolean))].map(value => ({value,label:value}));
  const creationSources = ['SberBPM ЦА','ТБ','Process Mining'];
  const canonicalCreationSource = value => creationSources.find(source => normalize(source).replace(/\s/g,'') === normalize(value).replace(/\s/g,'')) || '';
  const requiresCompleteDescription = source => source === 'SberBPM ЦА' || source === 'ТБ';
  const populatedEffect = effect => (effect.type==='Качественный'?['name','description']:['name','description','current','target','unit']).some(key => String(effect[key] ?? '').trim());
  const effectCatalog = [
    ['Финансы','Рост операционного дохода','Количественный'],['Финансы','Сокращение ФОТ','Количественный'],
    ['Финансы','Сокращение операционных расходов без ФОТ','Количественный'],['Финансы','Снижение операционных потерь (фрод, штрафы, компенсации)','Количественный'],
    ['Клиент','Повышение клиентского опыта внешнего клиента','Качественный'],['Клиент','Повышение клиентского опыта внутреннего клиента','Качественный'],
    ['Процесс','Повышение качества процесса (меньше ошибок и переделок)','Качественный']
  ].map(([group,value,type])=>({group,value,label:value,type}));
  const unitCatalog = window.BpmInsightUnits.catalog;
  const banks = ['Байкальский банк','Волго-Вятский банк','Дальневосточный банк','Московский банк','Поволжский банк','Северо-Западный банк','Сибирский банк','Среднерусский банк','Уральский банк','Центрально-Черноземный банк','Юго-Западный банк'];
  const input = (name,label,value='',placeholder='',extra='') => `<label class="ic-field-wrap"><span class="field ic-input-field"><span class="field-content"><span class="internal-label">${esc(label)}</span><input name="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" ${extra}></span></span><span class="ic-error" data-error="${esc(name)}" hidden></span></label>`;
  const textarea = (name,label,value='',placeholder='',extra='') => `<label class="ic-field-wrap"><span class="field ic-textarea-field"><span class="internal-label">${esc(label)}</span><textarea name="${esc(name)}" placeholder="${esc(placeholder)}" maxlength="5000" ${extra}>${esc(value)}</textarea></span><span class="ic-error" data-error="${esc(name)}" hidden></span></label>`;
  const selectHost = (id,error='') => `<div class="ic-field-wrap"><div id="${id}" class="select-host"></div>${error ? `<span class="ic-error" data-error="${error}" hidden></span>` : ''}</div>`;
  const accordion = (id,title,content,open=false) => `<details class="ic-accordion" id="${id}"${open?' open':''}><summary><span>${title}</span>${icon('chevron','ic-chevron')}</summary><div class="ic-accordion-content">${content}</div></details>`;

  function create({api,getRows=()=>[],onCreate,onOpenInsight,onPreviewInsight}) {
    let dialog, form, formDraft, sheet, confirm, duplicateConfirm, trigger, draft, selectors=[], effectSequence=0;
    let timer, revision=0, matching=false, matches=[], lastAutomatic='', dirty=false, submitting=false, readingFiles=false;
    let check=null, firstCheck=true, acceptedCheck='';
    const scrollGate=window.BpmDrawerScroll.create();
    const records = () => [...(window.BPM_DATA || []),...(window.BPM_STRUCTURE?.records || [])];
    const processRecords = () => [...new Map(records().filter(row=>row.entity==='processes').map(row=>[row.id,row])).values()];
    const pathRecords = () => records().filter(row=>row.entity==='paths');
    const rows = () => getRows() || [];
    function emptyEffect() {return {id:`effect-${++effectSequence}`,name:'',type:'Количественный',description:'',current:'',target:'',unit:'',frequency:'Регулярно',period:'Год'};}
    function blank() {return {title:'',description:'',rootCauses:'',solution:'',source:'ТБ',bank:'Волго-Вятский банк',path:'',related:[],products:[],owner:'',author:window.BpmInsightStore.currentUser,effects:[emptyEffect()],attachments:[],commentsDraft:[]};}
    draft = blank();
    const notify = message => api.toast?.(message);
    function setError(name,message='') {
      const error=form.querySelector(`[data-error="${CSS.escape(name)}"]`); if(!error)return;
      error.textContent=message;error.hidden=!message;
      const control=error.closest('.ic-field-wrap');control?.classList.toggle('has-error',!!message);
      const input=control?.querySelector('input,textarea');if(input){input.setAttribute('aria-invalid',String(!!message));error.id=`ic-error-${name}`;const description=(input.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&id!==error.id);if(message)description.push(error.id);if(description.length)input.setAttribute('aria-describedby',description.join(' '));else input.removeAttribute('aria-describedby');}
    }
    function updateRequirements() {
      const complete=requiresCompleteDescription(draft.source);
      const fields=[['title',true],['description',true],['rootCauses',complete],['solution',complete],['ic-source-input',true],['ic-process-input',true],['ic-bank-input',draft.source==='ТБ']];
      fields.forEach(([name,required])=>{
        const control=form.elements.namedItem(name)||form.querySelector(`#${name}`);if(!control)return;
        control.required=required;control.setAttribute('aria-required',String(required));
        const label=control.closest('.ic-field-wrap')?.querySelector('.internal-label');if(!label)return;
        label.dataset.requiredLabel ||= label.textContent;
        label.innerHTML=`${esc(label.dataset.requiredLabel)}${required?' <span aria-hidden="true">*</span>':''}`;
      });
      form.querySelector('#ic-effects-title').textContent='Ожидаемые эффекты';
      form.querySelector('#ic-effects-requirement').hidden=!complete;
      if(complete&&!draft.effects.length)draft.effects.push(emptyEffect());
      setError('rootCauses');setError('solution');setEffectsError();
    }
    function setEffectsError(message='') {
      const error=form.querySelector('#ic-effects-error');error.textContent=message;error.hidden=!message;
      const section=error.closest('.ic-effects-section');section.classList.toggle('has-error',!!message);
      const button=section.querySelector('[data-add-effect]');
      button.setAttribute('aria-invalid',String(!!message));if(message)button.setAttribute('aria-describedby',error.id);else button.removeAttribute('aria-describedby');
    }
    function syncInputs() {
      if(formDraft!==draft)return;
      ['title','description','rootCauses','solution'].forEach(name=>{draft[name]=form.elements.namedItem(name)?.value || '';});
      form.querySelectorAll('[data-effect]').forEach(box=>{
        const effect=draft.effects.find(item=>item.id===box.dataset.effect);if(!effect)return;
        box.querySelectorAll('[data-effect-field]').forEach(field=>{effect[field.dataset.effectField]=field.value;});
      });
    }
    function resizeTextarea(element) {
      element.style.height='auto';element.style.height=`${Math.min(202,Math.max(102,element.scrollHeight))}px`;
      element.style.overflowY=element.scrollHeight>202?'auto':'hidden';
    }
    function select(id,label,options,values,change,multiple=false,custom=null,unit=false) {
      const instance=api.createSelect(id,{label,options,values,allowAll:false,placeholder:'Выберите',multiple,onChange:value=>{dirty=true;change(multiple ? value : value[0] || '');}});
      if(unit) window.BpmInsightUnits.enhanceSelect(instance);
      else if(custom || options.some(option=>option.group)) {
        const render=instance.renderOptions.bind(instance), catalog=[...options];
        for(const value of values)if(!catalog.some(option=>option.value===value))catalog.push({value,label:value,group:'Свое значение'});
        instance.renderOptions=function() {
          for(const value of this.values)if(!catalog.some(option=>option.value===value))catalog.push({value,label:value,group:'Свое значение'});
          const query=this.query.trim();this.options=[...catalog];
          if(custom && query.length>=custom.min && query.length<=custom.max && !catalog.some(option=>normalize(option.value)===normalize(query)))this.options.push({value:query,label:`Использовать «${query}»`,group:'Свое значение'});
          render();let previous='';
          this.popup?.querySelectorAll('[data-option]').forEach(element=>{const group=this.options.find(option=>option.value===element.dataset.option)?.group;if(group && group!==previous){const heading=document.createElement('div');heading.className='ic-select-group';heading.setAttribute('role','presentation');heading.textContent=group;element.before(heading);}previous=group;});
        };
      }
      selectors.push(instance);return instance;
    }
    function closeSelects() {selectors.forEach(item=>item.close?.());api.closePopups?.();}
    function processInfo(id) {
      const p=processRecords().find(item=>item.id===id);
      return p ? {id:p.id,code:p.code || `П${p.number}`,title:p.title,variants:[]} : rows().flatMap(row=>row.related||[]).find(item=>item.id===id);
    }
    function productsForProcess() {return choices(rows().filter(row=>row.related?.some(p=>p.id===draft.related[0]?.id)).map(row=>row.product));}
    function renderRelations() {
      const target=form.querySelector('#ic-relations-content');
      const process=draft.related[0];
      if(!process){target.innerHTML='<p class="ic-muted">Выберите процесс, чтобы настроить связанные объекты.</p>';return;}
      const options=choices(rows().flatMap(row=>row.related||[]).filter(item=>item.id===process.id).flatMap(item=>item.variants||[]));
      const products=productsForProcess();
      target.innerHTML=`<p class="ic-relation-caption">Информация обо всех объектах, связанных с процессом ${esc(process.code)}</p>${selectHost('ic-variants')}<div id="ic-selected-variants"></div>${selectHost('ic-products')}<div id="ic-selected-products"></div>`;
      select('ic-variants','Варианты предоставления результата процесса',options,process.variants,values=>{process.variants=values;renderRelationChips();},true);
      select('ic-products','Продукты ЕКОУ',products,draft.products,values=>{draft.products=values;renderRelationChips();},true);
      renderRelationChips();
    }
    function renderRelationChips() {
      for(const kind of ['variants','products']){
        const target=form.querySelector(`#ic-selected-${kind}`);if(!target)continue;
        const values=kind==='variants'?draft.related[0]?.variants||[]:draft.products;
        target.innerHTML=values.map(value=>`<div class="ic-linked-row"><span>${displayText(value)}</span><button type="button" class="ic-icon-small" data-remove-relation="${kind}" data-value="${esc(value)}" aria-label="Убрать ${displayText(value)}">${icon('remove')}</button></div>`).join('');
      }
    }
    function effectMarkup(effect,index) {
      const prefix=`ic-${effect.id}`;
      const metrics=effect.type==='Качественный'?'':`<div class="ic-effect-numbers">${input(prefix+'-current','Текущее значение',effect.current,'Введите значение','inputmode="decimal" data-effect-field="current"')}${input(prefix+'-target','Целевое значение',effect.target,'Введите значение','inputmode="decimal" data-effect-field="target"')}${selectHost(prefix+'-unit')}</div><div class="ic-effect-period">${selectHost(prefix+'-frequency')}<div data-effect-period ${effect.frequency==='Регулярно'?'':'hidden'}>${selectHost(prefix+'-period')}</div></div>`;
      const descriptionPlaceholder=effect.type==='Качественный'?'Опишите ожидаемые улучшения для клиентов, сотрудников или процесса.':'Опишите ожидаемое улучшение и способ расчёта количественного эффекта.';
      return `<article class="ic-effect" data-effect="${effect.id}"><header><span class="ic-effect-number">${index+1}</span><h3>Эффект</h3><button type="button" class="ic-icon-small" data-remove-effect="${effect.id}" aria-label="Удалить эффект ${index+1}" ${requiresCompleteDescription(draft.source)&&draft.effects.length===1?'disabled title="Единственный обязательный эффект нельзя удалить"':''}>${icon('remove')}</button></header>${selectHost(prefix+'-name')}${selectHost(prefix+'-type')}${textarea(prefix+'-description','Описание эффекта',effect.description,descriptionPlaceholder,'data-effect-field="description"')}${metrics}<p class="ic-error" data-effect-error hidden></p></article>`;
    }
    function renderEffects() {
      selectors.filter(item=>item.id?.startsWith('ic-effect-')).forEach(item=>item.close?.());
      selectors=selectors.filter(item=>!item.id?.startsWith('ic-effect-'));
      const list=form.querySelector('#ic-effects');list.innerHTML=draft.effects.map(effectMarkup).join('');
      draft.effects.forEach(effect=>{
        const prefix=`ic-${effect.id}`;
        effect.unit=window.BpmInsightUnits.canonicalize(effect.unit);
        const add=(key,label,options,custom)=>select(`${prefix}-${key}`,label,typeof options[0]==='string'?choices(options):options,effect[key]?[effect[key]]:[],value=>{
          syncInputs();const previousType=effect.type;effect[key]=value;
          if(key==='name'){const found=effectCatalog.find(item=>item.value===value);if(found)effect.type=found.type;}
          if(previousType!==effect.type){
            const selectId=`${prefix}-${key}`,restoreFocus=document.activeElement?.id===`${selectId}-input`;
            renderEffects();
            if(restoreFocus){const replacement=selectors.find(item=>item.id===selectId);if(replacement){replacement.suppressFocusOpen=true;replacement.input.focus({preventScroll:true});replacement.suppressFocusOpen=false;}}
            return;
          }
          if(key==='frequency')form.querySelector(`[data-effect="${effect.id}"] [data-effect-period]`).hidden=value!=='Регулярно';
        },false,custom,key==='unit');
        add('name','Эффект',effectCatalog,{min:3,max:60});
        add('type','Тип эффекта',['Количественный','Качественный']);
        if(effect.type!=='Качественный'){
          add('unit','Ед. изм.',unitCatalog,{min:1,max:20});
          add('frequency','Периодичность',['Регулярно','Единоразово']);add('period','Период',['Год','Квартал','Месяц']);
        }
        list.querySelector(`[data-effect="${effect.id}"] textarea`).maxLength=4000;
      });
      list.querySelectorAll('textarea').forEach(resizeTextarea);
    }
    function addEffect() {
      syncInputs();draft.effects.push(emptyEffect());
      dirty=true;renderEffects();form.querySelector('#ic-effects .ic-effect:last-child input')?.focus({preventScroll:true});
    }
    function renderAttachments() {
      form.querySelector('#ic-attachment-count').textContent=draft.attachments.length;
      form.querySelector('#ic-files').innerHTML=draft.attachments.map(file=>`<div class="ic-file">${icon('file')}<a href="${esc(file.dataUrl)}" download="${esc(file.name)}">${esc(file.name)}</a><button type="button" class="ic-icon" data-remove-file="${esc(file.id)}" aria-label="Удалить ${esc(file.name)}">${icon('removeFile')}</button></div>`).join('');
    }
    async function attachFiles(files) {
      if(readingFiles)return;
      const incoming=[...files]; if(!incoming.length)return;
      const allowed=/\.(pdf|xlsx|docx|txt|jpe?g|png|gif|webp|pptx)$/i;
      const error=incoming.length>10?'За один раз можно добавить не более 10 файлов.':incoming.some(file=>!allowed.test(file.name))?'Этот формат не поддерживается. Выберите файл из списка допустимых форматов.':incoming.reduce((sum,file)=>sum+file.size,0)+draft.attachments.reduce((sum,file)=>sum+file.size,0)>10*1024*1024?'Суммарный размер файлов не должен превышать 10 МБ.':'';
      const message=form.querySelector('#ic-file-error');message.textContent=error;message.hidden=!error;if(error)return;
      const attachmentDraft=draft;
      readingFiles=true;form.querySelector('.ic-dropzone').classList.add('is-loading');scrollGate.setDisabled(form.querySelector('[data-submit]'),true);
      try {
        const attached=await Promise.all(incoming.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({id:crypto.randomUUID(),name:file.name,size:file.size,type:file.type,dataUrl:reader.result});reader.onerror=()=>reject(new Error('Не удалось прочитать файл. Попробуйте ещё раз.'));reader.readAsDataURL(file);})));if(draft===attachmentDraft){draft.attachments.push(...attached);dirty=true;renderAttachments();}
      } catch(error) {message.textContent=error.message;message.hidden=false;}
      finally {readingFiles=false;form.querySelector('.ic-dropzone').classList.remove('is-loading');scrollGate.setDisabled(form.querySelector('[data-submit]'),submitting);}
    }
    function renderParticipants() {
      const key=`${draft.related[0]?.id||'insight-create'}:owner`,name=window.BpmAvatars.displayName(draft.owner,key);
      form.querySelector('#ic-owner-name').textContent=name;
      form.querySelector('#ic-owner-avatar').innerHTML=name==='Система'||name==='SYS'?'SYS':window.BpmAvatars.portrait(name,key);
    }
    function buildForm() {
      draft.source=canonicalCreationSource(draft.source);
      formDraft=draft;
      closeSelects();selectors=[];
      form.innerHTML=`<header class="ic-header"><h2 id="insight-create-title">Новый инсайт</h2>${window.BpmInsightPresentation.sourceBadge(draft,'ic-bank','ic-source-summary')}<button type="button" class="ic-icon ic-close" data-close aria-label="Закрыть создание инсайта">${icon('close')}</button></header><div class="ic-scroll" tabindex="-1" role="region" aria-label="Поля нового инсайта">
        ${input('title','Название инсайта',draft.title,'Введите название инсайта','maxlength="240" required')}
        <section class="ic-context">${selectHost('ic-source','source')}<div id="ic-bank-field" ${draft.source==='ТБ'?'':'hidden'}>${selectHost('ic-bank','bank')}</div>${selectHost('ic-path')}${selectHost('ic-process','process')}</section>
        ${accordion('ic-relations','Связи процесса','<div id="ic-relations-content"></div>',true)}
        <section class="ic-description"><h3>Описание инсайта</h3><div class="ic-description-and-status">${textarea('description','Проблема / наблюдение',draft.description,'Опишите проблему или наблюдение: на каком этапе процесса возникает, кого затрагивает и как влияет на бизнес.','required aria-describedby="ic-duplicate-status"')}<div id="ic-duplicate-status" class="ic-duplicate-status" role="status" aria-live="polite" hidden></div></div>${textarea('rootCauses','Корневые причины',draft.rootCauses,'Укажите причины возникновения проблемы. При необходимости используйте метод «5 почему».')}${textarea('solution','Предложение/решение',draft.solution,'Опишите предлагаемые изменения и объясните, как они помогут устранить причины проблемы.')}</section>
        <section class="ic-effects-section"><header class="ic-effects-heading"><div><h3 id="ic-effects-title">Ожидаемые эффекты</h3><p>Опишите ожидаемые эффекты. Для количественных эффектов укажите текущее и целевое значения.</p><p id="ic-effects-requirement">Обязательно: не менее одного эффекта.</p></div><button type="button" class="ic-link-button" data-add-effect>${icon('plus')}добавить эффект</button></header><p id="ic-effects-error" class="ic-error" hidden></p><div id="ic-effects"></div></section>
        ${accordion('ic-attachments','Вложения <span id="ic-attachment-count">0</span>',`<div class="ic-dropzone"><p>Перетащите или <button type="button" class="ic-link-button" data-add-files>добавьте файл ${icon('addFile')}</button></p><small>Допустимые форматы: PDF, XLSX, DOCX, TXT, JPG, JPEG, PNG, GIF, WEBP, PPTX</small><input id="ic-file-input" type="file" multiple accept=".pdf,.xlsx,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp,.pptx" hidden></div><p class="ic-muted ic-file-help">Можно добавить до 10 файлов за одну загрузку. Общий размер вложений — не более 10 МБ.</p><p id="ic-file-error" class="ic-error" role="alert" hidden></p><div id="ic-files"></div>`,true)}
        <section class="ic-participants"><h3>Участники инсайта</h3><div class="ic-people"><div class="ic-person"><span class="ic-avatar" id="ic-owner-avatar"></span><div><small>Владелец процесса</small><span id="ic-owner-name"></span></div></div><div class="ic-person"><span class="ic-avatar">${draft.author==='Система'||draft.author==='SYS'?'SYS':window.BpmAvatars.portrait(draft.author,'insight-create:author')}</span><div><small>Автор</small><span>${esc(draft.author)}</span></div></div></div></section>
        <p id="ic-submit-error" class="ic-error" role="alert" hidden></p></div><footer class="ic-actions"><button type="button" class="button secondary-button" data-close>Отменить</button><button type="submit" class="button primary-button" data-submit>Создать инсайт</button></footer>`;
      const sourceSummary=()=>{const badge=form.querySelector('#ic-source-summary'), text=window.BpmInsightPresentation.source(draft);badge.querySelector('.insight-source-text').textContent=text;badge.title=text;form.querySelector('#ic-bank-field').hidden=draft.source!=='ТБ';};
      select('ic-source','Источник',choices(creationSources),draft.source?[draft.source]:[],value=>{syncInputs();draft.source=value;setError('source');sourceSummary();updateRequirements();renderEffects();});
      select('ic-bank','Территориальный банк',choices([...banks,...rows().map(row=>row.bank)]),[draft.bank],value=>{draft.bank=value;setError('bank');sourceSummary();});
      select('ic-path','Клиентский путь',pathRecords().map(row=>({value:row.title,label:`КП${row.number} ${row.title}`})),draft.path?[draft.path]:[],value=>{draft.path=value;});
      select('ic-process','Процесс',processRecords().map(row=>({value:row.id,label:`${row.code||`П${row.number}`} ${row.title}`})),draft.related.map(row=>row.id),value=>{
        const found=processInfo(value);draft.related=found?[{...found,variants:[]}]:[];draft.products=[];draft.owner=processRecords().find(row=>row.id===value)?.owner||'';setError('process');renderRelations();renderParticipants();
      });
      updateRequirements();renderRelations();renderEffects();renderAttachments();renderParticipants();form.querySelectorAll('textarea').forEach(resizeTextarea);
      if(matches.length)renderMatchStatus('found');
    }
    function renderMatchStatus(state) {
      const status=form.querySelector('#ic-duplicate-status');status.hidden=state==='idle';status.dataset.state=state;status.setAttribute('aria-busy',String(state==='loading'));
      status.innerHTML=state==='loading'?`${icon('loading','ic-spinner')}<span>Поиск совпадений в системе. Проверяем...</span>`:state==='found'?`${icon('info')}<span>Найдено <button type="button" data-show-matches>${matches.length} ${matches.length===1?'похожий инсайт':matches.length<5?'похожих инсайта':'похожих инсайтов'}</button></span>`:state==='none'?`${icon('tick')}<span>Совпадений не найдено</span>`:'';
      status.title=check?.demo?'Демонстрация проверки: в первом поиске показаны три примера совпадений.':'Локальная проверка совпадений по словам в названии и описании демонстрационного реестра.';
    }
    const checkSignature=()=>normalize(`${draft.title}\n${draft.description}`);
    function scheduleMatching(force=false) {
      syncInputs();clearTimeout(timer);const current=++revision;
      check=null;acceptedCheck='';matches=[];closeMatches(false);if(draft.description.trim().length<15&&!force){matching=false;renderMatchStatus('idle');return;}
      matching=true;renderMatchStatus('loading');
      timer=setTimeout(()=>{if(current!==revision||!dialog.open)return;
        const actual=similarRows(draft,rows()),demo=firstCheck;
        // The first completed check always demonstrates the three-match state;
        // subsequent revised text uses local matching. This is not an AI service.
        const found=demo?[...new Map([...actual,...rows()].map(row=>[row.id,row])).values()].slice(0,3):actual;
        timer=setTimeout(()=>{if(current!==revision||!dialog.open)return;
          firstCheck=false;check={signature:checkSignature(),checkedAt:new Date().toISOString(),demo};
          matches=found;matching=false;renderMatchStatus(found.length?'found':'none');
          const signature=normalize(`${draft.title} ${draft.description}`)+found.map(row=>row.id).join('|');
          if(found.length&&signature!==lastAutomatic&&!confirm.open){lastAutomatic=signature;showMatches();}
        },350);
      },550);
    }
    function badge(value) {return `<button type="button" class="ic-id" data-copy="${esc(value)}" aria-label="Скопировать ${esc(value)}">${esc(value)}${icon('copy')}</button>`;}
    async function copyId(value) {
      try {await navigator.clipboard.writeText(value);notify('ID скопирован.');}
      catch (_) {
        const owner=sheet.open?sheet:dialog, previous=document.activeElement;
        const buffer=document.createElement('textarea');buffer.className='ic-copy-buffer';buffer.value=value;owner.append(buffer);buffer.select();
        const copied=document.execCommand('copy');buffer.remove();previous?.focus({preventScroll:true});notify(copied?'ID скопирован.':`Не удалось скопировать автоматически: ${value}`);
      }
    }
    function showMatches() {
      if(!dialog.open||!matches.length)return;closeSelects();
      const status=row=>{const markup=window.BpmInsightPresentation?.status?.(row);if(markup)return markup;const tone=['Отклонено','Отклонён'].includes(row.status)?'red':['Реализовано','Выполнено'].includes(row.status)?'green':['Согласовано','Мнения собраны','В работе','Выполняется'].includes(row.status)?'purple':'blue';return `<span class="ic-status-dot ic-status-dot--${tone}" aria-hidden="true"></span>${esc(row.status||'Новый')}`;};
      sheet.innerHTML=`<header class="ic-sheet-header"><div><h2 id="ic-matches-title">Найдено совпадений ${matches.length}</h2><p>В реестре найдены инсайты с похожими названиями или описаниями. Проверьте их, прежде чем создавать новый инсайт.</p></div><button type="button" class="ic-icon ic-close" data-close-matches aria-label="Закрыть совпадения">${icon('matchClose')}</button></header><div class="ic-matches-list" tabindex="0" role="region" aria-label="Похожие инсайты">${matches.map(row=>`<article class="ic-match-card"><header><span class="ic-match-status">${status(row)} | ${esc((row.created||'').split('-').reverse().join('.'))}</span><div class="ic-match-meta">${window.BpmInsightPresentation.sourceBadge(row,'ic-source')}${badge(row.id)}${row.related?.[0]?`${icon('direction')}${badge(row.related[0].code)}`:''}</div></header><button type="button" class="ic-match-title" data-open-match="${esc(row.id)}">${displayText(row.title)}</button><p>${displayText(row.description)}</p></article>`).join('')}</div><footer class="ic-sheet-actions"><button type="button" class="button secondary-button" data-close-matches>Понятно</button></footer>`;
      if(!sheet.open)sheet.showModal();sheet.querySelector('[data-close-matches]')?.focus({preventScroll:true});
    }
    function closeMatches(restore=true) {if(sheet.open)sheet.close();if(restore&&dialog.open)form.querySelector('[data-show-matches]')?.focus({preventScroll:true});}
    function validation() {
      let valid=true;const require=(name,value,message)=>{setError(name,value?'':message);if(!value)valid=false;};
      require('title',draft.title.trim(),'Укажите название инсайта.');require('source',creationSources.includes(draft.source),'Выберите источник.');require('process',draft.related.length,'Выберите процесс.');
      require('bank',draft.source!=='ТБ'||draft.bank,'Выберите территориальный банк.');
      const complete=requiresCompleteDescription(draft.source);
      require('description',draft.description.trim(),'Опишите проблему или наблюдение.');
      require('rootCauses',!complete||draft.rootCauses.trim(),'Укажите корневые причины.');
      require('solution',!complete||draft.solution.trim(),'Укажите предлагаемое решение.');
      const effectsMissing=complete&&!draft.effects.length;
      setEffectsError(effectsMissing?'Добавьте хотя бы один ожидаемый эффект.':'');if(effectsMissing)valid=false;
      draft.effects.forEach(effect=>{
        const box=form.querySelector(`[data-effect="${effect.id}"]`);let message='',field='name';
        const numeric=value=>/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(String(value).trim())&&Number.isFinite(Number(String(value).replace(',','.')));
        const current=String(effect.current).trim(),target=String(effect.target).trim();
        if(!complete&&!populatedEffect(effect)) { /* An untouched placeholder is not an optional effect. */ }
        else if(effect.name.trim().length<3||effect.name.trim().length>60)message='Название эффекта должно содержать от 3 до 60 символов.';
        else if(!['Количественный','Качественный'].includes(effect.type)){message='Выберите тип эффекта.';field='type';}
        else if(effect.description.trim().length<10||effect.description.trim().length>4000){message='Описание эффекта должно содержать от 10 до 4000 символов.';field='description';}
        else if(effect.type==='Количественный'&&((current&&!numeric(current))||(target&&!numeric(target)))){message='Введите корректное десятичное число.';field=current&&!numeric(current)?'current':'target';}
        else if(effect.type==='Количественный'&&(!current||!target)){message='Укажите текущее и целевое значения количественного эффекта.';field=!current?'current':'target';}
        else if(effect.type==='Количественный'&&current&&target&&Number(current.replace(',','.'))===Number(target.replace(',','.'))){message='Целевое значение совпадает с текущим. Укажите ожидаемое изменение показателя.';field='target';}
        else if(effect.type==='Количественный'&&(!effect.unit.trim()||effect.unit.length>20)){message='Укажите единицу измерения: от 1 до 20 символов.';field='unit';}
        else if(effect.type==='Количественный'&&!['Регулярно','Единоразово'].includes(effect.frequency)){message='Выберите периодичность эффекта.';field='frequency';}
        else if(effect.type==='Количественный'&&effect.frequency==='Регулярно'&&!effect.period){message='Выберите период регулярного эффекта.';field='period';}
        const error=box.querySelector('[data-effect-error]');error.id=`ic-${effect.id}-error`;error.textContent=message;error.hidden=!message;box.classList.toggle('has-error',!!message);
        box.querySelectorAll('[aria-invalid]').forEach(control=>{control.removeAttribute('aria-invalid');control.removeAttribute('aria-describedby');});
        if(message){valid=false;const control=box.querySelector(`[data-effect-field="${field}"]`)||box.querySelector(`#ic-${effect.id}-${field}-input`);control?.setAttribute('aria-invalid','true');control?.setAttribute('aria-describedby',error.id);}
      });
      if(!valid){const error=form.querySelector('.has-error');error?.scrollIntoView({block:'center',behavior:'smooth'});(error?.querySelector('[aria-invalid="true"]')||error?.querySelector('input,textarea'))?.focus({preventScroll:true});}
      return valid;
    }
    async function submit(event) {
      event.preventDefault();if(submitting||readingFiles||!scrollGate.allow())return;syncInputs();if(!validation())return;
      if(matching){notify('Дождитесь окончания проверки совпадений.');return;}
      if(check?.signature!==checkSignature()){scheduleMatching(true);notify('Проверяем актуальные данные инсайта. Дождитесь результата.');return;}
      if(matches.length&&acceptedCheck!==check.signature){closeSelects();duplicateConfirm.showModal();duplicateConfirm.querySelector('[data-review-duplicates]').focus({preventScroll:true});return;}
      submitting=true;scrollGate.setDisabled(form.querySelector('[data-submit]'),true);closeSelects();
      const error=form.querySelector('#ic-submit-error');error.hidden=true;
      try {
        if(typeof onCreate!=='function')throw new Error('Сохранение инсайтов пока не подключено.');
        const payload=structuredClone(draft);payload.title=payload.title.trim();payload.description=payload.description.trim();payload.rootCauses=payload.rootCauses.trim();payload.solution=payload.solution.trim();
        if(!requiresCompleteDescription(payload.source))payload.effects=payload.effects.filter(populatedEffect);
        payload.effects.forEach(effect=>{if(effect.type==='Качественный')for(const key of ['current','target','unit','frequency','period'])delete effect[key];});
        if(payload.source!=='ТБ')payload.bank='';
        payload.detail={duplicateIds:matches.map(row=>row.id),duplicateCheck:{...check,title:payload.title,description:payload.description,accepted:!!matches.length}};
        const created=await onCreate(payload);if(!created)throw new Error('Не удалось сохранить инсайт. Попробуйте ещё раз.');
        dirty=false;close({force:true,discard:true,restoreFocus:false});onOpenInsight?.(created.id);
      } catch(failure) {error.textContent=failure.message || 'Не удалось сохранить инсайт. Черновик сохранён в открытой форме.';error.hidden=false;error.scrollIntoView({block:'nearest'});}
      finally {submitting=false;scrollGate.setDisabled(form.querySelector('[data-submit]'),false);}
    }
    function setup() {
      dialog=document.createElement('dialog');dialog.id='insight-create-drawer';dialog.className='ic-drawer';dialog.setAttribute('aria-labelledby','insight-create-title');
      form=document.createElement('form');form.className='ic-form';form.noValidate=true;dialog.append(form);document.body.append(dialog);
      sheet=document.createElement('dialog');sheet.id='insight-duplicate-sheet';sheet.className='ic-match-sheet';sheet.setAttribute('aria-labelledby','ic-matches-title');document.body.append(sheet);
      confirm=document.createElement('dialog');confirm.className='ic-discard-dialog';confirm.setAttribute('aria-labelledby','ic-discard-title');confirm.innerHTML=`<h2 id="ic-discard-title">Отменить создание инсайта?</h2><p>Несохранённые данные будут удалены.</p><div class="ic-actions"><button type="button" class="button secondary-button" data-keep-draft>Продолжить создание</button><button type="button" class="button primary-button" data-discard>Отменить создание</button></div>`;document.body.append(confirm);
      duplicateConfirm=document.createElement('dialog');duplicateConfirm.id='ic-duplicate-confirm';duplicateConfirm.className='ic-discard-dialog';duplicateConfirm.setAttribute('aria-labelledby','ic-duplicate-confirm-title');duplicateConfirm.innerHTML=`<h2 id="ic-duplicate-confirm-title">Создать инсайт при наличии совпадений?</h2><p>В системе есть похожие инсайты. Созданный инсайт будет связан с найденными записями.</p><div class="ic-actions"><button type="button" class="button secondary-button" data-review-duplicates>Посмотреть совпадения</button><button type="button" class="button primary-button" data-create-anyway>Создать инсайт</button></div>`;document.body.append(duplicateConfirm);
      form.addEventListener('submit',submit);
      form.addEventListener('input',event=>{dirty=true;const field=event.target;if(field.tagName==='TEXTAREA')resizeTextarea(field);if(field.name)setError(field.name);if(['title','description'].includes(field.name))scheduleMatching();});
      form.addEventListener('click',event=>{
        const button=event.target.closest('button');if(!button)return;
        if(button.hasAttribute('data-close'))close();
        if(button.hasAttribute('data-add-effect'))addEffect();
        if(button.dataset.removeEffect&&(!requiresCompleteDescription(draft.source)||draft.effects.length>1)){syncInputs();draft.effects=draft.effects.filter(effect=>effect.id!==button.dataset.removeEffect);dirty=true;renderEffects();}
        if(button.hasAttribute('data-add-files'))form.querySelector('#ic-file-input').click();
        if(button.dataset.removeFile){draft.attachments=draft.attachments.filter(file=>file.id!==button.dataset.removeFile);dirty=true;renderAttachments();}
        if(button.hasAttribute('data-show-matches'))showMatches();
        if(button.dataset.removeRelation){const kind=button.dataset.removeRelation;const list=kind==='variants'?draft.related[0].variants:draft.products;list.splice(list.indexOf(button.dataset.value),1);selectors.find(item=>item.id===`ic-${kind}`)?.set([...list]);dirty=true;renderRelationChips();}
      });
      form.addEventListener('change',event=>{if(event.target.id==='ic-file-input'){attachFiles(event.target.files);event.target.value='';}});
      form.addEventListener('dragover',event=>{const zone=event.target.closest('.ic-dropzone');if(zone){event.preventDefault();zone.classList.add('is-dragover');}});
      form.addEventListener('dragleave',event=>{const zone=event.target.closest('.ic-dropzone');if(zone&&!zone.contains(event.relatedTarget))zone.classList.remove('is-dragover');});
      form.addEventListener('drop',event=>{const zone=event.target.closest('.ic-dropzone');if(zone){event.preventDefault();zone.classList.remove('is-dragover');attachFiles(event.dataTransfer.files);}});
      form.addEventListener('scroll',event=>{if(!event.target.classList.contains('ic-scroll'))return;const viewport=event.target.getBoundingClientRect();selectors.forEach(item=>{if(!item.popup)return;const anchor=item.control.getBoundingClientRect();if(anchor.bottom<viewport.top||anchor.top>viewport.bottom)item.close();else item.refresh();});},{passive:true,capture:true});
      window.addEventListener('resize',()=>{if(dialog.open)form.querySelectorAll('textarea').forEach(resizeTextarea);},{passive:true});
      dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
      // The modal backdrop absorbs clicks without closing or discarding the draft.
      dialog.addEventListener('click',event=>{if(event.target===dialog){event.preventDefault();event.stopPropagation();}});
      sheet.addEventListener('cancel',event=>{event.preventDefault();closeMatches();});
      sheet.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-close-matches'))closeMatches();if(button.dataset.copy)copyId(button.dataset.copy);if(button.dataset.openMatch){const id=button.dataset.openMatch;syncInputs();closeMatches(false);if(onPreviewInsight)onPreviewInsight(id,{trigger:form.querySelector('[data-show-matches]'),onReturn:()=>{if(dialog.open)showMatches();}});else{close({force:true,preserve:true,restoreFocus:false});onOpenInsight?.(id);}}});
      confirm.addEventListener('click',event=>{if(event.target.closest('[data-keep-draft]'))confirm.close();if(event.target.closest('[data-discard]')){confirm.close();close({force:true,discard:true});}});
      duplicateConfirm.addEventListener('click',event=>{if(event.target.closest('[data-review-duplicates]')){duplicateConfirm.close();showMatches();}if(event.target.closest('[data-create-anyway]')){acceptedCheck=check?.signature||'';duplicateConfirm.close();form.requestSubmit();}});
      dialog.addEventListener('close',()=>{if(dialog.open)return;scrollGate.end();syncInputs();++revision;clearTimeout(timer);matching=false;selectors.forEach(item=>item.close?.());closeMatches(false);if(confirm.open)confirm.close();if(duplicateConfirm.open)duplicateConfirm.close();document.body.classList.remove('ic-drawer-open');});
    }
    function open(returnTrigger) {
      if(!dialog)setup();if(dialog.open)return;trigger=returnTrigger?.trigger || returnTrigger || document.activeElement;
      scrollGate.begin();buildForm();dialog.showModal();document.body.classList.add('ic-drawer-open');
      scrollGate.bind({root:dialog,scroll:form.querySelector('.ic-scroll'),buttons:[form.querySelector('[data-submit]')],form});
      form.querySelector('[name="title"]').focus({preventScroll:true});
      form.querySelectorAll('textarea').forEach(resizeTextarea);if(draft.description.trim()&&!matches.length)scheduleMatching();
    }
    function close(options={}) {
      if(!dialog?.open)return;if(submitting&&!options.force)return;
      syncInputs();if(dirty&&!options.force&&!options.immediate){closeSelects();confirm.showModal();return;}
      ++revision;clearTimeout(timer);matching=false;closeSelects();closeMatches(false);if(confirm.open)confirm.close();if(duplicateConfirm.open)duplicateConfirm.close();scrollGate.end();dialog.close();
      if(options.discard){draft=blank();dirty=false;matches=[];lastAutomatic='';check=null;firstCheck=true;acceptedCheck='';}
      if(options.restoreFocus!==false&&trigger?.isConnected)trigger.focus({preventScroll:true});
    }
    return Object.freeze({open,close,isOpen:()=>!!dialog?.open,getDraft:()=>{if(dialog?.open)syncInputs();return structuredClone(draft);}});
  }
  window.BpmInsightCreate=Object.freeze({create});
})();

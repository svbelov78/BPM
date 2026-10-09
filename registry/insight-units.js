/* BRD-007 4.2.1.2 · shared effect units for creation and bank evaluation.
 * Canonicalisation applies to form values only, never to stored author data. */
(() => {
  'use strict';
  const catalog = Object.freeze([
    ['Время',['сек.','мин.','час.','дн.','раб. дн.','мес.','чел.-ч']],
    ['Количество',['шт.','шт./день','чел.','ПШЭ','ед.','раз']],
    ['Доли и оценки',['%','п.п.','балл','пункт']],
    ['Деньги',['руб.','тыс. руб.','млн. руб.','млрд. руб.']]
  ].flatMap(([group,values]) => values.map(value => Object.freeze({group,value,label:value}))));
  const key = value => String(value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g,' ');
  const aliases = Object.freeze({'сек':'сек.','мин':'мин.','час':'час.','день':'дн.','дн':'дн.','мес':'мес.','шт':'шт.','чел':'чел.','ед':'ед.','руб':'руб.'});
  function canonicalize(value) {
    const text = String(value ?? '').trim(), normalized = key(text);
    return catalog.find(option => key(option.value) === normalized)?.value || aliases[normalized] || text;
  }
  function valid(value) {return String(value ?? '').trim().length >= 1 && String(value ?? '').trim().length <= 20;}
  function enhanceSelect(instance) {
    if (!instance) return instance;
    const render = instance.renderOptions.bind(instance), changed = instance.config.onChange;
    instance.values = instance.values.map(canonicalize).filter(Boolean);
    instance.input.maxLength = 20;
    instance.config.onChange = values => changed?.(values.map(canonicalize));
    instance.renderOptions = function() {
      const query = this.query.trim(), canonicalQuery = canonicalize(query);
      const options = [...catalog];
      for (const value of this.values.map(canonicalize)) {
        if (valid(value) && !options.some(option => option.value === value)) options.push({value,label:value,group:'Свое значение'});
      }
      if (valid(canonicalQuery) && !options.some(option => key(option.value) === key(canonicalQuery))) {
        options.push({value:canonicalQuery,label:`Использовать «${canonicalQuery}»`,group:'Свое значение'});
      }
      this.options = options;
      // Known legacy terms search the canonical entry instead of offering a
      // second "мин" next to "мин." or a separate "день" next to "дн.".
      this.query = canonicalQuery;
      render();
      this.query = query;
      let previous = '';
      this.popup?.querySelectorAll('[data-option]').forEach(element => {
        const group = this.options.find(option => option.value === element.dataset.option)?.group;
        if (group && group !== previous) {
          const heading = document.createElement('div');
          heading.className = 'ic-select-group insight-unit-group';
          heading.setAttribute('role','presentation'); heading.textContent = group;
          element.before(heading);
        }
        previous = group;
      });
    };
    instance.refresh();
    return instance;
  }
  window.BpmInsightUnits = Object.freeze({catalog,canonicalize,valid,enhanceSelect});
})();

/* Customer Journey Details: Figma QdYByHLCCMIKfTI0O0SXiE, nodes 1067:7 and 1067:8. */
(() => {
  'use strict';
  const assets = 'assets/journey-details/';
  const banks = Object.freeze({
    't-bank': {name:'Т-Банк', height:22.974},
    sber: {name:'Сбер', height:17.398},
    ozon: {name:'Озон Банк', height:14},
    vtb: {name:'ВТБ', height:22.974},
    'alfa-bank': {name:'Альфа Банк', height:21.207}
  });
  const benchmarkDescription = 'Бенчмаркинг в BPM (Business Process Management — управление бизнес-процессами) — это систематический процесс сравнения собственных бизнес-процессов, практик и показателей эффективности с показателями лидеров отрасли или лучших в своём классе организаций. Согласно определению ISO 9004, бенчмаркинг — это инструмент для улучшения деятельности за счёт анализа лучших практик, как внутренних, так и внешних.';
  const aiObservations = [
    'Отсутствует кнопка повтора перевода на экране успеха. На экране успеха доступны только кнопки «В платежи» и «Сохранить чек».',
    'Клиент, совершающий регулярные переводы себе, не получает быстрого доступа к повтору той же операции. Актуально после прихода денег при распределении.',
    'Экран успеха показывает только: «Перевод доставлен», сумма и пара счетов — без остатков, даты, времени и номера операции, тогда как у конкурента (Т-Банк) результат показывает «512 ₽ → 412 ₽» и «−100 ₽».',
    'Клиенту не называется размер комиссии, при этом конкурент (Т-Банк) говорит о том, что перевод будет бесплатным.'
  ];
  const benchmarks = [
    {id:'convenience', title:'Удобство совершения перевода (%)', score:'6%', tone:'info', ranking:[['t-bank',86],['sber',79],['ozon',75],['vtb',75],['alfa-bank',74]]},
    {id:'speed', title:'Скорость зачисления перевода (%)', score:'0%', tone:'danger', ranking:[['t-bank',88],['ozon',84],['vtb',83],['sber',82],['alfa-bank',82]]}
  ];
  const insightDescriptions = [
    'Сбер — 3 экрана = ВТБ (3 экрана) = Озон Банк (3 экрана). Т-Банк и Альфа Банк по 5 экранов',
    'При допустимой норме 0,05% сбоев, процесс показывает надёжность 99,99%'
  ];

  function render(u) {
    const {esc, icon} = u;
    const number = value => `<span data-pd-motion-number="${esc(value)}">${esc(value)}</span>`;
    const score = (value, tone='positive', limit='', prefix='') => `<span class="jd-score jd-score--${tone}">${prefix?`<strong class="jd-supplement-score-label">${esc(prefix)}</strong>`:''}${number(value)}${limit?`<small>/ ${esc(limit)}</small>`:''}</span>`;
    const more = (label, message) => `<button type="button" class="jd-supplement-more" data-pd-demo="${esc(message)}"><span>${esc(label)}</span>${icon('imgIcon24ChevronDown')}</button>`;
    const rank = ([key, percentage], index) => `<li class="jd-benchmark-row${key==='sber'?' jd-benchmark-row--sber':''}">
      <span class="jd-benchmark-rank" aria-hidden="true">${index+1}</span>
      <span class="jd-benchmark-bank"><img src="${assets}supplement-${key}.png" alt="${esc(banks[key].name)}" width="64" height="${banks[key].height}"></span>
      <span class="jd-benchmark-track" aria-hidden="true"><span class="jd-benchmark-value" style="width:${percentage}%;--jd-bar-index:${index}"></span></span>
      <span class="jd-benchmark-percent">${number(`${percentage}%`)}</span>
    </li>`;
    const benchmarkCard = data => `<article class="jd-benchmark-card" aria-labelledby="jd-benchmark-${data.id}" data-pd-motion-group="benchmark">
      <div class="jd-benchmark-result"><p>Результирующая метрика: NPS</p>${score(data.score,data.tone,'7,5%')}</div>
      <h4 id="jd-benchmark-${data.id}" class="jd-supplement-title">${esc(data.title)}</h4>
      <ol class="jd-benchmark-ranking" aria-label="Рейтинг банков: ${esc(data.title)}">${data.ranking.map(rank).join('')}</ol>
      <div class="jd-benchmark-footer">${more('Ещё 12','В макете показаны только первые пять банков. Данные ещё 12 банков не представлены.')}</div>
    </article>`;

    const benchmark = `<section id="pd-benchmark" class="pd-section jd-section jd-benchmark-section" aria-labelledby="jd-benchmark-title">
      <div class="jd-section-heading" data-pd-motion-group="journey-score"><h2 id="jd-benchmark-title">Бенчмаркинг и AI CJM</h2>${score('21%','info','30%')}</div>
      <div class="jd-section-content jd-supplement-content">
        <p class="jd-supplement-description">${esc(benchmarkDescription)}</p>
        <div class="jd-benchmark-drivers">
          <h3 class="jd-supplement-title">Драйверы <span class="pd-counter">8</span></h3>
          <div class="jd-supplement-grid">${benchmarks.map(benchmarkCard).join('')}</div>
          <div class="jd-supplement-more-row jd-benchmark-more">${more('Ещё 6','В макете показаны только два драйвера. Остальные шесть драйверов не представлены.')}</div>
        </div>
        <article class="jd-supplement-panel jd-ai-cjm" aria-labelledby="jd-ai-cjm-title" data-pd-motion-group="journey-score">
          <div class="jd-supplement-panel-heading jd-ai-heading">${icon('imgAiStars')}<h3 id="jd-ai-cjm-title" class="jd-supplement-title">AI-CJM</h3><div class="jd-ai-scores">${score('96%','positive','','CX-experience score')}${score('15%','positive','15%')}</div></div>
          <ul class="jd-ai-observations">${aiObservations.map(text=>`<li>${esc(text)}</li>`).join('')}</ul>
        </article>
      </div>
    </section>`;

    const insightCard = (description, index) => `<article class="jd-supplement-panel jd-insight-card" aria-labelledby="jd-insight-${index+1}" data-pd-motion-group="journey-score">
      <div class="jd-insight-heading"><h3 id="jd-insight-${index+1}" class="jd-supplement-title">Количество экранов на уровне конкурентов</h3>${score('+15%')}</div>
      <p>${esc(description)}</p>
    </article>`;
    const additional = `<section id="pd-additional" class="pd-section jd-section jd-additional-section" aria-labelledby="jd-additional-title">
      <div class="jd-section-heading" data-pd-motion-group="journey-score"><h2 id="jd-additional-title">Дополнительные метрики / инсайты <span class="pd-counter">3</span></h2>${score('+15%')}</div>
      <div class="jd-section-content jd-supplement-content">
        <p class="jd-supplement-description">Текст про то, откуда берётся данная метрика и как она участвует в рейтинге</p>
        <div class="jd-supplement-grid">${insightDescriptions.map(insightCard).join('')}</div>
        <div class="jd-supplement-more-row">${more('Ещё 1','В макете показаны только два дополнительных инсайта. Третий инсайт не представлен.')}</div>
        <article class="jd-supplement-panel jd-operational-risks" aria-labelledby="jd-risk-title" data-pd-motion-group="journey-score">
          <div class="jd-supplement-panel-heading"><img class="pd-icon" src="${assets}supplement-lightning.svg" width="24" height="24" alt=""><h3 id="jd-risk-title" class="jd-supplement-title">Операционные риски</h3>${score('−15%','danger')}</div>
          <p class="jd-risk-limit">Лимит превышен</p>
          <p><strong>Косвенные потери: 7 283 % годового лимита</strong> — процесс «Осуществление переводов денежных средств через сервис Банка России «Система быстрых платежей»», реализовано 218,5 млн ₽ при лимите 3,0 млн ₽.</p>
        </article>
      </div>
    </section>`;
    return benchmark+additional;
  }
  window.BpmJourneySupplement = Object.freeze({render});
})();

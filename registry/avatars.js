/* Local fictional business portraits. A person's portrait is stable across views,
 * reloads and filters; no requests to a remote avatar service or stored mapping. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const nameOf = person => typeof person === 'object' && person !== null ? person.name || person.label || '' : String(person ?? '');
  const normalize = value => nameOf(value).trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const femaleNames = new Set(['александра','алена','алина','алла','анастасия','анна','валентина','валерия','вера','виктория','галина','дарья','евгения','екатерина','елена','елизавета','зоя','инна','ирина','кристина','ксения','лариса','лидия','любовь','людмила','маргарита','марина','мария','надежда','наталья','нина','оксана','ольга','полина','светлана','софия','тамара','татьяна','юлия']);
  const maleNames = new Set(['александр','алексей','анатолий','андрей','антон','артем','аркадий','борис','вадим','валерий','василий','виктор','виталий','владимир','владислав','вячеслав','геннадий','георгий','глеб','григорий','денис','дмитрий','евгений','иван','игорь','илья','кирилл','константин','леонид','максим','михаил','никита','николай','олег','павел','петр','роман','сергей','степан','тимофей','федор','юрий','ярослав']);
  const isMissing = value => !normalize(value) || /^(?:—+|-+|не указан(?:а|ы)?|(?:не|на) назначен(?:а|ы)?|руководитель не указан)$/.test(normalize(value));
  // Replace the old celebrity joke only in presentation, just like missing
  // names; stored identity and workflow authorization must stay unchanged.
  const demoNameAliases = Object.freeze({'гослинг райан томас':'Громов Роман Тимофеевич'});
  function hash(value) {
    let result = 2166136261;
    for (const character of value) result = Math.imul(result ^ character.codePointAt(0), 16777619) >>> 0;
    return result;
  }
  function displayName(person, fallbackKey = '') {
    if (!isMissing(person)) return Object.prototype.hasOwnProperty.call(demoNameAliases,normalize(person)) ? demoNameAliases[normalize(person)] : nameOf(person).trim();
    const key = normalize(fallbackKey) || 'person';
    const female = hash(`${key}:gender`) % 2 === 1;
    const surnames = ['Соколов','Орлов','Лебедев','Волков','Морозов','Новиков','Фролов','Белов','Громов','Крылов','Титов','Комаров'];
    const firstNames = female ? ['Анна','Елена','Ольга','Мария','Наталья','Ирина','Татьяна','Юлия'] : ['Александр','Дмитрий','Сергей','Андрей','Михаил','Алексей','Иван','Максим'];
    const patronymics = female ? ['Александровна','Дмитриевна','Сергеевна','Андреевна','Михайловна','Алексеевна','Ивановна','Павловна'] : ['Александрович','Дмитриевич','Сергеевич','Андреевич','Михайлович','Алексеевич','Иванович','Павлович'];
    return `${surnames[hash(`${key}:surname`) % surnames.length]}${female ? 'а' : ''} ${firstNames[hash(`${key}:first`) % firstNames.length]} ${patronymics[hash(`${key}:patronymic`) % patronymics.length]}`;
  }
  function portraitIndex(person, fallbackKey = '') {
    const name = normalize(displayName(person, fallbackKey));
    const parts = name.split(' ');
    const female = parts.some(part => /(?:вна|чна)$/.test(part)) || parts.some(part => femaleNames.has(part));
    const male = parts.some(part => /(?:вич|ьич)$/.test(part)) || parts.some(part => maleNames.has(part));
    return !female && !male ? hash(name) % 16 : (female ? 8 : 0) + hash(name) % 8;
  }
  function portrait(person, fallbackKey = '') {
    const index = portraitIndex(person, fallbackKey);
    const coordinate = offset => Number((offset * 100 / 3).toFixed(6));
    return `<span class="bpm-avatar-portrait" aria-hidden="true" data-bpm-person="${escape(normalize(displayName(person,fallbackKey)))}" data-bpm-portrait="${index}" style="--bpm-avatar-x:${coordinate(index % 4)}%;--bpm-avatar-y:${coordinate(Math.floor(index / 4))}%"></span>`;
  }
  window.BpmAvatars = Object.freeze({portrait, portraitIndex, normalize, displayName, isMissing});
})();

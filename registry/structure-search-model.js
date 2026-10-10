/* Search identities and occurrence-aware filters for the registry structure. */
(function () {
  'use strict';

  const normalize = value => String(value ?? '').toLocaleLowerCase('ru').replace(/ё/g, 'е')
    .replace(/[‐‑‒–—−]/g, '-').replace(/[«»„“”]/g, '"').replace(/\s+/g, ' ').trim();
  const compactCode = value => normalize(value).replace(/[^a-zа-я0-9]/g, '');
  const distinct = values => [...new Set(values.filter(value => value !== null && value !== undefined && String(value).trim()).map(String))];
  const kindOrder = {product: 0, paths: 1, processes: 2, divisionLeader: 3, processOwner: 4, pathOwner: 5};
  const personId = name => `person-${encodeURIComponent(normalize(name))}`;
  function ownerNames(source) {
    const valid = value => {
      if (typeof value !== 'string') return false;
      const name = normalize(value);
      if (/^#(?:n\/a|н\/д|value!|знач!|ref!|ссылка!|name\?|имя\?|div\/0!|дел\/0!|num!|число!|null!|пусто!)$/i.test(name)) return false;
      return /[а-яa-z]/i.test(name) && !/^(?:[-.·\s]+|н\s*\/\s*д|n\s*\/\s*a|null|undefined|нет(?:\s+данных)?|не\s+(?:указан[аоы]?|определен[аоы]?|назначен[аоы]?|задан[аоы]?))$/i.test(name)
        && !/^(?:руководитель|владелец|ответственный|фио)\s+(?:.*\s+)?не\s+(?:указан|определен|назначен|задан)/i.test(name)
        && !/^\d+\s+(?:владельц|руководител|ответственн)/i.test(name);
    };
    const fromArray = Array.isArray(source?.owners) ? source.owners.filter(valid) : [];
    const candidates = fromArray.length ? fromArray : valid(source?.owner) ? [source.owner] : [];
    const names = new Map();
    candidates.forEach(value => {
      const name = value.replace(/\s+/g, ' ').trim();
      if (!names.has(normalize(name))) names.set(normalize(name), name);
    });
    return [...names.values()];
  }

  function create(models) {
    const processModel = models.processes;
    const pathModel = models.paths;
    const products = (processModel.nodes || []).filter(node => node.kind === 'product');
    const productById = new Map(products.map(node => [node.id, node]));
    const parents = new Map(), productLeaders = new Map();
    const visit = (nodes, ancestors = [], leaders = []) => nodes.forEach(node => {
      parents.set(node.id, ancestors.join(' / '));
      const branchLeaders = node.kind === 'division' ? [...leaders, ...ownerNames(node).map(personId)] : leaders;
      if (node.kind === 'product') productLeaders.set(node.id, new Set(branchLeaders));
      visit(node.children || [], [...ancestors, node.name], branchLeaders);
    });
    visit(processModel.roots || []);

    const entries = [], byKey = new Map(), searchable = new Map();
    function add(kind, source, code, aliases, codes, breadcrumb) {
      const entry = {
        id: source.id, kind, title: source.title || source.name || '', code,
        aliases: distinct(aliases), breadcrumb: breadcrumb || ''
      };
      const key = `${kind}:${entry.id}`;
      if (byKey.has(key)) return;
      byKey.set(key, entry);
      entries.push(entry);
      searchable.set(key, {
        title: normalize(entry.title),
        text: normalize([entry.title, entry.code, ...entry.aliases, ...codes].join(' ')),
        codes: distinct(codes).map(compactCode)
      });
    }

    for (const product of products) {
      // Unassigned/service groups remain in the tree, but are not products.
      if (product.isPlaceholder) continue;
      const ids = distinct(product.productIds || []).filter(id => /^\d+$/.test(id));
      const codes = ids.flatMap(id => [`Пр ${id}`, id]);
      add('product', product, ids.length ? ids.map(id => `Пр ${id}`).join(' / ') : 'Продукт',
        product.nameAliases || [], [...codes, ...(product.productUids || [])], parents.get(product.id));
    }
    for (const path of pathModel.records || []) {
      add('paths', path, path.code || '', [...(path.titleAliases || []), ...(path.sourceNameAliases || [])],
        [path.code || ''], distinct((path.productLinks || []).map(link => productById.get(link.id)?.name || link.name)).join(' / '));
    }
    for (const process of processModel.records || []) {
      const code = process.code ? String(process.code).replace(/^П\s*(\d+)$/i, 'П $1') : '';
      add('processes', process, code, process.titleAliases || [], [code, process.code || ''],
        distinct((process.productLinks || []).map(link => productById.get(link.id)?.name || link.name)).join(' / '));
    }

    function addPerson(kind, name, source, sourceKind) {
      const id = personId(name), key = `${kind}:${id}`;
      if (!byKey.has(key)) {
        add(kind, {id, title: name}, '', [], [], '');
        const entry = byKey.get(key);
        entry.person = true;
        entry.sources = [];
      }
      const entry = byKey.get(key);
      if (!entry.sources.some(item => item.id === source.id && item.kind === sourceKind)) {
        entry.sources.push({id: source.id, kind: sourceKind, title: source.title || source.name || ''});
      }
      if (source.ownerSimulated) entry.simulated = true;
    }
    for (const division of (processModel.nodes || []).filter(node => node.kind === 'division')) {
      ownerNames(division).forEach(name => addPerson('divisionLeader', name, division, 'division'));
    }
    const processOwners = new Map();
    for (const process of processModel.records || []) {
      const names = ownerNames(process);
      processOwners.set(process.id, new Set(names.map(personId)));
      names.forEach(name => addPerson('processOwner', name, process, 'processes'));
    }
    const pathOwners = new Map();
    for (const path of pathModel.records || []) {
      const names = ownerNames(path);
      pathOwners.set(path.id, new Set(names.map(personId)));
      // Source ownership may be more specific than the global display record.
      [...names, ...(path.sourceLinks || []).flatMap(ownerNames)]
        .forEach(name => addPerson('pathOwner', name, path, 'paths'));
    }

    // A КП can span several products, with different processes in each one.
    // Never form a Cartesian product from global productLinks/linkedProcesses.
    const pathOccurrences = new Map(), pathOwnersByProduct = new Map(), linkedPathOwners = new Map(), pathOwnerOccurrences = new Map();
    for (const path of pathModel.records || []) {
      const byProduct = new Map(), ownersByProduct = new Map(), ownersByOccurrence = new Map();
      for (const link of path.sourceLinks || []) {
        if (!link.productId) continue;
        if (!ownersByProduct.has(link.productId)) ownersByProduct.set(link.productId, new Set());
        const owners = ownerNames(link).map(personId);
        owners.forEach(id => ownersByProduct.get(link.productId).add(id));
        if (!link.processId || link.validProcessCode === false) continue;
        if (!byProduct.has(link.productId)) byProduct.set(link.productId, new Set());
        byProduct.get(link.productId).add(link.processId);
        if (!linkedPathOwners.has(link.productId)) linkedPathOwners.set(link.productId, new Map());
        const byProcess = linkedPathOwners.get(link.productId);
        if (!byProcess.has(link.processId)) byProcess.set(link.processId, new Set());
        owners.forEach(id => byProcess.get(link.processId).add(id));
        if (!ownersByOccurrence.has(link.productId)) ownersByOccurrence.set(link.productId, new Map());
        const occurrence = ownersByOccurrence.get(link.productId);
        if (!occurrence.has(link.processId)) occurrence.set(link.processId, new Set());
        owners.forEach(id => occurrence.get(link.processId).add(id));
      }
      pathOccurrences.set(path.id, byProduct);
      pathOwnersByProduct.set(path.id, ownersByProduct);
      pathOwnerOccurrences.set(path.id, ownersByOccurrence);
    }

    // The compact people filter lists each person once, across all their roles.
    // Keep role-specific search entries separate so existing search semantics
    // and occurrence-aware constraints remain unchanged.
    const peopleById = new Map();
    entries.filter(entry => entry.person).forEach(entry => {
      if (!peopleById.has(entry.id)) peopleById.set(entry.id, {id:entry.id,kind:'people',title:entry.title,code:'',person:true,roles:[]});
      peopleById.get(entry.id).roles.push(entry.kind);
    });
    const people = [...peopleById.values()].sort((a,b)=>a.title.localeCompare(b.title,'ru'));

    function search(query) {
      const needle = normalize(query);
      if (!needle) return [];
      const tokens = needle.split(' '), compact = compactCode(needle);
      const ranked = [];
      for (const entry of entries) {
        const data = searchable.get(`${entry.kind}:${entry.id}`);
        // Compact matching is limited to IDs; spaces inside an entered code
        // must not concatenate unrelated words in entity names.
        const codeMatch = compact && data.codes.some(code => code.includes(compact));
        if (!codeMatch && !tokens.every(token => data.text.includes(token))) continue;
        const exactCode = compact && data.codes.includes(compact);
        const rank = exactCode || data.title === needle ? 0 : data.title.startsWith(needle) ? 1 : data.title.includes(needle) ? 2 : 3;
        ranked.push({entry, rank});
      }
      return ranked.sort((a, b) => kindOrder[a.entry.kind] - kindOrder[b.entry.kind]
        || a.rank - b.rank || a.entry.title.localeCompare(b.entry.title, 'ru')
        || a.entry.code.localeCompare(b.entry.code, 'ru', {numeric: true})
        || a.entry.id.localeCompare(b.entry.id)).map(item => item.entry);
    }

    function matches(node, row, sourceEntity, selections = {}) {
      if (selections.people?.length) {
        const base = {...selections,people:[]};
        if (!matches(node,row,sourceEntity,base)) return false;
        return selections.people.some(id => peopleById.get(id)?.roles.some(kind =>
          matches(node,row,sourceEntity,{...base,[kind]:[id]})));
      }
      const selectedProducts = selections.product || [];
      const selectedPaths = selections.paths || [];
      const selectedProcesses = selections.processes || [];
      const selectedLeaders = selections.divisionLeader || [];
      const selectedProcessOwners = selections.processOwner || [];
      const selectedPathOwners = selections.pathOwner || [];
      const containsAny = (ids, choices) => Boolean(ids && choices.some(id => ids.has(id)));
      if (selectedProducts.length && !selectedProducts.includes(node.id)) return false;
      if (selectedLeaders.length && !containsAny(productLeaders.get(node.id), selectedLeaders)) return false;
      if (!row) return !selectedPaths.length && !selectedProcesses.length && !selectedProcessOwners.length && !selectedPathOwners.length;
      if (sourceEntity === 'paths') {
        if (selectedPaths.length && !selectedPaths.includes(row.id)) return false;
        const linked = pathOccurrences.get(row.id)?.get(node.id);
        if (selectedProcesses.length) {
          if (!linked || !selectedProcesses.some(id => linked.has(id))) return false;
        }
        // The process and its owner must refer to the same related entity,
        // not two unrelated siblings which happen to belong to this КП.
        if (selectedProcessOwners.length && (!linked || ![...linked].some(id =>
          (!selectedProcesses.length || selectedProcesses.includes(id)) && containsAny(processOwners.get(id), selectedProcessOwners)))) return false;
        if (selectedPathOwners.length) {
          const local = pathOwnersByProduct.get(row.id);
          const owners = local?.has(node.id) ? local.get(node.id) : pathOwners.get(row.id);
          if (!containsAny(owners, selectedPathOwners)) return false;
        }
      } else if (sourceEntity === 'processes') {
        if (selectedProcesses.length && !selectedProcesses.includes(row.id)) return false;
        if (selectedPaths.length && !selectedPaths.some(id => pathOccurrences.get(id)?.get(node.id)?.has(row.id))) return false;
        if (selectedProcessOwners.length && !containsAny(processOwners.get(row.id), selectedProcessOwners)) return false;
        if (selectedPathOwners.length) {
          const ownsRelatedPath = selectedPaths.length
            ? selectedPaths.some(id => containsAny(pathOwnerOccurrences.get(id)?.get(node.id)?.get(row.id), selectedPathOwners))
            : containsAny(linkedPathOwners.get(node.id)?.get(row.id), selectedPathOwners);
          if (!ownsRelatedPath) return false;
        }
      } else return false;
      return true;
    }

    return {entries, people, get: (kind, id) => kind==='people'?peopleById.get(id):byKey.get(`${kind}:${id}`), search, matches};
  }

  window.BPMStructureSearchModel = {create};
}());

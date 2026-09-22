/*
 * Product block → product SSP → product → linked processes.
 * The local workbook snapshot supplies entity names, source owners and relationships.
 * Efficiency and the 47 block/division leaders are demonstration fields.
 * The workbook has no block/division leader columns; source owners stay intact.
 * Load structure-source.js first. See STRUCTURE-SOURCES.md.
 */
(function () {
  'use strict';
  var source = window.BPM_STRUCTURE_SOURCE;
  if (!source) throw new Error('The workbook snapshot structure-source.js must load first.');

  var colors = [
    { key: 'green', label: 'Лидеры · >85%', color: '#34c759' },
    { key: 'indigo', label: 'On track · >65–85%', color: 'var(--efficiency-on-track-gradient)' },
    { key: 'yellow', label: 'Есть отставания · >45–65%', color: '#ffcc00' },
    { key: 'red', label: 'Критическое отставание · ≤45%', color: '#ff383c' },
    { key: 'grey', label: 'Не оценивались', color: 'var(--efficiency-unrated-fill)' }
  ];
  var profiles = [
    [55, 22, 12, 7, 4], [22, 36, 19, 12, 11], [31, 14, 27, 18, 10],
    [15, 18, 23, 35, 9], [39, 28, 9, 7, 17], [49, 20, 13, 11, 7],
    [18, 34, 28, 14, 6], [26, 19, 16, 12, 27]
  ];
  var ranges = [[851, 1000], [651, 850], [451, 650], [0, 450]];
  var roots = [], nodes = [], records = [], sourceIssues = [];
  var rootMap = new Map(), divisionMap = new Map(), productMap = new Map();
  var processMap = new Map(), paths = new Set(), rawRelations = new Set();
  var guidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

  function hash(text) {
    var result = 2166136261;
    for (var i = 0; i < text.length; i += 1) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
    result ^= result >>> 16;
    result = Math.imul(result, 0x85ebca6b);
    result ^= result >>> 13;
    result = Math.imul(result, 0xc2b2ae35);
    return (result ^ (result >>> 16)) >>> 0;
  }
  function stableId(kind, key) { return 'structure-' + kind + '-' + hash(key).toString(36); }
  function demonstrationLeader(key) {
    // Stable, fictional full names for the 9 blocks and 38 divisions only.
    var female = hash(key + ':leader-gender') % 2 === 1;
    var surnames = ['Соколов', 'Орлов', 'Лебедев', 'Волков', 'Морозов', 'Новиков', 'Фролов', 'Белов', 'Громов', 'Крылов', 'Титов', 'Комаров'];
    var firstNames = female
      ? ['Анна', 'Елена', 'Ольга', 'Мария', 'Наталья', 'Ирина', 'Татьяна', 'Юлия', 'Екатерина', 'Светлана']
      : ['Александр', 'Дмитрий', 'Сергей', 'Андрей', 'Михаил', 'Алексей', 'Иван', 'Максим', 'Владимир', 'Николай'];
    var patronymics = female
      ? ['Александровна', 'Дмитриевна', 'Сергеевна', 'Андреевна', 'Михайловна', 'Алексеевна', 'Ивановна', 'Владимировна', 'Николаевна', 'Павловна']
      : ['Александрович', 'Дмитриевич', 'Сергеевич', 'Андреевич', 'Михайлович', 'Алексеевич', 'Иванович', 'Владимирович', 'Николаевич', 'Павлович'];
    return surnames[hash(key + ':leader-surname') % surnames.length] + (female ? 'а' : '') + ' '
      + firstNames[hash(key + ':leader-name') % firstNames.length] + ' '
      + patronymics[hash(key + ':leader-patronymic') % patronymics.length];
  }
  function unique(values) { return Array.from(new Set(values)); }
  function mode(values) {
    var counts = new Map();
    values.forEach(function (value) { counts.set(value, (counts.get(value) || 0) + 1); });
    return Array.from(counts).sort(function (a, b) {
      return b[1] - a[1] || a[0].localeCompare(b[0], 'ru');
    })[0][0];
  }
  function makeNode(kind, key, name) {
    var item = {
      id: stableId(kind, key), name: name, kind: kind,
      owner: 'Руководитель не указан', ownerRole: '', owners: [],
      total: 0, buckets: [0, 0, 0, 0, 0], children: [], records: [],
      source: 'xlsx'
    };
    if (kind === 'block' || kind === 'division') {
      item.owner = demonstrationLeader(item.id);
      item.ownerRole = 'Руководитель';
      item.owners = [item.owner];
      item.ownerSimulated = true;
    }
    nodes.push(item);
    return item;
  }
  function efficiency(code, processBlock) {
    var weights = profiles[hash(processBlock) % profiles.length];
    var threshold = hash(code + ':bucket') / 4294967296 * 100;
    var bucket = 4;
    for (var i = 0; i < weights.length; i += 1) {
      threshold -= weights[i];
      if (threshold < 0) { bucket = i; break; }
    }
    var range = ranges[bucket];
    return {
      bucket: bucket,
      value: range ? (range[0] + hash(code + ':value') % (range[1] - range[0] + 1)) / 10 : null
    };
  }
  function aggregate(item) {
    var set = new Map();
    if (item.kind === 'product') {
      item.records.forEach(function (record) { set.set(record.id, record); });
    } else {
      item.children.forEach(function (child) {
        aggregate(child);
        child.records.forEach(function (record) { set.set(record.id, record); });
      });
    }
    item.records = Array.from(set.values());
    item.total = item.records.length;
    item.buckets = [0, 0, 0, 0, 0];
    item.records.forEach(function (record) { item.buckets[record.bucket] += 1; });
  }

  source.rows.forEach(function (indices, index) {
    var rowNumber = index + 2;
    var row = indices.map(function (value) { return value < 0 ? null : source.strings[value].trim(); });
    var productBlock = row[0], productDivision = row[1];
    var sourceProductId = row[2], sourceUid = row[3], productName = row[4];
    var rootKey = productBlock;
    var divisionKey = JSON.stringify([productBlock, productDivision]);
    var validUid = guidPattern.test(sourceUid || '');
    var validId = /^\d+$/.test(sourceProductId || '');
    var productKey = validUid ? 'uid:' + sourceUid.toLowerCase()
      : validId ? 'id:' + sourceProductId
      : 'unassigned:' + JSON.stringify([productBlock, productDivision, sourceProductId]);

    var root = rootMap.get(rootKey);
    if (!root) {
      root = makeNode('block', rootKey, productBlock);
      rootMap.set(rootKey, root);
      roots.push(root);
    }
    var division = divisionMap.get(divisionKey);
    if (!division) {
      division = makeNode('division', divisionKey, productDivision);
      divisionMap.set(divisionKey, division);
      root.children.push(division);
    }
    var entry = productMap.get(productKey);
    if (!entry) {
      var product = makeNode('product', productKey, productName);
      product.isPlaceholder = !validUid && !validId;
      product.productIds = [];
      product.productUids = [];
      product.sourceRows = [];
      product.nameAliases = [];
      product.clientPaths = [];
      entry = { node: product, names: [], pathMap: new Map(), recordCodes: new Set() };
      productMap.set(productKey, entry);
      division.children.push(product);
    }
    entry.names.push(productName);
    entry.node.productIds.push(sourceProductId);
    if (sourceUid) entry.node.productUids.push(sourceUid);
    entry.node.sourceRows.push(rowNumber);
    entry.node.owners.push(row[5]);
    paths.add(row[6]);
    if (!entry.pathMap.has(row[6])) entry.pathMap.set(row[6], { name: row[6], owner: row[5] });

    var code = String(row[10] || '').replace(/\s+/g, '').toUpperCase();
    if (!/^П\d+$/.test(code)) {
      sourceIssues.push({
        row: rowNumber, type: 'invalid-process-code', productId: entry.node.id,
        code: row[10], title: row[11], owner: row[9],
        processBlock: row[7], processDivision: row[8],
        reason: 'Вместо кода процесса указано «' + row[10] + '». Строка сохранена в источнике и исключена из счётчика процессов.'
      });
      return;
    }
    var processEntry = processMap.get(code);
    if (!processEntry) {
      var simulated = efficiency(code, row[7]);
      var record = {
        id: 'structure-p' + code.slice(1),
        number: Number(code.slice(1)), code: code, entity: 'processes',
        title: row[11], titleAliases: [], owner: row[9],
        block: row[7], division: row[8], process: row[11],
        efficiency: simulated.value, sourceEfficiency: null,
        efficiencySimulated: true, bucket: simulated.bucket,
        delta: 0, status: 'Не указан',
        date: '', sourceDate: source.date,
        type: '', tags: [], count: 0, products: [], productLinks: [],
        source: 'xlsx', sourceRows: []
      };
      processEntry = { record: record, titles: [], productEntries: new Set() };
      processMap.set(code, processEntry);
      records.push(record);
    }
    processEntry.titles.push(row[11]);
    processEntry.record.sourceRows.push(rowNumber);
    processEntry.productEntries.add(entry);
    if (!entry.recordCodes.has(code)) {
      entry.recordCodes.add(code);
      entry.node.records.push(processEntry.record);
    }
    rawRelations.add(JSON.stringify([productKey, row[6], code]));
  });

  productMap.forEach(function (entry) {
    var product = entry.node;
    product.name = mode(entry.names);
    product.nameAliases = unique(entry.names);
    product.productIds = unique(product.productIds);
    product.productUids = unique(product.productUids);
    product.owners = unique(product.owners);
    product.owner = product.owners.length === 1 ? product.owners[0] : product.owners.length + ' владельцев КП';
    product.ownerRole = 'Владельцы КП';
    product.clientPaths = Array.from(entry.pathMap.values());
    if (product.nameAliases.length > 1) {
      sourceIssues.push({ type: 'product-title-aliases', productId: product.id, productIds: product.productIds, values: product.nameAliases, selected: product.name, rows: product.sourceRows });
    }
    if (product.productIds.length > 1 && !product.isPlaceholder) {
      sourceIssues.push({ type: 'shared-product-uid', productId: product.id, productIds: product.productIds, uid: product.productUids[0], rows: product.sourceRows });
    }
  });

  processMap.forEach(function (entry) {
    var record = entry.record;
    record.title = mode(entry.titles);
    record.process = record.title;
    record.titleAliases = unique(entry.titles);
    entry.productEntries.forEach(function (productEntry) {
      var product = productEntry.node;
      record.products.push(product.name);
      record.productLinks.push({ id: product.id, name: product.name, productIds: product.productIds, isPlaceholder: product.isPlaceholder });
    });
    record.products = unique(record.products);
    if (record.titleAliases.length > 1) {
      sourceIssues.push({ type: 'process-title-aliases', code: record.code, values: record.titleAliases, selected: record.title, rows: record.sourceRows });
    }
  });

  roots.forEach(aggregate);
  var maxima = colors.map(function (_, bucket) {
    return Math.max.apply(null, roots.map(function (root) { return root.buckets[bucket]; }));
  });
  var products = nodes.filter(function (item) { return item.kind === 'product'; });
  window.BPM_STRUCTURE = {
    roots: roots, nodes: nodes, records: records, colors: colors, maxima: maxima,
    total: records.length, pathCount: paths.size,
    relationCount: products.reduce(function (sum, product) { return sum + product.total; }, 0),
    pathRelationCount: rawRelations.size,
    productCount: products.filter(function (product) { return !product.isPlaceholder; }).length,
    productNodeCount: products.length,
    placeholderCount: products.filter(function (product) { return product.isPlaceholder; }).length,
    sourceFile: source.file, sourceSheet: source.sheet, sourceDate: source.date,
    sourceRowCount: source.rows.length, sourceIssues: sourceIssues,
    provenance: {
      rawRows: source.rows.length,
      usableRecords: records.length,
      invalidRows: sourceIssues.filter(function (issue) { return issue.type === 'invalid-process-code'; }).length,
      uniqueProductRelations: products.reduce(function (sum, product) { return sum + product.total; }, 0),
      productCount: products.filter(function (product) { return !product.isPlaceholder; }).length,
      productNodeCount: products.length,
      placeholderCount: products.filter(function (product) { return product.isPlaceholder; }).length,
      emptyEfficiencyRows: source.rows.filter(function (row) { return row[12] < 0; }).length
    },
    sources: [{ title: source.file, sheet: source.sheet, range: 'A1:M2278', url: null,
      note: 'Названия, владельцы КП и процессов, связи — из исходной таблицы. Эффективность и ФИО руководителей блоков и ССП — демонстрационные: эти сведения отсутствуют в источнике.' }]
  };

  // A separate projection keeps every process object and its aggregates intact.
  // Product IDs identify products only: the workbook contains no client-path IDs.
  var pathRecords = [], pathNodes = [], pathMap = new Map(), pathNodeMap = new Map();
  var productBySourceRow = new Map(), pathProcessRelations = new Set();
  nodes.forEach(function (node) {
    var clone = {};
    Object.keys(node).forEach(function (key) {
      clone[key] = Array.isArray(node[key]) ? node[key].slice() : node[key];
    });
    clone.records = [];
    clone.children = [];
    clone.buckets = [0, 0, 0, 0, 0];
    clone.total = 0;
    if (clone.kind === 'product') {
      clone.clientPaths = [];
      node.sourceRows.forEach(function (rowNumber) { productBySourceRow.set(rowNumber, clone); });
    }
    pathNodes.push(clone);
    pathNodeMap.set(node.id, clone);
  });
  nodes.forEach(function (node) {
    pathNodeMap.get(node.id).children = node.children.map(function (child) { return pathNodeMap.get(child.id); });
  });
  var pathRoots = roots.map(function (root) { return pathNodeMap.get(root.id); });

  source.rows.forEach(function (indices, index) {
    var rowNumber = index + 2;
    var row = indices.map(function (value) { return value < 0 ? null : source.strings[value].trim(); });
    var name = row[6];
    if (!name) return;
    var product = productBySourceRow.get(rowNumber);
    var entry = pathMap.get(name);
    if (!entry) {
      var simulated = efficiency('client-path:' + name, 'client-path:' + name);
      var record = {
        id: stableId('kp', name), number: null, code: '', entity: 'paths',
        numberSimulated: true, sourceNumber: null,
        title: name, name: name, titleAliases: [name], sourceNameAliases: [],
        owner: row[5], owners: [], block: row[0], division: row[1],
        blocks: [], divisions: [], process: '',
        efficiency: simulated.value, sourceEfficiency: null,
        efficiencySimulated: true, bucket: simulated.bucket,
        delta: 0, status: 'Не указан', date: '', sourceDate: source.date,
        type: '', tags: [], count: 0, processCount: 0,
        products: [], productLinks: [], linkedProcesses: [], linkedProcessIds: [], linkedProcessCodes: [],
        source: 'xlsx', sourceRows: [], sourceLinks: [],
        provenance: {
          sourceFile: source.file, sourceSheet: source.sheet,
          nameColumn: 'G', ownerColumn: 'F', processCodeColumn: 'K',
          identity: 'trimmed-exact-name', number: 'demonstration'
        }
      };
      entry = { record: record, products: new Map(), processes: new Map() };
      pathMap.set(name, entry);
      pathRecords.push(record);
    }
    var pathRecord = entry.record;
    pathRecord.sourceRows.push(rowNumber);
    pathRecord.sourceNameAliases.push(source.strings[indices[6]]);
    pathRecord.owners.push(row[5]);
    pathRecord.blocks.push(row[0]);
    pathRecord.divisions.push(row[1]);
    if (!entry.products.has(product.id)) {
      entry.products.set(product.id, product);
      product.records.push(pathRecord);
    }
    var code = String(row[10] || '').replace(/\s+/g, '').toUpperCase();
    var processEntry = /^П\d+$/.test(code) ? processMap.get(code) : null;
    if (processEntry) {
      entry.processes.set(processEntry.record.id, processEntry.record);
      pathProcessRelations.add(JSON.stringify([name, code]));
    }
    pathRecord.sourceLinks.push({
      row: rowNumber, productId: product.id, sourceProductId: row[2], sourceProductUid: row[3],
      productBlock: row[0], productDivision: row[1], productName: row[4], pathName: name, owner: row[5],
      processId: processEntry ? processEntry.record.id : null,
      processCode: row[10], processTitle: row[11], validProcessCode: Boolean(processEntry)
    });
  });

  // Demo display numbers depend on alphabetical path identity, not source row order.
  pathRecords.slice().sort(function (a, b) { return a.title.localeCompare(b.title, 'ru'); }).forEach(function (record, index) {
    record.number = index + 1;
    record.code = 'КП-ДЕМО-' + String(record.number).padStart(4, '0');
  });
  pathMap.forEach(function (entry) {
    var record = entry.record;
    record.sourceNameAliases = unique(record.sourceNameAliases);
    record.owners = unique(record.owners);
    record.blocks = unique(record.blocks);
    record.divisions = unique(record.divisions);
    record.owner = record.owners.length === 1 ? record.owners[0] : record.owners.length + ' владельцев КП';
    record.block = record.blocks.length === 1 ? record.blocks[0] : record.blocks.join(' · ');
    record.division = record.divisions.length === 1 ? record.divisions[0] : record.divisions.join(' · ');
    entry.products.forEach(function (product) {
      record.products.push(product.name);
      record.productLinks.push({ id: product.id, name: product.name, productIds: product.productIds.slice(), isPlaceholder: product.isPlaceholder });
    });
    record.products = unique(record.products);
    record.linkedProcesses = Array.from(entry.processes.values());
    record.linkedProcessIds = record.linkedProcesses.map(function (process) { return process.id; });
    record.linkedProcessCodes = record.linkedProcesses.map(function (process) { return process.code; });
    record.processCount = record.linkedProcesses.length;
    record.count = record.processCount;
  });
  pathRoots.forEach(aggregate);
  var pathProducts = pathNodes.filter(function (node) { return node.kind === 'product'; });
  pathProducts.forEach(function (product) { product.clientPaths = product.records.slice(); });
  var pathMaxima = colors.map(function (_, bucket) {
    return Math.max.apply(null, pathRoots.map(function (root) { return root.buckets[bucket]; }));
  });
  var pathProductRelations = pathProducts.reduce(function (sum, product) { return sum + product.total; }, 0);
  var invalidProcessRows = sourceIssues.filter(function (issue) { return issue.type === 'invalid-process-code'; }).length;
  window.BPM_STRUCTURE_PATHS = {
    roots: pathRoots, nodes: pathNodes, records: pathRecords,
    colors: colors.map(function (color) { return Object.assign({}, color); }), maxima: pathMaxima,
    total: pathRecords.length, pathCount: pathRecords.length,
    relationCount: pathProductRelations, pathRelationCount: rawRelations.size,
    processRelationCount: pathProcessRelations.size, processCount: records.length,
    productCount: window.BPM_STRUCTURE.productCount, productNodeCount: pathProducts.length,
    placeholderCount: window.BPM_STRUCTURE.placeholderCount,
    sourceFile: source.file, sourceSheet: source.sheet, sourceDate: source.date,
    sourceRowCount: source.rows.length,
    sourceIssues: sourceIssues.filter(function (issue) { return issue.type === 'invalid-process-code'; }).map(function (issue) {
      return Object.assign({}, issue, { excludedFromPathCount: false });
    }),
    provenance: {
      rawRows: source.rows.length, usableRecords: pathRecords.length,
      invalidRows: 0, invalidProcessRows: invalidProcessRows,
      uniqueProductRelations: pathProductRelations, uniqueProcessRelations: pathProcessRelations.size,
      productCount: window.BPM_STRUCTURE.productCount, productNodeCount: pathProducts.length,
      placeholderCount: window.BPM_STRUCTURE.placeholderCount,
      identity: 'trimmed-exact-name', sourceNumberAvailable: false, numbersSimulated: true,
      sourceEfficiencyAvailable: false
    },
    sources: [{ title: source.file, sheet: source.sheet, range: 'A1:M2278', url: null,
      note: 'Названия КП (G), владельцы КП (F), продуктовая иерархия (A–E) и связи процессов (H–L) — из исходной таблицы. ID КП отсутствуют: номера КП-ДЕМО — демонстрационные, ID продуктов не используются как ID КП. Эффективность и руководители блоков/ССП — демонстрационные. Строки без корректного кода процесса сохраняются в КП.' }]
  };
}());

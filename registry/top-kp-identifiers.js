/* Synthetic business IDs for the ТОП-КП prototype, not IDs from Excel.
 * Load after top-kp-data.js. Preassigning in stable identity order makes
 * collision resolution independent of rendering, filtering or record order.
 * Explicit source codes always win and are reserved before demo allocation.
 */
(() => {
  'use strict';

  const first = 1000, capacity = 9000;
  const source = window.BPM_TOP_KP?.records || [];
  const codes = new Map(), byCell = new Map(), used = new Set();
  const text = value => value == null ? '' : String(value).trim();
  const explicit = record => text(record?.code);
  const identity = record => text(record?.id) ? `id:${text(record.id)}` :
    text(record?.sourceCell) ? `cell:${text(record.sourceCell)}` : '';

  function hash(value) {
    let result = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 0x01000193);
    }
    result ^= result >>> 16;
    result = Math.imul(result, 0x7feb352d);
    result ^= result >>> 15;
    result = Math.imul(result, 0x846ca68b);
    return (result ^ (result >>> 16)) >>> 0;
  }

  const ordered = source.filter(record => record && identity(record)).slice().sort((a, b) => {
    const left = identity(a), right = identity(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  for (const record of ordered) if (explicit(record)) used.add(explicit(record));
  for (const record of ordered) {
    const key = identity(record);
    let code = explicit(record) || codes.get(key);
    if (!code) {
      const start = hash(`top-kp-identifiers:v1:${key}`) % capacity;
      for (let offset = 0; offset < capacity; offset++) {
        const candidate = `КП${first + (start + offset) % capacity}`;
        if (!used.has(candidate)) {code = candidate; used.add(candidate); break;}
      }
    }
    // An exhausted demo range or a record without identity gets no invented ID.
    if (!code) continue;
    codes.set(key, code);
    if (text(record.sourceCell)) byCell.set(text(record.sourceCell), code);
  }

  function codeFor(record) {
    if (!record || typeof record !== 'object') return '';
    return explicit(record) || codes.get(identity(record)) || byCell.get(text(record.sourceCell)) || '';
  }

  window.BpmTopKpIdentifiers = Object.freeze({codeFor});
})();

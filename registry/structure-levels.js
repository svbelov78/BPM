/* Display-only projection of the filtered block → division → product tree.
 * Filtering must run first: search matches depend on the original product IDs.
 */
(() => {
  'use strict';

  const uniqueRecords = records => [...new Map(records.map(record => [record.id, record])).values()];

  /**
   * Return {roots, nodes, byId, records, total, maxDepth, flat} without changing
   * canonical nodes or records. `hidden` accepts a Set or an array of node kinds.
   * `compare` is applied to each complete sibling list after hidden parents are
   * removed. Retained nodes keep their IDs and filtered aggregate measurements.
   *
   * `depth` is a zero-based rendered group depth. `maxDepth` is the deepest group
   * in the complete projected forest and is copied to every node for alignment.
   * Empty results have maxDepth -1. If a nonempty source forest loses every group,
   * roots contains one synthetic kind:'flat' node at depth/maxDepth 0. Its stable
   * ID and accessible name allow ordinary table sorting, pagination and regions;
   * it is a table container, not an accordion or a related-record table.
   */
  function project(canonicalTree, {hidden = [], compare, flatId = 'structure-flat'} = {}) {
    const hiddenKinds = new Set(hidden);
    const records = uniqueRecords(canonicalTree.flatMap(node => node.records));
    const sort = nodes => typeof compare === 'function' ? nodes.sort(compare) : nodes;
    const visit = sourceNodes => sort(sourceNodes.flatMap(node => {
      const children = visit(node.children || []);
      if (hiddenKinds.has(node.kind)) return children;
      return [{...node, children, records: uniqueRecords(node.records || []),
        ...(Array.isArray(node.buckets) ? {buckets: [...node.buckets]} : {})}];
    }));
    const roots = visit(canonicalTree);
    const flat = canonicalTree.length > 0 && roots.length === 0;
    if (flat) {
      const buckets = [0, 0, 0, 0, 0];
      records.forEach(record => {
        if (Number.isInteger(record.bucket) && record.bucket >= 0 && record.bucket < buckets.length) buckets[record.bucket] += 1;
      });
      const assessed = records.filter(record => Number.isFinite(record.efficiency) && record.efficiency >= 0 && record.efficiency <= 100);
      roots.push({id: flatId, kind: 'flat', synthetic: true, name: 'Все записи', ariaLabel: 'Все записи',
        children: [], records: [...records], total: records.length, buckets,
        averageEfficiency: assessed.length ? assessed.reduce((sum, record) => sum + record.efficiency, 0) / assessed.length : null});
    }
    const nodes = [], byId = new Map();
    let maxDepth = -1;
    const index = (siblings, depth) => siblings.forEach(node => {
      node.depth = depth;
      maxDepth = Math.max(maxDepth, depth);
      nodes.push(node);
      byId.set(node.id, node);
      index(node.children, depth + 1);
    });
    index(roots, 0);
    nodes.forEach(node => {node.maxDepth = maxDepth;});
    return {roots, nodes, byId, records, total: records.length, maxDepth, flat};
  }

  window.BPMStructureLevels = Object.freeze({project});
})();

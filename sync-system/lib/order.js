'use strict';

/**
 * Foreign-key aware table ordering.
 *
 * Changes must be applied parents-first (tables with fewer FK dependencies
 * before the tables that reference them) to minimise FK violations. This
 * module reads the FK graph from information_schema and produces a stable
 * topological order, least-dependent first.
 */

/** Reads child -> parent foreign-key edges for the given schema. */
async function loadFkEdges(db, schema = 'public') {
  const rows = await db
    .select({ child: 'tc.table_name', parent: 'ccu.table_name' })
    .from({ tc: 'information_schema.table_constraints' })
    .join({ ccu: 'information_schema.constraint_column_usage' }, function () {
      this.on('ccu.constraint_name', 'tc.constraint_name').andOn(
        'ccu.table_schema',
        'tc.table_schema'
      );
    })
    .where('tc.constraint_type', 'FOREIGN KEY')
    .andWhere('tc.table_schema', schema);
  return rows.filter((r) => r.child !== r.parent); // ignore self references
}

/**
 * Kahn topological sort. `parents.get(t)` is the set of tables `t` depends on.
 * Returns least-dependent tables first; ties broken alphabetically for
 * determinism. Cycles are appended at the end in alphabetical order.
 */
function topoSort(tables, edges) {
  const set = new Set(tables);
  const parents = new Map(tables.map((t) => [t, new Set()]));
  const children = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of edges) {
    if (!set.has(child) || !set.has(parent)) continue;
    parents.get(child).add(parent);
    children.get(parent).add(child);
  }

  const result = [];
  const ready = tables.filter((t) => parents.get(t).size === 0).sort();
  const remaining = new Set(parents.keys());

  while (ready.length) {
    ready.sort();
    const t = ready.shift();
    result.push(t);
    remaining.delete(t);
    for (const c of children.get(t)) {
      parents.get(c).delete(t);
      if (parents.get(c).size === 0) ready.push(c);
    }
  }

  // Anything left is part of a cycle; append deterministically.
  if (remaining.size) result.push(...[...remaining].sort());
  return result;
}

/**
 * Validates a caller-provided order: it must contain exactly the tracked
 * tables and never place a child before its parent. Throws on violation.
 */
function validateOrder(order, tables, edges) {
  const provided = new Set(order);
  for (const t of tables) {
    if (!provided.has(t)) throw new Error(`sync: order list missing table "${t}"`);
  }
  for (const t of order) {
    if (!tables.includes(t)) throw new Error(`sync: order list has unknown table "${t}"`);
  }
  const pos = new Map(order.map((t, i) => [t, i]));
  for (const { child, parent } of edges) {
    if (pos.has(child) && pos.has(parent) && pos.get(parent) > pos.get(child)) {
      throw new Error(
        `sync: invalid order, parent "${parent}" must come before child "${child}"`
      );
    }
  }
  return order;
}

/**
 * Computes the apply order for the tracked tables. If `manualOrder` is given it
 * is validated against the FK graph and returned, otherwise an FK topo-sort is
 * used. Returns { order, rank } where rank maps table -> position index.
 */
async function tableOrder(db, tables, { schema = 'public', manualOrder } = {}) {
  const edges = await loadFkEdges(db, schema);
  const order = manualOrder
    ? validateOrder(manualOrder, tables, edges)
    : topoSort(tables, edges);
  const rank = new Map(order.map((t, i) => [t, i]));
  return { order, rank };
}

/** Stable sort of changes by FK rank then sno (the per-write sequence). */
function sortChanges(changes, rank) {
  return [...changes].sort((a, b) => {
    const ra = rank.has(a.table) ? rank.get(a.table) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.table) ? rank.get(b.table) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return Number(a.sno) - Number(b.sno);
  });
}

module.exports = { tableOrder, sortChanges, topoSort, validateOrder, loadFkEdges };

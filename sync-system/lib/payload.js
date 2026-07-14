'use strict';

/**
 * Payload shaping for schema-evolution tolerance:
 * - optional per-table column renames
 * - strip keys that are not live columns (dropped columns in old changelog JSON)
 */

/** @type {Map<string, Set<string>>} */
const columnCache = new Map();

function cacheKey(schema, table) {
  return `${schema}.${table}`;
}

function clearColumnCache(schema, table) {
  if (schema && table) columnCache.delete(cacheKey(schema, table));
  else columnCache.clear();
}

/**
 * Load column names for a table (cached per process).
 * @param {import('knex').Knex | import('knex').Knex.Transaction} db
 */
async function getTableColumns(db, schema, table) {
  const key = cacheKey(schema, table);
  const hit = columnCache.get(key);
  if (hit) return hit;

  const rows = await db('information_schema.columns')
    .where({ table_schema: schema, table_name: table })
    .select('column_name');

  const cols = new Set(rows.map((r) => r.column_name));
  columnCache.set(key, cols);
  return cols;
}

/** Apply renames then drop keys that are not in `columns`. */
function normalizePayload(payload, columns, renames = {}) {
  if (!payload || typeof payload !== 'object') return {};

  let src = payload;
  if (typeof payload === 'string') {
    try {
      src = JSON.parse(payload);
    } catch {
      return {};
    }
  }

  const interim = {};
  for (const [key, value] of Object.entries(src)) {
    const mapped = renames[key] || key;
    // If both old and new keys are present, keep the new key's value.
    if (renames[key] && Object.prototype.hasOwnProperty.call(src, mapped)) continue;
    interim[mapped] = value;
  }

  const out = {};
  for (const [key, value] of Object.entries(interim)) {
    if (columns.has(key)) out[key] = value;
  }
  return out;
}

/**
 * Postgres / knex errors that are unlikely to fix themselves by waiting for
 * a missing parent row — treat as dead-letter instead of blocking the cursor.
 */
function isSchemaError(err) {
  if (!err) return false;
  const code = err.code || err.nativeError?.code;
  // 42703 undefined_column, 42P01 undefined_table, 22P02 invalid_text_representation,
  // 23502 not_null_violation (after strip / missing required fields), 42804 datatype mismatch
  const schemaCodes = new Set(['42703', '42P01', '22P02', '23502', '42804', '22007', '22008']);
  if (code && schemaCodes.has(String(code))) return true;

  const msg = String(err.message || err);
  return /column .* does not exist|undefined column|invalid input syntax|violates not-null|datatype mismatch|cannot cast/i.test(
    msg
  );
}

module.exports = {
  columnCache,
  clearColumnCache,
  getTableColumns,
  normalizePayload,
  isSchemaError,
};

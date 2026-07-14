'use strict';

const { compareHlc } = require('./clock');
const { sortChanges } = require('./order');
const { getTableColumns, normalizePayload, isSchemaError } = require('./payload');

/**
 * Last-Write-Wins decision and row application helpers.
 *
 * Winner is the higher hlc; ties are broken by the greater origin_client_id so
 * every node reaches the same deterministic result.
 */

/** Returns 'incoming' or 'existing'. A missing existing row always loses. */
function decide(incoming, existing) {
  if (!existing) return 'incoming';
  const c = compareHlc(incoming.hlc, existing.hlc);
  if (c > 0) return 'incoming';
  if (c < 0) return 'existing';
  const oi = String(incoming.origin_client_id || '');
  const oe = String(existing.origin_client_id || '');
  return oi >= oe ? 'incoming' : 'existing';
}

/** Logs a losing incoming write to sync_conflict (authority only). */
async function logConflict(trx, { table, entityId, message, error, winner, loserPayload }) {
  await trx('sync_conflict').insert({
    table,
    entity_id: entityId,
    message,
    error: error ? JSON.stringify(error) : null,
    winner, // 'remote' = existing kept, 'incoming' = pushed value kept
    loser_payload: loserPayload ? JSON.stringify(loserPayload) : null,
  });
}

async function logDeadLetter(trx, change, err) {
  const has = await trx.schema.hasTable('sync_dead_letter');
  if (!has) return;
  await trx('sync_dead_letter').insert({
    change_id: change.id || null,
    sno: change.sno != null ? Number(change.sno) : null,
    table: change.table,
    entity_id: change.entity_id || null,
    event: change.event || null,
    payload: change.payload != null ? JSON.stringify(change.payload) : null,
    message: 'Schema/apply error — skipped so sync can advance',
    error: JSON.stringify({
      message: err?.message || String(err),
      code: err?.code || null,
    }),
  });
}

/**
 * Applies a single change to its table. Must run inside a transaction that has
 * already set `sync.replicating = 'on'` so the capture trigger stays quiet.
 *
 * Payloads are reshape-tolerant: optional renames, then unknown columns stripped
 * so old changelog JSON survives DROP COLUMN migrations.
 */
async function applyRow(trx, change, opts = {}) {
  const {
    idColumn = 'id',
    schema = 'public',
    columnRenames = {},
  } = opts;

  const { table, event, entity_id: entityId, payload } = change;
  if (event === 'delete') {
    await trx(table).where(idColumn, entityId).del();
    return;
  }

  const columns = await getTableColumns(trx, schema, table);
  const renames = columnRenames[table] || {};
  const shaped = normalizePayload(payload, columns, renames);

  if (!Object.prototype.hasOwnProperty.call(shaped, idColumn) && entityId != null) {
    shaped[idColumn] = entityId;
  }

  await trx(table).insert(shaped).onConflict(idColumn).merge();
}

/**
 * Applies a batch of changes in FK order with per-row savepoints so a single
 * FK violation (e.g. a parent that has not arrived yet) does not abort the
 * whole batch. Returns applied snos, retryable failures, and schema dead-letters
 * (counted as applied for cursor progress so one poison payload cannot stall pull).
 *
 * When `lww` is true, an incoming row that loses to the local row is skipped
 * (used on the client during pull so unpushed local edits are not clobbered).
 */
async function applyBatch(trx, changes, rank, opts = {}) {
  const { idColumn = 'id', lww = false, schema = 'public', columnRenames = {} } = opts;
  const applyOpts = { idColumn, schema, columnRenames };

  let pending = sortChanges(changes, rank);
  const appliedSnos = new Set();
  const deadLettered = [];

  let progress = true;
  while (pending.length && progress) {
    progress = false;
    const stillFailing = [];
    for (const change of pending) {
      try {
        await trx.transaction(async (sp) => {
          if (lww) {
            const existing = await sp(change.table).where(idColumn, change.entity_id).first();
            if (existing && decide(change, existing) === 'existing') return; // keep local
          }
          await applyRow(sp, change, applyOpts);
        });
        appliedSnos.add(Number(change.sno));
        progress = true;
      } catch (err) {
        change.__error = err;
        stillFailing.push(change);
      }
    }
    pending = stillFailing;
  }

  const failed = [];
  for (const change of pending) {
    if (isSchemaError(change.__error)) {
      try {
        await logDeadLetter(trx, change, change.__error);
      } catch {
        // Logging must not block advancement.
      }
      deadLettered.push(change);
      if (change.sno != null) appliedSnos.add(Number(change.sno));
    } else {
      failed.push(change);
    }
  }

  return { appliedSnos, failed, deadLettered };
}

module.exports = {
  decide,
  logConflict,
  logDeadLetter,
  applyRow,
  applyBatch,
  isSchemaError,
};

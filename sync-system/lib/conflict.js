'use strict';

const { compareHlc } = require('./clock');
const { sortChanges } = require('./order');

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

/**
 * Applies a single change to its table. Must run inside a transaction that has
 * already set `sync.replicating = 'on'` so the capture trigger stays quiet.
 */
async function applyRow(trx, change, { idColumn = 'id' } = {}) {
  const { table, event, entity_id: entityId, payload } = change;
  if (event === 'delete') {
    await trx(table).where(idColumn, entityId).del();
    return;
  }
  await trx(table).insert(payload).onConflict(idColumn).merge();
}

/**
 * Applies a batch of changes in FK order with per-row savepoints so a single
 * FK violation (e.g. a parent that has not arrived yet) does not abort the
 * whole batch. Returns the set of applied snos and the changes still failing
 * after retries (to be retried on a later cycle).
 *
 * When `lww` is true, an incoming row that loses to the local row is skipped
 * (used on the client during pull so unpushed local edits are not clobbered).
 */
async function applyBatch(trx, changes, rank, { idColumn = 'id', lww = false } = {}) {
  let pending = sortChanges(changes, rank);
  const appliedSnos = new Set();

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
          await applyRow(sp, change, { idColumn });
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

  return { appliedSnos, failed: pending };
}

module.exports = { decide, logConflict, applyRow, applyBatch };

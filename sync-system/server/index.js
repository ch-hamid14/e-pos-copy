'use strict';

const { randomUUID } = require('crypto');
const schema = require('../lib/schema');
const { tableOrder, sortChanges } = require('../lib/order');
const { decide, logConflict, applyRow } = require('../lib/conflict');

/**
 * Authority role (remote app).
 *
 * This is NOT a server process: it exposes three pure async handlers that the
 * host application mounts into its own transport (Express, Fastify, RPC, ...).
 * The authority owns the canonical Postgres, is the single Last-Write-Wins
 * authority, logs losing writes to sync_conflict, and maintains the canonical
 * sync_queue change log that other clients pull from.
 */
function createAuthority({ db, config = {} } = {}) {
  if (!db) throw new Error('createAuthority: knex instance "db" is required');
  const schemaName = config.schema || 'public';
  const idColumn = config.idColumn || 'id';
  const defaultLimit = config.pullLimit || 500;

  let ready = null;
  let rank = new Map();

  async function setup() {
    const res = await schema.setup(db, {
      role: 'authority',
      schema: schemaName,
      tables: config.tables,
      nodeId: config.nodeId,
    });
    ({ rank } = await tableOrder(db, res.tables, {
      schema: schemaName,
      manualOrder: config.order,
    }));
    return res;
  }

  function ensureReady() {
    if (!ready) ready = setup();
    return ready;
  }

  /**
   * One-time bootstrap: enqueue the authority's pre-integration rows into
   * sync_queue (tagged with the server node id) so every client pulls them as
   * normal deltas. Idempotent. Call once after setup when integrating onto a
   * database that already holds data.
   */
  async function bootstrap() {
    await ensureReady();
    return schema.backfill(db, { schema: schemaName, tables: config.tables });
  }

  /** Identify a client and align clocks. */
  async function handleHandshake({ clientId } = {}) {
    await ensureReady();
    const id = clientId || randomUUID();
    const [{ hlc }] = await db.raw('SELECT sync_hlc() AS hlc').then((r) => r.rows);
    return { clientId: id, serverHlc: hlc };
  }

  /**
   * Apply a pushed batch with LWW. Idempotent per change id (sync_applied).
   * Returns { acked, conflicts }, where each conflict carries the winning
   * `current` row so the losing client converges immediately.
   */
  async function handlePush({ clientId, changes } = {}) {
    await ensureReady();
    if (!clientId) throw new Error('handlePush: clientId is required');
    if (!Array.isArray(changes)) throw new Error('handlePush: changes must be an array');

    const ordered = sortChanges(changes, rank);
    const acked = [];
    const conflicts = [];
    let maxHlc = null;

    await db.transaction(async (trx) => {
      await trx.raw("SET LOCAL sync.replicating = 'on'");

      for (const change of ordered) {
        const already = await trx('sync_applied').where('change_id', change.id).first();
        if (already) {
          acked.push(change.id);
          continue;
        }

        const incoming = { hlc: change.hlc, origin_client_id: clientId };
        if (!maxHlc || change.hlc > maxHlc) maxHlc = change.hlc;

        const existing = await trx(change.table).where(idColumn, change.entity_id).first();
        const winner = decide(incoming, existing);

        if (winner === 'incoming') {
          await applyRow(trx, change, { idColumn });
          // Canonical log entry other clients pull. Same id => idempotent.
          await trx('sync_queue')
            .insert({
              id: change.id,
              table: change.table,
              event: change.event,
              entity_id: change.entity_id,
              payload: JSON.stringify(change.payload),
              hlc: change.hlc,
              origin_client_id: clientId,
            })
            .onConflict('id')
            .ignore();
        } else {
          await logConflict(trx, {
            table: change.table,
            entityId: change.entity_id,
            message: `LWW: kept existing row (incoming hlc ${change.hlc} lost)`,
            error: null,
            winner: 'remote',
            loserPayload: change.payload,
          });
          conflicts.push({
            id: change.id,
            table: change.table,
            entity_id: change.entity_id,
            winner: 'existing',
            current: existing,
          });
        }

        await trx('sync_applied').insert({ change_id: change.id }).onConflict('change_id').ignore();
        acked.push(change.id);
      }

      if (maxHlc) await trx.raw('SELECT sync_hlc_update(?)', [maxHlc]);
    });

    return { acked, conflicts };
  }

  /**
   * Return changes a client has not seen yet: sno > since and not originated by
   * the requesting client, ordered by sno (the hub's global serialization).
   */
  async function handlePull({ clientId, since = 0, limit } = {}) {
    await ensureReady();
    if (!clientId) throw new Error('handlePull: clientId is required');
    const lim = Math.min(limit || defaultLimit, defaultLimit);

    const rows = await db('sync_queue')
      .where('sno', '>', since)
      .andWhere('origin_client_id', '!=', clientId)
      .orderBy('sno', 'asc')
      .limit(lim);

    const changes = rows.map((r) => ({
      id: r.id,
      sno: Number(r.sno),
      table: r.table,
      event: r.event,
      entity_id: r.entity_id,
      payload: r.payload,
      hlc: r.hlc,
      origin_client_id: r.origin_client_id,
    }));
    const nextSince = changes.length ? changes[changes.length - 1].sno : since;

    // const tableCounts = changes.reduce((acc, c) => {
    //   acc[c.table] = (acc[c.table] || 0) + 1;
    //   return acc;
    // }, {});

    // console.log('[sync:authority:pull]', {
    //   clientId,
    //   since,
    //   limit: lim,
    //   returned: changes.length,
    //   nextSince,
    //   tables: tableCounts,
    //   salesPurchases: {
    //     sales: tableCounts.sales || 0,
    //     sale_lines: tableCounts.sale_lines || 0,
    //     purchases: tableCounts.purchases || 0,
    //   },
    // });

    return { changes, nextSince };
  }

  return { setup, bootstrap, handleHandshake, handlePush, handlePull };
}

module.exports = { createAuthority };

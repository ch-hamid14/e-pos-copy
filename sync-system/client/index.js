'use strict';

const schema = require('../lib/schema');
const { tableOrder, sortChanges } = require('../lib/order');
const { applyBatch } = require('../lib/conflict');
const { maxHlc } = require('../lib/clock');

/**
 * Client role (offline app).
 *
 * Owns the local Postgres, captures local writes into sync_queue (via triggers
 * installed at setup), and exchanges changes with the authority through an
 * injected `transport` ({ handshake, push, pull }). Holds resumable cursors in
 * sync_state. Never resolves conflicts itself; it just surfaces / applies what
 * the authority decides.
 */
function createClient({ db, transport, config = {} } = {}) {
  if (!db) throw new Error('createClient: knex instance "db" is required');
  if (!transport) throw new Error('createClient: a transport is required');
  const schemaName = config.schema || 'public';
  const idColumn = config.idColumn || 'id';
  const pullLimit = config.pullLimit || 500;
  const columnRenames = config.columnRenames || {};
  const applyOpts = { idColumn, lww: true, schema: schemaName, columnRenames };

  let ready = null;
  let rank = new Map();
  let clientId = null;

  async function setup() {
    const res = await schema.setup(db, {
      role: 'client',
      schema: schemaName,
      tables: config.tables,
      nodeId: config.nodeId,
    });
    clientId = res.nodeId;
    ({ rank } = await tableOrder(db, res.tables, {
      schema: schemaName,
      manualOrder: config.order,
    }));

    if (transport.handshake) {
      const hs = await transport.handshake({ clientId });
      if (hs && hs.serverHlc) await db.raw('SELECT sync_hlc_update(?)', [hs.serverHlc]);
    }
    return { ...res, clientId };
  }

  function ensureReady() {
    if (!ready) {
      ready = setup().catch((err) => {
        ready = null;
        throw err;
      });
    }
    return ready;
  }

  async function getState() {
    return db('sync_state').first();
  }

  /** Applies authority-provided rows locally, guarded so they are not re-queued. */
  async function applyIncoming(changeLikes) {
    if (!changeLikes.length) return { appliedSnos: new Set(), failed: [], deadLettered: [] };
    let result;
    await db.transaction(async (trx) => {
      await trx.raw("SET LOCAL sync.replicating = 'on'");
      result = await applyBatch(trx, changeLikes, rank, applyOpts);
      let top = null;
      for (const c of changeLikes) top = maxHlc(top, c.hlc);
      if (top) await trx.raw('SELECT sync_hlc_update(?)', [top]);
    });
    return result;
  }

  /** Push local queue past the cursor to the authority. */
  async function push() {
    await ensureReady();
    const state = await getState();
    const since = Number(state.last_pushed_sno) || 0;

    const rows = await db('sync_queue')
      .where('sno', '>', since)
      .orderBy('sno', 'asc')
      .limit(config.pushLimit || 1000);

    if (!rows.length) return { pushed: 0, conflicts: [] };

    // const tableCounts = rows.reduce((acc, r) => {
    //   acc[r.table] = (acc[r.table] || 0) + 1;
    //   return acc;
    // }, {});
    // console.log('[sync:push] sending', {
    //   clientId,
    //   since,
    //   count: rows.length,
    //   tables: tableCounts,
    //   salesPurchases: {
    //     sales: tableCounts.sales || 0,
    //     purchases: tableCounts.purchases || 0,
    //   },
    // });

    const changes = sortChanges(
      rows.map((r) => ({
        id: r.id,
        sno: Number(r.sno),
        table: r.table,
        event: r.event,
        entity_id: r.entity_id,
        payload: r.payload,
        hlc: r.hlc,
        origin_client_id: r.origin_client_id,
      })),
      rank
    );

    const maxSno = changes.reduce((m, c) => Math.max(m, c.sno), since);
    const result = (await transport.push({ clientId, changes })) || {};
    const conflicts = result.conflicts || [];

    // Converge immediately on any rows we lost.
    const losers = conflicts
      .filter((c) => c.current)
      .map((c) => ({
        table: c.table,
        event: 'update',
        entity_id: c.entity_id,
        payload: c.current,
        hlc: c.current.hlc,
        origin_client_id: c.current.origin_client_id,
        sno: 0,
      }));
    if (losers.length) await applyIncoming(losers);

    await db('sync_state')
      .update({ last_pushed_sno: maxSno, updated_at: db.fn.now() })
      .where('only_one', true);

    return { pushed: changes.length, conflicts };
  }

  /** Pull authority changes since the cursor and apply them locally. */
  async function pull() {
    await ensureReady();
    let applied = 0;
    // let batchNum = 0;

    for (;;) {
      // batchNum += 1;
      const state = await getState();
      const since = Number(state.last_pulled_sno) || 0;
      const { changes, nextSince } = await transport.pull({
        clientId,
        since,
        limit: pullLimit,
      });

      // const tableCounts = (changes || []).reduce((acc, c) => {
      //   acc[c.table] = (acc[c.table] || 0) + 1;
      //   return acc;
      // }, {});

      // console.log('[sync:pull] batch', {
      //   batchNum,
      //   clientId,
      //   since,
      //   received: changes?.length ?? 0,
      //   nextSince,
      //   tables: tableCounts,
      //   salesPurchases: {
      //     sales: tableCounts.sales || 0,
      //     sale_lines: tableCounts.sale_lines || 0,
      //     purchases: tableCounts.purchases || 0,
      //   },
      // });

      if (!changes || !changes.length) break;

      const result = await applyIncoming(changes);
      applied += result.appliedSnos.size;

      if (result.deadLettered?.length) {
        console.warn('[sync:pull] dead-lettered schema failures', {
          count: result.deadLettered.length,
          samples: result.deadLettered.slice(0, 5).map((c) => ({
            table: c.table,
            entity_id: c.entity_id,
            sno: c.sno,
            error: c.__error?.message || String(c.__error),
          })),
        });
      }

      // Advance only over the contiguous applied prefix; re-pull the rest later
      // (a failure usually means a parent row has not arrived yet).
      // Schema dead-letters are treated as applied so poison payloads cannot stall.
      let cursor;
      if (result.failed.length) {
        const minFailed = Math.min(...result.failed.map((c) => Number(c.sno)));
        cursor = minFailed - 1;
      } else {
        cursor = Number(nextSince);
      }

      // console.log('[sync:pull] batch result', {
      //   batchNum,
      //   appliedThisBatch: result.appliedSnos.size,
      //   failedThisBatch: result.failed.length,
      //   cursor,
      //   since,
      //   advanced: cursor > since,
      // });

      if (cursor <= since) break; // no forward progress; avoid spinning
      await db('sync_state')
        .update({ last_pulled_sno: cursor, updated_at: db.fn.now() })
        .where('only_one', true);

      if (changes.length < pullLimit && !result.failed.length) break;
    }

    // const finalState = await getState();
    // console.log('[sync:pull] done', {
    //   totalApplied: applied,
    //   last_pulled_sno: finalState?.last_pulled_sno,
    // });

    return { applied };
  }

  /**
   * One-time bootstrap: enqueue this client's pre-integration rows into the
   * local sync_queue (tagged with this client's id) so they are pushed up on
   * the next push. Idempotent. Use when the offline DB already holds data that
   * should be published to the authority.
   */
  async function bootstrap() {
    await ensureReady();
    return schema.backfill(db, { schema: schemaName, tables: config.tables });
  }

  /** Push then pull until drained. */
  async function sync() {
    const pushed = await push();
    const pulled = await pull();
    return { pushed, pulled };
  }

  return { setup, bootstrap, push, pull, sync, getState };
}

module.exports = { createClient };

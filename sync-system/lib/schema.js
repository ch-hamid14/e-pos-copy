'use strict';

const { randomUUID } = require('crypto');
const { CLOCK_DDL } = require('./clock');

/**
 * Schema setup shared by both roles.
 *
 * Creates the sync meta tables, the in-database HLC, the per-table metadata
 * columns (updated_at, deleted_at, hlc, origin_client_id), and the capture
 * triggers that enqueue local writes into sync_queue. Everything is idempotent
 * so setup() can run on every boot.
 */

const META_PREFIX = 'sync_';

// Default hlc stamped on rows that existed before integration (see
// addMetadataColumns). Used by backfill() to find never-captured rows.
const SENTINEL_HLC = '000000000000000-000000';

/** Lists the app (base) tables in a schema, excluding our own meta tables. */
async function listTrackedTables(db, schema = 'public') {
  const rows = await db
    .select('table_name')
    .from('information_schema.tables')
    .where({ table_schema: schema, table_type: 'BASE TABLE' })
    .andWhere('table_name', 'not like', `${META_PREFIX}%`);
  return rows.map((r) => r.table_name);
}

/** Resolves the set of tables to track from config or by auto-detection. */
async function resolveTables(db, { schema = 'public', tables } = {}) {
  if (Array.isArray(tables) && tables.length) return tables;
  return listTrackedTables(db, schema);
}

const QUEUE_DDL = `
CREATE TABLE IF NOT EXISTS sync_queue (
  id                uuid PRIMARY KEY,
  sno               bigserial,
  "table"           text NOT NULL,
  event             text NOT NULL CHECK (event IN ('insert','update','delete')),
  entity_id         uuid NOT NULL,
  payload           jsonb NOT NULL,
  hlc               text NOT NULL,
  origin_client_id  uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_queue_sno_idx ON sync_queue (sno);
CREATE INDEX IF NOT EXISTS sync_queue_origin_sno_idx ON sync_queue (origin_client_id, sno);
`;

const CONFIG_DDL = `
CREATE TABLE IF NOT EXISTS sync_config (
  only_one boolean PRIMARY KEY DEFAULT true CHECK (only_one),
  node_id  uuid NOT NULL,
  role     text NOT NULL
);

CREATE OR REPLACE FUNCTION sync_node_id() RETURNS uuid AS $$
  SELECT node_id FROM sync_config WHERE only_one LIMIT 1;
$$ LANGUAGE sql STABLE;
`;

const STATE_DDL = `
CREATE TABLE IF NOT EXISTS sync_state (
  only_one         boolean PRIMARY KEY DEFAULT true CHECK (only_one),
  client_id        uuid NOT NULL,
  last_pushed_sno  bigint NOT NULL DEFAULT 0,
  last_pulled_sno  bigint NOT NULL DEFAULT 0,
  server_url       text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
`;

const CONFLICT_DDL = `
CREATE TABLE IF NOT EXISTS sync_conflict (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sno           bigserial,
  "table"       text NOT NULL,
  entity_id     uuid NOT NULL,
  message       text,
  error         jsonb,
  winner        text NOT NULL CHECK (winner IN ('remote','incoming')),
  loser_payload jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_applied (
  change_id  uuid PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`;

/**
 * Capture trigger: stamps metadata on local writes and enqueues them.
 * When the session flag `sync.replicating = 'on'` is set (during apply of
 * remote changes) it does nothing, preventing pull -> re-capture -> re-push
 * echo loops and preserving the incoming row's metadata verbatim.
 */
const CAPTURE_FN_DDL = `
CREATE OR REPLACE FUNCTION sync_capture() RETURNS trigger AS $$
DECLARE
  repl text := current_setting('sync.replicating', true);
  nid  uuid;
BEGIN
  IF repl = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  nid := sync_node_id();

  IF TG_OP = 'DELETE' THEN
    INSERT INTO sync_queue (id, "table", event, entity_id, payload, hlc, origin_client_id)
      VALUES (gen_random_uuid(), TG_TABLE_NAME, 'delete', OLD.id, to_jsonb(OLD), OLD.hlc, nid);
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  NEW.hlc := sync_hlc();
  NEW.origin_client_id := nid;
  INSERT INTO sync_queue (id, "table", event, entity_id, payload, hlc, origin_client_id)
    VALUES (
      gen_random_uuid(),
      TG_TABLE_NAME,
      CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END,
      NEW.id,
      to_jsonb(NEW),
      NEW.hlc,
      nid
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

/** Adds the sync metadata columns to a tracked table (idempotent). */
async function addMetadataColumns(db, table) {
  await db.raw(
    `ALTER TABLE ??
       ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
       ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
       ADD COLUMN IF NOT EXISTS hlc text NOT NULL DEFAULT '${SENTINEL_HLC}',
       ADD COLUMN IF NOT EXISTS origin_client_id uuid`,
    [table]
  );
}

/** (Re)installs the BEFORE trigger on a tracked table. */
async function installTrigger(db, table) {
  await db.raw(`DROP TRIGGER IF EXISTS sync_capture_trg ON ??`, [table]);
  await db.raw(
    `CREATE TRIGGER sync_capture_trg
       BEFORE INSERT OR UPDATE OR DELETE ON ??
       FOR EACH ROW EXECUTE FUNCTION sync_capture()`,
    [table]
  );
}

/** Ensures sync_config holds a stable node id for this database. */
async function ensureNodeIdentity(db, role, nodeId) {
  const existing = await db('sync_config').first('node_id');
  if (existing) return existing.node_id;
  const id = nodeId || randomUUID();
  await db('sync_config').insert({ only_one: true, node_id: id, role }).onConflict('only_one').ignore();
  const row = await db('sync_config').first('node_id');
  return row.node_id;
}

/**
 * Full setup for a role ('client' | 'authority').
 * Returns { nodeId, tables } describing what is now tracked.
 */
async function setup(db, { role, schema = 'public', tables, nodeId } = {}) {
  await db.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await db.raw(CLOCK_DDL);
  await db.raw(QUEUE_DDL);
  await db.raw(CONFIG_DDL);
  if (role === 'client') await db.raw(STATE_DDL);
  if (role === 'authority') await db.raw(CONFLICT_DDL);
  await db.raw(CAPTURE_FN_DDL);

  const nid = await ensureNodeIdentity(db, role, nodeId);

  if (role === 'client') {
    await db('sync_state')
      .insert({ only_one: true, client_id: nid })
      .onConflict('only_one')
      .ignore();
  }

  const tracked = await resolveTables(db, { schema, tables });
  for (const table of tracked) {
    await addMetadataColumns(db, table);
    await installTrigger(db, table);
  }

  return { nodeId: nid, tables: tracked };
}

/**
 * One-time bootstrap of data that existed BEFORE integration.
 *
 * The sync engine is change-capture based: only writes that happen after the
 * triggers are installed enter sync_queue. Pre-existing rows are therefore
 * invisible to push/pull. This backfill issues a no-op UPDATE on those rows so
 * the existing sync_capture trigger stamps their hlc/origin and enqueues them
 * exactly as if the app had just written them. Distribution (FK ordering, LWW,
 * idempotency) is then handled by the normal flows.
 *
 * Idempotent: only rows still carrying the sentinel hlc are touched, and once
 * captured their hlc is real so a re-run is a no-op. Batched by ctid so large
 * tables do not run as a single giant transaction.
 *
 * Returns a map of table -> rows enqueued.
 */
async function backfill(db, { schema = 'public', tables, batchSize = 1000 } = {}) {
  const list = await resolveTables(db, { schema, tables });
  const result = {};
  for (const table of list) {
    let enqueued = 0;
    for (;;) {
      const res = await db.raw(
        `UPDATE ?? SET updated_at = updated_at
           WHERE ctid IN (SELECT ctid FROM ?? WHERE hlc = ? LIMIT ?)`,
        [table, table, SENTINEL_HLC, batchSize]
      );
      const n = res.rowCount || 0;
      enqueued += n;
      if (n < batchSize) break;
    }
    result[table] = enqueued;
  }
  return result;
}

module.exports = {
  setup,
  backfill,
  resolveTables,
  listTrackedTables,
  ensureNodeIdentity,
  addMetadataColumns,
  installTrigger,
  SENTINEL_HLC,
};

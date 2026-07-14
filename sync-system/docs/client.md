# Client Role (offline side)

`@madix/sync` syncs an offline Postgres database to a remote one with knex,
hub-and-spoke (many clients, one authority). It is a pluggable npm package: the
offline app imports the **client role**, the remote app imports the
[authority role](./server.md). The two communicate over a transport the host
app provides; the package itself is transport-agnostic.

## Rules

- Applications should **soft delete** their entries (set `deleted_at`). A delete
  then becomes an ordinary update, so delete-vs-update collapses into the same
  Last-Write-Wins path and no tombstone bookkeeping is needed.
- Synced tables should use **uuid primary keys** (`id`) so two offline clients
  can never collide on the same primary key.

## Setup

```js
const { createClient, fetchTransport } = require('@madix/sync');

const client = createClient({
  db: knex,
  transport: fetchTransport('https://remote.example.com/sync'),
  config: { /* see below */ },
});

await client.setup(); // idempotent
```

`config` options: `schema` (default `public`), `tables` (default: auto-detected,
excluding `sync_*`), `order` (optional manual FK order), `idColumn` (default
`id`), `pushLimit` (default `1000`), `pullLimit` (default `500`).

The transport is any object with `{ handshake, push, pull }`. `fetchTransport`
is a reference HTTP implementation; swap in your own for gRPC, queues, etc.

## Tables created locally

- `sync_queue` — local change log captured by triggers.
  `id (uuid)`, `sno (bigserial)`, `table`, `event` (insert|update|delete),
  `entity_id (uuid)`, `payload (jsonb)`, `hlc`, `origin_client_id`, `created_at`.
- `sync_state` — single-row resumable cursors: `client_id`, `last_pushed_sno`,
  `last_pulled_sno`, `server_url`, `updated_at`.
- `sync_config` — node identity; `sync_clock` + HLC functions.

Each tracked app table gains `updated_at`, `deleted_at`, `hlc`,
`origin_client_id` and a `BEFORE` capture trigger. The trigger stamps the HLC
and enqueues the write — unless the `sync.replicating` session flag is set,
which the client sets while applying remote changes to avoid echo loops.

## Schema evolution (migrations)

On apply, payloads are reshaped:

1. Optional `config.columnRenames[table] = { old_col: 'new_col' }`
2. Keys that are not live table columns are stripped (safe for DROP COLUMN)
3. Remaining schema/type failures are written to `sync_dead_letter` and skipped
   so pull cursors do not stall on poison changelog rows

FK / ordering failures still retry on the next cycle.

## Ordering

Tables are applied parents-first. The package reads the FK graph and topologically
sorts least-FK to most-FK to avoid conflicts. A manual order may be supplied and
is validated against the FK graph.

## Flows

```js
await client.push(); // send local queue past cursor to the authority
await client.pull(); // apply authority changes since cursor
await client.sync(); // push then pull until drained
```

- **Push**: reads `sync_queue` where `sno > last_pushed_sno`, FK-orders the
  batch, sends it via `transport.push`. The authority resolves LWW and returns
  any `conflicts`; for each lost row the client immediately applies the winning
  `current` value locally, then advances `last_pushed_sno`.
- **Pull**: calls `transport.pull` with `last_pulled_sno` and the client id
  (the authority excludes the client's own writes). Changes are applied in a
  guarded transaction with FK ordering and per-row savepoints; rows whose parent
  has not arrived yet are retried on a later cycle. The cursor only advances over
  the contiguous applied prefix.

## Bootstrap (pre-existing local data)

Only writes made after `setup()` are captured into `sync_queue`; rows that
existed before integration are not pushed until captured. If the offline DB
already holds data that should be published, call `bootstrap()` once:

```js
await client.setup();
await client.bootstrap(); // enqueue pre-existing local rows for the next push
await client.sync();
```

It performs an idempotent, batched no-op `UPDATE` on un-captured rows so the
capture trigger enqueues them (tagged with this client's id). For the common
case of an empty/new client, you do not bootstrap the client at all -- the
authority bootstraps its data and the client simply pulls it down.

## Conflict handling

Conflict resolution is **authority-only** (Last-Write-Wins by HLC, tie-broken by
`origin_client_id`). Losers are logged in `sync_conflict` on the authority and
surfaced to the client in the push response. On pull the client applies LWW
locally only to avoid clobbering its own not-yet-pushed edits; it never logs
conflicts itself.

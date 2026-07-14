# Authority Role (remote side)

The authority is the remote half of `@madix/sync`. It is **not** a standalone
server: it exposes plain async handler functions that the host application
mounts into its own transport (Express, Fastify, RPC, a queue, etc.). The
package never opens a port or bundles a web framework.

The authority owns the canonical Postgres database, is the **single
Last-Write-Wins authority**, logs losing writes to `sync_conflict`, and
maintains the canonical `sync_queue` change log that every client pulls from.

## Setup

```js
const { createAuthority } = require('@madix/sync');
const authority = createAuthority({ db: knex, config: { /* see below */ } });

await authority.setup(); // idempotent: meta tables, HLC, metadata columns, triggers
```

`config` options:

- `schema` (default `'public'`)
- `tables` (default: auto-detected base tables, excluding `sync_*`)
- `order` (optional manual FK order; validated against the FK graph)
- `idColumn` (default `'id'`, the uuid primary key)
- `pullLimit` (default `500`)
- `nodeId` (optional stable id for this node)

## Tables created

- `sync_queue` — canonical change log. `id` is the change uuid, `sno bigserial`
  gives the global pull ordering, `origin_client_id` tags the source client.
- `sync_conflict` — losing writes: `winner` (`remote` | `incoming`),
  `loser_payload`, `message`, `error`.
- `sync_applied` — dedupe set keyed by change `id` (push idempotency).
- `sync_config` — single-row node identity (`node_id`, `role`).
- `sync_clock` + `sync_hlc()` / `sync_hlc_update()` — in-database Hybrid Logical Clock.

- Each tracked app table gains `updated_at`, `deleted_at`, `hlc`,
  `origin_client_id`, plus a `BEFORE` capture trigger guarded by the
  `sync.replicating` session flag.
- `sync_dead_letter` — payloads that fail apply for schema/type reasons are
  parked here (client + authority) so sync cursors can advance.

## Schema evolution

Apply reshapes payloads with optional `config.columnRenames` then strips
unknown columns. Poison rows that still fail are dead-lettered instead of
blocking the fleet.

## Bootstrap (integrating onto a database with existing data)

Sync is change-capture based: only writes that happen after `setup()` enter
`sync_queue`. Rows that existed **before** integration are invisible to pull
until they are captured. Call `bootstrap()` once to seed them:

```js
await authority.setup();
await authority.bootstrap(); // enqueue pre-existing rows, tagged with the server node id
```

`bootstrap()` issues a no-op `UPDATE` on rows still carrying the sentinel
`hlc`, which fires the capture trigger and enqueues them like any normal write.
It is idempotent (captured rows have a real `hlc` and are skipped) and batched
by `ctid`. After this, clients pull the pre-existing data as ordinary deltas.

Only bootstrap the side that owns the baseline data. If both sides hold
pre-existing data, bootstrapping both will produce LWW conflicts on overlapping
ids; pick the source of truth instead.

## Handler contract

Mount these into your transport. All are plain async functions.

### `handleHandshake({ clientId? }) -> { clientId, serverHlc }`

Identifies a client (generates an id if none) and returns the current server
HLC so the client can align its clock.

### `handlePush({ clientId, changes }) -> { acked, conflicts }`

Applies a batch (FK-ordered internally) inside one transaction with
`sync.replicating = 'on'`:

- Skips any change already in `sync_applied` (idempotent re-delivery).
- Runs LWW (`decide`) against the existing row.
- Winner = incoming: upserts the row and writes the canonical `sync_queue`
  entry (same change `id`, so re-push is a no-op).
- Winner = existing: logs to `sync_conflict` and returns a conflict entry whose
  `current` field holds the winning row, so the losing client converges at once.

### `handlePull({ clientId, since, limit }) -> { changes, nextSince }`

Returns `sync_queue` rows where `sno > since` and `origin_client_id != clientId`
(a client never pulls back its own writes), ordered by `sno`. `nextSince` is the
cursor to pass next time.

## Example: mounting on Express

```js
app.post('/sync/handshake', async (req, res) => res.json(await authority.handleHandshake(req.body)));
app.post('/sync/push',      async (req, res) => res.json(await authority.handlePush(req.body)));
app.post('/sync/pull',      async (req, res) => res.json(await authority.handlePull(req.body)));
```

Authentication, TLS, and payload encryption are the host transport's
responsibility.

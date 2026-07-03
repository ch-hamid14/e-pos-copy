# Sync System Architecture

## Overview

e-pos uses a **local-first outbox + delta pull** model:

- **Push:** business events → `sync_queue` → ordered batch → `POST /api/sync/push`
- **Pull:** per-table delta → `GET /api/sync/delta/:table` in FK order → transactional merge
- **Initial sync:** `GET /api/sync/bootstrap-data/:table` blocks the app until `initial_sync_complete`


## Folder layout

| Layer | Path |
|-------|------|
| Shared core | `packages/src/sync/` — contracts, policies, delta merge, push handlers, table configs |
| Electron client | `electron/src/main/sync/` — engine, push, pull, bootstrap, Sync Center mapper |
| Backend API | `backend/src/sync/` — push, delta, bootstrap, health, conflicts |

## Sync loop (every 15s)

1. **Push** — drain `sync_queue` sorted by `TABLE_SYNC_CONFIGS` priority + `created_at`
2. **Delta pull** — for each table in config order, paginate delta and `mergeDeltaRows`
3. No periodic table scan; no `TABLE_ROW_UPSERT` from background jobs

## Cursors (`sync_metadata`)

| Key | Purpose |
|-----|---------|
| `delta_since:{table}` | Last successful delta watermark per table |
| `initial_sync_complete` | `true` after first bootstrap |
| `last_push_at` / `last_pull_at` | Observability |

Stale safety: if `since` is older than 15 days, force full table refresh.

## Conflict policies (per table)

| Policy | Tables | Behavior |
|--------|--------|----------|
| `append_only` | sales, payments, ledger, … | Idempotent insert/upsert |
| `server_wins` | colors, products, suppliers, … | Server row wins on pull |
| `versioned` | customers, expenses | Optimistic version on push |
| `state_machine` | product_items | `ALLOWED_TRANSITIONS` enforced |

Human attention: `sync_conflicts`, persistent push failures, `sync_pull_failures` → **Sync Center**.

## APIs

```
POST /api/sync/push
GET  /api/sync/delta/:table?since=&cursor=&limit=
GET  /api/sync/bootstrap-data/status
GET  /api/sync/bootstrap-data/:table
GET  /api/sync/health
GET  /api/sync/conflicts
```

## Local transaction rule

Every write path:

```
BEGIN
  business tables
  sync_queue.enqueue(...)
COMMIT
```

Composite handlers (`SALE_CREATED`, `PURCHASE_CREATED`) run in a single server transaction.

## Sync Center

| Source | UI |
|--------|-----|
| `sync_queue` conflict/failed | Push needs attention — retry |
| `sync_pull_failures` | Download issues — resync table |
| Per-table `delta_since` | Sync health table |

## Initial login

1. Auth bootstrap (company, branches, users, roles)
2. **Business initial sync** — all `TABLE_SYNC_CONFIGS` tables via bootstrap API
3. Background engine starts after `initial_sync_complete=true`

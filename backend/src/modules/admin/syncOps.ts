import type { Knex } from 'knex'
import { resetClonedCompanySync } from '@madix/database'
import { getCompanyDb } from '../../db'
import { bootstrapCompanySync } from '../sync/bootstrap'
import { clearSyncAuthority } from '../sync/authority'

function pageOpts(page?: number, pageSize?: number) {
  const p = Math.max(1, page || 1)
  const size = Math.min(100, Math.max(1, pageSize || 25))
  return { page: p, pageSize: size, offset: (p - 1) * size }
}

export async function listConflicts(
  companyId: string,
  opts: { page?: number; pageSize?: number } = {}
) {
  const db = await getCompanyDb(companyId, { forOps: true })
  if (!(await db.schema.hasTable('sync_conflict'))) {
    return { conflicts: [], total: 0, page: 1, pageSize: 25 }
  }

  const { page, pageSize, offset } = pageOpts(opts.page, opts.pageSize)
  const total = Number((await db('sync_conflict').count('* as count').first())?.count ?? 0)
  const rows = await db('sync_conflict')
    .select('id', 'sno', 'table', 'entity_id', 'message', 'winner', 'created_at')
    .orderBy('created_at', 'desc')
    .limit(pageSize)
    .offset(offset)

  return {
    page,
    pageSize,
    total,
    conflicts: rows.map((row) => ({
      id: row.id,
      sno: row.sno,
      table: row.table,
      entityId: row.entity_id,
      message: row.message,
      winner: row.winner,
      createdAt: row.created_at
    }))
  }
}

export async function getConflictDetail(companyId: string, conflictId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const row = await db('sync_conflict').where({ id: conflictId }).first()
  if (!row) throw new Error('Conflict not found')

  let current: Record<string, unknown> | null = null
  try {
    if (row.table && row.entity_id && (await db.schema.hasTable(row.table))) {
      current = (await db(row.table).where({ id: row.entity_id }).first()) || null
    }
  } catch {
    current = null
  }

  return {
    id: row.id,
    sno: row.sno,
    table: row.table,
    entityId: row.entity_id,
    message: row.message,
    error: parseJson(row.error),
    winner: row.winner,
    loserPayload: parseJson(row.loser_payload),
    current,
    createdAt: row.created_at
  }
}

export async function dismissConflict(companyId: string, conflictId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const deleted = await db('sync_conflict').where({ id: conflictId }).del()
  if (!deleted) throw new Error('Conflict not found')
  return { ok: true }
}

export async function dismissConflicts(companyId: string, conflictIds?: string[]) {
  const db = await getCompanyDb(companyId, { forOps: true })
  if (!(await db.schema.hasTable('sync_conflict'))) return { dismissed: 0 }

  let q = db('sync_conflict')
  if (conflictIds?.length) {
    q = q.whereIn('id', conflictIds)
  }
  const dismissed = await q.del()
  return { dismissed }
}

export async function applyConflictLoser(companyId: string, conflictId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const conflict = await db('sync_conflict').where({ id: conflictId }).first()
  if (!conflict) throw new Error('Conflict not found')

  const payload = parseJson(conflict.loser_payload) as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object') {
    throw new Error('Conflict has no loser payload to apply')
  }
  if (!(await db.schema.hasTable(conflict.table))) {
    throw new Error(`Table missing: ${conflict.table}`)
  }

  await db.transaction(async (trx) => {
    await trx.raw(`SELECT set_config('sync.replicating', 'on', true)`)
    await trx(conflict.table).insert(payload).onConflict('id').merge()
    await trx('sync_conflict').where({ id: conflictId }).del()
  })

  return { ok: true }
}

export async function applyConflictLosers(companyId: string, conflictIds: string[]) {
  if (!conflictIds.length) return { applied: 0, failed: [] as Array<{ id: string; error: string }> }

  const failed: Array<{ id: string; error: string }> = []
  let applied = 0
  for (const id of conflictIds) {
    try {
      await applyConflictLoser(companyId, id)
      applied++
    } catch (err) {
      failed.push({
        id,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }
  return { applied, failed }
}

export async function listSyncQueue(
  companyId: string,
  opts: { page?: number; pageSize?: number } = {}
) {
  const db = await getCompanyDb(companyId, { forOps: true })
  if (!(await db.schema.hasTable('sync_queue'))) {
    return { items: [], total: 0, page: 1, pageSize: 25 }
  }

  const { page, pageSize, offset } = pageOpts(opts.page, opts.pageSize)
  const total = Number((await db('sync_queue').count('* as count').first())?.count ?? 0)
  const rows = await db('sync_queue')
    .select('id', 'sno', 'table', 'event', 'entity_id', 'hlc', 'origin_client_id', 'created_at')
    .orderBy('sno', 'desc')
    .limit(pageSize)
    .offset(offset)

  return {
    page,
    pageSize,
    total,
    items: rows.map((r) => ({
      id: r.id,
      sno: r.sno,
      table: r.table,
      event: r.event,
      entityId: r.entity_id,
      hlc: r.hlc,
      originClientId: r.origin_client_id,
      createdAt: r.created_at
    }))
  }
}

export async function deleteSyncQueueItem(companyId: string, itemId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const deleted = await db('sync_queue').where({ id: itemId }).del()
  if (!deleted) throw new Error('Queue item not found')
  return { ok: true }
}

export async function clearSyncQueue(companyId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })
  if (!(await db.schema.hasTable('sync_queue'))) return { deleted: 0 }
  const deleted = await db('sync_queue').del()
  return { deleted }
}

/**
 * Drop sync history and re-enqueue current live rows so POS pull matches
 * Business Ops (fixes orphan inserts left after hard deletes / purge).
 */
export async function rebuildCompanySyncFromLive(companyId: string) {
  clearSyncAuthority(companyId)
  const db = await getCompanyDb(companyId, { forOps: true })

  await db.raw(`SELECT set_config('session_replication_role', 'replica', true)`)
  try {
    await resetClonedCompanySync(db)
  } finally {
    await db.raw(`SELECT set_config('session_replication_role', 'origin', true)`)
  }

  clearSyncAuthority(companyId)
  const enqueued = await bootstrapCompanySync(companyId, db)
  return { companyId, enqueued }
}

function parseJson(value: unknown) {
  if (value == null) return null
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

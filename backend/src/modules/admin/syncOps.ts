import type { Knex } from 'knex'
import { getCompanyDb } from '../../db'

export async function listConflicts(companyId: string, limit = 50) {
  const db = await getCompanyDb(companyId, { forOps: true })
  if (!(await db.schema.hasTable('sync_conflict'))) {
    return { conflicts: [], total: 0 }
  }
  const total = Number((await db('sync_conflict').count('* as count').first())?.count ?? 0)
  const rows = await db('sync_conflict').orderBy('created_at', 'desc').limit(Math.min(limit, 200))
  const conflicts = []
  for (const row of rows) {
    let current: Record<string, unknown> | null = null
    try {
      if (row.table && row.entity_id && (await db.schema.hasTable(row.table))) {
        current = (await db(row.table).where({ id: row.entity_id }).first()) || null
      }
    } catch {
      current = null
    }
    conflicts.push({
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
    })
  }
  return { conflicts, total }
}

export async function dismissConflict(companyId: string, conflictId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const deleted = await db('sync_conflict').where({ id: conflictId }).del()
  if (!deleted) throw new Error('Conflict not found')
  return { ok: true }
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
    const id = (payload.id as string) || conflict.entity_id
    await trx(conflict.table).insert(payload).onConflict('id').merge()
    await trx('sync_conflict').where({ id: conflictId }).del()
    if (!id) return
  })

  return { ok: true }
}

export async function listSyncQueue(companyId: string, limit = 50) {
  const db = await getCompanyDb(companyId, { forOps: true })
  if (!(await db.schema.hasTable('sync_queue'))) {
    return { items: [], total: 0 }
  }
  const total = Number((await db('sync_queue').count('* as count').first())?.count ?? 0)
  const rows = await db('sync_queue').orderBy('sno', 'desc').limit(Math.min(limit, 200))
  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      sno: r.sno,
      table: r.table,
      event: r.event,
      entityId: r.entity_id,
      hlc: r.hlc,
      originClientId: r.origin_client_id,
      createdAt: r.created_at,
      payload: parseJson(r.payload)
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

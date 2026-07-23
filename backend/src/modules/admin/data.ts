import type { Knex } from 'knex'
import { SYNC_TABLES } from '@madix/database'
import { getCompanyDb } from '../../db'

const ALLOWED = new Set<string>(SYNC_TABLES as readonly string[])

const READONLY_COLUMNS = new Set([
  'hlc',
  'origin_client_id',
  'created_at',
  'created_by'
])

function assertTable(table: string) {
  if (!ALLOWED.has(table)) throw new Error(`Table not allowed: ${table}`)
}

export function listDataTables() {
  return [...SYNC_TABLES]
}

export async function browseTable(
  companyId: string,
  table: string,
  opts: {
    page?: number
    pageSize?: number
    search?: string
    includeDeleted?: boolean
  } = {}
) {
  assertTable(table)
  const db = await getCompanyDb(companyId, { forOps: true })
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25))
  const offset = (page - 1) * pageSize

  let q = db(table)
  let countQ = db(table)

  if (!opts.includeDeleted && (await hasColumn(db, table, 'deleted_at'))) {
    q = q.whereNull('deleted_at')
    countQ = countQ.whereNull('deleted_at')
  }

  if (opts.search?.trim()) {
    const term = `%${opts.search.trim()}%`
    if (await hasColumn(db, table, 'name')) {
      q = q.andWhere('name', 'ilike', term)
      countQ = countQ.andWhere('name', 'ilike', term)
    } else if (await hasColumn(db, table, 'email')) {
      q = q.andWhere('email', 'ilike', term)
      countQ = countQ.andWhere('email', 'ilike', term)
    } else if (await hasColumn(db, table, 'id')) {
      q = q.andWhereRaw('id::text ilike ?', [term])
      countQ = countQ.andWhereRaw('id::text ilike ?', [term])
    }
  }

  const [{ count }] = await countQ.count('* as count')
  const orderCol = (await hasColumn(db, table, 'updated_at'))
    ? 'updated_at'
    : (await hasColumn(db, table, 'created_at'))
      ? 'created_at'
      : 'id'

  const rows = await q.orderBy(orderCol, 'desc').limit(pageSize).offset(offset)
  const columns = await getColumns(db, table)

  return {
    table,
    columns,
    page,
    pageSize,
    total: Number(count),
    rows
  }
}

export async function getTableRow(companyId: string, table: string, id: string) {
  assertTable(table)
  const db = await getCompanyDb(companyId, { forOps: true })
  const row = await db(table).where({ id }).first()
  if (!row) throw new Error('Row not found')
  return { table, row, columns: await getColumns(db, table) }
}

export async function updateTableRow(
  companyId: string,
  table: string,
  id: string,
  patch: Record<string, unknown>
) {
  assertTable(table)
  const db = await getCompanyDb(companyId, { forOps: true })
  const existing = await db(table).where({ id }).first()
  if (!existing) throw new Error('Row not found')

  const columns = await getColumns(db, table)
  const allowed = new Set(columns.map((c) => c.name))
  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue
    if (READONLY_COLUMNS.has(key) || key === 'id') continue
    updates[key] = value
  }
  if (Object.keys(updates).length === 0) throw new Error('No updatable fields provided')
  if (allowed.has('updated_at')) updates.updated_at = new Date()

  await db(table).where({ id }).update(updates)
  return getTableRow(companyId, table, id)
}

export async function softDeleteRow(companyId: string, table: string, id: string) {
  assertTable(table)
  const db = await getCompanyDb(companyId, { forOps: true })
  if (!(await hasColumn(db, table, 'deleted_at'))) {
    throw new Error('Table does not support soft delete')
  }
  const existing = await db(table).where({ id }).first()
  if (!existing) throw new Error('Row not found')
  await db(table).where({ id }).update({
    deleted_at: new Date(),
    ...(await hasColumn(db, table, 'updated_at') ? { updated_at: new Date() } : {})
  })
  return { ok: true }
}

export async function restoreRow(companyId: string, table: string, id: string) {
  assertTable(table)
  const db = await getCompanyDb(companyId, { forOps: true })
  if (!(await hasColumn(db, table, 'deleted_at'))) {
    throw new Error('Table does not support restore')
  }
  await db(table).where({ id }).update({
    deleted_at: null,
    ...(await hasColumn(db, table, 'updated_at') ? { updated_at: new Date() } : {})
  })
  return getTableRow(companyId, table, id)
}

export async function hardDeleteRow(companyId: string, table: string, id: string) {
  assertTable(table)
  // Hard deletes leave insert events in sync_queue without matching deletes →
  // wiped POS devices resurrect orphans. Prefer soft-delete / void flows.
  const blocked = new Set([
    'ledger_entries',
    'sales',
    'sale_lines',
    'payments',
    'inventory_movements'
  ])
  if (blocked.has(table)) {
    throw new Error(
      `Hard delete is disabled for ${table} (breaks POS sync). Soft-delete or void instead, then Force remote POS cleanup if devices must re-pull.`
    )
  }
  const db = await getCompanyDb(companyId, { forOps: true })
  const deleted = await db(table).where({ id }).del()
  if (!deleted) throw new Error('Row not found')
  return { ok: true }
}

async function hasColumn(db: Knex, table: string, column: string) {
  const cols = await getColumns(db, table)
  return cols.some((c) => c.name === column)
}

async function getColumns(db: Knex, table: string) {
  const result = await db.raw(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ?
     ORDER BY ordinal_position`,
    [table]
  )
  return (result.rows as Array<{ column_name: string; data_type: string; is_nullable: string }>).map(
    (r) => ({
      name: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === 'YES',
      readonly: READONLY_COLUMNS.has(r.column_name) || r.column_name === 'id'
    })
  )
}

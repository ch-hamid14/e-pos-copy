import type { Knex } from 'knex'
import { randomUUID } from 'crypto'
import {
  getCompanyMigrationStatus,
  runCompanyMigrations,
  seedCompanyPermissions,
  provisionCompanyDatabase
} from '@madix/database'
import { companyDbPool, getCompanyDb, teardownCompanyDatabase } from '../../db'
import { bootstrapCompanySync } from '../sync/bootstrap'
import { clearSyncAuthority } from '../sync/authority'
import { mapCompany } from './service'
import {
  createCompanySnapshot,
  FLUSH_IDENTITY_TABLES,
  insertRowsMatchingSchema,
  unbindAllDevices
} from './platform'

async function requireCompany(controlDb: Knex, companyId: string) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')
  return company
}

export async function getCompanyOps(controlDb: Knex, companyId: string) {
  const company = await requireCompany(controlDb, companyId)
  const companyDb = await getCompanyDb(companyId, { forOps: true })

  const migrations = await getCompanyMigrationStatus(companyDb)
  const controlPermissionCount = Number(
    (await controlDb('permissions').count('* as count').first())?.count ?? 0
  )
  const companyPermissionCount = Number(
    (await companyDb('permissions').count('* as count').first())?.count ?? 0
  )

  let sync = { queueDepth: 0, conflictCount: 0, tablesReady: false }
  if (await companyDb.schema.hasTable('sync_queue')) {
    const queueDepth = await companyDb('sync_queue').count('* as count').first()
    const conflictCount = (await companyDb.schema.hasTable('sync_conflict'))
      ? await companyDb('sync_conflict').count('* as count').first()
      : { count: 0 }
    sync = {
      queueDepth: Number(queueDepth?.count ?? 0),
      conflictCount: Number(conflictCount?.count ?? 0),
      tablesReady: true
    }
  }

  const devices = await controlDb('devices')
    .leftJoin('users', 'devices.user_id', 'users.id')
    .where('devices.company_id', companyId)
    .select(
      'devices.id',
      'devices.device_code',
      'devices.client_device_id',
      'devices.name',
      'devices.last_sync_at',
      'devices.user_id',
      'devices.branch_id',
      'devices.created_at',
      'users.email as user_email'
    )
    .orderBy('devices.last_sync_at', 'desc')

  return {
    company: mapCompany(company),
    database: {
      dbName: company.db_name,
      dbHost: company.db_host,
      dbPort: company.db_port
    },
    migrations,
    permissions: {
      control: controlPermissionCount,
      company: companyPermissionCount,
      inSync: controlPermissionCount === companyPermissionCount
    },
    sync,
    devices: devices.map((d) => ({
      id: d.id,
      deviceCode: d.device_code,
      clientDeviceId: d.client_device_id,
      name: d.name,
      lastSyncAt: d.last_sync_at,
      userId: d.user_id,
      userEmail: d.user_email ?? null,
      branchId: d.branch_id,
      createdAt: d.created_at
    }))
  }
}

export async function migrateCompany(controlDb: Knex, companyId: string) {
  await requireCompany(controlDb, companyId)
  const companyDb = await getCompanyDb(companyId, { forOps: true })
  const before = await getCompanyMigrationStatus(companyDb)
  const result = await runCompanyMigrations(companyDb)
  const after = await getCompanyMigrationStatus(companyDb)
  // Rebuild sync authority so newly created tables get metadata columns/triggers.
  clearSyncAuthority(companyId)
  return {
    companyId,
    applied: result.migrations,
    batch: result.batch,
    before,
    after
  }
}

export async function migrateAllCompanies(controlDb: Knex) {
  const companies = await controlDb('companies')
    .whereIn('status', ['active', 'inactive'])
    .select('id', 'name', 'status')
    .orderBy('created_at', 'asc')

  const results: Array<{
    companyId: string
    name: string
    status: string
    ok: boolean
    applied: string[]
    error?: string
  }> = []

  for (const company of companies) {
    try {
      const result = await migrateCompany(controlDb, company.id as string)
      results.push({
        companyId: company.id as string,
        name: company.name as string,
        status: company.status as string,
        ok: true,
        applied: result.applied
      })
    } catch (err) {
      results.push({
        companyId: company.id as string,
        name: company.name as string,
        status: company.status as string,
        ok: false,
        applied: [],
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  return {
    total: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results
  }
}

export async function reseedCompanyPermissions(controlDb: Knex, companyId: string) {
  await requireCompany(controlDb, companyId)
  const companyDb = await getCompanyDb(companyId, { forOps: true })
  const count = await seedCompanyPermissions(controlDb, companyDb)
  return {
    companyId,
    upserted: count,
    control: Number((await controlDb('permissions').count('* as count').first())?.count ?? 0),
    company: Number((await companyDb('permissions').count('* as count').first())?.count ?? 0)
  }
}

export async function bootstrapSyncForCompany(controlDb: Knex, companyId: string) {
  await requireCompany(controlDb, companyId)
  const companyDb = await getCompanyDb(companyId, { forOps: true })
  const enqueued = await bootstrapCompanySync(companyId, companyDb)
  return { companyId, enqueued }
}

export async function unbindCompanyDevice(
  controlDb: Knex,
  companyId: string,
  deviceId: string
) {
  await requireCompany(controlDb, companyId)
  const device = await controlDb('devices').where({ id: deviceId, company_id: companyId }).first()
  if (!device) throw new Error('Device not found')

  await controlDb.transaction(async (trx) => {
    if (device.client_device_id) {
      await trx('users')
        .where({ company_id: companyId, bound_device_id: device.client_device_id })
        .update({ bound_device_id: null, updated_at: new Date() })
    }
    await trx('devices').where({ id: deviceId }).delete()
  })

  return { ok: true }
}

export async function deleteCompany(controlDb: Knex, companyId: string, confirmName: string) {
  const company = await requireCompany(controlDb, companyId)
  if (!confirmName || confirmName.trim() !== (company.name as string)) {
    throw new Error('Confirmation name does not match company name')
  }

  const adminUrl = process.env.CONTROL_DATABASE_URL || ''
  await companyDbPool.evict(companyId).catch(() => {})
  await controlDb('devices').where({ company_id: companyId }).delete()
  await controlDb('users').where({ company_id: companyId }).delete()
  await controlDb('companies').where({ id: companyId }).delete()
  await teardownCompanyDatabase(adminUrl, companyId).catch((err) => {
    console.error('Failed to drop company database:', companyId, err)
    throw new Error(
      `Company record removed but database drop failed: ${err instanceof Error ? err.message : String(err)}`
    )
  })

  return { ok: true, companyId }
}

/**
 * Demo → production reset: JSON snapshot, unbind devices, drop + reprovision
 * company DB, reinsert identity rows with the same UUIDs, bootstrap sync.
 * Control-plane company + users stay intact.
 */
export async function flushCompany(controlDb: Knex, companyId: string, confirmName: string) {
  const company = await requireCompany(controlDb, companyId)
  if (!confirmName || confirmName.trim() !== (company.name as string)) {
    throw new Error('Confirmation name does not match company name')
  }

  const adminUrl = process.env.CONTROL_DATABASE_URL || ''
  if (!adminUrl) throw new Error('CONTROL_DATABASE_URL is not set')

  const snapshot = await createCompanySnapshot(controlDb, companyId, { kind: 'manual' })

  const companyDb = await getCompanyDb(companyId, { forOps: true })
  const identity: Record<string, Record<string, unknown>[]> = {}
  for (const table of FLUSH_IDENTITY_TABLES) {
    if (await companyDb.schema.hasTable(table)) {
      const rows = await companyDb(table).select('*')
      identity[table] = rows.map((row) => {
        const out: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
          out[key] = value instanceof Date ? value.toISOString() : value
        }
        return out
      })
    } else {
      identity[table] = []
    }
  }

  const previousStatus = company.status as string
  const previousMaintenance = Boolean(company.maintenance_mode)
  let dbDropped = false

  await controlDb('companies').where({ id: companyId }).update({
    status: 'provisioning',
    maintenance_mode: true,
    updated_at: new Date()
  })

  try {
    await unbindAllDevices(controlDb, companyId)

    clearSyncAuthority(companyId)
    await companyDbPool.evict(companyId).catch(() => {})
    await teardownCompanyDatabase(adminUrl, companyId)
    dbDropped = true

    await provisionCompanyDatabase(controlDb, adminUrl, companyId, {
      name: company.name as string,
      email: (company.email as string) || undefined,
      phone: (company.phone as string) || undefined
    })

    const freshDb = await getCompanyDb(companyId, { forOps: true })
    await freshDb.raw(`SELECT set_config('session_replication_role', 'replica', true)`)

    for (const table of FLUSH_IDENTITY_TABLES) {
      const rows = identity[table] || []
      if (!rows.length) continue
      await insertRowsMatchingSchema(freshDb, table, rows)
    }

    if (!(identity.branches || []).length) {
      const branchId = randomUUID()
      const now = new Date()
      await freshDb('branches').insert({
        id: branchId,
        company_id: companyId,
        name: 'Main Branch',
        location: '',
        is_active: true,
        created_at: now,
        updated_at: now
      })
      await controlDb('users').where({ company_id: companyId }).update({
        branch_id: branchId,
        updated_at: now
      })
      identity.branches = [{ id: branchId }]
    } else {
      const branchIds = new Set(
        (identity.branches || []).map((b) => String(b.id)).filter(Boolean)
      )
      const fallbackBranchId = String((identity.branches || [])[0].id)
      const users = await controlDb('users').where({ company_id: companyId }).select('id', 'branch_id')
      for (const user of users) {
        if (user.branch_id && branchIds.has(String(user.branch_id))) continue
        await controlDb('users').where({ id: user.id }).update({
          branch_id: fallbackBranchId,
          updated_at: new Date()
        })
      }
    }

    await freshDb.raw(`SELECT set_config('session_replication_role', 'origin', true)`)

    const branchCount = Number(
      (await freshDb('branches').where({ company_id: companyId }).whereNull('deleted_at').count('* as count').first())
        ?.count ?? 0
    )

    clearSyncAuthority(companyId)
    const enqueued = await bootstrapCompanySync(companyId, freshDb)

    await controlDb('companies').where({ id: companyId }).update({
      status: 'active',
      maintenance_mode: false,
      branch_count: branchCount,
      updated_at: new Date()
    })

    return {
      ok: true,
      companyId,
      snapshot,
      restored: Object.fromEntries(
        FLUSH_IDENTITY_TABLES.map((table) => [table, (identity[table] || []).length])
      ),
      branchCount,
      enqueued,
      devicesUnbound: true
    }
  } catch (err) {
    await controlDb('companies')
      .where({ id: companyId })
      .update({
        status: dbDropped ? 'provisioning' : previousStatus,
        maintenance_mode: dbDropped ? true : previousMaintenance,
        updated_at: new Date()
      })
      .catch(() => {})

    const hint = dbDropped
      ? ` Company left in provisioning; pre-flush snapshot: ${snapshot.filename}`
      : ` Pre-flush snapshot: ${snapshot.filename}`
    if (err instanceof Error) {
      err.message = `${err.message}.${hint}`
      throw err
    }
    throw new Error(`${String(err)}.${hint}`)
  }
}

import type { Knex } from 'knex'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import {
  cloneDatabase,
  companyDbName,
  createCompanyKnex,
  createDatabase,
  parseConnectionUrl,
  remapClonedCompanyIds,
  resetClonedCompanySync,
  teardownCompanyDatabase
} from '@madix/database'
import { companyDbPool, getCompanyDb } from '../../db'
import { bootstrapCompanySync } from '../sync/bootstrap'
import { signToken } from '../../utils/jwt'
import { mapCompany } from './service'

const execFileAsync = promisify(execFile)

export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  inventory: true,
  expenses: true,
  multiBranch: true,
  customers: true,
  purchases: true
}

function snapshotDir() {
  return process.env.SNAPSHOT_DIR || path.join(process.cwd(), 'snapshots')
}

function adminUrl() {
  return process.env.CONTROL_DATABASE_URL || ''
}

export async function updateCompanyPlatformSettings(
  controlDb: Knex,
  companyId: string,
  data: {
    plan?: string
    planExpiresAt?: string | null
    maintenanceMode?: boolean
    minAppVersion?: string | null
    maxBranches?: number | null
    maxUsers?: number | null
    maxDevices?: number | null
    featureFlags?: Record<string, boolean>
  }
) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')

  const updates: Record<string, unknown> = { updated_at: new Date() }
  if (data.plan !== undefined) updates.plan = data.plan
  if (data.planExpiresAt !== undefined) {
    updates.plan_expires_at = data.planExpiresAt ? new Date(data.planExpiresAt) : null
  }
  if (data.maintenanceMode !== undefined) updates.maintenance_mode = data.maintenanceMode
  if (data.minAppVersion !== undefined) updates.min_app_version = data.minAppVersion || null
  if (data.maxBranches !== undefined) updates.max_branches = data.maxBranches
  if (data.maxUsers !== undefined) updates.max_users = data.maxUsers
  if (data.maxDevices !== undefined) updates.max_devices = data.maxDevices
  if (data.featureFlags !== undefined) {
    updates.feature_flags = JSON.stringify({ ...DEFAULT_FEATURE_FLAGS, ...data.featureFlags })
  }

  await controlDb('companies').where({ id: companyId }).update(updates)
  return mapCompany(await controlDb('companies').where({ id: companyId }).first())
}

export async function unbindAllDevices(controlDb: Knex, companyId: string) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')

  await controlDb.transaction(async (trx) => {
    await trx('users').where({ company_id: companyId }).update({
      bound_device_id: null,
      updated_at: new Date()
    })
    await trx('devices').where({ company_id: companyId }).delete()
  })

  return { ok: true }
}

export async function resetUserPassword(
  controlDb: Knex,
  companyId: string,
  userId: string,
  password: string
) {
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters')
  const user = await controlDb('users').where({ id: userId, company_id: companyId }).first()
  if (!user) throw new Error('User not found')
  const hashed = await bcrypt.hash(password, 10)
  await controlDb('users').where({ id: userId }).update({ password: hashed, updated_at: new Date() })
  return { ok: true }
}

export async function impersonateCompanyUser(
  controlDb: Knex,
  companyId: string,
  userId: string,
  impersonator: { userId: string; email: string }
) {
  const user = await controlDb('users')
    .where({ id: userId, company_id: companyId, is_active: true })
    .first()
  if (!user) throw new Error('User not found or inactive')

  const companyDb = await getCompanyDb(companyId, { forOps: true })
  const roleRows = await companyDb('user_roles as ur')
    .join('role_permissions as rp', 'ur.role_id', 'rp.role_id')
    .join('permissions as p', 'rp.permission_id', 'p.id')
    .where('ur.user_id', userId)
    .select('p.key')
  const permissions = [...new Set(roleRows.map((r: { key: string }) => r.key))]

  const tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const token = signToken(
    {
      userId: user.id,
      email: user.email,
      companyId: user.company_id,
      branchId: user.branch_id,
      role: user.role,
      permissions,
      deviceId: 'support-session',
      tokenExpiresAt,
      offlineAllowedUntil: tokenExpiresAt,
      impersonatorId: impersonator.userId,
      impersonatorEmail: impersonator.email
    },
    '1h'
  )

  return {
    token,
    tokenExpiresAt,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      companyId: user.company_id,
      branchId: user.branch_id,
      role: user.role,
      permissions
    }
  }
}

export async function createCompanySnapshot(controlDb: Knex, companyId: string) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')

  const dir = snapshotDir()
  await fs.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${company.db_name}-${stamp}.sql`
  const filePath = path.join(dir, filename)

  const cfg = parseConnectionUrl(adminUrl())
  await execFileAsync(
    'pg_dump',
    [
      '-h', cfg.host,
      '-p', String(cfg.port),
      '-U', cfg.user,
      '-d', company.db_name as string,
      '-F', 'p',
      '--no-owner',
      '--no-acl',
      '-f', filePath
    ],
    { env: { ...process.env, PGPASSWORD: cfg.password } }
  )

  const stat = await fs.stat(filePath)
  return {
    filename,
    size: stat.size,
    createdAt: new Date().toISOString()
  }
}

export async function listCompanySnapshots(controlDb: Knex, companyId: string) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')
  const dir = snapshotDir()
  try {
    const files = await fs.readdir(dir)
    const prefix = `${company.db_name}-`
    const items = []
    for (const filename of files.filter((f) => f.startsWith(prefix) && f.endsWith('.sql'))) {
      const stat = await fs.stat(path.join(dir, filename))
      items.push({
        filename,
        size: stat.size,
        createdAt: stat.mtime.toISOString()
      })
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return items
  } catch {
    return []
  }
}

export async function restoreCompanySnapshot(
  controlDb: Knex,
  companyId: string,
  filename: string
) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid snapshot filename')
  }
  if (!filename.startsWith(`${company.db_name}-`)) {
    throw new Error('Snapshot does not belong to this company')
  }

  const filePath = path.join(snapshotDir(), filename)
  await fs.access(filePath)

  const cfg = parseConnectionUrl(adminUrl())
  await companyDbPool.evict(companyId)

  // Recreate empty DB then restore dump
  await teardownCompanyDatabase(adminUrl(), companyId)
  await createDatabase(cfg, company.db_name as string)

  await execFileAsync(
    'psql',
    [
      '-h', cfg.host,
      '-p', String(cfg.port),
      '-U', cfg.user,
      '-d', company.db_name as string,
      '-v', 'ON_ERROR_STOP=1',
      '-f', filePath
    ],
    { env: { ...process.env, PGPASSWORD: cfg.password } }
  )

  return { ok: true }
}

export async function cloneCompany(
  controlDb: Knex,
  sourceCompanyId: string,
  name?: string
) {
  const source = await controlDb('companies').where({ id: sourceCompanyId }).first()
  if (!source) throw new Error('Source company not found')

  const newId = randomUUID()
  const newName = name?.trim() || `Clone of ${source.name}`
  const dbName = companyDbName(newId)
  const cfg = parseConnectionUrl(adminUrl())
  const now = new Date()

  try {
    await controlDb('companies').insert({
      id: newId,
      name: newName,
      email: null,
      phone: null,
      status: 'provisioning',
      db_name: dbName,
      db_host: source.db_host || cfg.host,
      db_port: source.db_port || cfg.port,
      branch_count: source.branch_count || 0,
      plan: source.plan || 'standard',
      plan_expires_at: source.plan_expires_at || null,
      maintenance_mode: false,
      min_app_version: source.min_app_version || null,
      max_branches: source.max_branches ?? null,
      max_users: source.max_users ?? null,
      max_devices: source.max_devices ?? null,
      feature_flags: source.feature_flags || JSON.stringify(DEFAULT_FEATURE_FLAGS),
      created_at: now,
      updated_at: now
    })

    await companyDbPool.evict(sourceCompanyId)
    await cloneDatabase(cfg, source.db_name as string, dbName)

    const companyKnex = createCompanyKnex(
      { ...cfg, database: dbName },
      dbName
    )
    try {
      await remapClonedCompanyIds(companyKnex, sourceCompanyId, newId, newName)
      await resetClonedCompanySync(companyKnex)
    } finally {
      await companyKnex.destroy()
    }

    await controlDb('companies').where({ id: newId }).update({
      status: 'active',
      updated_at: new Date()
    })

    const liveDb = await getCompanyDb(newId, { forOps: true })
    await bootstrapCompanySync(newId, liveDb)

    return mapCompany(await controlDb('companies').where({ id: newId }).first())
  } catch (err) {
    await companyDbPool.evict(newId).catch(() => {})
    await controlDb('companies').where({ id: newId }).delete().catch(() => {})
    await teardownCompanyDatabase(adminUrl(), newId).catch(() => {})
    throw err
  }
}

export { snapshotDir }

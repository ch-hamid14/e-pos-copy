import type { Knex } from 'knex'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
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
  runCompanyMigrations,
  teardownCompanyDatabase
} from '@madix/database'
import { companyDbPool, getCompanyDb } from '../../db'
import { bootstrapCompanySync } from '../sync/bootstrap'
import { clearSyncAuthority } from '../sync/authority'
import { rebuildCompanySyncFromLive } from './syncOps'
import { runPgDump, runPsql } from '../../lib/pgDump'
import { mapCompany } from './service'

export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  inventory: true,
  expenses: true,
  multiBranch: true,
  customers: true,
  purchases: true
}

/** Tables rebuilt after flush with the same primary keys. */
export const FLUSH_IDENTITY_TABLES = [
  'branches',
  'roles',
  'role_permissions',
  'user_profiles',
  'user_roles'
] as const

const PG_DUMP_EXCLUDE_TABLES = [
  'sync_queue',
  'sync_applied',
  'sync_conflict',
  'sync_dead_letter',
  'sync_state',
  'sync_clock',
  'sync_config'
]

const SCHEDULED_RETENTION_DAYS = 7

export type SnapshotKind = 'manual' | 'scheduled'

export const SNAPSHOT_FORMAT_PG = 'madix-pg-dump-v1'
export const SNAPSHOT_FORMAT_LEGACY = 'madix-company-sql-v1'

function snapshotRootDir() {
  return process.env.SNAPSHOT_DIR || path.join(process.cwd(), 'snapshots')
}

function adminUrl() {
  return process.env.CONTROL_DATABASE_URL || ''
}

/** Safe folder name from company display name. */
export function companySnapshotFolderName(companyName: string): string {
  const cleaned =
    companyName
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'company'
  return cleaned
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** `{companyId}-{DD}-{MM}-{YYYY}.sql` or `...-manual-HHMMSS.sql` */
export function buildSnapshotFilename(companyId: string, at: Date, kind: SnapshotKind): string {
  const stamp = `${pad2(at.getDate())}-${pad2(at.getMonth() + 1)}-${at.getFullYear()}`
  const base = `${companyId}-${stamp}`
  if (kind === 'scheduled') return `${base}.sql`
  const time = `${pad2(at.getHours())}${pad2(at.getMinutes())}${pad2(at.getSeconds())}`
  return `${base}-manual-${time}.sql`
}

function isManualSnapshotFilename(filename: string): boolean {
  return filename.toLowerCase().includes('manual')
}

function companySnapshotDir(companyName: string) {
  return path.join(snapshotRootDir(), companySnapshotFolderName(companyName))
}

function pgDumpEnv(cfg: ReturnType<typeof parseConnectionUrl>): Record<string, string> {
  return { PGPASSWORD: cfg.password || '' }
}

function buildSnapshotHeader(meta: {
  companyId: string
  companyName: string
  dbName: string
  kind: SnapshotKind
  createdAt: string
}): string {
  const safeDb = meta.dbName.replace(/'/g, "''")
  return [
    '-- Madix company SQL snapshot',
    `-- format: ${SNAPSHOT_FORMAT_PG}`,
    `-- company_id: ${meta.companyId}`,
    `-- company_name: ${meta.companyName.replace(/\n/g, ' ')}`,
    `-- db_name: ${meta.dbName}`,
    `-- kind: ${meta.kind}`,
    `-- created_at: ${meta.createdAt}`,
    '-- Generated with pg_dump. Sync meta tables omitted.',
    '-- Restore: admin UI, or psql -d postgres -v ON_ERROR_STOP=1 -f this-file.sql (superuser)',
    '',
    'DO $madix$',
    'BEGIN',
    `  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${safeDb}') THEN`,
    `    EXECUTE format('CREATE DATABASE %I', '${safeDb}');`,
    '  END IF;',
    'END',
    '$madix$;',
    ''
  ].join('\n')
}

/** Add IF NOT EXISTS to common CREATE statements for safer standalone restore. */
function augmentPgDumpSql(sql: string): string {
  return sql
    .replace(/^CREATE TABLE /gm, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/^CREATE SEQUENCE /gm, 'CREATE SEQUENCE IF NOT EXISTS ')
    .replace(/^CREATE INDEX /gm, 'CREATE INDEX IF NOT EXISTS ')
    .replace(/^CREATE UNIQUE INDEX /gm, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
}

async function dumpCompanyWithPgDump(
  cfg: ReturnType<typeof parseConnectionUrl>,
  dbName: string,
  outPath: string
) {
  const args = [
    '-h',
    cfg.host,
    '-p',
    String(cfg.port),
    '-U',
    cfg.user,
    '-d',
    dbName,
    '--no-owner',
    '--no-acl',
    '--format=plain',
    '-f',
    outPath
  ]
  for (const table of PG_DUMP_EXCLUDE_TABLES) {
    args.push('--exclude-table', table)
  }
  await runPgDump(args, pgDumpEnv(cfg))
}

export async function insertRowsMatchingSchema(
  db: Knex,
  table: string,
  rows: Record<string, unknown>[]
) {
  if (!rows.length) return 0
  const info = await db(table).columnInfo()
  const columns = new Set(Object.keys(info))
  let inserted = 0
  const chunkSize = 100
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((row) => {
      const cleaned: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(row)) {
        if (columns.has(key)) cleaned[key] = value
      }
      return cleaned
    })
    if (!chunk.length) continue
    await db(table).insert(chunk)
    inserted += chunk.length
  }
  return inserted
}

/** Delete scheduled (non-manual) snapshots older than 7 days; keep at most 7. */
export async function pruneScheduledSnapshots(companyName: string, companyId: string) {
  const dir = companySnapshotDir(companyName)
  let files: string[] = []
  try {
    files = await fs.readdir(dir)
  } catch {
    return { deleted: [] as string[] }
  }

  const scheduled = files.filter(
    (f) => f.startsWith(`${companyId}-`) && f.endsWith('.sql') && !isManualSnapshotFilename(f)
  )

  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (SCHEDULED_RETENTION_DAYS - 1))

  const keep = new Set<string>()
  const escapedId = companyId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const dateRe = new RegExp(`^${escapedId}-(\\d{2})-(\\d{2})-(\\d{4})\\.sql$`)

  const dated: Array<{ filename: string; time: number }> = []
  for (const filename of scheduled) {
    const match = filename.match(dateRe)
    if (!match) continue
    const day = Number(match[1])
    const month = Number(match[2])
    const year = Number(match[3])
    dated.push({ filename, time: new Date(year, month - 1, day).getTime() })
  }

  dated.sort((a, b) => b.time - a.time)
  for (const item of dated) {
    if (keep.size >= SCHEDULED_RETENTION_DAYS) break
    if (item.time >= cutoff.getTime()) keep.add(item.filename)
  }

  // Cap at 7 even within the window (e.g. odd renames)
  if (keep.size > SCHEDULED_RETENTION_DAYS) {
    const ordered = dated.filter((d) => keep.has(d.filename))
    keep.clear()
    for (const item of ordered.slice(0, SCHEDULED_RETENTION_DAYS)) keep.add(item.filename)
  }

  const deleted: string[] = []
  for (const filename of scheduled) {
    if (keep.has(filename)) continue
    await fs.unlink(path.join(dir, filename)).catch(() => {})
    deleted.push(filename)
  }

  return { deleted }
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

/**
 * Force every POS for this company through the data_epoch wipe gate on next
 * online login/refresh. Rebuilds sync_queue from live tables first so wiped
 * devices re-download the same data Business Ops shows (no orphan changelog).
 */
export async function forcePosRemoteCleanup(controlDb: Knex, companyId: string) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')

  const previousEpoch = Number(company.data_epoch ?? 1)
  const sync = await rebuildCompanySyncFromLive(companyId)
  await unbindAllDevices(controlDb, companyId)
  await controlDb('companies').where({ id: companyId }).increment('data_epoch', 1)
  const epochRow = await controlDb('companies').where({ id: companyId }).first()

  return {
    ok: true,
    companyId,
    devicesUnbound: true,
    syncRebuilt: true,
    enqueued: sync.enqueued,
    previousEpoch,
    dataEpoch: Number(epochRow?.data_epoch ?? previousEpoch + 1)
  }
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

export async function createCompanySnapshot(
  controlDb: Knex,
  companyId: string,
  options?: { kind?: SnapshotKind }
) {
  const kind: SnapshotKind = options?.kind || 'manual'
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')

  const companyName = company.name as string
  const dbName = company.db_name as string
  const cfg = parseConnectionUrl(adminUrl())
  const now = new Date()
  const createdAt = now.toISOString()

  const dir = companySnapshotDir(companyName)
  await fs.mkdir(dir, { recursive: true })
  const filename = buildSnapshotFilename(companyId, now, kind)
  const filePath = path.join(dir, filename)
  const tmpPath = `${filePath}.pgdump.tmp`
  let tableCount = 0

  try {
    await dumpCompanyWithPgDump(cfg, dbName, tmpPath)
    const body = augmentPgDumpSql(await fs.readFile(tmpPath, 'utf8'))
    tableCount = (body.match(/^CREATE TABLE IF NOT EXISTS /gm) || []).length
    const header = buildSnapshotHeader({
      companyId,
      companyName,
      dbName,
      kind,
      createdAt
    })
    await fs.writeFile(filePath, `${header}\n${body}`, 'utf8')
  } finally {
    await fs.unlink(tmpPath).catch(() => {})
  }

  if (kind === 'scheduled') {
    await pruneScheduledSnapshots(companyName, companyId)
  }

  const stat = await fs.stat(filePath)
  return {
    filename,
    folder: companySnapshotFolderName(companyName),
    size: stat.size,
    createdAt,
    kind,
    tableCount,
    engine: 'pg_dump' as const
  }
}

export async function listCompanySnapshots(controlDb: Knex, companyId: string) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')
  const dir = companySnapshotDir(company.name as string)
  try {
    const files = await fs.readdir(dir)
    const items = []
    for (const filename of files.filter(
      (f) => f.startsWith(`${companyId}-`) && f.endsWith('.sql')
    )) {
      const stat = await fs.stat(path.join(dir, filename))
      items.push({
        filename,
        folder: companySnapshotFolderName(company.name as string),
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
        kind: isManualSnapshotFilename(filename) ? ('manual' as const) : ('scheduled' as const)
      })
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return items
  } catch {
    return []
  }
}

function assertSafeSnapshotFilename(companyId: string, filename: string) {
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid snapshot filename')
  }
  if (!filename.startsWith(`${companyId}-`) || !filename.endsWith('.sql')) {
    throw new Error('Snapshot does not belong to this company')
  }
}

async function executeSqlScript(db: Knex, sql: string) {
  const withoutLineComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  const statements = withoutLineComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const statement of statements) {
    await db.raw(statement)
  }
}

export async function restoreCompanySnapshot(
  controlDb: Knex,
  companyId: string,
  filename: string
) {
  const company = await controlDb('companies').where({ id: companyId }).first()
  if (!company) throw new Error('Company not found')
  assertSafeSnapshotFilename(companyId, filename)

  const filePath = path.join(companySnapshotDir(company.name as string), filename)
  const sql = await fs.readFile(filePath, 'utf8')
  const cfg = parseConnectionUrl(adminUrl())
  const dbName = company.db_name as string
  const env = pgDumpEnv(cfg)

  await companyDbPool.evict(companyId)
  await teardownCompanyDatabase(adminUrl(), companyId)
  await createDatabase(cfg, dbName)

  if (sql.includes(SNAPSHOT_FORMAT_PG)) {
    await runPsql(
      ['-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user, '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-f', filePath],
      env
    )
  } else if (sql.includes(SNAPSHOT_FORMAT_LEGACY)) {
    const companyKnex = createCompanyKnex({ ...cfg, database: dbName }, dbName)
    try {
      await runCompanyMigrations(companyKnex)
      await executeSqlScript(companyKnex, sql)
    } finally {
      await companyKnex.destroy()
    }
  } else {
    throw new Error('Unsupported snapshot format')
  }

  // Snapshot rows keep real HLCs and omit sync meta. Reset to sentinel (with
  // capture triggers disabled) so bootstrap can enqueue the full dataset.
  clearSyncAuthority(companyId)
  const liveDb = await getCompanyDb(companyId, { forOps: true })
  await liveDb.raw(`SELECT set_config('session_replication_role', 'replica', true)`)
  try {
    await resetClonedCompanySync(liveDb)
  } finally {
    await liveDb.raw(`SELECT set_config('session_replication_role', 'origin', true)`)
  }

  clearSyncAuthority(companyId)
  const enqueued = await bootstrapCompanySync(companyId, liveDb)
  await unbindAllDevices(controlDb, companyId)
  await controlDb('companies').where({ id: companyId }).increment('data_epoch', 1)
  const epochRow = await controlDb('companies').where({ id: companyId }).first()

  return {
    ok: true,
    enqueued,
    devicesUnbound: true,
    dataEpoch: Number(epochRow?.data_epoch ?? 1)
  }
}

/** Daily scheduled snapshots for active/inactive companies; prunes to last 7 days. */
export async function runScheduledCompanySnapshots(controlDb: Knex) {
  const companies = await controlDb('companies')
    .whereIn('status', ['active', 'inactive'])
    .select('id', 'name')
    .orderBy('created_at', 'asc')

  const results: Array<{
    companyId: string
    name: string
    ok: boolean
    filename?: string
    error?: string
  }> = []

  for (const company of companies) {
    try {
      const snap = await createCompanySnapshot(controlDb, company.id as string, { kind: 'scheduled' })
      results.push({
        companyId: company.id as string,
        name: company.name as string,
        ok: true,
        filename: snap.filename
      })
    } catch (err) {
      results.push({
        companyId: company.id as string,
        name: company.name as string,
        ok: false,
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

    const companyKnex = createCompanyKnex({ ...cfg, database: dbName }, dbName)
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

export { snapshotRootDir as snapshotDir }

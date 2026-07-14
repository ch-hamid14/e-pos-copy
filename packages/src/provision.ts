import type { Knex } from 'knex'
import {
  companyDbName,
  companyMigrationsDir,
  createCompanyKnex,
  createKnex,
  parseConnectionUrl,
  type PgConnectionConfig
} from './connections'

export type ProvisionResult = {
  companyId: string
  dbName: string
  dbHost: string
  dbPort: number
}

export async function createDatabase(adminConfig: PgConnectionConfig, dbName: string): Promise<void> {
  const adminKnex = createKnex({ ...adminConfig, database: 'postgres' })
  try {
    const exists = await adminKnex.raw('SELECT 1 FROM pg_database WHERE datname = ?', [dbName])
    if (exists.rows.length === 0) {
      await adminKnex.raw(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`)
    }
  } finally {
    await adminKnex.destroy()
  }
}

export async function dropDatabase(adminConfig: PgConnectionConfig, dbName: string): Promise<void> {
  const safeName = dbName.replace(/"/g, '')
  const adminKnex = createKnex({ ...adminConfig, database: 'postgres' })
  try {
    await adminKnex.raw(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = ? AND pid <> pg_backend_pid()`,
      [safeName]
    )
    await adminKnex.raw(`DROP DATABASE IF EXISTS "${safeName}"`)
  } finally {
    await adminKnex.destroy()
  }
}

/** Clone an existing company database via PostgreSQL TEMPLATE. */
export async function cloneDatabase(
  adminConfig: PgConnectionConfig,
  sourceDbName: string,
  targetDbName: string
): Promise<void> {
  const source = sourceDbName.replace(/"/g, '')
  const target = targetDbName.replace(/"/g, '')
  const adminKnex = createKnex({ ...adminConfig, database: 'postgres' })
  try {
    await adminKnex.raw(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = ? AND pid <> pg_backend_pid()`,
      [source]
    )
    const exists = await adminKnex.raw('SELECT 1 FROM pg_database WHERE datname = ?', [target])
    if (exists.rows.length > 0) {
      throw new Error(`Database already exists: ${target}`)
    }
    await adminKnex.raw(`CREATE DATABASE "${target}" WITH TEMPLATE "${source}"`)
  } finally {
    await adminKnex.destroy()
  }
}

/** After a TEMPLATE clone, rewrite company_id / company_profile.id to the new company. */
export async function remapClonedCompanyIds(
  companyKnex: Knex,
  oldCompanyId: string,
  newCompanyId: string,
  newName: string
): Promise<void> {
  const result = await companyKnex.raw(
    `SELECT table_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'company_id'`
  )
  const tables = (result.rows as Array<{ table_name: string }>).map((r) => r.table_name)
  await companyKnex.transaction(async (trx) => {
    for (const table of tables) {
      await trx(table).where({ company_id: oldCompanyId }).update({ company_id: newCompanyId })
    }
    if (await trx.schema.hasTable('company_profile')) {
      await trx('company_profile').where({ id: oldCompanyId }).update({
        id: newCompanyId,
        name: newName,
        updated_at: new Date()
      })
    }
  })
}

export async function teardownCompanyDatabase(
  adminConnectionUrl: string,
  companyId: string
): Promise<void> {
  const baseConfig = parseConnectionUrl(adminConnectionUrl)
  await dropDatabase(baseConfig, companyDbName(companyId))
}

const migrateConfig = () => ({
  directory: companyMigrationsDir(),
  loadExtensions: ['.js'] as string[]
})

function migrationName(entry: unknown): string {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object') {
    const row = entry as { name?: string; file?: string }
    if (row.name) return row.name
    if (row.file) return row.file
  }
  return String(entry)
}

export type CompanyMigrationStatus = {
  completed: string[]
  pending: string[]
  current: string | null
  upToDate: boolean
}

export async function getCompanyMigrationStatus(companyKnex: Knex): Promise<CompanyMigrationStatus> {
  const [completedRaw, pendingRaw] = await companyKnex.migrate.list(migrateConfig())
  const completed = (completedRaw as unknown[]).map(migrationName)
  const pending = (pendingRaw as unknown[]).map(migrationName)
  return {
    completed,
    pending,
    current: completed.length > 0 ? completed[completed.length - 1] : null,
    upToDate: pending.length === 0
  }
}

export async function runCompanyMigrations(companyKnex: Knex): Promise<{ batch: number; migrations: string[] }> {
  const [batch, migrations] = await companyKnex.migrate.latest(migrateConfig())
  return {
    batch: Number(batch || 0),
    migrations: (migrations as string[]) || []
  }
}

export async function seedCompanyPermissions(
  controlDb: Knex,
  companyDb: Knex
): Promise<number> {
  const permissions = await controlDb('permissions').select('*')
  let count = 0
  for (const perm of permissions) {
    const existingById = await companyDb('permissions').where({ id: perm.id }).first()
    if (existingById) {
      await companyDb('permissions').where({ id: perm.id }).update({
        key: perm.key,
        label: perm.label,
        updated_at: new Date()
      })
      count++
      continue
    }

    const existingByKey = await companyDb('permissions').where({ key: perm.key }).first()
    if (existingByKey) {
      await companyDb('permissions').where({ id: existingByKey.id }).update({
        label: perm.label,
        updated_at: new Date()
      })
      count++
      continue
    }

    await companyDb('permissions').insert({
      id: perm.id,
      key: perm.key,
      label: perm.label,
      created_at: perm.created_at,
      updated_at: perm.updated_at
    })
    count++
  }
  return count
}

export async function provisionCompanyDatabase(
  controlDb: Knex,
  adminConnectionUrl: string,
  companyId: string,
  companyMeta: { name: string; email?: string; phone?: string }
): Promise<ProvisionResult> {
  const dbName = companyDbName(companyId)
  const baseConfig = parseConnectionUrl(adminConnectionUrl)

  await createDatabase(baseConfig, dbName)
  console.log('Database created for company: ', companyId, dbName)

  const companyKnex = createCompanyKnex(baseConfig, dbName)
  console.log('Company Knex created for company: ', companyId)

  try {
    await runCompanyMigrations(companyKnex)
    console.log('Migrations run for company: ', companyId)
    await seedCompanyPermissions(controlDb, companyKnex)
    console.log('Permissions seeded for company: ', companyId)

    const now = new Date()
    await companyKnex('company_profile').insert({
      id: companyId,
      name: companyMeta.name,
      email: companyMeta.email || null,
      phone: companyMeta.phone || null,
      status: 'active',
      created_at: now,
      updated_at: now
    })
    console.log('Company profile inserted for company: ', companyId)
  } catch (err) {
    console.error(err)
    await companyKnex.destroy()
    await dropDatabase(baseConfig, dbName)
    throw err
  }

  await companyKnex.destroy()

  return {
    companyId,
    dbName,
    dbHost: baseConfig.host,
    dbPort: baseConfig.port
  }
}

export class CompanyDbPool {
  private cache = new Map<string, Knex>()
  private baseConfig: PgConnectionConfig

  constructor(adminConnectionUrl: string) {
    this.baseConfig = parseConnectionUrl(adminConnectionUrl)
  }

  async get(
    controlDb: Knex,
    companyId: string,
    options?: { forOps?: boolean }
  ): Promise<Knex> {
    const cached = this.cache.get(companyId)
    if (cached) return cached

    const company = await controlDb('companies').where({ id: companyId }).first()
    if (!company) throw new Error(`Company not found: ${companyId}`)

    const status = company.status as string
    const allowed = options?.forOps
      ? status === 'active' || status === 'provisioning' || status === 'inactive'
      : status === 'active' || status === 'provisioning'
    if (!allowed) {
      throw new Error(`Company is not active: ${companyId}`)
    }

    const dbName = company.db_name as string
    const knex = createCompanyKnex(
      {
        host: (company.db_host as string) || this.baseConfig.host,
        port: (company.db_port as number) || this.baseConfig.port,
        user: this.baseConfig.user,
        password: this.baseConfig.password,
        database: dbName,
        ssl: this.baseConfig.ssl
      },
      dbName
    )

    this.cache.set(companyId, knex)
    return knex
  }

  async evict(companyId: string): Promise<void> {
    const knex = this.cache.get(companyId)
    if (!knex) return
    await knex.destroy()
    this.cache.delete(companyId)
  }

  async destroy(): Promise<void> {
    for (const knex of this.cache.values()) {
      await knex.destroy()
    }
    this.cache.clear()
  }
}

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

export async function teardownCompanyDatabase(
  adminConnectionUrl: string,
  companyId: string
): Promise<void> {
  const baseConfig = parseConnectionUrl(adminConnectionUrl)
  await dropDatabase(baseConfig, companyDbName(companyId))
}

export async function runCompanyMigrations(companyKnex: Knex): Promise<void> {
  await companyKnex.migrate.latest({
    directory: companyMigrationsDir(),
    loadExtensions: ['.js']
  })
}

export async function seedCompanyPermissions(
  controlDb: Knex,
  companyDb: Knex
): Promise<void> {
  const permissions = await controlDb('permissions').select('*')
  for (const perm of permissions) {
    await companyDb('permissions')
      .insert({
        id: perm.id,
        key: perm.key,
        label: perm.label,
        created_at: perm.created_at,
        updated_at: perm.updated_at
      })
      .onConflict('id')
      .ignore()
  }
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

  async get(controlDb: Knex, companyId: string): Promise<Knex> {
    const cached = this.cache.get(companyId)
    if (cached) return cached

    const company = await controlDb('companies').where({ id: companyId }).first()
    if (!company) throw new Error(`Company not found: ${companyId}`)
    if (company.status !== 'active' && company.status !== 'provisioning') {
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

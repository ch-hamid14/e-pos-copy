import type { Knex } from 'knex'
import knex from 'knex'
import path from 'path'

export type PgConnectionConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl?: boolean
}

export function parseConnectionUrl(url: string): PgConnectionConfig {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl: parsed.searchParams.get('sslmode') === 'require'
  }
}

export function buildConnectionUrl(config: PgConnectionConfig): string {
  const encUser = encodeURIComponent(config.user)
  const encPass = encodeURIComponent(config.password)
  return `postgresql://${encUser}:${encPass}@${config.host}:${config.port}/${config.database}`
}

export function createKnex(config: PgConnectionConfig, migrationsDir?: string): Knex {
  const knexConfig: Knex.Config = {
    client: 'pg',
    connection: {
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined
    },
    pool: { min: 0, max: 10 }
  }
  if (migrationsDir) {
    knexConfig.migrations = { directory: migrationsDir }
  }
  return knex(knexConfig)
}

export function createControlKnex(connectionUrl: string): Knex {
  return createKnex(parseConnectionUrl(connectionUrl))
}

export function createCompanyKnex(baseConfig: PgConnectionConfig, dbName: string): Knex {
  return createKnex({ ...baseConfig, database: dbName })
}

export function companyDbName(companyId: string): string {
  return `madix_company_${companyId.replace(/-/g, '')}`
}

export function companyMigrationsDir(): string {
  return path.join(__dirname, '../migrations/company')
}

export function controlMigrationsDir(): string {
  return path.join(__dirname, '../migrations/control')
}

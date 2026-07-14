import type { Knex } from 'knex'
import knex from 'knex'
import { companyMigrationsDir, createDatabase, dropDatabase } from '@madix/database'
import {
  adminDatabaseConfig,
  loadDatabaseConfig,
  type DatabaseConfig
} from './config'
import {
  clearActiveCompanyDbName,
  getActiveCompanyDbName,
  setActiveCompanyDbName
} from './active-company-db'
import { startSyncAfterAuth, stopSync } from '../services'
import { appState } from '../state/app-state'

let db: Knex | null = null
let dbReady = false
let connectedDatabase: string | null = null

export function isDatabaseReady(): boolean {
  return dbReady
}

export function getConnectedDatabaseName(): string | null {
  return connectedDatabase
}

export function getDb(): Knex {
  if (!db) {
    throw new Error(
      'Company database is not connected. Sign in so the POS.'
    )
  }
  return db
}

export function createKnexInstance(config: DatabaseConfig): Knex {
  return knex({
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
  })
}

async function connectAndMigrate(config: DatabaseConfig): Promise<Knex> {
  const instance = createKnexInstance(config)
  try {
    await instance.raw('SELECT 1')
    await instance.migrate.latest({
      directory: companyMigrationsDir(),
      loadExtensions: ['.js']
    })
    db = instance
    dbReady = true
    connectedDatabase = config.database
    console.log('PostgreSQL connected:', `${config.host}:${config.port}/${config.database}`)
    return db
  } catch (err) {
    await instance.destroy().catch(() => {})
    db = null
    dbReady = false
    connectedDatabase = null
    throw err
  }
}

/**
 * Boot: connect only when a company database was previously confirmed
 * (persisted active-company-db). Otherwise stay disconnected until login.
 */
export async function initDatabase(dbName?: string): Promise<Knex | null> {
  const name = dbName?.trim() || getActiveCompanyDbName() || null
  if (!name) {
    console.log('PostgreSQL: no confirmed company database — waiting for login')
    return null
  }

  const config = loadDatabaseConfig(name)
  const admin = adminDatabaseConfig()
  await createDatabase(admin, config.database)
  setActiveCompanyDbName(config.database)

  try {
    const connection = await connectAndMigrate(config)
    const appToken = appState.getToken()
    if (appToken) {
      void startSyncAfterAuth(appToken)
    }
    return connection
  } catch (err) {
    throw err
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy()
    db = null
  }
  dbReady = false
  connectedDatabase = null
}

/**
 * Connect to the confirmed online company database name.
 * No-op if already connected to that database.
 */
export async function switchLocalCompanyDatabase(dbName: string): Promise<Knex> {
  const target = dbName.trim()
  if (!target) throw new Error('Company database name is required')

  if (dbReady && connectedDatabase === target) {
    setActiveCompanyDbName(target)
    return getDb()
  }

  await stopSync()
  await closeDatabase()

  const admin = adminDatabaseConfig()
  await createDatabase(admin, target)
  setActiveCompanyDbName(target)

  return connectAndMigrate(loadDatabaseConfig(target))
}

/** Drop and recreate the confirmed local company database, then re-run migrations. */
export async function resetLocalCompanyDatabase(): Promise<void> {
  const active = getActiveCompanyDbName() || connectedDatabase
  if (!active) {
    throw new Error('No confirmed company database to reset')
  }

  appState.clearSession()
  await stopSync()
  await closeDatabase()

  const admin = adminDatabaseConfig()
  await dropDatabase(admin, active)
  await createDatabase(admin, active)
  setActiveCompanyDbName(active)
  await connectAndMigrate(loadDatabaseConfig(active))
}

/** Drop the active local company DB and clear the active-tenant pointer (proxy wipe). */
export async function wipeActiveLocalCompanyDatabase(): Promise<void> {
  const active = getActiveCompanyDbName() || connectedDatabase
  appState.clearSession()
  await stopSync()
  await closeDatabase()

  if (active) {
    const admin = adminDatabaseConfig()
    await dropDatabase(admin, active)
  }
  clearActiveCompanyDbName()
}

export async function withTransaction<T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
  const connection = getDb()
  return connection.transaction(fn)
}

export { db }

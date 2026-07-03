import type { Knex } from 'knex'
import knex from 'knex'
import { companyMigrationsDir } from '@madix/database'
import { loadDatabaseConfig, type DatabaseConfig } from './config'
import { startSyncAfterAuth } from '../services'
import { appState } from '../state/app-state'

let db: Knex | null = null
let dbReady = false

export function isDatabaseReady(): boolean {
  return dbReady
}

export function getDb(): Knex {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
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

export async function initDatabase(): Promise<Knex> {
  const config = loadDatabaseConfig()
  const instance = createKnexInstance(config)
  
  try {
    await instance.raw('SELECT 1')
    await instance.migrate.latest({
      directory: companyMigrationsDir(),
      loadExtensions: ['.js']
    })
    db = instance
    dbReady = true
    console.log('PostgreSQL connected:', `${config.host}:${config.port}/${config.database}`)
    return db
  } catch (err) {
    await instance.destroy().catch(() => { })
    db = null
    dbReady = false
    throw err
  } finally {
    const appToken = appState.getToken()
    if (appToken) {
      void startSyncAfterAuth(appToken)
    }
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy()
    db = null
  }
  dbReady = false
}

export async function withTransaction<T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
  const connection = getDb()
  return connection.transaction(fn)
}

export { db }

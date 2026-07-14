import { LOCAL_PG } from '../../common/constants/config'

export type DatabaseConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl?: boolean
}

/** Build a connection config for a confirmed company database name. */
export function loadDatabaseConfig(companyDbName: string): DatabaseConfig {
  const name = companyDbName.trim()
  if (!name) {
    throw new Error('Company database name is required')
  }
  return {
    host: LOCAL_PG.host,
    port: LOCAL_PG.port,
    user: LOCAL_PG.user,
    password: LOCAL_PG.password,
    database: name,
    ssl: LOCAL_PG.ssl
  }
}

/** Admin connection to the `postgres` maintenance database (create/drop DBs). */
export function adminDatabaseConfig(): DatabaseConfig {
  return {
    host: LOCAL_PG.host,
    port: LOCAL_PG.port,
    user: LOCAL_PG.user,
    password: LOCAL_PG.password,
    database: 'postgres',
    ssl: LOCAL_PG.ssl
  }
}

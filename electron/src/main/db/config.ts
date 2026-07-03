import { parseConnectionUrl } from '@madix/database'

export type DatabaseConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl?: boolean
}

function readEnvConfig(): DatabaseConfig {
  const url = process.env.COMPANY_DATABASE_URL || process.env.DATABASE_URL
  if (url) {
    const parsed = parseConnectionUrl(url)
    return {
      host: parsed.host,
      port: parsed.port,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      ssl: parsed.ssl
    }
  }

  const host = process.env.PG_HOST
  const port = process.env.PG_PORT
  const user = process.env.PG_USER
  const password = process.env.PG_PASSWORD
  const database = process.env.PG_DATABASE

  const missing = [
    !host && 'PG_HOST',
    !port && 'PG_PORT',
    !user && 'PG_USER',
    password === undefined && 'PG_PASSWORD',
    !database && 'PG_DATABASE'
  ].filter(Boolean)

  if (missing.length) {
    throw new Error(
      `Database env is not configured. Set COMPANY_DATABASE_URL (or DATABASE_URL), or: ${missing.join(', ')}`
    )
  }

  const config: DatabaseConfig = {
    host: host!,
    port: Number(port),
    user: user!,
    password: password!,
    database: database!
  }

  const ssl = process.env.PG_SSL ?? process.env.DATABASE_SSL
  if (ssl !== undefined) {
    config.ssl = ssl === 'true' || ssl === '1' || ssl === 'require'
  }

  return config
}

export function loadDatabaseConfig(): DatabaseConfig {
  return readEnvConfig()
}

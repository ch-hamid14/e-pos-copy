/**
 * Electron runtime config.
 * Only API_BASE_URL is read from process.env — everything else is static for local POS.
 */

export const API_BASE_URL =
  (typeof process !== 'undefined' ? process.env.API_BASE_URL?.trim() : undefined) ||
  'http://localhost:4000/api'

/** Local Postgres credentials (company database name is chosen at login). */
export const LOCAL_PG = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '12345',
  ssl: false
} as const

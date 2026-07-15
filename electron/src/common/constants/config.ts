/**
 * Electron runtime config.
 * Only API_BASE_URL is read from process.env — everything else is static for local POS.
 */

export const API_BASE_URL = "https://api.volt.madixsoft.com/api"

/** Local Postgres credentials (company database name is chosen at login). */
export const LOCAL_PG = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '12345',
  ssl: false
} as const

/** After failed refresh when back online — local work grace before forced logout. */
export const REAUTH_GRACE_MS = 5 * 60 * 1000

/** How often to poll health for offline → online transitions. */
export const RECONNECT_POLL_MS = 30_000

/** IPC event pushed from main → renderer for connectivity / reauth. */
export const AUTH_CONNECTIVITY_EVENT = 'auth:connectivity'

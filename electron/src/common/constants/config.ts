

export const API_BASE_URL =
  (typeof process !== 'undefined' ? process.env.API_BASE_URL?.trim() : undefined) ||
  'http://localhost:4000/api'

/** Must match backend JWT_SECRET for offline token verify. */
export const JWT_SECRET = 'madix-epos-dev-secret-change-in-production'

/** Local Postgres credentials (company database name is chosen at login). */
export const LOCAL_PG = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '12345',
  ssl: false
} as const

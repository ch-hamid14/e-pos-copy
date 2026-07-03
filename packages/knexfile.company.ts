import type { Knex } from 'knex'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') })

// CLI migrations against a specific company DB (COMPANY_DATABASE_URL in backend/.env)
// Uses compiled JS migrations — run `npm run build` first (or use `npm run migrate:company`).
const connection = process.env.COMPANY_DATABASE_URL
const migrationsDir = path.join(__dirname, 'dist/migrations/company')

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection,
    migrations: {
      directory: migrationsDir,
      loadExtensions: ['.js']
    }
  },
  production: {
    client: 'pg',
    connection,
    migrations: {
      directory: migrationsDir,
      loadExtensions: ['.js']
    }
  }
}

export default config

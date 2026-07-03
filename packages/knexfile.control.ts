import type { Knex } from 'knex'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') })

const connection = process.env.CONTROL_DATABASE_URL

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection,
    migrations: { directory: path.join(__dirname, 'migrations/control') }
  },
  production: {
    client: 'pg',
    connection,
    migrations: { directory: path.join(__dirname, 'migrations/control') }
  }
}

export default config

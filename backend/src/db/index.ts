import dotenv from 'dotenv'
import {
  CompanyDbPool,
  createControlKnex,
  provisionCompanyDatabase,
  teardownCompanyDatabase,
  companyDbName
} from '@madix/database'

dotenv.config()

const controlConnectionUrl = process.env.CONTROL_DATABASE_URL

if (!controlConnectionUrl) {
  throw new Error(
    'CONTROL_DATABASE_URL is not set. Copy backend/.env.example to backend/.env and configure it.'
  )
}

export const controlDb = createControlKnex(controlConnectionUrl)
export const companyDbPool = new CompanyDbPool(controlConnectionUrl)

export async function getCompanyDb(companyId: string, options?: { forOps?: boolean }) {
  return companyDbPool.get(controlDb, companyId, options)
}

export { provisionCompanyDatabase, teardownCompanyDatabase, companyDbName }

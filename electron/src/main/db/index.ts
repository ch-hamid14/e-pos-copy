export {
  getDb,
  isDatabaseReady,
  initDatabase,
  closeDatabase,
  resetLocalCompanyDatabase,
  switchLocalCompanyDatabase,
  wipeActiveLocalCompanyDatabase,
  getConnectedDatabaseName,
  withTransaction,
  createKnexInstance
} from './knex'
export { loadDatabaseConfig, adminDatabaseConfig, type DatabaseConfig } from './config'
export {
  getActiveCompanyDbName,
  setActiveCompanyDbName,
  clearActiveCompanyDbName
} from './active-company-db'

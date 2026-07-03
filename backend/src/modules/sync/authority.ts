import type { Knex } from 'knex'
import { createAuthority, type SyncAuthority } from '@madix/sync'
import { SYNC_TABLES } from '@madix/database'

const SYNC_CONFIG = {
  tables: [...SYNC_TABLES],
  pullLimit: 500
}

const authorityCache = new Map<string, SyncAuthority>()

export function getSyncAuthority(companyId: string, companyDb: Knex): SyncAuthority {
  let authority = authorityCache.get(companyId)
  if (!authority) {
    authority = createAuthority({ db: companyDb, config: SYNC_CONFIG })
    authorityCache.set(companyId, authority)
  }
  return authority
}

export { SYNC_CONFIG }

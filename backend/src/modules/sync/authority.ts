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

/** Drop cached authority after schema migrations so setup re-attaches new tables. */
export function clearSyncAuthority(companyId?: string): void {
  if (companyId) {
    authorityCache.delete(companyId)
    return
  }
  authorityCache.clear()
}

export { SYNC_CONFIG }

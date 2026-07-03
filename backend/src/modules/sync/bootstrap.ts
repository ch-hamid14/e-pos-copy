import type { Knex } from 'knex'
import { getSyncAuthority } from './authority'

/** Idempotent: enqueue pre-existing company rows into the authority sync_queue. */
export async function bootstrapCompanySync(
  companyId: string,
  companyDb: Knex
): Promise<Record<string, number>> {
  const authority = getSyncAuthority(companyId, companyDb)
  await authority.setup()
  return authority.bootstrap() as Promise<Record<string, number>>
}

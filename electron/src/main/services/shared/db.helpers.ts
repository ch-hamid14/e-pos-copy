import { objectToSnake } from '@madix/database'
import type { AuditContext } from './audit.helpers'
import { auditDelete } from './audit.helpers'

export function insertRow<T extends Record<string, unknown>>(
  table: string,
  data: T,
  trx?: import('knex').Knex.Transaction
) {
  const { getDb } = require('../../db')
  const db = getDb()
  const q = db(table)
  return (trx ? q.transacting(trx) : q).insert(objectToSnake(data)).returning('*')
}

export function softDelete(
  table: string,
  id: string,
  ctx: AuditContext,
  trx?: import('knex').Knex.Transaction
) {
  const { getDb } = require('../../db')
  const db = getDb()
  const q = db(table)
  return (trx ? q.transacting(trx) : q).where({ id }).update(auditDelete(ctx))
}

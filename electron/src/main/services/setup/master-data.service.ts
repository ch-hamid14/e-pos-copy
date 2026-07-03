import { getDb, withTransaction } from '../../db'
import { generateId } from '../../../common/utils/uuid'
import {
  type AuditContext,
  auditDelete,
  withAuditCreate,
  withAuditUpdate
} from '../shared/audit.helpers'
import { asJson, asJsonList } from '../shared/json.helpers'

type MasterTable = 'colors' | 'suppliers' | 'categories'

export function createMasterDataService(table: MasterTable) {
  return {
    async list(companyId: string, search?: string): Promise<unknown[]> {
      const q = getDb()(table)
        .where({ company_id: companyId })
        .whereNull('deleted_at')
        .orderBy('name', 'asc')
      if (search?.trim()) q.whereILike('name', `%${search.trim()}%`)
      return asJsonList(await q)
    },

    async create(
      companyId: string,
      ctx: AuditContext,
      data: { name: string; phone?: string; address?: string }
    ): Promise<unknown> {
      return withTransaction(async (transaction) => {
        const [row] = await getDb()(table)
          .transacting(transaction)
          .insert(withAuditCreate(ctx, {
            id: generateId(),
            company_id: companyId,
            name: data.name,
            ...(table === 'suppliers' ? { phone: data.phone || '', address: data.address || '' } : {}),
            created_at: new Date(),
            updated_at: new Date()
          }))
          .returning('*')

        return asJson(row)
      })
    },

    async update(
      id: string,
      _companyId: string,
      ctx: AuditContext,
      data: { name?: string; phone?: string; address?: string }
    ): Promise<unknown> {
      return withTransaction(async (transaction) => {
        const row = await getDb()(table).where({ id }).whereNull('deleted_at').first()
        if (!row) throw new Error('Record not found')

        const [updated] = await getDb()(table)
          .transacting(transaction)
          .where({ id })
          .update(withAuditUpdate(ctx, {
            ...(data.name !== undefined && { name: data.name }),
            ...(table === 'suppliers' && data.phone !== undefined && { phone: data.phone }),
            ...(table === 'suppliers' && data.address !== undefined && { address: data.address })
          }))
          .returning('*')

        return asJson(updated)
      })
    },

    async remove(id: string, _companyId: string, ctx: AuditContext): Promise<void> {
      await withTransaction(async (transaction) => {
        const row = await getDb()(table).where({ id }).whereNull('deleted_at').first()
        if (!row) throw new Error('Record not found')
        await getDb()(table)
          .transacting(transaction)
          .where({ id })
          .update(auditDelete(ctx))
      })
    }
  }
}

export const colorService = createMasterDataService('colors')
export const supplierService = createMasterDataService('suppliers')
export const categoryService = createMasterDataService('categories')

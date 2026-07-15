import { getDb, withTransaction } from '../../db'
import { generateId } from '../../../common/utils/uuid'
import {
  type AuditContext,
  auditDelete,
  withAuditCreate,
  withAuditUpdate
} from '../shared/audit.helpers'
import { asJson } from '../shared/json.helpers'

class PartService {
  async list(companyId: string, search?: string, categoryId?: string): Promise<unknown[]> {
    const q = getDb()('parts as p')
      .leftJoin('categories as c', 'p.category_id', 'c.id')
      .where({ 'p.company_id': companyId })
      .whereNull('p.deleted_at')
      .select('p.*', 'c.name as category_name')
      .orderBy('p.name', 'asc')

    if (search?.trim()) q.whereILike('p.name', `%${search.trim()}%`)
    if (categoryId) q.where({ 'p.category_id': categoryId })

    const rows = await q
    return rows.map((r) => ({
      ...asJson(r)!,
      category: r.category_name ? { name: r.category_name } : null
    }))
  }

  async create(
    companyId: string,
    ctx: AuditContext,
    data: {
      name: string
      categoryId: string
      description?: string
      defaultPurchasePrice?: number
      defaultSalePrice?: number
    }
  ): Promise<unknown> {
    return withTransaction(async (transaction) => {
      const [row] = await getDb()('parts')
        .transacting(transaction)
        .insert(
          withAuditCreate(ctx, {
            id: generateId(),
            company_id: companyId,
            category_id: data.categoryId,
            name: data.name,
            description: data.description || '',
            default_purchase_price: data.defaultPurchasePrice || 0,
            default_sale_price: data.defaultSalePrice || 0,
            created_at: new Date(),
            updated_at: new Date()
          })
        )
        .returning('*')

      return asJson(row)
    })
  }

  async update(
    id: string,
    _companyId: string,
    ctx: AuditContext,
    data: {
      name?: string
      categoryId?: string
      description?: string
      defaultPurchasePrice?: number
      defaultSalePrice?: number
    }
  ): Promise<unknown> {
    return withTransaction(async (transaction) => {
      const row = await getDb()('parts').where({ id }).whereNull('deleted_at').first()
      if (!row) throw new Error('Part not found')

      const [updated] = await getDb()('parts')
        .transacting(transaction)
        .where({ id })
        .update(
          withAuditUpdate(ctx, {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.categoryId !== undefined && { category_id: data.categoryId }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.defaultPurchasePrice !== undefined && {
              default_purchase_price: data.defaultPurchasePrice
            }),
            ...(data.defaultSalePrice !== undefined && { default_sale_price: data.defaultSalePrice })
          })
        )
        .returning('*')

      return asJson(updated)
    })
  }

  async remove(id: string, _companyId: string, ctx: AuditContext): Promise<void> {
    await withTransaction(async (transaction) => {
      const row = await getDb()('parts').where({ id }).whereNull('deleted_at').first()
      if (!row) throw new Error('Part not found')
      await getDb()('parts').transacting(transaction).where({ id }).update(auditDelete(ctx))
    })
  }

  async get(id: string): Promise<unknown> {
    const row = await getDb()('parts as p')
      .leftJoin('categories as c', 'p.category_id', 'c.id')
      .where({ 'p.id': id })
      .whereNull('p.deleted_at')
      .select('p.*', 'c.name as category_name')
      .first()
    if (!row) throw new Error('Part not found')
    return { ...asJson(row)!, category: row.category_name ? { name: row.category_name } : null }
  }
}

export const partService = new PartService()

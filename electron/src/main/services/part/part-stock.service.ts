import { getDb } from '../../db'
import { asJson } from '../shared/json.helpers'
import { previewPartFifoCost } from './part-fifo.helpers'

export type PartStockListFilters = {
  search?: string
  partId?: string
  categoryId?: string
  supplierId?: string
  fromDate?: string
  toDate?: string
  page?: number
  pageSize?: number
}

class PartStockService {
  async list(
    companyId: string,
    branchId: string,
    filters?: PartStockListFilters
  ): Promise<{ items: unknown[]; total: number }> {
    const page = Math.max(1, Number(filters?.page || 1))
    const pageSize = Math.max(1, Math.min(100, Number(filters?.pageSize || 10)))

    const base = getDb()('part_stocks as ps')
      .leftJoin('parts as p', 'ps.part_id', 'p.id')
      .leftJoin('categories as c', 'p.category_id', 'c.id')
      .where({ 'ps.company_id': companyId, 'ps.branch_id': branchId })
      .whereNull('p.deleted_at')

    if (filters?.partId) base.where({ 'ps.part_id': filters.partId })
    if (filters?.categoryId) base.where({ 'p.category_id': filters.categoryId })
    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim()}%`
      base.whereILike('p.name', term)
    }

    const needsPurchaseFilter = Boolean(
      filters?.supplierId || filters?.fromDate || filters?.toDate
    )
    if (needsPurchaseFilter) {
      base.whereExists(
        getDb()('part_purchase_lines as pl')
          .join('part_purchases as pp', 'pl.part_purchase_id', 'pp.id')
          .whereRaw('pl.part_id = ps.part_id')
          .whereNull('pl.deleted_at')
          .whereNull('pp.deleted_at')
          .where({
            'pp.company_id': companyId,
            'pp.branch_id': branchId
          })
          .modify((q) => {
            if (filters?.supplierId) q.where({ 'pp.supplier_id': filters.supplierId })
            if (filters?.fromDate) q.where('pp.purchase_date', '>=', new Date(filters.fromDate))
            if (filters?.toDate) {
              const to = new Date(filters.toDate)
              to.setHours(23, 59, 59, 999)
              q.where('pp.purchase_date', '<=', to)
            }
          })
      )
    }

    const countRow = await base.clone().countDistinct<{ count: string }>('ps.id as count').first()
    const total = Number(countRow?.count || 0)

    const rows = await base
      .clone()
      .select(
        'ps.*',
        'p.name as part_name',
        'p.category_id as part_category_id',
        'p.default_sale_price as part_default_sale_price',
        'c.name as category_name'
      )
      .orderBy('p.name', 'asc')
      .offset((page - 1) * pageSize)
      .limit(pageSize)

    return {
      total,
      items: rows.map((r) => ({
        ...asJson(r)!,
        part: r.part_name
          ? {
              id: r.part_id,
              name: r.part_name,
              categoryId: r.part_category_id,
              defaultSalePrice: Number(r.part_default_sale_price || 0)
            }
          : null,
        category: r.category_name ? { name: r.category_name } : null,
        sellingPrice: Number(r.selling_price || r.part_default_sale_price || 0),
        averageCost: Number(r.average_cost || 0)
      }))
    }
  }

  async detail(companyId: string, branchId: string, partId: string): Promise<unknown> {
    const part = await getDb()('parts as p')
      .leftJoin('categories as c', 'p.category_id', 'c.id')
      .where({ 'p.id': partId, 'p.company_id': companyId })
      .whereNull('p.deleted_at')
      .select('p.*', 'c.name as category_name')
      .first()
    if (!part) throw new Error('Part not found')

    const stock = await getDb()('part_stocks')
      .where({ company_id: companyId, branch_id: branchId, part_id: partId })
      .first()

    const movements = await getDb()('part_stock_movements')
      .where({ company_id: companyId, branch_id: branchId, part_id: partId })
      .orderBy('created_at', 'desc')
      .limit(100)

    return {
      part: {
        ...asJson(part)!,
        category: part.category_name ? { name: part.category_name } : null
      },
      stock: stock
        ? {
            ...asJson(stock)!,
            sellingPrice: Number(stock.selling_price || 0),
            averageCost: Number(stock.average_cost || 0)
          }
        : {
            companyId,
            branchId,
            partId,
            quantityOnHand: 0,
            sellingPrice: Number(part.default_sale_price || 0),
            averageCost: Number(part.default_purchase_price || 0)
          },
      movements: movements.map((m) => asJson(m)!)
    }
  }

  async fifoPreview(
    companyId: string,
    branchId: string,
    partId: string,
    quantity = 1
  ): Promise<unknown> {
    const qty = Math.max(1, Math.floor(Number(quantity)))
    return previewPartFifoCost(getDb(), companyId, branchId, partId, qty)
  }
}

export const partStockService = new PartStockService()

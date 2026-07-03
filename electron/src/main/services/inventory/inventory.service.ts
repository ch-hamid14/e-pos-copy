import {
  MovementType,
  ProductItemStatus
} from '@madix/database'
import { getDb, withTransaction } from '../../db'
import { generateId } from '../../../common/utils/uuid'
import { asJsonList, asProductItemJson } from '../shared/json.helpers'
import {
  type AuditContext,
  auditCreate,
  auditUpdate
} from '../shared/audit.helpers'

export type StockFilters = {
  status?: string
  search?: string
  productId?: string
  categoryId?: string
  colorId?: string
  fromDate?: string
  toDate?: string
  page?: number
  pageSize?: number
}

class InventoryService {
  private applyFilters(
    q: ReturnType<ReturnType<typeof getDb>>,
    companyId: string,
    branchId: string,
    filters?: StockFilters
  ) {
    q.where({ 'pi.company_id': companyId, 'pi.current_branch_id': branchId }).whereNull('pi.deleted_at')
    if (filters?.status) q.where({ 'pi.status': filters.status })
    if (filters?.productId) q.where({ 'pi.product_id': filters.productId })
    if (filters?.categoryId) q.where({ 'pi.category_id': filters.categoryId })
    if (filters?.colorId) q.where({ 'pi.color_id': filters.colorId })
    if (filters?.fromDate) q.where('pi.purchased_at', '>=', new Date(filters.fromDate))
    if (filters?.toDate) {
      const to = new Date(filters.toDate)
      to.setHours(23, 59, 59, 999)
      q.where('pi.purchased_at', '<=', to)
    }
    if (filters?.search?.trim()) q.whereILike('pi.serial_number', `%${filters.search.trim()}%`)
    return q
  }

  async listItems(
    companyId: string,
    branchId: string,
    filters?: StockFilters
  ): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, Number(filters?.page || 1))
    const pageSize = Math.min(100, Math.max(1, Number(filters?.pageSize || 10)))

    const base = getDb()('product_items as pi')
      .leftJoin('products as pr', 'pi.product_id', 'pr.id')
      .leftJoin('categories as c', 'pi.category_id', 'c.id')
      .leftJoin('colors as co', 'pi.color_id', 'co.id')

    this.applyFilters(base, companyId, branchId, filters)

    const countResult = await base.clone().count('* as count')
    const total = Number(countResult[0]?.count || 0)

    const rows = await base
      .select('pi.*', 'pr.name as product_name', 'c.name as category_name', 'co.name as color_name')
      .orderBy('pi.purchased_at', 'desc')
      .orderBy('pi.created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return { items: rows.map((r) => asProductItemJson(r)), total, page, pageSize }
  }

  async searchAvailable(companyId: string, branchId: string, query: string): Promise<unknown[]> {
    const rows = await getDb()('product_items as pi')
      .leftJoin('products as pr', 'pi.product_id', 'pr.id')
      .leftJoin('categories as c', 'pi.category_id', 'c.id')
      .leftJoin('colors as co', 'pi.color_id', 'co.id')
      .where({
        'pi.company_id': companyId,
        'pi.current_branch_id': branchId,
        'pi.status': ProductItemStatus.IN_STOCK
      })
      .whereNull('pi.deleted_at')
      .whereILike('pi.serial_number', `%${query.trim()}%`)
      .select('pi.*', 'pr.name as product_name', 'c.name as category_name', 'co.name as color_name')
      .limit(20)
      .orderBy('pi.serial_number', 'asc')

    return rows.map((r) => asProductItemJson(r))
  }

  async getItemDetail(id: string): Promise<unknown> {
    const item = await getDb()('product_items as pi')
      .leftJoin('products as pr', 'pi.product_id', 'pr.id')
      .leftJoin('categories as c', 'pi.category_id', 'c.id')
      .leftJoin('colors as co', 'pi.color_id', 'co.id')
      .leftJoin('purchases as pu', 'pi.purchase_id', 'pu.id')
      .leftJoin('suppliers as s', 'pu.supplier_id', 's.id')
      .where({ 'pi.id': id })
      .select('pi.*', 'pr.name as product_name', 'c.name as category_name', 'co.name as color_name', 's.name as supplier_name')
      .first()

    if (!item) throw new Error('Unit not found')

    const movements = await getDb()('inventory_movements')
      .where({ product_item_id: id })
      .orderBy('created_at', 'asc')

    return { item: asProductItemJson(item), movements: asJsonList(movements) }
  }

  async transfer(
    companyId: string,
    ctx: AuditContext,
    payload: { fromBranchId: string; toBranchId: string; productItemIds: string[] }
  ): Promise<unknown> {
    if (!payload.productItemIds?.length) throw new Error('Select at least one unit')
    if (payload.fromBranchId === payload.toBranchId) throw new Error('Select a different branch')

    const movementAudit = auditCreate(ctx)

    return withTransaction(async (transaction) => {
      const transferred: string[] = []
      for (const itemId of payload.productItemIds) {
        const item = await getDb()('product_items').transacting(transaction).where({ id: itemId }).first()
        if (!item || item.company_id !== companyId) throw new Error('Unit not found')
        if (item.current_branch_id !== payload.fromBranchId) {
          throw new Error(`Serial ${item.serial_number} is not at the source branch`)
        }
        if (item.status !== ProductItemStatus.IN_STOCK) {
          throw new Error(`Serial ${item.serial_number} is not available for transfer`)
        }

        await getDb()('product_items').transacting(transaction).where({ id: itemId }).update({
          current_branch_id: payload.toBranchId,
          branch_id: payload.toBranchId,
          version: Number(item.version || 1) + 1,
          ...auditUpdate(ctx)
        })

        await getDb()('inventory_movements').transacting(transaction).insert({
          id: generateId(),
          company_id: companyId,
          product_item_id: itemId,
          movement_type: MovementType.TRANSFER,
          from_branch_id: payload.fromBranchId,
          to_branch_id: payload.toBranchId,
          reference_type: 'transfer',
          reference_id: itemId,
          ...movementAudit,
          created_at: new Date()
        })

        transferred.push(item.serial_number as string)
      }
      return { transferred, count: transferred.length }
    })
  }

  async adjust(
    companyId: string,
    ctx: AuditContext,
    payload: { branchId: string; productItemIds: string[]; status: string; notes?: string }
  ): Promise<unknown> {
    const allowed = [
      ProductItemStatus.IN_STOCK,
      ProductItemStatus.RETURNED,
      ProductItemStatus.DAMAGED,
      ProductItemStatus.IN_SERVICE
    ]
    if (!allowed.includes(payload.status as ProductItemStatus)) throw new Error('Invalid status')
    if (!payload.productItemIds?.length) throw new Error('Select at least one unit')

    const movementAudit = auditCreate(ctx)

    return withTransaction(async (transaction) => {
      const adjusted: string[] = []
      for (const itemId of payload.productItemIds) {
        const item = await getDb()('product_items').transacting(transaction).where({ id: itemId }).first()
        if (!item || item.company_id !== companyId) throw new Error('Unit not found')
        if (item.current_branch_id !== payload.branchId) {
          throw new Error(`Serial ${item.serial_number} is not at this branch`)
        }
        if (item.status === ProductItemStatus.SOLD) {
          throw new Error(`Cannot adjust sold unit ${item.serial_number}`)
        }

        await getDb()('product_items').transacting(transaction).where({ id: itemId }).update({
          status: payload.status,
          version: Number(item.version || 1) + 1,
          ...auditUpdate(ctx)
        })

        await getDb()('inventory_movements').transacting(transaction).insert({
          id: generateId(),
          company_id: companyId,
          product_item_id: itemId,
          movement_type: MovementType.ADJUSTMENT,
          from_branch_id: payload.branchId,
          reference_type: 'adjustment',
          reference_id: itemId,
          notes: payload.notes || '',
          ...movementAudit,
          created_at: new Date()
        })

        adjusted.push(item.serial_number as string)
      }
      return { adjusted, count: adjusted.length }
    })
  }
}

export const inventoryService = new InventoryService()

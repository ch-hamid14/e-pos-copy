import {
  MovementType,
  ProductItemStatus
} from '@madix/database'
import { getDb, withTransaction } from '../../db'
import { generateId } from '../../../common/utils/uuid'
import { asJson, asProductItemJson } from '../shared/json.helpers'
import {
  AUDIT_USER_SELECT,
  type AuditContext,
  applyStaffScope,
  auditCreate,
  enrichAuditUsers,
  joinAuditUsers,
  withAuditCreateWithDevice
} from '../shared/audit.helpers'

export type PurchaseLineInput = {
  motorNumber?: string
  serialNumber: string
  productId: string
  colorId?: string
  purchasePrice: number
  sellingPrice?: number
  warrantyActive?: boolean
  warrantyExpiryDate?: string
}

export type CreatePurchasePayload = {
  supplierId: string
  purchaseDate: string
  notes?: string
  lines: PurchaseLineInput[]
}

export type PurchaseListFilters = {
  supplierId?: string
  search?: string
  fromDate?: string
  toDate?: string
  sortField?: string
  sortOrder?: string
}

class PurchaseService {
  async list(companyId: string, branchId?: string, ctx?: AuditContext | null, filters?: PurchaseListFilters): Promise<unknown[]> {
    let q = getDb()('purchases as p')
      .leftJoin('suppliers as s', 'p.supplier_id', 's.id')
      .where({ 'p.company_id': companyId })
      .whereNull('p.deleted_at')
    joinAuditUsers(q, 'p')
    q = applyStaffScope(q, ctx ?? null, 'p.created_by', 'p.branch_id')
    q.select('p.*', 's.name as supplier_name', ...AUDIT_USER_SELECT)
      .orderBy('p.purchase_date', 'desc')
      .orderBy('p.created_at', 'desc')

    if (branchId) q.where({ 'p.branch_id': branchId })
    if (filters?.supplierId) q.where({ 'p.supplier_id': filters.supplierId })
    if (filters?.fromDate) q.where('p.purchase_date', '>=', new Date(filters.fromDate))
    if (filters?.toDate) {
      const to = new Date(filters.toDate)
      to.setHours(23, 59, 59, 999)
      q.where('p.purchase_date', '<=', to)
    }

    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim()}%`
      q.whereExists(
        getDb()('product_items as pi')
          .whereRaw('pi.purchase_id = p.id')
          .whereNull('pi.deleted_at')
          .where((builder) => {
            builder.whereILike('pi.serial_number', term).orWhereILike('pi.motor_number', term)
          })
      )
    }

    q.orderBy('p.purchase_date', 'desc').orderBy('p.created_at', 'desc')

    const purchases = await q
    let result: Record<string, unknown>[] = []

    for (const purchase of purchases) {
      const items = await getDb()('product_items').where({ purchase_id: purchase.id })
      const totalValue = items.reduce((sum, item) => sum + Number(item.purchase_price), 0)
      result.push({
        ...enrichAuditUsers(purchase),
        supplier: purchase.supplier_name ? { name: purchase.supplier_name } : null,
        itemCount: items.length,
        totalValue
      })
    }

    if (filters?.sortField === 'totalValue') {
      const order = filters.sortOrder === 'asc' ? 'asc' : 'desc'
      result.sort((a, b) => {
        const diff = Number(a.totalValue) - Number(b.totalValue)
        return order === 'asc' ? diff : -diff
      })
    }

    return result
  }

  async get(id: string): Promise<unknown> {
    let q = getDb()('purchases as p')
      .leftJoin('suppliers as s', 'p.supplier_id', 's.id')
      .where({ 'p.id': id })
      .whereNull('p.deleted_at')
    joinAuditUsers(q, 'p')
    const purchase = await q.select('p.*', 's.name as supplier_name', ...AUDIT_USER_SELECT).first()
    if (!purchase) throw new Error('Purchase not found')

    const items = await getDb()('product_items as pi')
      .leftJoin('products as pr', 'pi.product_id', 'pr.id')
      .leftJoin('categories as c', 'pi.category_id', 'c.id')
      .leftJoin('colors as co', 'pi.color_id', 'co.id')
      .where({ 'pi.purchase_id': id })
      .select('pi.*', 'pr.name as product_name', 'c.name as category_name', 'co.name as color_name')
      .orderBy('pi.serial_number', 'asc')

    return {
      purchase: { ...asJson(purchase)!, supplier: purchase.supplier_name ? { name: purchase.supplier_name } : null },
      items: items.map((i) => asProductItemJson(i))
    }
  }

  async create(
    companyId: string,
    branchId: string,
    ctx: AuditContext,
    payload: CreatePurchasePayload
  ): Promise<unknown> {
    if (!payload.lines?.length) throw new Error('Add at least one unit')
    if (!payload.supplierId) throw new Error('Select a supplier')

    const serials = payload.lines.map((l) => l.serialNumber.trim())
    if (serials.some((s) => !s)) throw new Error('Serial number is required for every line')
    if (new Set(serials).size !== serials.length) throw new Error('Duplicate serial numbers in this purchase')

    const existing = await getDb()('product_items')
      .where({ company_id: companyId })
      .whereIn('serial_number', serials)
      .whereNull('deleted_at')
    if (existing.length) {
      throw new Error(`Serial already exists: ${existing[0].serial_number}`)
    }

    return withTransaction(async (transaction) => {
      const purchaseDate = new Date(payload.purchaseDate)
      const itemAudit = auditCreate(ctx)
      const [purchase] = await getDb()('purchases')
        .transacting(transaction)
        .insert(withAuditCreateWithDevice(ctx, {
          id: generateId(),
          company_id: companyId,
          branch_id: branchId,
          supplier_id: payload.supplierId,
          purchase_date: purchaseDate,
          notes: payload.notes || '',
          created_at: new Date(),
          updated_at: new Date()
        }))
        .returning('*')

      const purchaseId = purchase.id as string
      const createdItems: Record<string, unknown>[] = []

      for (const line of payload.lines) {
        const product = await getDb()('products')
          .transacting(transaction)
          .where({ id: line.productId, company_id: companyId })
          .whereNull('deleted_at')
          .first()
        if (!product) throw new Error('Invalid product selected')

        const warrantyActive = Boolean(line.warrantyActive)
        const warrantyExpiry =
          warrantyActive && line.warrantyExpiryDate ? new Date(line.warrantyExpiryDate) : null
        if (warrantyActive && !warrantyExpiry) {
          throw new Error(`Warranty expiry required for serial ${line.serialNumber}`)
        }

        const [item] = await getDb()('product_items')
          .transacting(transaction)
          .insert({
            id: generateId(),
            company_id: companyId,
            branch_id: branchId,
            current_branch_id: branchId,
            purchase_id: purchaseId,
            product_id: line.productId,
            category_id: product.category_id,
            color_id: line.colorId || null,
            motor_number: line.motorNumber?.trim() || null,
            serial_number: line.serialNumber.trim(),
            purchase_price: Number(line.purchasePrice || 0),
            selling_price: Number(line.sellingPrice ?? line.purchasePrice ?? 0),
            status: ProductItemStatus.IN_STOCK,
            warranty_active: warrantyActive,
            warranty_expiry_date: warrantyExpiry,
            purchased_at: purchaseDate,
            version: 1,
            ...itemAudit,
            created_at: new Date(),
            updated_at: new Date()
          })
          .returning('*')

        await getDb()('inventory_movements').transacting(transaction).insert({
          id: generateId(),
          company_id: companyId,
          product_item_id: item.id,
          movement_type: MovementType.PURCHASE,
          to_branch_id: branchId,
          reference_type: 'purchase',
          reference_id: purchaseId,
          ...itemAudit,
          created_at: new Date()
        })

        createdItems.push(item)
      }

      return { purchase, items: createdItems }
    })
  }
}

export const purchaseService = new PurchaseService()

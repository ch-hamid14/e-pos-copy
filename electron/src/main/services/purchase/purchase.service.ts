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
  auditDelete,
  auditUpdate,
  enrichAuditUsers,
  joinAuditUsers,
  withAuditCreateWithDevice,
  withAuditUpdate
} from '../shared/audit.helpers'

export type PurchaseLineInput = {
  id?: string
  motorNumber?: string
  serialNumber: string
  productId: string
  colorId?: string
  purchasePrice: number
  sellingPrice?: number
  specialDiscount?: number
  specialDiscountType?: 'pkr' | 'percent'
  warrantyActive?: boolean
  warrantyExpiryDate?: string
}

function lineSpecialDiscount(line: PurchaseLineInput): { discount: number; type: 'pkr' | 'percent' } {
  return {
    discount: Number(line.specialDiscount || 0),
    type: line.specialDiscountType === 'percent' ? 'percent' : 'pkr'
  }
}

function assertRetailNotBelowNet(
  netCost: number,
  retail: number,
  context?: string
): void {
  if (retail < netCost) {
    throw new Error(
      context
        ? `${context}: retail price cannot be less than net cost`
        : 'Retail price cannot be less than net cost'
    )
  }
}

export type CreatePurchasePayload = {
  supplierId: string
  purchaseDate: string
  notes?: string
  specialDiscount?: number
  specialDiscountType?: 'pkr' | 'percent'
  lines: PurchaseLineInput[]
}

export type UpdatePurchasePayload = CreatePurchasePayload

function purchaseEditable(items: { status?: string }[]): boolean {
  return items.some((item) => item.status === ProductItemStatus.IN_STOCK)
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
      const items = await getDb()('product_items')
        .where({ purchase_id: purchase.id })
        .whereNull('deleted_at')
      const totalValue = items.reduce((sum, item) => sum + Number(item.purchase_price), 0)
      result.push({
        ...enrichAuditUsers(purchase),
        supplier: purchase.supplier_name ? { name: purchase.supplier_name } : null,
        itemCount: items.length,
        totalValue,
        editable: purchaseEditable(items)
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
    const purchase = await q
      .select(
        'p.*',
        's.name as supplier_name',
        's.discount as supplier_discount',
        's.discount_type as supplier_discount_type',
        ...AUDIT_USER_SELECT
      )
      .first()
    if (!purchase) throw new Error('Purchase not found')

    const items = await getDb()('product_items as pi')
      .leftJoin('products as pr', 'pi.product_id', 'pr.id')
      .leftJoin('categories as c', 'pi.category_id', 'c.id')
      .leftJoin('colors as co', 'pi.color_id', 'co.id')
      .where({ 'pi.purchase_id': id })
      .whereNull('pi.deleted_at')
      .select('pi.*', 'pr.name as product_name', 'c.name as category_name', 'co.name as color_name')
      .orderBy('pi.serial_number', 'asc')

    return {
      purchase: {
        ...asJson(purchase)!,
        supplier: purchase.supplier_name
          ? {
              name: purchase.supplier_name,
              discount: Number(purchase.supplier_discount || 0),
              discountType: purchase.supplier_discount_type === 'percent' ? 'percent' : 'pkr'
            }
          : null,
        editable: purchaseEditable(items)
      },
      items: items.map((i) => asProductItemJson(i)),
      editable: purchaseEditable(items)
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
      const specialDiscount = Number(payload.specialDiscount || 0)
      const specialDiscountType = payload.specialDiscountType === 'percent' ? 'percent' : 'pkr'
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
          special_discount: specialDiscount,
          special_discount_type: specialDiscountType,
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

        const special = lineSpecialDiscount(line)
        const netCost = Number(line.purchasePrice || 0)
        const retail = Number(line.sellingPrice ?? line.purchasePrice ?? 0)
        assertRetailNotBelowNet(netCost, retail, `Serial ${line.serialNumber.trim()}`)

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
            purchase_price: netCost,
            selling_price: retail,
            special_discount: special.discount,
            special_discount_type: special.type,
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

  async update(
    id: string,
    companyId: string,
    branchId: string,
    ctx: AuditContext,
    payload: UpdatePurchasePayload
  ): Promise<unknown> {
    if (!payload.lines?.length) throw new Error('Add at least one unit')
    if (!payload.supplierId) throw new Error('Select a supplier')

    const serials = payload.lines.map((l) => l.serialNumber.trim())
    if (serials.some((s) => !s)) throw new Error('Serial number is required for every line')
    if (new Set(serials).size !== serials.length) throw new Error('Duplicate serial numbers in this purchase')

    return withTransaction(async (transaction) => {
      const purchase = await getDb()('purchases')
        .transacting(transaction)
        .where({ id, company_id: companyId, branch_id: branchId })
        .whereNull('deleted_at')
        .first()
      if (!purchase) throw new Error('Purchase not found')

      const existingItems = await getDb()('product_items')
        .transacting(transaction)
        .where({ purchase_id: id })
        .whereNull('deleted_at')

      if (!purchaseEditable(existingItems)) {
        throw new Error('No in-stock units left to edit on this purchase')
      }

      const existingById = new Map(existingItems.map((item) => [item.id as string, item]))
      const lockedItems = existingItems.filter((item) => item.status !== ProductItemStatus.IN_STOCK)
      const payloadIds = new Set(
        payload.lines.map((line) => line.id).filter((lineId): lineId is string => Boolean(lineId))
      )

      for (const locked of lockedItems) {
        if (!payloadIds.has(locked.id as string)) {
          throw new Error(
            `Cannot remove unit ${locked.serial_number} — it is ${String(locked.status).replace(/_/g, ' ')}`
          )
        }
      }

      for (const lineId of payloadIds) {
        if (!existingById.has(lineId)) {
          throw new Error('One or more units no longer belong to this purchase')
        }
      }

      const serialConflict = await getDb()('product_items')
        .transacting(transaction)
        .where({ company_id: companyId })
        .whereIn('serial_number', serials)
        .whereNull('deleted_at')
        .whereNot('purchase_id', id)
      if (serialConflict.length) {
        throw new Error(`Serial already exists: ${serialConflict[0].serial_number}`)
      }

      const purchaseDate = new Date(payload.purchaseDate)
      const specialDiscount = Number(payload.specialDiscount || 0)
      const specialDiscountType = payload.specialDiscountType === 'percent' ? 'percent' : 'pkr'

      const [updatedPurchase] = await getDb()('purchases')
        .transacting(transaction)
        .where({ id })
        .update(
          withAuditUpdate(ctx, {
            supplier_id: payload.supplierId,
            purchase_date: purchaseDate,
            notes: payload.notes || '',
            special_discount: specialDiscount,
            special_discount_type: specialDiscountType
          })
        )
        .returning('*')

      // Only in-stock units may be removed from the purchase
      for (const item of existingItems) {
        if (item.status !== ProductItemStatus.IN_STOCK) continue
        if (payloadIds.has(item.id as string)) continue

        const removed = await getDb()('product_items')
          .transacting(transaction)
          .where({ id: item.id, status: ProductItemStatus.IN_STOCK })
          .whereNull('deleted_at')
          .update({
            ...auditDelete(ctx),
            // Free the unique serial so it can be reused later if needed
            serial_number: `${item.serial_number}__del__${item.id}`
          })
        if (!removed) {
          throw new Error(
            `Only in-stock units can be removed. Serial ${item.serial_number} is no longer in stock`
          )
        }
      }

      const itemAudit = auditCreate(ctx)
      const savedItems: Record<string, unknown>[] = []

      for (const line of payload.lines) {
        if (line.id) {
          const existing = existingById.get(line.id)
          if (!existing) throw new Error('One or more units no longer belong to this purchase')

          // Sold / reserved / etc. units stay on the purchase unchanged
          if (existing.status !== ProductItemStatus.IN_STOCK) {
            savedItems.push(existing)
            continue
          }

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

          const special = lineSpecialDiscount(line)
          const netCost = Number(line.purchasePrice || 0)
          const retail = Number(line.sellingPrice ?? line.purchasePrice ?? 0)
          assertRetailNotBelowNet(netCost, retail, `Serial ${line.serialNumber.trim()}`)

          const [updated] = await getDb()('product_items')
            .transacting(transaction)
            .where({ id: line.id, purchase_id: id, status: ProductItemStatus.IN_STOCK })
            .whereNull('deleted_at')
            .update({
              product_id: line.productId,
              category_id: product.category_id,
              color_id: line.colorId || null,
              motor_number: line.motorNumber?.trim() || null,
              serial_number: line.serialNumber.trim(),
              purchase_price: netCost,
              selling_price: retail,
              special_discount: special.discount,
              special_discount_type: special.type,
              warranty_active: warrantyActive,
              warranty_expiry_date: warrantyExpiry,
              purchased_at: purchaseDate,
              ...auditUpdate(ctx)
            })
            .returning('*')
          if (!updated) {
            throw new Error(
              `Only in-stock units can be edited. Serial ${line.serialNumber} is no longer in stock`
            )
          }
          savedItems.push(updated)
          continue
        }

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

        const special = lineSpecialDiscount(line)
        const netCost = Number(line.purchasePrice || 0)
        const retail = Number(line.sellingPrice ?? line.purchasePrice ?? 0)
        assertRetailNotBelowNet(netCost, retail, `Serial ${line.serialNumber.trim()}`)

        const [item] = await getDb()('product_items')
          .transacting(transaction)
          .insert({
            id: generateId(),
            company_id: companyId,
            branch_id: branchId,
            current_branch_id: branchId,
            purchase_id: id,
            product_id: line.productId,
            category_id: product.category_id,
            color_id: line.colorId || null,
            motor_number: line.motorNumber?.trim() || null,
            serial_number: line.serialNumber.trim(),
            purchase_price: netCost,
            selling_price: retail,
            special_discount: special.discount,
            special_discount_type: special.type,
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
          reference_id: id,
          ...itemAudit,
          created_at: new Date()
        })

        savedItems.push(item)
      }

      return {
        purchase: updatedPurchase,
        items: savedItems,
        editable: purchaseEditable(savedItems as { status?: string }[])
      }
    })
  }
}

export const purchaseService = new PurchaseService()

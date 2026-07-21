import { MovementType } from '@madix/database'
import { getDb, withTransaction } from '../../db'
import { generateId } from '../../../common/utils/uuid'
import { asJson } from '../shared/json.helpers'
import {
  AUDIT_USER_SELECT,
  type AuditContext,
  applyStaffScope,
  auditCreate,
  auditDelete,
  enrichAuditUsers,
  joinAuditUsers,
  withAuditCreateWithDevice,
  withAuditUpdate
} from '../shared/audit.helpers'
import { applyPartStockDelta } from './part-stock.helpers'

export type PartPurchaseLineInput = {
  id?: string
  partId: string
  quantity: number
  /** Net unit cost after discounts (what we pay). */
  unitCost: number
  /** Retail / selling unit price. */
  unitSalePrice?: number
  specialDiscount?: number
  specialDiscountType?: 'pkr' | 'percent'
}

export type CreatePartPurchasePayload = {
  supplierId: string
  purchaseDate: string
  notes?: string
  lines: PartPurchaseLineInput[]
}

export type UpdatePartPurchasePayload = CreatePartPurchasePayload

export type PartPurchaseListFilters = {
  supplierId?: string
  search?: string
  fromDate?: string
  toDate?: string
  sortField?: string
  sortOrder?: string
}

function normalizeLines(lines: PartPurchaseLineInput[]): PartPurchaseLineInput[] {
  if (!lines?.length) throw new Error('Add at least one part line')
  return lines.map((line) => {
    const quantity = Math.floor(Number(line.quantity))
    if (!line.partId) throw new Error('Select a part for every line')
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Quantity must be a positive whole number')
    }
    const unitCost = Number(line.unitCost || 0)
    const unitSalePrice = Number(
      line.unitSalePrice !== undefined ? line.unitSalePrice : unitCost
    )
    if (unitSalePrice < unitCost) {
      throw new Error('Retail price cannot be less than net cost')
    }
    return {
      ...line,
      quantity,
      unitCost,
      unitSalePrice,
      specialDiscount: Number(line.specialDiscount || 0),
      specialDiscountType: line.specialDiscountType === 'percent' ? 'percent' : 'pkr'
    }
  })
}

class PartPurchaseService {
  async list(
    companyId: string,
    branchId?: string,
    ctx?: AuditContext | null,
    filters?: PartPurchaseListFilters
  ): Promise<unknown[]> {
    let q = getDb()('part_purchases as p')
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
        getDb()('part_purchase_lines as pl')
          .leftJoin('parts as pt', 'pl.part_id', 'pt.id')
          .whereRaw('pl.part_purchase_id = p.id')
          .whereNull('pl.deleted_at')
          .whereILike('pt.name', term)
      )
    }

    const purchases = await q
    let result: Record<string, unknown>[] = []

    for (const purchase of purchases) {
      const lines = await getDb()('part_purchase_lines')
        .where({ part_purchase_id: purchase.id })
        .whereNull('deleted_at')
      const totalUnits = lines.reduce((sum, line) => sum + Number(line.quantity), 0)
      const totalValue = lines.reduce(
        (sum, line) => sum + Number(line.quantity) * Number(line.unit_cost),
        0
      )
      result.push({
        ...enrichAuditUsers(purchase),
        supplier: purchase.supplier_name ? { name: purchase.supplier_name } : null,
        lineCount: lines.length,
        totalUnits,
        totalValue,
        editable: true
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
    let q = getDb()('part_purchases as p')
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
    if (!purchase) throw new Error('Parts purchase not found')

    const lines = await getDb()('part_purchase_lines as pl')
      .leftJoin('parts as pt', 'pl.part_id', 'pt.id')
      .leftJoin('categories as c', 'pl.category_id', 'c.id')
      .where({ 'pl.part_purchase_id': id })
      .whereNull('pl.deleted_at')
      .select('pl.*', 'pt.name as part_name', 'c.name as category_name')
      .orderBy('pt.name', 'asc')

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
        editable: true
      },
      lines: lines.map((line) => ({
        ...asJson(line)!,
        part: line.part_name ? { name: line.part_name } : null,
        category: line.category_name ? { name: line.category_name } : null,
        lineTotal: Number(line.quantity) * Number(line.unit_cost)
      })),
      editable: true
    }
  }

  async create(
    companyId: string,
    branchId: string,
    ctx: AuditContext,
    payload: CreatePartPurchasePayload
  ): Promise<unknown> {
    if (!payload.supplierId) throw new Error('Select a supplier')
    const lines = normalizeLines(payload.lines)

    return withTransaction(async (transaction) => {
      const purchaseDate = new Date(payload.purchaseDate)
      const lineAudit = auditCreate(ctx)
      const [purchase] = await getDb()('part_purchases')
        .transacting(transaction)
        .insert(
          withAuditCreateWithDevice(ctx, {
            id: generateId(),
            company_id: companyId,
            branch_id: branchId,
            supplier_id: payload.supplierId,
            purchase_date: purchaseDate,
            notes: payload.notes || '',
            created_at: new Date(),
            updated_at: new Date()
          })
        )
        .returning('*')

      const purchaseId = purchase.id as string
      const createdLines: Record<string, unknown>[] = []

      for (const line of lines) {
        const part = await getDb()('parts')
          .transacting(transaction)
          .where({ id: line.partId, company_id: companyId })
          .whereNull('deleted_at')
          .first()
        if (!part) throw new Error('Invalid part selected')

        const [created] = await getDb()('part_purchase_lines')
          .transacting(transaction)
          .insert({
            id: generateId(),
            company_id: companyId,
            part_purchase_id: purchaseId,
            part_id: line.partId,
            category_id: part.category_id,
            quantity: line.quantity,
            quantity_remaining: line.quantity,
            unit_cost: line.unitCost,
            unit_sale_price: line.unitSalePrice ?? line.unitCost,
            special_discount: line.specialDiscount || 0,
            special_discount_type: line.specialDiscountType || 'pkr',
            ...lineAudit,
            created_at: new Date(),
            updated_at: new Date()
          })
          .returning('*')

        await applyPartStockDelta(transaction, {
          companyId,
          branchId,
          partId: line.partId,
          deltaQty: line.quantity,
          movementType: MovementType.PURCHASE,
          referenceType: 'part_purchase',
          referenceId: purchaseId,
          unitCost: line.unitCost,
          sellingPrice: line.unitSalePrice ?? line.unitCost,
          ctx
        })

        await getDb()('parts')
          .transacting(transaction)
          .where({ id: line.partId })
          .update(
            withAuditUpdate(ctx, {
              default_purchase_price: line.unitCost,
              default_sale_price: line.unitSalePrice ?? line.unitCost
            })
          )

        createdLines.push(created)
      }

      return {
        purchase: asJson(purchase),
        lines: createdLines.map((line) => asJson(line)!)
      }
    })
  }

  async update(
    id: string,
    companyId: string,
    branchId: string,
    ctx: AuditContext,
    payload: UpdatePartPurchasePayload
  ): Promise<unknown> {
    if (!payload.supplierId) throw new Error('Select a supplier')
    const nextLines = normalizeLines(payload.lines)

    return withTransaction(async (transaction) => {
      const purchase = await getDb()('part_purchases')
        .transacting(transaction)
        .where({ id, company_id: companyId })
        .whereNull('deleted_at')
        .first()
      if (!purchase) throw new Error('Parts purchase not found')
      if (purchase.branch_id !== branchId) {
        throw new Error('Parts purchase belongs to another branch')
      }

      const existingLines = await getDb()('part_purchase_lines')
        .transacting(transaction)
        .where({ part_purchase_id: id })
        .whereNull('deleted_at')

      const existingById = new Map(existingLines.map((line) => [line.id as string, line]))
      const keepIds = new Set(nextLines.filter((l) => l.id).map((l) => l.id as string))

      // Reverse removed lines
      for (const existing of existingLines) {
        if (keepIds.has(existing.id as string)) continue
        const remaining = Number(existing.quantity_remaining ?? existing.quantity)
        const sold = Number(existing.quantity) - remaining
        if (sold > 0) {
          throw new Error(
            'Cannot remove a purchase line — units from this purchase have already been sold'
          )
        }
        await applyPartStockDelta(transaction, {
          companyId,
          branchId,
          partId: existing.part_id as string,
          deltaQty: -Number(existing.quantity),
          movementType: MovementType.ADJUSTMENT,
          referenceType: 'part_purchase',
          referenceId: id,
          notes: 'Removed from parts purchase edit',
          ctx
        })
        await getDb()('part_purchase_lines')
          .transacting(transaction)
          .where({ id: existing.id })
          .update(auditDelete(ctx))
      }

      const lineAudit = auditCreate(ctx)

      for (const line of nextLines) {
        const part = await getDb()('parts')
          .transacting(transaction)
          .where({ id: line.partId, company_id: companyId })
          .whereNull('deleted_at')
          .first()
        if (!part) throw new Error('Invalid part selected')

        if (line.id && existingById.has(line.id)) {
          const prev = existingById.get(line.id)!

          if (prev.part_id !== line.partId) {
            const prevRemaining = Number(prev.quantity_remaining ?? prev.quantity)
            const soldFromLine = Number(prev.quantity) - prevRemaining
            if (soldFromLine > 0) {
              throw new Error(
                'Cannot change part on this line — units from this purchase have already been sold'
              )
            }
            await applyPartStockDelta(transaction, {
              companyId,
              branchId,
              partId: prev.part_id as string,
              deltaQty: -Number(prev.quantity),
              movementType: MovementType.ADJUSTMENT,
              referenceType: 'part_purchase',
              referenceId: id,
              notes: 'Part changed on purchase line',
              ctx
            })
            await applyPartStockDelta(transaction, {
              companyId,
              branchId,
              partId: line.partId,
              deltaQty: line.quantity,
              movementType: MovementType.PURCHASE,
              referenceType: 'part_purchase',
              referenceId: id,
              notes: 'Part changed on purchase line',
              unitCost: line.unitCost,
              sellingPrice: line.unitSalePrice ?? line.unitCost,
              ctx
            })
          } else {
            const prevRemaining = Number(prev.quantity_remaining ?? prev.quantity)
            const soldFromLine = Number(prev.quantity) - prevRemaining
            if (line.quantity < soldFromLine) {
              throw new Error(
                `Cannot reduce quantity below ${soldFromLine} — units from this purchase have already been sold`
              )
            }
            const qtyDiff = line.quantity - Number(prev.quantity)
            if (qtyDiff !== 0) {
              await applyPartStockDelta(transaction, {
                companyId,
                branchId,
                partId: line.partId,
                deltaQty: qtyDiff,
                movementType: MovementType.ADJUSTMENT,
                referenceType: 'part_purchase',
                referenceId: id,
                notes: 'Updated parts purchase quantity',
                unitCost: qtyDiff > 0 ? line.unitCost : undefined,
                sellingPrice: line.unitSalePrice ?? line.unitCost,
                ctx
              })
            } else {
              // Price-only change — refresh retail without qty / cost average churn
              await getDb()('part_stocks')
                .transacting(transaction)
                .where({ company_id: companyId, branch_id: branchId, part_id: line.partId })
                .update(
                  withAuditUpdate(ctx, {
                    selling_price: line.unitSalePrice ?? line.unitCost
                  })
                )
            }
          }

          const prevRemaining = Number(prev.quantity_remaining ?? prev.quantity)
          const qtyDiff = line.quantity - Number(prev.quantity)

          await getDb()('part_purchase_lines')
            .transacting(transaction)
            .where({ id: line.id })
            .update(
              withAuditUpdate(ctx, {
                part_id: line.partId,
                category_id: part.category_id,
                quantity: line.quantity,
                quantity_remaining:
                  prev.part_id !== line.partId ? line.quantity : prevRemaining + qtyDiff,
                unit_cost: line.unitCost,
                unit_sale_price: line.unitSalePrice ?? line.unitCost,
                special_discount: line.specialDiscount || 0,
                special_discount_type: line.specialDiscountType || 'pkr'
              })
            )

          await getDb()('parts')
            .transacting(transaction)
            .where({ id: line.partId })
            .update(
              withAuditUpdate(ctx, {
                default_purchase_price: line.unitCost,
                default_sale_price: line.unitSalePrice ?? line.unitCost
              })
            )
        } else {
          await getDb()('part_purchase_lines')
            .transacting(transaction)
            .insert({
              id: generateId(),
              company_id: companyId,
              part_purchase_id: id,
              part_id: line.partId,
              category_id: part.category_id,
              quantity: line.quantity,
              quantity_remaining: line.quantity,
              unit_cost: line.unitCost,
              unit_sale_price: line.unitSalePrice ?? line.unitCost,
              special_discount: line.specialDiscount || 0,
              special_discount_type: line.specialDiscountType || 'pkr',
              ...lineAudit,
              created_at: new Date(),
              updated_at: new Date()
            })

          await applyPartStockDelta(transaction, {
            companyId,
            branchId,
            partId: line.partId,
            deltaQty: line.quantity,
            movementType: MovementType.PURCHASE,
            referenceType: 'part_purchase',
            referenceId: id,
            unitCost: line.unitCost,
            sellingPrice: line.unitSalePrice ?? line.unitCost,
            ctx
          })

          await getDb()('parts')
            .transacting(transaction)
            .where({ id: line.partId })
            .update(
              withAuditUpdate(ctx, {
                default_purchase_price: line.unitCost,
                default_sale_price: line.unitSalePrice ?? line.unitCost
              })
            )
        }
      }

      await getDb()('part_purchases')
        .transacting(transaction)
        .where({ id })
        .update(
          withAuditUpdate(ctx, {
            supplier_id: payload.supplierId,
            purchase_date: new Date(payload.purchaseDate),
            notes: payload.notes || ''
          })
        )

      return { success: true, id }
    })
  }
}

export const partPurchaseService = new PartPurchaseService()

import { MovementType } from '@madix/database'
import { Roles } from '../../../common/constants/roles'
import { getDb, withTransaction } from '../../db'
import { generateId } from '../../../common/utils/uuid'
import { asJson, asJsonList } from '../shared/json.helpers'
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
import { applyPartStockDelta } from './part-stock.helpers'
import {
  adjustPurchaseApNetChange,
  hasPurchaseApLedger,
  neutralizePurchaseApLedger,
  postPurchaseApLedger,
  recordSupplierPayment,
  reviseSupplierPaymentLedger,
  roundRs
} from '../purchase/supplier-ledger.helpers'

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
  paidAmount?: number
  paymentMethod?: string
  lines: PartPurchaseLineInput[]
}

export type UpdatePartPurchasePayload = CreatePartPurchasePayload

export type RecordPartPurchasePaymentPayload = {
  purchaseId: string
  amount: number
  method?: string
  paymentDate?: string
}

export type UpdatePartPurchasePaymentPayload = {
  paymentId: string
  amount: number
  method?: string
  paymentDate?: string
}

function assertCanEditPayment(ctx: AuditContext): void {
  if (ctx.role !== Roles.COMPANY_OWNER && ctx.role !== Roles.SUPER_ADMIN) {
    throw new Error('Only company owners can edit payments')
  }
}

function assertCanEditPurchase(ctx: AuditContext): void {
  if (ctx.role !== Roles.COMPANY_OWNER && ctx.role !== Roles.SUPER_ADMIN) {
    throw new Error('Only company owners can edit purchases')
  }
}

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
      const raw = filters.search.trim()
      const term = `%${raw}%`
      const idTerm = `%${raw.replace(/^#/, '')}%`
      q.where((builder) => {
        builder
          .whereRaw('p.id::text ILIKE ?', [idTerm])
          .orWhereExists(
            getDb()('part_purchase_lines as pl')
              .leftJoin('parts as pt', 'pl.part_id', 'pt.id')
              .whereRaw('pl.part_purchase_id = p.id')
              .whereNull('pl.deleted_at')
              .whereILike('pt.name', term)
          )
      })
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

    const payments = await getDb()('purchase_payments')
      .where({ part_purchase_id: id })
      .orderBy('payment_date', 'asc')
      .orderBy('created_at', 'asc')

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
      payments: payments.map((p) => asJson(p)!),
      editable: true
    }
  }

  async listDue(companyId: string, branchId?: string, ctx?: AuditContext | null): Promise<unknown[]> {
    let q = getDb()('part_purchases as p')
      .leftJoin('suppliers as s', 'p.supplier_id', 's.id')
      .where({ 'p.company_id': companyId })
      .whereNull('p.deleted_at')
      .where('p.due_amount', '>', 0)
    joinAuditUsers(q, 'p')
    q = applyStaffScope(q, ctx ?? null, 'p.created_by', 'p.branch_id')
    q.select('p.*', 's.name as supplier_name', ...AUDIT_USER_SELECT).orderBy('p.purchase_date', 'desc')

    if (branchId) q.where({ 'p.branch_id': branchId })

    const purchases = await q
    return purchases.map((p) => ({
      ...enrichAuditUsers(p),
      kind: 'part' as const,
      supplier: p.supplier_name ? { name: p.supplier_name } : null
    }))
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

      const netTotal = roundRs(
        createdLines.reduce(
          (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0),
          0
        )
      )
      const paidAmount = roundRs(Math.min(Math.max(0, Number(payload.paidAmount || 0)), netTotal))
      const dueAmount = roundRs(netTotal - paidAmount)

      const [updatedPurchase] = await getDb()('part_purchases')
        .transacting(transaction)
        .where({ id: purchaseId })
        .update({
          net_total: netTotal,
          paid_amount: paidAmount,
          due_amount: dueAmount,
          updated_at: new Date()
        })
        .returning('*')

      await postPurchaseApLedger(transaction, {
        companyId,
        supplierId: payload.supplierId,
        netTotal,
        paidAmount,
        referenceType: 'part_purchase',
        referenceId: purchaseId,
        paymentMethod: payload.paymentMethod,
        purchaseId: null,
        partPurchaseId: purchaseId,
        ctx
      })

      return {
        purchase: asJson(updatedPurchase),
        lines: createdLines.map((line) => asJson(line)!),
        dueAmount
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
    assertCanEditPurchase(ctx)
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

      const oldNet = roundRs(Number(purchase.net_total || 0))
      const oldPaid = roundRs(Number(purchase.paid_amount || 0))
      const oldSupplierId = purchase.supplier_id as string
      const newSupplierId = payload.supplierId

      const finalLines = await getDb()('part_purchase_lines')
        .transacting(transaction)
        .where({ part_purchase_id: id })
        .whereNull('deleted_at')
      const netTotal = roundRs(
        finalLines.reduce(
          (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0),
          0
        )
      )
      if (oldPaid > netTotal) {
        throw new Error(
          `Cannot reduce purchase below recorded payments (${oldPaid}). Recorded paid exceeds new net ${netTotal}.`
        )
      }
      const dueAmount = roundRs(netTotal - oldPaid)

      await getDb()('part_purchases')
        .transacting(transaction)
        .where({ id })
        .update({
          net_total: netTotal,
          paid_amount: oldPaid,
          due_amount: dueAmount,
          updated_at: new Date()
        })

      if (oldSupplierId !== newSupplierId) {
        await neutralizePurchaseApLedger(transaction, {
          companyId,
          supplierId: oldSupplierId,
          netTotal: oldNet,
          paidAmount: oldPaid,
          referenceType: 'part_purchase',
          referenceId: id,
          ctx
        })
        await postPurchaseApLedger(transaction, {
          companyId,
          supplierId: newSupplierId,
          netTotal,
          paidAmount: 0,
          referenceType: 'part_purchase',
          referenceId: id,
          ctx
        })
        if (oldPaid > 0) {
          await recordSupplierPayment(transaction, {
            companyId,
            supplierId: newSupplierId,
            amount: oldPaid,
            referenceType: 'part_purchase',
            referenceId: id,
            partPurchaseId: id,
            ctx,
            skipPaymentRow: true
          })
        }
      } else {
        if (!(await hasPurchaseApLedger(transaction, id, 'part_purchase'))) {
          await postPurchaseApLedger(transaction, {
            companyId,
            supplierId: newSupplierId,
            netTotal,
            paidAmount: oldPaid,
            referenceType: 'part_purchase',
            referenceId: id,
            partPurchaseId: id,
            skipPaymentRow: true,
            ctx
          })
        } else {
          await adjustPurchaseApNetChange(transaction, {
            companyId,
            supplierId: newSupplierId,
            oldNet,
            newNet: netTotal,
            referenceType: 'part_purchase',
            referenceId: id,
            ctx
          })
        }
      }

      return { success: true, id, dueAmount }
    })
  }

  async recordPayment(
    companyId: string,
    ctx: AuditContext,
    payload: RecordPartPurchasePaymentPayload
  ): Promise<unknown> {
    const amount = roundRs(Number(payload.amount || 0))
    if (amount <= 0) throw new Error('Enter a valid payment amount')

    return withTransaction(async (transaction) => {
      const purchase = await getDb()('part_purchases')
        .transacting(transaction)
        .where({ id: payload.purchaseId })
        .whereNull('deleted_at')
        .first()
      if (!purchase || purchase.company_id !== companyId) throw new Error('Parts purchase not found')

      const dueAmount = Number(purchase.due_amount)
      if (dueAmount <= 0) throw new Error('This purchase has no outstanding balance')
      if (amount > dueAmount) throw new Error(`Payment cannot exceed due amount (${dueAmount})`)

      const paymentDate = payload.paymentDate ? new Date(payload.paymentDate) : new Date()
      const supplierId = purchase.supplier_id as string

      await recordSupplierPayment(transaction, {
        companyId,
        supplierId,
        amount,
        method: payload.method,
        paymentDate,
        purchaseId: null,
        partPurchaseId: payload.purchaseId,
        referenceType: 'part_purchase',
        referenceId: payload.purchaseId,
        ctx
      })

      const newPaid = roundRs(Number(purchase.paid_amount) + amount)
      const newDue = roundRs(dueAmount - amount)
      const [updatedPurchase] = await getDb()('part_purchases')
        .transacting(transaction)
        .where({ id: payload.purchaseId })
        .update({ paid_amount: newPaid, due_amount: newDue, ...auditUpdate(ctx) })
        .returning('*')

      return { purchase: asJson(updatedPurchase), dueAmount: newDue }
    })
  }

  async updatePayment(
    companyId: string,
    ctx: AuditContext,
    payload: UpdatePartPurchasePaymentPayload
  ): Promise<unknown> {
    assertCanEditPayment(ctx)
    const newAmount = roundRs(Number(payload.amount || 0))
    if (newAmount < 0) throw new Error('Payment amount cannot be negative')

    return withTransaction(async (transaction) => {
      const payment = await getDb()('purchase_payments')
        .transacting(transaction)
        .where({ id: payload.paymentId, company_id: companyId })
        .first()
      if (!payment || !payment.part_purchase_id) throw new Error('Payment not found')

      const purchase = await getDb()('part_purchases')
        .transacting(transaction)
        .where({ id: payment.part_purchase_id, company_id: companyId })
        .first()
      if (!purchase) throw new Error('Parts purchase not found')
      if (purchase.deleted_at) throw new Error('Cannot edit payment on a voided purchase')

      const oldAmount = roundRs(Number(payment.amount || 0))
      const supplierId = purchase.supplier_id as string
      const netTotal = roundRs(Number(purchase.net_total || 0))
      const purchaseId = String(purchase.id)

      const otherPayments = await getDb()('purchase_payments')
        .transacting(transaction)
        .where({ part_purchase_id: purchaseId })
        .whereNot({ id: payload.paymentId })
      const otherPaid = roundRs(
        otherPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
      )
      const effectiveNewAmount = newAmount <= 0 ? 0 : newAmount
      const newPaid = roundRs(otherPaid + effectiveNewAmount)
      if (newPaid < 0) throw new Error('Payment edit would make paid amount negative')
      if (newPaid > netTotal) {
        throw new Error(`Paid total cannot exceed purchase net (${netTotal})`)
      }

      const amountChanged = effectiveNewAmount !== oldAmount
      const paymentDate = payload.paymentDate
        ? new Date(payload.paymentDate)
        : new Date(payment.payment_date as string | Date)
      const method = payload.method || (payment.method as string) || 'cash'

      if (newAmount <= 0) {
        await getDb()('purchase_payments')
          .transacting(transaction)
          .where({ id: payload.paymentId })
          .del()
      } else {
        await getDb()('purchase_payments')
          .transacting(transaction)
          .where({ id: payload.paymentId })
          .update({
            amount: newAmount,
            method,
            payment_date: paymentDate,
            ...auditUpdate(ctx)
          })
      }

      if (amountChanged) {
        await reviseSupplierPaymentLedger(transaction, {
          companyId,
          supplierId,
          oldAmount,
          newAmount: effectiveNewAmount,
          referenceType: 'part_purchase',
          referenceId: purchaseId,
          ctx
        })
      }

      const newDue = roundRs(netTotal - newPaid)
      const [updatedPurchase] = await getDb()('part_purchases')
        .transacting(transaction)
        .where({ id: purchase.id })
        .update({ paid_amount: newPaid, due_amount: newDue, ...auditUpdate(ctx) })
        .returning('*')

      const payments = await getDb()('purchase_payments')
        .transacting(transaction)
        .where({ part_purchase_id: purchase.id })
        .orderBy('payment_date', 'asc')
        .orderBy('created_at', 'asc')

      return {
        purchase: asJson(updatedPurchase),
        payments: asJsonList(payments),
        dueAmount: newDue
      }
    })
  }
}

export const partPurchaseService = new PartPurchaseService()

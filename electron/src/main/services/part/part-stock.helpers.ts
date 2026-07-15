import type { Knex } from 'knex'
import { MovementType } from '@madix/database'
import { generateId } from '../../../common/utils/uuid'
import { type AuditContext, auditCreate, auditUpdate } from '../shared/audit.helpers'

export type ApplyPartStockDeltaParams = {
  companyId: string
  branchId: string
  partId: string
  deltaQty: number
  movementType: MovementType | string
  referenceType?: string
  referenceId?: string
  notes?: string
  ctx: AuditContext
}

/** Upserts part_stocks and appends a part_stock_movements row. Returns quantity after change. */
export async function applyPartStockDelta(
  trx: Knex.Transaction,
  params: ApplyPartStockDeltaParams
): Promise<number> {
  const {
    companyId,
    branchId,
    partId,
    deltaQty,
    movementType,
    referenceType,
    referenceId,
    notes,
    ctx
  } = params

  if (!Number.isFinite(deltaQty) || deltaQty === 0) {
    throw new Error('Quantity change must be a non-zero number')
  }

  let stock = await trx('part_stocks')
    .where({ company_id: companyId, branch_id: branchId, part_id: partId })
    .first()

  const now = new Date()
  if (!stock) {
    if (deltaQty < 0) throw new Error('Insufficient part stock')
    const [created] = await trx('part_stocks')
      .insert({
        id: generateId(),
        company_id: companyId,
        branch_id: branchId,
        part_id: partId,
        quantity_on_hand: deltaQty,
        ...auditCreate(ctx),
        created_at: now,
        updated_at: now
      })
      .returning('*')
    stock = created
  } else {
    const nextQty = Number(stock.quantity_on_hand) + deltaQty
    if (nextQty < 0) throw new Error('Insufficient part stock')
    const [updated] = await trx('part_stocks')
      .where({ id: stock.id })
      .update({
        quantity_on_hand: nextQty,
        ...auditUpdate(ctx)
      })
      .returning('*')
    stock = updated
  }

  const quantityAfter = Number(stock.quantity_on_hand)
  await trx('part_stock_movements').insert({
    id: generateId(),
    company_id: companyId,
    part_id: partId,
    branch_id: branchId,
    delta_qty: deltaQty,
    quantity_after: quantityAfter,
    movement_type: movementType,
    reference_type: referenceType || null,
    reference_id: referenceId || null,
    notes: notes || null,
    ...auditCreate(ctx),
    created_at: now
  })

  return quantityAfter
}

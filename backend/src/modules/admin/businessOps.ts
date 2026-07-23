import type { Knex } from 'knex'
import { randomUUID } from 'crypto'
import {
  MovementType,
  ProductItemStatus,
  SaleStatus,
  rowToCamel,
  rowsToCamel
} from '@madix/database'
import { getCompanyDb } from '../../db'

type ListFilters = {
  search?: string
  fromDate?: string
  toDate?: string
  page?: number
  pageSize?: number
  /** @deprecated prefer visibility */
  includeDeleted?: boolean
  /** active = hide deleted/voided (default), include = both, only = deleted/voided only */
  visibility?: 'active' | 'include' | 'only'
}

function resolveVisibility(filters: ListFilters): 'active' | 'include' | 'only' {
  if (filters.visibility === 'include' || filters.visibility === 'only' || filters.visibility === 'active') {
    return filters.visibility
  }
  return filters.includeDeleted ? 'include' : 'active'
}

/** Soft-delete style tables (customers, purchases). */
function applyDeletedVisibility(
  q: Knex.QueryBuilder,
  column: string,
  visibility: 'active' | 'include' | 'only'
) {
  if (visibility === 'only') return q.whereNotNull(column)
  if (visibility === 'active') return q.whereNull(column)
  return q
}

/** Sales: voided = soft-deleted or cancelled. */
function applySaleVoidVisibility(
  q: Knex.QueryBuilder,
  visibility: 'active' | 'include' | 'only'
) {
  if (visibility === 'only') {
    return q.where((b) => {
      b.whereNotNull('s.deleted_at').orWhere('s.status', SaleStatus.CANCELLED)
    })
  }
  if (visibility === 'active') {
    return q.whereNull('s.deleted_at').whereNot('s.status', SaleStatus.CANCELLED)
  }
  return q
}


function roundAmount(value: number): number {
  return Math.round(Number(value) || 0)
}

function asJson(row: Record<string, unknown> | null | undefined) {
  if (!row) return null
  return rowToCamel(row)
}

async function customerBalance(db: Knex.Transaction, customerId: string): Promise<number> {
  const rows = await db('ledger_entries').where({ customer_id: customerId }).select('type', 'amount')
  return roundAmount(
    rows.reduce((balance, row) => {
      const amount = Number(row.amount || 0)
      return row.type === 'payment_credit' ? balance - amount : balance + amount
    }, 0)
  )
}

async function insertLedger(
  trx: Knex.Transaction,
  companyId: string,
  customerId: string,
  type: 'sale_debit' | 'payment_credit',
  amount: number,
  referenceType: string,
  referenceId: string
) {
  if (amount <= 0) return
  const balance = await customerBalance(trx, customerId)
  const runningBalance = roundAmount(
    type === 'payment_credit' ? balance - amount : balance + amount
  )
  await trx('ledger_entries').insert({
    id: randomUUID(),
    company_id: companyId,
    customer_id: customerId,
    type,
    amount,
    reference_type: referenceType,
    reference_id: referenceId,
    running_balance: runningBalance,
    created_at: new Date()
  })
}

/**
 * Append ledger corrections so this sale's net ledger effect becomes `targetEffect`
 * (0 = sale fully reversed / as if it never affected the customer balance).
 * Includes every ledger row pointing at the sale id (any reference_type).
 */
async function neutralizeSaleLedgerEffect(
  trx: Knex.Transaction,
  companyId: string,
  saleId: string,
  targetEffect = 0,
  fallbackCustomerId?: string | null
): Promise<
  Array<{ customerId: string; type: 'sale_debit' | 'payment_credit'; amount: number }>
> {
  const related = (await trx('ledger_entries')
    .where({ reference_id: saleId })
    .select('customer_id', 'type', 'amount')) as Array<{
    customer_id: string
    type: string
    amount: string | number
  }>

  const effects = new Map<string, number>()
  for (const entry of related) {
    if (!entry.customer_id) continue
    const amount = Number(entry.amount || 0)
    const effect = entry.type === 'payment_credit' ? -amount : amount
    effects.set(entry.customer_id, roundAmount((effects.get(entry.customer_id) || 0) + effect))
  }

  if (fallbackCustomerId && !effects.has(fallbackCustomerId)) {
    effects.set(fallbackCustomerId, 0)
  }

  const adjustments: Array<{
    customerId: string
    type: 'sale_debit' | 'payment_credit'
    amount: number
  }> = []

  for (const [customerId, actual] of effects.entries()) {
    const delta = roundAmount(targetEffect - actual)
    if (delta === 0) continue
    const type = delta > 0 ? 'sale_debit' : 'payment_credit'
    const amount = Math.abs(delta)
    await insertLedger(trx, companyId, customerId, type, amount, 'sale_void', saleId)
    adjustments.push({ customerId, type, amount })
  }

  return adjustments
}

async function restorePartSaleAllocations(trx: Knex.Transaction, saleLineId: string) {
  const allocations = await trx('part_sale_allocations').where({ sale_line_id: saleLineId })
  const now = new Date()
  for (const alloc of allocations) {
    const line = await trx('part_purchase_lines').where({ id: alloc.part_purchase_line_id }).first()
    if (!line) continue
    await trx('part_purchase_lines')
      .where({ id: alloc.part_purchase_line_id })
      .update({
        quantity_remaining: Number(line.quantity_remaining) + Number(alloc.quantity),
        updated_at: now
      })
  }
  await trx('part_sale_allocations').where({ sale_line_id: saleLineId }).del()
}

async function applyPartStockDelta(
  trx: Knex.Transaction,
  params: {
    companyId: string
    branchId: string
    partId: string
    deltaQty: number
    movementType: string
    referenceType: string
    referenceId: string
    notes?: string
  }
) {
  const { companyId, branchId, partId, deltaQty, movementType, referenceType, referenceId, notes } =
    params
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
        id: randomUUID(),
        company_id: companyId,
        branch_id: branchId,
        part_id: partId,
        quantity_on_hand: deltaQty,
        average_cost: 0,
        selling_price: 0,
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
      .update({ quantity_on_hand: nextQty, updated_at: now })
      .returning('*')
    stock = updated
  }

  await trx('part_stock_movements').insert({
    id: randomUUID(),
    company_id: companyId,
    part_id: partId,
    branch_id: branchId,
    delta_qty: deltaQty,
    quantity_after: Number(stock.quantity_on_hand),
    movement_type: movementType,
    reference_type: referenceType,
    reference_id: referenceId,
    notes: notes || null,
    created_at: now
  })
}

async function reverseProductSaleLine(
  trx: Knex.Transaction,
  companyId: string,
  branchId: string,
  saleId: string,
  line: Record<string, unknown>
) {
  const productItemId = line.product_item_id as string | undefined
  if (!productItemId) return

  const item = await trx('product_items').where({ id: productItemId }).first()
  if (!item) throw new Error('Product unit not found')
  if (item.status !== ProductItemStatus.SOLD) {
    throw new Error(`Cannot void — unit ${line.serial_number || productItemId} is no longer sold`)
  }

  const updated = await trx('product_items')
    .where({ id: productItemId, status: ProductItemStatus.SOLD })
    .update({
      status: ProductItemStatus.IN_STOCK,
      sold_at: null,
      version: Number(item.version || 1) + 1,
      updated_at: new Date()
    })
  if (!updated) {
    throw new Error(`Cannot void — unit ${line.serial_number || productItemId} is no longer sold`)
  }

  await trx('inventory_movements').insert({
    id: randomUUID(),
    company_id: companyId,
    product_item_id: productItemId,
    movement_type: MovementType.RETURN,
    to_branch_id: branchId,
    reference_type: 'sale_void',
    reference_id: saleId,
    created_at: new Date()
  })
}

async function reversePartSaleLine(
  trx: Knex.Transaction,
  companyId: string,
  branchId: string,
  saleId: string,
  line: Record<string, unknown>
) {
  const partId = line.part_id as string | undefined
  if (!partId) return
  const quantity = Math.max(1, Math.floor(Number(line.quantity || 1)))
  const saleLineId = line.id as string
  if (saleLineId) await restorePartSaleAllocations(trx, saleLineId)
  await applyPartStockDelta(trx, {
    companyId,
    branchId,
    partId,
    deltaQty: quantity,
    movementType: MovementType.RETURN,
    referenceType: 'sale_void',
    referenceId: saleId,
    notes: 'Reversed for sale void'
  })
}

async function saleCanVoid(
  trx: Knex,
  sale: Record<string, unknown>,
  lines: Record<string, unknown>[]
): Promise<{ ok: boolean; blockers: string[] }> {
  const blockers: string[] = []
  if (sale.deleted_at) blockers.push('Sale is already deleted')
  if (sale.status === SaleStatus.CANCELLED) blockers.push('Sale is already cancelled')

  for (const line of lines) {
    const lineType = (line.line_type as string) || (line.part_id ? 'part' : 'product')
    if (lineType === 'part') continue
    const productItemId = line.product_item_id as string | undefined
    if (!productItemId) continue
    const item = await trx('product_items').where({ id: productItemId }).first()
    if (!item) {
      blockers.push(`Missing product unit for line ${line.serial_number || line.id}`)
      continue
    }
    if (item.status !== ProductItemStatus.SOLD) {
      blockers.push(
        `Unit ${item.serial_number || productItemId} status is ${item.status}, expected sold`
      )
    }
  }
  return { ok: blockers.length === 0, blockers }
}

export async function listSales(companyId: string, filters: ListFilters = {}) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const page = Math.max(1, filters.page || 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 25))
  const offset = (page - 1) * pageSize

  let q = db('sales as s')
    .leftJoin('customers as c', 's.customer_id', 'c.id')
    .leftJoin('branches as b', 's.branch_id', 'b.id')
    .where({ 's.company_id': companyId })

  q = applySaleVoidVisibility(q, resolveVisibility(filters))
  if (filters.fromDate) q = q.where('s.sale_date', '>=', new Date(filters.fromDate))
  if (filters.toDate) {
    const to = new Date(filters.toDate)
    to.setHours(23, 59, 59, 999)
    q = q.where('s.sale_date', '<=', to)
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`
    q = q.where((builder) => {
      builder
        .whereILike('c.name', term)
        .orWhereExists(
          db('sale_lines as sl')
            .leftJoin('product_items as pi', 'pi.id', 'sl.product_item_id')
            .whereRaw('sl.sale_id = s.id')
            .where((lineBuilder) => {
              lineBuilder
                .whereILike('sl.serial_number', term)
                .orWhereILike('pi.motor_number', term)
                .orWhereILike('sl.product_name', term)
            })
        )
    })
  }

  const countRow = await q.clone().clearSelect().clearOrder().countDistinct('s.id as count').first()
  const total = Number(countRow?.count ?? 0)

  const sales = await q
    .clone()
    .select(
      's.*',
      'c.name as customer_name',
      'b.name as branch_name'
    )
    .orderBy('s.sale_date', 'desc')
    .orderBy('s.created_at', 'desc')
    .limit(pageSize)
    .offset(offset)

  const rows = []
  for (const sale of sales) {
    const [{ count }] = await db('sale_lines').where({ sale_id: sale.id }).count('* as count')
    const billRow = await db('sales')
      .where({ company_id: companyId })
      .whereNull('deleted_at')
      .where('created_at', '<=', sale.created_at)
      .count('* as count')
      .first()
    rows.push({
      ...asJson(sale),
      billNo: Number(billRow?.count ?? 0),
      customer: sale.customer_name ? { name: sale.customer_name } : null,
      branchName: sale.branch_name || null,
      lineCount: Number(count)
    })
  }

  return { rows, total, page, pageSize }
}

export async function listDueSales(companyId: string, filters: ListFilters = {}) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const page = Math.max(1, filters.page || 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 25))
  const offset = (page - 1) * pageSize

  let q = db('sales as s')
    .leftJoin('customers as c', 's.customer_id', 'c.id')
    .leftJoin('branches as b', 's.branch_id', 'b.id')
    .where({ 's.company_id': companyId })
    .whereNull('s.deleted_at')
    .where('s.due_amount', '>', 0)

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`
    q = q.whereILike('c.name', term)
  }

  const countRow = await q.clone().clearSelect().clearOrder().countDistinct('s.id as count').first()
  const total = Number(countRow?.count ?? 0)

  const sales = await q
    .clone()
    .select('s.*', 'c.name as customer_name', 'b.name as branch_name')
    .orderBy('s.due_amount', 'desc')
    .orderBy('s.sale_date', 'asc')
    .limit(pageSize)
    .offset(offset)

  const rows = sales.map((sale) => ({
    ...asJson(sale),
    customer: sale.customer_name ? { name: sale.customer_name } : null,
    branchName: sale.branch_name || null
  }))

  return { rows, total, page, pageSize }
}

export async function getSaleDetail(companyId: string, saleId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })

  const sale = await db('sales as s')
    .leftJoin('customers as c', 's.customer_id', 'c.id')
    .leftJoin('branches as b', 's.branch_id', 'b.id')
    .where({ 's.id': saleId, 's.company_id': companyId })
    .select(
      's.*',
      'c.name as customer_name',
      'c.phone as customer_phone',
      'c.address as customer_address',
      'c.cnic as customer_cnic',
      'b.name as branch_name'
    )
    .first()
  if (!sale) throw new Error('Sale not found')

  const billRow = await db('sales')
    .where({ company_id: companyId })
    .whereNull('deleted_at')
    .where('created_at', '<=', sale.created_at)
    .count('* as count')
    .first()

  const lines = await db('sale_lines as sl')
    .leftJoin('product_items as pi', 'pi.id', 'sl.product_item_id')
    .leftJoin('products as pr', 'pr.id', 'pi.product_id')
    .leftJoin('parts as pt', 'pt.id', 'sl.part_id')
    .where({ 'sl.sale_id': saleId })
    .select(
      'sl.*',
      'pi.motor_number',
      'pi.status as product_item_status',
      'pr.description as product_description',
      'pt.description as part_description'
    )
    .orderBy('sl.created_at', 'asc')

  const payments = await db('payments').where({ sale_id: saleId }).orderBy('payment_date', 'asc')
  const ledger = await db('ledger_entries')
    .where({ reference_id: saleId })
    .whereIn('reference_type', ['sale', 'sale_edit', 'sale_reconcile', 'sale_void'])
    .orderBy('created_at', 'asc')

  const voidCheck = await saleCanVoid(db, sale, lines)

  const productImpact = []
  const partImpact = []
  for (const line of lines) {
    const lineType = (line.line_type as string) || (line.part_id ? 'part' : 'product')
    if (lineType === 'part') {
      partImpact.push({
        saleLineId: line.id,
        partId: line.part_id,
        name: line.product_name,
        quantity: Number(line.quantity || 1)
      })
    } else if (line.product_item_id) {
      productImpact.push({
        saleLineId: line.id,
        productItemId: line.product_item_id,
        serialNumber: line.serial_number,
        status: line.product_item_status,
        name: line.product_name
      })
    }
  }

  return {
    sale: {
      ...asJson(sale),
      billNo: Number(billRow?.count ?? 0),
      branchName: sale.branch_name || null,
      customer: {
        name: sale.customer_name,
        phone: sale.customer_phone,
        address: sale.customer_address,
        cnic: sale.customer_cnic
      }
    },
    lines: lines.map((line) => ({
      ...asJson(line),
      productDescription:
        line.line_type === 'part'
          ? line.part_description || line.product_description
          : line.product_description
    })),
    payments: rowsToCamel(payments),
    ledger: rowsToCamel(ledger),
    impact: {
      canVoid: voidCheck.ok,
      blockers: voidCheck.blockers,
      productUnits: productImpact,
      partLines: partImpact,
      paymentTotal: roundAmount(
        payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
      ),
      netTotal: roundAmount(Number(sale.net_total || 0)),
      dueAmount: roundAmount(Number(sale.due_amount || 0)),
      note: 'Void restocks units/parts, cancels the sale, and clears this sale from the customer ledger (including payments).'
    }
  }
}

export async function voidSale(
  companyId: string,
  saleId: string,
  options: { reason?: string; purge?: boolean } = {}
) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const reason = (options.reason || '').trim()
  if (!reason) throw new Error('Reason is required')

  return db.transaction(async (trx) => {
    const sale = await trx('sales')
      .where({ id: saleId, company_id: companyId })
      .forUpdate()
      .first()
    if (!sale) throw new Error('Sale not found')

    const lines = await trx('sale_lines').where({ sale_id: saleId })
    const check = await saleCanVoid(trx, sale, lines)
    if (!check.ok) throw new Error(check.blockers.join('; '))

    const branchId = String(sale.branch_id)
    for (const line of lines) {
      const lineType = (line.line_type as string) || (line.part_id ? 'part' : 'product')
      if (lineType === 'part') {
        await reversePartSaleLine(trx, companyId, branchId, saleId, line)
      } else {
        await reverseProductSaleLine(trx, companyId, branchId, saleId, line)
      }
    }

    // Bring ledger net effect of this sale to 0 (undo debit + payment credits).
    const ledgerAdjustments = await neutralizeSaleLedgerEffect(
      trx,
      companyId,
      saleId,
      0,
      sale.customer_id ? String(sale.customer_id) : null
    )

    const now = new Date()
    const notesSuffix = `\n[VOID ${now.toISOString()}] ${reason}`
    await trx('sales').where({ id: saleId }).update({
      status: SaleStatus.CANCELLED,
      due_amount: 0,
      paid_amount: 0,
      due_reminder_date: null,
      notes: `${sale.notes || ''}${notesSuffix}`.trim(),
      deleted_at: now,
      updated_at: now
    })

    // Soft-void only. Hard purge left orphan inserts in sync_queue so wiped
    // POS devices re-downloaded deleted ledger rows. Use Force remote POS
    // cleanup after void if devices must re-pull live data.
    if (options.purge) {
      throw new Error(
        'Hard purge is disabled (breaks POS sync). Void the sale, then use Force remote POS cleanup if devices need a fresh download.'
      )
    }

    return {
      saleId,
      voided: true,
      purged: false,
      restockedProducts: lines.filter(
        (l) => ((l.line_type as string) || (l.part_id ? 'part' : 'product')) !== 'part'
      ).length,
      restockedPartLines: lines.filter(
        (l) => ((l.line_type as string) || (l.part_id ? 'part' : 'product')) === 'part'
      ).length,
      ledgerAdjustments,
      reason
    }
  })
}

/**
 * Fix customer ledger for a voided/cancelled sale that still has a non-zero
 * ledger effect (e.g. older voids that only credited net_total and left −paid).
 */
export async function repairSaleLedger(companyId: string, saleId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })

  return db.transaction(async (trx) => {
    const sale = await trx('sales').where({ id: saleId, company_id: companyId }).first()
    if (!sale) throw new Error('Sale not found')

    const adjustments = await neutralizeSaleLedgerEffect(
      trx,
      companyId,
      saleId,
      0,
      sale.customer_id ? String(sale.customer_id) : null
    )
    return {
      saleId,
      repaired: true,
      adjustments,
      message:
        adjustments.length === 0
          ? 'Ledger already balanced for this sale'
          : `Applied ${adjustments.length} ledger correction(s)`
    }
  })
}

/**
 * Scan voided/cancelled sales and neutralize any leftover ledger effect.
 */
export async function repairAllVoidedSaleLedgers(companyId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })

  const voided = await db('sales')
    .where({ company_id: companyId })
    .where((b) => {
      b.whereNotNull('deleted_at').orWhere('status', SaleStatus.CANCELLED)
    })
    .select('id')

  const results: Array<{
    saleId: string
    adjustments: Array<{ customerId: string; type: string; amount: number }>
  }> = []

  for (const row of voided) {
    const saleId = String(row.id)
    await db.transaction(async (trx) => {
      const sale = await trx('sales').where({ id: saleId }).first()
      const adjustments = await neutralizeSaleLedgerEffect(
        trx,
        companyId,
        saleId,
        0,
        sale?.customer_id ? String(sale.customer_id) : null
      )
      if (adjustments.length) {
        results.push({ saleId, adjustments })
      }
    })
  }

  return {
    scanned: voided.length,
    repaired: results.length,
    results
  }
}

export async function listPurchases(companyId: string, filters: ListFilters & { kind?: string } = {}) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const page = Math.max(1, filters.page || 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 25))
  const kind = filters.kind || 'all'
  const visibility = resolveVisibility(filters)

  const rows: Array<Record<string, unknown>> = []

  if (kind === 'all' || kind === 'product') {
    let q = db('purchases as p')
      .leftJoin('suppliers as s', 'p.supplier_id', 's.id')
      .leftJoin('branches as b', 'p.branch_id', 'b.id')
      .where({ 'p.company_id': companyId })
    q = applyDeletedVisibility(q, 'p.deleted_at', visibility)

    if (filters.fromDate) q = q.where('p.purchase_date', '>=', new Date(filters.fromDate))
    if (filters.toDate) {
      const to = new Date(filters.toDate)
      to.setHours(23, 59, 59, 999)
      q = q.where('p.purchase_date', '<=', to)
    }
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`
      q = q.where((builder) => {
        builder.whereILike('s.name', term).orWhereExists(
          db('product_items as pi')
            .whereRaw('pi.purchase_id = p.id')
            .whereNull('pi.deleted_at')
            .where((ib) => {
              ib.whereILike('pi.serial_number', term).orWhereILike('pi.motor_number', term)
            })
        )
      })
    }

    const purchases = await q
      .select('p.*', 's.name as supplier_name', 'b.name as branch_name')
      .orderBy('p.purchase_date', 'desc')

    for (const purchase of purchases) {
      const items = await db('product_items')
        .where({ purchase_id: purchase.id })
        .whereNull('deleted_at')
      const totalValue = items.reduce((sum, item) => sum + Number(item.purchase_price || 0), 0)
      const soldCount = items.filter((i) => i.status === ProductItemStatus.SOLD).length
      const voided = Boolean(purchase.deleted_at)
      rows.push({
        key: `product-${purchase.id}`,
        kind: 'product',
        id: purchase.id,
        purchaseDate: purchase.purchase_date,
        supplier: purchase.supplier_name ? { name: purchase.supplier_name } : null,
        branchName: purchase.branch_name || null,
        itemCount: items.length,
        totalValue: roundAmount(totalValue),
        editable: !voided && items.length > 0 && soldCount === 0,
        soldCount,
        deletedAt: purchase.deleted_at || null,
        voided
      })
    }
  }

  if (kind === 'all' || kind === 'part') {
    let q = db('part_purchases as p')
      .leftJoin('suppliers as s', 'p.supplier_id', 's.id')
      .leftJoin('branches as b', 'p.branch_id', 'b.id')
      .where({ 'p.company_id': companyId })
    q = applyDeletedVisibility(q, 'p.deleted_at', visibility)

    if (filters.fromDate) q = q.where('p.purchase_date', '>=', new Date(filters.fromDate))
    if (filters.toDate) {
      const to = new Date(filters.toDate)
      to.setHours(23, 59, 59, 999)
      q = q.where('p.purchase_date', '<=', to)
    }
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`
      q = q.where((builder) => {
        builder.whereILike('s.name', term).orWhereExists(
          db('part_purchase_lines as pl')
            .leftJoin('parts as pt', 'pl.part_id', 'pt.id')
            .whereRaw('pl.part_purchase_id = p.id')
            .whereNull('pl.deleted_at')
            .whereILike('pt.name', term)
        )
      })
    }

    const purchases = await q
      .select('p.*', 's.name as supplier_name', 'b.name as branch_name')
      .orderBy('p.purchase_date', 'desc')

    for (const purchase of purchases) {
      const lines = await db('part_purchase_lines')
        .where({ part_purchase_id: purchase.id })
        .whereNull('deleted_at')
      const totalValue = lines.reduce(
        (sum, line) => sum + Number(line.quantity) * Number(line.unit_cost || 0),
        0
      )
      const consumed = lines.some(
        (line) => Number(line.quantity_remaining) < Number(line.quantity)
      )
      const voided = Boolean(purchase.deleted_at)
      rows.push({
        key: `part-${purchase.id}`,
        kind: 'part',
        id: purchase.id,
        purchaseDate: purchase.purchase_date,
        supplier: purchase.supplier_name ? { name: purchase.supplier_name } : null,
        branchName: purchase.branch_name || null,
        itemCount: lines.length,
        totalValue: roundAmount(totalValue),
        editable: !voided && !consumed,
        soldCount: consumed ? 1 : 0,
        deletedAt: purchase.deleted_at || null,
        voided
      })
    }
  }

  rows.sort((a, b) => {
    const da = new Date(String(a.purchaseDate)).getTime()
    const db_ = new Date(String(b.purchaseDate)).getTime()
    return db_ - da
  })

  const total = rows.length
  const offset = (page - 1) * pageSize
  return {
    rows: rows.slice(offset, offset + pageSize),
    total,
    page,
    pageSize
  }
}

export async function getPurchaseDetail(companyId: string, purchaseId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const purchase = await db('purchases as p')
    .leftJoin('suppliers as s', 'p.supplier_id', 's.id')
    .leftJoin('branches as b', 'p.branch_id', 'b.id')
    .where({ 'p.id': purchaseId, 'p.company_id': companyId })
    .select('p.*', 's.name as supplier_name', 'b.name as branch_name')
    .first()
  if (!purchase) throw new Error('Purchase not found')

  const items = await db('product_items as pi')
    .leftJoin('products as pr', 'pi.product_id', 'pr.id')
    .leftJoin('categories as c', 'pi.category_id', 'c.id')
    .leftJoin('colors as co', 'pi.color_id', 'co.id')
    .where({ 'pi.purchase_id': purchaseId })
    .whereNull('pi.deleted_at')
    .select(
      'pi.*',
      'pr.name as product_name',
      'c.name as category_name',
      'co.name as color_name'
    )
    .orderBy('pi.serial_number', 'asc')

  const sold = items.filter((i) => i.status !== ProductItemStatus.IN_STOCK)
  return {
    kind: 'product' as const,
    purchase: {
      ...asJson(purchase),
      branchName: purchase.branch_name || null,
      supplier: purchase.supplier_name ? { name: purchase.supplier_name } : null
    },
    items: items.map((item) => ({
      ...asJson(item),
      product: item.product_name ? { name: item.product_name } : null,
      category: item.category_name ? { name: item.category_name } : null,
      color: item.color_name ? { name: item.color_name } : null
    })),
    impact: {
      canVoid: sold.length === 0 && items.length > 0 && !purchase.deleted_at,
      blockers: sold.length
        ? sold.map(
            (i) =>
              `Unit ${i.serial_number || i.id} is ${i.status} — remove/void related sales first`
          )
        : purchase.deleted_at
          ? ['Purchase already deleted']
          : items.length === 0
            ? ['Purchase has no units']
            : [],
      inStockCount: items.filter((i) => i.status === ProductItemStatus.IN_STOCK).length,
      totalUnits: items.length
    }
  }
}

export async function getPartPurchaseDetail(companyId: string, purchaseId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const purchase = await db('part_purchases as p')
    .leftJoin('suppliers as s', 'p.supplier_id', 's.id')
    .leftJoin('branches as b', 'p.branch_id', 'b.id')
    .where({ 'p.id': purchaseId, 'p.company_id': companyId })
    .select('p.*', 's.name as supplier_name', 'b.name as branch_name')
    .first()
  if (!purchase) throw new Error('Part purchase not found')

  const lines = await db('part_purchase_lines as pl')
    .leftJoin('parts as pt', 'pl.part_id', 'pt.id')
    .where({ 'pl.part_purchase_id': purchaseId })
    .whereNull('pl.deleted_at')
    .select('pl.*', 'pt.name as part_name', 'pt.sku as part_sku')
    .orderBy('pl.created_at', 'asc')

  const blockers: string[] = []
  if (purchase.deleted_at) blockers.push('Purchase already deleted')
  for (const line of lines) {
    const qty = Number(line.quantity)
    const remaining = Number(line.quantity_remaining)
    if (remaining < qty) {
      blockers.push(
        `${line.part_name || line.part_id}: ${qty - remaining} already sold from this lot`
      )
    }
  }

  return {
    kind: 'part' as const,
    purchase: {
      ...asJson(purchase),
      branchName: purchase.branch_name || null,
      supplier: purchase.supplier_name ? { name: purchase.supplier_name } : null
    },
    lines: lines.map((line) => ({
      ...asJson(line),
      partName: line.part_name,
      partSku: line.part_sku
    })),
    impact: {
      canVoid: blockers.length === 0 && lines.length > 0,
      blockers,
      lineCount: lines.length
    }
  }
}

export async function voidPurchase(
  companyId: string,
  purchaseId: string,
  options: { reason?: string } = {}
) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const reason = (options.reason || '').trim()
  if (!reason) throw new Error('Reason is required')

  return db.transaction(async (trx) => {
    const purchase = await trx('purchases')
      .where({ id: purchaseId, company_id: companyId })
      .forUpdate()
      .first()
    if (!purchase) throw new Error('Purchase not found')
    if (purchase.deleted_at) throw new Error('Purchase already deleted')

    const items = await trx('product_items')
      .where({ purchase_id: purchaseId })
      .whereNull('deleted_at')
      .forUpdate()

    const blocked = items.filter((i) => i.status !== ProductItemStatus.IN_STOCK)
    if (blocked.length) {
      throw new Error(
        `Cannot void — ${blocked.length} unit(s) are not in stock (sold or reserved)`
      )
    }

    const now = new Date()
    for (const item of items) {
      await trx('product_items')
        .where({ id: item.id, status: ProductItemStatus.IN_STOCK })
        .update({
          deleted_at: now,
          updated_at: now,
          serial_number: `${item.serial_number}__del__${item.id}`
        })
      await trx('inventory_movements').insert({
        id: randomUUID(),
        company_id: companyId,
        product_item_id: item.id,
        movement_type: MovementType.ADJUSTMENT,
        from_branch_id: purchase.branch_id,
        reference_type: 'purchase_void',
        reference_id: purchaseId,
        created_at: now
      })
    }

    await trx('purchases').where({ id: purchaseId }).update({
      deleted_at: now,
      updated_at: now,
      notes: `${purchase.notes || ''}\n[VOID ${now.toISOString()}] ${reason}`.trim()
    })

    return { purchaseId, kind: 'product', voided: true, unitsRemoved: items.length, reason }
  })
}

export async function voidPartPurchase(
  companyId: string,
  purchaseId: string,
  options: { reason?: string } = {}
) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const reason = (options.reason || '').trim()
  if (!reason) throw new Error('Reason is required')

  return db.transaction(async (trx) => {
    const purchase = await trx('part_purchases')
      .where({ id: purchaseId, company_id: companyId })
      .forUpdate()
      .first()
    if (!purchase) throw new Error('Part purchase not found')
    if (purchase.deleted_at) throw new Error('Purchase already deleted')

    const lines = await trx('part_purchase_lines')
      .where({ part_purchase_id: purchaseId })
      .whereNull('deleted_at')
      .forUpdate()

    for (const line of lines) {
      if (Number(line.quantity_remaining) < Number(line.quantity)) {
        throw new Error(
          `Cannot void — stock already sold from part line ${line.id}`
        )
      }
    }

    const now = new Date()
    const branchId = String(purchase.branch_id)
    for (const line of lines) {
      const qty = Number(line.quantity)
      if (qty > 0) {
        await applyPartStockDelta(trx, {
          companyId,
          branchId,
          partId: String(line.part_id),
          deltaQty: -qty,
          movementType: MovementType.ADJUSTMENT,
          referenceType: 'purchase_void',
          referenceId: purchaseId,
          notes: `Void part purchase: ${reason}`
        })
      }
      await trx('part_purchase_lines').where({ id: line.id }).update({
        deleted_at: now,
        updated_at: now,
        quantity_remaining: 0
      })
    }

    await trx('part_purchases').where({ id: purchaseId }).update({
      deleted_at: now,
      updated_at: now,
      notes: `${purchase.notes || ''}\n[VOID ${now.toISOString()}] ${reason}`.trim()
    })

    return { purchaseId, kind: 'part', voided: true, linesRemoved: lines.length, reason }
  })
}

async function computeBalanceForCustomer(db: Knex | Knex.Transaction, customerId: string) {
  const rows = await db('ledger_entries').where({ customer_id: customerId }).select('type', 'amount')
  return roundAmount(
    rows.reduce((balance, row) => {
      const amount = Number(row.amount || 0)
      return row.type === 'payment_credit' ? balance - amount : balance + amount
    }, 0)
  )
}

export async function listCustomers(
  companyId: string,
  filters: ListFilters & { dueFilter?: string } = {}
) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const page = Math.max(1, filters.page || 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 25))

  let q = db('customers').where({ company_id: companyId })
  q = applyDeletedVisibility(q, 'deleted_at', resolveVisibility(filters))
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`
    q = q.where((b) => {
      b.whereILike('name', term).orWhereILike('phone', term).orWhereILike('cnic', term)
    })
  }

  const customers = await q.clone().orderBy('name', 'asc').select('*')
  let rows = []
  for (const customer of customers) {
    const balance = await computeBalanceForCustomer(db, String(customer.id))
    rows.push({
      ...asJson(customer),
      balance
    })
  }

  if (filters.dueFilter === 'due') {
    rows = rows.filter((r) => Number(r.balance) > 0)
  } else if (filters.dueFilter === 'credit') {
    rows = rows.filter((r) => Number(r.balance) < 0)
  } else if (filters.dueFilter === 'clear') {
    rows = rows.filter((r) => Number(r.balance) === 0)
  }

  const total = rows.length
  const offset = (page - 1) * pageSize
  return {
    rows: rows.slice(offset, offset + pageSize),
    total,
    page,
    pageSize
  }
}

export async function getCustomerDetail(companyId: string, customerId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const customer = await db('customers')
    .where({ id: customerId, company_id: companyId })
    .first()
  if (!customer) throw new Error('Customer not found')

  const balance = await computeBalanceForCustomer(db, customerId)
  const ledger = await db('ledger_entries')
    .where({ customer_id: customerId })
    .orderBy('created_at', 'desc')
    .limit(50)

  const recentSales = await db('sales')
    .where({ company_id: companyId, customer_id: customerId })
    .whereNull('deleted_at')
    .orderBy('sale_date', 'desc')
    .orderBy('created_at', 'desc')
    .limit(20)

  const openDues = await db('sales')
    .where({ company_id: companyId, customer_id: customerId })
    .whereNull('deleted_at')
    .where('due_amount', '>', 0)
    .select(
      db.raw('COUNT(*)::int as count'),
      db.raw('COALESCE(SUM(due_amount), 0) as total')
    )
    .first()

  return {
    customer: {
      ...asJson(customer),
      balance
    },
    ledger: rowsToCamel(ledger),
    recentSales: rowsToCamel(recentSales),
    openDues: {
      count: Number(openDues?.count ?? 0),
      total: roundAmount(Number(openDues?.total ?? 0))
    }
  }
}

export async function updateCustomer(
  companyId: string,
  customerId: string,
  patch: { name?: string; phone?: string; cnic?: string; address?: string }
) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const customer = await db('customers')
    .where({ id: customerId, company_id: companyId })
    .whereNull('deleted_at')
    .first()
  if (!customer) throw new Error('Customer not found')

  const name = patch.name !== undefined ? String(patch.name).trim() : undefined
  if (name !== undefined && !name) throw new Error('Name is required')

  const update: Record<string, unknown> = { updated_at: new Date() }
  if (name !== undefined) update.name = name
  if (patch.phone !== undefined) update.phone = String(patch.phone || '')
  if (patch.cnic !== undefined) update.cnic = String(patch.cnic || '')
  if (patch.address !== undefined) update.address = String(patch.address || '')

  const [updated] = await db('customers').where({ id: customerId }).update(update).returning('*')
  const balance = await computeBalanceForCustomer(db, customerId)
  return { ...asJson(updated), balance }
}

export async function softDeleteCustomer(companyId: string, customerId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })
  const customer = await db('customers')
    .where({ id: customerId, company_id: companyId })
    .whereNull('deleted_at')
    .first()
  if (!customer) throw new Error('Customer not found')

  const balance = await computeBalanceForCustomer(db, customerId)
  if (balance > 0) throw new Error('Cannot delete a customer with outstanding balance')

  await db('customers').where({ id: customerId }).update({
    deleted_at: new Date(),
    updated_at: new Date()
  })
  return { ok: true, customerId }
}

/**
 * Super-admin: set customer ledger outstanding to an exact target by posting
 * one correcting sale_debit / payment_credit. Does not change sale due_amounts.
 */
export async function setCustomerOutstanding(
  companyId: string,
  customerId: string,
  options: { outstanding: number; reason?: string }
) {
  const reason = (options.reason || '').trim()
  if (!reason) throw new Error('Reason is required')

  const target = roundAmount(Number(options.outstanding))
  if (!Number.isFinite(target)) throw new Error('Outstanding must be a valid number')

  const db = await getCompanyDb(companyId, { forOps: true })

  return db.transaction(async (trx) => {
    const customer = await trx('customers')
      .where({ id: customerId, company_id: companyId })
      .forUpdate()
      .first()
    if (!customer) throw new Error('Customer not found')

    const previous = await customerBalance(trx, customerId)
    const delta = roundAmount(target - previous)
    if (delta === 0) {
      return {
        customerId,
        previous,
        outstanding: previous,
        adjusted: false,
        adjustment: null as null | { type: string; amount: number },
        reason
      }
    }

    const type = delta > 0 ? ('sale_debit' as const) : ('payment_credit' as const)
    const amount = Math.abs(delta)
    const adjustmentId = randomUUID()
    await insertLedger(
      trx,
      companyId,
      customerId,
      type,
      amount,
      'admin_balance_set',
      adjustmentId
    )

    const outstanding = await customerBalance(trx, customerId)
    return {
      customerId,
      previous,
      outstanding,
      adjusted: true,
      adjustment: { type, amount, referenceId: adjustmentId },
      reason
    }
  })
}

function startOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function daysAgo(n: number) {
  const x = startOfDay()
  x.setDate(x.getDate() - n)
  return x
}

async function salePeriodStats(db: Knex, companyId: string, from: Date) {
  const row = await db('sales')
    .where({ company_id: companyId })
    .whereNull('deleted_at')
    .whereNot('status', SaleStatus.CANCELLED)
    .where('sale_date', '>=', from)
    .select(
      db.raw('COUNT(*)::int as count'),
      db.raw('COALESCE(SUM(net_total), 0) as net_total'),
      db.raw('COALESCE(SUM(paid_amount), 0) as paid_amount'),
      db.raw('COALESCE(SUM(due_amount), 0) as due_amount')
    )
    .first()
  return {
    count: Number(row?.count ?? 0),
    netTotal: roundAmount(Number(row?.net_total ?? 0)),
    paidAmount: roundAmount(Number(row?.paid_amount ?? 0)),
    dueAmount: roundAmount(Number(row?.due_amount ?? 0))
  }
}

export async function getBusinessDashboard(companyId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })

  const today = startOfDay()
  const weekAgo = daysAgo(7)
  const monthAgo = daysAgo(30)

  const [todayStats, weekStats, monthStats] = await Promise.all([
    salePeriodStats(db, companyId, today),
    salePeriodStats(db, companyId, weekAgo),
    salePeriodStats(db, companyId, monthAgo)
  ])

  const duesRow = await db('sales')
    .where({ company_id: companyId })
    .whereNull('deleted_at')
    .where('due_amount', '>', 0)
    .select(
      db.raw('COUNT(*)::int as count'),
      db.raw('COALESCE(SUM(due_amount), 0) as total')
    )
    .first()

  const voidedRow = await db('sales')
    .where({ company_id: companyId })
    .where((b) => {
      b.whereNotNull('deleted_at').orWhere('status', SaleStatus.CANCELLED)
    })
    .count('* as count')
    .first()

  const customerCount = Number(
    (
      await db('customers')
        .where({ company_id: companyId })
        .whereNull('deleted_at')
        .count('* as count')
        .first()
    )?.count ?? 0
  )

  const branchCount = Number(
    (
      await db('branches')
        .where({ company_id: companyId })
        .whereNull('deleted_at')
        .count('* as count')
        .first()
    )?.count ?? 0
  )

  const stockInStock = Number(
    (
      await db('product_items')
        .where({ company_id: companyId, status: ProductItemStatus.IN_STOCK })
        .whereNull('deleted_at')
        .count('* as count')
        .first()
    )?.count ?? 0
  )

  const stockSold = Number(
    (
      await db('product_items')
        .where({ company_id: companyId, status: ProductItemStatus.SOLD })
        .whereNull('deleted_at')
        .count('* as count')
        .first()
    )?.count ?? 0
  )

  let partStockUnits = 0
  if (await db.schema.hasTable('part_stocks')) {
    const partRow = await db('part_stocks')
      .where({ company_id: companyId })
      .select(db.raw('COALESCE(SUM(quantity_on_hand), 0) as total'))
      .first()
    partStockUnits = roundAmount(Number(partRow?.total ?? 0))
  }

  const purchasesWeek = Number(
    (
      await db('purchases')
        .where({ company_id: companyId })
        .whereNull('deleted_at')
        .where('purchase_date', '>=', weekAgo)
        .count('* as count')
        .first()
    )?.count ?? 0
  )

  let partPurchasesWeek = 0
  if (await db.schema.hasTable('part_purchases')) {
    partPurchasesWeek = Number(
      (
        await db('part_purchases')
          .where({ company_id: companyId })
          .whereNull('deleted_at')
          .where('purchase_date', '>=', weekAgo)
          .count('* as count')
          .first()
      )?.count ?? 0
    )
  }

  // Top dues
  const topDues = await db('sales as s')
    .leftJoin('customers as c', 's.customer_id', 'c.id')
    .where({ 's.company_id': companyId })
    .whereNull('s.deleted_at')
    .where('s.due_amount', '>', 0)
    .select('s.id', 's.sale_date', 's.net_total', 's.paid_amount', 's.due_amount', 'c.name as customer_name')
    .orderBy('s.due_amount', 'desc')
    .limit(8)

  // Recent sales
  const recentSales = await db('sales as s')
    .leftJoin('customers as c', 's.customer_id', 'c.id')
    .where({ 's.company_id': companyId })
    .whereNull('s.deleted_at')
    .select(
      's.id',
      's.sale_date',
      's.net_total',
      's.paid_amount',
      's.due_amount',
      's.status',
      'c.name as customer_name'
    )
    .orderBy('s.created_at', 'desc')
    .limit(8)

  // Health: paid + due != net (tolerance 1)
  const mismatchSales = await db('sales')
    .where({ company_id: companyId })
    .whereNull('deleted_at')
    .whereNot('status', SaleStatus.CANCELLED)
    .whereRaw('ABS(COALESCE(paid_amount,0) + COALESCE(due_amount,0) - COALESCE(net_total,0)) > 1')
    .select('id', 'sale_date', 'net_total', 'paid_amount', 'due_amount')
    .orderBy('sale_date', 'desc')
    .limit(20)

  // Health: sold units with no non-deleted sale line pointing at them
  const orphanSold = await db('product_items as pi')
    .where({ 'pi.company_id': companyId, 'pi.status': ProductItemStatus.SOLD })
    .whereNull('pi.deleted_at')
    .whereNotExists(function () {
      this.select(db.raw(1))
        .from('sale_lines as sl')
        .join('sales as s', 's.id', 'sl.sale_id')
        .whereRaw('sl.product_item_id = pi.id')
        .whereNull('s.deleted_at')
        .whereNot('s.status', SaleStatus.CANCELLED)
    })
    .select('pi.id', 'pi.serial_number', 'pi.status')
    .limit(20)

  // Health: live sale lines whose product unit is not sold
  const staleSaleUnits = await db('sale_lines as sl')
    .join('sales as s', 's.id', 'sl.sale_id')
    .join('product_items as pi', 'pi.id', 'sl.product_item_id')
    .where({ 's.company_id': companyId })
    .whereNull('s.deleted_at')
    .whereNot('s.status', SaleStatus.CANCELLED)
    .whereNotNull('sl.product_item_id')
    .whereNot('pi.status', ProductItemStatus.SOLD)
    .select(
      's.id as sale_id',
      'sl.id as sale_line_id',
      'pi.id as product_item_id',
      'pi.serial_number',
      'pi.status'
    )
    .limit(20)

  // Branch sales (30d)
  const byBranch = await db('sales as s')
    .leftJoin('branches as b', 's.branch_id', 'b.id')
    .where({ 's.company_id': companyId })
    .whereNull('s.deleted_at')
    .whereNot('s.status', SaleStatus.CANCELLED)
    .where('s.sale_date', '>=', monthAgo)
    .select(
      's.branch_id',
      'b.name as branch_name',
      db.raw('COUNT(*)::int as count'),
      db.raw('COALESCE(SUM(s.net_total), 0) as net_total'),
      db.raw('COALESCE(SUM(s.due_amount), 0) as due_amount')
    )
    .groupBy('s.branch_id', 'b.name')
    .orderByRaw('SUM(s.net_total) DESC')

  const healthIssues = [
    ...mismatchSales.map((s) => ({
      type: 'finance_mismatch' as const,
      severity: 'warning' as const,
      saleId: s.id as string,
      title: 'Paid + due ≠ net',
      detail: `Net ${roundAmount(Number(s.net_total))} · Paid ${roundAmount(Number(s.paid_amount))} · Due ${roundAmount(Number(s.due_amount))}`
    })),
    ...orphanSold.map((u) => ({
      type: 'orphan_sold_unit' as const,
      severity: 'error' as const,
      productItemId: u.id as string,
      title: 'Sold unit with no live sale',
      detail: `Chassis ${u.serial_number || u.id}`
    })),
    ...staleSaleUnits.map((u) => ({
      type: 'stale_sale_unit' as const,
      severity: 'error' as const,
      saleId: u.sale_id as string,
      productItemId: u.product_item_id as string,
      title: 'Sale line unit not marked sold',
      detail: `Chassis ${u.serial_number || u.product_item_id} is ${u.status}`
    }))
  ]

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      customers: customerCount,
      branches: branchCount,
      productInStock: stockInStock,
      productSold: stockSold,
      partStockUnits,
      purchasesLast7Days: purchasesWeek + partPurchasesWeek,
      voidedSales: Number(voidedRow?.count ?? 0)
    },
    sales: {
      today: todayStats,
      last7Days: weekStats,
      last30Days: monthStats
    },
    dues: {
      count: Number(duesRow?.count ?? 0),
      total: roundAmount(Number(duesRow?.total ?? 0))
    },
    byBranch: byBranch.map((r) => ({
      branchId: r.branch_id,
      branchName: r.branch_name || 'Unknown',
      count: Number(r.count ?? 0),
      netTotal: roundAmount(Number(r.net_total ?? 0)),
      dueAmount: roundAmount(Number(r.due_amount ?? 0))
    })),
    topDues: topDues.map((s) => ({
      id: s.id,
      saleDate: s.sale_date,
      netTotal: roundAmount(Number(s.net_total)),
      paidAmount: roundAmount(Number(s.paid_amount)),
      dueAmount: roundAmount(Number(s.due_amount)),
      customerName: s.customer_name || null
    })),
    recentSales: recentSales.map((s) => ({
      id: s.id,
      saleDate: s.sale_date,
      netTotal: roundAmount(Number(s.net_total)),
      paidAmount: roundAmount(Number(s.paid_amount)),
      dueAmount: roundAmount(Number(s.due_amount)),
      status: s.status,
      customerName: s.customer_name || null
    })),
    health: {
      issueCount: healthIssues.length,
      financeMismatches: mismatchSales.length,
      orphanSoldUnits: orphanSold.length,
      staleSaleUnits: staleSaleUnits.length,
      issues: healthIssues.slice(0, 25)
    }
  }
}

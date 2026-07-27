import type { Knex } from 'knex'
import {
  LedgerEntryType,
  MovementType,
  PaymentMethod,
  ProductItemStatus,
  SaleStatus
} from '@madix/database'
import { getDb, withTransaction } from '../../db'
import { generateId } from '../../../common/utils/uuid'
import { computeCustomerBalance } from '../customer/customer.service'
import { applyPartStockDelta } from '../part/part-stock.helpers'
import {
  consumePartStockFifo,
  previewPartFifoCost,
  restorePartSaleAllocations
} from '../part/part-fifo.helpers'
import { Roles } from '../../../common/constants/roles'
import {
  AUDIT_USER_SELECT,
  type AuditContext,
  applyStaffScope,
  auditCreate,
  auditUpdate,
  enrichAuditUsers,
  joinAuditUsers,
  withAuditCreateWithDevice,
  withAuditUpdate
} from '../shared/audit.helpers'
import { asJson, asJsonList } from '../shared/json.helpers'

export type SaleLineType = 'product' | 'part'

export type CustomTaxInput = {
  taxId?: string
  name: string
  percent: number
  inclusive?: boolean
}

export type SaleLineInput = {
  lineType?: SaleLineType
  productItemId?: string
  partId?: string
  quantity?: number
  salePrice: number
  taxPercent?: number
  /** When true, Sale Tax + Tax u/s 236 G/H are treated as inclusive in the entered price. */
  taxInclusive?: boolean
  whtPercent?: number
  /** Custom (non-system) taxes applied on this line. */
  customTaxes?: CustomTaxInput[]
  warrantyActive?: boolean
  /** Integer years of warranty; expiry is computed from sale date. */
  warrantyYears?: number
  /** @deprecated Prefer warrantyYears; kept for older clients. */
  warrantyExpiryDate?: string
}

export type CreateSalePayload = {
  customerId: string
  saleDate: string
  discount?: number
  paidAmount?: number
  paymentMethod?: string
  dueReminderDate?: string
  notes?: string
  lines: SaleLineInput[]
}

export type UpdateSalePayload = {
  customerId: string
  saleDate: string
  discount?: number
  dueReminderDate?: string
  notes?: string
  lines: SaleLineInput[]
}

export type RecordPaymentPayload = {
  saleId: string
  amount: number
  method?: string
  paymentDate?: string
}

export type UpdatePaymentPayload = {
  paymentId: string
  amount: number
  method?: string
  paymentDate?: string
}

export type SaleListFilters = {
  customerId?: string
  fromDate?: string
  toDate?: string
  billNo?: string
  search?: string
  sortField?: string
  sortOrder?: string
}

/** Round to whole rupees: ≥.5 up, below .5 drop decimals. */
function round2(n: number): number {
  return Math.round(Number(n) || 0)
}

function normalizeLineType(line: SaleLineInput): SaleLineType {
  if (line.lineType === 'part' || line.partId) return 'part'
  return 'product'
}

type CustomTaxCalc = {
  taxId: string | null
  name: string
  percent: number
  inclusive: boolean
  amount: number
}

function calcLine(line: SaleLineInput) {
  const quantity = Math.max(1, Math.floor(Number(line.quantity || 1)))
  const taxPercent = Number(line.taxPercent || 0)
  const whtPercent = Number(line.whtPercent || 0)
  const systemInclusive = Boolean(line.taxInclusive)
  const enteredUnitPrice = Number(line.salePrice || 0)
  const enteredTotal = round2(enteredUnitPrice * quantity)

  const customsIn = (line.customTaxes || [])
    .map((t) => ({
      taxId: t.taxId || null,
      name: String(t.name || '').trim() || 'Tax',
      percent: Number(t.percent || 0),
      inclusive: Boolean(t.inclusive)
    }))
    .filter((t) => t.percent > 0)

  type Piece = {
    id: string
    kind: 'sale' | 'wht' | 'custom'
    taxId: string | null
    name: string
    percent: number
    inclusive: boolean
  }

  const pieces: Piece[] = []
  if (taxPercent > 0) {
    pieces.push({
      id: 'sale',
      kind: 'sale',
      taxId: null,
      name: 'Sale Tax',
      percent: taxPercent,
      inclusive: systemInclusive
    })
  }
  if (whtPercent > 0) {
    pieces.push({
      id: 'wht',
      kind: 'wht',
      taxId: null,
      name: 'Tax u/s 236 G/H',
      percent: whtPercent,
      inclusive: systemInclusive
    })
  }
  customsIn.forEach((c, i) => {
    pieces.push({
      id: `custom-${i}`,
      kind: 'custom',
      taxId: c.taxId,
      name: c.name,
      percent: c.percent,
      inclusive: c.inclusive
    })
  })

  const inclusivePieces = pieces.filter((p) => p.inclusive)
  const exclusivePieces = pieces.filter((p) => !p.inclusive)
  const hasInclusive = inclusivePieces.length > 0
  const inclusiveRateSum = inclusivePieces.reduce((s, p) => s + p.percent, 0)
  const factor = 1 + inclusiveRateSum / 100

  const unitPrice = hasInclusive ? round2(enteredUnitPrice / factor) : enteredUnitPrice
  const extended = round2(unitPrice * quantity)

  const amountById = new Map<string, number>()
  for (const p of pieces) {
    amountById.set(p.id, round2((extended * p.percent) / 100))
  }

  let lineTotal: number
  if (hasInclusive) {
    const exclusiveSum = exclusivePieces.reduce((s, p) => s + (amountById.get(p.id) || 0), 0)
    const targetInclusive = round2(enteredTotal - extended)
    // Reassign inclusive amounts so they sum to targetInclusive (remainder on last).
    let allocated = 0
    inclusivePieces.forEach((p, idx) => {
      if (idx === inclusivePieces.length - 1) {
        amountById.set(p.id, round2(targetInclusive - allocated))
      } else {
        const amt = amountById.get(p.id) || 0
        allocated += amt
      }
    })
    lineTotal = round2(enteredTotal + exclusiveSum)
  } else {
    const allSum = pieces.reduce((s, p) => s + (amountById.get(p.id) || 0), 0)
    lineTotal = round2(extended + allSum)
  }

  const taxAmount = amountById.get('sale') || 0
  const whtAmount = amountById.get('wht') || 0
  const customTaxes: CustomTaxCalc[] = pieces
    .filter((p) => p.kind === 'custom')
    .map((p) => ({
      taxId: p.taxId,
      name: p.name,
      percent: p.percent,
      inclusive: p.inclusive,
      amount: amountById.get(p.id) || 0
    }))
  const otherTaxAmount = round2(customTaxes.reduce((s, t) => s + t.amount, 0))

  return {
    quantity,
    unitPrice,
    extended,
    taxPercent,
    whtPercent,
    taxInclusive: systemInclusive,
    taxAmount,
    whtAmount,
    otherTaxAmount,
    customTaxes,
    lineTotal
  }
}

type LineCalc = {
  lineType: SaleLineType
  line: SaleLineInput
  productItem?: Record<string, unknown>
  partId?: string
  productName: string
  categoryName: string
  colorName: string
  serialNumber: string | null
  warrantyActive: boolean
  warrantyYears: number | null
  warrantyExpiry: Date | null
  quantity: number
  unitPrice: number
  extended: number
  taxPercent: number
  whtPercent: number
  taxInclusive: boolean
  taxAmount: number
  whtAmount: number
  otherTaxAmount: number
  customTaxes: CustomTaxCalc[]
  lineTotal: number
  unitCost?: number
}

async function insertSaleLineTaxes(
  transaction: Knex.Transaction,
  companyId: string,
  saleId: string,
  saleLineId: string,
  customs: CustomTaxCalc[],
  lineAudit: Record<string, unknown>
): Promise<void> {
  for (const tax of customs) {
    await getDb()('sale_line_taxes').transacting(transaction).insert({
      id: generateId(),
      company_id: companyId,
      sale_id: saleId,
      sale_line_id: saleLineId,
      tax_id: tax.taxId,
      name: tax.name,
      percent: tax.percent,
      amount: tax.amount,
      inclusive: tax.inclusive,
      ...lineAudit,
      created_at: new Date(),
      updated_at: new Date()
    })
  }
}

function resolveWarranty(
  saleDate: Date,
  warrantyActive: boolean,
  warrantyYears?: number,
  warrantyExpiryDate?: string
): { warrantyActive: boolean; warrantyYears: number | null; warrantyExpiry: Date | null } {
  if (!warrantyActive) {
    return { warrantyActive: false, warrantyYears: null, warrantyExpiry: null }
  }
  const years = Math.floor(Number(warrantyYears ?? 0))
  if (Number.isFinite(years) && years >= 1) {
    const expiry = new Date(saleDate)
    expiry.setFullYear(expiry.getFullYear() + years)
    return { warrantyActive: true, warrantyYears: years, warrantyExpiry: expiry }
  }
  if (warrantyExpiryDate) {
    const expiry = new Date(warrantyExpiryDate)
    if (!Number.isNaN(expiry.getTime())) {
      return { warrantyActive: true, warrantyYears: null, warrantyExpiry: expiry }
    }
  }
  throw new Error('Warranty years (whole number ≥ 1) required when warranty is active')
}

function assertCanEditSale(ctx: AuditContext): void {
  if (ctx.role !== Roles.COMPANY_OWNER && ctx.role !== Roles.SUPER_ADMIN) {
    throw new Error('Only company owners can edit sales')
  }
}

function assertCanEditPayment(ctx: AuditContext): void {
  if (ctx.role !== Roles.COMPANY_OWNER && ctx.role !== Roles.SUPER_ADMIN) {
    throw new Error('Only company owners can edit payments')
  }
}

async function saleEditable(
  sale: Record<string, unknown>,
  lines: Record<string, unknown>[]
): Promise<boolean> {
  if (sale.deleted_at) return false
  if (sale.status === SaleStatus.CANCELLED) return false

  for (const line of lines) {
    const lineType = (line.line_type as string) || (line.part_id ? 'part' : 'product')
    if (lineType === 'part') continue
    const productItemId = line.product_item_id as string | undefined
    if (!productItemId) continue
    const item = await getDb()('product_items').where({ id: productItemId }).first()
    if (!item || item.status !== ProductItemStatus.SOLD) return false
  }
  return true
}

async function reverseProductSaleLine(
  transaction: Knex.Transaction,
  companyId: string,
  branchId: string,
  saleId: string,
  line: Record<string, unknown>,
  ctx: AuditContext
): Promise<void> {
  const productItemId = line.product_item_id as string
  if (!productItemId) return

  const item = await getDb()('product_items').transacting(transaction).where({ id: productItemId }).first()
  if (!item) throw new Error('Product unit not found')

  if (item.status !== ProductItemStatus.SOLD) {
    throw new Error(`Cannot edit sale — unit ${line.serial_number} is no longer sold`)
  }

  const updated = await getDb()('product_items')
    .transacting(transaction)
    .where({ id: productItemId, status: ProductItemStatus.SOLD })
    .update({
      status: ProductItemStatus.IN_STOCK,
      sold_at: null,
      version: Number(item.version || 1) + 1,
      ...auditUpdate(ctx)
    })
  if (!updated) {
    throw new Error(`Cannot edit sale — unit ${line.serial_number} is no longer sold`)
  }

  const lineAudit = auditCreate(ctx)
  await getDb()('inventory_movements').transacting(transaction).insert({
    id: generateId(),
    company_id: companyId,
    product_item_id: productItemId,
    movement_type: MovementType.RETURN,
    to_branch_id: branchId,
    reference_type: 'sale_edit',
    reference_id: saleId,
    ...lineAudit,
    created_at: new Date()
  })
}

async function reversePartSaleLine(
  transaction: Knex.Transaction,
  companyId: string,
  branchId: string,
  saleId: string,
  line: Record<string, unknown>,
  ctx: AuditContext
): Promise<void> {
  const partId = line.part_id as string
  if (!partId) return
  const quantity = Math.max(1, Math.floor(Number(line.quantity || 1)))
  const saleLineId = line.id as string

  if (saleLineId) {
    await restorePartSaleAllocations(transaction, saleLineId, ctx)
  }

  await applyPartStockDelta(transaction, {
    companyId,
    branchId,
    partId,
    deltaQty: quantity,
    movementType: MovementType.RETURN,
    referenceType: 'sale_edit',
    referenceId: saleId,
    notes: 'Reversed for sale edit',
    ctx
  })
}

async function applySaleEditLedger(
  transaction: Knex.Transaction,
  companyId: string,
  ctx: AuditContext,
  saleId: string,
  oldCustomerId: string,
  newCustomerId: string,
  oldNetTotal: number,
  newNetTotal: number,
  totalPaid: number
): Promise<void> {
  const now = new Date()
  const lineAudit = auditCreate(ctx)

  if (oldCustomerId === newCustomerId) {
    const delta = round2(newNetTotal - oldNetTotal)
    if (delta === 0) return

    let balance = await computeCustomerBalance(newCustomerId, transaction)
    if (delta > 0) {
      balance = round2(balance + delta)
      await getDb()('ledger_entries').transacting(transaction).insert({
        id: generateId(),
        company_id: companyId,
        customer_id: newCustomerId,
        type: LedgerEntryType.SALE_DEBIT,
        amount: delta,
        reference_type: 'sale_edit',
        reference_id: saleId,
        running_balance: balance,
        ...lineAudit,
        created_at: now
      })
      return
    }

    const credit = round2(-delta)
    balance = round2(balance - credit)
    await getDb()('ledger_entries').transacting(transaction).insert({
      id: generateId(),
      company_id: companyId,
      customer_id: newCustomerId,
      type: LedgerEntryType.PAYMENT_CREDIT,
      amount: credit,
      reference_type: 'sale_edit',
      reference_id: saleId,
      running_balance: balance,
      ...lineAudit,
      created_at: now
    })
    return
  }

  let oldBalance = await computeCustomerBalance(oldCustomerId, transaction)
  oldBalance = round2(oldBalance - oldNetTotal)
  await getDb()('ledger_entries').transacting(transaction).insert({
    id: generateId(),
    company_id: companyId,
    customer_id: oldCustomerId,
    type: LedgerEntryType.PAYMENT_CREDIT,
    amount: oldNetTotal,
    reference_type: 'sale_edit',
    reference_id: saleId,
    running_balance: oldBalance,
    ...lineAudit,
    created_at: now
  })

  if (totalPaid > 0) {
    oldBalance = round2(oldBalance + totalPaid)
    await getDb()('ledger_entries').transacting(transaction).insert({
      id: generateId(),
      company_id: companyId,
      customer_id: oldCustomerId,
      type: LedgerEntryType.SALE_DEBIT,
      amount: totalPaid,
      reference_type: 'sale_edit',
      reference_id: saleId,
      running_balance: oldBalance,
      ...lineAudit,
      created_at: new Date(now.getTime() + 1)
    })
  }

  let newBalance = await computeCustomerBalance(newCustomerId, transaction)
  newBalance = round2(newBalance + newNetTotal)
  await getDb()('ledger_entries').transacting(transaction).insert({
    id: generateId(),
    company_id: companyId,
    customer_id: newCustomerId,
    type: LedgerEntryType.SALE_DEBIT,
    amount: newNetTotal,
    reference_type: 'sale_edit',
    reference_id: saleId,
    running_balance: newBalance,
    ...lineAudit,
    created_at: new Date(now.getTime() + 2)
  })

  if (totalPaid > 0) {
    newBalance = round2(newBalance - totalPaid)
    await getDb()('ledger_entries').transacting(transaction).insert({
      id: generateId(),
      company_id: companyId,
      customer_id: newCustomerId,
      type: LedgerEntryType.PAYMENT_CREDIT,
      amount: totalPaid,
      reference_type: 'sale_edit',
      reference_id: saleId,
      running_balance: newBalance,
      ...lineAudit,
      created_at: new Date(now.getTime() + 3)
    })
  }
}

class SaleService {
  async list(companyId: string, branchId?: string, ctx?: AuditContext | null, filters?: SaleListFilters): Promise<unknown[]> {
    let q = getDb()('sales as s')
      .leftJoin('customers as c', 's.customer_id', 'c.id')
      .where({ 's.company_id': companyId })
      .whereNull('s.deleted_at')
    joinAuditUsers(q, 's')
    q = applyStaffScope(q, ctx ?? null, 's.created_by', 's.branch_id')
    q.select('s.*', 'c.name as customer_name', ...AUDIT_USER_SELECT)
      .orderBy('s.sale_date', 'desc')
      .orderBy('s.created_at', 'desc')

    if (branchId) q.where({ 's.branch_id': branchId })
    if (filters?.customerId) q.where({ 's.customer_id': filters.customerId })
    if (filters?.fromDate) q.where('s.sale_date', '>=', new Date(filters.fromDate))
    if (filters?.toDate) {
      const to = new Date(filters.toDate)
      to.setHours(23, 59, 59, 999)
      q.where('s.sale_date', '<=', to)
    }

    if (filters?.billNo?.trim()) {
      const term = `%${filters.billNo.trim()}%`
      q.whereRaw(
        `(SELECT COUNT(*)::text FROM sales s2 WHERE s2.company_id = s.company_id AND s2.deleted_at IS NULL AND s2.created_at <= s.created_at) ILIKE ?`,
        [term]
      )
    }

    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim()}%`
      q.whereExists(
        getDb()('sale_lines as sl')
          .leftJoin('product_items as pi', 'pi.id', 'sl.product_item_id')
          .whereRaw('sl.sale_id = s.id')
          .where((lineBuilder) => {
            lineBuilder
              .whereILike('sl.serial_number', term)
              .orWhereILike('pi.motor_number', term)
              .orWhereILike('sl.product_name', term)
          })
      )
    }

    const order = filters?.sortOrder === 'asc' ? 'asc' : 'desc'
    if (filters?.sortField === 'netTotal') {
      q.orderBy('s.net_total', order)
    } else if (filters?.sortField === 'paidAmount') {
      q.orderBy('s.paid_amount', order)
    } else if (filters?.sortField === 'dueAmount') {
      q.orderBy('s.due_amount', order)
    } else {
      q.orderBy('s.sale_date', 'desc').orderBy('s.created_at', 'desc')
    }

    const sales = await q
    const result: Record<string, unknown>[] = []
    for (const sale of sales) {
      const [{ count }] = await getDb()('sale_lines').where({ sale_id: sale.id }).count('* as count')
      result.push({
        ...enrichAuditUsers(sale),
        customer: sale.customer_name ? { name: sale.customer_name } : null,
        lineCount: Number(count)
      })
    }
    return result
  }

  async listDue(companyId: string, branchId?: string, ctx?: AuditContext | null): Promise<unknown[]> {
    let q = getDb()('sales as s')
      .leftJoin('customers as c', 's.customer_id', 'c.id')
      .where({ 's.company_id': companyId })
      .whereNull('s.deleted_at')
      .where('s.due_amount', '>', 0)
    joinAuditUsers(q, 's')
    q = applyStaffScope(q, ctx ?? null, 's.created_by', 's.branch_id')
    q.select('s.*', 'c.name as customer_name', ...AUDIT_USER_SELECT).orderBy('s.sale_date', 'desc')

    if (branchId) q.where({ 's.branch_id': branchId })

    const sales = await q
    return sales.map((s) => ({
      ...enrichAuditUsers(s),
      customer: s.customer_name ? { name: s.customer_name } : null
    }))
  }

  async get(id: string): Promise<unknown> {
    let q = getDb()('sales as s')
      .leftJoin('customers as c', 's.customer_id', 'c.id')
      .where({ 's.id': id })
      .select(
        's.*',
        'c.name as customer_name',
        'c.phone as customer_phone',
        'c.address as customer_address',
        'c.cnic as customer_cnic'
      )
    joinAuditUsers(q, 's')
    const sale = await q
      .select('s.*', 'c.name as customer_name', ...AUDIT_USER_SELECT)
      .first()
    if (!sale) throw new Error('Sale not found')

    const [{ count }] = await getDb()('sales')
      .where({ company_id: sale.company_id })
      .whereNull('deleted_at')
      .where('created_at', '<=', sale.created_at)
      .count('* as count')

    const lines = await getDb()('sale_lines as sl')
      .leftJoin('product_items as pi', 'pi.id', 'sl.product_item_id')
      .leftJoin('products as pr', 'pr.id', 'pi.product_id')
      .leftJoin('parts as pt', 'pt.id', 'sl.part_id')
      .where({ 'sl.sale_id': id })
      .select(
        'sl.*',
        'pi.motor_number',
        'pr.description as product_description',
        'pt.description as part_description'
      )
      .orderBy('sl.created_at', 'asc')
    const payments = await getDb()('payments').where({ sale_id: id }).orderBy('payment_date', 'asc')
    let lineTaxes: Record<string, unknown>[] = []
    try {
      lineTaxes = await getDb()('sale_line_taxes')
        .where({ sale_id: id })
        .whereNull('deleted_at')
        .orderBy('created_at', 'asc')
    } catch {
      // Table may not exist until migration 019 runs
      lineTaxes = []
    }
    const taxesByLine = new Map<string, Record<string, unknown>[]>()
    for (const tax of lineTaxes) {
      const lineId = tax.sale_line_id as string
      const list = taxesByLine.get(lineId) || []
      list.push(asJson(tax)!)
      taxesByLine.set(lineId, list)
    }
    const editable = await saleEditable(sale, lines)

    return {
      sale: {
        ...asJson(sale)!,
        billNo: Number(count),
        editable,
        customer: {
          name: sale.customer_name,
          phone: sale.customer_phone,
          address: sale.customer_address,
          cnic: sale.customer_cnic
        }
      },
      lines: lines.map((line) => ({
        ...asJson(line)!,
        productDescription:
          line.line_type === 'part'
            ? line.part_description || line.product_description
            : line.product_description,
        customTaxes: taxesByLine.get(line.id as string) || []
      })),
      payments: asJsonList(payments),
      editable
    }
  }

  async create(
    companyId: string,
    branchId: string,
    ctx: AuditContext,
    payload: CreateSalePayload
  ): Promise<unknown> {
    if (!payload.lines?.length) throw new Error('Add at least one line')
    if (!payload.customerId) throw new Error('Select a customer')

    const customer = await getDb()('customers')
      .where({ id: payload.customerId, company_id: companyId })
      .whereNull('deleted_at')
      .first()
    if (!customer) throw new Error('Customer not found')

    const productIds = payload.lines
      .filter((l) => normalizeLineType(l) === 'product')
      .map((l) => l.productItemId)
      .filter(Boolean) as string[]
    if (new Set(productIds).size !== productIds.length) {
      throw new Error('Duplicate product units in this sale')
    }

    return withTransaction(async (transaction) => {
      const lineCalcs: LineCalc[] = []

      for (const line of payload.lines) {
        const lineType = normalizeLineType(line)
        const amounts = calcLine(line)

        if (lineType === 'product') {
          if (!line.productItemId) throw new Error('Select a product unit for every product line')
          if (amounts.quantity !== 1) throw new Error('Product lines must have quantity 1')

          const item = await getDb()('product_items as pi')
            .transacting(transaction)
            .leftJoin('products as pr', 'pi.product_id', 'pr.id')
            .leftJoin('categories as c', 'pi.category_id', 'c.id')
            .leftJoin('colors as co', 'pi.color_id', 'co.id')
            .where({ 'pi.id': line.productItemId })
            .select('pi.*', 'pr.name as product_name', 'c.name as category_name', 'co.name as color_name')
            .first()

          if (!item || item.company_id !== companyId) throw new Error('Unit not found')
          if (item.current_branch_id !== branchId) {
            throw new Error(`Serial ${item.serial_number} is not at this branch`)
          }
          if (item.status !== ProductItemStatus.IN_STOCK) {
            throw new Error(`Serial ${item.serial_number} is not available for sale`)
          }

          const warranty = resolveWarranty(
            new Date(payload.saleDate),
            Boolean(line.warrantyActive),
            line.warrantyYears,
            line.warrantyExpiryDate
          )

          lineCalcs.push({
            lineType,
            line,
            productItem: item,
            productName: (item.product_name as string) || '',
            categoryName: (item.category_name as string) || '',
            colorName: (item.color_name as string) || '',
            serialNumber: (item.serial_number as string) || null,
            warrantyActive: warranty.warrantyActive,
            warrantyYears: warranty.warrantyYears,
            warrantyExpiry: warranty.warrantyExpiry,
            ...amounts
          })
        } else {
          if (!line.partId) throw new Error('Select a part for every part line')
          if (amounts.quantity <= 0) throw new Error('Part quantity must be a positive whole number')

          const part = await getDb()('parts as p')
            .transacting(transaction)
            .leftJoin('categories as c', 'p.category_id', 'c.id')
            .where({ 'p.id': line.partId, 'p.company_id': companyId })
            .whereNull('p.deleted_at')
            .select('p.*', 'c.name as category_name')
            .first()
          if (!part) throw new Error('Part not found')

          const stock = await getDb()('part_stocks')
            .transacting(transaction)
            .where({ company_id: companyId, branch_id: branchId, part_id: line.partId })
            .first()
          const available = Number(stock?.quantity_on_hand || 0)
          if (available < amounts.quantity) {
            throw new Error(
              `Insufficient stock for ${part.name}: available ${available}, requested ${amounts.quantity}`
            )
          }

          const fifoPreview = await previewPartFifoCost(
            transaction,
            companyId,
            branchId,
            line.partId,
            amounts.quantity
          )
          if (fifoPreview.availableQuantity < amounts.quantity) {
            throw new Error(
              `Insufficient stock for ${part.name}: available ${fifoPreview.availableQuantity}, requested ${amounts.quantity}`
            )
          }

          lineCalcs.push({
            lineType,
            line,
            partId: line.partId,
            productName: (part.name as string) || '',
            categoryName: (part.category_name as string) || '',
            colorName: '',
            serialNumber: null,
            warrantyActive: false,
            warrantyYears: null,
            warrantyExpiry: null,
            unitCost: fifoPreview.unitCost,
            ...amounts
          })
        }
      }

      const subtotal = round2(lineCalcs.reduce((s, l) => s + l.extended, 0))
      const totalTax = round2(
        lineCalcs.reduce((s, l) => s + l.taxAmount + l.otherTaxAmount, 0)
      )
      const totalWht = round2(lineCalcs.reduce((s, l) => s + l.whtAmount, 0))
      const discount = round2(Number(payload.discount || 0))
      const netTotal = round2(subtotal + totalTax + totalWht - discount)
      const paidAmount = round2(Math.min(Number(payload.paidAmount || 0), netTotal))
      const dueAmount = round2(netTotal - paidAmount)

      if (netTotal < 0) throw new Error('Sale total cannot be negative')
      if (dueAmount > 0 && !payload.dueReminderDate) {
        throw new Error('Due reminder date is required when there is an outstanding balance')
      }

      const saleDate = new Date(payload.saleDate)
      const dueReminderDate =
        dueAmount > 0 && payload.dueReminderDate ? new Date(payload.dueReminderDate) : null
      const [sale] = await getDb()('sales')
        .transacting(transaction)
        .insert(
          withAuditCreateWithDevice(ctx, {
            id: generateId(),
            company_id: companyId,
            branch_id: branchId,
            customer_id: payload.customerId,
            sale_date: saleDate,
            subtotal,
            discount,
            total_tax: totalTax,
            total_wht: totalWht,
            net_total: netTotal,
            paid_amount: paidAmount,
            due_amount: dueAmount,
            due_reminder_date: dueReminderDate,
            notes: payload.notes?.trim() || null,
            status: SaleStatus.COMPLETED,
            created_at: new Date(),
            updated_at: new Date()
          })
        )
        .returning('*')

      const saleId = sale.id as string
      const createdLines: Record<string, unknown>[] = []
      const lineAudit = auditCreate(ctx)

      for (const row of lineCalcs) {
        if (row.lineType === 'product') {
          const item = row.productItem!
          const [saleLine] = await getDb()('sale_lines')
            .transacting(transaction)
            .insert({
              id: generateId(),
              sale_id: saleId,
              line_type: 'product',
              product_item_id: item.id,
              part_id: null,
              quantity: 1,
              serial_number: item.serial_number,
              product_name: row.productName,
              category_name: row.categoryName,
              color_name: row.colorName,
              sale_price: row.unitPrice,
              tax_percent: row.taxPercent,
              tax_amount: row.taxAmount,
              wht_percent: row.whtPercent,
              wht_amount: row.whtAmount,
              tax_inclusive: row.taxInclusive,
              line_total: row.lineTotal,
              warranty_active: row.warrantyActive,
              warranty_years: row.warrantyYears,
              warranty_expiry_date: row.warrantyExpiry,
              ...lineAudit,
              created_at: new Date()
            })
            .returning('*')

          await insertSaleLineTaxes(
            transaction,
            companyId,
            saleId,
            saleLine.id as string,
            row.customTaxes,
            lineAudit
          )

          await getDb()('product_items').transacting(transaction).where({ id: item.id }).update({
            status: ProductItemStatus.SOLD,
            selling_price: row.unitPrice,
            warranty_active: row.warrantyActive,
            warranty_years: row.warrantyYears,
            warranty_expiry_date: row.warrantyExpiry,
            sold_at: new Date(),
            version: Number(item.version || 1) + 1,
            ...auditUpdate(ctx)
          })

          await getDb()('inventory_movements').transacting(transaction).insert({
            id: generateId(),
            company_id: companyId,
            product_item_id: item.id,
            movement_type: MovementType.SALE,
            from_branch_id: branchId,
            reference_type: 'sale',
            reference_id: saleId,
            ...lineAudit,
            created_at: new Date()
          })

          createdLines.push(asJson(saleLine)!)
        } else {
          const [saleLine] = await getDb()('sale_lines')
            .transacting(transaction)
            .insert({
              id: generateId(),
              sale_id: saleId,
              line_type: 'part',
              product_item_id: null,
              part_id: row.partId,
              quantity: row.quantity,
              serial_number: null,
              product_name: row.productName,
              category_name: row.categoryName,
              color_name: null,
              sale_price: row.unitPrice,
              tax_percent: row.taxPercent,
              tax_amount: row.taxAmount,
              wht_percent: row.whtPercent,
              wht_amount: row.whtAmount,
              tax_inclusive: row.taxInclusive,
              line_total: row.lineTotal,
              unit_cost: null,
              warranty_active: false,
              warranty_years: null,
              warranty_expiry_date: null,
              ...lineAudit,
              created_at: new Date()
            })
            .returning('*')

          const saleLineId = saleLine.id as string
          await insertSaleLineTaxes(
            transaction,
            companyId,
            saleId,
            saleLineId,
            row.customTaxes,
            lineAudit
          )

          const { unitCost } = await consumePartStockFifo(transaction, {
            companyId,
            branchId,
            partId: row.partId!,
            quantity: row.quantity,
            saleLineId,
            ctx
          })

          await getDb()('sale_lines')
            .transacting(transaction)
            .where({ id: saleLineId })
            .update({ unit_cost: unitCost })

          saleLine.unit_cost = unitCost

          await applyPartStockDelta(transaction, {
            companyId,
            branchId,
            partId: row.partId!,
            deltaQty: -row.quantity,
            movementType: MovementType.SALE,
            referenceType: 'sale',
            referenceId: saleId,
            ctx
          })

          createdLines.push(asJson(saleLine)!)
        }
      }

      let balance = await computeCustomerBalance(payload.customerId, transaction)
      const debitAt = new Date()
      balance = round2(balance + netTotal)
      await getDb()('ledger_entries').transacting(transaction).insert({
        id: generateId(),
        company_id: companyId,
        customer_id: payload.customerId,
        type: LedgerEntryType.SALE_DEBIT,
        amount: netTotal,
        reference_type: 'sale',
        reference_id: saleId,
        running_balance: balance,
        ...auditCreate(ctx),
        created_at: debitAt
      })

      if (paidAmount > 0) {
        await getDb()('payments').transacting(transaction).insert({
          id: generateId(),
          sale_id: saleId,
          amount: paidAmount,
          method: payload.paymentMethod || PaymentMethod.CASH,
          payment_date: saleDate,
          ...auditCreate(ctx),
          created_at: new Date()
        })

        balance = round2(balance - paidAmount)
        await getDb()('ledger_entries').transacting(transaction).insert({
          id: generateId(),
          company_id: companyId,
          customer_id: payload.customerId,
          type: LedgerEntryType.PAYMENT_CREDIT,
          amount: paidAmount,
          reference_type: 'sale',
          reference_id: saleId,
          running_balance: balance,
          ...auditCreate(ctx),
          created_at: new Date(debitAt.getTime() + 1)
        })
      }

      return { sale: asJson(sale), lines: createdLines, dueAmount }
    })
  }

  async update(
    id: string,
    companyId: string,
    branchId: string,
    ctx: AuditContext,
    payload: UpdateSalePayload
  ): Promise<unknown> {
    assertCanEditSale(ctx)

    if (!payload.lines?.length) throw new Error('Add at least one line')
    if (!payload.customerId) throw new Error('Select a customer')

    const customer = await getDb()('customers')
      .where({ id: payload.customerId, company_id: companyId })
      .whereNull('deleted_at')
      .first()
    if (!customer) throw new Error('Customer not found')

    const productIds = payload.lines
      .filter((l) => normalizeLineType(l) === 'product')
      .map((l) => l.productItemId)
      .filter(Boolean) as string[]
    if (new Set(productIds).size !== productIds.length) {
      throw new Error('Duplicate product units in this sale')
    }

    return withTransaction(async (transaction) => {
      const sale = await getDb()('sales')
        .transacting(transaction)
        .where({ id, company_id: companyId, branch_id: branchId })
        .whereNull('deleted_at')
        .first()
      if (!sale) throw new Error('Sale not found')

      const existingLines = await getDb()('sale_lines').transacting(transaction).where({ sale_id: id })
      const payments = await getDb()('payments').transacting(transaction).where({ sale_id: id })

      if (!(await saleEditable(sale, existingLines))) {
        throw new Error('This sale can no longer be edited')
      }

      const paidAmount = round2(
        payments.length > 0
          ? payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
          : Number(sale.paid_amount || 0)
      )

      const oldCustomerId = sale.customer_id as string
      const oldNetTotal = round2(Number(sale.net_total || 0))

      for (const line of existingLines) {
        const lineType = (line.line_type as string) || (line.part_id ? 'part' : 'product')
        if (lineType === 'part') {
          await reversePartSaleLine(transaction, companyId, branchId, id, line, ctx)
        } else {
          await reverseProductSaleLine(transaction, companyId, branchId, id, line, ctx)
        }
      }

      await getDb()('sale_lines').transacting(transaction).where({ sale_id: id }).del()

      const lineCalcs: LineCalc[] = []

      for (const line of payload.lines) {
        const lineType = normalizeLineType(line)
        const amounts = calcLine(line)

        if (lineType === 'product') {
          if (!line.productItemId) throw new Error('Select a product unit for every product line')
          if (amounts.quantity !== 1) throw new Error('Product lines must have quantity 1')

          const item = await getDb()('product_items as pi')
            .transacting(transaction)
            .leftJoin('products as pr', 'pi.product_id', 'pr.id')
            .leftJoin('categories as c', 'pi.category_id', 'c.id')
            .leftJoin('colors as co', 'pi.color_id', 'co.id')
            .where({ 'pi.id': line.productItemId })
            .select('pi.*', 'pr.name as product_name', 'c.name as category_name', 'co.name as color_name')
            .first()

          if (!item || item.company_id !== companyId) throw new Error('Unit not found')
          if (item.current_branch_id !== branchId) {
            throw new Error(`Serial ${item.serial_number} is not at this branch`)
          }
          if (item.status !== ProductItemStatus.IN_STOCK) {
            throw new Error(`Serial ${item.serial_number} is not available for sale`)
          }

          const warranty = resolveWarranty(
            new Date(payload.saleDate),
            Boolean(line.warrantyActive),
            line.warrantyYears,
            line.warrantyExpiryDate
          )

          lineCalcs.push({
            lineType,
            line,
            productItem: item,
            productName: (item.product_name as string) || '',
            categoryName: (item.category_name as string) || '',
            colorName: (item.color_name as string) || '',
            serialNumber: (item.serial_number as string) || null,
            warrantyActive: warranty.warrantyActive,
            warrantyYears: warranty.warrantyYears,
            warrantyExpiry: warranty.warrantyExpiry,
            ...amounts
          })
        } else {
          if (!line.partId) throw new Error('Select a part for every part line')
          if (amounts.quantity <= 0) throw new Error('Part quantity must be a positive whole number')

          const part = await getDb()('parts as p')
            .transacting(transaction)
            .leftJoin('categories as c', 'p.category_id', 'c.id')
            .where({ 'p.id': line.partId, 'p.company_id': companyId })
            .whereNull('p.deleted_at')
            .select('p.*', 'c.name as category_name')
            .first()
          if (!part) throw new Error('Part not found')

          const stock = await getDb()('part_stocks')
            .transacting(transaction)
            .where({ company_id: companyId, branch_id: branchId, part_id: line.partId })
            .first()
          const available = Number(stock?.quantity_on_hand || 0)
          if (available < amounts.quantity) {
            throw new Error(
              `Insufficient stock for ${part.name}: available ${available}, requested ${amounts.quantity}`
            )
          }

          const fifoPreview = await previewPartFifoCost(
            transaction,
            companyId,
            branchId,
            line.partId,
            amounts.quantity
          )
          if (fifoPreview.availableQuantity < amounts.quantity) {
            throw new Error(
              `Insufficient stock for ${part.name}: available ${fifoPreview.availableQuantity}, requested ${amounts.quantity}`
            )
          }

          lineCalcs.push({
            lineType,
            line,
            partId: line.partId,
            productName: (part.name as string) || '',
            categoryName: (part.category_name as string) || '',
            colorName: '',
            serialNumber: null,
            warrantyActive: false,
            warrantyYears: null,
            warrantyExpiry: null,
            unitCost: fifoPreview.unitCost,
            ...amounts
          })
        }
      }

      const subtotal = round2(lineCalcs.reduce((s, l) => s + l.extended, 0))
      const totalTax = round2(
        lineCalcs.reduce((s, l) => s + l.taxAmount + l.otherTaxAmount, 0)
      )
      const totalWht = round2(lineCalcs.reduce((s, l) => s + l.whtAmount, 0))
      const discount = round2(Number(payload.discount || 0))
      const netTotal = round2(subtotal + totalTax + totalWht - discount)
      const dueAmount = round2(netTotal - paidAmount)

      if (netTotal < 0) throw new Error('Sale total cannot be negative')
      if (netTotal < paidAmount) {
        throw new Error(`Sale total cannot be less than recorded payments (${paidAmount})`)
      }
      if (dueAmount > 0 && !payload.dueReminderDate) {
        throw new Error('Due reminder date is required when there is an outstanding balance')
      }

      const saleDate = new Date(payload.saleDate)
      const dueReminderDate =
        dueAmount > 0 && payload.dueReminderDate ? new Date(payload.dueReminderDate) : null

      const [updatedSale] = await getDb()('sales')
        .transacting(transaction)
        .where({ id })
        .update(
          withAuditUpdate(ctx, {
            customer_id: payload.customerId,
            sale_date: saleDate,
            subtotal,
            discount,
            total_tax: totalTax,
            total_wht: totalWht,
            net_total: netTotal,
            paid_amount: paidAmount,
            due_amount: dueAmount,
            due_reminder_date: dueReminderDate,
            notes: payload.notes?.trim() || null
          })
        )
        .returning('*')

      const savedLines: Record<string, unknown>[] = []
      const lineAudit = auditCreate(ctx)

      for (const row of lineCalcs) {
        if (row.lineType === 'product') {
          const item = row.productItem!
          const [saleLine] = await getDb()('sale_lines')
            .transacting(transaction)
            .insert({
              id: generateId(),
              sale_id: id,
              line_type: 'product',
              product_item_id: item.id,
              part_id: null,
              quantity: 1,
              serial_number: item.serial_number,
              product_name: row.productName,
              category_name: row.categoryName,
              color_name: row.colorName,
              sale_price: row.unitPrice,
              tax_percent: row.taxPercent,
              tax_amount: row.taxAmount,
              wht_percent: row.whtPercent,
              wht_amount: row.whtAmount,
              tax_inclusive: row.taxInclusive,
              line_total: row.lineTotal,
              warranty_active: row.warrantyActive,
              warranty_years: row.warrantyYears,
              warranty_expiry_date: row.warrantyExpiry,
              ...lineAudit,
              created_at: new Date()
            })
            .returning('*')

          await insertSaleLineTaxes(
            transaction,
            companyId,
            id,
            saleLine.id as string,
            row.customTaxes,
            lineAudit
          )

          await getDb()('product_items').transacting(transaction).where({ id: item.id }).update({
            status: ProductItemStatus.SOLD,
            selling_price: row.unitPrice,
            warranty_active: row.warrantyActive,
            warranty_years: row.warrantyYears,
            warranty_expiry_date: row.warrantyExpiry,
            sold_at: new Date(),
            version: Number(item.version || 1) + 1,
            ...auditUpdate(ctx)
          })

          await getDb()('inventory_movements').transacting(transaction).insert({
            id: generateId(),
            company_id: companyId,
            product_item_id: item.id,
            movement_type: MovementType.SALE,
            from_branch_id: branchId,
            reference_type: 'sale',
            reference_id: id,
            ...lineAudit,
            created_at: new Date()
          })

          savedLines.push(asJson(saleLine)!)
        } else {
          const [saleLine] = await getDb()('sale_lines')
            .transacting(transaction)
            .insert({
              id: generateId(),
              sale_id: id,
              line_type: 'part',
              product_item_id: null,
              part_id: row.partId,
              quantity: row.quantity,
              serial_number: null,
              product_name: row.productName,
              category_name: row.categoryName,
              color_name: null,
              sale_price: row.unitPrice,
              tax_percent: row.taxPercent,
              tax_amount: row.taxAmount,
              wht_percent: row.whtPercent,
              wht_amount: row.whtAmount,
              tax_inclusive: row.taxInclusive,
              line_total: row.lineTotal,
              unit_cost: null,
              warranty_active: false,
              warranty_years: null,
              warranty_expiry_date: null,
              ...lineAudit,
              created_at: new Date()
            })
            .returning('*')

          const saleLineId = saleLine.id as string
          await insertSaleLineTaxes(
            transaction,
            companyId,
            id,
            saleLineId,
            row.customTaxes,
            lineAudit
          )

          const { unitCost } = await consumePartStockFifo(transaction, {
            companyId,
            branchId,
            partId: row.partId!,
            quantity: row.quantity,
            saleLineId,
            ctx
          })

          await getDb()('sale_lines')
            .transacting(transaction)
            .where({ id: saleLineId })
            .update({ unit_cost: unitCost })

          saleLine.unit_cost = unitCost

          await applyPartStockDelta(transaction, {
            companyId,
            branchId,
            partId: row.partId!,
            deltaQty: -row.quantity,
            movementType: MovementType.SALE,
            referenceType: 'sale',
            referenceId: id,
            ctx
          })

          savedLines.push(asJson(saleLine)!)
        }
      }

      await applySaleEditLedger(
        transaction,
        companyId,
        ctx,
        id,
        oldCustomerId,
        payload.customerId,
        oldNetTotal,
        netTotal,
        paidAmount
      )

      const editable = await saleEditable(updatedSale, savedLines)

      return { sale: asJson(updatedSale), lines: savedLines, dueAmount, editable }
    })
  }

  async recordPayment(
    companyId: string,
    ctx: AuditContext,
    payload: RecordPaymentPayload
  ): Promise<unknown> {
    const amount = round2(Number(payload.amount || 0))
    if (amount <= 0) throw new Error('Enter a valid payment amount')

    return withTransaction(async (transaction) => {
      const sale = await getDb()('sales').transacting(transaction).where({ id: payload.saleId }).first()
      if (!sale || sale.company_id !== companyId) throw new Error('Sale not found')

      const dueAmount = Number(sale.due_amount)
      if (dueAmount <= 0) throw new Error('This sale has no outstanding balance')
      if (amount > dueAmount) throw new Error(`Payment cannot exceed due amount (${dueAmount})`)

      const paymentDate = payload.paymentDate ? new Date(payload.paymentDate) : new Date()
      const customerId = sale.customer_id as string

      await getDb()('payments').transacting(transaction).insert({
        id: generateId(),
        sale_id: payload.saleId,
        amount,
        method: payload.method || PaymentMethod.CASH,
        payment_date: paymentDate,
        ...auditCreate(ctx),
        created_at: new Date()
      })

      const newPaid = round2(Number(sale.paid_amount) + amount)
      const newDue = round2(dueAmount - amount)
      const [updatedSale] = await getDb()('sales')
        .transacting(transaction)
        .where({ id: payload.saleId })
        .update({ paid_amount: newPaid, due_amount: newDue, ...auditUpdate(ctx) })
        .returning('*')

      let balance = await computeCustomerBalance(customerId, transaction)
      balance = round2(balance - amount)
      await getDb()('ledger_entries').transacting(transaction).insert({
        id: generateId(),
        company_id: companyId,
        customer_id: customerId,
        type: LedgerEntryType.PAYMENT_CREDIT,
        amount,
        reference_type: 'sale',
        reference_id: payload.saleId,
        running_balance: balance,
        ...auditCreate(ctx),
        created_at: new Date()
      })

      return { sale: asJson(updatedSale), dueAmount: newDue }
    })
  }

  /**
   * Owner/super-admin: change a recorded payment amount/method/date.
   * Ledger-safe — reverse old credit, then re-post if amount &gt; 0.
   */
  async updatePayment(
    companyId: string,
    ctx: AuditContext,
    payload: UpdatePaymentPayload
  ): Promise<unknown> {
    assertCanEditPayment(ctx)
    const newAmount = round2(Number(payload.amount || 0))
    if (newAmount < 0) throw new Error('Payment amount cannot be negative')

    return withTransaction(async (transaction) => {
      const payment = await getDb()('payments')
        .transacting(transaction)
        .where({ id: payload.paymentId })
        .first()
      if (!payment) throw new Error('Payment not found')

      const sale = await getDb()('sales')
        .transacting(transaction)
        .where({ id: payment.sale_id })
        .first()
      if (!sale || sale.company_id !== companyId) throw new Error('Sale not found')
      if (sale.deleted_at || sale.status === SaleStatus.CANCELLED) {
        throw new Error('Cannot edit payment on a voided sale')
      }

      const oldAmount = round2(Number(payment.amount || 0))
      const customerId = sale.customer_id as string
      const netTotal = round2(Number(sale.net_total || 0))
      const currentPaid = round2(Number(sale.paid_amount || 0))
      const newPaid = round2(currentPaid - oldAmount + newAmount)
      if (newPaid < 0) throw new Error('Payment edit would make paid amount negative')
      if (newPaid > netTotal) {
        throw new Error(`Paid total cannot exceed sale net (${netTotal})`)
      }

      const amountChanged = newAmount !== oldAmount
      const paymentDate = payload.paymentDate
        ? new Date(payload.paymentDate)
        : new Date(payment.payment_date as string | Date)
      const method = payload.method || (payment.method as string) || PaymentMethod.CASH

      if (amountChanged && oldAmount > 0) {
        // Reverse prior payment credit (restore receivable).
        let balance = await computeCustomerBalance(customerId, transaction)
        balance = round2(balance + oldAmount)
        await getDb()('ledger_entries').transacting(transaction).insert({
          id: generateId(),
          company_id: companyId,
          customer_id: customerId,
          type: LedgerEntryType.SALE_DEBIT,
          amount: oldAmount,
          reference_type: 'payment_edit',
          reference_id: payload.paymentId,
          running_balance: balance,
          ...auditCreate(ctx),
          created_at: new Date()
        })
      }

      if (newAmount <= 0) {
        await getDb()('payments').transacting(transaction).where({ id: payload.paymentId }).del()
      } else {
        await getDb()('payments')
          .transacting(transaction)
          .where({ id: payload.paymentId })
          .update({
            amount: newAmount,
            method,
            payment_date: paymentDate,
            updated_by: ctx.userId
          })

        if (amountChanged) {
          let balance = await computeCustomerBalance(customerId, transaction)
          balance = round2(balance - newAmount)
          await getDb()('ledger_entries').transacting(transaction).insert({
            id: generateId(),
            company_id: companyId,
            customer_id: customerId,
            type: LedgerEntryType.PAYMENT_CREDIT,
            amount: newAmount,
            reference_type: 'sale',
            reference_id: sale.id,
            running_balance: balance,
            ...auditCreate(ctx),
            created_at: new Date()
          })
        }
      }

      const newDue = round2(netTotal - newPaid)
      const [updatedSale] = await getDb()('sales')
        .transacting(transaction)
        .where({ id: sale.id })
        .update({ paid_amount: newPaid, due_amount: newDue, ...auditUpdate(ctx) })
        .returning('*')

      const payments = await getDb()('payments')
        .transacting(transaction)
        .where({ sale_id: sale.id })
        .orderBy('payment_date', 'asc')
        .orderBy('created_at', 'asc')

      return {
        sale: asJson(updatedSale),
        payments: asJsonList(payments),
        dueAmount: newDue
      }
    })
  }
}

export const saleService = new SaleService()

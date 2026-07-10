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
import {
  AUDIT_USER_SELECT,
  type AuditContext,
  applyStaffScope,
  auditCreate,
  auditUpdate,
  enrichAuditUsers,
  joinAuditUsers,
  withAuditCreateWithDevice
} from '../shared/audit.helpers'
import { asJson, asJsonList } from '../shared/json.helpers'

export type SaleLineInput = {
  productItemId: string
  salePrice: number
  taxPercent?: number
  whtPercent?: number
  warrantyActive?: boolean
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

export type RecordPaymentPayload = {
  saleId: string
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

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function calcLine(line: SaleLineInput) {
  const salePrice = Number(line.salePrice || 0)
  const taxPercent = Number(line.taxPercent || 0)
  const whtPercent = Number(line.whtPercent || 0)
  const taxAmount = round2((salePrice * taxPercent) / 100)
  const whtAmount = round2((salePrice * whtPercent) / 100)
  const lineTotal = round2(salePrice + taxAmount + whtAmount)
  return { salePrice, taxPercent, whtPercent, taxAmount, whtAmount, lineTotal }
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
      .where({ 'sl.sale_id': id })
      .select('sl.*', 'pi.motor_number', 'pr.description as product_description')
      .orderBy('sl.created_at', 'asc')
    const payments = await getDb()('payments').where({ sale_id: id }).orderBy('payment_date', 'asc')

    return {
      sale: {
        ...asJson(sale)!,
        billNo: Number(count),
        customer: {
          name: sale.customer_name,
          phone: sale.customer_phone,
          address: sale.customer_address,
          cnic: sale.customer_cnic
        }
      },
      lines: asJsonList(lines),
      payments: asJsonList(payments)
    }
  }

  async create(
    companyId: string,
    branchId: string,
    ctx: AuditContext,
    payload: CreateSalePayload
  ): Promise<unknown> {
    if (!payload.lines?.length) throw new Error('Add at least one unit')
    if (!payload.customerId) throw new Error('Select a customer')

    const customer = await getDb()('customers')
      .where({ id: payload.customerId, company_id: companyId })
      .whereNull('deleted_at')
      .first()
    if (!customer) throw new Error('Customer not found')

    const itemIds = payload.lines.map((l) => l.productItemId)
    if (new Set(itemIds).size !== itemIds.length) throw new Error('Duplicate units in this sale')

    return withTransaction(async (transaction) => {
      type LineCalc = {
        line: SaleLineInput
        item: Record<string, unknown>
        productName: string
        categoryName: string
        colorName: string
        warrantyActive: boolean
        warrantyExpiry: Date | null
        salePrice: number
        taxPercent: number
        whtPercent: number
        taxAmount: number
        whtAmount: number
        lineTotal: number
      }
      const lineCalcs: LineCalc[] = []

      for (const line of payload.lines) {
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

        const warrantyActive = Boolean(line.warrantyActive)
        const warrantyExpiry =
          warrantyActive && line.warrantyExpiryDate ? new Date(line.warrantyExpiryDate) : null
        if (warrantyActive && !warrantyExpiry) {
          throw new Error(`Warranty expiry required for serial ${item.serial_number}`)
        }

        lineCalcs.push({
          line,
          item,
          productName: (item.product_name as string) || '',
          categoryName: (item.category_name as string) || '',
          colorName: (item.color_name as string) || '',
          warrantyActive,
          warrantyExpiry,
          ...calcLine(line)
        })
      }

      const subtotal = round2(lineCalcs.reduce((s, l) => s + l.salePrice, 0))
      const totalTax = round2(lineCalcs.reduce((s, l) => s + l.taxAmount, 0))
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
        .insert(withAuditCreateWithDevice(ctx, {
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
        }))
        .returning('*')

      const saleId = sale.id as string
      const createdLines: Record<string, unknown>[] = []
      const lineAudit = auditCreate(ctx)

      for (const row of lineCalcs) {
        const item = row.item
        const [saleLine] = await getDb()('sale_lines')
          .transacting(transaction)
          .insert({
            id: generateId(),
            sale_id: saleId,
            product_item_id: item.id,
            serial_number: item.serial_number,
            product_name: row.productName,
            category_name: row.categoryName,
            color_name: row.colorName,
            sale_price: row.salePrice,
            tax_percent: row.taxPercent,
            tax_amount: row.taxAmount,
            wht_percent: row.whtPercent,
            wht_amount: row.whtAmount,
            line_total: row.lineTotal,
            warranty_active: row.warrantyActive,
            warranty_expiry_date: row.warrantyExpiry,
            ...lineAudit,
            created_at: new Date()
          })
          .returning('*')

        await getDb()('product_items').transacting(transaction).where({ id: item.id }).update({
          status: ProductItemStatus.SOLD,
          selling_price: row.salePrice,
          warranty_active: row.warrantyActive,
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
}

export const saleService = new SaleService()

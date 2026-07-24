import { getDb } from '../../db'
import { computeCustomerBalance } from '../customer/customer.service'
import { computeSupplierBalance } from '../purchase/supplier-ledger.helpers'
import { asJson, asJsonList } from '../shared/json.helpers'
import { ledgerForPeriod } from '../shared/ledger-order.helpers'

export type PartyDetailFilters = {
  from?: string
  to?: string
}

function inDateRange(raw: unknown, from?: string, to?: string): boolean {
  if (!from && !to) return true
  const t = raw ? new Date(raw as string | Date).getTime() : NaN
  if (!Number.isFinite(t)) return false
  if (from) {
    const fromMs = new Date(`${from}T00:00:00`).getTime()
    if (t < fromMs) return false
  }
  if (to) {
    const toMs = new Date(`${to}T23:59:59.999`).getTime()
    if (t > toMs) return false
  }
  return true
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

async function printCompanyHeader(companyId: string, branchId?: string) {
  const profile = await getDb()('company_profile').whereNull('deleted_at').first()
  let branch: Record<string, unknown> | undefined
  if (branchId) {
    branch = await getDb()('branches').where({ id: branchId }).whereNull('deleted_at').first()
  }
  if (!branch) {
    branch = await getDb()('branches')
      .where({ company_id: companyId, is_active: true })
      .whereNull('deleted_at')
      .orderBy('name', 'asc')
      .first()
  }

  return {
    name: String(profile?.name || branch?.name || 'Company'),
    phone: String(profile?.phone || '').trim(),
    address: String(branch?.location || '').trim()
  }
}

export type SalesReportFilters = {
  from?: string
  to?: string
  customerId?: string
  search?: string
  sortField?: string
  sortOrder?: string
}

export type PurchaseReportFilters = {
  from?: string
  to?: string
  supplierId?: string
  search?: string
  sortField?: string
  sortOrder?: string
}

export type CustomersReportFilters = {
  from?: string
  to?: string
  search?: string
  sortField?: string
  sortOrder?: string
}

class ReportService {
  async salesReport(companyId: string, branchId: string, filters?: SalesReportFilters): Promise<unknown> {
    const q = getDb()('sales as s')
      .leftJoin('customers as c', 's.customer_id', 'c.id')
      .where({ 's.company_id': companyId, 's.branch_id': branchId })
      .whereNull('s.deleted_at')
      .select('s.*', 'c.name as customer_name')

    if (filters?.from) q.where('s.sale_date', '>=', new Date(filters.from))
    if (filters?.to) {
      const end = new Date(filters.to)
      end.setHours(23, 59, 59, 999)
      q.where('s.sale_date', '<=', end)
    }
    if (filters?.customerId) q.where({ 's.customer_id': filters.customerId })

    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim()}%`
      q.whereExists(
        getDb()('sale_lines as sl')
          .leftJoin('product_items as pi', 'pi.id', 'sl.product_item_id')
          .whereRaw('sl.sale_id = s.id')
          .where((builder) => {
            builder
              .whereILike('sl.serial_number', term)
              .orWhereILike('pi.motor_number', term)
          })
      )
    }

    const order = filters?.sortOrder === 'asc' ? 'asc' : 'desc'
    if (filters?.sortField === 'netTotal') {
      q.orderBy('s.net_total', order)
    } else if (filters?.sortField === 'discount') {
      q.orderBy('s.discount', order)
    } else if (filters?.sortField === 'paidAmount') {
      q.orderBy('s.paid_amount', order)
    } else if (filters?.sortField === 'dueAmount') {
      q.orderBy('s.due_amount', order)
    } else {
      q.orderBy('s.sale_date', 'desc').orderBy('s.created_at', 'desc')
    }

    const sales = await q
    const rows = sales.map((s) => ({
      ...asJson(s)!,
      customer: s.customer_name ? { name: s.customer_name } : null
    }))

    const summary = { count: rows.length, netTotal: 0, paidAmount: 0, dueAmount: 0, discount: 0 }
    for (const sale of sales) {
      summary.netTotal = round2(summary.netTotal + Number(sale.net_total))
      summary.paidAmount = round2(summary.paidAmount + Number(sale.paid_amount))
      summary.dueAmount = round2(summary.dueAmount + Number(sale.due_amount))
      summary.discount = round2(summary.discount + Number(sale.discount))
    }

    return { sales: rows, summary }
  }

  async purchaseReport(companyId: string, branchId: string, filters?: PurchaseReportFilters): Promise<unknown> {
    const q = getDb()('purchases as p')
      .leftJoin('suppliers as s', 'p.supplier_id', 's.id')
      .where({ 'p.company_id': companyId, 'p.branch_id': branchId })
      .whereNull('p.deleted_at')
      .select('p.*', 's.name as supplier_name')

    if (filters?.from) q.where('p.purchase_date', '>=', new Date(filters.from))
    if (filters?.to) {
      const end = new Date(filters.to)
      end.setHours(23, 59, 59, 999)
      q.where('p.purchase_date', '<=', end)
    }
    if (filters?.supplierId) q.where({ 'p.supplier_id': filters.supplierId })

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
    const rows: Record<string, unknown>[] = []
    let totalValue = 0
    let unitCount = 0

    for (const purchase of purchases) {
      const items = await getDb()('product_items').where({ purchase_id: purchase.id })
      const purchaseValue = items.reduce((sum, item) => sum + Number(item.purchase_price), 0)
      totalValue = round2(totalValue + purchaseValue)
      unitCount += items.length
      rows.push({
        ...asJson(purchase)!,
        supplier: purchase.supplier_name ? { name: purchase.supplier_name } : null,
        itemCount: items.length,
        totalValue: purchaseValue
      })
    }

    if (filters?.sortField === 'totalValue') {
      const order = filters.sortOrder === 'asc' ? 'asc' : 'desc'
      rows.sort((a, b) => {
        const diff = Number(a.totalValue) - Number(b.totalValue)
        return order === 'asc' ? diff : -diff
      })
    }

    return { purchases: rows, summary: { count: rows.length, unitCount, totalValue } }
  }

  async customersReport(companyId: string, filters?: CustomersReportFilters): Promise<unknown> {
    const q = getDb()('customers as c')
      .where({ 'c.company_id': companyId })
      .whereNull('c.deleted_at')

    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim()}%`
      q.where((builder) => {
        builder
          .whereILike('c.name', term)
          .orWhereILike('c.phone', term)
          .orWhereExists(
            getDb()('sales as s')
              .join('sale_lines as sl', 'sl.sale_id', 's.id')
              .leftJoin('product_items as pi', 'pi.id', 'sl.product_item_id')
              .whereRaw('s.customer_id = c.id')
              .whereNull('s.deleted_at')
              .where((saleBuilder) => {
                saleBuilder
                  .whereILike('sl.serial_number', term)
                  .orWhereILike('pi.motor_number', term)
              })
          )
      })
    }

    if (filters?.from || filters?.to) {
      q.whereExists(
        getDb()('sales as s')
          .whereRaw('s.customer_id = c.id')
          .whereNull('s.deleted_at')
          .where((builder) => {
            if (filters.from) builder.where('s.sale_date', '>=', new Date(filters.from))
            if (filters.to) {
              const end = new Date(filters.to)
              end.setHours(23, 59, 59, 999)
              builder.where('s.sale_date', '<=', end)
            }
          })
      )
    }

    q.orderBy('c.name', 'asc')

    const customers = await q
    const rows: Record<string, unknown>[] = []
    let totalOutstanding = 0
    let customersWithDue = 0

    for (const customer of customers) {
      const balance = await computeCustomerBalance(customer.id as string)
      if (balance > 0) customersWithDue += 1
      totalOutstanding = round2(totalOutstanding + balance)
      rows.push({ ...asJson(customer)!, balance })
    }

    if (filters?.sortField === 'balance') {
      const order = filters.sortOrder === 'asc' ? 'asc' : 'desc'
      rows.sort((a, b) => {
        const diff = Number(a.balance) - Number(b.balance)
        return order === 'asc' ? diff : -diff
      })
    }

    return {
      customers: rows,
      summary: { totalCustomers: rows.length, customersWithDue, totalOutstanding }
    }
  }

  async customerDetail(
    companyId: string,
    customerId: string,
    branchId?: string,
    filters?: PartyDetailFilters
  ): Promise<unknown> {
    const customer = await getDb()('customers')
      .where({ id: customerId, company_id: companyId })
      .whereNull('deleted_at')
      .first()
    if (!customer) throw new Error('Customer not found')

    const balance = await computeCustomerBalance(customerId)
    const sales = await getDb()('sales')
      .where({ company_id: companyId, customer_id: customerId })
      .whereNull('deleted_at')
      .orderBy('sale_date', 'desc')
      .orderBy('created_at', 'desc')

    const saleRows: Record<string, unknown>[] = []
    let totalNet = 0
    let totalPaid = 0
    let totalDue = 0
    let unitsSold = 0
    let lastSaleDate: string | null = null
    const productCounts = new Map<string, number>()

    for (const sale of sales) {
      if (!inDateRange(sale.sale_date, filters?.from, filters?.to)) continue
      const lines = await getDb()('sale_lines').where({ sale_id: sale.id }).orderBy('created_at', 'asc')
      const net = Number(sale.net_total)
      const paid = Number(sale.paid_amount)
      const due = Number(sale.due_amount)
      totalNet = round2(totalNet + net)
      totalPaid = round2(totalPaid + paid)
      totalDue = round2(totalDue + due)
      unitsSold += lines.length
      if (!lastSaleDate) lastSaleDate = String(sale.sale_date)
      for (const line of lines) {
        const name = String(line.product_name || 'Unknown')
        productCounts.set(name, (productCounts.get(name) || 0) + 1)
      }
      saleRows.push({ ...asJson(sale)!, lines: asJsonList(lines) })
    }

    let topProduct: string | null = null
    let topProductUnits = 0
    for (const [name, count] of productCounts) {
      if (count > topProductUnits) {
        topProduct = name
        topProductUnits = count
      }
    }

    const ledgerRows = await getDb()('ledger_entries').where({ customer_id: customerId })
    const { openingBalance, closingBalance, ledger } = ledgerForPeriod(
      ledgerRows as Record<string, unknown>[],
      filters?.from,
      filters?.to
    )

    let periodDebits = 0
    let periodCredits = 0
    for (const entry of ledger) {
      const amount = Number(entry.amount || 0)
      const type = String(entry.type || '')
      if (type === 'payment_credit') periodCredits = round2(periodCredits + amount)
      else periodDebits = round2(periodDebits + amount)
    }

    const printCompany = await printCompanyHeader(companyId, branchId)
    const avgSale = saleRows.length ? round2(totalNet / saleRows.length) : 0
    const collectionRate = totalNet > 0 ? round2((totalPaid / totalNet) * 100) : 0

    return {
      customer: { ...asJson(customer)!, balance },
      sales: saleRows,
      ledger: asJsonList(ledger),
      printCompany,
      period: { from: filters?.from || null, to: filters?.to || null },
      openingBalance,
      closingBalance,
      summary: {
        saleCount: saleRows.length,
        totalNet,
        totalPaid,
        totalDue,
        balance,
        unitsSold,
        avgSale,
        collectionRate,
        lastSaleDate,
        topProduct,
        topProductUnits,
        periodDebits,
        periodCredits,
        openingBalance,
        closingBalance
      }
    }
  }

  async suppliersReport(companyId: string, filters?: CustomersReportFilters): Promise<unknown> {
    let q = getDb()('suppliers')
      .where({ company_id: companyId })
      .whereNull('deleted_at')
      .orderBy('name', 'asc')

    if (filters?.search?.trim()) q.whereILike('name', `%${filters.search.trim()}%`)

    const suppliers = await q
    const rows: Record<string, unknown>[] = []
    let totalOutstanding = 0
    let suppliersWithDue = 0

    for (const supplier of suppliers) {
      const balance = await computeSupplierBalance(supplier.id as string)
      if (balance > 0) suppliersWithDue += 1
      totalOutstanding = round2(totalOutstanding + balance)
      rows.push({ ...asJson(supplier)!, balance })
    }

    if (filters?.sortField === 'balance') {
      const order = filters.sortOrder === 'asc' ? 'asc' : 'desc'
      rows.sort((a, b) => {
        const diff = Number(a.balance) - Number(b.balance)
        return order === 'asc' ? diff : -diff
      })
    }

    return {
      suppliers: rows,
      summary: { totalSuppliers: rows.length, suppliersWithDue, totalOutstanding }
    }
  }

  async supplierDetail(
    companyId: string,
    supplierId: string,
    branchId?: string,
    filters?: PartyDetailFilters
  ): Promise<unknown> {
    const supplier = await getDb()('suppliers')
      .where({ id: supplierId, company_id: companyId })
      .whereNull('deleted_at')
      .first()
    if (!supplier) throw new Error('Supplier not found')

    const balance = await computeSupplierBalance(supplierId)

    const productPurchases = await getDb()('purchases')
      .where({ company_id: companyId, supplier_id: supplierId })
      .whereNull('deleted_at')
      .orderBy('purchase_date', 'desc')
      .orderBy('created_at', 'desc')

    const partPurchases = await getDb()('part_purchases')
      .where({ company_id: companyId, supplier_id: supplierId })
      .whereNull('deleted_at')
      .orderBy('purchase_date', 'desc')
      .orderBy('created_at', 'desc')

    const purchaseRows: Record<string, unknown>[] = []
    let totalNet = 0
    let totalPaid = 0
    let totalDue = 0
    let productPurchaseCount = 0
    let partPurchaseCount = 0
    let lastPurchaseDate: string | null = null

    for (const purchase of productPurchases) {
      if (!inDateRange(purchase.purchase_date, filters?.from, filters?.to)) continue
      const net = Number(purchase.net_total || 0)
      const paid = Number(purchase.paid_amount || 0)
      const due = Number(purchase.due_amount || 0)
      totalNet = round2(totalNet + net)
      totalPaid = round2(totalPaid + paid)
      totalDue = round2(totalDue + due)
      productPurchaseCount += 1
      purchaseRows.push({ ...asJson(purchase)!, kind: 'product' })
    }

    for (const purchase of partPurchases) {
      if (!inDateRange(purchase.purchase_date, filters?.from, filters?.to)) continue
      const net = Number(purchase.net_total || 0)
      const paid = Number(purchase.paid_amount || 0)
      const due = Number(purchase.due_amount || 0)
      totalNet = round2(totalNet + net)
      totalPaid = round2(totalPaid + paid)
      totalDue = round2(totalDue + due)
      partPurchaseCount += 1
      purchaseRows.push({ ...asJson(purchase)!, kind: 'part' })
    }

    purchaseRows.sort((a, b) => {
      const da = new Date(String(a.purchaseDate || a.createdAt || 0)).getTime()
      const db = new Date(String(b.purchaseDate || b.createdAt || 0)).getTime()
      return db - da
    })
    if (purchaseRows.length) {
      lastPurchaseDate = String(purchaseRows[0].purchaseDate || purchaseRows[0].createdAt || '')
    }

    const ledgerRows = await getDb()('ledger_entries').where({ supplier_id: supplierId })
    const { openingBalance, closingBalance, ledger } = ledgerForPeriod(
      ledgerRows as Record<string, unknown>[],
      filters?.from,
      filters?.to
    )

    let periodDebits = 0
    let periodCredits = 0
    for (const entry of ledger) {
      const amount = Number(entry.amount || 0)
      const type = String(entry.type || '')
      if (type === 'supplier_payment_credit') periodCredits = round2(periodCredits + amount)
      else periodDebits = round2(periodDebits + amount)
    }

    const printCompany = await printCompanyHeader(companyId, branchId)
    const avgPurchase = purchaseRows.length ? round2(totalNet / purchaseRows.length) : 0
    const paymentRate = totalNet > 0 ? round2((totalPaid / totalNet) * 100) : 0

    return {
      supplier: { ...asJson(supplier)!, balance },
      purchases: purchaseRows,
      ledger: asJsonList(ledger),
      printCompany,
      period: { from: filters?.from || null, to: filters?.to || null },
      openingBalance,
      closingBalance,
      summary: {
        purchaseCount: purchaseRows.length,
        totalNet,
        totalPaid,
        totalDue,
        balance,
        avgPurchase,
        paymentRate,
        lastPurchaseDate,
        productPurchaseCount,
        partPurchaseCount,
        periodDebits,
        periodCredits,
        openingBalance,
        closingBalance
      }
    }
  }
}

export const reportService = new ReportService()

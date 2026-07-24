import { getDb } from '../../db'
import { computeCustomerBalance } from '../customer/customer.service'
import { computeSupplierBalance } from '../purchase/supplier-ledger.helpers'
import { asJson, asJsonList } from '../shared/json.helpers'

function round2(n: number): number {
  return Math.round(n * 100) / 100
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

  async customerDetail(companyId: string, customerId: string): Promise<unknown> {
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

    for (const sale of sales) {
      const lines = await getDb()('sale_lines').where({ sale_id: sale.id }).orderBy('created_at', 'asc')
      const net = Number(sale.net_total)
      const paid = Number(sale.paid_amount)
      const due = Number(sale.due_amount)
      totalNet = round2(totalNet + net)
      totalPaid = round2(totalPaid + paid)
      totalDue = round2(totalDue + due)
      saleRows.push({ ...asJson(sale)!, lines: asJsonList(lines) })
    }

    const ledger = await getDb()('ledger_entries').where({ customer_id: customerId }).orderBy('created_at', 'asc')

    return {
      customer: { ...asJson(customer)!, balance },
      sales: saleRows,
      ledger: asJsonList(ledger),
      summary: { saleCount: saleRows.length, totalNet, totalPaid, totalDue, balance }
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

  async supplierDetail(companyId: string, supplierId: string): Promise<unknown> {
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

    for (const purchase of productPurchases) {
      const net = Number(purchase.net_total || 0)
      const paid = Number(purchase.paid_amount || 0)
      const due = Number(purchase.due_amount || 0)
      totalNet = round2(totalNet + net)
      totalPaid = round2(totalPaid + paid)
      totalDue = round2(totalDue + due)
      purchaseRows.push({ ...asJson(purchase)!, kind: 'product' })
    }

    for (const purchase of partPurchases) {
      const net = Number(purchase.net_total || 0)
      const paid = Number(purchase.paid_amount || 0)
      const due = Number(purchase.due_amount || 0)
      totalNet = round2(totalNet + net)
      totalPaid = round2(totalPaid + paid)
      totalDue = round2(totalDue + due)
      purchaseRows.push({ ...asJson(purchase)!, kind: 'part' })
    }

    purchaseRows.sort((a, b) => {
      const da = new Date(String(a.purchaseDate || a.createdAt || 0)).getTime()
      const db = new Date(String(b.purchaseDate || b.createdAt || 0)).getTime()
      return db - da
    })

    const ledger = await getDb()('ledger_entries')
      .where({ supplier_id: supplierId })
      .orderBy('created_at', 'asc')

    return {
      supplier: { ...asJson(supplier)!, balance },
      purchases: purchaseRows,
      ledger: asJsonList(ledger),
      summary: {
        purchaseCount: purchaseRows.length,
        totalNet,
        totalPaid,
        totalDue,
        balance
      }
    }
  }
}

export const reportService = new ReportService()

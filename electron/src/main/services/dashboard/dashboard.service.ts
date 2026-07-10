import type { Knex } from 'knex'
import { ProductItemStatus } from '@madix/database'
import { getDb } from '../../db'

export type DashboardFilters = {
  from?: string
  to?: string
  supplierId?: string
  productId?: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseDateRange(from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date()
  const toDate = to ? new Date(to) : new Date(now)
  toDate.setHours(23, 59, 59, 999)

  const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1)
  fromDate.setHours(0, 0, 0, 0)

  return { from: fromDate, to: toDate }
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0
  return round2((numerator / denominator) * 100)
}

function fillDailyTrend(
  from: Date,
  to: Date,
  salesByDay: Map<string, number>,
  purchasesByDay: Map<string, number>,
  expensesByDay: Map<string, number>
): { date: string; sales: number; purchases: number; expenses: number; profit: number }[] {
  const rows: { date: string; sales: number; purchases: number; expenses: number; profit: number }[] = []
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)

  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10)
    const sales = round2(salesByDay.get(key) || 0)
    const purchases = round2(purchasesByDay.get(key) || 0)
    const expenses = round2(expensesByDay.get(key) || 0)
    rows.push({ date: key, sales, purchases, expenses, profit: round2(sales - expenses) })
    cursor.setDate(cursor.getDate() + 1)
  }

  return rows
}

function hasItemFilters(filters?: DashboardFilters): boolean {
  return !!(filters?.supplierId || filters?.productId)
}

function applySaleLineItemFilters(q: Knex.QueryBuilder, filters?: DashboardFilters): Knex.QueryBuilder {
  if (filters?.productId) q.where({ 'pi.product_id': filters.productId })
  if (filters?.supplierId) {
    q.leftJoin('purchases as pu_sl', 'pu_sl.id', 'pi.purchase_id')
    q.where({ 'pu_sl.supplier_id': filters.supplierId })
  }
  return q
}

function applyProductItemFilters(q: Knex.QueryBuilder, filters?: DashboardFilters): Knex.QueryBuilder {
  if (filters?.productId) q.where({ 'pi.product_id': filters.productId })
  if (filters?.supplierId) {
    q.leftJoin('purchases as pu_pi', 'pu_pi.id', 'pi.purchase_id')
    q.where({ 'pu_pi.supplier_id': filters.supplierId })
  }
  return q
}

class DashboardService {
  async getAnalytics(companyId: string, branchId: string, filters?: DashboardFilters): Promise<unknown> {
    const db = getDb()
    const { from: fromDate, to: toDate } = parseDateRange(filters?.from, filters?.to)

    let salesRevenue = 0
    let collectedAmount = 0
    let dueAmount = 0
    let discountTotal = 0
    let salesCount = 0
    let cogs = 0
    let unitsSold = 0

    if (hasItemFilters(filters)) {
      const lineRows = await applySaleLineItemFilters(
        db('sale_lines as sl')
          .join('sales as s', 's.id', 'sl.sale_id')
          .join('product_items as pi', 'pi.id', 'sl.product_item_id')
          .where({ 's.company_id': companyId, 's.branch_id': branchId })
          .where('s.sale_date', '>=', fromDate)
          .where('s.sale_date', '<=', toDate)
          .whereNull('s.deleted_at')
          .select(
            'sl.line_total',
            'sl.id as line_id',
            's.id as sale_id',
            's.net_total',
            's.paid_amount',
            's.due_amount',
            's.discount',
            'pi.purchase_price'
          ),
        filters
      )

      const saleIds = new Set<string>()
      for (const row of lineRows) {
        const lineTotal = Number(row.line_total)
        const netTotal = Number(row.net_total)
        const ratio = netTotal > 0 ? lineTotal / netTotal : 0

        salesRevenue = round2(salesRevenue + lineTotal)
        collectedAmount = round2(collectedAmount + Number(row.paid_amount) * ratio)
        dueAmount = round2(dueAmount + Number(row.due_amount) * ratio)
        discountTotal = round2(discountTotal + Number(row.discount) * ratio)
        cogs = round2(cogs + Number(row.purchase_price))
        unitsSold += 1
        saleIds.add(row.sale_id as string)
      }

      salesCount = saleIds.size
    } else {
      const salesRows = await db('sales')
        .where({ company_id: companyId, branch_id: branchId })
        .where('sale_date', '>=', fromDate)
        .where('sale_date', '<=', toDate)
        .whereNull('deleted_at')

      salesRevenue = round2(salesRows.reduce((sum, row) => sum + Number(row.net_total), 0))
      collectedAmount = round2(salesRows.reduce((sum, row) => sum + Number(row.paid_amount), 0))
      dueAmount = round2(salesRows.reduce((sum, row) => sum + Number(row.due_amount), 0))
      discountTotal = round2(salesRows.reduce((sum, row) => sum + Number(row.discount), 0))
      salesCount = salesRows.length

      const cogsRow = await db('sale_lines as sl')
        .join('sales as s', 's.id', 'sl.sale_id')
        .join('product_items as pi', 'pi.id', 'sl.product_item_id')
        .where({ 's.company_id': companyId, 's.branch_id': branchId })
        .where('s.sale_date', '>=', fromDate)
        .where('s.sale_date', '<=', toDate)
        .whereNull('s.deleted_at')
        .sum({ cogs: db.raw('pi.purchase_price') })
        .count({ unitsSold: 'sl.id' })
        .first()

      cogs = round2(Number(cogsRow?.cogs || 0))
      unitsSold = Number(cogsRow?.unitsSold || 0)
    }
    const grossProfit = round2(salesRevenue - cogs)

    const expenseRows = await db('expenses as e')
      .leftJoin('expense_categories as ec', 'ec.id', 'e.category_id')
      .where({ 'e.company_id': companyId, 'e.branch_id': branchId })
      .where('e.date', '>=', fromDate)
      .where('e.date', '<=', toDate)
      .whereNull('e.deleted_at')
      .select('e.amount', 'ec.name as category_name')

    const expenses = round2(expenseRows.reduce((sum, row) => sum + Number(row.amount), 0))
    const netProfit = round2(grossProfit - expenses)

    const purchaseItems = await applyProductItemFilters(
      db('product_items as pi')
        .where({ 'pi.company_id': companyId, 'pi.branch_id': branchId })
        .where('pi.purchased_at', '>=', fromDate)
        .where('pi.purchased_at', '<=', toDate)
        .whereNull('pi.deleted_at')
        .select('pi.purchase_price'),
      filters
    )

    const purchaseValue = round2(purchaseItems.reduce((sum, item) => sum + Number(item.purchase_price), 0))
    const purchaseCount = purchaseItems.length

    let purchaseRecordsQ = db('purchases as p')
      .where({ 'p.company_id': companyId, 'p.branch_id': branchId })
      .where('p.purchase_date', '>=', fromDate)
      .where('p.purchase_date', '<=', toDate)
      .whereNull('p.deleted_at')

    if (filters?.supplierId) purchaseRecordsQ = purchaseRecordsQ.where({ 'p.supplier_id': filters.supplierId })
    if (filters?.productId) {
      purchaseRecordsQ = purchaseRecordsQ.whereExists(
        db('product_items as pi_p')
          .whereRaw('pi_p.purchase_id = p.id')
          .where({ 'pi_p.product_id': filters.productId })
          .whereNull('pi_p.deleted_at')
      )
    }

    const purchaseRecords = await purchaseRecordsQ

    const inStock = await applyProductItemFilters(
      db('product_items as pi')
        .where({
          'pi.company_id': companyId,
          'pi.current_branch_id': branchId,
          'pi.status': ProductItemStatus.IN_STOCK
        })
        .whereNull('pi.deleted_at')
        .select('pi.purchase_price'),
      filters
    )

    const inventoryValue = round2(inStock.reduce((sum, item) => sum + Number(item.purchase_price), 0))

    const customers = await db('customers').where({ company_id: companyId }).whereNull('deleted_at')
    let outstandingBalance = 0
    for (const c of customers) {
      const last = await db('ledger_entries')
        .where({ customer_id: c.id })
        .orderBy('created_at', 'desc')
        .first()
      if (last) outstandingBalance += Number(last.running_balance)
    }
    outstandingBalance = round2(outstandingBalance)

    let dailySales
    if (hasItemFilters(filters)) {
      dailySales = await applySaleLineItemFilters(
        db('sale_lines as sl')
          .join('sales as s', 's.id', 'sl.sale_id')
          .join('product_items as pi', 'pi.id', 'sl.product_item_id')
          .where({ 's.company_id': companyId, 's.branch_id': branchId })
          .where('s.sale_date', '>=', fromDate)
          .where('s.sale_date', '<=', toDate)
          .whereNull('s.deleted_at')
          .select(db.raw('DATE(s.sale_date) as day'))
          .sum('sl.line_total as total')
          .groupByRaw('DATE(s.sale_date)'),
        filters
      )
    } else {
      dailySales = await db('sales')
        .where({ company_id: companyId, branch_id: branchId })
        .where('sale_date', '>=', fromDate)
        .where('sale_date', '<=', toDate)
        .whereNull('deleted_at')
        .select(db.raw('DATE(sale_date) as day'))
        .sum('net_total as total')
        .groupByRaw('DATE(sale_date)')
    }

    const dailyPurchases = await applyProductItemFilters(
      db('product_items as pi')
        .where({ 'pi.company_id': companyId, 'pi.branch_id': branchId })
        .where('pi.purchased_at', '>=', fromDate)
        .where('pi.purchased_at', '<=', toDate)
        .whereNull('pi.deleted_at')
        .select(db.raw('DATE(pi.purchased_at) as day'))
        .sum('pi.purchase_price as total')
        .groupByRaw('DATE(pi.purchased_at)'),
      filters
    )

    const dailyExpenses = await db('expenses')
      .where({ company_id: companyId, branch_id: branchId })
      .where('date', '>=', fromDate)
      .where('date', '<=', toDate)
      .whereNull('deleted_at')
      .select(db.raw('DATE(date) as day'))
      .sum('amount as total')
      .groupByRaw('DATE(date)')

    const salesByDay = new Map<string, number>()
    for (const row of dailySales) {
      const key = new Date(row.day).toISOString().slice(0, 10)
      salesByDay.set(key, round2(Number(row.total)))
    }

    const purchasesByDay = new Map<string, number>()
    for (const row of dailyPurchases) {
      const key = new Date(row.day).toISOString().slice(0, 10)
      purchasesByDay.set(key, round2(Number(row.total)))
    }

    const expensesByDay = new Map<string, number>()
    for (const row of dailyExpenses) {
      const key = new Date(row.day).toISOString().slice(0, 10)
      expensesByDay.set(key, round2(Number(row.total)))
    }

    const trend = fillDailyTrend(fromDate, toDate, salesByDay, purchasesByDay, expensesByDay)

    const topProductsRaw = await applySaleLineItemFilters(
      db('sale_lines as sl')
        .join('sales as s', 's.id', 'sl.sale_id')
        .join('product_items as pi', 'pi.id', 'sl.product_item_id')
        .where({ 's.company_id': companyId, 's.branch_id': branchId })
        .where('s.sale_date', '>=', fromDate)
        .where('s.sale_date', '<=', toDate)
        .whereNull('s.deleted_at')
        .whereNotNull('sl.product_name')
        .select('sl.product_name')
        .count('* as units')
        .sum('sl.line_total as revenue')
        .groupBy('sl.product_name')
        .orderBy('revenue', 'desc')
        .limit(5),
      filters
    )

    const expenseCategoryMap = new Map<string, number>()
    for (const row of expenseRows) {
      const category = (row.category_name as string) || 'Uncategorized'
      expenseCategoryMap.set(category, round2((expenseCategoryMap.get(category) || 0) + Number(row.amount)))
    }

    const expensesByCategory = [...expenseCategoryMap.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)

    return {
      period: {
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10)
      },
      kpis: {
        salesRevenue,
        salesCount,
        unitsSold,
        purchaseValue,
        purchaseCount: purchaseRecords.length,
        purchaseUnits: purchaseCount,
        expenses,
        expenseCount: expenseRows.length,
        collectedAmount,
        dueAmount,
        discountTotal,
        inStockCount: inStock.length,
        inventoryValue,
        outstandingBalance
      },
      profitLoss: {
        revenue: salesRevenue,
        cogs,
        grossProfit,
        grossMarginPercent: pct(grossProfit, salesRevenue),
        expenses,
        netProfit,
        netMarginPercent: pct(netProfit, salesRevenue)
      },
      insights: {
        avgSaleValue: salesCount ? round2(salesRevenue / salesCount) : 0,
        avgUnitSalePrice: unitsSold ? round2(salesRevenue / unitsSold) : 0,
        collectionRate: salesRevenue ? pct(collectedAmount, salesRevenue) : 0,
        expenseRatio: salesRevenue ? pct(expenses, salesRevenue) : 0
      },
      trend,
      topProducts: topProductsRaw.map((row) => ({
        name: row.product_name as string,
        units: Number(row.units),
        revenue: round2(Number(row.revenue))
      })),
      expensesByCategory
    }
  }

  /** @deprecated Use getAnalytics — kept for compatibility */
  async getMetrics(companyId: string, branchId: string): Promise<unknown> {
    const data = (await this.getAnalytics(companyId, branchId, {})) as Record<string, unknown>
    const kpis = data.kpis as Record<string, number>
    const profitLoss = data.profitLoss as Record<string, number>
    return {
      todaySales: kpis.salesRevenue,
      todayPurchases: kpis.purchaseCount,
      todayPurchaseTotal: kpis.purchaseValue,
      outstandingBalance: kpis.outstandingBalance,
      inventoryValue: kpis.inventoryValue,
      expenses: kpis.expenses,
      profitLoss: profitLoss.netProfit,
      inStockCount: kpis.inStockCount
    }
  }
}

export const dashboardService = new DashboardService()

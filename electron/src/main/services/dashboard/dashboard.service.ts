import { ProductItemStatus } from '@madix/database'
import { getDb } from '../../db'

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

class DashboardService {
  async getAnalytics(companyId: string, branchId: string, from?: string, to?: string): Promise<unknown> {
    const db = getDb()
    const { from: fromDate, to: toDate } = parseDateRange(from, to)

    const salesRows = await db('sales')
      .where({ company_id: companyId, branch_id: branchId })
      .where('sale_date', '>=', fromDate)
      .where('sale_date', '<=', toDate)
      .whereNull('deleted_at')

    const salesRevenue = round2(salesRows.reduce((sum, row) => sum + Number(row.net_total), 0))
    const collectedAmount = round2(salesRows.reduce((sum, row) => sum + Number(row.paid_amount), 0))
    const dueAmount = round2(salesRows.reduce((sum, row) => sum + Number(row.due_amount), 0))
    const discountTotal = round2(salesRows.reduce((sum, row) => sum + Number(row.discount), 0))
    const salesCount = salesRows.length

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

    const cogs = round2(Number(cogsRow?.cogs || 0))
    const unitsSold = Number(cogsRow?.unitsSold || 0)
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

    const purchaseItems = await db('product_items')
      .where({ company_id: companyId, branch_id: branchId })
      .where('purchased_at', '>=', fromDate)
      .where('purchased_at', '<=', toDate)
      .whereNull('deleted_at')

    const purchaseValue = round2(purchaseItems.reduce((sum, item) => sum + Number(item.purchase_price), 0))
    const purchaseCount = purchaseItems.length

    const purchaseRecords = await db('purchases')
      .where({ company_id: companyId, branch_id: branchId })
      .where('purchase_date', '>=', fromDate)
      .where('purchase_date', '<=', toDate)
      .whereNull('deleted_at')

    const inStock = await db('product_items')
      .where({ company_id: companyId, current_branch_id: branchId, status: ProductItemStatus.IN_STOCK })
      .whereNull('deleted_at')

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

    const dailySales = await db('sales')
      .where({ company_id: companyId, branch_id: branchId })
      .where('sale_date', '>=', fromDate)
      .where('sale_date', '<=', toDate)
      .whereNull('deleted_at')
      .select(db.raw('DATE(sale_date) as day'))
      .sum('net_total as total')
      .groupByRaw('DATE(sale_date)')

    const dailyPurchases = await db('product_items')
      .where({ company_id: companyId, branch_id: branchId })
      .where('purchased_at', '>=', fromDate)
      .where('purchased_at', '<=', toDate)
      .whereNull('deleted_at')
      .select(db.raw('DATE(purchased_at) as day'))
      .sum('purchase_price as total')
      .groupByRaw('DATE(purchased_at)')

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

    const topProductsRaw = await db('sale_lines as sl')
      .join('sales as s', 's.id', 'sl.sale_id')
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
      .limit(5)

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
    const data = (await this.getAnalytics(companyId, branchId)) as Record<string, unknown>
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

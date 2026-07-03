import { ProductItemStatus } from '@madix/database'
import { getDb } from '../../db'

class DashboardService {
  async getMetrics(companyId: string, branchId: string): Promise<unknown> {
    const db = getDb()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todaySalesRows = await db('sales')
      .where({ company_id: companyId, branch_id: branchId })
      .where('sale_date', '>=', today)
      .whereNull('deleted_at')

    const todaySales = todaySalesRows.reduce((sum, row) => sum + Number(row.net_total), 0)

    const todayPurchases = await db('purchases')
      .where({ company_id: companyId, branch_id: branchId })
      .where('purchase_date', '>=', today)
      .whereNull('deleted_at')

    const inStock = await db('product_items')
      .where({ company_id: companyId, current_branch_id: branchId, status: ProductItemStatus.IN_STOCK })
      .whereNull('deleted_at')

    const inventoryValue = inStock.reduce((sum, item) => sum + Number(item.purchase_price), 0)

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const expenses = await db('expenses')
      .where({ company_id: companyId, branch_id: branchId })
      .where('date', '>=', monthStart)
      .whereNull('deleted_at')

    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

    const customers = await db('customers').where({ company_id: companyId }).whereNull('deleted_at')
    let outstandingBalance = 0
    for (const c of customers) {
      const last = await db('ledger_entries')
        .where({ customer_id: c.id })
        .orderBy('created_at', 'desc')
        .first()
      if (last) outstandingBalance += Number(last.running_balance)
    }

    const todayPurchaseValue = await db('product_items')
      .where({ company_id: companyId, branch_id: branchId })
      .where('purchased_at', '>=', today)
      .whereNull('deleted_at')

    const todayPurchaseTotal = todayPurchaseValue.reduce(
      (sum, item) => sum + Number(item.purchase_price),
      0
    )

    return {
      todaySales,
      todayPurchases: todayPurchases.length,
      todayPurchaseTotal,
      outstandingBalance,
      inventoryValue,
      expenses: totalExpenses,
      profitLoss: todaySales - totalExpenses,
      inStockCount: inStock.length
    }
  }
}

export const dashboardService = new DashboardService()

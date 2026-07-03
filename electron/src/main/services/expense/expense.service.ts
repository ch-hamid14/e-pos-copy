import { getDb } from '../../db'
import { generateId } from '../../../common/utils/uuid'
import {
  AUDIT_USER_SELECT,
  type AuditContext,
  applyStaffScope,
  auditDelete,
  enrichAuditUsers,
  joinAuditUsers,
  withAuditCreate,
  withAuditCreateWithDevice
} from '../shared/audit.helpers'
import { asJson, asJsonList } from '../shared/json.helpers'

export type CreateExpensePayload = {
  categoryId?: string
  amount: number
  date: string
  description?: string
}

class ExpenseService {
  async list(
    companyId: string,
    branchId: string,
    from?: string,
    to?: string,
    ctx?: AuditContext | null
  ): Promise<unknown[]> {
    let q = getDb()('expenses as e')
      .leftJoin('expense_categories as c', 'e.category_id', 'c.id')
      .where({ 'e.company_id': companyId, 'e.branch_id': branchId })
      .whereNull('e.deleted_at')
    joinAuditUsers(q, 'e')
    q = applyStaffScope(q, ctx ?? null, 'e.created_by', 'e.branch_id')
    q.select('e.*', 'c.name as category_name', ...AUDIT_USER_SELECT)
      .orderBy('e.date', 'desc')
      .orderBy('e.created_at', 'desc')

    if (from) q.where('e.date', '>=', new Date(from))
    if (to) {
      const end = new Date(to)
      end.setHours(23, 59, 59, 999)
      q.where('e.date', '<=', end)
    }

    const rows = await q
    return rows.map((r) => ({
      ...enrichAuditUsers(r),
      category: r.category_name ? { name: r.category_name } : null
    }))
  }

  async categories(companyId: string): Promise<unknown[]> {
    const rows = await getDb()('expense_categories')
      .where({ company_id: companyId })
      .whereNull('deleted_at')
      .orderBy('name', 'asc')
    return asJsonList(rows)
  }

  async createCategory(companyId: string, name: string, ctx: AuditContext): Promise<unknown> {
    const trimmed = name?.trim()
    if (!trimmed) throw new Error('Category name is required')

    const existing = await getDb()('expense_categories')
      .where({ company_id: companyId, name: trimmed })
      .whereNull('deleted_at')
      .first()
    if (existing) throw new Error('Category already exists')

    const [row] = await getDb()('expense_categories')
      .insert(withAuditCreate(ctx, {
        id: generateId(),
        company_id: companyId,
        name: trimmed,
        created_at: new Date(),
        updated_at: new Date()
      }))
      .returning('*')
    return asJson(row)
  }

  async updateCategory(id: string, companyId: string, name: string): Promise<unknown> {
    const trimmed = name?.trim()
    if (!trimmed) throw new Error('Category name is required')

    const row = await getDb()('expense_categories')
      .where({ id, company_id: companyId })
      .whereNull('deleted_at')
      .first()
    if (!row) throw new Error('Category not found')

    const existing = await getDb()('expense_categories')
      .where({ company_id: companyId, name: trimmed })
      .whereNull('deleted_at')
      .whereNot({ id })
      .first()
    if (existing) throw new Error('Category already exists')

    const [updated] = await getDb()('expense_categories')
      .where({ id })
      .update({ name: trimmed, updated_at: new Date() })
      .returning('*')
    return asJson(updated)
  }

  async removeCategory(id: string, companyId: string, ctx: AuditContext): Promise<void> {
    const row = await getDb()('expense_categories').where({ id, company_id: companyId }).whereNull('deleted_at').first()
    if (!row) throw new Error('Category not found')

    const [{ count }] = await getDb()('expenses').where({ category_id: id }).count('* as count')
    if (Number(count) > 0) throw new Error('Cannot delete a category that has expenses')

    await getDb()('expense_categories').where({ id }).update(auditDelete(ctx))
  }

  async create(
    companyId: string,
    branchId: string,
    ctx: AuditContext,
    payload: CreateExpensePayload
  ): Promise<unknown> {
    const amount = Number(payload.amount || 0)
    if (amount <= 0) throw new Error('Enter a valid expense amount')
    if (!payload.date) throw new Error('Expense date is required')

    if (payload.categoryId) {
      const category = await getDb()('expense_categories')
        .where({ id: payload.categoryId, company_id: companyId })
        .whereNull('deleted_at')
        .first()
      if (!category) throw new Error('Invalid expense category')
    }

    const [expense] = await getDb()('expenses')
      .insert(withAuditCreateWithDevice(ctx, {
        id: generateId(),
        company_id: companyId,
        branch_id: branchId,
        category_id: payload.categoryId || null,
        amount,
        date: new Date(payload.date),
        description: payload.description || '',
        created_at: new Date(),
        updated_at: new Date()
      }))
      .returning('*')

    return asJson(expense)
  }

  async remove(id: string, companyId: string, ctx: AuditContext): Promise<void> {
    const expense = await getDb()('expenses').where({ id, company_id: companyId }).whereNull('deleted_at').first()
    if (!expense) throw new Error('Expense not found')
    await getDb()('expenses').where({ id }).update(auditDelete(ctx))
  }
}

export const expenseService = new ExpenseService()

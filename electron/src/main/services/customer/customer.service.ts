import type { Knex } from 'knex'
import { LedgerEntryType } from '@madix/database'
import { getDb, withTransaction } from '../../db'
import { generateId } from '../../../common/utils/uuid'
import {
  type AuditContext,
  auditCreate,
  auditDelete,
  withAuditCreate,
  withAuditUpdate
} from '../shared/audit.helpers'
import { asJsonList } from '../shared/json.helpers'
import {
  balanceFromLedgerEntries,
  orderAndRecomputeLedgerBalances
} from '../shared/ledger-order.helpers'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function computeCustomerBalance(
  customerId: string,
  transaction?: Knex.Transaction
): Promise<number> {
  const db = getDb()
  const q = transaction ? db('ledger_entries').transacting(transaction) : db('ledger_entries')
  const entries = await q.where({ customer_id: customerId })
  return balanceFromLedgerEntries(entries as Record<string, unknown>[])
}

class CustomerService {
  async list(
    companyId: string,
    search?: string,
    sortField?: string,
    sortOrder?: string,
    dueFilter?: string
  ): Promise<unknown[]> {
    const order = sortOrder === 'desc' ? 'desc' : 'asc'
    const sortByBalance = sortField === 'balance'

    const q = getDb()('customers')
      .where({ company_id: companyId })
      .whereNull('deleted_at')

    if (search?.trim()) {
      const term = `%${search.trim()}%`
      q.where((builder) => {
        builder
          .whereILike('name', term)
          .orWhereILike('phone', term)
          .orWhereILike('cnic', term)
      })
    }

    if (!sortByBalance) {
      q.orderBy('name', 'asc')
    } else {
      q.orderBy('name', 'asc')
    }

    const customers = await q
    let result: Record<string, unknown>[] = []

    for (const customer of customers) {
      const balance = await computeCustomerBalance(customer.id as string)
      result.push({ ...customer, balance })
    }

    if (dueFilter === 'due') {
      result = result.filter((c) => Number(c.balance) > 0)
    } else if (dueFilter === 'not_due') {
      result = result.filter((c) => Number(c.balance) <= 0)
    }

    if (sortByBalance) {
      result.sort((a, b) => {
        const diff = Number(a.balance) - Number(b.balance)
        return order === 'asc' ? diff : -diff
      })
    }

    return result.map((r) => {
      const { id, company_id, ...rest } = r
      return {
        id,
        companyId: company_id,
        ...Object.fromEntries(
          Object.entries(rest).map(([k, v]) => [
            k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
            v
          ])
        )
      }
    })
  }

  async create(
    companyId: string,
    ctx: AuditContext,
    data: { name: string; phone?: string; cnic?: string; address?: string; openingBalance?: number }
  ): Promise<unknown> {
    return withTransaction(async (transaction) => {
      const [customer] = await getDb()('customers')
        .transacting(transaction)
        .insert(withAuditCreate(ctx, {
          id: generateId(),
          company_id: companyId,
          name: data.name,
          phone: data.phone || '',
          cnic: data.cnic || '',
          address: data.address || '',
          created_at: new Date(),
          updated_at: new Date()
        }))
        .returning('*')

      const openingBalance = Number(data.openingBalance || 0)
      if (openingBalance > 0) {
        await getDb()('ledger_entries').transacting(transaction).insert({
          id: generateId(),
          company_id: companyId,
          customer_id: customer.id,
          type: LedgerEntryType.OPENING_BALANCE,
          amount: openingBalance,
          reference_type: 'customer',
          reference_id: customer.id,
          running_balance: openingBalance,
          ...auditCreate(ctx),
          created_at: new Date()
        })
      }

      return { ...customer, balance: openingBalance }
    })
  }

  async update(
    id: string,
    companyId: string,
    ctx: AuditContext,
    data: { name?: string; phone?: string; cnic?: string; address?: string }
  ): Promise<unknown> {
    return withTransaction(async (transaction) => {
      const customer = await getDb()('customers')
        .where({ id, company_id: companyId })
        .whereNull('deleted_at')
        .first()
      if (!customer) throw new Error('Customer not found')

      const [updated] = await getDb()('customers')
        .transacting(transaction)
        .where({ id })
        .update(withAuditUpdate(ctx, {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.cnic !== undefined && { cnic: data.cnic }),
          ...(data.address !== undefined && { address: data.address })
        }))
        .returning('*')

      const balance = await computeCustomerBalance(id, transaction)
      return { ...updated, balance }
    })
  }

  async remove(id: string, companyId: string, ctx: AuditContext): Promise<void> {
    const customer = await getDb()('customers').where({ id, company_id: companyId }).whereNull('deleted_at').first()
    if (!customer) throw new Error('Customer not found')

    const balance = await computeCustomerBalance(id)
    if (balance > 0) throw new Error('Cannot delete a customer with outstanding balance')

    await getDb()('customers').where({ id }).update(auditDelete(ctx))
  }

  async ledger(customerId: string): Promise<unknown[]> {
    const rows = await getDb()('ledger_entries').where({ customer_id: customerId })
    return asJsonList(orderAndRecomputeLedgerBalances(rows as Record<string, unknown>[]))
  }
}

export const customerService = new CustomerService()

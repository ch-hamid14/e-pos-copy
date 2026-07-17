import type { Knex } from 'knex'
import { randomUUID } from 'crypto'
import { getCompanyDb } from '../../db'

type LedgerEffectRow = {
  customer_id: string
  type: string
  amount: string | number
}

function roundAmount(value: number): number {
  return Math.round(Number(value) || 0)
}

async function customerBalance(db: Knex.Transaction, customerId: string): Promise<number> {
  const rows = await db('ledger_entries')
    .where({ customer_id: customerId })
    .select('type', 'amount')

  return roundAmount(
    rows.reduce((balance, row) => {
      const amount = Number(row.amount || 0)
      return row.type === 'payment_credit' ? balance - amount : balance + amount
    }, 0)
  )
}

/**
 * Rebuilds sale totals from its lines, synchronizes paid/due totals from payment
 * rows, and appends ledger corrections. Existing payments remain untouched;
 * any amount paid above the sale total becomes customer credit.
 */
export async function reconcileSaleFinances(companyId: string, saleId: string) {
  const db = await getCompanyDb(companyId, { forOps: true })

  return db.transaction(async (trx) => {
    const sale = await trx('sales')
      .where({ id: saleId, company_id: companyId })
      .whereNull('deleted_at')
      .first()
    if (!sale) throw new Error('Sale not found')

    const lines = await trx('sale_lines').where({ sale_id: saleId })
    if (!lines.length) throw new Error('Sale has no lines to reconcile')

    const payments = await trx('payments').where({ sale_id: saleId })

    const subtotal = roundAmount(
      lines.reduce(
        (sum, line) => sum + Number(line.sale_price || 0) * Math.max(1, Number(line.quantity || 1)),
        0
      )
    )
    const totalTax = roundAmount(
      lines.reduce((sum, line) => sum + Number(line.tax_amount || 0), 0)
    )
    const totalWht = roundAmount(
      lines.reduce((sum, line) => sum + Number(line.wht_amount || 0), 0)
    )
    const discount = roundAmount(Number(sale.discount || 0))
    const netTotal = roundAmount(subtotal + totalTax + totalWht - discount)
    if (netTotal < 0) throw new Error('Sale total cannot be negative')

    const paidAmount = roundAmount(
      payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    )
    const dueAmount = Math.max(0, roundAmount(netTotal - paidAmount))
    const excessCredit = Math.max(0, roundAmount(paidAmount - netTotal))

    await trx('sales').where({ id: saleId }).update({
      subtotal,
      total_tax: totalTax,
      total_wht: totalWht,
      net_total: netTotal,
      paid_amount: paidAmount,
      due_amount: dueAmount,
      ...(dueAmount === 0 ? { due_reminder_date: null } : {}),
      updated_at: new Date()
    })

    const relatedEntries = (await trx('ledger_entries')
      .where({ reference_id: saleId })
      .whereIn('reference_type', ['sale', 'sale_edit', 'sale_reconcile'])
      .select('customer_id', 'type', 'amount')) as LedgerEffectRow[]

    const effects = new Map<string, number>()
    for (const entry of relatedEntries) {
      if (!entry.customer_id) continue
      const amount = Number(entry.amount || 0)
      const effect = entry.type === 'payment_credit' ? -amount : amount
      effects.set(entry.customer_id, roundAmount((effects.get(entry.customer_id) || 0) + effect))
    }

    const currentCustomerId = String(sale.customer_id)
    const customerIds = new Set([...effects.keys(), currentCustomerId])
    const expectedCurrentEffect = roundAmount(netTotal - paidAmount)
    const adjustments: Array<{
      customerId: string
      type: 'sale_debit' | 'payment_credit'
      amount: number
    }> = []

    for (const customerId of customerIds) {
      const expected = customerId === currentCustomerId ? expectedCurrentEffect : 0
      const actual = effects.get(customerId) || 0
      const delta = roundAmount(expected - actual)
      if (delta === 0) continue

      const type = delta > 0 ? 'sale_debit' : 'payment_credit'
      const amount = Math.abs(delta)
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
        reference_type: 'sale_reconcile',
        reference_id: saleId,
        running_balance: runningBalance,
        created_at: new Date()
      })
      adjustments.push({ customerId, type, amount })
    }

    return {
      saleId,
      lineCount: lines.length,
      paymentCount: payments.length,
      subtotal,
      totalTax,
      totalWht,
      discount,
      netTotal,
      paidAmount,
      dueAmount,
      excessCredit,
      adjustments
    }
  })
}

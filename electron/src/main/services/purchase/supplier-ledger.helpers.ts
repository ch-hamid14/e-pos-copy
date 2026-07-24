import type { Knex } from 'knex'
import { LedgerEntryType, PaymentMethod } from '@madix/database'
import { getDb } from '../../db'
import { generateId } from '../../../common/utils/uuid'
import { type AuditContext, auditCreate } from '../shared/audit.helpers'

function roundRs(n: number): number {
  return Math.round(Number(n) || 0)
}

/** Positive balance = we owe the supplier. */
export async function computeSupplierBalance(
  supplierId: string,
  transaction?: Knex.Transaction
): Promise<number> {
  const db = getDb()
  const q = transaction ? db('ledger_entries').transacting(transaction) : db('ledger_entries')
  const entries = await q.where({ supplier_id: supplierId }).orderBy('created_at', 'asc')

  let balance = 0
  for (const entry of entries) {
    const amount = Number(entry.amount)
    if (entry.type === LedgerEntryType.SUPPLIER_PAYMENT_CREDIT) {
      balance = roundRs(balance - amount)
    } else {
      // purchase_debit, adjustment, etc.
      balance = roundRs(balance + amount)
    }
  }
  return balance
}

export async function postPurchaseApLedger(
  transaction: Knex.Transaction,
  opts: {
    companyId: string
    supplierId: string
    netTotal: number
    paidAmount: number
    referenceType: 'purchase' | 'part_purchase'
    referenceId: string
    paymentMethod?: string
    paymentDate?: Date
    purchaseId?: string | null
    partPurchaseId?: string | null
    ctx: AuditContext
  }
): Promise<void> {
  const netTotal = roundRs(opts.netTotal)
  const paidAmount = roundRs(Math.min(Math.max(0, opts.paidAmount), netTotal))
  if (netTotal <= 0 && paidAmount <= 0) return

  let balance = await computeSupplierBalance(opts.supplierId, transaction)
  const debitAt = new Date()

  if (netTotal > 0) {
    balance = roundRs(balance + netTotal)
    await getDb()('ledger_entries').transacting(transaction).insert({
      id: generateId(),
      company_id: opts.companyId,
      customer_id: null,
      supplier_id: opts.supplierId,
      type: LedgerEntryType.PURCHASE_DEBIT,
      amount: netTotal,
      reference_type: opts.referenceType,
      reference_id: opts.referenceId,
      running_balance: balance,
      ...auditCreate(opts.ctx),
      created_at: debitAt
    })
  }

  if (paidAmount > 0) {
    await getDb()('purchase_payments').transacting(transaction).insert({
      id: generateId(),
      company_id: opts.companyId,
      purchase_id: opts.purchaseId || null,
      part_purchase_id: opts.partPurchaseId || null,
      amount: paidAmount,
      method: opts.paymentMethod || PaymentMethod.CASH,
      payment_date: opts.paymentDate || debitAt,
      ...auditCreate(opts.ctx),
      created_at: debitAt,
      updated_at: debitAt
    })

    balance = roundRs(balance - paidAmount)
    const creditAt = new Date(debitAt.getTime() + 1)
    await getDb()('ledger_entries').transacting(transaction).insert({
      id: generateId(),
      company_id: opts.companyId,
      customer_id: null,
      supplier_id: opts.supplierId,
      type: LedgerEntryType.SUPPLIER_PAYMENT_CREDIT,
      amount: paidAmount,
      reference_type: opts.referenceType,
      reference_id: opts.referenceId,
      running_balance: balance,
      ...auditCreate(opts.ctx),
      created_at: creditAt
    })
  }
}

/** Neutralize AP for a voided purchase (mirror sale void lesson). */
export async function neutralizePurchaseApLedger(
  transaction: Knex.Transaction,
  opts: {
    companyId: string
    supplierId: string
    netTotal: number
    paidAmount: number
    referenceType: 'purchase' | 'part_purchase'
    referenceId: string
    ctx: AuditContext
  }
): Promise<void> {
  const netTotal = roundRs(opts.netTotal)
  const paidAmount = roundRs(opts.paidAmount)
  if (netTotal <= 0 && paidAmount <= 0) return

  let balance = await computeSupplierBalance(opts.supplierId, transaction)
  const now = new Date()

  // Reverse prior payment credit first (restore AP), then reverse purchase debit.
  if (paidAmount > 0) {
    balance = roundRs(balance + paidAmount)
    await getDb()('ledger_entries').transacting(transaction).insert({
      id: generateId(),
      company_id: opts.companyId,
      customer_id: null,
      supplier_id: opts.supplierId,
      type: LedgerEntryType.PURCHASE_DEBIT,
      amount: paidAmount,
      reference_type: `${opts.referenceType}_void`,
      reference_id: opts.referenceId,
      running_balance: balance,
      ...auditCreate(opts.ctx),
      created_at: now
    })
  }

  if (netTotal > 0) {
    balance = roundRs(balance - netTotal)
    await getDb()('ledger_entries').transacting(transaction).insert({
      id: generateId(),
      company_id: opts.companyId,
      customer_id: null,
      supplier_id: opts.supplierId,
      type: LedgerEntryType.SUPPLIER_PAYMENT_CREDIT,
      amount: netTotal,
      reference_type: `${opts.referenceType}_void`,
      reference_id: opts.referenceId,
      running_balance: balance,
      ...auditCreate(opts.ctx),
      created_at: new Date(now.getTime() + 1)
    })
  }
}

export async function recordSupplierPayment(
  transaction: Knex.Transaction,
  opts: {
    companyId: string
    supplierId: string
    amount: number
    method?: string
    paymentDate?: Date
    purchaseId?: string | null
    partPurchaseId?: string | null
    referenceType: 'purchase' | 'part_purchase'
    referenceId: string
    ctx: AuditContext
    /** When true, only posts ledger (payment row already exists). */
    skipPaymentRow?: boolean
  }
): Promise<void> {
  const amount = roundRs(opts.amount)
  if (amount <= 0) throw new Error('Payment amount must be greater than zero')

  const payAt = opts.paymentDate || new Date()
  if (!opts.skipPaymentRow) {
    await getDb()('purchase_payments').transacting(transaction).insert({
      id: generateId(),
      company_id: opts.companyId,
      purchase_id: opts.purchaseId || null,
      part_purchase_id: opts.partPurchaseId || null,
      amount,
      method: opts.method || PaymentMethod.CASH,
      payment_date: payAt,
      ...auditCreate(opts.ctx),
      created_at: payAt,
      updated_at: payAt
    })
  }

  let balance = await computeSupplierBalance(opts.supplierId, transaction)
  balance = roundRs(balance - amount)
  await getDb()('ledger_entries').transacting(transaction).insert({
    id: generateId(),
    company_id: opts.companyId,
    customer_id: null,
    supplier_id: opts.supplierId,
    type: LedgerEntryType.SUPPLIER_PAYMENT_CREDIT,
    amount,
    reference_type: opts.referenceType,
    reference_id: opts.referenceId,
    running_balance: balance,
    ...auditCreate(opts.ctx),
    created_at: payAt
  })
}

/** Adjust AP when purchase net total changes on edit (same supplier). */
export async function adjustPurchaseApNetChange(
  transaction: Knex.Transaction,
  opts: {
    companyId: string
    supplierId: string
    oldNet: number
    newNet: number
    referenceType: 'purchase' | 'part_purchase'
    referenceId: string
    ctx: AuditContext
  }
): Promise<void> {
  const delta = roundRs(opts.newNet - opts.oldNet)
  if (delta === 0) return

  if (delta > 0) {
    await postPurchaseApLedger(transaction, {
      companyId: opts.companyId,
      supplierId: opts.supplierId,
      netTotal: delta,
      paidAmount: 0,
      referenceType: opts.referenceType,
      referenceId: opts.referenceId,
      ctx: opts.ctx
    })
    return
  }

  await recordSupplierPayment(transaction, {
    companyId: opts.companyId,
    supplierId: opts.supplierId,
    amount: Math.abs(delta),
    referenceType: opts.referenceType,
    referenceId: opts.referenceId,
    ctx: opts.ctx,
    skipPaymentRow: true
  })
}

export { roundRs }

import { LedgerEntryType } from '@madix/database'

/** Classic GL-ish rank: opening → invoices/purchases → adjustments → payments. */
const TYPE_RANK: Record<string, number> = {
  [LedgerEntryType.OPENING_BALANCE]: 0,
  [LedgerEntryType.SALE_DEBIT]: 1,
  [LedgerEntryType.PURCHASE_DEBIT]: 1,
  [LedgerEntryType.ADJUSTMENT]: 2,
  [LedgerEntryType.PAYMENT_CREDIT]: 3,
  [LedgerEntryType.SUPPLIER_PAYMENT_CREDIT]: 3
}

function roundRs(n: number): number {
  return Math.round(Number(n) || 0)
}

function entryTime(entry: Record<string, unknown>): number {
  const raw = entry.created_at ?? entry.createdAt
  const t = raw ? new Date(raw as string | Date).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

function typeRank(type: unknown): number {
  return TYPE_RANK[String(type)] ?? 5
}

/**
 * Effective sort time so payment credits never appear before their matching
 * debit when paymentDate was wrongly stored as midnight created_at.
 */
function effectiveSortTime(
  entry: Record<string, unknown>,
  debitTimeByRef: Map<string, number>
): number {
  const t = entryTime(entry)
  const type = String(entry.type || '')
  const isPayment =
    type === LedgerEntryType.PAYMENT_CREDIT || type === LedgerEntryType.SUPPLIER_PAYMENT_CREDIT
  if (!isPayment) return t

  const refType = String(entry.reference_type ?? entry.referenceType ?? '')
  const refId = String(entry.reference_id ?? entry.referenceId ?? '')
  if (!refType || !refId) return t

  const debitAt = debitTimeByRef.get(`${refType}:${refId}`)
  if (debitAt == null) return t
  // Midnight paymentDate stamps land before the purchase; push them after it.
  // Paired pay-now credits (+1ms) stay put.
  return t < debitAt ? debitAt + 2 : t
}

function buildDebitTimeIndex(entries: Record<string, unknown>[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const entry of entries) {
    const type = String(entry.type || '')
    if (type !== LedgerEntryType.SALE_DEBIT && type !== LedgerEntryType.PURCHASE_DEBIT) continue
    const refType = String(entry.reference_type ?? entry.referenceType ?? '')
    const refId = String(entry.reference_id ?? entry.referenceId ?? '')
    if (!refType || !refId) continue
    const key = `${refType}:${refId}`
    const t = entryTime(entry)
    const prev = map.get(key)
    if (prev == null || t < prev) map.set(key, t)
  }
  return map
}

/** Sort like a classic GL: post time ASC, debit before credit, then id. */
export function sortLedgerEntries<T extends Record<string, unknown>>(entries: T[]): T[] {
  const debitTimeByRef = buildDebitTimeIndex(entries)
  return [...entries].sort((a, b) => {
    const ta = effectiveSortTime(a, debitTimeByRef)
    const tb = effectiveSortTime(b, debitTimeByRef)
    if (ta !== tb) return ta - tb
    const rank = typeRank(a.type) - typeRank(b.type)
    if (rank !== 0) return rank
    return String(a.id ?? '').localeCompare(String(b.id ?? ''))
  })
}

function isCreditType(type: unknown): boolean {
  const t = String(type)
  return t === LedgerEntryType.PAYMENT_CREDIT || t === LedgerEntryType.SUPPLIER_PAYMENT_CREDIT
}

/**
 * Sort entries and rewrite running_balance so the Balance column matches
 * display order (fixes ledgers polluted by midnight paymentDate timestamps).
 */
export function orderAndRecomputeLedgerBalances<T extends Record<string, unknown>>(
  entries: T[]
): T[] {
  const sorted = sortLedgerEntries(entries)
  let balance = 0
  return sorted.map((entry) => {
    const amount = Number(entry.amount || 0)
    balance = isCreditType(entry.type) ? roundRs(balance - amount) : roundRs(balance + amount)
    return {
      ...entry,
      running_balance: balance,
      runningBalance: balance
    }
  })
}

export function balanceFromLedgerEntries(entries: Record<string, unknown>[]): number {
  const ordered = orderAndRecomputeLedgerBalances(entries)
  if (!ordered.length) return 0
  return roundRs(Number(ordered[ordered.length - 1].running_balance ?? 0))
}

function dayStartMs(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00`).getTime()
}

function dayEndMs(isoDate: string): number {
  return new Date(`${isoDate}T23:59:59.999`).getTime()
}

/**
 * Classic statement period: opening = balance before `from`, period rows only,
 * running balances recomputed from that opening.
 * Omit from/to for the full ledger.
 */
export function ledgerForPeriod<T extends Record<string, unknown>>(
  entries: T[],
  from?: string,
  to?: string
): { openingBalance: number; closingBalance: number; ledger: T[] } {
  const ordered = orderAndRecomputeLedgerBalances(entries)
  if (!from && !to) {
    const closing = ordered.length
      ? roundRs(Number(ordered[ordered.length - 1].running_balance ?? 0))
      : 0
    return { openingBalance: 0, closingBalance: closing, ledger: ordered }
  }

  const fromMs = from ? dayStartMs(from) : Number.NEGATIVE_INFINITY
  const toMs = to ? dayEndMs(to) : Number.POSITIVE_INFINITY
  const debitTimeByRef = buildDebitTimeIndex(ordered)

  let openingBalance = 0
  const inPeriod: T[] = []
  for (const entry of ordered) {
    const t = effectiveSortTime(entry, debitTimeByRef)
    if (t < fromMs) {
      openingBalance = roundRs(Number(entry.running_balance ?? 0))
      continue
    }
    if (t > toMs) continue
    inPeriod.push(entry)
  }

  let balance = openingBalance
  const ledger = inPeriod.map((entry) => {
    const amount = Number(entry.amount || 0)
    balance = isCreditType(entry.type) ? roundRs(balance - amount) : roundRs(balance + amount)
    return {
      ...entry,
      running_balance: balance,
      runningBalance: balance
    }
  })

  return {
    openingBalance,
    closingBalance: ledger.length ? balance : openingBalance,
    ledger
  }
}

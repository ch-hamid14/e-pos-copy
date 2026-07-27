import dayjs from 'dayjs'

export type LedgerPartyType = 'customer' | 'supplier'

export type LedgerEntryRow = {
  id?: string
  type: string
  amount: number
  runningBalance?: number
  createdAt?: string
  referenceType?: string
  referenceId?: string
}

export type LedgerPartyData = {
  partyType: LedgerPartyType
  partyName: string
  partyPhone?: string
  partyAddress?: string
  balance: number
  ledger: LedgerEntryRow[]
  fromDate?: string
  toDate?: string
  /** When set (e.g. filtered period), used if ledger is empty or as print opening. */
  openingBalance?: number
}

export type LedgerStatementLine = {
  date: string
  typeCode: string
  typeLabel: string
  details: string
  debit: number
  credit: number
  balance: number
}

export type LedgerStatementData = {
  companyName: string
  companyPhone: string
  companyAddress: string
  title: string
  partyLabel: string
  partyName: string
  partyPhone: string
  partyAddress: string
  printedAt: string
  periodLabel: string
  openingBalance: number
  closingBalance: number
  lines: LedgerStatementLine[]
}

const TYPE_META: Record<string, { code: string; label: string; side: 'debit' | 'credit' }> = {
  opening_balance: { code: 'OB', label: 'Opening Balance', side: 'debit' },
  sale_debit: { code: 'IN', label: 'Sale', side: 'debit' },
  payment_credit: { code: 'RC', label: 'Payment', side: 'credit' },
  purchase_debit: { code: 'PU', label: 'Purchase', side: 'debit' },
  supplier_payment_credit: { code: 'PY', label: 'Payment', side: 'credit' },
  adjustment: { code: 'JE', label: 'Adjustment', side: 'debit' }
}

const REFERENCE_TYPE_LABELS: Record<string, { code: string; label: string }> = {
  payment_edit: { code: 'PA', label: 'Payment adjustment' },
  sale_edit: { code: 'SA', label: 'Sale adjustment' },
  purchase_edit: { code: 'PA', label: 'Purchase adjustment' },
  sale_void: { code: 'VD', label: 'Void reversal' },
  purchase_void: { code: 'VD', label: 'Void reversal' },
  part_purchase_void: { code: 'VD', label: 'Void reversal' },
  sale_reconcile: { code: 'RC', label: 'Reconciliation' }
}

function resolveEntryMeta(entry: LedgerEntryRow): { code: string; label: string; side: 'debit' | 'credit' } {
  const refOverride = entry.referenceType ? REFERENCE_TYPE_LABELS[entry.referenceType] : undefined
  const typeMeta = TYPE_META[entry.type] || {
    code: 'JE',
    label: entry.type,
    side: 'debit' as const
  }
  if (refOverride) {
    return { ...typeMeta, code: refOverride.code, label: refOverride.label }
  }
  return typeMeta
}

function formatReference(entry: LedgerEntryRow): string {
  if (!entry.referenceId) return '—'
  return String(entry.referenceId).slice(0, 8)
}

export type PrintCompanyHeader = {
  name: string
  phone?: string
  address?: string
}

export function mapLedgerToStatement(
  party: LedgerPartyData,
  company: PrintCompanyHeader | string
): LedgerStatementData {
  const debitTypes = new Set(['opening_balance', 'sale_debit', 'purchase_debit', 'adjustment'])
  const creditTypes = new Set(['payment_credit', 'supplier_payment_credit'])
  const refKey = (e: LedgerEntryRow) => `${e.referenceType || ''}:${e.referenceId || ''}`

  const debitTimes = new Map<string, number>()
  for (const e of party.ledger || []) {
    if (!debitTypes.has(e.type) || !e.referenceId) continue
    const key = refKey(e)
    const t = e.createdAt ? dayjs(e.createdAt).valueOf() : 0
    const prev = debitTimes.get(key)
    if (prev == null || t < prev) debitTimes.set(key, t)
  }

  const effectiveTime = (e: LedgerEntryRow) => {
    const t = e.createdAt ? dayjs(e.createdAt).valueOf() : 0
    if (!creditTypes.has(e.type) || !e.referenceId) return t
    const debitAt = debitTimes.get(refKey(e))
    if (debitAt == null) return t
    return t < debitAt ? debitAt + 2 : t
  }

  const typeRank = (type: string) => {
    if (type === 'opening_balance') return 0
    if (type === 'sale_debit' || type === 'purchase_debit') return 1
    if (type === 'adjustment') return 2
    if (creditTypes.has(type)) return 3
    return 5
  }

  // Defensive: keep print order aligned with classic GL (matching debit before credit).
  const sortedLedger = [...(party.ledger || [])].sort((a, b) => {
    const ea = effectiveTime(a)
    const eb = effectiveTime(b)
    if (ea !== eb) return ea - eb
    const r = typeRank(a.type) - typeRank(b.type)
    if (r !== 0) return r
    return String(a.id || '').localeCompare(String(b.id || ''))
  })

  let running = 0
  const lines: LedgerStatementLine[] = sortedLedger.map((entry) => {
    const meta = resolveEntryMeta(entry)
    const amount = Number(entry.amount || 0)
    const isCredit =
      entry.type === 'payment_credit' || entry.type === 'supplier_payment_credit' || meta.side === 'credit'
    running = Math.round(running + (isCredit ? -amount : amount))
    return {
      date: entry.createdAt ? dayjs(entry.createdAt).format('DD MMM YYYY') : '—',
      typeCode: meta.code,
      typeLabel: meta.label,
      details: formatReference(entry),
      debit: isCredit ? 0 : amount,
      credit: isCredit ? amount : 0,
      balance: running
    }
  })

  const openingBalance = lines.length
    ? Number(lines[0].balance) - Number(lines[0].debit) + Number(lines[0].credit)
    : Number(party.openingBalance ?? 0)
  const closingBalance = lines.length
    ? Number(lines[lines.length - 1].balance)
    : Number(party.openingBalance ?? party.balance ?? 0)

  const periodLabel =
    party.fromDate || party.toDate
      ? `${party.fromDate ? dayjs(party.fromDate).format('DD MMM YYYY') : '…'} – ${
          party.toDate ? dayjs(party.toDate).format('DD MMM YYYY') : '…'
        }`
      : 'All dates'

  const companyHeader: PrintCompanyHeader =
    typeof company === 'string' ? { name: company } : company

  return {
    companyName: companyHeader.name || 'Company',
    companyPhone: companyHeader.phone?.trim() || '—',
    companyAddress: companyHeader.address?.trim() || '—',
    title: party.partyType === 'supplier' ? 'Supplier Ledger' : 'Customer Ledger',
    partyLabel: party.partyType === 'supplier' ? 'Supplier' : 'Customer',
    partyName: party.partyName || '—',
    partyPhone: party.partyPhone || '—',
    partyAddress: party.partyAddress || '—',
    printedAt: dayjs().format('DD MMM YYYY, hh:mm A'),
    periodLabel,
    openingBalance: Math.round(openingBalance),
    closingBalance: Math.round(closingBalance),
    lines
  }
}

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

function formatDetails(entry: LedgerEntryRow): string {
  const parts: string[] = []
  if (entry.referenceType) parts.push(String(entry.referenceType).replace(/_/g, ' '))
  if (entry.referenceId) parts.push(String(entry.referenceId).slice(0, 8))
  return parts.join(' · ') || '—'
}

export function mapLedgerToStatement(
  party: LedgerPartyData,
  companyName: string
): LedgerStatementData {
  const lines: LedgerStatementLine[] = (party.ledger || []).map((entry) => {
    const meta = TYPE_META[entry.type] || {
      code: 'JE',
      label: entry.type,
      side: 'debit' as const
    }
    const amount = Number(entry.amount || 0)
    const isCredit =
      entry.type === 'payment_credit' || entry.type === 'supplier_payment_credit' || meta.side === 'credit'
    return {
      date: entry.createdAt ? dayjs(entry.createdAt).format('DD MMM YYYY') : '—',
      typeCode: meta.code,
      typeLabel: meta.label,
      details: formatDetails(entry),
      debit: isCredit ? 0 : amount,
      credit: isCredit ? amount : 0,
      balance: Number(entry.runningBalance ?? 0)
    }
  })

  const openingBalance = lines.length
    ? Number(lines[0].balance) - Number(lines[0].debit) + Number(lines[0].credit)
    : 0
  const closingBalance = lines.length
    ? Number(lines[lines.length - 1].balance)
    : Number(party.balance || 0)

  const periodLabel =
    party.fromDate || party.toDate
      ? `${party.fromDate ? dayjs(party.fromDate).format('DD MMM YYYY') : '…'} – ${
          party.toDate ? dayjs(party.toDate).format('DD MMM YYYY') : '…'
        }`
      : 'All dates'

  return {
    companyName,
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

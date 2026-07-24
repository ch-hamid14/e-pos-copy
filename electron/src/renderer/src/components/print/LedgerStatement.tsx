import { formatInvoiceAmount } from '@/renderer/utils/invoiceFormat'
import type { LedgerStatementData } from './ledgerStatementTypes'

function fmt(n: number): string {
  if (!n) return '—'
  return formatInvoiceAmount(n)
}

export function LedgerStatement({ data }: { data: LedgerStatementData }) {
  return (
    <div className="ledger-page">
      <header className="ledger-header">
        <div>
          <div className="ledger-brand">{data.companyName}</div>
          <div className="ledger-meta">Printed {data.printedAt}</div>
        </div>
        <div>
          <div className="ledger-title">{data.title}</div>
          <div className="ledger-meta">Period: {data.periodLabel}</div>
        </div>
      </header>

      <section className="ledger-party">
        <div className="ledger-party-row">
          <span className="ledger-label">{data.partyLabel}</span>
          <span>{data.partyName}</span>
        </div>
        <div className="ledger-party-row">
          <span className="ledger-label">Phone</span>
          <span>{data.partyPhone}</span>
        </div>
        <div className="ledger-party-row" style={{ gridColumn: '1 / -1' }}>
          <span className="ledger-label">Address</span>
          <span>{data.partyAddress}</span>
        </div>
      </section>

      <table className="ledger-table">
        <thead>
          <tr>
            <th className="col-date">Post Date</th>
            <th className="col-type">Type</th>
            <th>Details</th>
            <th className="col-amt">Debit</th>
            <th className="col-amt">Credit</th>
            <th className="col-amt">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={3}>
              <strong>Opening balance</strong>
            </td>
            <td className="col-amt">—</td>
            <td className="col-amt">—</td>
            <td className="col-amt">
              <strong>{formatInvoiceAmount(data.openingBalance)}</strong>
            </td>
          </tr>
          {data.lines.map((line, index) => (
            <tr key={`${line.date}-${line.typeCode}-${index}`}>
              <td className="col-date">{line.date}</td>
              <td className="col-type" title={line.typeLabel}>
                {line.typeCode}
              </td>
              <td>
                <div>{line.typeLabel}</div>
                <div style={{ color: '#6b7280' }}>{line.details}</div>
              </td>
              <td className="col-amt">{fmt(line.debit)}</td>
              <td className="col-amt">{fmt(line.credit)}</td>
              <td className="col-amt">{formatInvoiceAmount(line.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ledger-summary">
        <span>Closing balance: {formatInvoiceAmount(data.closingBalance)}</span>
      </div>

      <footer className="ledger-footer">
        <span>MadixSoft E-POS</span>
        <span>
          Positive balance = {data.partyLabel === 'Supplier' ? 'amount we owe' : 'amount owed to us'}
        </span>
      </footer>
    </div>
  )
}

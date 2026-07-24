import { formatInvoiceAmount } from '@/renderer/utils/invoiceFormat'
import type { LedgerStatementData } from './ledgerStatementTypes'
import { VOLT_LOGO_DATA_URI } from './voltLogoDataUri'

function fmt(n: number): string {
  if (!n) return '—'
  return formatInvoiceAmount(n)
}

export function LedgerStatement({ data }: { data: LedgerStatementData }) {
  const dueLabel = data.partyLabel === 'Supplier' ? 'Payable' : 'Receivable'

  return (
    <div className="ledger-page">
      <header className="ledger-header">
        <div className="ledger-header-main">
          <div className="ledger-company-name">{data.companyName}</div>
          <div className="ledger-company-address">{data.companyAddress}</div>
        </div>
        <div className="ledger-header-side">
          <div className="ledger-contact-label">Contact</div>
          <div className="ledger-contact-value">{data.companyPhone}</div>
        </div>
      </header>

      <div className="ledger-title-block">
        <div className="ledger-title">{data.title}</div>
        <div className="ledger-meta">
          <span>{data.partyName}</span>
          <span className="ledger-meta-sep">·</span>
          <span>Printed {data.printedAt}</span>
          <span className="ledger-meta-sep">·</span>
          <span>{data.periodLabel}</span>
        </div>
        {(data.partyPhone !== '—' || data.partyAddress !== '—') && (
          <div className="ledger-party-line">
            {data.partyPhone !== '—' && <span>Phone {data.partyPhone}</span>}
            {data.partyPhone !== '—' && data.partyAddress !== '—' && (
              <span className="ledger-meta-sep">·</span>
            )}
            {data.partyAddress !== '—' && <span>{data.partyAddress}</span>}
          </div>
        )}
      </div>

      <section className="ledger-summary-strip">
        <div className="ledger-summary-item">
          <div className="ledger-summary-label">Opening</div>
          <div className="ledger-summary-value">{formatInvoiceAmount(data.openingBalance)}</div>
        </div>
        <div className="ledger-summary-item">
          <div className="ledger-summary-label">Closing</div>
          <div className="ledger-summary-value">{formatInvoiceAmount(data.closingBalance)}</div>
        </div>
        <div className="ledger-summary-item ledger-summary-item--accent">
          <div className="ledger-summary-label">{dueLabel}</div>
          <div className="ledger-summary-value">{formatInvoiceAmount(data.closingBalance)}</div>
        </div>
      </section>

      <table className="ledger-table">
        <thead>
          <tr>
            <th className="col-date">Post Date</th>
            <th className="col-type">Type</th>
            <th>Reference</th>
            <th className="col-amt">Debit</th>
            <th className="col-amt">Credit</th>
            <th className="col-amt">Balance</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line, index) => (
            <tr key={`${line.date}-${line.typeCode}-${index}`}>
              <td className="col-date">{line.date}</td>
              <td className="col-type" title={line.typeLabel}>
                <span className="ledger-type-chip">{line.typeCode}</span>
              </td>
              <td className="col-ref">{line.details}</td>
              <td className="col-amt">{fmt(line.debit)}</td>
              <td className="col-amt">{fmt(line.credit)}</td>
              <td className="col-amt col-balance">{formatInvoiceAmount(line.balance)}</td>
            </tr>
          ))}
          {data.lines.length === 0 && (
            <tr>
              <td colSpan={6} className="ledger-empty">
                No ledger entries in this period
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <footer className="ledger-footer">
        <img className="ledger-footer-logo" src={VOLT_LOGO_DATA_URI} alt="VOLT POS" />
        <span className="ledger-footer-powered">
          Powered by <strong>MadixSoft</strong>
        </span>
      </footer>
    </div>
  )
}

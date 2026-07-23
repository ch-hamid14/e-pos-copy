import dayjs from 'dayjs'
import { amountInWords } from '@/renderer/utils/amountInWords'
import { formatInvoiceAmount } from '@/renderer/utils/invoiceFormat'
import type { SaleInvoiceLine } from './SaleInvoice'

export type ThermalReceiptData = {
  billNo: string | number
  saleDate: string
  customerName?: string
  customerPhone?: string
  customerCnic?: string
  customerAddress?: string
  lines: SaleInvoiceLine[]
  subtotal: number
  totalTax: number
  totalWht: number
  netTotal: number
  paidAmount: number
  dueAmount: number
  companyName: string
}

function fmt(value: number) {
  return formatInvoiceAmount(value)
}

function Divider({ heavy }: { heavy?: boolean }) {
  return <div className={`thermal-divider ${heavy ? 'thermal-divider--heavy' : ''}`} />
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`thermal-row ${bold ? 'thermal-row--bold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

export function mapSaleDetailToThermalReceipt(detail: any, companyName: string): ThermalReceiptData | null {
  if (!detail?.sale) return null
  const sale = detail.sale

  return {
    billNo: sale.billNo ?? '—',
    saleDate: sale.saleDate,
    customerName: sale.customer?.name,
    customerPhone: sale.customer?.phone,
    customerCnic: sale.customer?.cnic,
    customerAddress: sale.customer?.address,
    lines: (detail.lines || []).map((line: any) => {
      const quantity = Math.max(1, Number(line.quantity || 1))
      const unitPrice = Number(line.salePrice ?? 0)
      return {
        lineType: line.lineType === 'part' ? 'part' : 'product',
        serialNumber: line.serialNumber,
        motorNumber: line.motorNumber,
        productName: line.productName,
        categoryName: line.categoryName,
        productDescription: line.productDescription,
        colorName: line.colorName,
        quantity,
        salePrice: unitPrice * quantity,
        taxPercent: Number(line.taxPercent ?? 0),
        taxAmount: Number(line.taxAmount ?? 0),
        whtAmount: Number(line.whtAmount ?? 0),
        lineTotal: Number(line.lineTotal ?? 0)
      }
    }),
    subtotal: Number(sale.subtotal ?? 0),
    totalTax: Number(sale.totalTax ?? 0),
    totalWht: Number(sale.totalWht ?? 0),
    netTotal: Number(sale.netTotal ?? 0),
    paidAmount: Number(sale.paidAmount ?? 0),
    dueAmount: Number(sale.dueAmount ?? 0),
    companyName
  }
}

export function ThermalReceipt({ data }: { data: ThermalReceiptData }) {
  const dated = dayjs(data.saleDate).format('DD MMM YYYY')
  const printedAt = dayjs().format('DD MMM YYYY, hh:mm A')

  return (
    <div className="thermal-receipt">
      <div className="thermal-receipt__accent" />

      <header className="thermal-header">
        <div className="thermal-header__brand">{data.companyName}</div>
        <div className="thermal-header__badge">SALE RECEIPT</div>
      </header>

      <Divider heavy />

      <section className="thermal-meta">
        <Row label="Bill No." value={`#${data.billNo}`} bold />
        <Row label="Date" value={dated} />
        {data.customerName && <Row label="Customer" value={data.customerName} bold />}
        {data.customerPhone && <Row label="Phone" value={data.customerPhone} />}
        {data.customerCnic && <Row label="CNIC" value={data.customerCnic} />}
        {data.customerAddress && (
          <div className="thermal-meta__address">{data.customerAddress}</div>
        )}
      </section>

      <Divider />

      <section className="thermal-items">
        <div className="thermal-items__title">ITEMS</div>
        {data.lines.map((line, index) => {
          const title = [line.categoryName, line.productName].filter(Boolean).join(' · ')
          return (
            <article key={`${line.serialNumber || line.productName}-${index}`} className="thermal-item">
              <div className="thermal-item__head">
                <span className="thermal-item__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="thermal-item__name">{title || 'Item'}</span>
                <span className="thermal-item__total">{fmt(line.lineTotal)}</span>
              </div>
              {line.lineType === 'part' && (
                <div className="thermal-item__detail">
                  <span>Qty</span>
                  <span>{Math.max(1, Number(line.quantity || 1))}</span>
                </div>
              )}
              {line.serialNumber && (
                <div className="thermal-item__detail">
                  <span>Chassis</span>
                  <span>{line.serialNumber}</span>
                </div>
              )}
              {line.motorNumber && (
                <div className="thermal-item__detail">
                  <span>Motor</span>
                  <span>{line.motorNumber}</span>
                </div>
              )}
              {line.colorName && (
                <div className="thermal-item__detail">
                  <span>Colour</span>
                  <span>{line.colorName}</span>
                </div>
              )}
              <div className="thermal-item__breakdown">
                <span>Ex. S.T.</span>
                <span>{fmt(line.salePrice)}</span>
              </div>
              {line.taxAmount > 0 && (
                <div className="thermal-item__breakdown">
                  <span>Tax @ {line.taxPercent}%</span>
                  <span>{fmt(line.taxAmount)}</span>
                </div>
              )}
              {line.whtAmount > 0 && (
                <div className="thermal-item__breakdown">
                  <span>Tax u/s 236 G/H</span>
                  <span>{fmt(line.whtAmount)}</span>
                </div>
              )}
            </article>
          )
        })}
      </section>

      <Divider heavy />

      <section className="thermal-summary">
        <Row label="Subtotal" value={fmt(data.subtotal)} />
        {data.totalTax > 0 && <Row label="Sales Tax" value={fmt(data.totalTax)} />}
        {data.totalWht > 0 && <Row label="Tax u/s 236 G/H" value={fmt(data.totalWht)} />}
      </section>

      <div className="thermal-grand-total">
        <span>NET TOTAL</span>
        <span>Rs {fmt(data.netTotal)}</span>
      </div>

      {(data.paidAmount > 0 || data.dueAmount > 0) && (
        <section className="thermal-payments">
          {data.paidAmount > 0 && <Row label="Paid" value={`Rs ${fmt(data.paidAmount)}`} bold />}
          {data.dueAmount > 0 && (
            <div className="thermal-due">
              <span>Balance Due</span>
              <span>Rs {fmt(data.dueAmount)}</span>
            </div>
          )}
        </section>
      )}

      <Divider />

      <section className="thermal-words">
        <div className="thermal-words__label">Amount in words</div>
        <div className="thermal-words__value">{amountInWords(data.netTotal)}</div>
      </section>

      <footer className="thermal-footer">
        <Divider />
        <p className="thermal-footer__thanks">Thank you for your business!</p>
        <p className="thermal-footer__printed">Printed {printedAt}</p>
        <div className="thermal-footer__brand">
          <span className="thermal-footer__brand-label">Powered by</span>
          <span className="thermal-footer__brand-name">MadixSoft</span>
        </div>
        <div className="thermal-footer__bar" aria-hidden="true" />
      </footer>
    </div>
  )
}

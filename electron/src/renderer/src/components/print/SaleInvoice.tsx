import dayjs from 'dayjs'
import { amountInWords } from '@/renderer/utils/amountInWords'
import { formatInvoiceAmount, formatInvoicePrice, roundInvoiceAmount } from '@/renderer/utils/invoiceFormat'

export type SaleInvoiceLine = {
  lineType?: 'product' | 'part'
  serialNumber?: string
  motorNumber?: string
  productName?: string
  categoryName?: string
  productDescription?: string
  colorName?: string
  quantity?: number
  salePrice: number
  taxPercent: number
  taxAmount: number
  whtAmount: number
  lineTotal: number
}

export type SaleInvoiceData = {
  billNo: string | number
  saleDate: string
  customerName?: string
  customerAddress?: string
  customerCnic?: string
  customerPhone?: string
  motorNumber?: string
  chassisNumber?: string
  model?: string
  colour?: string
  notes?: string
  lines: SaleInvoiceLine[]
  netTotal: number
  companyName: string
}

type FieldRowProps = {
  label: string
  value?: string
  className?: string
}

function FieldRow({ label, value, className }: FieldRowProps) {
  return (
    <div className={`sale-invoice-field-row ${className || ''}`}>
      <span className="sale-invoice-label" style={{ fontWeight: 700 }}>
        {label}
      </span>
      <span
        className="sale-invoice-value"
        style={{ fontWeight: 700, textAlign: 'center' }}
      >
        {value || ''}
      </span>
    </div>
  )
}

function joinUnique(values: (string | undefined)[]) {
  return [...new Set(values.filter(Boolean))].join(', ')
}

export function mapSaleDetailToInvoice(detail: any, companyName: string): SaleInvoiceData | null {
  if (!detail?.sale) return null
  const sale = detail.sale
  const lines: SaleInvoiceLine[] = (detail.lines || []).map((line: any) => {
    const quantity = Math.max(1, Number(line.quantity || 1))
    const unitPrice = Number(line.salePrice ?? 0)
    const extended = roundInvoiceAmount(unitPrice * quantity)
    const taxAmount = roundInvoiceAmount(line.taxAmount ?? 0)
    const whtAmount = roundInvoiceAmount(line.whtAmount ?? 0)

    return {
      lineType: line.lineType === 'part' ? 'part' : 'product',
      serialNumber: line.serialNumber || undefined,
      motorNumber: line.motorNumber,
      productName: line.productName,
      categoryName: line.categoryName,
      productDescription: line.productDescription,
      colorName: line.colorName,
      quantity,
      salePrice: extended,
      taxPercent: Number(line.taxPercent ?? 0),
      taxAmount,
      whtAmount,
      lineTotal: roundInvoiceAmount(extended + taxAmount + whtAmount)
    }
  })

  const netTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  const productLines = lines.filter((l) => l.lineType !== 'part')

  return {
    billNo: sale.billNo ?? '—',
    saleDate: sale.saleDate,
    customerName: sale.customer?.name,
    customerAddress: sale.customer?.address,
    customerCnic: sale.customer?.cnic,
    customerPhone: sale.customer?.phone,
    motorNumber: joinUnique(productLines.map((l) => l.motorNumber)),
    chassisNumber: joinUnique(productLines.map((l) => l.serialNumber)),
    model: joinUnique(productLines.map((l) => l.productName)),
    colour: joinUnique(productLines.map((l) => l.colorName)),
    notes: sale.notes || undefined,
    lines,
    netTotal,
    companyName
  }
}

export function SaleInvoice({ data }: { data: SaleInvoiceData }) {
  const totalQty = data.lines.reduce((sum, line) => sum + Math.max(1, Number(line.quantity || 1)), 0)
  const dated = dayjs(data.saleDate).format('DD-MMM-YYYY')

  return (
    <div className="sale-invoice-page" style={{ fontWeight: 700 }}>
      <div className="sale-invoice-letterhead-space" aria-hidden="true" />

      <div className="sale-invoice-sheet">
        <div className="sale-invoice-meta">
          <div className="sale-invoice-meta-row sale-invoice-meta-row--split">
            <FieldRow label="Bill No." value={String(data.billNo)} />
            <FieldRow label="Dated" value={dated} className="sale-invoice-field-row--right" />
          </div>
          <FieldRow label="Customer Name" value={data.customerName} />
          <FieldRow label="Address" value={data.customerAddress} />
          <div className="sale-invoice-meta-row sale-invoice-meta-row--split">
            <FieldRow label="CNIC No." value={data.customerCnic} />
            <FieldRow label="Contact No." value={data.customerPhone} className="sale-invoice-field-row--right" />
          </div>
          <div className="sale-invoice-meta-row sale-invoice-meta-row--split">
            <FieldRow label="Motor No." value={data.motorNumber} />
            <FieldRow label="Chassis No." value={data.chassisNumber} className="sale-invoice-field-row--right" />
          </div>
          <div className="sale-invoice-meta-row sale-invoice-meta-row--split">
            <FieldRow label="Model" value={data.model} />
            <FieldRow label="Colour" value={data.colour} className="sale-invoice-field-row--right" />
          </div>
          <FieldRow label="Notes" value={data.notes} />
        </div>

        <table className="sale-invoice-table">
          <thead>
            <tr>
              <th className="col-sr">Sr. No.</th>
              <th className="col-particulars">Particulars</th>
              <th className="col-qty">Quantity</th>
              <th className="col-amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, index) => {
              const title = [line.categoryName, line.productName].filter(Boolean).join(' ')
              const description = line.productDescription || line.categoryName || line.productName || ''
              const taxLabel =
                line.taxPercent % 1 === 0
                  ? `Sale Tax S.T @ ${line.taxPercent}%`
                  : `Sale Tax S.T @ ${line.taxPercent}%`
              const qty = Math.max(1, Number(line.quantity || 1))

              return (
                <tr key={`${line.serialNumber || line.productName}-${index}`}>
                  <td className="col-sr">{String(index + 1).padStart(2, '0')}</td>
                  <td className="col-particulars">
                    <div className="sale-invoice-particulars">
                      <div className="sale-invoice-particulars-title">{title}</div>
                      <div className="sale-invoice-particulars-breakdown">
                        <div className="sale-invoice-breakdown-row">
                          <span>Ex. S.T. Price</span>
                          <span>{formatInvoicePrice(line.salePrice)}</span>
                        </div>
                        <div className="sale-invoice-breakdown-row">
                          <span>{taxLabel}</span>
                          <span>{formatInvoicePrice(line.taxAmount)}</span>
                        </div>
                        <div className="sale-invoice-breakdown-row">
                          <span>Tax u/s 236 G/H</span>
                          <span>{formatInvoicePrice(line.whtAmount)}</span>
                        </div>
                      </div>
                      <div className="sale-invoice-particulars-desc">{description}</div>
                    </div>
                  </td>
                  <td className="col-qty">{String(qty).padStart(2, '0')}</td>
                  <td className="col-amount">{formatInvoiceAmount(line.lineTotal)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="sale-invoice-total-label">
                Total
              </td>
              <td className="col-qty">{String(totalQty).padStart(2, '0')}</td>
              <td className="col-amount sale-invoice-total-amount">
                {formatInvoiceAmount(data.netTotal)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="sale-invoice-amount-words">
          <span className="sale-invoice-label" style={{ fontWeight: 700 }}>
            Amount in Word
          </span>
          <span
            className="sale-invoice-amount-words-value"
            style={{ fontWeight: 700, textAlign: 'center' }}
          >
            {amountInWords(data.netTotal)}
          </span>
        </div>

        <div className="sale-invoice-signatures">
          <div className="sale-invoice-signature-block">
            <div className="sale-invoice-signature-line" />
            <span>Customer Signature</span>
          </div>
          <div className="sale-invoice-signature-block sale-invoice-signature-block--right">
            <div className="sale-invoice-signature-line" />
            <span>{data.companyName}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

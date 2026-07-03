import { createPortal } from 'react-dom'
import { SaleInvoice, mapSaleDetailToInvoice } from './SaleInvoice'

type SaleInvoicePrintProps = {
  detail: any
  companyName: string
}

export function SaleInvoicePrint({ detail, companyName }: SaleInvoicePrintProps) {
  const data = mapSaleDetailToInvoice(detail, companyName)
  if (!data) return null

  return createPortal(
    <div className="sale-invoice-print-root">
      <SaleInvoice data={data} />
    </div>,
    document.body
  )
}

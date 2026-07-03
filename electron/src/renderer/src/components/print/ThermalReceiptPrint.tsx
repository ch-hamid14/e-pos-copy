import { createPortal } from 'react-dom'
import { ThermalReceipt, mapSaleDetailToThermalReceipt } from './ThermalReceipt'

type ThermalReceiptPrintProps = {
  detail: any
  companyName: string
}

export function ThermalReceiptPrint({ detail, companyName }: ThermalReceiptPrintProps) {
  const data = mapSaleDetailToThermalReceipt(detail, companyName)
  if (!data) return null

  return createPortal(
    <div className="thermal-receipt-print-root">
      <ThermalReceipt data={data} />
    </div>,
    document.body
  )
}

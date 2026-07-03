import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThermalReceipt, mapSaleDetailToThermalReceipt } from './ThermalReceipt'
import { THERMAL_RECEIPT_PRINT_CSS } from './thermalReceiptPrintStyles'

export function buildThermalReceiptHtml(detail: any, companyName: string): string | null {
  const data = mapSaleDetailToThermalReceipt(detail, companyName)
  if (!data) return null

  const markup = renderToStaticMarkup(createElement(ThermalReceipt, { data }))
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>${THERMAL_RECEIPT_PRINT_CSS}</style>
  </head>
  <body>${markup}</body>
</html>`
}

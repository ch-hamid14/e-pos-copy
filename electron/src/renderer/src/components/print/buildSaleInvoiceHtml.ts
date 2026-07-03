import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SaleInvoice, mapSaleDetailToInvoice } from './SaleInvoice'
import { SALE_INVOICE_PRINT_CSS } from './saleInvoicePrintStyles'

export function buildSaleInvoiceHtml(detail: any, companyName: string): string | null {
  const data = mapSaleDetailToInvoice(detail, companyName)
  if (!data) return null

  const markup = renderToStaticMarkup(createElement(SaleInvoice, { data }))
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>${SALE_INVOICE_PRINT_CSS}</style>
  </head>
  <body>${markup}</body>
</html>`
}

import { useCallback, useState } from 'react'
import dayjs from 'dayjs'
import { saleAPI, printAPI } from '@/renderer/services'
import { buildSaleInvoiceHtml } from '@/renderer/components/print/buildSaleInvoiceHtml'
import { buildThermalReceiptHtml } from '@/renderer/components/print/buildThermalReceiptHtml'

function runPrint() {
  document.body.classList.remove('print-format-a4', 'print-format-thermal')
  document.body.classList.add('print-format-a4')

  const cleanup = () => {
    document.body.classList.remove('print-format-a4', 'print-format-thermal')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print()
    })
  })
}

function saleInvoiceFileName(detail: any): string {
  const billNo = detail?.sale?.billNo ?? detail?.sale?.id ?? 'invoice'
  const date = detail?.sale?.saleDate ? dayjs(detail.sale.saleDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
  return `sale-invoice-${billNo}-${date}.pdf`
}

function thermalReceiptFileName(detail: any): string {
  const billNo = detail?.sale?.billNo ?? detail?.sale?.id ?? 'receipt'
  const date = detail?.sale?.saleDate ? dayjs(detail.sale.saleDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
  return `thermal-receipt-${billNo}-${date}.pdf`
}

export function useSaleInvoicePrint(companyName: string) {
  const [printDetail, setPrintDetail] = useState<any>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadingThermal, setDownloadingThermal] = useState(false)

  const preparePrint = useCallback((detail: any) => {
    if (detail?.sale) setPrintDetail(detail)
  }, [])

  const clearPrint = useCallback(() => setPrintDetail(null), [])

  const handlePrintInvoice = useCallback(() => {
    if (!printDetail?.sale) return
    runPrint()
  }, [printDetail])

  const handleThermalPrint = useCallback(async () => {
    if (!printDetail?.sale) return { saved: false as const }
    const html = buildThermalReceiptHtml(printDetail, companyName)
    if (!html) throw new Error('Could not build thermal receipt')

    setDownloadingThermal(true)
    try {
      return await printAPI.downloadThermalReceipt(thermalReceiptFileName(printDetail), html)
    } finally {
      setDownloadingThermal(false)
    }
  }, [printDetail, companyName])

  const handleDownloadInvoice = useCallback(async () => {
    if (!printDetail?.sale) return { saved: false as const }
    const html = buildSaleInvoiceHtml(printDetail, companyName)
    if (!html) throw new Error('Could not build invoice')

    setDownloading(true)
    try {
      return await printAPI.downloadSaleInvoice(saleInvoiceFileName(printDetail), html)
    } finally {
      setDownloading(false)
    }
  }, [printDetail, companyName])

  const printSaleById = useCallback(async (saleId: string) => {
    const detail = await saleAPI.get(saleId)
    if (!detail?.sale) return
    setPrintDetail(detail)
    const html = buildThermalReceiptHtml(detail, companyName)
    if (!html) return
    return printAPI.downloadThermalReceipt(thermalReceiptFileName(detail), html)
  }, [companyName])

  return {
    printDetail,
    preparePrint,
    clearPrint,
    handlePrintInvoice,
    handleThermalPrint,
    handleDownloadInvoice,
    printSaleById,
    downloading,
    downloadingThermal,
    hasPrintDetail: Boolean(printDetail?.sale)
  }
}

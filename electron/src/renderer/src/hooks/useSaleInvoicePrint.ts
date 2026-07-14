import { useCallback, useState } from 'react'
import dayjs from 'dayjs'
import { saleAPI, printAPI } from '@/renderer/services'
import { buildSaleInvoiceHtml } from '@/renderer/components/print/buildSaleInvoiceHtml'

type PrintFormat = 'a4' | 'thermal'

function runPrint(format: PrintFormat) {
  document.body.classList.remove('print-format-a4', 'print-format-thermal')
  document.body.classList.add(format === 'thermal' ? 'print-format-thermal' : 'print-format-a4')

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

export function useSaleInvoicePrint(companyName: string) {
  const [printDetail, setPrintDetail] = useState<any>(null)
  const [downloading, setDownloading] = useState(false)

  const preparePrint = useCallback((detail: any) => {
    if (detail?.sale) setPrintDetail(detail)
  }, [])

  const clearPrint = useCallback(() => setPrintDetail(null), [])

  const handlePrintInvoice = useCallback(() => {
    if (!printDetail?.sale) return
    runPrint('a4')
  }, [printDetail])

  const handleThermalPrint = useCallback(() => {
    if (!printDetail?.sale) return
    runPrint('thermal')
  }, [printDetail])

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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        runPrint('thermal')
      })
    })
  }, [])

  return {
    printDetail,
    preparePrint,
    clearPrint,
    handlePrintInvoice,
    handleThermalPrint,
    handleDownloadInvoice,
    printSaleById,
    downloading,
    downloadingThermal: false,
    hasPrintDetail: Boolean(printDetail?.sale)
  }
}

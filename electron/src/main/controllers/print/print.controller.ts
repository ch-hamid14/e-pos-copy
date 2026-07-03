import { app, BrowserWindow } from 'electron'
import { access, writeFile } from 'fs/promises'
import { join } from 'path'
import { IRequest } from '../../../common'

type PdfFormat = 'a4' | 'thermal'

async function renderPdf(html: string, format: PdfFormat): Promise<Buffer> {
  const printWin = new BrowserWindow({
    show: false,
    width: format === 'thermal' ? 320 : 794,
    height: format === 'thermal' ? 1600 : 1123,
    webPreferences: {
      sandbox: true
    }
  })

  try {
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await printWin.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: format === 'thermal',
      pageSize: format === 'thermal' ? undefined : 'A4',
      margins: { marginType: 'none' }
    })
  } finally {
    printWin.destroy()
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveDownloadPath(fileName: string): Promise<string> {
  const downloadsDir = app.getPath('downloads')
  const safeName = fileName.replace(/[<>:"/\\|?*]/g, '-').trim() || 'receipt.pdf'
  const baseName = safeName.replace(/\.pdf$/i, '')
  let candidate = join(downloadsDir, safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`)
  let counter = 1

  while (await fileExists(candidate)) {
    candidate = join(downloadsDir, `${baseName} (${counter}).pdf`)
    counter += 1
  }

  return candidate
}

async function savePdf(html: string, fileName: string, format: PdfFormat) {
  if (!html?.trim()) throw new Error('Receipt HTML is required')
  const pdf = await renderPdf(html, format)
  const filePath = await resolveDownloadPath(fileName)
  await writeFile(filePath, pdf)
  return { saved: true, filePath }
}

class PrintController {
  async downloadSaleInvoice(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    const fileName = (req.body?.fileName as string) || 'sale-invoice.pdf'
    const html = req.body?.html as string
    return savePdf(html, fileName, 'a4')
  }

  async downloadThermalReceipt(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    const fileName = (req.body?.fileName as string) || 'thermal-receipt.pdf'
    const html = req.body?.html as string
    return savePdf(html, fileName, 'thermal')
  }
}

export const printController = new PrintController()

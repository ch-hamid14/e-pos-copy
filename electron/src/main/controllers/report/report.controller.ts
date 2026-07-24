import { IRequest } from '../../../common'
import { reportService } from '../../services'

class ReportController {
  async sales(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return reportService.salesReport(req.query?.companyId as string, req.query?.branchId as string, {
      from: req.query?.from as string,
      to: req.query?.to as string,
      customerId: req.query?.customerId as string,
      search: req.query?.search as string,
      sortField: req.query?.sortField as string,
      sortOrder: req.query?.sortOrder as string
    })
  }

  async purchases(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return reportService.purchaseReport(req.query?.companyId as string, req.query?.branchId as string, {
      from: req.query?.from as string,
      to: req.query?.to as string,
      supplierId: req.query?.supplierId as string,
      search: req.query?.search as string,
      sortField: req.query?.sortField as string,
      sortOrder: req.query?.sortOrder as string
    })
  }

  async customers(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return reportService.customersReport(req.query?.companyId as string, {
      from: req.query?.from as string,
      to: req.query?.to as string,
      search: req.query?.search as string,
      sortField: req.query?.sortField as string,
      sortOrder: req.query?.sortOrder as string
    })
  }

  async customerDetail(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return reportService.customerDetail(
      req.query?.companyId as string,
      req.params?.id as string
    )
  }

  async suppliers(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return reportService.suppliersReport(req.query?.companyId as string, {
      from: req.query?.from as string,
      to: req.query?.to as string,
      search: req.query?.search as string,
      sortField: req.query?.sortField as string,
      sortOrder: req.query?.sortOrder as string
    })
  }

  async supplierDetail(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return reportService.supplierDetail(
      req.query?.companyId as string,
      req.params?.id as string
    )
  }
}

export const reportController = new ReportController()

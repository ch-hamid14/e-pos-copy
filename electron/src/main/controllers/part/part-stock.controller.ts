import { IRequest } from '../../../common'
import { partStockService } from '../../services'

class PartStockController {
  async list(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return partStockService.list(
      req.query?.companyId as string,
      req.query?.branchId as string,
      {
        search: req.query?.search as string,
        partId: req.query?.partId as string,
        categoryId: req.query?.categoryId as string,
        supplierId: req.query?.supplierId as string,
        fromDate: req.query?.fromDate as string,
        toDate: req.query?.toDate as string,
        page: req.query?.page as number | undefined,
        pageSize: req.query?.pageSize as number | undefined
      }
    )
  }

  async detail(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return partStockService.detail(
      req.query?.companyId as string,
      req.query?.branchId as string,
      req.params?.id as string
    )
  }

  async fifoPreview(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return partStockService.fifoPreview(
      req.query?.companyId as string,
      req.query?.branchId as string,
      req.query?.partId as string,
      Number(req.query?.quantity || 1)
    )
  }
}

export const partStockController = new PartStockController()

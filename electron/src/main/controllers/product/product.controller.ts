import { IRequest } from '../../../common'
import { productService } from '../../services'
import { auditFromRequest } from '../shared/audit'

class ProductController {
  async list(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return productService.list(
      req.query?.companyId as string,
      req.query?.search as string,
      req.query?.categoryId as string
    )
  }

  async create(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return productService.create(
      req.body?.companyId as string,
      auditFromRequest(req),
      req.body?.data as any
    )
  }

  async update(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return productService.update(
      req.params?.id as string,
      req.body?.companyId as string,
      auditFromRequest(req),
      req.body?.data as any
    )
  }

  async remove(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    await productService.remove(
      req.params?.id as string,
      req.body?.companyId as string,
      auditFromRequest(req)
    )
    return { success: true }
  }
}

export const productController = new ProductController()

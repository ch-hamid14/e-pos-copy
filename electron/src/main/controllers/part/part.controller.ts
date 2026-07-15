import { IRequest } from '../../../common'
import { partService } from '../../services'
import { auditFromRequest } from '../shared/audit'

class PartController {
  async list(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return partService.list(
      req.query?.companyId as string,
      req.query?.search as string,
      req.query?.categoryId as string
    )
  }

  async create(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return partService.create(
      req.body?.companyId as string,
      auditFromRequest(req),
      req.body?.data as any
    )
  }

  async update(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return partService.update(
      req.params?.id as string,
      req.body?.companyId as string,
      auditFromRequest(req),
      req.body?.data as any
    )
  }

  async remove(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    await partService.remove(
      req.params?.id as string,
      req.body?.companyId as string,
      auditFromRequest(req)
    )
    return { success: true }
  }
}

export const partController = new PartController()

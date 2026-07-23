import { IRequest } from '../../../common'
import { taxService } from '../../services/setup/tax.service'
import { auditFromRequest } from '../shared/audit'

export const taxController = {
  async list(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return taxService.list(req.query?.companyId as string, req.query?.search as string)
  },

  async create(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return taxService.create(
      req.body?.companyId as string,
      auditFromRequest(req),
      (req.body?.data || {}) as {
        name: string
        defaultPercent?: number
        inclusiveDefault?: boolean
      }
    )
  },

  async update(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return taxService.update(
      req.params?.id as string,
      req.body?.companyId as string,
      auditFromRequest(req),
      req.body as {
        name?: string
        defaultPercent?: number
        inclusiveDefault?: boolean
      }
    )
  },

  async remove(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    await taxService.remove(
      req.params?.id as string,
      req.body?.companyId as string,
      auditFromRequest(req)
    )
    return { success: true }
  }
}

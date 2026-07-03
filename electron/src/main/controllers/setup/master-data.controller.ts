import { IRequest } from '../../../common'
import type { AuditContext } from '../../services/shared/audit.helpers'
import { auditFromRequest } from '../shared/audit'

type MasterService = {
  list: (companyId: string, search?: string) => Promise<unknown>
  create: (
    companyId: string,
    ctx: AuditContext,
    data: { name: string; phone?: string; address?: string }
  ) => Promise<unknown>
  update: (
    id: string,
    companyId: string,
    ctx: AuditContext,
    data: { name?: string; phone?: string; address?: string }
  ) => Promise<unknown>
  remove: (id: string, companyId: string, ctx: AuditContext) => Promise<void>
}

export function createMasterDataController(service: MasterService) {
  return {
    async list(_: Electron.IpcMainInvokeEvent, req: IRequest) {
      return service.list(req.query?.companyId as string, req.query?.search as string)
    },
    async create(_: Electron.IpcMainInvokeEvent, req: IRequest) {
      return service.create(
        req.body?.companyId as string,
        auditFromRequest(req),
        req.body?.data as { name: string; phone?: string; address?: string }
      )
    },
    async update(_: Electron.IpcMainInvokeEvent, req: IRequest) {
      return service.update(
        req.params?.id as string,
        req.body?.companyId as string,
        auditFromRequest(req),
        req.body as { name?: string; phone?: string; address?: string }
      )
    },
    async remove(_: Electron.IpcMainInvokeEvent, req: IRequest) {
      await service.remove(
        req.params?.id as string,
        req.body?.companyId as string,
        auditFromRequest(req)
      )
      return { success: true }
    }
  }
}

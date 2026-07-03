import { IRequest } from '../../../common'
import { branchService } from '../../services'

class BranchController {
  async list(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return branchService.list(req.query?.companyId as string)
  }
}

export const branchController = new BranchController()

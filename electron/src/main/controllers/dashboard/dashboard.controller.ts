import { IRequest } from '../../../common'
import { dashboardService } from '../../services'

class DashboardController {
  async metrics(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    return dashboardService.getMetrics(
      req.query?.companyId as string,
      req.query?.branchId as string
    )
  }
}

export const dashboardController = new DashboardController()

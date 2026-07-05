import { IRequest } from '../../../common'
import { dashboardService } from '../../services'

class DashboardController {
  async metrics(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    const q = req.query || {}
    return dashboardService.getAnalytics(
      q.companyId as string,
      q.branchId as string,
      q.from as string,
      q.to as string
    )
  }
}

export const dashboardController = new DashboardController()

import { IRequest } from '../../../common'
import { syncService } from '../../services/sync'

class SyncController {
  async status(_: Electron.IpcMainInvokeEvent, _req: IRequest) {
    return syncService.getStatus()
  }

  async syncNow(_: Electron.IpcMainInvokeEvent, _req: IRequest) {
    return syncService.syncNow()
  }
}

export const syncController = new SyncController()

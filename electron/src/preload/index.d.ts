import { electronAPI } from '@electron-toolkit/preload'
import { Channels, IRequest, IServerResponse } from '../common'

declare global {
  interface Window {
    electron: typeof electronAPI
    api: {
      invoke: <T = unknown>(channel: string, data?: IRequest) => Promise<IServerResponse<T>>
    }
    Channels: typeof Channels
  }
}

export {}

/// <reference types="vite/client" />
import { Channels, IRequest, IServerResponse } from '@/common'

declare global {
  interface Window {
    api: {
      invoke: <T = unknown>(channel: string, data?: IRequest) => Promise<IServerResponse<T>>
    }
    Channels: typeof Channels
  }
}

export {}

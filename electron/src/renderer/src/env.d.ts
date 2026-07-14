/// <reference types="vite/client" />
import { Channels, IRequest, IServerResponse } from '@/common'

type ConnectivityEvent =
  | { status: 'reconnected' }
  | { status: 'reauth_required'; deadline: number; reason: string }
  | { status: 'session_ended'; reason: string }
  | { status: 'offline' }

declare global {
  interface Window {
    api: {
      invoke: <T = unknown>(channel: string, data?: IRequest) => Promise<IServerResponse<T>>
      onConnectivity: (callback: (event: ConnectivityEvent) => void) => () => void
    }
    Channels: typeof Channels
  }
}

export {}

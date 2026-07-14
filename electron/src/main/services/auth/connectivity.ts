import { BrowserWindow } from 'electron'
import { AUTH_CONNECTIVITY_EVENT } from '../../../common/constants/config'

export type ConnectivityEvent =
  | { status: 'reconnected' }
  | { status: 'reauth_required'; deadline: number; reason: string }
  | { status: 'session_ended'; reason: string }
  | { status: 'offline' }

export function broadcastConnectivity(event: ConnectivityEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(AUTH_CONNECTIVITY_EVENT, event)
  }
}

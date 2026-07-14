import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { AUTH_CONNECTIVITY_EVENT } from '../common/constants/config'
import { Channels, IRequest, IServerResponse } from '../common'

export type ConnectivityEvent =
  | { status: 'reconnected' }
  | { status: 'reauth_required'; deadline: number; reason: string }
  | { status: 'session_ended'; reason: string }
  | { status: 'offline' }

const api = {
  invoke: <T = unknown>(channel: string, data?: IRequest): Promise<IServerResponse<T>> =>
    ipcRenderer.invoke(channel, data || {}),
  onConnectivity: (callback: (event: ConnectivityEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ConnectivityEvent) => {
      callback(payload)
    }
    ipcRenderer.on(AUTH_CONNECTIVITY_EVENT, listener)
    return () => ipcRenderer.removeListener(AUTH_CONNECTIVITY_EVENT, listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('Channels', Channels)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
  // @ts-ignore
  window.Channels = Channels
}

export { api }

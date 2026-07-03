import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Channels, IRequest, IServerResponse } from '../common'

const api = {
  invoke: <T = unknown>(channel: string, data?: IRequest): Promise<IServerResponse<T>> =>
    ipcRenderer.invoke(channel, data || {})
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

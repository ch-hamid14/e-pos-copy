import { IRequest } from '../../common'

const catchIpcHandler = (
  fn: (event: Electron.IpcMainInvokeEvent, data: IRequest) => any
) => {
  return async (event: Electron.IpcMainInvokeEvent, data: IRequest) => {
    const result = { data: null as unknown, error: null as { message: string } | null }
    try {
      result.data = await fn(event, data)
    } catch (err: any) {
      console.error(err)
      result.error = { message: err.message || 'Unknown error' }
    }
    return result
  }
}

export { catchIpcHandler }

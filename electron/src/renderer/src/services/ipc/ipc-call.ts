import { IRequest, IServerResponse } from '@/common'

export async function ipcCall<T = any>(channel: string, data?: IRequest): Promise<T> {
  const res: IServerResponse<T> = await window.api.invoke(channel, data)
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

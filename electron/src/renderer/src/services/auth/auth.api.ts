import { Channels } from '@/common'
import { ipcCall } from '../ipc'

export const authAPI = {
  login: (email: string, password: string, otp?: string, otpPurpose?: string) =>
    ipcCall(`POST:${Channels.AUTH}`, { body: { email, password, otp, otpPurpose } }),
  continueSession: (email: string, token: string) =>
    ipcCall(`POST:${Channels.AUTH}:continue`, { body: { email, token } }),
  refreshSession: (email: string, token: string) =>
    ipcCall(`POST:${Channels.AUTH}:refresh`, { body: { email, token } }),
  checkOnline: () => ipcCall<{ online: boolean }>(`GET:${Channels.AUTH}:online`),
  sendOtp: (email: string, purpose: string) =>
    ipcCall(`POST:${Channels.AUTH}:otp`, { body: { email, purpose } }),
  logout: () => ipcCall(`POST:${Channels.AUTH}:logout`)
}

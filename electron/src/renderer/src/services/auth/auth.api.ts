import { Channels } from '@/common'
import { ipcCall } from '../ipc'

export const authAPI = {
  login: (
    email: string,
    password: string,
    otp?: string,
    otpPurpose?: string,
    confirmCompanySwitch?: boolean
  ) =>
    ipcCall(`POST:${Channels.AUTH}`, {
      body: { email, password, otp, otpPurpose, confirmCompanySwitch }
    }),
  continueSession: (email: string, token: string) =>
    ipcCall(`POST:${Channels.AUTH}:continue`, { body: { email, token } }),
  refreshSession: (email: string, token: string) =>
    ipcCall(`POST:${Channels.AUTH}:refresh`, { body: { email, token } }),
  checkOnline: () => ipcCall<{ online: boolean }>(`GET:${Channels.AUTH}:online`),
  ensureOnline: () =>
    ipcCall<{
      status: 'idle' | 'offline' | 'reconnected' | 'reauth_required' | 'session_ended'
      deadline?: number
      reason?: string
    }>(`POST:${Channels.AUTH}:ensure-online`),
  getReauthGrace: () =>
    ipcCall<{ grace: { deadline: number; reason: string } | null }>(
      `GET:${Channels.AUTH}:reauth-grace`
    ),
  sendOtp: (email: string, purpose: string) =>
    ipcCall(`POST:${Channels.AUTH}:otp`, { body: { email, purpose } }),
  logout: () => ipcCall(`POST:${Channels.AUTH}:logout`),
  factoryReset: (pin: string, confirm: string, token?: string | null) =>
    ipcCall<{ ok: true; releasedDevice: boolean }>(`POST:${Channels.AUTH}:factory-reset`, {
      body: { pin, confirm, token }
    })
}

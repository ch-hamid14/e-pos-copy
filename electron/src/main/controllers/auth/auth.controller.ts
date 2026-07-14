import { IRequest } from '../../../common'
import { appState } from '../../state/app-state'
import { authService, stopSync } from '../../services'

class AuthController {
  async login(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    const { email, password, otp, otpPurpose, confirmCompanySwitch } = req.body as {
      email: string
      password: string
      otp?: string
      otpPurpose?: string
      confirmCompanySwitch?: boolean
    }
    return authService.login(
      email,
      password,
      otp,
      otpPurpose as any,
      Boolean(confirmCompanySwitch)
    )
  }

  async continueSession(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    const { email, token } = req.body as { email: string; token: string }
    const result = await authService.continueSession(email, token)
    return { status: 'success' as const, ...result }
  }

  async refreshSession(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    const { email, token } = req.body as { email: string; token: string }
    const result = await authService.refreshSession(token, email)
    return { status: 'success' as const, ...result }
  }

  async checkOnline(_: Electron.IpcMainInvokeEvent, _req: IRequest) {
    return { online: await authService.checkOnline() }
  }

  async sendOtp(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    const { email, purpose } = req.body as { email: string; purpose: string }
    await authService.sendOtp(email, purpose as any)
    return { success: true }
  }

  async logout(_: Electron.IpcMainInvokeEvent, _req: IRequest) {
    await stopSync()
    appState.clearSession()
    return { success: true }
  }

  async factoryReset(_: Electron.IpcMainInvokeEvent, req: IRequest) {
    const { pin, confirm, token } = req.body as {
      pin: string
      confirm: string
      token?: string | null
    }
    return authService.factoryResetPos({ pin, confirm, token })
  }
}

export const authController = new AuthController()

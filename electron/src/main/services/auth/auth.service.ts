import jwt from 'jsonwebtoken'
import { getDb, resetLocalCompanyDatabase } from '../../db'
import { IUser } from '../../../common/types'
import { appState } from '../../state/app-state'
import { getClientDeviceId } from '../device'
import { apiFetch, checkServerOnline, JWT_SECRET } from '../http'
import { cacheBootstrapData } from './initial-sync.service'
import { startSyncAfterAuth, stopSync } from '../sync'

export type OtpPurpose = 'email_verify' | 'device_reset'

export type LoginResult = {
  user: IUser & { branchName?: string; companyName?: string }
  deviceId: string
  token: string
  tokenExpiresAt: string
  offlineAllowedUntil?: string
}

export type CompanyMismatchResult = {
  status: 'company_mismatch'
  localCompanyId: string
  localCompanyName: string
  incomingCompanyId: string
  incomingCompanyName: string
  message: string
}

export type CompanySwitchBlockedResult = {
  status: 'company_switch_blocked'
  localCompanyId: string
  localCompanyName: string
  pendingChanges: number
  message: string
}

export type LoginResponse =
  | ({ status: 'success' } & LoginResult)
  | { status: 'otp_required'; otpPurpose: OtpPurpose; message: string }
  | CompanyMismatchResult
  | CompanySwitchBlockedResult

type CompanyGate =
  | { status: 'ok' }
  | CompanyMismatchResult
  | CompanySwitchBlockedResult

class AuthService {
  async checkOnline(): Promise<boolean> {
    return checkServerOnline()
  }

  verifyTokenOffline(token: string, email: string): {
    valid: boolean
    expired?: boolean
    offlineExpired?: boolean
    payload?: jwt.JwtPayload
  } {
    try {
      const payload = jwt.verify(token, JWT_SECRET, {
        ignoreExpiration: true
      }) as jwt.JwtPayload & {
        email?: string
        tokenExpiresAt?: string
        offlineAllowedUntil?: string
        userId?: string
        companyId?: string | null
        branchId?: string | null
        role?: string
        permissions?: string[]
        deviceId?: string
      }

      if (payload.email && payload.email.toLowerCase() !== email.toLowerCase()) {
        return { valid: false }
      }

      const now = Date.now()

      if (payload.offlineAllowedUntil) {
        if (now > new Date(payload.offlineAllowedUntil).getTime()) {
          return { valid: false, offlineExpired: true }
        }
        return { valid: true, payload }
      }

      const onlineExpiry = payload.tokenExpiresAt
        ? new Date(payload.tokenExpiresAt).getTime()
        : payload.exp
          ? payload.exp * 1000
          : null

      if (onlineExpiry !== null && now > onlineExpiry) {
        return { valid: false, expired: true }
      }

      return { valid: true, payload }
    } catch (err: any) {
      console.log(err)
      return { valid: false }
    }
  }

  async login(
    email: string,
    password: string,
    otp?: string,
    otpPurpose?: OtpPurpose,
    confirmCompanySwitch = false
  ): Promise<LoginResponse> {
    const clientDeviceId = getClientDeviceId()
    const res = await apiFetch<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, clientDeviceId, otp, otpPurpose })
    })

    if (!res.ok) {
      const data = res.data as any
      if (res.status === 403 && data?.requiresOtp) {
        return {
          status: 'otp_required',
          otpPurpose: data.otpPurpose,
          message: data.message || 'OTP required'
        }
      }
      throw new Error(res.error || 'Login failed')
    }

    const incomingCompanyId = (res.data.user.companyId as string) || ''
    const incomingCompanyName = (res.data.companyName as string) || 'this company'
    const gate = await this.evaluateCompanyGate(incomingCompanyId, incomingCompanyName)

    if (gate.status === 'company_switch_blocked') {
      return gate
    }

    if (gate.status === 'company_mismatch') {
      if (!confirmCompanySwitch) {
        return gate
      }
      const pending = await this.countPendingLocalChanges()
      if (pending > 0) {
        return {
          status: 'company_switch_blocked',
          localCompanyId: gate.localCompanyId,
          localCompanyName: gate.localCompanyName,
          pendingChanges: pending,
          message: `This POS has ${pending} unsynced change(s) for "${gate.localCompanyName}". Sync or clear them before switching companies.`
        }
      }
      await this.wipeLocalDataForCompanySwitch()
    }

    const success = await this.handleAuthSuccess(res.data, email)
    return { status: 'success', ...success }
  }

  async sendOtp(email: string, purpose: OtpPurpose): Promise<void> {
    const res = await apiFetch('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email, purpose })
    })
    if (!res.ok) throw new Error(res.error || 'Failed to send OTP')
  }

  async continueSession(email: string, token: string): Promise<LoginResult> {
    if (await checkServerOnline()) {
      throw new Error(
        'Server is available. Please sign in with your password for security.'
      )
    }

    const verification = this.verifyTokenOffline(token, email)
    if (!verification.valid) {
      if (verification.offlineExpired) {
        throw new Error('Offline session expired. Internet is required to login.')
      }
      if (verification.expired) {
        throw new Error('Session expired. Internet is required to login for security purposes!')
      }
      throw new Error('Invalid session. Please login again.')
    }

    const payload = verification.payload as jwt.JwtPayload & {
      userId: string
      companyId: string | null
      branchId: string | null
      role: string
      permissions: string[]
      deviceId: string
      offlineAllowedUntil?: string
    }

    await this.assertOfflineCompanyMatch(payload.companyId)

    const cached = await getDb()('user_profiles').where({ email: email.toLowerCase() }).first()
    let branchName: string | undefined
    if (payload.branchId) {
      const branch = await getDb()('branches').where({ id: payload.branchId }).first()
      branchName = branch?.name as string
    }

    const user: IUser & { branchName?: string } = {
      id: payload.userId,
      companyId: payload.companyId || (cached?.company_id as string) || '',
      branchId: payload.branchId,
      email: email.toLowerCase(),
      firstName: (cached?.first_name as string) || '',
      lastName: (cached?.last_name as string) || '',
      role: payload.role as IUser['role'],
      permissions: payload.permissions || [],
      token,
      createdAt: cached?.created_at
        ? new Date(cached.created_at as string).toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branchName
    }

    const exp = payload.tokenExpiresAt
      ? payload.tokenExpiresAt
      : payload.exp
        ? new Date(payload.exp * 1000).toISOString()
        : new Date(Date.now() + 86400000).toISOString()

    void this.resumeSync(token)

    const result: LoginResult = {
      user,
      deviceId: payload.deviceId || getClientDeviceId(),
      token,
      tokenExpiresAt: exp,
      offlineAllowedUntil: payload.offlineAllowedUntil
    }
    appState.setSession(result)
    return result
  }

  async refreshSession(token: string, email: string): Promise<LoginResult> {
    const clientDeviceId = getClientDeviceId()
    const res = await apiFetch<any>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ clientDeviceId }),
      token
    })
    if (!res.ok) {
      throw new Error(res.error || 'Session expired. Please login again.')
    }

    const incomingCompanyId = (res.data.user.companyId as string) || ''
    const incomingCompanyName = (res.data.companyName as string) || 'this company'
    const gate = await this.evaluateCompanyGate(incomingCompanyId, incomingCompanyName)
    if (gate.status !== 'ok') {
      throw new Error(
        gate.status === 'company_switch_blocked'
          ? gate.message
          : `This POS is set up for "${gate.localCompanyName}". Sign in online with a password to switch companies.`
      )
    }

    return this.handleAuthSuccess(res.data, email)
  }

  async resumeSync(token: string): Promise<void> {
    const online = await checkServerOnline()
    if (!online) return
    try {
      await startSyncAfterAuth(token)
    } catch (err) {
      console.error('Failed to resume sync:', err)
    }
  }

  async pullInitialData(token: string, companyId?: string | null): Promise<void> {
    if (!companyId) return
    const res = await apiFetch<any>('/auth/bootstrap', { method: 'GET', token })
    if (!res.ok) throw new Error(res.error || 'Failed to download data')
    await cacheBootstrapData(res.data)
  }

  private async countPendingLocalChanges(): Promise<number> {
    try {
      const state = await getDb()('sync_state').first()
      const since = Number(state?.last_pushed_sno) || 0
      const row = await getDb()('sync_queue').where('sno', '>', since).count('* as count').first()
      return Number(row?.count ?? 0)
    } catch {
      return 0
    }
  }

  private async evaluateCompanyGate(
    incomingCompanyId: string,
    incomingCompanyName: string
  ): Promise<CompanyGate> {
    if (!incomingCompanyId) return { status: 'ok' }

    let profile: { id: string; name?: string } | undefined
    try {
      profile = await getDb()('company_profile').whereNull('deleted_at').first()
    } catch {
      return { status: 'ok' }
    }

    if (!profile?.id) return { status: 'ok' }
    if (profile.id === incomingCompanyId) return { status: 'ok' }

    const localCompanyName = (profile.name as string) || 'another company'
    const pending = await this.countPendingLocalChanges()
    if (pending > 0) {
      return {
        status: 'company_switch_blocked',
        localCompanyId: profile.id,
        localCompanyName,
        pendingChanges: pending,
        message: `This POS has ${pending} unsynced change(s) for "${localCompanyName}". Sync them before switching to "${incomingCompanyName}".`
      }
    }

    return {
      status: 'company_mismatch',
      localCompanyId: profile.id,
      localCompanyName,
      incomingCompanyId,
      incomingCompanyName,
      message: `This POS is set up for "${localCompanyName}". Signing in as "${incomingCompanyName}" requires wiping all local data on this device.`
    }
  }

  private async assertOfflineCompanyMatch(sessionCompanyId: string | null): Promise<void> {
    if (!sessionCompanyId) return

    let profile: { id: string; name?: string } | undefined
    try {
      profile = await getDb()('company_profile').whereNull('deleted_at').first()
    } catch {
      return
    }

    if (!profile?.id) return
    if (profile.id === sessionCompanyId) return

    const localName = (profile.name as string) || 'another company'
    throw new Error(
      `This POS is set up for "${localName}". Company switch is not allowed offline. Connect to the internet and sign in to wipe and switch.`
    )
  }

  private async wipeLocalDataForCompanySwitch(): Promise<void> {
    await stopSync()
    appState.clearSession()
    await resetLocalCompanyDatabase()
  }

  private async handleAuthSuccess(data: any, email: string): Promise<LoginResult> {
    const tokenExpiresAt =
      data.tokenExpiresAt ||
      (() => {
        const decoded = jwt.decode(data.token) as jwt.JwtPayload
        return decoded?.exp
          ? new Date(decoded.exp * 1000).toISOString()
          : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      })()

    const user: IUser & { branchName?: string; companyName?: string } = {
      id: data.user.id,
      companyId: data.user.companyId || '',
      branchId: data.user.branchId,
      email: data.user.email || email,
      firstName: data.user.firstName,
      lastName: data.user.lastName,
      role: data.user.role,
      permissions: data.user.permissions || [],
      token: data.token,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branchName: data.branchName,
      companyName: data.companyName
    }

    if (data.user.companyId) {
      await this.pullInitialData(data.token, data.user.companyId)
    }

    try {
      await startSyncAfterAuth(data.token)
    } catch (err) {
      console.error('Failed to start sync after login:', err)
    }

    if (user.companyId) {
      const existing = await getDb()('user_profiles').where({ id: user.id }).first()
      const row = {
        id: user.id,
        company_id: user.companyId,
        branch_id: user.branchId,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        role: user.role,
        is_active: true,
        updated_at: new Date()
      }
      if (existing) {
        await getDb()('user_profiles').where({ id: user.id }).update(row)
      } else {
        await getDb()('user_profiles').insert({
          ...row,
          email_verified: data.user.emailVerified ?? false,
          created_at: new Date()
        })
      }
    }

    const result: LoginResult = {
      user,
      deviceId: data.deviceId,
      token: data.token,
      tokenExpiresAt,
      offlineAllowedUntil: data.offlineAllowedUntil
    }
    appState.setSession(result)
    return result
  }
}

export const authService = new AuthService()

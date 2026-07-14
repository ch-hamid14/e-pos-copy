import { companyDbName } from '@madix/database'
import {
  getDb,
  isDatabaseReady,
  switchLocalCompanyDatabase,
  wipeActiveLocalCompanyDatabase
} from '../../db'
import { IUser } from '../../../common/types'
import { REAUTH_GRACE_MS, RECONNECT_POLL_MS } from '../../../common/constants/config'
import { appState } from '../../state/app-state'
import { getClientDeviceId, rotateClientDeviceId, rotateSyncNodeId } from '../device'
import { apiFetch, checkServerOnline } from '../http'
import { cacheBootstrapData, upsertSessionUserProfile } from './initial-sync.service'
import {
  clearOfflineSession,
  loadOfflineSession,
  saveOfflineSession
} from './offline-session'
import { broadcastConnectivity } from './connectivity'
import { startSyncAfterAuth, stopSync, syncService } from '../sync'

/** Tech factory-reset PIN (not shown in UI). */
const TECH_RESET_PIN = '54321'

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

export type EnsureOnlineResult =
  | { status: 'idle' }
  | { status: 'offline' }
  | { status: 'reconnected' }
  | { status: 'reauth_required'; deadline: number; reason: string }
  | { status: 'session_ended'; reason: string }

type CompanyGate = { status: 'ok' } | CompanyMismatchResult

class AuthService {
  private reconnectTimer: ReturnType<typeof setInterval> | null = null
  private lastKnownOnline: boolean | null = null
  private reauthGraceDeadline: number | null = null
  private reauthReason: string | null = null
  private ensureInFlight: Promise<EnsureOnlineResult> | null = null

  async checkOnline(): Promise<boolean> {
    return checkServerOnline()
  }

  startReconnectMonitor(): void {
    if (this.reconnectTimer) return
    void this.tickReconnect()
    this.reconnectTimer = setInterval(() => void this.tickReconnect(), RECONNECT_POLL_MS)
  }

  stopReconnectMonitor(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.lastKnownOnline = null
  }

  private async tickReconnect(): Promise<void> {
    const online = await checkServerOnline()
    const was = this.lastKnownOnline
    this.lastKnownOnline = online

    if (!online) {
      if (was === true) broadcastConnectivity({ status: 'offline' })
      return
    }

    if (this.reauthGraceDeadline != null) {
      if (Date.now() >= this.reauthGraceDeadline) {
        await this.endSessionAfterGrace('Grace period ended. Sign in to continue syncing.')
      }
      return
    }

    const hasSession = Boolean(appState.getSession() || loadOfflineSession())
    if (!hasSession) return

    const cameOnline = was === false
    const needsSyncAuth = !syncService.isRunning()
    if (cameOnline || needsSyncAuth) {
      await this.ensureOnlineSession()
    }
  }

  /**
   * When connectivity returns: refresh JWT, then start sync.
   * On refresh failure: block sync and start 5-minute local-work grace.
   */
  async ensureOnlineSession(): Promise<EnsureOnlineResult> {
    if (this.ensureInFlight) return this.ensureInFlight
    this.ensureInFlight = this.doEnsureOnlineSession().finally(() => {
      this.ensureInFlight = null
    })
    return this.ensureInFlight
  }

  private async doEnsureOnlineSession(): Promise<EnsureOnlineResult> {
    if (!(await checkServerOnline())) {
      broadcastConnectivity({ status: 'offline' })
      return { status: 'offline' }
    }

    if (this.reauthGraceDeadline != null) {
      if (Date.now() >= this.reauthGraceDeadline) {
        return this.endSessionAfterGrace('Grace period ended. Sign in to continue syncing.')
      }
      return {
        status: 'reauth_required',
        deadline: this.reauthGraceDeadline,
        reason: this.reauthReason || 'Internet is back. Sign in to sync.'
      }
    }

    const live = appState.getSession()
    const sealed = loadOfflineSession()
    const token = live?.token || sealed?.token
    const email = live?.user.email || sealed?.email
    if (!token || !email) return { status: 'idle' }

    try {
      await this.refreshSession(token, email)
      this.clearReauthGrace()
      broadcastConnectivity({ status: 'reconnected' })
      return { status: 'reconnected' }
    } catch {
      await stopSync()
      if (this.reauthGraceDeadline == null) {
        this.reauthGraceDeadline = Date.now() + REAUTH_GRACE_MS
        this.reauthReason = 'Internet is back. Sign in to sync.'
      }
      const deadline = this.reauthGraceDeadline
      const reason = this.reauthReason || 'Internet is back. Sign in to sync.'
      broadcastConnectivity({
        status: 'reauth_required',
        deadline,
        reason
      })
      return {
        status: 'reauth_required',
        deadline,
        reason
      }
    }
  }

  getReauthGrace(): { deadline: number; reason: string } | null {
    if (this.reauthGraceDeadline == null) return null
    return {
      deadline: this.reauthGraceDeadline,
      reason: this.reauthReason || 'Internet is back. Sign in to sync.'
    }
  }

  private clearReauthGrace(): void {
    this.reauthGraceDeadline = null
    this.reauthReason = null
  }

  private async endSessionAfterGrace(reason: string): Promise<EnsureOnlineResult> {
    this.clearReauthGrace()
    this.stopReconnectMonitor()
    await stopSync()
    appState.clearSession()
    clearOfflineSession()
    broadcastConnectivity({ status: 'session_ended', reason })
    return { status: 'session_ended', reason }
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

    await this.prepareCompanyLocalDb(res.data)

    const incomingCompanyId = (res.data.user.companyId as string) || ''
    const incomingCompanyName = (res.data.companyName as string) || 'this company'
    const gate = await this.evaluateCompanyGate(incomingCompanyId, incomingCompanyName)

    if (gate.status === 'company_mismatch') {
      if (!confirmCompanySwitch) {
        return gate
      }

      await this.wipeAsFreshDevice(res.data.token as string)

      const freshRes = await apiFetch<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          clientDeviceId: getClientDeviceId(),
          otp,
          otpPurpose
        })
      })
      if (!freshRes.ok) {
        const data = freshRes.data as any
        if (freshRes.status === 403 && data?.requiresOtp) {
          return {
            status: 'otp_required',
            otpPurpose: data.otpPurpose,
            message: data.message || 'OTP required'
          }
        }
        throw new Error(freshRes.error || 'Login failed after wipe')
      }

      const success = await this.handleAuthSuccess(freshRes.data, email)
      return { status: 'success', ...success }
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

  /**
   * Offline convenience unlock via OS-sealed local session (no JWT secret).
   * Server online → must use password login. After 3 days → must login online.
   */
  async continueSession(email: string, _token?: string): Promise<LoginResult> {
    if (await checkServerOnline()) {
      throw new Error(
        'Server is available. Please sign in with your password for security.'
      )
    }

    const session = loadOfflineSession()
    if (!session) {
      throw new Error('No offline session. Please login online.')
    }

    const emailNorm = email.toLowerCase()
    if (session.email !== emailNorm) {
      throw new Error('Invalid session. Please login again.')
    }

    if (session.clientDeviceId !== getClientDeviceId()) {
      clearOfflineSession()
      throw new Error('Invalid session. Please login again.')
    }

    if (Date.now() > new Date(session.offlineAllowedUntil).getTime()) {
      clearOfflineSession()
      throw new Error('Offline session expired. Internet is required to login.')
    }

    if (!isDatabaseReady()) {
      throw new Error('Local company database is not ready. Connect online and sign in.')
    }

    await this.assertOfflineCompanyMatch(session.companyId)

    const cached = await getDb()('user_profiles').where({ email: emailNorm }).first()
    let branchName: string | undefined
    if (session.branchId) {
      const branch = await getDb()('branches').where({ id: session.branchId }).first()
      branchName = branch?.name as string
    }

    const user: IUser & { branchName?: string } = {
      id: session.userId,
      companyId: session.companyId || (cached?.company_id as string) || '',
      branchId: session.branchId,
      email: emailNorm,
      firstName: (cached?.first_name as string) || '',
      lastName: (cached?.last_name as string) || '',
      role: session.role as IUser['role'],
      permissions: session.permissions || [],
      token: session.token,
      createdAt: cached?.created_at
        ? new Date(cached.created_at as string).toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branchName
    }

    const result: LoginResult = {
      user,
      deviceId: session.deviceId || getClientDeviceId(),
      token: session.token,
      tokenExpiresAt: session.tokenExpiresAt,
      offlineAllowedUntil: session.offlineAllowedUntil
    }
    appState.setSession(result)
    this.startReconnectMonitor()
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

    await this.prepareCompanyLocalDb(res.data)

    const incomingCompanyId = (res.data.user.companyId as string) || ''
    const incomingCompanyName = (res.data.companyName as string) || 'this company'
    const gate = await this.evaluateCompanyGate(incomingCompanyId, incomingCompanyName)
    if (gate.status !== 'ok') {
      throw new Error(
        `This POS is set up for "${gate.localCompanyName}". Sign in online with a password to wipe and switch.`
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

  async logout(): Promise<void> {
    this.stopReconnectMonitor()
    this.clearReauthGrace()
    await stopSync()
    appState.clearSession()
    clearOfflineSession()
  }

  private async countPendingLocalChanges(): Promise<number> {
    if (!isDatabaseReady()) return 0
    try {
      const state = await getDb()('sync_state').first()
      const since = Number(state?.last_pushed_sno) || 0
      const row = await getDb()('sync_queue').where('sno', '>', since).count('* as count').first()
      return Number(row?.count ?? 0)
    } catch {
      return 0
    }
  }

  private resolveLocalDbName(data: {
    dbName?: string
    user?: { companyId?: string | null }
  }): string {
    if (data.dbName?.trim()) return data.dbName.trim()
    if (data.user?.companyId) return companyDbName(data.user.companyId)
    throw new Error(
      'This account has no company database. Create or assign a company before signing in on POS.'
    )
  }

  private async prepareCompanyLocalDb(data: {
    dbName?: string
    user?: { companyId?: string | null }
  }): Promise<void> {
    const dbName = this.resolveLocalDbName(data)
    await switchLocalCompanyDatabase(dbName)
  }

  private async evaluateCompanyGate(
    incomingCompanyId: string,
    incomingCompanyName: string
  ): Promise<CompanyGate> {
    if (!incomingCompanyId) return { status: 'ok' }
    if (!isDatabaseReady()) return { status: 'ok' }

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
    const pendingNote =
      pending > 0
        ? ` This will discard ${pending} unsynced local change(s).`
        : ''

    return {
      status: 'company_mismatch',
      localCompanyId: profile.id,
      localCompanyName,
      incomingCompanyId,
      incomingCompanyName,
      message: `Local database for this company already has data for "${localCompanyName}". Signing in as "${incomingCompanyName}" requires wiping this local database and resetting device identity.${pendingNote}`
    }
  }

  private async assertOfflineCompanyMatch(sessionCompanyId: string | null): Promise<void> {
    if (!sessionCompanyId) return
    if (!isDatabaseReady()) {
      throw new Error('Local company database is not ready. Connect online and sign in.')
    }

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

  private async wipeAsFreshDevice(token: string): Promise<void> {
    const oldDeviceId = getClientDeviceId()
    await stopSync()

    try {
      const release = await apiFetch('/auth/release-device', {
        method: 'POST',
        body: JSON.stringify({ clientDeviceId: oldDeviceId }),
        token
      })
      if (!release.ok) {
        console.warn('release-device failed during company wipe:', release.error)
      }
    } catch (err) {
      console.warn('release-device error during company wipe:', err)
    }

    appState.clearSession()
    clearOfflineSession()
    this.stopReconnectMonitor()
    this.clearReauthGrace()
    await wipeActiveLocalCompanyDatabase()
    rotateClientDeviceId()
    rotateSyncNodeId()
  }

  async factoryResetPos(input: {
    pin: string
    confirm: string
    token?: string | null
  }): Promise<{ ok: true; releasedDevice: boolean }> {
    if (input.pin !== TECH_RESET_PIN) {
      throw new Error('Invalid PIN')
    }
    if (input.confirm.trim().toUpperCase() !== 'WIPE') {
      throw new Error('Type WIPE to confirm')
    }

    const oldDeviceId = getClientDeviceId()
    await stopSync()

    let releasedDevice = false
    const token = input.token || appState.getToken()
    if (token && (await checkServerOnline())) {
      try {
        const release = await apiFetch('/auth/release-device', {
          method: 'POST',
          body: JSON.stringify({ clientDeviceId: oldDeviceId }),
          token
        })
        if (release.ok) {
          releasedDevice = true
        } else {
          console.warn('release-device failed during factory reset:', release.error)
        }
      } catch (err) {
        console.warn('release-device error during factory reset:', err)
      }
    }

    appState.clearSession()
    clearOfflineSession()
    this.stopReconnectMonitor()
    this.clearReauthGrace()
    await wipeActiveLocalCompanyDatabase()
    rotateClientDeviceId()
    rotateSyncNodeId()

    return { ok: true, releasedDevice }
  }

  private async handleAuthSuccess(data: any, email: string): Promise<LoginResult> {
    await this.prepareCompanyLocalDb(data)

    const tokenExpiresAt =
      data.tokenExpiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const offlineAllowedUntil =
      data.offlineAllowedUntil ||
      new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

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
      await upsertSessionUserProfile({
        id: user.id,
        companyId: user.companyId,
        branchId: user.branchId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: data.user.emailVerified ?? false
      })
    }

    try {
      await startSyncAfterAuth(data.token)
    } catch (err) {
      console.error('Failed to start sync after login:', err)
    }

    const result: LoginResult = {
      user,
      deviceId: data.deviceId,
      token: data.token,
      tokenExpiresAt,
      offlineAllowedUntil
    }

    saveOfflineSession({
      email: user.email.toLowerCase(),
      userId: user.id,
      companyId: user.companyId,
      branchId: user.branchId ?? null,
      role: user.role,
      permissions: user.permissions || [],
      deviceId: data.deviceId,
      clientDeviceId: getClientDeviceId(),
      token: data.token,
      tokenExpiresAt,
      offlineAllowedUntil
    })

    appState.setSession(result)
    this.clearReauthGrace()
    this.startReconnectMonitor()
    return result
  }
}

export const authService = new AuthService()

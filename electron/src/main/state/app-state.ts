import type { LoginResult } from '../services/auth'

class AppState {
  private static instance: AppState
  private session: LoginResult | null = null

  static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  setSession(session: LoginResult): void {
    this.session = session
  }

  getSession(): LoginResult | null {
    return this.session
  }

  getToken(): string | null {
    return this.session?.token ?? null
  }

  getCompanyId(): string | null {
    return this.session?.user.companyId ?? null
  }

  getBranchId(): string | null {
    return this.session?.user.branchId ?? null
  }

  getDeviceId(): string | null {
    return this.session?.deviceId ?? null
  }

  clearSession(): void {
    this.session = null
  }
}

export const appState = AppState.getInstance()

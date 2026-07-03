import { api } from './client'
import type { AuthUser } from '../types'

const WEB_CLIENT_ID = 'WEB-ADMIN-PLATFORM'

export type LoginResponse = {
  token: string
  user: AuthUser
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return api<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, clientDeviceId: WEB_CLIENT_ID })
  })
}

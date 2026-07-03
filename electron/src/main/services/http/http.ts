import { API_BASE_URL, JWT_SECRET } from '../../../common/constants/config'

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const { token, ...fetchOptions } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>)
  }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { ...fetchOptions, headers })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { ok: false, status: response.status, error: data.error || data.message || 'Request failed', data }
    }
    return { ok: true, status: response.status, data }
  } catch {
    return { ok: false, status: 0, error: 'Network error' }
  }
}

export async function checkServerOnline(): Promise<boolean> {
  try {
    const base = API_BASE_URL.replace(/\/api$/, '')
    const res = await fetch(`${base}/api/health`, { method: 'GET' })
    return res.ok
  } catch{
    return false
  }
}

export { JWT_SECRET }

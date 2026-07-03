const API_BASE = import.meta.env.VITE_API_URL || '/api'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...init } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>)
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(data.error || data.message || 'Request failed', res.status)
  }
  return data as T
}

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { AuthUser } from '../types'

type AuthState = {
  token: string | null
  user: AuthUser | null
  setSession: (token: string, user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

const TOKEN_KEY = 'madix_admin_token'
const USER_KEY = 'madix_admin_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  })

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      setSession: (t, u) => {
        localStorage.setItem(TOKEN_KEY, t)
        localStorage.setItem(USER_KEY, JSON.stringify(u))
        setToken(t)
        setUser(u)
      },
      logout: () => {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        setToken(null)
        setUser(null)
      }
    }),
    [token, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

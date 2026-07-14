import fs from 'fs'
import path from 'path'
import { app, safeStorage } from 'electron'
import madix from '../../../../package.json'

const SESSION_FILE = 'offline-session'

export type OfflineSession = {
  email: string
  userId: string
  companyId: string
  branchId: string | null
  role: string
  permissions: string[]
  deviceId: string
  clientDeviceId: string
  /** Opaque online API token — not verified locally. */
  token: string
  tokenExpiresAt: string
  offlineAllowedUntil: string
}

function getSessionPath(): string {
  const userDir = path.join(app.getPath('userData'), madix.name)
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true })
  return path.join(userDir, SESSION_FILE)
}

export function saveOfflineSession(session: OfflineSession): void {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('safeStorage unavailable — offline session not saved')
    clearOfflineSession()
    return
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(session))
  fs.writeFileSync(getSessionPath(), encrypted)
}

export function loadOfflineSession(): OfflineSession | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const filePath = getSessionPath()
  if (!fs.existsSync(filePath)) return null
  try {
    const encrypted = fs.readFileSync(filePath)
    const json = safeStorage.decryptString(encrypted)
    const session = JSON.parse(json) as OfflineSession
    if (!session?.email || !session?.token || !session?.offlineAllowedUntil) return null
    return session
  } catch (err) {
    console.warn('Failed to load offline session:', err)
    clearOfflineSession()
    return null
  }
}

export function clearOfflineSession(): void {
  const filePath = getSessionPath()
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

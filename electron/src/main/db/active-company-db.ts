import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import madix from '../../../package.json'

const ACTIVE_DB_FILE = 'active-company-db'

function getActiveDbPath(): string {
  const userDir = path.join(app.getPath('userData'), madix.name)
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true })
  return path.join(userDir, ACTIVE_DB_FILE)
}

/** Last company local database name (mirrors online companies.db_name). */
export function getActiveCompanyDbName(): string | null {
  const filePath = getActiveDbPath()
  if (!fs.existsSync(filePath)) return null
  const name = fs.readFileSync(filePath, 'utf8').trim()
  return name || null
}

export function setActiveCompanyDbName(dbName: string): void {
  fs.writeFileSync(getActiveDbPath(), dbName.trim(), 'utf8')
}

export function clearActiveCompanyDbName(): void {
  const filePath = getActiveDbPath()
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

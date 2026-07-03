import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import madix from '../../../../package.json'
import { generateId } from '../../../common/utils/uuid'

const DEVICE_ID_FILE = 'client-device-id'

function getDeviceIdPath(): string {
  const userDir = path.join(app.getPath('userData'), madix.name)
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true })
  return path.join(userDir, DEVICE_ID_FILE)
}

export function getClientDeviceId(): string {
  const filePath = getDeviceIdPath()
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim()
  }
  const id = `CDEV-${generateId().replace(/-/g, '').slice(0, 12).toUpperCase()}`
  fs.writeFileSync(filePath, id, 'utf8')
  return id
}

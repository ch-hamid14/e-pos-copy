import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import madix from '../../../../package.json'
import { generateId } from '../../../common/utils/uuid'

const SYNC_NODE_ID_FILE = 'sync-node-id'

function getSyncNodeIdPath(): string {
  const userDir = path.join(app.getPath('userData'), madix.name)
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true })
  return path.join(userDir, SYNC_NODE_ID_FILE)
}

/** Stable UUID used as the sync engine node / client identity (separate from CDEV device id). */
export function getSyncNodeId(): string {
  const filePath = getSyncNodeIdPath()
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim()
  }
  const id = generateId()
  fs.writeFileSync(filePath, id, 'utf8')
  return id
}

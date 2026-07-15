import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import madix from '../../../../package.json'

const EPOCH_FILE = 'company-data-epochs.json'

type EpochMap = Record<string, number>

function epochsPath(): string {
  const userDir = path.join(app.getPath('userData'), madix.name)
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true })
  return path.join(userDir, EPOCH_FILE)
}

function readMap(): EpochMap {
  const filePath = epochsPath()
  if (!fs.existsSync(filePath)) return {}
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as EpochMap
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function writeMap(map: EpochMap): void {
  fs.writeFileSync(epochsPath(), JSON.stringify(map, null, 2), 'utf8')
}

/** Locally recorded authority data epoch for a company (null if never recorded). */
export function getLocalDataEpoch(companyId: string): number | null {
  if (!companyId) return null
  const value = readMap()[companyId]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function setLocalDataEpoch(companyId: string, epoch: number): void {
  if (!companyId) return
  const map = readMap()
  map[companyId] = Math.max(1, Math.floor(epoch))
  writeMap(map)
}

export function clearLocalDataEpoch(companyId: string): void {
  if (!companyId) return
  const map = readMap()
  if (!(companyId in map)) return
  delete map[companyId]
  writeMap(map)
}

import { execFile, spawn } from 'child_process'
import fsp from 'fs/promises'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export type PgTool = 'pg_dump' | 'psql'

export function vendorPgRoot(): string {
  return path.join(process.cwd(), 'vendor', 'pg')
}

export function platformKey(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'darwin') return `darwin-${arch}`
  if (process.platform === 'win32') {
    if (arch !== 'x64') throw new Error('Only win32-x64 is supported')
    return 'win32-x64'
  }
  if (process.platform === 'linux') return `linux-${arch}`
  throw new Error(`Unsupported platform: ${process.platform} ${process.arch}`)
}

function binName(tool: PgTool): string {
  return process.platform === 'win32' ? `${tool}.exe` : tool
}

export function vendoredToolPath(tool: PgTool): string {
  return path.join(vendorPgRoot(), platformKey(), 'bin', binName(tool))
}

export function vendoredLibDir(): string {
  return path.join(vendorPgRoot(), platformKey(), 'lib')
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath)
    return true
  } catch {
    return false
  }
}

/** Download vendored pg_dump/psql via scripts/ensure-pg-dump.js (GitHub releases only). */
export async function ensurePgClientInstalled(): Promise<void> {
  const script = path.join(process.cwd(), 'scripts', 'ensure-pg-dump.js')
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(process.execPath, [script], {
      stdio: 'inherit',
      cwd: process.cwd()
    })
    proc.on('error', reject)
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ensure-pg-dump exited with code ${code}`))
    })
  })
}

/**
 * Resolve pg_dump/psql from backend/vendor only.
 * If missing, downloads PostgreSQL client binaries into vendor.
 */
export async function resolvePgTool(tool: PgTool): Promise<string> {
  const vendored = vendoredToolPath(tool)
  if (await exists(vendored)) return vendored

  await ensurePgClientInstalled()

  if (await exists(vendored)) return vendored

  throw new Error(
    `${tool} not found in vendor after download. Run "npm run ensure-pg-dump" from the backend folder.`
  )
}

export function pgToolEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  const libDir = vendoredLibDir()
  // Prefer vendored libs so downloaded binaries don't load mismatched system dylibs.
  if (process.platform === 'linux') {
    env.LD_LIBRARY_PATH = libDir + (env.LD_LIBRARY_PATH ? `:${env.LD_LIBRARY_PATH}` : '')
  } else if (process.platform === 'darwin') {
    env.DYLD_LIBRARY_PATH = libDir + (env.DYLD_LIBRARY_PATH ? `:${env.DYLD_LIBRARY_PATH}` : '')
  } else if (process.platform === 'win32') {
    env.PATH = `${path.join(vendorPgRoot(), platformKey(), 'bin')};${env.PATH || ''}`
  }
  return env
}

export async function runPgDump(
  args: string[],
  env: Record<string, string>
): Promise<void> {
  const pgDump = await resolvePgTool('pg_dump')
  await execFileAsync(pgDump, args, { env: pgToolEnv(env), maxBuffer: 64 * 1024 * 1024 })
}

export async function runPsql(
  args: string[],
  env: Record<string, string>
): Promise<void> {
  const psql = await resolvePgTool('psql')
  await execFileAsync(psql, args, { env: pgToolEnv(env), maxBuffer: 64 * 1024 * 1024 })
}

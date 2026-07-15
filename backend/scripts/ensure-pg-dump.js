#!/usr/bin/env node
/**
 * Downloads PostgreSQL client binaries (pg_dump, psql) into
 * backend/vendor/pg/{platform}/ from theseus-rs GitHub releases.
 *
 * Supported platforms: darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64
 * No system PATH / Homebrew / apt fallback — vendor only.
 */
const { execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const fsp = require('fs/promises')
const https = require('https')
const http = require('http')
const path = require('path')
const { pipeline } = require('stream/promises')

const PG_VERSION = process.env.PG_CLIENT_VERSION || '16.10.0'
const ROOT = path.join(__dirname, '..', 'vendor', 'pg')
const RELEASE_BASE = `https://github.com/theseus-rs/postgresql-binaries/releases/download/${PG_VERSION}`

function platformKey() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'darwin') return `darwin-${arch}`
  if (process.platform === 'win32') {
    if (arch !== 'x64') throw new Error('Only win32-x64 is supported')
    return 'win32-x64'
  }
  if (process.platform === 'linux') return `linux-${arch}`
  throw new Error(`Unsupported platform: ${process.platform} ${process.arch}`)
}

function binName(name) {
  return process.platform === 'win32' ? `${name}.exe` : name
}

/** Map our platform key → theseus-rs asset name (without version). */
function artifactFor(key) {
  const map = {
    'darwin-arm64': {
      file: `postgresql-${PG_VERSION}-aarch64-apple-darwin.tar.gz`,
      folder: `postgresql-${PG_VERSION}-aarch64-apple-darwin`
    },
    'darwin-x64': {
      file: `postgresql-${PG_VERSION}-x86_64-apple-darwin.tar.gz`,
      folder: `postgresql-${PG_VERSION}-x86_64-apple-darwin`
    },
    'linux-x64': {
      file: `postgresql-${PG_VERSION}-x86_64-unknown-linux-gnu.tar.gz`,
      folder: `postgresql-${PG_VERSION}-x86_64-unknown-linux-gnu`
    },
    'linux-arm64': {
      file: `postgresql-${PG_VERSION}-aarch64-unknown-linux-gnu.tar.gz`,
      folder: `postgresql-${PG_VERSION}-aarch64-unknown-linux-gnu`
    },
    'win32-x64': {
      file: `postgresql-${PG_VERSION}-x86_64-pc-windows-msvc.zip`,
      folder: `postgresql-${PG_VERSION}-x86_64-pc-windows-msvc`
    }
  }
  const entry = map[key]
  if (!entry) throw new Error(`No PostgreSQL client bundle for ${key}`)
  return entry
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u, redirects = 0) => {
      if (redirects > 10) {
        reject(new Error(`Too many redirects: ${u}`))
        return
      }
      const lib = u.startsWith('https') ? https : http
      lib
        .get(
          u,
          {
            headers: {
              'User-Agent': 'madix-e-pos-backend/ensure-pg-dump',
              Accept: '*/*'
            }
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume()
              const next = res.headers.location.startsWith('http')
                ? res.headers.location
                : new URL(res.headers.location, u).toString()
              follow(next, redirects + 1)
              return
            }
            if (res.statusCode !== 200) {
              reject(new Error(`Download failed (${res.statusCode}): ${u}`))
              res.resume()
              return
            }
            pipeline(res, fs.createWriteStream(dest)).then(resolve).catch(reject)
          }
        )
        .on('error', reject)
    }
    follow(url)
  })
}

async function extractArchive(archivePath, destDir) {
  await fsp.mkdir(destDir, { recursive: true })
  if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
    execFileSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' })
    return
  }
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
      ],
      { stdio: 'inherit' }
    )
    return
  }
  execFileSync('unzip', ['-q', '-o', archivePath, '-d', destDir], { stdio: 'inherit' })
}

async function copyTree(src, dest) {
  await fsp.mkdir(dest, { recursive: true })
  const entries = await fsp.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyTree(from, to)
    else await fsp.copyFile(from, to)
  }
}

async function installFromBundle(bundleRoot, targetDir) {
  const binSrc = path.join(bundleRoot, 'bin')
  const libSrc = path.join(bundleRoot, 'lib')
  const shareSrc = path.join(bundleRoot, 'share')
  if (!fs.existsSync(binSrc)) {
    throw new Error(`bin/ missing in extracted bundle: ${bundleRoot}`)
  }

  await fsp.rm(targetDir, { recursive: true, force: true })
  await fsp.mkdir(targetDir, { recursive: true })

  const binDest = path.join(targetDir, 'bin')
  await copyTree(binSrc, binDest)
  if (fs.existsSync(libSrc)) await copyTree(libSrc, path.join(targetDir, 'lib'))
  if (fs.existsSync(shareSrc)) await copyTree(shareSrc, path.join(targetDir, 'share'))

  const pgDump = path.join(binDest, binName('pg_dump'))
  const psql = path.join(binDest, binName('psql'))
  if (!fs.existsSync(pgDump)) throw new Error(`pg_dump not found after extract (${pgDump})`)
  if (!fs.existsSync(psql)) throw new Error(`psql not found after extract (${psql})`)

  if (process.platform !== 'win32') {
    for (const name of ['pg_dump', 'psql']) {
      const p = path.join(binDest, binName(name))
      if (fs.existsSync(p)) fs.chmodSync(p, 0o755)
    }
  }
}

async function main() {
  const key = platformKey()
  const targetDir = path.join(ROOT, key)
  const pgDumpPath = path.join(targetDir, 'bin', binName('pg_dump'))
  if (fs.existsSync(pgDumpPath)) {
    console.log(`[ensure-pg-dump] Already installed: ${pgDumpPath}`)
    return
  }

  const artifact = artifactFor(key)
  const url = `${RELEASE_BASE}/${artifact.file}`
  const cacheDir = path.join(ROOT, '.cache')
  await fsp.mkdir(cacheDir, { recursive: true })
  const archivePath = path.join(cacheDir, artifact.file)

  console.log(`[ensure-pg-dump] Downloading PostgreSQL ${PG_VERSION} for ${key}…`)
  console.log(`[ensure-pg-dump] ${url}`)
  if (!fs.existsSync(archivePath)) {
    await download(url, archivePath)
  }

  const extractDir = path.join(cacheDir, crypto.randomBytes(8).toString('hex'))
  await fsp.mkdir(extractDir, { recursive: true })
  try {
    await extractArchive(archivePath, extractDir)
    const bundleRoot = path.join(extractDir, artifact.folder)
    if (!fs.existsSync(bundleRoot)) {
      throw new Error(`Expected folder ${artifact.folder}/ inside archive`)
    }
    await installFromBundle(bundleRoot, targetDir)
    console.log(`[ensure-pg-dump] Installed to ${targetDir}`)
  } finally {
    await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((err) => {
  console.error('[ensure-pg-dump] Failed:', err.message)
  console.error('[ensure-pg-dump] Run "npm run ensure-pg-dump" with network access.')
  process.exit(1)
})

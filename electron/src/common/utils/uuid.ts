/** Works in Electron main, preload, and renderer (Web Crypto API). */
export const generateId = (): string => globalThis.crypto.randomUUID()

export const generateDeviceId = (): string => {
  const suffix = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
  return `DEV-${suffix}`
}

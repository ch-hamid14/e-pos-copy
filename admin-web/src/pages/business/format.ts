export function formatRs(value: unknown) {
  return `Rs ${Number(value ?? 0).toLocaleString()}`
}

function formatScaled(value: number, divisor: number, suffix: string): string {
  const scaled = value / divisor
  const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '')
  return `${text}${suffix}`
}

/** Compact number: 10000 → 10k, 1500000 → 1.5M */
export function formatCompact(value: unknown): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000_000) return `${sign}${formatScaled(abs, 1_000_000_000, 'B')}`
  if (abs >= 1_000_000) return `${sign}${formatScaled(abs, 1_000_000, 'M')}`
  if (abs >= 1_000) return `${sign}${formatScaled(abs, 1_000, 'k')}`
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: abs % 1 ? 2 : 0 })}`
}

export function formatCompactRs(value: unknown): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 'Rs 0'
  if (Math.abs(n) < 1000) return formatRs(n)
  const compact = formatCompact(Math.abs(n))
  return n < 0 ? `Rs −${compact}` : `Rs ${compact}`
}

export function formatCompactAxis(value: unknown): string {
  return formatCompact(value).replace(/^−/, '')
}

export function formatDate(value: unknown) {
  if (!value) return '—'
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

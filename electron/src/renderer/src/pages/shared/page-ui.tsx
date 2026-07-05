import { ReactNode } from 'react'
import { Typography } from 'antd'

const { Title, Text } = Typography

export const formatRs = (value: unknown) => `Rs ${Number(value ?? 0).toLocaleString()}`

function formatScaled(value: number, divisor: number, suffix: string): string {
  const scaled = value / divisor
  const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '')
  return `${text}${suffix}`
}

/** Compact number: 10000 → 10k, 1500000 → 1.5M, 2000000000 → 2B */
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

/** Compact currency: 10000 → Rs 10k */
export function formatCompactRs(value: unknown): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 'Rs 0'
  if (Math.abs(n) < 1000) return formatRs(n)

  const compact = formatCompact(Math.abs(n))
  return n < 0 ? `Rs −${compact}` : `Rs ${compact}`
}

/** Axis/chart helper — same as formatCompact without sign prefix handling for negatives in charts */
export function formatCompactAxis(value: unknown): string {
  return formatCompact(value).replace(/^−/, '')
}

export const formatStatus = (status: string) => status.replace(/_/g, ' ')

export function formatAuditUser(user: { firstName?: string; lastName?: string } | null | undefined): string {
  if (!user?.firstName) return '—'
  return `${user.firstName} ${user.lastName || ''}`.trim()
}

type PageHeaderProps = {
  title: string
  subtitle?: string
  extra?: ReactNode
}

export function PageHeader({ title, subtitle, extra }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
      <div>
        <Title level={2} style={{ margin: 0 }}>{title}</Title>
        {subtitle && <Text type="secondary">{subtitle}</Text>}
      </div>
      {extra}
    </div>
  )
}

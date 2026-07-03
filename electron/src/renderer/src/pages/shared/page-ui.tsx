import { ReactNode } from 'react'
import { Typography } from 'antd'

const { Title, Text } = Typography

export const formatRs = (value: unknown) => `Rs ${Number(value ?? 0).toLocaleString()}`

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

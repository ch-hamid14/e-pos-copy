import { Tag } from 'antd'

const COLORS: Record<string, string> = {
  active: 'success',
  inactive: 'default',
  provisioning: 'processing'
}

export default function StatusTag({ status }: { status: string }) {
  return (
    <Tag color={COLORS[status] || 'default'} style={{ textTransform: 'capitalize', margin: 0 }}>
      {status}
    </Tag>
  )
}

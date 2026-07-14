import { useEffect, useState } from 'react'
import { Table, Typography } from 'antd'
import { listAuditLogs } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import type { AuditLog } from '../types'

export default function AuditPage() {
  const { token } = useAuth()
  const [rows, setRows] = useState<AuditLog[]>([])

  useEffect(() => {
    if (!token) return
    listAuditLogs(token, { limit: 200 }).then(setRows).catch(() => setRows([]))
  }, [token])

  return (
    <div>
      <div className="madix-page-header">
        <div>
          <h1>Audit log</h1>
          <p>Super admin actions across companies and platform tools.</p>
        </div>
      </div>
      <div className="madix-panel">
        <Table<AuditLog>
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 50 }}
          columns={[
            {
              title: 'When',
              dataIndex: 'createdAt',
              width: 180,
              render: (v) => new Date(v).toLocaleString()
            },
            { title: 'Actor', dataIndex: 'actorEmail', render: (v) => v || '—' },
            { title: 'Action', dataIndex: 'action' },
            { title: 'Resource', dataIndex: 'resource', render: (v) => v || '—' },
            {
              title: 'Company',
              dataIndex: 'companyId',
              ellipsis: true,
              render: (v) => v || '—'
            },
            {
              title: 'Detail',
              dataIndex: 'detail',
              ellipsis: true,
              render: (v) => (v ? JSON.stringify(v) : '—')
            }
          ]}
        />
        {!rows.length ? (
          <Typography.Paragraph type="secondary" style={{ padding: 16 }}>
            No audit entries yet. Actions from Configure / Settings / Data / Sync will appear here.
          </Typography.Paragraph>
        ) : null}
      </div>
    </div>
  )
}

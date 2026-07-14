import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import {
  bootstrapSync,
  deleteCompany,
  getCompanyOps,
  migrateCompany,
  reseedPermissions,
  unbindDevice
} from '../api/admin'
import type { CompanyOps } from '../types'

type Props = {
  companyId: string
  companyName: string
  token: string
  onDeleted: () => void
}

export default function CompanyOpsPanel({ companyId, companyName, token, onDeleted }: Props) {
  const [ops, setOps] = useState<CompanyOps | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      setOps(await getCompanyOps(token, companyId))
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token, companyId])

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key)
    try {
      await action()
      message.success(success)
      await load()
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  if (!ops && loading) {
    return <Typography.Text type="secondary">Loading ops…</Typography.Text>
  }
  if (!ops) return null

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="Database" size="small" loading={loading}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="DB name">{ops.database.dbName}</Descriptions.Item>
          <Descriptions.Item label="Host">
            {ops.database.dbHost || '—'}{ops.database.dbPort ? `:${ops.database.dbPort}` : ''}
          </Descriptions.Item>
          <Descriptions.Item label="Migration">
            {ops.migrations.upToDate ? (
              <Tag color="green">Up to date</Tag>
            ) : (
              <Tag color="orange">{ops.migrations.pending.length} pending</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Current">
            {ops.migrations.current || '—'}
          </Descriptions.Item>
        </Descriptions>
        {ops.migrations.pending.length > 0 && (
          <Alert
            style={{ marginTop: 12, marginBottom: 12 }}
            type="warning"
            showIcon
            message="Pending migrations"
            description={ops.migrations.pending.join(', ')}
          />
        )}
        <Button
          type="primary"
          loading={busy === 'migrate'}
          onClick={() =>
            run('migrate', () => migrateCompany(token, companyId), 'Migrations applied')
          }
        >
          Apply migrations
        </Button>
      </Card>

      <Card title="Permissions" size="small" loading={loading}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Control catalog">{ops.permissions.control}</Descriptions.Item>
          <Descriptions.Item label="Company catalog">{ops.permissions.company}</Descriptions.Item>
          <Descriptions.Item label="Status">
            {ops.permissions.inSync ? (
              <Tag color="green">In sync</Tag>
            ) : (
              <Tag color="orange">Out of sync</Tag>
            )}
          </Descriptions.Item>
        </Descriptions>
        <Button
          style={{ marginTop: 12 }}
          loading={busy === 'perms'}
          onClick={() =>
            run(
              'perms',
              () => reseedPermissions(token, companyId),
              'Permissions reseeding complete'
            )
          }
        >
          Reseed permissions from control
        </Button>
      </Card>

      <Card title="Sync" size="small" loading={loading}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Tables">
            {ops.sync.tablesReady ? <Tag color="green">Ready</Tag> : <Tag>Not initialized</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="Queue depth">{ops.sync.queueDepth}</Descriptions.Item>
          <Descriptions.Item label="Conflicts">{ops.sync.conflictCount}</Descriptions.Item>
        </Descriptions>
        <Button
          style={{ marginTop: 12 }}
          loading={busy === 'sync'}
          onClick={() =>
            run('sync', () => bootstrapSync(token, companyId), 'Sync bootstrap finished')
          }
        >
          Bootstrap sync
        </Button>
      </Card>

      <Card title="Devices" size="small" loading={loading}>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={ops.devices}
          locale={{ emptyText: 'No devices registered' }}
          columns={[
            { title: 'User', dataIndex: 'userEmail', render: (v) => v || '—' },
            { title: 'Device', dataIndex: 'deviceCode' },
            {
              title: 'Last sync',
              dataIndex: 'lastSyncAt',
              render: (v) => (v ? new Date(v).toLocaleString() : '—')
            },
            {
              title: '',
              width: 100,
              render: (_, row) => (
                <Button
                  size="small"
                  danger
                  loading={busy === `device-${row.id}`}
                  onClick={() =>
                    Modal.confirm({
                      title: 'Unbind device?',
                      content: 'User will need to sign in again on this device.',
                      okType: 'danger',
                      onOk: () =>
                        run(
                          `device-${row.id}`,
                          () => unbindDevice(token, companyId, row.id),
                          'Device unbound'
                        )
                    })
                  }
                >
                  Unbind
                </Button>
              )
            }
          ]}
        />
      </Card>

      <Card title="Danger zone" size="small">
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Permanently delete this company, its users, devices, and online database.
        </Typography.Paragraph>
        <Button danger onClick={() => { setConfirmName(''); setDeleteOpen(true) }}>
          Delete company
        </Button>
      </Card>

      <Modal
        title="Delete company"
        open={deleteOpen}
        okText="Delete forever"
        okButtonProps={{
          danger: true,
          disabled: confirmName.trim() !== companyName,
          loading: busy === 'delete'
        }}
        onCancel={() => setDeleteOpen(false)}
        onOk={async () => {
          setBusy('delete')
          try {
            await deleteCompany(token, companyId, confirmName)
            message.success('Company deleted')
            setDeleteOpen(false)
            onDeleted()
          } catch (err: any) {
            message.error(err.message)
          } finally {
            setBusy(null)
          }
        }}
      >
        <Typography.Paragraph>
          Type <Typography.Text code>{companyName}</Typography.Text> to confirm.
        </Typography.Paragraph>
        <Input
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={companyName}
        />
      </Modal>
    </Space>
  )
}

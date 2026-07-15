import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
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
  flushCompany,
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
  onChanged?: () => void
}

export default function CompanyOpsPanel({
  companyId,
  companyName,
  token,
  onDeleted,
  onChanged
}: Props) {
  const [ops, setOps] = useState<CompanyOps | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [flushOpen, setFlushOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [flushConfirmName, setFlushConfirmName] = useState('')

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
      onChanged?.()
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  if (!ops && loading) {
    return <Typography.Text type="secondary">Loading configure tools…</Typography.Text>
  }
  if (!ops) return null

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="madix-ops-grid">
        <div className="madix-ops-card" style={{ opacity: loading ? 0.7 : 1 }}>
          <h3>Database & migrations</h3>
          <p className="madix-ops-card__desc">
            Apply shared company schema migrations to this online database.
          </p>
          <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
            <Descriptions.Item label="DB">{ops.database.dbName}</Descriptions.Item>
            <Descriptions.Item label="Host">
              {ops.database.dbHost || '—'}
              {ops.database.dbPort ? `:${ops.database.dbPort}` : ''}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              {ops.migrations.upToDate ? (
                <Tag color="success">Up to date</Tag>
              ) : (
                <Tag color="warning">{ops.migrations.pending.length} pending</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Current">{ops.migrations.current || '—'}</Descriptions.Item>
          </Descriptions>
          {ops.migrations.pending.length > 0 && (
            <Alert
              style={{ marginBottom: 12 }}
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
        </div>

        <div className="madix-ops-card" style={{ opacity: loading ? 0.7 : 1 }}>
          <h3>Permissions</h3>
          <p className="madix-ops-card__desc">
            Push the control permission catalog into this company database.
          </p>
          <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
            <Descriptions.Item label="Control">{ops.permissions.control}</Descriptions.Item>
            <Descriptions.Item label="Company">{ops.permissions.company}</Descriptions.Item>
            <Descriptions.Item label="Status">
              {ops.permissions.inSync ? (
                <Tag color="success">In sync</Tag>
              ) : (
                <Tag color="warning">Out of sync</Tag>
              )}
            </Descriptions.Item>
          </Descriptions>
          <Button
            loading={busy === 'perms'}
            onClick={() =>
              run(
                'perms',
                () => reseedPermissions(token, companyId),
                'Permissions reseeding complete'
              )
            }
          >
            Reseed from control
          </Button>
        </div>

        <div className="madix-ops-card" style={{ opacity: loading ? 0.7 : 1 }}>
          <h3>Sync</h3>
          <p className="madix-ops-card__desc">
            Inspect queue health and re-enqueue existing rows when needed.
          </p>
          <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
            <Descriptions.Item label="Tables">
              {ops.sync.tablesReady ? <Tag color="success">Ready</Tag> : <Tag>Not initialized</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Queue depth">{ops.sync.queueDepth}</Descriptions.Item>
            <Descriptions.Item label="Conflicts">{ops.sync.conflictCount}</Descriptions.Item>
          </Descriptions>
          <Button
            loading={busy === 'sync'}
            onClick={() =>
              run('sync', () => bootstrapSync(token, companyId), 'Sync bootstrap finished')
            }
          >
            Bootstrap sync
          </Button>
        </div>

        <div className="madix-ops-card madix-danger-zone">
          <h3>Danger zone</h3>
          <p className="madix-ops-card__desc">
            Flush resets demo/operational data for a clean production start. Delete removes the
            company entirely.
          </p>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button
              danger
              block
              onClick={() => {
                setFlushConfirmName('')
                setFlushOpen(true)
              }}
            >
              Flush company data
            </Button>
            <Button
              danger
              block
              type="primary"
              onClick={() => {
                setConfirmName('')
                setDeleteOpen(true)
              }}
            >
              Delete company
            </Button>
          </Space>
        </div>
      </div>

      <div className="madix-panel">
        <div className="madix-panel__head">
          <h2 className="madix-panel__title">Devices ({ops.devices.length})</h2>
        </div>
        <Table
          rowKey="id"
          size="middle"
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
              width: 110,
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
      </div>

      <Modal
        title="Flush company data"
        open={flushOpen}
        okText="Flush database"
        okButtonProps={{
          danger: true,
          disabled: flushConfirmName.trim() !== companyName,
          loading: busy === 'flush'
        }}
        onCancel={() => setFlushOpen(false)}
        onOk={async () => {
          setBusy('flush')
          try {
            const result = await flushCompany(token, companyId, flushConfirmName)
            message.success(
              `Flushed. Snapshot ${result.snapshot?.filename || 'saved'}; devices unbound.`
            )
            setFlushOpen(false)
            await load()
            onChanged?.()
          } catch (err: any) {
            message.error(err.message)
          } finally {
            setBusy(null)
          }
        }}
      >
        <Typography.Paragraph>
          This drops the company database and recreates it empty. Control-plane logins stay
          intact. Branches, roles, and user profiles are reinserted with the same IDs. Sales,
          inventory, customers, and catalog are wiped. Sync starts clean. All POS devices are
          unbound and must sign in again.
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          A JSON snapshot is written first. If flush fails after the drop, the company stays in
          provisioning until repaired.
        </Typography.Paragraph>
        <Typography.Paragraph>
          Type <Typography.Text code>{companyName}</Typography.Text> to confirm.
        </Typography.Paragraph>
        <Input
          value={flushConfirmName}
          onChange={(e) => setFlushConfirmName(e.target.value)}
          placeholder={companyName}
        />
      </Modal>

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
    </div>
  )
}

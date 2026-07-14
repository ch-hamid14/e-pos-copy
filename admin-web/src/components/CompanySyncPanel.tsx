import { useEffect, useState } from 'react'
import { Button, Modal, Space, Table, Tabs, Tag, Typography, message } from 'antd'
import {
  applyConflictLoser,
  bootstrapSync,
  clearSyncQueue,
  deleteSyncQueueItem,
  dismissConflict,
  listConflicts,
  listSyncQueue
} from '../api/admin'
import type { SyncConflict, SyncQueueItem } from '../types'

type Props = { companyId: string; token: string }

export default function CompanySyncPanel({ companyId, token }: Props) {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [conflictTotal, setConflictTotal] = useState(0)
  const [queue, setQueue] = useState<SyncQueueItem[]>([])
  const [queueTotal, setQueueTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [inspect, setInspect] = useState<SyncConflict | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [c, q] = await Promise.all([
        listConflicts(token, companyId),
        listSyncQueue(token, companyId)
      ])
      setConflicts(c.conflicts)
      setConflictTotal(c.total)
      setQueue(q.items)
      setQueueTotal(q.total)
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token, companyId])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="madix-panel">
        <div className="madix-panel__head">
          <h2 className="madix-panel__title">Sync tools</h2>
          <Space>
            <Button
              loading={busy === 'boot'}
              onClick={async () => {
                setBusy('boot')
                try {
                  await bootstrapSync(token, companyId)
                  message.success('Bootstrap finished')
                  load()
                } catch (err: any) {
                  message.error(err.message)
                } finally {
                  setBusy(null)
                }
              }}
            >
              Bootstrap sync
            </Button>
            <Button onClick={load}>Refresh</Button>
          </Space>
        </div>
        <div className="madix-panel__body">
          <Typography.Text type="secondary">
            {conflictTotal} conflicts · {queueTotal} queue items
          </Typography.Text>
        </div>
      </div>

      <Tabs
        items={[
          {
            key: 'conflicts',
            label: `Conflicts (${conflictTotal})`,
            children: (
              <div className="madix-panel">
                <Table
                  loading={loading}
                  rowKey="id"
                  dataSource={conflicts}
                  pagination={false}
                  columns={[
                    { title: 'Table', dataIndex: 'table', width: 140 },
                    { title: 'Entity', dataIndex: 'entityId', ellipsis: true },
                    {
                      title: 'Winner',
                      dataIndex: 'winner',
                      width: 100,
                      render: (v) => <Tag>{v}</Tag>
                    },
                    {
                      title: 'When',
                      dataIndex: 'createdAt',
                      width: 170,
                      render: (v) => new Date(v).toLocaleString()
                    },
                    {
                      title: '',
                      width: 260,
                      render: (_, row) => (
                        <Space size={4}>
                          <Button size="small" onClick={() => setInspect(row)}>
                            Inspect
                          </Button>
                          <Button
                            size="small"
                            loading={busy === `apply-${row.id}`}
                            onClick={() =>
                              Modal.confirm({
                                title: 'Apply loser payload over current row?',
                                onOk: async () => {
                                  setBusy(`apply-${row.id}`)
                                  try {
                                    await applyConflictLoser(token, companyId, row.id)
                                    message.success('Loser applied')
                                    load()
                                  } catch (err: any) {
                                    message.error(err.message)
                                  } finally {
                                    setBusy(null)
                                  }
                                }
                              })
                            }
                          >
                            Apply loser
                          </Button>
                          <Button
                            size="small"
                            loading={busy === `dismiss-${row.id}`}
                            onClick={async () => {
                              setBusy(`dismiss-${row.id}`)
                              try {
                                await dismissConflict(token, companyId, row.id)
                                message.success('Dismissed')
                                load()
                              } catch (err: any) {
                                message.error(err.message)
                              } finally {
                                setBusy(null)
                              }
                            }}
                          >
                            Dismiss
                          </Button>
                        </Space>
                      )
                    }
                  ]}
                />
              </div>
            )
          },
          {
            key: 'queue',
            label: `Queue (${queueTotal})`,
            children: (
              <div className="madix-panel">
                <div className="madix-panel__head">
                  <h2 className="madix-panel__title">Authority sync queue</h2>
                  <Button
                    danger
                    onClick={() =>
                      Modal.confirm({
                        title: 'Clear entire sync queue?',
                        okType: 'danger',
                        onOk: async () => {
                          await clearSyncQueue(token, companyId)
                          message.success('Queue cleared')
                          load()
                        }
                      })
                    }
                  >
                    Clear queue
                  </Button>
                </div>
                <Table
                  loading={loading}
                  rowKey="id"
                  dataSource={queue}
                  pagination={false}
                  columns={[
                    { title: 'SNO', dataIndex: 'sno', width: 80 },
                    { title: 'Table', dataIndex: 'table', width: 140 },
                    { title: 'Event', dataIndex: 'event', width: 90 },
                    { title: 'Entity', dataIndex: 'entityId', ellipsis: true },
                    {
                      title: 'When',
                      dataIndex: 'createdAt',
                      width: 170,
                      render: (v) => new Date(v).toLocaleString()
                    },
                    {
                      title: '',
                      width: 90,
                      render: (_, row) => (
                        <Button
                          size="small"
                          danger
                          onClick={async () => {
                            await deleteSyncQueueItem(token, companyId, row.id)
                            message.success('Removed')
                            load()
                          }}
                        >
                          Remove
                        </Button>
                      )
                    }
                  ]}
                />
              </div>
            )
          }
        ]}
      />

      <Modal
        title="Conflict detail"
        open={!!inspect}
        onCancel={() => setInspect(null)}
        footer={<Button onClick={() => setInspect(null)}>Close</Button>}
        width={800}
      >
        {inspect && (
          <div className="madix-ops-grid">
            <div>
              <Typography.Text strong>Current row</Typography.Text>
              <pre style={{ fontSize: 11, maxHeight: 360, overflow: 'auto', background: '#f4f7fa', padding: 12 }}>
                {JSON.stringify(inspect.current, null, 2) || 'null'}
              </pre>
            </div>
            <div>
              <Typography.Text strong>Loser payload</Typography.Text>
              <pre style={{ fontSize: 11, maxHeight: 360, overflow: 'auto', background: '#f4f7fa', padding: 12 }}>
                {JSON.stringify(inspect.loserPayload, null, 2) || 'null'}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

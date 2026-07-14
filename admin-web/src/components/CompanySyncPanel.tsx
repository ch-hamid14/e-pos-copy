import { useEffect, useState } from 'react'
import { Alert, Button, Modal, Space, Table, Tabs, Tag, Typography, message } from 'antd'
import {
  applyConflictLoser,
  applyConflictLosers,
  bootstrapSync,
  clearSyncQueue,
  deleteSyncQueueItem,
  dismissConflict,
  dismissConflicts,
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
  const [selectedIds, setSelectedIds] = useState<string[]>([])

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
      setSelectedIds([])
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token, companyId])

  const selectedCount = selectedIds.length

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
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Conflicts are already auto-resolved (LWW)"
            description="Each row is a record of a losing write. The winner is already in the database. Dismiss clears the log. Apply loser overrides the current row with the rejected payload."
          />
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
                <div className="madix-panel__head">
                  <h2 className="madix-panel__title">
                    {selectedCount ? `${selectedCount} selected` : 'Conflict log'}
                  </h2>
                  <Space wrap>
                    <Button
                      disabled={!selectedCount}
                      loading={busy === 'bulk-dismiss'}
                      onClick={() =>
                        Modal.confirm({
                          title: `Dismiss ${selectedCount} selected conflicts?`,
                          content: 'Removes log entries only. Live data is unchanged.',
                          onOk: async () => {
                            setBusy('bulk-dismiss')
                            try {
                              const res = await dismissConflicts(token, companyId, selectedIds)
                              message.success(`Dismissed ${res.dismissed}`)
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
                      Dismiss selected
                    </Button>
                    <Button
                      disabled={!selectedCount}
                      loading={busy === 'bulk-apply'}
                      onClick={() =>
                        Modal.confirm({
                          title: `Apply loser for ${selectedCount} selected?`,
                          content:
                            'Overwrites current DB rows with rejected payloads, then clears those log entries.',
                          okType: 'danger',
                          onOk: async () => {
                            setBusy('bulk-apply')
                            try {
                              const res = await applyConflictLosers(token, companyId, selectedIds)
                              message.success(
                                `Applied ${res.applied}${res.failed.length ? `, ${res.failed.length} failed` : ''}`
                              )
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
                      Apply loser selected
                    </Button>
                    <Button
                      danger
                      disabled={!conflictTotal}
                      loading={busy === 'dismiss-all'}
                      onClick={() =>
                        Modal.confirm({
                          title: 'Dismiss all conflicts?',
                          content: 'Clears the entire conflict log for this company. Data stays as-is.',
                          okType: 'danger',
                          onOk: async () => {
                            setBusy('dismiss-all')
                            try {
                              const res = await dismissConflicts(token, companyId)
                              message.success(`Dismissed ${res.dismissed}`)
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
                      Dismiss all
                    </Button>
                  </Space>
                </div>
                <Table
                  loading={loading}
                  rowKey="id"
                  dataSource={conflicts}
                  pagination={false}
                  rowSelection={{
                    selectedRowKeys: selectedIds,
                    onChange: (keys) => setSelectedIds(keys as string[])
                  }}
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
              <Typography.Text strong>Current row (winner already applied)</Typography.Text>
              <pre style={{ fontSize: 11, maxHeight: 360, overflow: 'auto', background: '#f4f7fa', padding: 12 }}>
                {JSON.stringify(inspect.current, null, 2) || 'null'}
              </pre>
            </div>
            <div>
              <Typography.Text strong>Loser payload (rejected)</Typography.Text>
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

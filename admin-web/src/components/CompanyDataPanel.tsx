import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  message
} from 'antd'
import {
  browseData,
  hardDeleteDataRow,
  listDataTables,
  reconcileSaleFinances,
  restoreDataRow,
  softDeleteDataRow,
  updateDataRow
} from '../api/admin'
import type { DataBrowseResult } from '../types'

type Props = { companyId: string; token: string }

export default function CompanyDataPanel({ companyId, token }: Props) {
  const [tables, setTables] = useState<string[]>([])
  const [table, setTable] = useState<string>('products')
  const [search, setSearch] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<DataBrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    listDataTables(token).then((t) => {
      setTables(t)
      if (t.length && !t.includes(table)) setTable(t[0])
    })
  }, [token])

  const load = async () => {
    if (!table) return
    setLoading(true)
    try {
      setData(
        await browseData(token, companyId, table, {
          page,
          pageSize: 25,
          search: search || undefined,
          includeDeleted
        })
      )
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token, companyId, table, page, includeDeleted])

  const previewCols = useMemo(() => {
    if (!data?.columns?.length) return []
    const preferred = ['id', 'name', 'email', 'status', 'deleted_at', 'updated_at']
    const names = preferred.filter((n) => data.columns.some((c) => c.name === n))
    const extra = data.columns.map((c) => c.name).filter((n) => !names.includes(n)).slice(0, 4)
    return [...names, ...extra]
  }, [data])

  const editableColumns = data?.columns.filter((c) => !c.readonly) || []

  return (
    <div className="madix-panel">
      <div className="madix-panel__head">
        <h2 className="madix-panel__title">Data viewer</h2>
        <Space wrap>
          <Select
            style={{ width: 200 }}
            value={table}
            options={tables.map((t) => ({ value: t, label: t }))}
            onChange={(v) => {
              setTable(v)
              setPage(1)
            }}
          />
          <Input.Search
            placeholder="Search"
            allowClear
            style={{ width: 200 }}
            onSearch={() => {
              setPage(1)
              load()
            }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            type={includeDeleted ? 'primary' : 'default'}
            onClick={() => {
              setIncludeDeleted((v) => !v)
              setPage(1)
            }}
          >
            {includeDeleted ? 'Including deleted' : 'Hide deleted'}
          </Button>
          <Button onClick={load}>Refresh</Button>
        </Space>
      </div>
      <Table
        loading={loading}
        rowKey={(r) => String(r.id)}
        dataSource={data?.rows || []}
        pagination={{
          current: page,
          pageSize: 25,
          total: data?.total || 0,
          onChange: setPage,
          showSizeChanger: false
        }}
        scroll={{ x: true }}
        columns={[
          ...previewCols.map((name) => ({
            title: name,
            dataIndex: name,
            ellipsis: true,
            render: (v: unknown) => {
              if (v == null) return '—'
              if (typeof v === 'object') return JSON.stringify(v)
              return String(v)
            }
          })),
          {
            title: '',
            fixed: 'right' as const,
            width: table === 'sales' ? 330 : 220,
            render: (_: unknown, row: Record<string, unknown>) => (
              <Space size={4}>
                {table === 'sales' ? (
                  <Button
                    size="small"
                    type="primary"
                    loading={busy === `reconcile-${row.id}`}
                    onClick={() =>
                      Modal.confirm({
                        title: 'Reconcile sale finances?',
                        content:
                          'This recalculates totals from sale lines, sums all payments, fixes due amount, and appends ledger corrections. Any overpayment is preserved as customer credit.',
                        okText: 'Reconcile',
                        onOk: async () => {
                          setBusy(`reconcile-${row.id}`)
                          try {
                            const result = await reconcileSaleFinances(
                              token,
                              companyId,
                              String(row.id)
                            )
                            const credit =
                              result.excessCredit > 0
                                ? ` · Customer credit Rs ${result.excessCredit.toLocaleString()}`
                                : ''
                            message.success(
                              `Sale reconciled · Net Rs ${result.netTotal.toLocaleString()} · Paid Rs ${result.paidAmount.toLocaleString()}${credit}`
                            )
                            load()
                          } catch (e: any) {
                            message.error(e.message)
                            throw e
                          } finally {
                            setBusy(null)
                          }
                        }
                      })
                    }
                  >
                    Reconcile
                  </Button>
                ) : null}
                <Button
                  size="small"
                  onClick={() => {
                    setEditRow(row)
                    form.setFieldsValue(row)
                  }}
                >
                  Edit
                </Button>
                {row.deleted_at ? (
                  <Button
                    size="small"
                    loading={busy === `restore-${row.id}`}
                    onClick={async () => {
                      setBusy(`restore-${row.id}`)
                      try {
                        await restoreDataRow(token, companyId, table, String(row.id))
                        message.success('Restored')
                        load()
                      } catch (e: any) {
                        message.error(e.message)
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    Restore
                  </Button>
                ) : (
                  <Button
                    size="small"
                    loading={busy === `soft-${row.id}`}
                    onClick={async () => {
                      setBusy(`soft-${row.id}`)
                      try {
                        await softDeleteDataRow(token, companyId, table, String(row.id))
                        message.success('Soft deleted')
                        load()
                      } catch (e: any) {
                        message.error(e.message)
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    Soft delete
                  </Button>
                )}
                <Button
                  size="small"
                  danger
                  loading={busy === `hard-${row.id}`}
                  onClick={() =>
                    Modal.confirm({
                      title: 'Hard delete this row?',
                      okType: 'danger',
                      onOk: async () => {
                        setBusy(`hard-${row.id}`)
                        try {
                          await hardDeleteDataRow(token, companyId, table, String(row.id))
                          message.success('Deleted')
                          load()
                        } catch (e: any) {
                          message.error(e.message)
                          throw e
                        } finally {
                          setBusy(null)
                        }
                      }
                    })
                  }
                >
                  Delete
                </Button>
              </Space>
            )
          }
        ]}
      />

      <Modal
        title={`Edit ${table}`}
        open={!!editRow}
        onCancel={() => setEditRow(null)}
        footer={null}
        width={640}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            if (!editRow) return
            setBusy('save')
            try {
              await updateDataRow(token, companyId, table, String(editRow.id), values)
              message.success('Row updated')
              setEditRow(null)
              load()
            } catch (err: any) {
              message.error(err.message)
            } finally {
              setBusy(null)
            }
          }}
        >
          <div className="madix-form-grid">
            {editableColumns.map((col) => (
              <Form.Item key={col.name} name={col.name} label={col.name}>
                <Input />
              </Form.Item>
            ))}
          </div>
          <div className="madix-modal-actions">
            <Button onClick={() => setEditRow(null)} disabled={busy === 'save'}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={busy === 'save'}>
              Save
            </Button>
          </div>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
          System fields (id, hlc, origin_client_id, created_*) are read-only.
        </Typography.Paragraph>
      </Modal>
    </div>
  )
}

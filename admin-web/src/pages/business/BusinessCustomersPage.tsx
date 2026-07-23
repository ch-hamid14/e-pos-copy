import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { EditOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import { listBusinessCustomers, updateBusinessCustomer } from '../../api/admin'
import { useAuth } from '../../context/AuthContext'
import type { BusinessCustomerRow } from '../../types'
import { formatRs } from './format'

type Ctx = { companyId: string; companyName: string }

export default function BusinessCustomersPage() {
  const { token } = useAuth()
  const { companyId } = useOutletContext<Ctx>()
  const { id } = useParams()
  const navigate = useNavigate()
  const [rows, setRows] = useState<BusinessCustomerRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [dueFilter, setDueFilter] = useState<string>('all')
  const [visibility, setVisibility] = useState<'active' | 'include' | 'only'>('active')
  const [loading, setLoading] = useState(false)
  const [editRow, setEditRow] = useState<BusinessCustomerRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    if (!token || !companyId) return
    setLoading(true)
    try {
      const result = await listBusinessCustomers(token, companyId, {
        page,
        pageSize: 25,
        search: search || undefined,
        dueFilter: dueFilter === 'all' ? undefined : dueFilter,
        visibility
      })
      setRows(result.rows)
      setTotal(result.total)
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token, companyId, page, dueFilter, visibility])

  return (
    <div>
      <div className="madix-page-header">
        <div>
          <h1>Customers</h1>
          <p>Search, edit details, and inspect balances / ledger.</p>
        </div>
      </div>

      <div className="madix-panel">
        <div className="madix-panel__head">
          <h2 className="madix-panel__title">{total} customers</h2>
          <Space wrap>
            <Select
              value={visibility}
              onChange={(v) => {
                setPage(1)
                setVisibility(v)
              }}
              style={{ width: 170 }}
              options={[
                { value: 'active', label: 'Hide deleted' },
                { value: 'include', label: 'Include deleted' },
                { value: 'only', label: 'Only deleted' }
              ]}
            />
            <Select
              value={dueFilter}
              onChange={(v) => {
                setPage(1)
                setDueFilter(v)
              }}
              style={{ width: 140 }}
              options={[
                { value: 'all', label: 'All balances' },
                { value: 'due', label: 'Has due' },
                { value: 'credit', label: 'Has credit' },
                { value: 'clear', label: 'Cleared' }
              ]}
            />
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Name, phone, CNIC"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => {
                setPage(1)
                load()
              }}
              style={{ width: 240 }}
            />
            <Button
              onClick={() => {
                setPage(1)
                load()
              }}
            >
              Search
            </Button>
          </Space>
        </div>
        <Table<BusinessCustomerRow>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{
            current: page,
            pageSize: 25,
            total,
            onChange: setPage,
            showSizeChanger: false
          }}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Phone', dataIndex: 'phone', render: (v) => v || '—' },
            { title: 'CNIC', dataIndex: 'cnic', render: (v) => v || '—' },
            {
              title: 'Balance',
              dataIndex: 'balance',
              align: 'right',
              render: (v) => {
                const n = Number(v || 0)
                if (n > 0) return <Tag color="error">{formatRs(n)}</Tag>
                if (n < 0) return <Tag color="processing">{formatRs(n)}</Tag>
                return formatRs(0)
              }
            },
            {
              title: 'Status',
              width: 100,
              render: (_, r) =>
                r.deletedAt ? <Tag>Deleted</Tag> : <Tag color="success">Active</Tag>
            },
            {
              title: '',
              width: 160,
              render: (_, r) => (
                <Space size={4}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => navigate(`/companies/${id}/business/customers/${r.id}`)}
                  >
                    Open
                  </Button>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    disabled={Boolean(r.deletedAt)}
                    onClick={() => {
                      setEditRow(r)
                      form.setFieldsValue({
                        name: r.name,
                        phone: r.phone || '',
                        cnic: r.cnic || '',
                        address: r.address || ''
                      })
                    }}
                  >
                    Edit
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </div>

      <Modal
        title="Edit customer"
        open={!!editRow}
        okText="Save"
        okButtonProps={{ loading: saving }}
        onCancel={() => {
          setEditRow(null)
          form.resetFields()
        }}
        onOk={async () => {
          if (!token || !editRow) return
          try {
            const values = await form.validateFields()
            setSaving(true)
            await updateBusinessCustomer(token, companyId, editRow.id, values)
            message.success('Customer updated')
            setEditRow(null)
            form.resetFields()
            await load()
          } catch (err: any) {
            if (err?.errorFields) return
            message.error(err.message)
          } finally {
            setSaving(false)
          }
        }}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="cnic" label="CNIC">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

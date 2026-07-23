import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CloudSyncOutlined,
  ExportOutlined,
  PlusOutlined,
  SearchOutlined
} from '@ant-design/icons'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { createCompany, listCompanies, migrateAllCompanies } from '../api/admin'
import StatusTag from '../components/StatusTag'
import { useAuth } from '../context/AuthContext'
import type { Company, MigrateAllResult } from '../types'

export default function CompaniesPage() {
  const { token } = useAuth()
  const [data, setData] = useState<Company[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<MigrateAllResult | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [form] = Form.useForm()

  const load = () => {
    if (!token) return
    listCompanies(token).then(setData)
  }

  useEffect(() => {
    load()
  }, [token])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
      )
    })
  }, [data, query, statusFilter])

  const handleCreate = async (values: Record<string, string>) => {
    if (!token) return
    setLoading(true)
    try {
      await createCompany(token, values)
      message.success('Company created')
      setOpen(false)
      form.resetFields()
      load()
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMigrateAll = () => {
    if (!token) return
    Modal.confirm({
      title: 'Migrate all company databases?',
      content: 'Applies pending shared migrations to every active and inactive company database.',
      okText: 'Migrate all',
      onOk: async () => {
        setMigrating(true)
        try {
          const result = await migrateAllCompanies(token)
          setMigrateResult(result)
          message.success(`Done: ${result.succeeded}/${result.total} succeeded`)
        } catch (err: any) {
          message.error(err.message)
        } finally {
          setMigrating(false)
        }
      }
    })
  }

  return (
    <div>
      <div className="madix-page-header">
        <div>
          <h1>Companies</h1>
          <p>Provision tenants, inspect accounts, and run fleet migrations.</p>
        </div>
        <Space wrap>
          <Button icon={<CloudSyncOutlined />} loading={migrating} onClick={handleMigrateAll}>
            Migrate all DBs
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Add company
          </Button>
        </Space>
      </div>

      <div className="madix-panel">
        <div className="madix-panel__head">
          <h2 className="madix-panel__title">{filtered.length} companies</h2>
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search name, email, phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 240 }}
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 140 }}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'provisioning', label: 'Provisioning' }
              ]}
            />
          </Space>
        </div>
        <Table<Company>
          rowKey="id"
          dataSource={filtered}
          columns={[
            {
              title: 'Company',
              dataIndex: 'name',
              render: (name, row) => (
                <div>
                  <Link to={`/companies/${row.id}`} style={{ fontWeight: 600 }}>
                    {name}
                  </Link>
                  {row.dbName ? (
                    <div style={{ fontSize: 12, color: '#5b6b7c', fontFamily: 'monospace' }}>
                      {row.dbName}
                    </div>
                  ) : null}
                </div>
              )
            },
            { title: 'Email', dataIndex: 'email', render: (v) => v || '—' },
            { title: 'Phone', dataIndex: 'phone', render: (v) => v || '—' },
            { title: 'Branches', dataIndex: 'branchCount', width: 100 },
            { title: 'Users', dataIndex: 'userCount', width: 90 },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 120,
              render: (s) => <StatusTag status={s} />
            },
            {
              title: '',
              width: 200,
              render: (_, row) => (
                <Space size={8}>
                  <Link to={`/companies/${row.id}`}>Open</Link>
                  <Button
                    type="link"
                    size="small"
                    icon={<ExportOutlined />}
                    style={{ padding: 0 }}
                    onClick={() =>
                      window.open(`/companies/${row.id}/business/dashboard`, '_blank', 'noopener,noreferrer')
                    }
                  >
                    Business ops
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </div>

      <Modal
        title="Create company"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={640}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
          onFinish={handleCreate}
          initialValues={{ branchName: 'Main Branch' }}
        >
          <div className="madix-form-grid">
            <div className="madix-form-section">
              <p className="madix-form-section__title">Company</p>
            </div>
            <Form.Item className="madix-span-2" name="name" label="Company name" rules={[{ required: true }]}>
              <Input placeholder="Acme Retail" />
            </Form.Item>
            <Form.Item name="email" label="Email">
              <Input placeholder="ops@company.com" />
            </Form.Item>
            <Form.Item name="phone" label="Phone">
              <Input placeholder="+1 …" />
            </Form.Item>

            <div className="madix-form-section">
              <p className="madix-form-section__title">Main branch</p>
            </div>
            <Form.Item name="branchName" label="Branch name">
              <Input />
            </Form.Item>
            <Form.Item name="branchLocation" label="Location">
              <Input placeholder="City / address" />
            </Form.Item>

            <div className="madix-form-section">
              <p className="madix-form-section__title">Owner</p>
              <p className="madix-form-section__hint">Optional — can be added later</p>
            </div>
            <Form.Item name="ownerFirstName" label="First name">
              <Input />
            </Form.Item>
            <Form.Item name="ownerLastName" label="Last name">
              <Input />
            </Form.Item>
            <Form.Item name="ownerEmail" label="Email">
              <Input />
            </Form.Item>
            <Form.Item name="ownerPassword" label="Password">
              <Input.Password />
            </Form.Item>
          </div>
          <div className="madix-modal-actions">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              Create company
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Migration results"
        open={!!migrateResult}
        onCancel={() => setMigrateResult(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setMigrateResult(null)}>
            Close
          </Button>
        ]}
        width={720}
      >
        {migrateResult && (
          <>
            <Typography.Paragraph>
              {migrateResult.succeeded} succeeded, {migrateResult.failed} failed (of{' '}
              {migrateResult.total})
            </Typography.Paragraph>
            <Table
              rowKey="companyId"
              size="small"
              pagination={false}
              dataSource={migrateResult.results}
              columns={[
                { title: 'Company', dataIndex: 'name' },
                {
                  title: 'Result',
                  dataIndex: 'ok',
                  render: (ok) => (
                    <Tag color={ok ? 'success' : 'error'}>{ok ? 'OK' : 'Failed'}</Tag>
                  )
                },
                {
                  title: 'Applied',
                  dataIndex: 'applied',
                  render: (applied: string[]) => (applied.length ? applied.join(', ') : '—')
                },
                {
                  title: 'Error',
                  dataIndex: 'error',
                  render: (v) => v || '—'
                }
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Form, Input, Modal, Space, Table, Tag, Typography, message } from 'antd'
import { createCompany, listCompanies, migrateAllCompanies } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import type { Company, MigrateAllResult } from '../types'

export default function CompaniesPage() {
  const { token } = useAuth()
  const [data, setData] = useState<Company[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<MigrateAllResult | null>(null)
  const [form] = Form.useForm()

  const load = () => {
    if (!token) return
    listCompanies(token).then(setData)
  }

  useEffect(() => {
    load()
  }, [token])

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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          Companies
        </Typography.Title>
        <Space>
          <Button loading={migrating} onClick={handleMigrateAll}>
            Migrate all DBs
          </Button>
          <Button type="primary" onClick={() => setOpen(true)}>
            Add Company
          </Button>
        </Space>
      </div>
      <Table<Company>
        rowKey="id"
        dataSource={data}
        columns={[
          {
            title: 'Name',
            dataIndex: 'name',
            render: (name, row) => <Link to={`/companies/${row.id}`}>{name}</Link>
          },
          { title: 'Email', dataIndex: 'email' },
          { title: 'Phone', dataIndex: 'phone' },
          { title: 'Branches', dataIndex: 'branchCount' },
          { title: 'Users', dataIndex: 'userCount' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s) => <Tag color={s === 'active' ? 'green' : 'red'}>{s}</Tag>
          }
        ]}
      />
      <Modal title="Create Company" open={open} onCancel={() => setOpen(false)} footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Typography.Title level={5}>Company</Typography.Title>
          <Form.Item name="name" label="Company Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Company Email">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="branchName" label="Main Branch Name" initialValue="Main Branch">
            <Input />
          </Form.Item>
          <Form.Item name="branchLocation" label="Branch Location">
            <Input />
          </Form.Item>
          <Typography.Title level={5}>Company Owner (optional)</Typography.Title>
          <Form.Item name="ownerEmail" label="Owner Email">
            <Input />
          </Form.Item>
          <Form.Item name="ownerPassword" label="Owner Password">
            <Input.Password />
          </Form.Item>
          <Form.Item name="ownerFirstName" label="Owner First Name">
            <Input />
          </Form.Item>
          <Form.Item name="ownerLastName" label="Owner Last Name">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Create
          </Button>
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
              {migrateResult.succeeded} succeeded, {migrateResult.failed} failed (of {migrateResult.total})
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
                    <Tag color={ok ? 'green' : 'red'}>{ok ? 'OK' : 'Failed'}</Tag>
                  )
                },
                {
                  title: 'Applied',
                  dataIndex: 'applied',
                  render: (applied: string[]) =>
                    applied.length ? applied.join(', ') : '—'
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

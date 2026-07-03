import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Form, Input, Modal, Table, Tag, Typography, message } from 'antd'
import { createCompany, listCompanies } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import type { Company } from '../types'

export default function CompaniesPage() {
  const { token } = useAuth()
  const [data, setData] = useState<Company[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const load = () => {
    if (!token) return
    listCompanies(token).then(setData)
  }

  useEffect(() => { load() }, [token])

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>Companies</Typography.Title>
        <Button type="primary" onClick={() => setOpen(true)}>Add Company</Button>
      </div>
      <Table<Company>
        rowKey="id"
        dataSource={data}
        columns={[
          { title: 'Name', dataIndex: 'name', render: (name, row) => <Link to={`/companies/${row.id}`}>{name}</Link> },
          { title: 'Email', dataIndex: 'email' },
          { title: 'Phone', dataIndex: 'phone' },
          { title: 'Branches', dataIndex: 'branchCount' },
          { title: 'Users', dataIndex: 'userCount' },
          { title: 'Status', dataIndex: 'status', render: (s) => <Tag color={s === 'active' ? 'green' : 'red'}>{s}</Tag> }
        ]}
      />
      <Modal title="Create Company" open={open} onCancel={() => setOpen(false)} footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Typography.Title level={5}>Company</Typography.Title>
          <Form.Item name="name" label="Company Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Company Email"><Input /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
          <Form.Item name="branchName" label="Main Branch Name" initialValue="Main Branch">
            <Input />
          </Form.Item>
          <Form.Item name="branchLocation" label="Branch Location"><Input /></Form.Item>
          <Typography.Title level={5}>Company Owner (optional)</Typography.Title>
          <Form.Item name="ownerEmail" label="Owner Email"><Input /></Form.Item>
          <Form.Item name="ownerPassword" label="Owner Password"><Input.Password /></Form.Item>
          <Form.Item name="ownerFirstName" label="Owner First Name"><Input /></Form.Item>
          <Form.Item name="ownerLastName" label="Owner Last Name"><Input /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>Create</Button>
        </Form>
      </Modal>
    </div>
  )
}

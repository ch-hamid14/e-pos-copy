import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from 'antd'
import {
  createBranch,
  createRole,
  createUser,
  getCompany,
  updateCompany,
  updateRole
} from '../api/admin'
import CompanyOpsPanel from '../components/CompanyOpsPanel'
import { useAuth } from '../context/AuthContext'
import type { Branch, CompanyDetail, CompanyRole, CompanyUser, Permission } from '../types'

const USER_ROLES = [
  { value: 'company_owner', label: 'Company Owner' },
  { value: 'branch_admin', label: 'Branch Admin' },
  { value: 'staff', label: 'Staff' }
]

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { token } = useAuth()
  const [detail, setDetail] = useState<CompanyDetail | null>(null)
  const [branchOpen, setBranchOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const [editRole, setEditRole] = useState<CompanyRole | null>(null)
  const [branchForm] = Form.useForm()
  const [userForm] = Form.useForm()
  const [roleForm] = Form.useForm()
  const [companyForm] = Form.useForm()

  const load = () => {
    if (!token || !id) return
    getCompany(token, id)
      .then((d) => {
        setDetail(d)
        companyForm.setFieldsValue({
          name: d.company.name,
          email: d.company.email,
          phone: d.company.phone,
          status: d.company.status
        })
      })
      .catch((err: Error) => message.error(err.message))
  }

  useEffect(() => {
    load()
  }, [token, id])

  const saveCompany = async (values: Record<string, string>) => {
    if (!token || !id) return
    try {
      await updateCompany(token, id, values)
      message.success('Company updated')
      load()
    } catch (err: any) {
      message.error(err.message)
    }
  }

  if (!detail) return null

  return (
    <div>
      <Typography.Title level={2}>{detail.company.name}</Typography.Title>
      <Card style={{ marginBottom: 16 }}>
        <Form form={companyForm} layout="inline" onFinish={saveCompany}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
          <Form.Item name="status" label="Status">
            <Select
              style={{ width: 120 }}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' }
              ]}
            />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit">Save</Button></Form.Item>
        </Form>
      </Card>

      <Tabs
        items={[
          {
            key: 'branches',
            label: 'Branches',
            children: (
              <>
                <Button type="primary" style={{ marginBottom: 12 }} onClick={() => setBranchOpen(true)}>
                  Add Branch
                </Button>
                <Table<Branch>
                  rowKey="id"
                  dataSource={detail.branches}
                  columns={[
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Location', dataIndex: 'location' },
                    {
                      title: 'Status',
                      dataIndex: 'isActive',
                      render: (v) => (
                        <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>
                      )
                    }
                  ]}
                />
              </>
            )
          },
          {
            key: 'users',
            label: 'Users',
            children: (
              <>
                <Button type="primary" style={{ marginBottom: 12 }} onClick={() => setUserOpen(true)}>
                  Add User
                </Button>
                <Table<CompanyUser>
                  rowKey="id"
                  dataSource={detail.users}
                  columns={[
                    { title: 'Name', render: (_, r) => `${r.firstName} ${r.lastName}` },
                    { title: 'Email', dataIndex: 'email' },
                    { title: 'Role', dataIndex: 'role' },
                    {
                      title: 'RBAC Roles',
                      render: (_, r) => r.roles?.map((x) => <Tag key={x.id}>{x.name}</Tag>)
                    },
                    {
                      title: 'Email Verified',
                      dataIndex: 'emailVerified',
                      render: (v) => (
                        <Tag color={v ? 'green' : 'orange'}>{v ? 'Yes' : 'Pending'}</Tag>
                      )
                    }
                  ]}
                />
              </>
            )
          },
          {
            key: 'roles',
            label: 'Roles',
            children: (
              <>
                <Button
                  type="primary"
                  style={{ marginBottom: 12 }}
                  onClick={() => {
                    setEditRole(null)
                    roleForm.resetFields()
                    setRoleOpen(true)
                  }}
                >
                  Add Role
                </Button>
                <Table<CompanyRole>
                  rowKey="id"
                  dataSource={detail.roles}
                  columns={[
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Description', dataIndex: 'description' },
                    {
                      title: 'Permissions',
                      render: (_, r) => r.permissionKeys?.map((k) => <Tag key={k}>{k}</Tag>)
                    },
                    {
                      title: 'Actions',
                      render: (_, r) => (
                        <Button
                          size="small"
                          onClick={() => {
                            setEditRole(r)
                            roleForm.setFieldsValue({
                              name: r.name,
                              description: r.description,
                              permissionKeys: r.permissionKeys
                            })
                            setRoleOpen(true)
                          }}
                        >
                          Edit
                        </Button>
                      )
                    }
                  ]}
                />
              </>
            )
          },
          {
            key: 'ops',
            label: 'Configure',
            children:
              token && id ? (
                <CompanyOpsPanel
                  companyId={id}
                  companyName={detail.company.name}
                  token={token}
                  onDeleted={() => navigate('/companies')}
                />
              ) : null
          }
        ]}
      />

      <Modal title="Add Branch" open={branchOpen} onCancel={() => setBranchOpen(false)} footer={null}>
        <Form
          form={branchForm}
          layout="vertical"
          onFinish={async (values) => {
            if (!token || !id) return
            await createBranch(token, id, values)
            message.success('Branch created')
            setBranchOpen(false)
            branchForm.resetFields()
            load()
          }}
        >
          <Form.Item name="name" label="Branch Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="location" label="Location">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Add
          </Button>
        </Form>
      </Modal>

      <Modal title="Add User" open={userOpen} onCancel={() => setUserOpen(false)} footer={null} width={520}>
        <Form
          form={userForm}
          layout="vertical"
          onFinish={async (values) => {
            if (!token || !id) return
            await createUser(token, id, values)
            message.success('User created — they must verify email on first POS login')
            setUserOpen(false)
            userForm.resetFields()
            load()
          }}
        >
          <Form.Item name="firstName" label="First Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="lastName" label="Last Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={USER_ROLES} />
          </Form.Item>
          <Form.Item name="branchId" label="Branch">
            <Select allowClear options={detail.branches.map((b) => ({ value: b.id, label: b.name }))} />
          </Form.Item>
          <Form.Item name="roleIds" label="RBAC Roles">
            <Select mode="multiple" options={detail.roles.map((r) => ({ value: r.id, label: r.name }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Create User
          </Button>
        </Form>
      </Modal>

      <Modal
        title={editRole ? 'Edit Role' : 'Add Role'}
        open={roleOpen}
        onCancel={() => setRoleOpen(false)}
        footer={null}
        width={520}
      >
        <Form
          form={roleForm}
          layout="vertical"
          onFinish={async (values) => {
            if (!token || !id) return
            if (editRole) {
              await updateRole(token, editRole.id, { ...values, companyId: id })
              message.success('Role updated')
            } else {
              await createRole(token, id, values)
              message.success('Role created')
            }
            setRoleOpen(false)
            roleForm.resetFields()
            setEditRole(null)
            load()
          }}
        >
          <Form.Item name="name" label="Role Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="permissionKeys" label="Permissions" rules={[{ required: true }]}>
            <Checkbox.Group
              options={detail.permissions.map((p: Permission) => ({ label: p.label, value: p.key }))}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            {editRole ? 'Update' : 'Create'}
          </Button>
        </Form>
      </Modal>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftOutlined,
  BranchesOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ToolOutlined
} from '@ant-design/icons'
import {
  Button,
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
  getCompanyOps,
  updateCompany,
  updateRole,
  updateUser
} from '../api/admin'
import CompanyOpsPanel from '../components/CompanyOpsPanel'
import StatusTag from '../components/StatusTag'
import { useAuth } from '../context/AuthContext'
import type {
  Branch,
  CompanyDetail,
  CompanyOps,
  CompanyRole,
  CompanyUser,
  Permission
} from '../types'

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
  const [ops, setOps] = useState<CompanyOps | null>(null)
  const [tab, setTab] = useState('overview')
  const [branchOpen, setBranchOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [editUser, setEditUser] = useState<CompanyUser | null>(null)
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

    getCompanyOps(token, id)
      .then(setOps)
      .catch(() => setOps(null))
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

  if (!detail) {
    return (
      <Typography.Text type="secondary">Loading company…</Typography.Text>
    )
  }

  const company = detail.company

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link to="/companies" style={{ color: '#5b6b7c', fontSize: 13 }}>
          <ArrowLeftOutlined /> Companies
        </Link>
      </div>

      <div className="madix-company-hero">
        <div className="madix-company-hero__top">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1>{company.name}</h1>
              <StatusTag status={company.status} />
            </div>
            <div className="madix-company-hero__meta">
              <span>{company.email || 'No email'}</span>
              <span>{company.phone || 'No phone'}</span>
              {company.dbName ? <span style={{ fontFamily: 'monospace' }}>{company.dbName}</span> : null}
            </div>
          </div>
          <Button onClick={() => setTab('configure')} icon={<ToolOutlined />}>
            Open configure
          </Button>
        </div>
        <div className="madix-company-hero__stats">
          <div className="madix-company-hero__stat">
            <span>Branches</span>
            <strong>{detail.branches.length}</strong>
          </div>
          <div className="madix-company-hero__stat">
            <span>Users</span>
            <strong>{detail.users.length}</strong>
          </div>
          <div className="madix-company-hero__stat">
            <span>Roles</span>
            <strong>{detail.roles.length}</strong>
          </div>
          <div className="madix-company-hero__stat">
            <span>Migrations</span>
            <strong style={{ fontSize: 16 }}>
              {ops
                ? ops.migrations.upToDate
                  ? 'Current'
                  : `${ops.migrations.pending.length} pending`
                : '—'}
            </strong>
          </div>
        </div>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'overview',
            label: 'Overview',
            children: (
              <div style={{ display: 'grid', gap: 16 }}>
                <div className="madix-ops-grid">
                  <div className="madix-ops-card">
                    <h3>Schema</h3>
                    <p className="madix-ops-card__desc">
                      Shared company migrations vs this tenant database.
                    </p>
                    {ops ? (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          {ops.migrations.upToDate ? (
                            <Tag color="success">Up to date</Tag>
                          ) : (
                            <Tag color="warning">{ops.migrations.pending.length} pending</Tag>
                          )}
                        </div>
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                          Current: {ops.migrations.current || 'none'}
                        </Typography.Text>
                        <Button type="link" style={{ padding: 0 }} onClick={() => setTab('configure')}>
                          Manage migrations →
                        </Button>
                      </>
                    ) : (
                      <Typography.Text type="secondary">Unable to load ops status</Typography.Text>
                    )}
                  </div>

                  <div className="madix-ops-card">
                    <h3>Sync</h3>
                    <p className="madix-ops-card__desc">Queue depth and conflict state for this tenant.</p>
                    {ops ? (
                      <>
                        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                          <div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>Queue</Typography.Text>
                            <div style={{ fontFamily: 'var(--madix-display)', fontSize: 22, fontWeight: 700 }}>
                              {ops.sync.queueDepth}
                            </div>
                          </div>
                          <div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>Conflicts</Typography.Text>
                            <div style={{ fontFamily: 'var(--madix-display)', fontSize: 22, fontWeight: 700 }}>
                              {ops.sync.conflictCount}
                            </div>
                          </div>
                          <div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>Devices</Typography.Text>
                            <div style={{ fontFamily: 'var(--madix-display)', fontSize: 22, fontWeight: 700 }}>
                              {ops.devices.length}
                            </div>
                          </div>
                        </div>
                        <Button type="link" style={{ padding: 0 }} onClick={() => setTab('configure')}>
                          Open sync tools →
                        </Button>
                      </>
                    ) : (
                      <Typography.Text type="secondary">Unable to load sync status</Typography.Text>
                    )}
                  </div>

                  <div className="madix-ops-card">
                    <h3>Permissions</h3>
                    <p className="madix-ops-card__desc">Control catalog compared to company copy.</p>
                    {ops ? (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          {ops.permissions.inSync ? (
                            <Tag color="success">In sync ({ops.permissions.company})</Tag>
                          ) : (
                            <Tag color="warning">
                              Control {ops.permissions.control} / Company {ops.permissions.company}
                            </Tag>
                          )}
                        </div>
                        <Button type="link" style={{ padding: 0 }} onClick={() => setTab('configure')}>
                          Reseed permissions →
                        </Button>
                      </>
                    ) : (
                      <Typography.Text type="secondary">Unable to load permission status</Typography.Text>
                    )}
                  </div>

                  <div className="madix-ops-card">
                    <h3>Profile</h3>
                    <p className="madix-ops-card__desc">Update tenant identity and access status.</p>
                    <Form form={companyForm} layout="vertical" onFinish={saveCompany} style={{ marginTop: 4 }}>
                      <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="email" label="Email">
                        <Input />
                      </Form.Item>
                      <Form.Item name="phone" label="Phone">
                        <Input />
                      </Form.Item>
                      <Form.Item name="status" label="Status">
                        <Select
                          options={[
                            { value: 'active', label: 'Active' },
                            { value: 'inactive', label: 'Inactive' }
                          ]}
                        />
                      </Form.Item>
                      <Button type="primary" htmlType="submit">
                        Save profile
                      </Button>
                    </Form>
                  </div>
                </div>
              </div>
            )
          },
          {
            key: 'branches',
            label: (
              <span>
                <BranchesOutlined /> Branches
              </span>
            ),
            children: (
              <div className="madix-panel">
                <div className="madix-panel__head">
                  <h2 className="madix-panel__title">Branches</h2>
                  <Button type="primary" onClick={() => setBranchOpen(true)}>
                    Add branch
                  </Button>
                </div>
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
                        <Tag color={v ? 'success' : 'default'}>{v ? 'Active' : 'Inactive'}</Tag>
                      )
                    }
                  ]}
                />
              </div>
            )
          },
          {
            key: 'users',
            label: (
              <span>
                <TeamOutlined /> Users
              </span>
            ),
            children: (
              <div className="madix-panel">
                <div className="madix-panel__head">
                  <h2 className="madix-panel__title">Users</h2>
                  <Button
                    type="primary"
                    onClick={() => {
                      setEditUser(null)
                      userForm.resetFields()
                      setUserOpen(true)
                    }}
                  >
                    Add user
                  </Button>
                </div>
                <Table<CompanyUser>
                  rowKey="id"
                  dataSource={detail.users}
                  columns={[
                    {
                      title: 'Name',
                      render: (_, r) => `${r.firstName} ${r.lastName}`
                    },
                    { title: 'Email', dataIndex: 'email' },
                    { title: 'Role', dataIndex: 'role' },
                    {
                      title: 'RBAC',
                      render: (_, r) => r.roles?.map((x) => <Tag key={x.id}>{x.name}</Tag>)
                    },
                    {
                      title: 'Verified',
                      dataIndex: 'emailVerified',
                      render: (v) => (
                        <Tag color={v ? 'success' : 'warning'}>{v ? 'Verified' : 'Pending'}</Tag>
                      )
                    },
                    {
                      title: 'Status',
                      dataIndex: 'isActive',
                      width: 100,
                      render: (v) => (
                        <Tag color={v ? 'success' : 'default'}>{v ? 'Active' : 'Inactive'}</Tag>
                      )
                    },
                    {
                      title: '',
                      width: 90,
                      render: (_, r) => (
                        <Button
                          size="small"
                          onClick={() => {
                            setEditUser(r)
                            userForm.setFieldsValue({
                              firstName: r.firstName,
                              lastName: r.lastName,
                              email: r.email,
                              role: r.role,
                              branchId: r.branchId || undefined,
                              roleIds: r.roles?.map((x) => x.id) || [],
                              isActive: r.isActive,
                              password: undefined
                            })
                            setUserOpen(true)
                          }}
                        >
                          Edit
                        </Button>
                      )
                    }
                  ]}
                />
              </div>
            )
          },
          {
            key: 'roles',
            label: (
              <span>
                <SafetyCertificateOutlined /> Roles
              </span>
            ),
            children: (
              <div className="madix-panel">
                <div className="madix-panel__head">
                  <h2 className="madix-panel__title">Roles</h2>
                  <Button
                    type="primary"
                    onClick={() => {
                      setEditRole(null)
                      roleForm.resetFields()
                      setRoleOpen(true)
                    }}
                  >
                    Add role
                  </Button>
                </div>
                <Table<CompanyRole>
                  rowKey="id"
                  dataSource={detail.roles}
                  columns={[
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Description', dataIndex: 'description' },
                    {
                      title: 'Permissions',
                      render: (_, r) =>
                        r.permissionKeys?.slice(0, 6).map((k) => <Tag key={k}>{k}</Tag>)
                    },
                    {
                      title: '',
                      width: 90,
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
              </div>
            )
          },
          {
            key: 'configure',
            label: (
              <span>
                <ToolOutlined /> Configure
              </span>
            ),
            children:
              token && id ? (
                <CompanyOpsPanel
                  companyId={id}
                  companyName={detail.company.name}
                  token={token}
                  onDeleted={() => navigate('/companies')}
                  onChanged={load}
                />
              ) : null
          }
        ]}
      />

      <Modal
        title="Add branch"
        open={branchOpen}
        onCancel={() => setBranchOpen(false)}
        footer={null}
        width={480}
        destroyOnClose
      >
        <Form
          form={branchForm}
          layout="vertical"
          requiredMark="optional"
          onFinish={async (values) => {
            if (!token || !id) return
            try {
              await createBranch(token, id, values)
              message.success('Branch created')
              setBranchOpen(false)
              branchForm.resetFields()
              load()
            } catch (err: any) {
              message.error(err.message)
            }
          }}
        >
          <div className="madix-form-grid">
            <Form.Item
              className="madix-span-2"
              name="name"
              label="Branch name"
              rules={[{ required: true }]}
            >
              <Input placeholder="Main Branch" />
            </Form.Item>
            <Form.Item className="madix-span-2" name="location" label="Location">
              <Input placeholder="City / address" />
            </Form.Item>
          </div>
          <div className="madix-modal-actions">
            <Button onClick={() => setBranchOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit">
              Add branch
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={editUser ? 'Edit user' : 'Add user'}
        open={userOpen}
        onCancel={() => {
          setUserOpen(false)
          setEditUser(null)
          userForm.resetFields()
        }}
        footer={null}
        width={560}
        destroyOnClose
      >
        <Form
          form={userForm}
          layout="vertical"
          requiredMark="optional"
          onFinish={async (values) => {
            if (!token || !id) return
            try {
              if (editUser) {
                await updateUser(token, editUser.id, {
                  firstName: values.firstName,
                  lastName: values.lastName,
                  role: values.role,
                  branchId: values.branchId || null,
                  roleIds: values.roleIds || [],
                  isActive: values.isActive,
                  ...(values.password ? { password: values.password } : {})
                })
                message.success('User updated')
              } else {
                await createUser(token, id, values)
                message.success('User created — they must verify email on first POS login')
              }
              setUserOpen(false)
              setEditUser(null)
              userForm.resetFields()
              load()
            } catch (err: any) {
              message.error(err.message)
            }
          }}
        >
          <div className="madix-form-grid">
            <div className="madix-form-section">
              <p className="madix-form-section__title">Identity</p>
            </div>
            <Form.Item name="firstName" label="First name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="lastName" label="Last name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
              <Input disabled={!!editUser} />
            </Form.Item>
            <Form.Item
              name="password"
              label={editUser ? 'New password' : 'Password'}
              rules={editUser ? [{ min: 6 }] : [{ required: true, min: 6 }]}
              extra={editUser ? 'Leave blank to keep current password' : undefined}
            >
              <Input.Password />
            </Form.Item>

            <div className="madix-form-section">
              <p className="madix-form-section__title">Access</p>
            </div>
            <Form.Item name="role" label="Role" rules={[{ required: true }]}>
              <Select options={USER_ROLES} />
            </Form.Item>
            <Form.Item name="branchId" label="Branch">
              <Select
                allowClear
                placeholder="Optional"
                options={detail.branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </Form.Item>
            <Form.Item className="madix-span-2" name="roleIds" label="RBAC roles">
              <Select
                mode="multiple"
                placeholder="Assign roles"
                options={detail.roles.map((r) => ({ value: r.id, label: r.name }))}
              />
            </Form.Item>
            {editUser ? (
              <Form.Item name="isActive" label="Status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: true, label: 'Active' },
                    { value: false, label: 'Inactive' }
                  ]}
                />
              </Form.Item>
            ) : null}
          </div>
          <div className="madix-modal-actions">
            <Button
              onClick={() => {
                setUserOpen(false)
                setEditUser(null)
                userForm.resetFields()
              }}
            >
              Cancel
            </Button>
            <Button type="primary" htmlType="submit">
              {editUser ? 'Save changes' : 'Create user'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={editRole ? 'Edit role' : 'Add role'}
        open={roleOpen}
        onCancel={() => {
          setRoleOpen(false)
          setEditRole(null)
          roleForm.resetFields()
        }}
        footer={null}
        width={620}
        destroyOnClose
      >
        <Form
          form={roleForm}
          layout="vertical"
          requiredMark="optional"
          onFinish={async (values) => {
            if (!token || !id) return
            try {
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
            } catch (err: any) {
              message.error(err.message)
            }
          }}
        >
          <div className="madix-form-grid">
            <Form.Item name="name" label="Role name" rules={[{ required: true }]}>
              <Input placeholder="e.g. Cashier" />
            </Form.Item>
            <Form.Item name="description" label="Description">
              <Input placeholder="Short summary" />
            </Form.Item>
            <Form.Item
              className="madix-span-2"
              name="permissionKeys"
              label="Permissions"
              rules={[{ required: true, message: 'Select at least one permission' }]}
            >
              <Checkbox.Group
                className="madix-perm-grid"
                options={detail.permissions.map((p: Permission) => ({
                  label: p.label,
                  value: p.key
                }))}
              />
            </Form.Item>
          </div>
          <div className="madix-modal-actions">
            <Button
              onClick={() => {
                setRoleOpen(false)
                setEditRole(null)
                roleForm.resetFields()
              }}
            >
              Cancel
            </Button>
            <Button type="primary" htmlType="submit">
              {editRole ? 'Save changes' : 'Create role'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

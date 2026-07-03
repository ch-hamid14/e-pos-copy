import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Statistic, Table, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { SessionAudit } from '@/renderer/services/session-audit'
import { PageHeader } from '../shared/page-ui'
import { useSession } from '@/renderer/hooks/useSession'

const { Text } = Typography

type SetupAPI = {
  list: (companyId: string, search?: string) => Promise<any[]>
  create: (companyId: string, audit: SessionAudit, data: { name: string }) => Promise<unknown>
  update: (id: string, companyId: string, audit: SessionAudit, data: { name: string }) => Promise<unknown>
  remove: (id: string, companyId: string, audit: SessionAudit) => Promise<unknown>
}

type SetupCrudProps = {
  title: string
  subtitle: string
  companyId: string
  audit: SessionAudit
  api: SetupAPI
  searchPlaceholder?: string
}

export const SetupCrud = ({
  title,
  subtitle,
  companyId,
  audit,
  api,
  searchPlaceholder = 'Search by name…'
}: SetupCrudProps) => {
  const [data, setData] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [form] = Form.useForm()

  const singular = title.endsWith('ies') ? title.slice(0, -3) + 'y' : title.endsWith('s') ? title.slice(0, -1) : title

  const load = () => api.list(companyId, search || undefined).then(setData)

  useEffect(() => {
    if (companyId) load()
  }, [companyId, search])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }

  const openEdit = (record: any) => {
    setEditing(record)
    form.setFieldsValue({ name: record.name })
    setOpen(true)
  }

  const handleSubmit = async (values: { name: string }) => {
    setLoading(true)
    try {
      if (editing) {
        await api.update(editing.id, companyId, audit, values)
        message.success(`${singular} updated`)
      } else {
        await api.create(companyId, audit, values)
        message.success(`${singular} created`)
      }
      setOpen(false)
      form.resetFields()
      setEditing(null)
      load()
    } catch (err: any) {
      message.error(err.message || 'Operation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.remove(id, companyId, audit)
      message.success(`${singular} deleted`)
      load()
    } catch (err: any) {
      message.error(err.message || 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add {singular}
          </Button>
        }
      />

      <Card bordered={false} className="shadow-sm mb-4">
        <Space className="w-full justify-between" wrap>
          <Input.Search
            placeholder={searchPlaceholder}
            allowClear
            onSearch={setSearch}
            style={{ maxWidth: 320 }}
          />
          <Statistic title="Total" value={data.length} />
        </Space>
      </Card>

      <Card bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          dataSource={data}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name' },
            {
              title: 'Actions',
              key: 'actions',
              width: 180,
              render: (_: unknown, record: any) => (
                <Space>
                  <Button size="small" onClick={() => openEdit(record)}>
                    Edit
                  </Button>
                  <Popconfirm title={`Delete this ${singular.toLowerCase()}?`} onConfirm={() => handleDelete(record.id)}>
                    <Button size="small" danger>
                      Delete
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Modal
        title={editing ? `Edit ${singular}` : `Add ${singular}`}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input />
          </Form.Item>
          <Space className="w-full justify-end">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              Save
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

export function SetupCrudPage(props: Omit<SetupCrudProps, 'audit'>) {
  const { audit, deviceId } = useSession()
  if (!deviceId) return <Text type="danger">Device not registered.</Text>
  return <SetupCrud {...props} audit={audit()} />
}

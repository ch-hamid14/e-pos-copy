import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import { LockOutlined, PlusOutlined } from '@ant-design/icons'
import { taxAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { PageHeader } from '../shared/page-ui'

const { Text } = Typography

type TaxRow = {
  id: string
  name: string
  code?: string | null
  defaultPercent: number
  inclusiveDefault: boolean
  isSystem: boolean
  sortOrder?: number
}

export const Taxes = () => {
  const { companyId, audit } = useSession()
  const [data, setData] = useState<TaxRow[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TaxRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [form] = Form.useForm()

  const load = () => {
    if (!companyId) return
    setLoading(true)
    taxAPI
      .list(companyId, search || undefined)
      .then((rows) => setData((rows as TaxRow[]) || []))
      .catch((err: any) => message.error(err.message || 'Failed to load taxes'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [companyId, search])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ defaultPercent: 0, inclusiveDefault: false })
    setOpen(true)
  }

  const openEdit = (record: TaxRow) => {
    setEditing(record)
    form.setFieldsValue({
      name: record.name,
      defaultPercent: Number(record.defaultPercent || 0),
      inclusiveDefault: Boolean(record.inclusiveDefault)
    })
    setOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        await taxAPI.update(editing.id, companyId, audit(), {
          ...(editing.isSystem ? {} : { name: values.name }),
          defaultPercent: Number(values.defaultPercent || 0),
          ...(editing.isSystem ? {} : { inclusiveDefault: Boolean(values.inclusiveDefault) })
        })
        message.success('Tax updated')
      } else {
        await taxAPI.create(companyId, audit(), {
          name: values.name,
          defaultPercent: Number(values.defaultPercent || 0),
          inclusiveDefault: Boolean(values.inclusiveDefault)
        })
        message.success('Tax created')
      }
      setOpen(false)
      setEditing(null)
      load()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await taxAPI.remove(id, companyId, audit())
      message.success('Tax deleted')
      load()
    } catch (err: any) {
      message.error(err.message || 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Taxes"
        subtitle="System Sale Tax and Tax u/s 236 G/H are locked. Add custom taxes with their own inclusive default."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Tax
          </Button>
        }
      />

      <Card bordered={false} className="shadow-sm">
        <div className="mb-4">
          <Input.Search
            placeholder="Search tax…"
            allowClear
            onSearch={setSearch}
            style={{ width: 280 }}
          />
        </div>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} taxes` }}
          columns={[
            {
              title: 'Name',
              dataIndex: 'name',
              render: (v, r) => (
                <Space>
                  <Text strong>{v}</Text>
                  {r.isSystem && (
                    <Tag icon={<LockOutlined />} color="blue">
                      System
                    </Tag>
                  )}
                </Space>
              )
            },
            {
              title: 'Default %',
              dataIndex: 'defaultPercent',
              align: 'right' as const,
              render: (v) => Number(v || 0)
            },
            {
              title: 'Inclusive default',
              dataIndex: 'inclusiveDefault',
              render: (v, r) =>
                r.isSystem ? (
                  <Text type="secondary">Sale-line toggle</Text>
                ) : v ? (
                  'Yes'
                ) : (
                  'No'
                )
            },
            {
              title: 'Actions',
              width: 160,
              render: (_, record) => (
                <Space>
                  <Button type="link" size="small" onClick={() => openEdit(record)}>
                    Edit
                  </Button>
                  {!record.isSystem && (
                    <Popconfirm title="Delete this tax?" onConfirm={() => handleDelete(record.id)}>
                      <Button type="link" size="small" danger>
                        Delete
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Modal
        title={editing ? (editing.isSystem ? 'Edit system tax' : 'Edit tax') : 'Add tax'}
        open={open}
        onCancel={() => {
          setOpen(false)
          setEditing(null)
        }}
        onOk={handleSave}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-2">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Enter tax name' }]}
          >
            <Input disabled={Boolean(editing?.isSystem)} placeholder="e.g. Further Tax" />
          </Form.Item>
          <Form.Item
            name="defaultPercent"
            label="Default %"
            rules={[{ required: true, message: 'Enter default percent' }]}
          >
            <InputNumber className="w-full" min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          {!editing?.isSystem && (
            <Form.Item
              name="inclusiveDefault"
              label="Inclusive by default"
              valuePropName="checked"
              tooltip="When applied on a sale line, this tax is extracted from the entered price (with other inclusive taxes)."
            >
              <Switch />
            </Form.Item>
          )}
          {editing?.isSystem && (
            <Text type="secondary" className="text-sm">
              Inclusive for Sale Tax and Tax u/s 236 G/H is controlled by the Tax Inclusive switch on
              each sale line.
            </Text>
          )}
        </Form>
      </Modal>
    </div>
  )
}

export default Taxes

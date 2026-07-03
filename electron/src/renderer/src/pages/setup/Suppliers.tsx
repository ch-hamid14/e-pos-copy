import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Statistic, Table, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { supplierAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { PageHeader } from '../shared/page-ui'

const { Text } = Typography

export const Suppliers = () => {
  const { companyId, audit } = useSession()
  const [data, setData] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [form] = Form.useForm()

  const load = () => supplierAPI.list(companyId, search || undefined).then(setData)

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
    form.setFieldsValue({
      name: record.name,
      phone: record.phone,
      address: record.address
    })
    setOpen(true)
  }

  const handleSubmit = async (values: { name: string; phone?: string; address?: string }) => {
    setLoading(true)
    try {
      if (editing) {
        await supplierAPI.update(editing.id, companyId, audit(), values)
        message.success('Supplier updated')
      } else {
        await supplierAPI.create(companyId, audit(), values)
        message.success('Supplier created')
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
      await supplierAPI.remove(id, companyId, audit())
      message.success('Supplier deleted')
      load()
    } catch (err: any) {
      message.error(err.message || 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Vendors you purchase inventory from."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Supplier
          </Button>
        }
      />

      <Card bordered={false} className="shadow-sm mb-4" styles={{ body: { paddingBottom: 8 } }}>
        <Statistic title="Total Suppliers" value={data.length} />
      </Card>

      <Card bordered={false} className="shadow-sm">
        <div className="mb-4">
          <Input.Search placeholder="Search supplier…" allowClear onSearch={setSearch} style={{ width: 280 }} />
        </div>

        <Table
          rowKey="id"
          dataSource={data}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} suppliers` }}
          columns={[
            { title: 'Name', dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
            { title: 'Phone', dataIndex: 'phone', render: (v) => v || '—' },
            { title: 'Address', dataIndex: 'address', ellipsis: true, render: (v) => v || '—' },
            {
              title: 'Actions',
              width: 160,
              render: (_, record) => (
                <Space>
                  <Button type="link" size="small" onClick={() => openEdit(record)}>Edit</Button>
                  <Popconfirm title="Delete this supplier?" onConfirm={() => handleDelete(record.id)}>
                    <Button type="link" size="small" danger>Delete</Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Modal
        title={editing ? 'Edit Supplier' : 'Add Supplier'}
        open={open}
        onCancel={() => { setOpen(false); setEditing(null) }}
        footer={null}
        destroyOnClose
        width={440}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Supplier name" autoFocus />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input placeholder="Phone number" />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input.TextArea rows={2} placeholder="Address" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </Form>
      </Modal>
    </div>
  )
}

export default Suppliers

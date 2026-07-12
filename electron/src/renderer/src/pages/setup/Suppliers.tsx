import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Statistic, Table, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { supplierAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import {
  SUPPLIER_DISCOUNT_TYPE_OPTIONS,
  formatSupplierDiscount,
  type SupplierDiscountType
} from '@/renderer/utils/supplierDiscount'
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
  const discountType = Form.useWatch('discountType', form) as SupplierDiscountType | undefined

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
      address: record.address,
      discount: Number(record.discount || 0),
      discountType: record.discountType === 'percent' ? 'percent' : 'pkr'
    })
    setOpen(true)
  }

  const handleSubmit = async (values: {
    name: string
    phone?: string
    address?: string
    discount?: number
    discountType?: SupplierDiscountType
  }) => {
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
            {
              title: 'Discount',
              align: 'right' as const,
              render: (_, record) =>
                formatSupplierDiscount(
                  Number(record.discount || 0),
                  record.discountType === 'percent' ? 'percent' : 'pkr'
                )
            },
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
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ discount: 0, discountType: 'pkr' }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Supplier name" autoFocus />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input placeholder="Phone number" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="discountType" label="Discount Type">
              <Select options={[...SUPPLIER_DISCOUNT_TYPE_OPTIONS]} />
            </Form.Item>
            <Form.Item
              name="discount"
              label={discountType === 'percent' ? 'Discount %' : 'Discount (PKR)'}
              rules={[
                { type: 'number', min: 0, message: 'Discount cannot be negative' },
                ...(discountType === 'percent'
                  ? [{ type: 'number' as const, max: 100, message: 'Discount must be between 0 and 100' }]
                  : [])
              ]}
            >
              <InputNumber
                className="w-full"
                min={0}
                max={discountType === 'percent' ? 100 : undefined}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </div>
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

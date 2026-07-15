import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
  message
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { categoryAPI, partAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { PageHeader } from '../shared/page-ui'

const { Text } = Typography

export const Parts = () => {
  const { companyId, audit } = useSession()
  const [data, setData] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string>()
  const [form] = Form.useForm()

  const load = () => partAPI.list(companyId, search || undefined, categoryId).then(setData)
  const loadCategories = () => categoryAPI.list(companyId).then(setCategories)

  useEffect(() => {
    if (!companyId) return
    load()
    loadCategories()
  }, [companyId, search, categoryId])

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  )

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }

  const openEdit = (record: any) => {
    setEditing(record)
    form.setFieldsValue({
      name: record.name,
      categoryId: record.categoryId,
      description: record.description
    })
    setOpen(true)
  }

  const handleSubmit = async (values: any) => {
    setLoading(true)
    try {
      const payload = {
        name: values.name,
        categoryId: values.categoryId,
        description: values.description || ''
      }
      if (editing) {
        await partAPI.update(editing.id, companyId, audit(), payload)
        message.success('Part updated')
      } else {
        await partAPI.create(companyId, audit(), payload)
        message.success('Part created')
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
      await partAPI.remove(id, companyId, audit())
      message.success('Part deleted')
      load()
    } catch (err: any) {
      message.error(err.message || 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Parts"
        subtitle="Spare-part templates linked to a category — used when purchasing units into stock."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Part
          </Button>
        }
      />

      <Card bordered={false} className="shadow-sm mb-4" styles={{ body: { paddingBottom: 8 } }}>
        <Statistic title="Total Parts" value={data.length} />
      </Card>

      <Card bordered={false} className="shadow-sm">
        <div className="mb-4 flex flex-wrap gap-3">
          <Input.Search placeholder="Search part…" allowClear onSearch={setSearch} style={{ width: 280 }} />
          <Select
            allowClear
            placeholder="Category"
            style={{ width: 200 }}
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
          />
        </div>

        <Table
          rowKey="id"
          dataSource={data}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} parts` }}
          columns={[
            { title: 'Name', dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
            {
              title: 'Category',
              dataIndex: 'category',
              render: (cat, row) => cat?.name || categories.find((c) => c.id === row.categoryId)?.name || '—'
            },
            {
              title: 'Actions',
              width: 160,
              render: (_, record) => (
                <Space>
                  <Button type="link" size="small" onClick={() => openEdit(record)}>
                    Edit
                  </Button>
                  <Popconfirm title="Delete this part?" onConfirm={() => handleDelete(record.id)}>
                    <Button type="link" size="small" danger>
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
        title={editing ? 'Edit Part' : 'Add Part'}
        open={open}
        onCancel={() => {
          setOpen(false)
          setEditing(null)
        }}
        footer={null}
        destroyOnClose
        width={480}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Part name" autoFocus />
          </Form.Item>
          <Form.Item name="categoryId" label="Category" rules={[{ required: true, message: 'Select a category' }]}>
            <Select
              placeholder="Select category"
              options={categoryOptions}
              notFoundContent="No categories — add one under Setup first"
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </Form>
      </Modal>
    </div>
  )
}

export default Parts

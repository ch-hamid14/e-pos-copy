import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Statistic, Table, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { expenseAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { PageHeader } from '../shared/page-ui'

const { Text } = Typography

export const ExpenseCategories = () => {
  const { companyId, audit } = useSession()
  const [data, setData] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [form] = Form.useForm()

  const load = () => expenseAPI.categories(companyId).then(setData)

  useEffect(() => {
    if (companyId) load()
  }, [companyId])

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.trim().toLowerCase()
    return data.filter((c) => String(c.name || '').toLowerCase().includes(q))
  }, [data, search])

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
      const name = values.name.trim()
      if (editing) {
        await expenseAPI.updateCategory(editing.id, companyId, name)
        message.success('Category updated')
      } else {
        await expenseAPI.createCategory(companyId, audit(), name)
        message.success('Category added')
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
      await expenseAPI.removeCategory(id, companyId, audit())
      message.success('Category deleted')
      load()
    } catch (err: any) {
      message.error(err.message || 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Expense Categories"
        subtitle="Categories used when recording branch expenses."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Category
          </Button>
        }
      />

      <Card bordered={false} className="shadow-sm mb-4" styles={{ body: { paddingBottom: 8 } }}>
        <Statistic title="Total Categories" value={data.length} />
      </Card>

      <Card bordered={false} className="shadow-sm">
        <div className="mb-4">
          <Input.Search
            placeholder="Search category…"
            allowClear
            onSearch={setSearch}
            style={{ width: 280 }}
          />
        </div>

        <Table
          rowKey="id"
          dataSource={filtered}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} categories` }}
          columns={[
            { title: 'Name', dataIndex: 'name', render: (v) => <Text strong>{v}</Text> },
            {
              title: 'Actions',
              width: 160,
              render: (_, record) => (
                <Space>
                  <Button type="link" size="small" onClick={() => openEdit(record)}>Edit</Button>
                  <Popconfirm title="Delete this category?" onConfirm={() => handleDelete(record.id)}>
                    <Button type="link" size="small" danger>Delete</Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Modal
        title={editing ? 'Edit Category' : 'Add Category'}
        open={open}
        onCancel={() => { setOpen(false); setEditing(null) }}
        footer={null}
        destroyOnClose
        width={400}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Category name" autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </Form>
      </Modal>
    </div>
  )
}

export default ExpenseCategories

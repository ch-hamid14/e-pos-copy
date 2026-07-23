import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
  message
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { categoryAPI, productAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { ProductFormModal } from '@/renderer/components/forms/ProductFormModal'
import { PageHeader } from '../shared/page-ui'

const { Text } = Typography

export const Products = () => {
  const { companyId, audit } = useSession()
  const [data, setData] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string>()

  const load = () =>
    productAPI.list(companyId, search || undefined, categoryId).then(setData)
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
    setOpen(true)
  }

  const openEdit = (record: any) => {
    setEditing(record)
    setOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await productAPI.remove(id, companyId, audit())
      message.success('Product deleted')
      load()
    } catch (err: any) {
      message.error(err.message || 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Product templates linked to a category — used when purchasing stock."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Product
          </Button>
        }
      />

      <Card bordered={false} className="shadow-sm mb-4" styles={{ body: { paddingBottom: 8 } }}>
        <Statistic title="Total Products" value={data.length} />
      </Card>

      <Card bordered={false} className="shadow-sm">
        <div className="mb-4 flex flex-wrap gap-3">
          <Input.Search placeholder="Search product…" allowClear onSearch={setSearch} style={{ width: 280 }} />
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
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} products` }}
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
                  <Popconfirm title="Delete this product?" onConfirm={() => handleDelete(record.id)}>
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

      <ProductFormModal
        open={open}
        editing={editing}
        onCancel={() => {
          setOpen(false)
          setEditing(null)
        }}
        onSaved={() => {
          setOpen(false)
          setEditing(null)
          load()
        }}
      />
    </div>
  )
}

export default Products

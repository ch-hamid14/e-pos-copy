import { useEffect, useState } from 'react'
import { Button, Card, Input, Popconfirm, Space, Statistic, Table, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { supplierAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import {
  formatSupplierDiscount
} from '@/renderer/utils/supplierDiscount'
import { SupplierFormModal } from '@/renderer/components/forms/SupplierFormModal'
import { PageHeader } from '../shared/page-ui'

const { Text } = Typography

export const Suppliers = () => {
  const { companyId, audit } = useSession()
  const [data, setData] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [search, setSearch] = useState('')

  const load = () => supplierAPI.list(companyId, search || undefined).then(setData)

  useEffect(() => {
    if (companyId) load()
  }, [companyId, search])

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
                  <Button type="link" size="small" onClick={() => openEdit(record)}>
                    Edit
                  </Button>
                  <Popconfirm title="Delete this supplier?" onConfirm={() => handleDelete(record.id)}>
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

      <SupplierFormModal
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

export default Suppliers

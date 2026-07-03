import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
  message
} from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { customerAPI } from '@/renderer/services'
import { useSession } from '@/renderer/hooks/useSession'
import { formatRs, PageHeader } from '../shared/page-ui'

const { Text } = Typography

export const Customers = () => {
  const { companyId, audit } = useSession()
  const [data, setData] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [dueFilter, setDueFilter] = useState<'due' | 'not_due'>()
  const [balanceSort, setBalanceSort] = useState<'asc' | 'desc'>()
  const [form] = Form.useForm()

  const load = () =>
    customerAPI
      .list(
        companyId,
        search || undefined,
        balanceSort ? 'balance' : undefined,
        balanceSort,
        dueFilter
      )
      .then(setData)

  useEffect(() => {
    if (companyId) load()
  }, [companyId, search, dueFilter, balanceSort])

  const handleTableChange: TableProps<any>['onChange'] = (_pagination, _filters, sorter) => {
    const active = Array.isArray(sorter) ? sorter[0] : sorter
    if (active?.field === 'balance' && active.order) {
      setBalanceSort(active.order === 'ascend' ? 'asc' : 'desc')
    } else {
      setBalanceSort(undefined)
    }
  }

  const summary = useMemo(() => {
    const withDue = data.filter((c) => Number(c.balance ?? 0) > 0).length
    const totalDue = data.reduce((sum, c) => sum + Number(c.balance ?? 0), 0)
    return { total: data.length, withDue, totalDue }
  }, [data])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ openingBalance: 0 })
    setOpen(true)
  }

  const openEdit = (record: any) => {
    setEditing(record)
    form.setFieldsValue({
      name: record.name,
      phone: record.phone,
      cnic: record.cnic,
      address: record.address
    })
    setOpen(true)
  }

  const handleSubmit = async (values: any) => {
    setLoading(true)
    try {
      if (editing) {
        await customerAPI.update(editing.id, companyId, audit(), {
          name: values.name,
          phone: values.phone,
          cnic: values.cnic,
          address: values.address
        })
        message.success('Customer updated')
      } else {
        await customerAPI.create(companyId, audit(), {
          name: values.name,
          phone: values.phone,
          cnic: values.cnic,
          address: values.address,
          openingBalance: values.openingBalance ?? 0
        })
        message.success('Customer created')
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
      await customerAPI.remove(id, companyId, audit())
      message.success('Customer deleted')
      load()
    } catch (err: any) {
      message.error(err.message || 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Customer records with opening balance for amounts already owed to you."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Customer
          </Button>
        }
      />

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic title="Total Customers" value={summary.total} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="With Outstanding"
              value={summary.withDue}
              valueStyle={{ color: summary.withDue ? '#fa8c16' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-sm">
            <Statistic
              title="Total Outstanding"
              value={summary.totalDue}
              prefix="Rs"
              precision={0}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="shadow-sm">
        <div className="mb-4 flex flex-wrap gap-3">
          <Input.Search
            placeholder="Search name, phone or CNIC…"
            allowClear
            onSearch={setSearch}
            style={{ width: 280 }}
          />
          <Select
            allowClear
            placeholder="Outstanding"
            style={{ width: 160 }}
            options={[
              { value: 'due', label: 'Has due' },
              { value: 'not_due', label: 'No due' }
            ]}
            value={dueFilter}
            onChange={setDueFilter}
          />
        </div>

        <Table
          rowKey="id"
          dataSource={data}
          onChange={handleTableChange}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} customers` }}
          columns={[
            {
              title: 'Name',
              dataIndex: 'name',
              render: (v) => <Text strong>{v}</Text>
            },
            {
              title: 'Phone',
              dataIndex: 'phone',
              render: (v) => v || '—'
            },
            {
              title: 'CNIC',
              dataIndex: 'cnic',
              render: (v) => v || '—'
            },
            {
              title: 'Outstanding',
              dataIndex: 'balance',
              sorter: true,
              sortOrder:
                balanceSort === 'asc' ? 'ascend' : balanceSort === 'desc' ? 'descend' : null,
              align: 'right' as const,
              render: (v) => {
                const bal = Number(v ?? 0)
                return bal > 0 ? <Text type="danger" strong>{formatRs(v)}</Text> : formatRs(v)
              }
            },
            {
              title: 'Actions',
              width: 160,
              render: (_, record) => (
                <Space>
                  <Button type="link" size="small" onClick={() => openEdit(record)}>Edit</Button>
                  <Popconfirm title="Delete this customer?" onConfirm={() => handleDelete(record.id)}>
                    <Button type="link" size="small" danger>Delete</Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Modal
        title={editing ? 'Edit Customer' : 'Add Customer'}
        open={open}
        onCancel={() => { setOpen(false); setEditing(null) }}
        footer={null}
        destroyOnClose
        width={440}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="cnic" label="CNIC">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input.TextArea rows={2} />
          </Form.Item>
          {!editing && (
            <Form.Item
              name="openingBalance"
              label="Opening Balance"
              extra="Amount the customer already owes you (default 0)."
            >
              <InputNumber className="w-full" min={0} style={{ width: '100%' }} />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block loading={loading}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </Form>
      </Modal>
    </div>
  )
}

export default Customers

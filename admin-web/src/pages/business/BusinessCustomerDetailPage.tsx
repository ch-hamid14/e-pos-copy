import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import {
  getBusinessCustomer,
  setBusinessCustomerOutstanding,
  softDeleteBusinessCustomer,
  updateBusinessCustomer
} from '../../api/admin'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatRs } from './format'

type Ctx = { companyId: string; companyName: string }

export default function BusinessCustomerDetailPage() {
  const { token } = useAuth()
  const { companyId } = useOutletContext<Ctx>()
  const { id, customerId } = useParams<{ id: string; customerId: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getBusinessCustomer>> | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outstandingOpen, setOutstandingOpen] = useState(false)
  const [form] = Form.useForm()
  const [outstandingForm] = Form.useForm()

  const load = async () => {
    if (!token || !companyId || !customerId) return
    setLoading(true)
    try {
      const data = await getBusinessCustomer(token, companyId, customerId)
      setDetail(data)
      form.setFieldsValue({
        name: data.customer.name,
        phone: data.customer.phone || '',
        cnic: data.customer.cnic || '',
        address: data.customer.address || ''
      })
    } catch (err: any) {
      message.error(err.message)
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token, companyId, customerId])

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!detail?.customer) {
    return (
      <div>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          style={{ paddingLeft: 0 }}
          onClick={() => navigate(`/companies/${id}/business/customers`)}
        >
          Back to customers
        </Button>
        <Typography.Text type="secondary">Customer not found.</Typography.Text>
      </div>
    )
  }

  const customer = detail.customer as Record<string, any>
  const isDeleted = Boolean(customer.deletedAt)
  const balance = Number(customer.balance || 0)

  return (
    <div>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        style={{ paddingLeft: 0, marginBottom: 8 }}
        onClick={() => navigate(`/companies/${id}/business/customers`)}
      >
        Back to customers
      </Button>

      <div className="madix-page-header">
        <div>
          <h1>{customer.name}</h1>
          <p>
            {customer.phone || 'No phone'}
            {customer.cnic ? ` · ${customer.cnic}` : ''}
          </p>
        </div>
        <Space>
          <Button
            loading={busy}
            onClick={() => {
              outstandingForm.setFieldsValue({
                outstanding: balance,
                reason: ''
              })
              setOutstandingOpen(true)
            }}
          >
            Set outstanding
          </Button>
          {!isDeleted ? (
            <Button
              danger
              loading={busy}
              onClick={() => {
                Modal.confirm({
                  title: 'Soft-delete customer?',
                  content: 'Blocked if they still have an outstanding due balance.',
                  okType: 'danger',
                  onOk: async () => {
                    if (!token || !customerId) return
                    setBusy(true)
                    try {
                      await softDeleteBusinessCustomer(token, companyId, customerId)
                      message.success('Customer deleted')
                      navigate(`/companies/${id}/business/customers`)
                    } catch (err: any) {
                      message.error(err.message)
                    } finally {
                      setBusy(false)
                    }
                  }
                })
              }}
            >
              Soft delete
            </Button>
          ) : null}
        </Space>
      </div>

      {isDeleted ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="This customer is soft-deleted"
        />
      ) : null}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card bordered={false} className="madix-detail-card">
            <Statistic
              title="Balance"
              value={balance}
              prefix="Rs"
              precision={0}
              valueStyle={{
                color: balance > 0 ? '#c23b3b' : balance < 0 ? '#2563eb' : undefined
              }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="madix-detail-card">
            <Statistic title="Open due sales" value={detail.openDues.count} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card bordered={false} className="madix-detail-card">
            <Statistic title="Open due total" value={detail.openDues.total} prefix="Rs" precision={0} />
          </Card>
        </Col>
      </Row>

      <Card
        title="Edit details"
        bordered={false}
        className="madix-detail-card"
        style={{ marginBottom: 16 }}
      >
        <Form
          form={form}
          layout="vertical"
          disabled={isDeleted}
          onFinish={async (values) => {
            if (!token || !customerId) return
            setSaving(true)
            try {
              await updateBusinessCustomer(token, companyId, customerId, values)
              message.success('Customer updated')
              await load()
            } catch (err: any) {
              message.error(err.message)
            } finally {
              setSaving(false)
            }
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="cnic" label="CNIC">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="address" label="Address">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={saving} disabled={isDeleted}>
            Save changes
          </Button>
        </Form>
      </Card>

      <Card
        title="Recent sales"
        bordered={false}
        className="madix-detail-card"
        style={{ marginBottom: 16 }}
      >
        <Table
          rowKey="id"
          dataSource={detail.recentSales}
          pagination={false}
          locale={{ emptyText: 'No sales' }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'saleDate',
              render: formatDate
            },
            {
              title: 'Net',
              dataIndex: 'netTotal',
              align: 'right',
              render: formatRs
            },
            {
              title: 'Due',
              dataIndex: 'dueAmount',
              align: 'right',
              render: (v) =>
                Number(v) > 0 ? <Tag color="error">{formatRs(v)}</Tag> : formatRs(0)
            },
            {
              title: '',
              width: 80,
              render: (_, r: any) => (
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => navigate(`/companies/${id}/business/sales/${r.id}`)}
                >
                  Open
                </Button>
              )
            }
          ]}
        />
      </Card>

      <Card title="Ledger (latest 50)" bordered={false} className="madix-detail-card">
        <Table
          rowKey="id"
          dataSource={detail.ledger}
          pagination={false}
          locale={{ emptyText: 'No ledger entries' }}
          columns={[
            { title: 'When', dataIndex: 'createdAt', render: formatDate },
            { title: 'Type', dataIndex: 'type' },
            { title: 'Ref', dataIndex: 'referenceType', render: (v) => v || '—' },
            {
              title: 'Amount',
              dataIndex: 'amount',
              align: 'right',
              render: formatRs
            },
            {
              title: 'Running',
              dataIndex: 'runningBalance',
              align: 'right',
              render: formatRs
            }
          ]}
        />
      </Card>

      <Modal
        title="Set outstanding balance"
        open={outstandingOpen}
        onCancel={() => setOutstandingOpen(false)}
        okText="Update outstanding"
        confirmLoading={busy}
        onOk={async () => {
          if (!token || !customerId) return
          try {
            const values = await outstandingForm.validateFields()
            setBusy(true)
            const result = await setBusinessCustomerOutstanding(token, companyId, customerId, {
              outstanding: Number(values.outstanding),
              reason: String(values.reason || '').trim()
            })
            message.success(
              result.adjusted
                ? `Outstanding set to ${formatRs(result.outstanding)} (was ${formatRs(result.previous)})`
                : 'Outstanding already matched'
            )
            setOutstandingOpen(false)
            await load()
          } catch (err: any) {
            if (err?.errorFields) return
            message.error(err.message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Posts a ledger correction so customer balance matches the target. Does not change individual sale due amounts."
        />
        <Form form={outstandingForm} layout="vertical">
          <Form.Item label="Current">
            <Typography.Text>{formatRs(balance)}</Typography.Text>
          </Form.Item>
          <Form.Item
            name="outstanding"
            label="New outstanding (Rs)"
            rules={[{ required: true, message: 'Enter the target outstanding' }]}
            extra="Positive = customer owes. Negative = store credit. 0 = clear."
          >
            <InputNumber style={{ width: '100%' }} precision={0} step={1000} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Reason"
            rules={[{ required: true, message: 'Reason is required' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="e.g. Purged sale left stale local due; set to correct cloud balance"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

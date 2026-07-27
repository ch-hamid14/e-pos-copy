import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import dayjs from 'dayjs'
import {
  getBusinessSale,
  reconcileSaleFinances,
  repairBusinessSaleLedger,
  updateBusinessSalePayment,
  voidBusinessSale
} from '../../api/admin'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatRs } from './format'

type Ctx = { companyId: string; companyName: string }

export default function BusinessSaleDetailPage() {
  const { token } = useAuth()
  const { companyId } = useOutletContext<Ctx>()
  const { id, saleId } = useParams<{ id: string; saleId: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getBusinessSale>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [voidOpen, setVoidOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [editPayment, setEditPayment] = useState<any>(null)
  const [payForm] = Form.useForm()
  const [payBusy, setPayBusy] = useState(false)

  const load = async () => {
    if (!token || !companyId || !saleId) return
    setLoading(true)
    try {
      setDetail(await getBusinessSale(token, companyId, saleId))
    } catch (err: any) {
      message.error(err.message)
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [token, companyId, saleId])

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!detail?.sale) {
    return (
      <div>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          className="!px-0"
          onClick={() => navigate(`/companies/${id}/business/sales`)}
        >
          Back to sales
        </Button>
        <Typography.Text type="secondary">Sale not found.</Typography.Text>
      </div>
    )
  }

  const sale = detail.sale as Record<string, any>
  const impact = detail.impact
  const isVoided = Boolean(sale.deletedAt) || sale.status === 'cancelled'
  const payments = detail.payments || []
  const otherPaid = (excludeId: string) =>
    payments
      .filter((p: any) => p.id !== excludeId)
      .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)

  return (
    <div>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        style={{ paddingLeft: 0, marginBottom: 8 }}
        onClick={() => navigate(`/companies/${id}/business/sales`)}
      >
        Back to sales
      </Button>

      <div className="madix-page-header">
        <div>
          <h1>Sale #{sale.billNo ?? '—'}</h1>
          <p>
            {formatDate(sale.saleDate)}
            {sale.branchName ? ` · ${sale.branchName}` : ''}
            {sale.customer?.name ? ` · ${sale.customer.name}` : ''}
          </p>
        </div>
        <Space wrap>
          <Button
            loading={busy === 'reconcile'}
            disabled={isVoided}
            onClick={() => {
              Modal.confirm({
                title: 'Reconcile sale finances?',
                content:
                  'Rebuilds totals from lines, syncs paid/due from payments, and appends ledger corrections.',
                onOk: async () => {
                  if (!token || !saleId) return
                  setBusy('reconcile')
                  try {
                    const result = await reconcileSaleFinances(token, companyId, saleId)
                    message.success(
                      `Reconciled — net ${formatRs(result.netTotal)}, due ${formatRs(result.dueAmount)}`
                    )
                    await load()
                  } catch (err: any) {
                    message.error(err.message)
                  } finally {
                    setBusy(null)
                  }
                }
              })
            }}
          >
            Reconcile finances
          </Button>
          {isVoided ? (
            <Button
              loading={busy === 'repair'}
              onClick={() => {
                Modal.confirm({
                  title: 'Repair sale ledger?',
                  content:
                    'Clears leftover customer balance from this voided sale (fixes false negative outstanding).',
                  onOk: async () => {
                    if (!token || !saleId) return
                    setBusy('repair')
                    try {
                      const result = await repairBusinessSaleLedger(token, companyId, saleId)
                      message.success(result.message)
                      await load()
                    } catch (err: any) {
                      message.error(err.message)
                    } finally {
                      setBusy(null)
                    }
                  }
                })
              }}
            >
              Repair ledger
            </Button>
          ) : (
            <Button
              danger
              disabled={!impact.canVoid}
              onClick={() => {
                setReason('')
                setVoidOpen(true)
              }}
            >
              Void sale
            </Button>
          )}
        </Space>
      </div>

      {isVoided ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="This sale is voided / cancelled"
          description="If Outstanding looks wrong (e.g. negative), use Repair ledger to clear leftover customer credit from this sale."
        />
      ) : !impact.canVoid ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Void blocked"
          description={impact.blockers.join(' · ') || 'Cannot void this sale'}
        />
      ) : null}

      <Card bordered={false} className="madix-detail-card" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="Customer">{sale.customer?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Phone">{sale.customer?.phone || '—'}</Descriptions.Item>
          <Descriptions.Item label="Status">
            {isVoided ? (
              <Tag>Voided</Tag>
            ) : Number(sale.dueAmount) > 0 ? (
              <Tag color="error">Due {formatRs(sale.dueAmount)}</Tag>
            ) : (
              <Tag color="success">Paid in full</Tag>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          ['Subtotal', sale.subtotal],
          ['Tax', sale.totalTax],
          ['Tax u/s 236 G/H', sale.totalWht],
          ['Discount', sale.discount],
          ['Net', sale.netTotal],
          ['Paid', sale.paidAmount]
        ].map(([label, value]) => (
          <Col xs={12} sm={8} md={4} key={String(label)}>
            <Card bordered={false} className="madix-detail-card">
              <Statistic title={label as string} value={Number(value || 0)} prefix="Rs" precision={0} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="Line items" bordered={false} className="madix-detail-card" style={{ marginBottom: 16 }}>
        <Table
          rowKey="id"
          dataSource={detail.lines}
          pagination={false}
          size="middle"
          columns={[
            {
              title: 'Type',
              dataIndex: 'lineType',
              width: 90,
              render: (v: string) =>
                v === 'part' ? <Tag color="blue">Part</Tag> : <Tag>Product</Tag>
            },
            { title: 'Chassis', dataIndex: 'serialNumber', render: (v) => v || '—' },
            { title: 'Motor', dataIndex: 'motorNumber', render: (v) => v || '—' },
            { title: 'Name', dataIndex: 'productName' },
            {
              title: 'Qty',
              dataIndex: 'quantity',
              align: 'right',
              render: (v) => Number(v || 1)
            },
            {
              title: 'Unit',
              dataIndex: 'salePrice',
              align: 'right',
              render: formatRs
            },
            {
              title: 'Total',
              dataIndex: 'lineTotal',
              align: 'right',
              render: formatRs
            },
            {
              title: 'Stock',
              dataIndex: 'productItemStatus',
              render: (v) => v || '—'
            }
          ]}
        />
      </Card>

      <Card title="Payments" bordered={false} className="madix-detail-card" style={{ marginBottom: 16 }}>
        <Table
          rowKey="id"
          dataSource={payments}
          pagination={false}
          locale={{ emptyText: 'No payments' }}
          columns={[
            { title: 'Date', dataIndex: 'paymentDate', render: formatDate },
            { title: 'Method', dataIndex: 'method' },
            { title: 'Amount', dataIndex: 'amount', align: 'right', render: formatRs },
            ...(!isVoided
              ? [
                  {
                    title: '',
                    width: 80,
                    render: (_: unknown, record: any) => (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => {
                          setEditPayment(record)
                          payForm.setFieldsValue({
                            amount: Number(record.amount || 0),
                            method: record.method || 'cash',
                            paymentDate: record.paymentDate ? dayjs(record.paymentDate) : dayjs()
                          })
                        }}
                      >
                        Edit
                      </Button>
                    )
                  }
                ]
              : [])
          ]}
        />
      </Card>

      <Card title="Ledger trail" bordered={false} className="madix-detail-card" style={{ marginBottom: 16 }}>
        <Table
          rowKey="id"
          dataSource={detail.ledger}
          pagination={false}
          locale={{ emptyText: 'No ledger entries' }}
          columns={[
            { title: 'When', dataIndex: 'createdAt', render: formatDate },
            { title: 'Type', dataIndex: 'type' },
            { title: 'Ref', dataIndex: 'referenceType' },
            { title: 'Amount', dataIndex: 'amount', align: 'right', render: formatRs }
          ]}
        />
      </Card>

      <Card title="Notes" bordered={false} className="madix-detail-card">
        <Typography.Text type={sale.notes ? undefined : 'secondary'}>
          {sale.notes || '—'}
        </Typography.Text>
      </Card>

      <Modal
        title="Void sale"
        open={voidOpen}
        okText="Void sale"
        okButtonProps={{
          danger: true,
          disabled: reason.trim().length < 3,
          loading: busy === 'void'
        }}
        onCancel={() => setVoidOpen(false)}
        onOk={async () => {
          if (!token || !saleId) return
          setBusy('void')
          try {
            await voidBusinessSale(token, companyId, saleId, {
              reason: reason.trim()
            })
            message.success('Sale voided')
            setVoidOpen(false)
            await load()
          } catch (err: any) {
            message.error(err.message)
          } finally {
            setBusy(null)
          }
        }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Impact"
          description={
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              <li>Restock {impact.productUnits.length} product unit(s)</li>
              <li>Restore {impact.partLines.length} part line(s)</li>
              <li>Clear this sale from the customer ledger (undo debit + payments)</li>
              <li>{impact.note}</li>
            </ul>
          }
        />
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Hard purge is disabled"
          description="Void keeps sync-safe history. If POS devices are out of date, use Force remote POS cleanup on the company so they wipe and re-pull live data."
        />
        <Typography.Paragraph>
          Reason <Typography.Text type="secondary">(required)</Typography.Text>
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Duplicate entry / wrong customer / test sale"
        />
      </Modal>

      <Modal
        title="Edit payment"
        open={Boolean(editPayment)}
        okText="Save"
        confirmLoading={payBusy}
        onCancel={() => setEditPayment(null)}
        onOk={async () => {
          if (!token || !editPayment) return
          const values = await payForm.validateFields()
          const amount = Number(values.amount || 0)
          const max = Math.max(0, Number(sale.netTotal || 0) - otherPaid(editPayment.id))
          if (amount > max) {
            message.error(`Amount cannot exceed ${max}`)
            return
          }
          setPayBusy(true)
          try {
            const result = await updateBusinessSalePayment(token, companyId, editPayment.id, {
              amount,
              method: values.method,
              paymentDate: values.paymentDate.format('YYYY-MM-DD')
            })
            message.success(result.removed ? 'Payment removed' : 'Payment updated')
            setEditPayment(null)
            await load()
          } catch (err: any) {
            message.error(err.message)
          } finally {
            setPayBusy(false)
          }
        }}
      >
        <Form form={payForm} layout="vertical">
          <Form.Item
            name="amount"
            label="Amount"
            rules={[{ required: true }]}
            extra="Set 0 to remove this payment"
          >
            <InputNumber min={0} className="!w-full" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="method" label="Method" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'bank', label: 'Bank' },
                { value: 'card', label: 'Card' },
                { value: 'mixed', label: 'Mixed' }
              ]}
            />
          </Form.Item>
          <Form.Item name="paymentDate" label="Payment date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
